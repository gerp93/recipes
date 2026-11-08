import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/mcp.js";
import { formatRecipe } from "../src/recipe.js";
import { RecipeService } from "../src/service.js";
import { FakeRepo, sampleInput } from "./fake.js";

async function connect(repo: FakeRepo): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildServer(new RecipeService(repo, 0)).connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

type Content = Array<{ type: string; text?: string }>;
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: Content; isError?: boolean };
  return { content: r.content, text: r.content.map((c) => c.text ?? "").join("\n"), isError: r.isError === true };
};

const args = {
  confirmed: true,
  title: "Chicken Piccata",
  serves: 4,
  total_time: "35m",
  active_time: "25m",
  tags: ["chicken"],
  ingredients: ["1 lb chicken breast"],
  steps: ["Pound the chicken."],
};

function seeded(): FakeRepo {
  const repo = new FakeRepo();
  repo.seed("recipes/chicken-piccata.md", formatRecipe(sampleInput));
  return repo;
}

test("the server offers the four tools", async () => {
  const client = await connect(new FakeRepo());
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["add_recipe", "get_recipe", "get_recipe_rules", "list_recipes", "search_recipes"]);
});

test("get_recipe_rules returns the repo's CLAUDE.md as plain text, read fresh each time", async () => {
  const repo = new FakeRepo();
  repo.seed("CLAUDE.md", "# Rules\nOne dish per file.");
  const client = await connect(repo);
  const first = await call(client, "get_recipe_rules");
  assert.equal(first.isError, false);
  assert.equal(first.content.length, 1);
  assert.equal(first.content[0]?.type, "text");
  assert.equal(first.text, "# Rules\nOne dish per file.");
  repo.seed("CLAUDE.md", "# Rules\nChanged.");
  assert.equal((await call(client, "get_recipe_rules")).text, "# Rules\nChanged.");
});

test("get_recipe_rules says so when the repo has no CLAUDE.md, and add_recipe points to it", async () => {
  const client = await connect(new FakeRepo());
  const r = await call(client, "get_recipe_rules");
  assert.equal(r.isError, false);
  assert.ok(r.text.includes("no CLAUDE.md"));
  const add = (await client.listTools()).tools.find((t) => t.name === "add_recipe");
  assert.ok(add?.description?.includes("get_recipe_rules"));
});

test("get_recipe returns the whole recipe as plain text, not an embedded resource", async () => {
  const client = await connect(seeded());
  const r = await call(client, "get_recipe", { name: "chicken piccata" });
  assert.equal(r.isError, false);
  assert.equal(r.content.length, 1);
  assert.equal(r.content[0]?.type, "text");
  assert.ok(r.text.includes("## Ingredients"));
  assert.ok(r.text.includes("1. Pound the chicken."));
});

test("list and search return readable one-line summaries", async () => {
  const client = await connect(seeded());
  assert.ok((await call(client, "list_recipes")).text.includes("Chicken Piccata | serves 4 | total 35m"));
  assert.ok((await call(client, "search_recipes", { query: "chicken" })).text.includes("chicken-piccata"));
  assert.ok((await call(client, "search_recipes", { query: "tacos" })).text.includes("No recipes match"));
});

test("get_recipe says so when nothing matches", async () => {
  const client = await connect(seeded());
  assert.ok((await call(client, "get_recipe", { name: "tacos" })).text.includes("No recipe matches"));
});

test("add_recipe will not write until the user has confirmed", async () => {
  const repo = new FakeRepo();
  const client = await connect(repo);
  const r = await call(client, "add_recipe", { ...args, confirmed: false });
  assert.ok(r.isError);
  assert.ok(r.text.includes("Not saved"));
  assert.equal(repo.puts.length, 0);
});

test("add_recipe saves a confirmed recipe in the repo format and updates the index", async () => {
  const repo = new FakeRepo();
  const client = await connect(repo);
  const r = await call(client, "add_recipe", args);
  assert.equal(r.isError, false);
  assert.ok(r.text.includes("Saved recipes/chicken-piccata.md"));
  assert.ok(repo.files.get("recipes/chicken-piccata.md")?.content.startsWith("---\ntitle: Chicken Piccata\nserves: 4\n"));
  assert.ok(repo.files.get("INDEX.md")?.content.includes("chicken-piccata.md"));
});

test("add_recipe saves a recipe with no times at all", async () => {
  const repo = new FakeRepo();
  const client = await connect(repo);
  const { total_time: _t, active_time: _a, ...noTimes } = args;
  const r = await call(client, "add_recipe", noTimes);
  assert.equal(r.isError, false, r.text);
  const saved = repo.files.get("recipes/chicken-piccata.md")?.content ?? "";
  assert.ok(saved.startsWith("---\ntitle: Chicken Piccata\nserves: 4\ntags: [chicken]\n---\n"));
  assert.ok(!saved.includes("total_time"));
  const refused = await call(client, "add_recipe", { ...noTimes, title: "Soup", confirmed: false });
  assert.ok(refused.text.includes('Read back "Soup", serves 4 to the user'));
});

test("add_recipe refuses to replace an existing recipe unless told to", async () => {
  const repo = seeded();
  const client = await connect(repo);
  const refused = await call(client, "add_recipe", args);
  assert.ok(refused.isError && refused.text.includes("already exists"));
  const replaced = await call(client, "add_recipe", { ...args, overwrite: true });
  assert.ok(!replaced.isError && replaced.text.includes("Updated recipes/chicken-piccata.md"));
});

test("add_recipe rejects bad input through the schema", async () => {
  const client = await connect(new FakeRepo());
  const r = await call(client, "add_recipe", { ...args, serves: 0 });
  assert.ok(r.isError);
});
