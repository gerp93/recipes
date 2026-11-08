# Instructions for Claude

This repo is my recipe collection. I use it mostly by voice while cooking, so every file is written to be read aloud. Follow this file whenever you save, add or edit a recipe here. If it disagrees with README.md, this file wins.

## What a recipe file looks like

- One dish per file, at `recipes/<lowercase-dashed-title>.md` (for example `recipes/chicken-piccata.md`).
- A meal with several dishes (roast, potatoes, gravy) is several files, one per dish. Give the dishes in one meal a shared tag such as `meal-sunday-roast` so they can be found together.
- Start with this frontmatter, using these exact keys:

```
---
title: Chicken Piccata
serves: 4
active_time: 25m
total_time: 35m
tags: [chicken, weeknight, skillet, lemon]
---
```

  - `serves` is a whole number.
  - Times look like `25m`, `1h`, or `1h 30m`.
  - `tags` are lowercase words, with dashes instead of spaces, inside square brackets and separated by commas.
  - Leave out `active_time` only if I didn't give one. Never invent a value.

- Then a `## Ingredients` heading and a flat bullet list, amount first: `1 lb chicken breast`, not `chicken breast (1 lb)`.
- Then a `## Steps` heading and a numbered list, one action per step.
- Optionally a `## Notes` heading at the end.
- If a dish has distinct parts, such as a sauce, use `## Ingredients: sauce` and `## Steps: sauce`. Do not use `###` headings or nested lists.
- No tables. No parentheses holding amounts. No emoji.

## How to save a recipe

1. Read this file first.
2. Read the recipe back to me in short form: title, serves, total time. Wait for me to say yes. Write nothing before that.
3. Check that `recipes/<name>.md` doesn't already exist. If it does, tell me and ask before changing it.
4. Write the file. Use the commit message `Add recipe: <title>`.
5. Add one line to `INDEX.md`, in the same format as the existing lines:

```
- `recipes/<file>.md`: <Title>, <total time>, <tags separated by commas>
```

   If `INDEX.md` doesn't exist, create it with the heading `# Recipe index` first.
6. Tell me the file name you saved, in one sentence.

Never delete or rename a recipe unless I ask. Don't edit files other than the recipe and `INDEX.md`. If something I say is unclear, such as an amount or a time, ask instead of guessing.

## Example

```
---
title: Example Scrambled Eggs
serves: 2
active_time: 10m
total_time: 10m
tags: [eggs, breakfast, quick]
---

## Ingredients

- 4 eggs
- 1 tbsp butter
- 1 pinch salt

## Steps

1. Whisk the eggs with the salt.
2. Melt the butter in a pan over medium-low heat.
3. Pour in the eggs and stir slowly until just set.
```
