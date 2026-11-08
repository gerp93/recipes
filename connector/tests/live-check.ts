/**
 * Read-only check of the real code against the real repo. Writes nothing.
 * Usage: GITHUB_TOKEN=... npx tsx tests/live-check.ts [recipe name]
 */
import { GitHubClient } from "../src/github.js";
import { RecipeService } from "../src/service.js";

const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("Set GITHUB_TOKEN first.");

const service = new RecipeService(
  new GitHubClient(token, process.env.RECIPES_REPO ?? "gerp93/recipes", process.env.RECIPES_BRANCH ?? "main"),
);

const all = await service.listRecipes();
console.log(`${all.length} recipe(s):`);
for (const m of all) {
  console.log(`- ${m.title} [${m.slug}] serves=${m.serves ?? "?"} total=${m.totalTime ?? "?"} tags=${m.tags.join(",")}`);
}

const r = await service.getRecipe(process.argv[2] ?? "roast");
if (r.kind === "found") {
  console.log(`\nget_recipe -> ${r.meta.slug}, ${r.markdown.length} chars\n${r.markdown.slice(0, 160)}`);
} else {
  console.log(`\nget_recipe -> ${r.kind}`);
}
