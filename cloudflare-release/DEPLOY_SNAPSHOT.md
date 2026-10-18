# Phase-one release - production deployment

Prepared 2026-10-19. Feedback schema applied to production project rcllghixkclvkxhvttaw before this release upload. Cloudflare build/live verification must be checked after the commit.

## Source integrity

- Files: 538
- Source bytes: 19507996
- Archive SHA256: `f2d4cf313a5639f027637ec1b0b6986d0aa92e4cfe7f8d32480b398af556a408`
- Manifest SHA256: `cd9e3679386325dd2b0edad9bccda6b6615cc3941da03a0c983eb0afb27daa83`
- Base: 521 reviewed v3 files plus 17 explicitly reviewed additions. No secrets, dependency directories, generated build output, or symlinks are included.
- Verify: `node prepare-release.mjs --verify-only`

## Changes

Reversible ordinary-user navigation exposes Overview, Income/Expenses, Jobs, Calendar, invoice/receipt/tax invoice documents, and Feedback. Same-account trusted admins retain all prior features. Hidden data and deferred feature code remain intact. Legacy document import is additive. Public landing and billing copy match phase one; prior editorial components remain available behind a flag.

Feedback adds simple user threads and an independent admin inbox with replies/status. API session/ownership/admin/CSRF checks, atomic SQL, RLS and service-only privileges protect private conversations.

## Required deployment order

1. Authenticated browser access restored. Correct Supabase business project and existing GitHub release branch verified.
2. Applied `database/feedback_phase_one.sql` once to `rcllghixkclvkxhvttaw`. Verified two RLS-enabled tables, no anon/authenticated table privileges, and three service-only SECURITY INVOKER functions with empty search_path. Service-role create/reply/status/detail/admin-list smoke test passed in a transaction whose test writes were rolled back. Do not reapply.
3. Upload only `source.tar.gz`, `source-manifest.json`, `prepare-release.mjs`, and this `DEPLOY_SNAPSHOT.md` to repository `cashsquirrelapp-collab/cashsquirrelapp`, branch `cloudflare-production-20261018`, directory `cloudflare-release`.
4. Keep the existing ROOT `wrangler.jsonc`, 15 encrypted Secrets and both cron triggers unchanged. This candidate intentionally omits root Wrangler config.
5. Verify Cloudflare Ready/active version and normal/admin desktop/mobile flows plus isolated feedback create/reply/status. Current production remains v3 commit `5fbffe60ae2020fb1b8a3eed0d21e08e1f5ff7fb`, active version prefix `302cce6d`.

## Validation and limitations

- Final TypeScript, Cloudflare check (16 tests) and Cloudflare build passed.
- 29 targeted phase-one/document/feedback tests passed, including PGlite permissions, ownership and atomic rollback.
- Static normal/admin desktop/mobile/settings and Thai/English feedback markup checks passed.
- Four isolated Playwright scenarios typecheck and are discovered; they have NOT run. CUA was disconnected during implementation; the browser connection is now restored for live verification. Standalone Chromium launch was blocked by OS sandbox permissions. No visual verification claimed at package preparation.
- Full unit run: 263/268 passed; all five failures reproduce identically in untouched v3. They concern pre-existing notification status and monthly-report calculations/format expectations. Relevant files unchanged.
- Existing authenticated APIs and previously enabled LINE notifications remain; existing users retain opt-out/disconnect controls.
- Rollback: redeploy v3 source if needed, retaining the additive feedback tables/data. Do not drop customer feedback.
