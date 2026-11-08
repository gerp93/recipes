import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError, GitHubClient, fromBase64, toBase64 } from "../src/github.js";

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function clientWith(respond: (seen: Seen) => Response): { client: GitHubClient; seen: Seen[] } {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const s: Seen = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    seen.push(s);
    return respond(s);
  }) as typeof fetch;
  return { client: new GitHubClient("tok", "gerp93/recipes", "main", fetchImpl), seen };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("base64 helpers round-trip unicode", () => {
  const text = "Heat the oven to 250°F — crème brûlée ✓\nline two";
  assert.equal(fromBase64(toBase64(text)), text);
  assert.equal(fromBase64("aGk=\n"), "hi");
});

test("the repo must be owner/name", () => {
  assert.throws(() => new GitHubClient("t", "recipes", "main"), /owner\/name/);
});

test("readDir fetches every file in one GraphQL request", async () => {
  const { client, seen } = clientWith(() =>
    json({
      data: {
        repository: {
          object: {
            entries: [
              { name: "a.md", type: "blob", object: { text: "A" } },
              { name: "b.md", type: "blob", object: { text: "B" } },
              { name: "sub", type: "tree", object: {} },
              { name: "img.png", type: "blob", object: { text: null } },
            ],
          },
        },
      },
    }),
  );
  const files = await client.readDir("recipes");
  assert.deepEqual(files, [
    { path: "recipes/a.md", content: "A" },
    { path: "recipes/b.md", content: "B" },
  ]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, "https://api.github.com/graphql");
  assert.equal((seen[0]?.body as { variables: { expr: string } }).variables.expr, "main:recipes");
  assert.equal(seen[0]?.headers.Authorization, "Bearer tok");
});

test("readDir returns an empty list when the folder does not exist, and throws on GraphQL errors", async () => {
  assert.deepEqual(await clientWith(() => json({ data: { repository: { object: null } } })).client.readDir("recipes"), []);
  await assert.rejects(clientWith(() => json({ errors: [{ message: "Bad credentials" }] })).client.readDir("recipes"), /Bad credentials/);
  await assert.rejects(clientWith(() => json({}, 401)).client.readDir("recipes"), /401/);
});

test("getFile decodes content, returns null on 404 and for directories", async () => {
  const ok = clientWith(() => json({ content: toBase64("hello °F"), sha: "abc", encoding: "base64" }));
  assert.deepEqual(await ok.client.getFile("recipes/x.md"), { path: "recipes/x.md", sha: "abc", content: "hello °F" });
  assert.ok(ok.seen[0]?.url.endsWith("/contents/recipes/x.md?ref=main"));
  assert.equal(await clientWith(() => json({}, 404)).client.getFile("nope.md"), null);
  assert.equal(await clientWith(() => json([{ name: "x" }])).client.getFile("recipes"), null);
  await assert.rejects(clientWith(() => json({}, 500)).client.getFile("x.md"), /500/);
});

test("putFile sends base64, branch and sha, and maps 409 and 422 to ConflictError", async () => {
  const { client, seen } = clientWith(() => json({}));
  await client.putFile({ path: "recipes/a b.md", content: "hi", message: "msg", sha: "s1" });
  assert.equal(seen[0]?.method, "PUT");
  assert.ok(seen[0]?.url.endsWith("/contents/recipes/a%20b.md"));
  assert.deepEqual(seen[0]?.body, { message: "msg", content: toBase64("hi"), branch: "main", sha: "s1" });
  await client.putFile({ path: "n.md", content: "x", message: "m" });
  assert.ok(!("sha" in (seen[1]?.body as object)));
  for (const status of [409, 422]) {
    await assert.rejects(clientWith(() => json({}, status)).client.putFile({ path: "a.md", content: "x", message: "m" }), ConflictError);
  }
  await assert.rejects(clientWith(() => json({}, 403)).client.putFile({ path: "a.md", content: "x", message: "m" }), /403/);
});
