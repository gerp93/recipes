# RecipeConnector

A small MCP server that lets Claude read, search and save recipes in a GitHub recipes repo. It runs as a Cloudflare Worker (free plan).

It exists because Claude's voice mode does not show the file contents returned by GitHub's own connector, and does not load Project files. This server returns recipes as plain text, which voice mode can read, and it writes new recipes in the repo's format itself, so Claude never has to read a rules file first.

## Tools

| Tool | What it does |
|---|---|
| `list_recipes` | Every recipe with serves, total time and tags. |
| `search_recipes` | Best matches for words in the title, tags, ingredients or steps. |
| `get_recipe` | The full recipe as plain text, found by name or file name. |
| `get_recipe_rules` | The repo's `CLAUDE.md` as plain text: the rules for writing a recipe. Claude is told to call it before saving. |
| `add_recipe` | Saves one recipe as `recipes/<name>.md` with frontmatter, adds a line to `INDEX.md`. Needs `confirmed: true`, never overwrites unless `overwrite: true`. |

The file format is the one in the recipes repo's `CLAUDE.md`. `src/recipe.ts` is where it is enforced.

## Set it up

You need a free Cloudflare account and a GitHub token. Nothing here is stored in this repo.

1. **GitHub token.** GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens. Repository access: only the recipes repo. Permission: Contents, read and write. Nothing else.
2. **Log in to Cloudflare.** `npx wrangler login` opens a browser to approve.
3. **Set the two secrets.** Each command prompts you to paste the value.
   ```
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put CONNECTOR_SECRET
   ```
   `CONNECTOR_SECRET` is the password Claude sends in a request header, so only someone who knows it can use the server. Use at least 24 characters (32 to 64 is better) with no spaces, from a secure random source such as a password manager. Letters and digits only avoids paste problems. Or make one with:
   ```
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
4. **Deploy.** `npm run deploy` prints the Worker address, like `https://recipe-connector.<your-name>.workers.dev`.
5. **Add it to Claude.** Customize, Connectors, Add custom connector. URL: `https://recipe-connector.<your-name>.workers.dev/mcp`. Authentication: No sign in. Under request headers add `Authorization` with the value `Bearer <CONNECTOR_SECRET>` (the word Bearer, one space, then the secret).

Repo and branch are set in `wrangler.toml` (`RECIPES_REPO`, `RECIPES_BRANCH`).

## Security

The `Authorization` header is the password, checked in constant time. Anything without it gets a plain 404, and the URL itself carries no secret. Anyone who has the secret can read and add recipes, so keep it private. The GitHub token can only touch the one repo's contents. To rotate: set a new `CONNECTOR_SECRET` and update the connector's header to match. If the GitHub token expires, writes fail until you set a new one.

## Develop

```
npm test            # 49 tests, no network
npm run typecheck
GITHUB_TOKEN=... npx tsx tests/live-check.ts   # read-only check against the real repo
npm run dev         # local Worker via wrangler
```
