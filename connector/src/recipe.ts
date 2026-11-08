/** Pure recipe formatting/parsing. No I/O. Mirrors the conventions in the recipes repo README. */

export interface RecipeInput {
  title: string;
  serves: number;
  totalTime?: string;
  activeTime?: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  notes?: string;
}

export interface RecipeMeta {
  slug: string;
  path: string;
  title: string;
  serves?: number;
  activeTime?: string;
  totalTime?: string;
  tags: string[];
}

export const RECIPES_DIR = "recipes";

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

export function slugify(title: string): string {
  return oneLine(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function recipePath(slug: string): string {
  return `${RECIPES_DIR}/${slug}.md`;
}

function cleanIngredient(s: string): string {
  return oneLine(s.replace(/^\s*[-*•]\s*/, ""));
}

function cleanStep(s: string): string {
  return oneLine(s.replace(/^\s*\d+\s*[.)]\s*/, ""));
}

function cleanTag(s: string): string {
  return oneLine(s).toLowerCase().replace(/[[\],]/g, "");
}

/** Normalises input and throws on anything that would produce a broken file. */
export function normalizeRecipe(input: RecipeInput): RecipeInput {
  const title = oneLine(input.title);
  if (!title) throw new Error("A recipe needs a title.");
  if (!slugify(title)) throw new Error("The title needs at least one letter or number.");
  const totalTime = input.totalTime ? oneLine(input.totalTime) || undefined : undefined;
  const ingredients = input.ingredients.map(cleanIngredient).filter(Boolean);
  const steps = input.steps.map(cleanStep).filter(Boolean);
  if (ingredients.length === 0) throw new Error("A recipe needs at least one ingredient.");
  if (steps.length === 0) throw new Error("A recipe needs at least one step.");
  const activeTime = input.activeTime ? oneLine(input.activeTime) || undefined : undefined;
  const notes = input.notes?.trim() || undefined;
  const tags = [...new Set(input.tags.map(cleanTag).filter(Boolean))];
  return { title, serves: input.serves, totalTime, activeTime, tags, ingredients, steps, notes };
}

export function formatRecipe(raw: RecipeInput): string {
  const r = normalizeRecipe(raw);
  const front = [
    "---",
    `title: ${r.title}`,
    `serves: ${r.serves}`,
    ...(r.activeTime ? [`active_time: ${r.activeTime}`] : []),
    ...(r.totalTime ? [`total_time: ${r.totalTime}`] : []),
    `tags: [${r.tags.join(", ")}]`,
    "---",
  ].join("\n");
  const parts = [
    front,
    "## Ingredients\n\n" + r.ingredients.map((i) => `- ${i}`).join("\n"),
    "## Steps\n\n" + r.steps.map((s, n) => `${n + 1}. ${s}`).join("\n"),
  ];
  if (r.notes) parts.push("## Notes\n\n" + r.notes);
  return parts.join("\n\n") + "\n";
}

export function parseRecipe(path: string, markdown: string): RecipeMeta {
  const slug = path.replace(/^.*\//, "").replace(/\.md$/i, "");
  const meta: RecipeMeta = { slug, path, title: slug, tags: [] };
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!m || m[1] === undefined) return meta;
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key === "title" && value) meta.title = value;
    else if (key === "serves" && /^\d+$/.test(value)) meta.serves = Number(value);
    else if (key === "active_time") meta.activeTime = value;
    else if (key === "total_time") meta.totalTime = value;
    else if (key === "tags") {
      meta.tags = value.replace(/^\[|\]$/g, "").split(",").map(cleanTag).filter(Boolean);
    }
  }
  return meta;
}

/** One line for INDEX.md, matching the format in the repo: `path`: Title, total time, tags */
export function indexLine(meta: RecipeMeta): string {
  const bits = [meta.title, meta.totalTime, meta.tags.join(", ")].filter((b): b is string => !!b);
  return `- \`${meta.path}\`: ${bits.join(", ")}`;
}
