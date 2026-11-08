import { ConflictError, type RepoClient } from "./github.js";
import {
  RECIPES_DIR,
  formatRecipe,
  indexLine,
  normalizeRecipe,
  parseRecipe,
  recipePath,
  slugify,
  type RecipeInput,
  type RecipeMeta,
} from "./recipe.js";

const GUIDE_PATH = "CLAUDE.md";

interface Doc {
  meta: RecipeMeta;
  markdown: string;
}

export type GetResult =
  | { kind: "found"; meta: RecipeMeta; markdown: string }
  | { kind: "ambiguous"; matches: RecipeMeta[] }
  | { kind: "none" };

export type AddResult =
  | { kind: "added"; path: string; updated: boolean; indexUpdated: boolean }
  | { kind: "exists"; path: string };

export class RecipeService {
  private cache?: { at: number; docs: Doc[] };

  constructor(
    private readonly client: RepoClient,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async load(): Promise<Doc[]> {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.docs;
    const files = await this.client.readDir(RECIPES_DIR);
    const docs = files
      .filter((f) => f.path.toLowerCase().endsWith(".md"))
      .map((f) => ({ meta: parseRecipe(f.path, f.content), markdown: f.content }))
      .sort((a, b) => a.meta.title.localeCompare(b.meta.title));
    this.cache = { at: this.now(), docs };
    return docs;
  }

  async listRecipes(): Promise<RecipeMeta[]> {
    return (await this.load()).map((d) => d.meta);
  }

  async searchRecipes(query: string, limit = 8): Promise<RecipeMeta[]> {
    const docs = await this.load();
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (terms.length === 0) return docs.slice(0, limit).map((d) => d.meta);
    return docs
      .map((d) => {
        const title = d.meta.title.toLowerCase();
        const tags = d.meta.tags.join(" ");
        const body = d.markdown.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (title.includes(t)) score += 5;
          if (tags.includes(t)) score += 3;
          if (body.includes(t)) score += 1;
        }
        return { d, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.d.meta.title.localeCompare(b.d.meta.title))
      .slice(0, limit)
      .map((x) => x.d.meta);
  }

  async getRecipe(query: string): Promise<GetResult> {
    const docs = await this.load();
    const q = slugify(query.replace(/\.md$/i, ""));
    if (!q) return { kind: "none" };
    const exact = docs.find((d) => d.meta.slug === q) ?? docs.find((d) => slugify(d.meta.title) === q);
    if (exact) return { kind: "found", meta: exact.meta, markdown: exact.markdown };
    const words = q.split("-");
    const partial = docs.filter((d) => {
      const hay = `${d.meta.slug} ${slugify(d.meta.title)} ${d.meta.tags.join(" ")}`;
      return words.every((w) => hay.includes(w));
    });
    if (partial.length === 1 && partial[0]) {
      return { kind: "found", meta: partial[0].meta, markdown: partial[0].markdown };
    }
    if (partial.length > 1) return { kind: "ambiguous", matches: partial.slice(0, 8).map((d) => d.meta) };
    return { kind: "none" };
  }

  /** The repo's own rules for writing recipes (CLAUDE.md), read fresh each time, or null if the repo has none. */
  async getGuide(): Promise<string | null> {
    return (await this.client.getFile(GUIDE_PATH))?.content ?? null;
  }

  /** Throws on invalid input. Never overwrites an existing recipe unless `overwrite` is true. */
  async addRecipe(input: RecipeInput, overwrite = false): Promise<AddResult> {
    const recipe = normalizeRecipe(input);
    const path = recipePath(slugify(recipe.title));
    const existing = await this.client.getFile(path);
    if (existing && !overwrite) return { kind: "exists", path };
    const markdown = formatRecipe(recipe);
    await this.client.putFile({
      path,
      content: markdown,
      message: `${existing ? "Update" : "Add"} recipe: ${recipe.title}`,
      sha: existing?.sha,
    });
    this.cache = undefined;
    let indexUpdated = true;
    try {
      await this.updateIndex(parseRecipe(path, markdown));
    } catch {
      indexUpdated = false;
    }
    return { kind: "added", path, updated: !!existing, indexUpdated };
  }

  private async updateIndex(meta: RecipeMeta, attempts = 2): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      const idx = await this.client.getFile("INDEX.md");
      const line = indexLine(meta);
      let content: string;
      if (!idx) {
        content = `# Recipe index\n\n${line}\n`;
      } else {
        const lines = idx.content.replace(/\r\n/g, "\n").split("\n");
        const key = `- \`${meta.path}\``;
        const at = lines.findIndex((l) => l.startsWith(key));
        if (at >= 0) {
          lines[at] = line;
        } else {
          while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
          lines.push(line);
        }
        content = lines.join("\n") + "\n";
      }
      try {
        await this.client.putFile({ path: "INDEX.md", content, message: `Index: ${meta.title}`, sha: idx?.sha });
        return;
      } catch (e) {
        if (e instanceof ConflictError && i < attempts - 1) continue;
        throw e;
      }
    }
  }
}
