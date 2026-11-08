import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { GitHubClient } from "./github.js";
import { buildServer } from "./mcp.js";
import { RecipeService } from "./service.js";

export interface Env {
  /** Fine-grained GitHub token limited to the recipes repo, Contents: read and write. Set as a secret. */
  GITHUB_TOKEN: string;
  /** Random string the connector sends as `Authorization: Bearer <secret>`. At least 24 characters. Set as a secret. */
  CONNECTOR_SECRET: string;
  RECIPES_REPO: string;
  RECIPES_BRANCH: string;
}

/** Compares in time that does not depend on where the strings differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** The token from an `Authorization: Bearer <token>` header, or "" if there isn't one. */
function bearerToken(request: Request): string {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? "";
}

const notFound = () => new Response("Not found", { status: 404 });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = env.CONNECTOR_SECRET ?? "";
    // Anything other than /mcp with the exact secret in the Authorization header looks like a page that does not exist.
    if (!/^\/mcp\/?$/.test(new URL(request.url).pathname) || secret.length < 24 || !safeEqual(bearerToken(request), secret)) {
      return notFound();
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }),
        { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } },
      );
    }

    const client = new GitHubClient(env.GITHUB_TOKEN, env.RECIPES_REPO, env.RECIPES_BRANCH);
    const server = buildServer(new RecipeService(client));
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};
