# Deploying Krarok

Production is the Cloudflare Worker `kraroktunngern` at https://kraroktunngern.cashsquirrelapp.workers.dev.

## How a change goes live

From 26 Oct 2569, `main` is the source of production. A push to `main` is built and deployed by **Cloudflare Workers Builds**, which is connected to this repository. Nobody runs wrangler by hand any more. The site updates about 2–3 minutes after the push. Every push to `main` goes live, a change to the docs included.

## Rules

- Work on a branch and open a pull request. Merge to `main` only when the owner has approved the release.
- If a change needs SQL, put the file in `supabase/migrations/`. The owner runs it in the Supabase SQL editor before the merge.
  - The Supabase GitHub integration also tries to apply migrations to production on every push to `main`. It currently stops at the first file, whose table already exists. Do not rename or delete old migration files: that could let other SQL run on production by itself.
- Never commit keys, tokens or `.env` files. Production secrets live in the Cloudflare Worker settings. This repository is public.
- UI rules:
  - Phone screens stay pixel-identical unless the owner asks. Computer and iPad changes are made separately.
  - Thai text is formal, with a line height of at least 1.45 and no overlapping text.
  - Text shown through `tr()` needs English in `frontend/src/i18n/en/`.
  - Never redraw the mascot.

## Checks before merging

```bash
npm ci
npm test
npm run cloudflare:check
npm run cloudflare:dry-run
npm run build && npx playwright test
```

## Rollback

Revert the commit on `main` and push. Workers Builds deploys the previous code again.
