import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { safeEqual, type Env } from "../src/worker.js";

const SECRET = "s".repeat(32);
const env: Env = { GITHUB_TOKEN: "unused", CONNECTOR_SECRET: SECRET, RECIPES_REPO: "gerp93/recipes", RECIPES_BRANCH: "main" };
const url = (path: string) => `https://example.workers.dev${path}`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
};

test("safeEqual compares exactly", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
  assert.ok(!safeEqual("", "a"));
});

test("a missing or wrong Authorization header is a plain 404", async () => {
  const headers: Array<Record<string, string>> = [
    {},
    bearer("wrong"),
    bearer(`${SECRET}x`),
    bearer(SECRET.slice(1)),
    { Authorization: SECRET },
    { Authorization: `Basic ${SECRET}` },
    { Authorization: `Bearer ${SECRET} extra` },
    { Authorization: "Bearer " },
  ];
  for (const h of headers) {
    const res = await worker.fetch(new Request(url("/mcp"), { method: "POST", headers: h }), env);
    assert.equal(res.status, 404, JSON.stringify(h));
    assert.equal(await res.text(), "Not found");
  }
});

test("the old secret-in-the-URL form no longer works, and other paths are 404 even with the right header", async () => {
  for (const path of ["/", `/mcp/${SECRET}`, "/mcp/other", "/other"]) {
    const res = await worker.fetch(new Request(url(path), { method: "POST", headers: bearer(SECRET) }), env);
    assert.equal(res.status, 404, path);
  }
});

test("a short or missing secret never matches, even if the header matches it", async () => {
  for (const secret of ["", "short"]) {
    const res = await worker.fetch(new Request(url("/mcp"), { method: "POST", headers: bearer(secret) }), { ...env, CONNECTOR_SECRET: secret });
    assert.equal(res.status, 404);
  }
  const res = await worker.fetch(new Request(url("/mcp"), { headers: bearer("x") }), { ...env, CONNECTOR_SECRET: undefined as unknown as string });
  assert.equal(res.status, 404);
});

test("the right header with GET is 405", async () => {
  const res = await worker.fetch(new Request(url("/mcp"), { headers: bearer(SECRET) }), env);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("Allow"), "POST");
});

test("the right header answers a real MCP initialize request, with or without a trailing slash", async () => {
  for (const path of ["/mcp", "/mcp/"]) {
    const res = await worker.fetch(
      new Request(url(path), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...bearer(SECRET) },
        body: JSON.stringify(initialize),
      }),
      env,
    );
    assert.equal(res.status, 200, path);
    const body = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    assert.equal(body.result?.serverInfo?.name, "recipes");
  }
});

test("the scheme word is case-insensitive", async () => {
  const res = await worker.fetch(new Request(url("/mcp"), { headers: { Authorization: `bearer ${SECRET}` } }), env);
  assert.equal(res.status, 405);
});
