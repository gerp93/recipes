# Recipes

My recipes, written so they read well out loud. I talk to these through Claude's
voice mode while cooking, so the files are built for listening, not for looking at.

## Conventions

- One recipe per file, in `recipes/`, named in lowercase with dashes (`chicken-piccata.md`).
- Every file starts with frontmatter: title, serves, tags, and the active and total times when I give them.
- Ingredients are a flat bullet list, amount first: `1 lb chicken breast`, not `chicken breast (1 lb)`.
- No tables and no nested lists. If a recipe has parts, use a separate `##` section for each
  (for example `## Ingredients: sauce`).
- Steps are a numbered list, one action per step.
- Add every new recipe to `INDEX.md`.

See `recipes/example-recipe-delete-me.md` for the format.

## The connector

`connector/` is the small Cloudflare Worker that lets Claude's voice mode read and save these recipes. It is not a recipe; see `connector/README.md` for how it works and how to deploy it (`npm run deploy` from inside `connector/`).
