# Test site: staging.krarok.com

The real site's code on its own Worker (`cashsquirrel-staging`), with its own database (Supabase project
`kraroktunngern-staging`), Stripe in test mode and the staging safety rules on. Set up on 2026-10-31.

## Flow

1. Make the change on a branch, or on main without deploying it.
2. `npm run staging:deploy` puts that code on https://staging.krarok.com. The real site is not touched.
3. The owner tries it there.
4. When the owner says it can go up, merge to main, then run `npm run cloudflare:deploy` for krarok.com.

Small fixes can still go straight to krarok.com once every check passes, as before. Bigger features, and anything
touching money, Stripe or LINE, go through staging first.

## What is different on staging

- `STAGING_MODE=integrated` (backend/src/security/staging.ts):
  - only the owner's test accounts can sign in or get e-mail and LINE messages;
  - e-mail subjects start with `[STAGING]`;
  - account deletion is off;
  - Stripe accepts test keys only.
- Pages carry `X-Robots-Tag: noindex`, so they never appear in search results.
- There are no scheduled jobs: the free plan allows five per account and the real site uses two.
- เลขากระรอก answers only after the owner gives this Worker its own AI keys:
  - `wrangler secret put GEMINI_API_KEY -c wrangler.staging.jsonc`
  - `wrangler secret put ANTHROPIC_API_KEY -c wrangler.staging.jsonc`
- `scripts/cloudflare-preflight.mjs --staging` refuses to deploy if the config names the real database, live Stripe or
  the real domain, or if the build names the real database.

## Database

Staging's database must get every database file the real site gets, run by the owner in the staging SQL editor. Check
that the project name at the top is **kraroktunngern-staging** before pressing Run.

On 2026-10-31 it was at the 16 Oct state. The 19 files the real site got since then are, in order:

- supabase/migrations 20261020144448, 20261020155537, 20261020165518, 20261020172734;
- database/feedback_phase_one.sql, database/feedback_admin_inbox.sql;
- supabase/migrations 20261022040000, 20261024090000;
- database/ai_secretary.sql, database/ai_account_actions.sql;
- supabase/migrations 20261024120000 up to 20261025230000, in name order.

The read-only reports (ai_learning_report, profit_report_*) change nothing and are not needed.
