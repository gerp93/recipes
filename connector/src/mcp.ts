import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RecipeMeta } from "./recipe.js";
import type { RecipeService } from "./service.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  ...(isError ? { isError: true } : {}),
});

function summary(m: RecipeMeta): string {
  const bits = [
    m.title,
    m.serves ? `serves ${m.serves}` : "",
    m.totalTime ? `total ${m.totalTime}` : "",
    m.tags.length ? `tags: ${m.tags.join(", ")}` : "",
  ].filter(Boolean);
  return `${bits.join(" | ")} [${m.slug}]`;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function buildServer(service: RecipeService): McpServer {
  const server = new McpServer({ name: "recipes", version: "0.1.0" });

  server.registerTool(
    "list_recipes",
    {
      title: "List recipes",
      description:
        "List every saved recipe with serves, total time and tags. Use when the user asks what recipes they have.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const all = await service.listRecipes();
        return reply(all.length ? all.map(summary).join("\n") : "There are no recipes yet.");
      } catch (e) {
        return reply(`Could not list recipes: ${message(e)}`, true);
      }
    },
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Search recipes",
      description:
        "Find recipes by words in the title, tags, ingredients or steps. Returns the best matches, not the full text; call get_recipe for that.",
      inputSchema: { query: z.string().min(1).max(200) },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        const found = await service.searchRecipes(query);
        return reply(found.length ? found.map(summary).join("\n") : `No recipes match "${query}".`);
      } catch (e) {
        return reply(`Search failed: ${message(e)}`, true);
      }
    },
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Get a recipe",
      description:
        "Get the full text of one recipe by its name or file name (for example 'chicken piccata'). Returns the whole recipe as plain text.",
      inputSchema: { name: z.string().min(1).max(200) },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      try {
        const r = await service.getRecipe(name);
        if (r.kind === "found") return reply(r.markdown);
        if (r.kind === "ambiguous") {
          return reply(`More than one recipe matches "${name}". Ask which one:\n${r.matches.map(summary).join("\n")}`);
        }
        return reply(`No recipe matches "${name}".`);
      } catch (e) {
        return reply(`Could not get the recipe: ${message(e)}`, true);
      }
    },
  );

  server.registerTool(
    "get_recipe_rules",
    {
      title: "Get the recipe-writing rules",
      description:
        "Get the repo's rules for writing and saving recipes (its CLAUDE.md), as plain text. Call this once before saving any recipe, and follow it.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const guide = await service.getGuide();
        return reply(guide ?? "The repo has no CLAUDE.md. Follow the add_recipe tool's description instead.");
      } catch (e) {
        return reply(`Could not read the rules: ${message(e)}`, true);
      }
    },
  );

  server.registerTool(
    "add_recipe",
    {
      title: "Save a recipe",
      description:
        "Save one new recipe to the recipes repo. Call get_recipe_rules first and follow it. The server writes the file in the correct format and updates the index, so just pass the pieces. " +
        "Before calling: read the title and serves (and the total time only if the user gave one) back to the user and wait for a yes, then set confirmed to true. " +
        "Times are optional: never ask for them and never make one up; leave total_time and active_time out unless the user said them. " +
        "One dish per call; a meal with several dishes is several calls. " +
        "Ingredients: one per entry, amount first, like '1 lb chicken breast'. Steps: one action per entry, no numbering. " +
        "Will not overwrite an existing recipe unless overwrite is true, which you should only set if the user asked to replace it.",
      inputSchema: {
        confirmed: z
          .boolean()
          .describe("True only after reading the title and serves back to the user and hearing a yes."),
        title: z.string().min(1).max(120),
        serves: z.number().int().min(1).max(100),
        total_time: z.string().max(40).optional().describe("For example 35m or 1h 30m. Leave out if the user did not give one."),
        active_time: z.string().max(40).optional().describe("For example 25m. Leave out if the user did not give one."),
        tags: z.array(z.string().max(40)).max(12).default([]),
        ingredients: z.array(z.string().min(1).max(200)).min(1).max(80),
        steps: z.array(z.string().min(1).max(600)).min(1).max(60),
        notes: z.string().max(2000).optional(),
        overwrite: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      if (!args.confirmed) {
        return reply(
          `Not saved. Read back "${args.title}", serves ${args.serves}${args.total_time ? `, total ${args.total_time}` : ""} to the user, and call again with confirmed true once they say yes.`,
          true,
        );
      }
      try {
        const r = await service.addRecipe(
          {
            title: args.title,
            serves: args.serves,
            totalTime: args.total_time,
            activeTime: args.active_time,
            tags: args.tags,
            ingredients: args.ingredients,
            steps: args.steps,
            notes: args.notes,
          },
          args.overwrite,
        );
        if (r.kind === "exists") {
          return reply(`Not saved: ${r.path} already exists. Ask the user whether to replace it, then call again with overwrite true.`, true);
        }
        return reply(
          `${r.updated ? "Updated" : "Saved"} ${r.path}.` +
            (r.indexUpdated ? "" : " The recipe was saved but INDEX.md could not be updated; tell the user."),
        );
      } catch (e) {
        return reply(`Not saved: ${message(e)}`, true);
      }
    },
  );

  return server;
}
