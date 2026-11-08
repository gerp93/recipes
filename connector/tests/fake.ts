import { ConflictError, type DirFile, type RepoClient, type RepoFile } from "../src/github.js";

/** In-memory stand-in for the GitHub repo. */
export class FakeRepo implements RepoClient {
  files = new Map<string, { content: string; sha: string }>();
  puts: Array<{ path: string; message: string }> = [];
  /** Throw a conflict on the next write to this path, once. */
  conflictOnceFor?: string;
  /** Throw a conflict on every write to these paths. */
  alwaysConflictFor = new Set<string>();
  private counter = 0;

  seed(path: string, content: string): void {
    this.files.set(path, { content, sha: `seed${++this.counter}` });
  }

  async readDir(dir: string): Promise<DirFile[]> {
    const prefix = `${dir}/`;
    return [...this.files]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map(([path, f]) => ({ path, content: f.content }));
  }

  async getFile(path: string): Promise<RepoFile | null> {
    const f = this.files.get(path);
    return f ? { path, content: f.content, sha: f.sha } : null;
  }

  async putFile({ path, content, message, sha }: { path: string; content: string; message: string; sha?: string }): Promise<void> {
    if (this.alwaysConflictFor.has(path)) throw new ConflictError(`always conflict ${path}`);
    if (this.conflictOnceFor === path) {
      this.conflictOnceFor = undefined;
      throw new ConflictError(`conflict once ${path}`);
    }
    const current = this.files.get(path);
    if (current && sha !== current.sha) throw new ConflictError(`stale sha for ${path}`);
    this.files.set(path, { content, sha: `sha${++this.counter}` });
    this.puts.push({ path, message });
  }
}

export const sampleInput = {
  title: "Chicken Piccata",
  serves: 4,
  totalTime: "35m",
  activeTime: "25m",
  tags: ["Chicken", "weeknight"],
  ingredients: ["- 1 lb chicken breast", "3 tbsp butter"],
  steps: ["1. Pound the chicken.", "Dredge in flour."],
};
