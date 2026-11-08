import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRecipe, indexLine, normalizeRecipe, parseRecipe, recipePath, slugify } from "../src/recipe.js";
import { sampleInput } from "./fake.js";

test("slugify makes lowercase dashed names", () => {
  assert.equal(slugify("Chicken Piccata"), "chicken-piccata");
  assert.equal(slugify("  Crème Brûlée!! "), "creme-brulee");
  assert.equal(slugify("Mac & Cheese (the good one)"), "mac-cheese-the-good-one");
  assert.equal(slugify("???"), "");
  assert.equal(recipePath("x"), "recipes/x.md");
});

test("slugify never ends with a dash after truncation", () => {
  const s = slugify("a".repeat(59) + " bbbb");
  assert.ok(s.length <= 60);
  assert.ok(!s.endsWith("-"));
});

test("formatRecipe writes the exact repo format", () => {
  assert.equal(
    formatRecipe(sampleInput),
    [
      "---",
      "title: Chicken Piccata",
      "serves: 4",
      "active_time: 25m",
      "total_time: 35m",
      "tags: [chicken, weeknight]",
      "---",
      "",
      "## Ingredients",
      "",
      "- 1 lb chicken breast",
      "- 3 tbsp butter",
      "",
      "## Steps",
      "",
      "1. Pound the chicken.",
      "2. Dredge in flour.",
      "",
    ].join("\n"),
  );
});

test("formatRecipe omits active_time when not given and adds notes", () => {
  const out = formatRecipe({ ...sampleInput, activeTime: undefined, notes: "Serve hot." });
  assert.ok(!out.includes("active_time"));
  assert.ok(out.endsWith("## Notes\n\nServe hot.\n"));
});

test("normalizeRecipe strips bullets and numbering and de-duplicates tags", () => {
  const r = normalizeRecipe({ ...sampleInput, tags: ["A", "a", "b,c", " "] });
  assert.deepEqual(r.ingredients, ["1 lb chicken breast", "3 tbsp butter"]);
  assert.deepEqual(r.steps, ["Pound the chicken.", "Dredge in flour."]);
  assert.deepEqual(r.tags, ["a", "bc"]);
});

test("normalizeRecipe keeps a frontmatter-breaking title on one line", () => {
  const r = normalizeRecipe({ ...sampleInput, title: "Line one\n---\ninjected: yes" });
  assert.ok(!r.title.includes("\n"));
});

test("normalizeRecipe rejects empty pieces", () => {
  assert.throws(() => normalizeRecipe({ ...sampleInput, title: "  " }), /title/i);
  assert.throws(() => normalizeRecipe({ ...sampleInput, title: "!!!" }), /letter or number/i);
  assert.throws(() => normalizeRecipe({ ...sampleInput, ingredients: ["- "] }), /ingredient/i);
  assert.throws(() => normalizeRecipe({ ...sampleInput, steps: ["1."] }), /step/i);
});

test("times are optional: a recipe without them has no time lines and no empty values", () => {
  for (const times of [{ totalTime: undefined, activeTime: undefined }, { totalTime: "", activeTime: "  " }]) {
    const text = formatRecipe({ ...sampleInput, ...times });
    assert.ok(text.startsWith("---\ntitle: Chicken Piccata\nserves: 4\ntags: [chicken, weeknight]\n---\n"), text);
    assert.ok(!text.includes("total_time") && !text.includes("active_time"));
    const meta = parseRecipe("recipes/chicken-piccata.md", text);
    assert.equal(meta.totalTime, undefined);
    assert.equal(indexLine(meta), "- `recipes/chicken-piccata.md`: Chicken Piccata, chicken, weeknight");
  }
});

test("a total time without an active time still works", () => {
  const text = formatRecipe({ ...sampleInput, activeTime: undefined });
  assert.ok(text.includes("total_time: 35m") && !text.includes("active_time"));
});

test("parseRecipe reads back what formatRecipe wrote", () => {
  const meta = parseRecipe("recipes/chicken-piccata.md", formatRecipe(sampleInput));
  assert.deepEqual(meta, {
    slug: "chicken-piccata",
    path: "recipes/chicken-piccata.md",
    title: "Chicken Piccata",
    serves: 4,
    activeTime: "25m",
    totalTime: "35m",
    tags: ["chicken", "weeknight"],
  });
});

test("parseRecipe falls back to the file name when there is no frontmatter", () => {
  const meta = parseRecipe("recipes/braised-chuck-roast.md", "# Braised Chuck Roast\n\nText");
  assert.equal(meta.title, "braised-chuck-roast");
  assert.deepEqual(meta.tags, []);
});

test("indexLine matches the existing INDEX.md format", () => {
  const meta = parseRecipe("recipes/example-recipe-delete-me.md", "---\ntitle: Example Recipe (delete me)\ntotal_time: 20m\ntags: [example]\n---\n");
  assert.equal(indexLine(meta), "- `recipes/example-recipe-delete-me.md`: Example Recipe (delete me), 20m, example");
});
