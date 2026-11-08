/**
 * Minimal GitHub client, behind an interface so tests can use a fake.
 * Uses fetch, btoa and atob only, so it runs on Cloudflare Workers and Node alike.
 */

export interface RepoFile {
  path: string;
  content: string;
  sha: string;
}

export interface DirFile {
  path: string;
  content: string;
}

export class ConflictError extends Error {}

export interface RepoClient {
  /** Every file directly inside `dir`, with its text, in one request. Empty if the directory does not exist. */
  readDir(dir: string): Promise<DirFile[]>;
  /** One file with its sha, or null if it does not exist. */
  getFile(path: string): Promise<RepoFile | null>;
  /** Create or update. Pass `sha` to update an existing file. Throws ConflictError on a stale or missing sha. */
  putFile(args: { path: string; content: string; message: string; sha?: string }): Promise<void>;
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

const DIR_QUERY = `query($owner:String!,$name:String!,$expr:String!){
  repository(owner:$owner,name:$name){
    object(expression:$expr){
      ... on Tree { entries { name type object { ... on Blob { text } } } }
    }
  }
}`;

export class GitHubClient implements RepoClient {
  private readonly owner: string;
  private readonly name: string;

  constructor(
    private readonly token: string,
    repo: string,
    private readonly branch: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    const [owner, name] = repo.split("/");
    if (!owner || !name) throw new Error(`Repo must look like owner/name, got "${repo}"`);
    this.owner = owner;
    this.name = name;
  }

  private headers(withBody: boolean): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "recipe-connector",
      ...(withBody ? { "Content-Type": "application/json" } : {}),
    };
  }

  private contents(method: string, path: string, body?: unknown): Promise<Response> {
    const query = method === "GET" ? `?ref=${encodeURIComponent(this.branch)}` : "";
    return this.fetchImpl(
      `https://api.github.com/repos/${this.owner}/${this.name}/contents/${encodePath(path)}${query}`,
      { method, headers: this.headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) },
    );
  }

  async readDir(dir: string): Promise<DirFile[]> {
    const res = await this.fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        query: DIR_QUERY,
        variables: { owner: this.owner, name: this.name, expr: `${this.branch}:${dir}` },
      }),
    });
    if (!res.ok) throw new Error(`GitHub readDir ${dir} failed: ${res.status}`);
    const json = (await res.json()) as {
      data?: { repository?: { object?: { entries?: Array<{ name: string; type: string; object?: { text?: string | null } | null }> } | null } | null };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) throw new Error(`GitHub readDir ${dir} failed: ${json.errors[0]?.message}`);
    const entries = json.data?.repository?.object?.entries ?? [];
    const files: DirFile[] = [];
    for (const e of entries) {
      if (e.type === "blob" && typeof e.object?.text === "string") {
        files.push({ path: `${dir}/${e.name}`, content: e.object.text });
      }
    }
    return files;
  }

  async getFile(path: string): Promise<RepoFile | null> {
    const res = await this.contents("GET", path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub getFile ${path} failed: ${res.status}`);
    const f = (await res.json()) as unknown;
    if (Array.isArray(f)) return null;
    const file = f as { content?: string; sha?: string; encoding?: string };
    if (typeof file.content !== "string" || typeof file.sha !== "string" || file.encoding !== "base64") {
      throw new Error(`GitHub returned an unexpected shape for ${path}`);
    }
    return { path, sha: file.sha, content: fromBase64(file.content) };
  }

  async putFile({ path, content, message, sha }: { path: string; content: string; message: string; sha?: string }): Promise<void> {
    const res = await this.contents("PUT", path, {
      message,
      content: toBase64(content),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    });
    if (res.status === 409 || res.status === 422) {
      throw new ConflictError(`GitHub rejected the write to ${path} (${res.status})`);
    }
    if (!res.ok) throw new Error(`GitHub putFile ${path} failed: ${res.status}`);
  }
}
