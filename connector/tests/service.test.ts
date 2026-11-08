import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRecipe } from "../src/recipe.js";
import { RecipeService } from "../src/service.js";
import { FakeRepo, sampleInput } from "./fake.js";

const EXAMPLE_INDEX = "# Recipe index\n\nOne line per recipe.\n\n- `recipes/example-recipe-delete-me.md`: Example Recipe (delete me), 20m, example\n";

function repoWithRecipes(): FakeRepo {
  const repo = new FakeRepo();
  repo.seed("INDEX.md", EXAMPLE_INDEX);
  repo.seed("recipes/chicken-piccata.md", formatRecipe(sampleInput));
  repo.seed(
    "recipes/chuck-roast-gravy.md",
    formatRecipe({ ...sampleInput, title: "Chuck Roast Gravy", tags: ["meal-chuck-roast", "gravy"], ingredients: ["2 tbsp flour"], steps: ["Whisk."] }),
  );
  repo.seed(
    "recipes/chuck-roast.md",
    formatRecipe({ ...sampleInput, title: "Chuck Roast", tags: ["meal-chuck-roast", "beef"], ingredients: ["2 lb chuck roast"], steps: ["Braise."] }),
  );
  return repo;
}

test("addRecipe writes the recipe and appends one index line, keeping the old ones", async () => {
  const repo = new FakeRepo();
  repo.seed("INDEX.md", EXAMPLE_INDEX);
  const r = await new RecipeService(repo).addRecipe(sampleInput);
  assert.deepEqual(r, { kind: "added", path: "recipes/chicken-piccata.md", updated: false, indexUpdated: true });
  assert.equal(repo.files.get("recipes/chicken-piccata.md")?.content, formatRecipe(sampleInput));
  const index = repo.files.get("INDEX.md")?.content ?? "";
  assert.ok(index.includes("example-recipe-delete-me"));
  assert.ok(index.endsWith("- `recipes/chicken-piccata.md`: Chicken Piccata, 35m, chicken, weeknight\n"));
  assert.deepEqual(repo.puts.map((p) => p.message), ["Add recipe: Chicken Piccata", "Index: Chicken Piccata"]);
});

test("addRecipe creates INDEX.md when it does not exist", async () => {
  const repo = new FakeRepo();
  await new RecipeService(repo).addRecipe(sampleInput);
  assert.equal(
    repo.files.get("INDEX.md")?.content,
    "# Recipe index\n\n- `recipes/chicken-piccata.md`: Chicken Piccata, 35m, chicken, weeknight\n",
  );
});

test("addRecipe refuses to overwrite and changes nothing", async () => {
  const repo = repoWithRecipes();
  const before = repo.puts.length;
  const r = await new RecipeService(repo).addRecipe({ ...sampleInput, ingredients: ["1 different thing"] });
  assert.deepEqual(r, { kind: "exists", path: "recipes/chicken-piccata.md" });
  assert.equal(repo.puts.length, before);
  assert.ok(repo.files.get("recipes/chicken-piccata.md")?.content.includes("chicken breast"));
});

test("addRecipe overwrites only when asked, and replaces its own index line", async () => {
  const repo = repoWithRecipes();
  repo.seed("INDEX.md", EXAMPLE_INDEX + "- `recipes/chicken-piccata.md`: Chicken Piccata, 99m, old\n");
  const r = await new RecipeService(repo).addRecipe({ ...sampleInput, ingredients: ["1 different thing"] }, true);
  assert.equal(r.kind, "added");
  assert.ok(r.kind === "added" && r.updated);
  assert.ok(repo.files.get("recipes/chicken-piccata.md")?.content.includes("1 different thing"));
  const index = repo.files.get("INDEX.md")?.content ?? "";
  assert.equal(index.split("chicken-piccata").length - 1, 1);
  assert.ok(index.includes("35m, chicken, weeknight"));
  assert.ok(!index.includes("99m"));
});

test("addRecipe retries the index once after a conflict", async () => {
  const repo = new FakeRepo();
  repo.seed("INDEX.md", EXAMPLE_INDEX);
  repo.conflictOnceFor = "INDEX.md";
  const r = await new RecipeService(repo).addRecipe(sampleInput);
  assert.ok(r.kind === "added" && r.indexUpdated);
});

test("addRecipe still saves the recipe if the index keeps failing, and says so", async () => {
  const repo = new FakeRepo();
  repo.seed("INDEX.md", EXAMPLE_INDEX);
  repo.alwaysConflictFor.add("INDEX.md");
  const r = await new RecipeService(repo).addRecipe(sampleInput);
  assert.ok(r.kind === "added" && !r.indexUpdated);
  assert.ok(repo.files.has("recipes/chicken-piccata.md"));
});

test("addRecipe validates before writing anything", async () => {
  const repo = new FakeRepo();
  await assert.rejects(new RecipeService(repo).addRecipe({ ...sampleInput, steps: [] }), /step/i);
  assert.equal(repo.puts.length, 0);
});

test("listRecipes returns every recipe sorted by title", async () => {
  const list = await new RecipeService(repoWithRecipes()).listRecipes();
  assert.deepEqual(list.map((m) => m.title), ["Chicken Piccata", "Chuck Roast", "Chuck Roast Gravy"]);
});

test("a new recipe shows up right away even with the cache on", async () => {
  const repo = repoWithRecipes();
  const service = new RecipeService(repo, 60_000);
  assert.equal((await service.listRecipes()).length, 3);
  await service.addRecipe({ ...sampleInput, title: "Lemon Bars" });
  assert.equal((await service.listRecipes()).length, 4);
});

test("searchRecipes ranks title matches above body matches", async () => {
  const found = await new RecipeService(repoWithRecipes()).searchRecipes("gravy");
  assert.equal(found[0]?.title, "Chuck Roast Gravy");
  const byTag = await new RecipeService(repoWithRecipes()).searchRecipes("meal-chuck-roast");
  assert.deepEqual(byTag.map((m) => m.title).sort(), ["Chuck Roast", "Chuck Roast Gravy"]);
  assert.deepEqual(await new RecipeService(repoWithRecipes()).searchRecipes("zzzz"), []);
});

test("getRecipe finds by slug, file name, title, and unique partial name", async () => {
  const s = new RecipeService(repoWithRecipes());
  for (const q of ["chicken-piccata", "chicken-piccata.md", "Chicken Piccata", "piccata"]) {
    const r = await s.getRecipe(q);
    assert.ok(r.kind === "found" && r.meta.slug === "chicken-piccata", q);
  }
});

test("getRecipe prefers an exact match over longer names that contain it", async () => {
  const r = await new RecipeService(repoWithRecipes()).getRecipe("chuck roast");
  assert.ok(r.kind === "found" && r.meta.slug === "chuck-roast");
});

test("getRecipe reports ambiguous and missing names", async () => {
  const s = new RecipeService(repoWithRecipes());
  const amb = await s.getRecipe("chuck");
  assert.ok(amb.kind === "ambiguous" && amb.matches.length === 2);
  assert.deepEqual(await s.getRecipe("tacos"), { kind: "none" });
  assert.deepEqual(await s.getRecipe("???"), { kind: "none" });
});
