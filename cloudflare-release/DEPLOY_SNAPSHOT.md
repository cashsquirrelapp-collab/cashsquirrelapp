# Cash Squirrel Cloudflare source snapshot

This directory holds an immutable source snapshot of the reviewed local
`cloudflare-production-release`, revised for the two-trigger production
scheduler. GitHub `main` was older than the original release. The archive keeps this deployment independent of stale
source on `main` and allows review of the exact file inventory and hashes in
`source-manifest.json`.

This is an intermediate migration release. Future development should move
the unpacked source into an ordinary reviewed Git branch, rather than keep
updating binary archives.

## Standard Cloudflare Git build settings

- Repository directory: `cloudflare-release`
- Build command: `node prepare-release.mjs`
- Deploy command: `npx --yes wrangler@4.151.0 deploy --config wrangler.jsonc`
- Node.js: 22.12 or newer
- Target Worker: `kraroktunngern`
- Account: `7cb26b23e102b0d36824da093b2a267c`

Replace all seven release files together in `cloudflare-release/` on the reviewed
`cloudflare-production-20261018` branch. Keep the existing `.gitignore`. Do not
select an unrelated branch or publish any `.env` file.

The bootstrap has no dependencies. It verifies fixed SHA256 digests for both
the source archive and its manifest, checks every member against the
manifest, rejects paths outside the destination and all non-regular file
entries, and extracts into a newly created `app/` directory. It then uses
`npm ci` with the application's lockfile, runs the Cloudflare checks and
build, and checks deployment configuration. It does not deploy by itself.

The root `wrangler.jsonc` makes the intended Worker visible to Cloudflare's
Git integration before the build runs. It mirrors the archived production
configuration, with `main` and the assets directory prefixed with `app/`.
Its parity with the archived configuration was checked locally. The separate
deploy step uploads the built frontend and the Worker together.

## Contents and safety

- 521 source files; 19,370,668 source bytes.
- Archive SHA256: `7d87782d516d5b2dfd99103eb0f8fac4ef7ae30f55e0dd39545e9fa1868be729`
- Manifest SHA256: `af82654e34160a0881bcce90a42b98bda6d224eb46683d05eb28960fca8c5c1a`
- The deterministic archive contains regular files only; timestamps, owners,
  ordering and file modes are fixed.
- Excludes dependencies, generated build output, test output, `.git`, local
  deployment state, `.env*`, private-key/database/log files, internal Markdown
  documents and `docs/`.
- A scan for common credential formats found no matches in included text
  files. This does not replace a full security review.

Production secrets must be installed through Cloudflare's supported secret
settings. They are not present in this snapshot. Preserve the existing
production session secret, Supabase project, LINE identifiers and live
Stripe catalog. Both the root and archived production configurations have
`triggers.crons=[]` and `CRON_ENABLED=false`; this revision does not activate
scheduled jobs. At the verified scheduling handoff, register only `0 1 * * *`
and `0 2 * * *` and enable the flag. The 01:00 UTC event runs the daily digest
and additionally the monthly report and WHT reminder when the event
timestamp falls on UTC day 1. The 02:00 UTC event handles account expiry.
These retain 08:00/09:00 Bangkok timings and use two production cron slots.

## Changes from the original snapshot

The archive inventory is unchanged. Only these five source files differ:

- `cloudflare/schedule.ts`: two-trigger routing uses the scheduled event timestamp for monthly jobs.
- `cloudflare/worker.ts`: forwards `controller.scheduledTime`.
- `tests/cloudflare-scheduled.test.ts`: calendar boundaries, delayed events and independent delivery failures.
- `wrangler.production.jsonc`: schedules remain unregistered before cutover.
- `scripts/cloudflare-preflight.mjs`: enabled scheduling requires the two supported triggers.

The revised local source passed both TypeScript checks, all 16 tests in
`cloudflare:check`, and the local configuration preflight. This is not a
claim that this revised snapshot has been remotely built or deployed.
Staging code/configuration, dependencies and application features are unchanged.

## Offline verification

```sh
node prepare-release.mjs --verify-only
```

This verifies every archived file without extracting, installing dependencies,
contacting the network or deploying. A full CI build requires normal network
access to install the locked application dependencies. Provider credentials,
live login flows, webhook cutover and scheduled jobs remain separate checks.

For an isolated local build check using already available dependencies,
`--extract-only` verifies the same archive and extracts `app/` without running
installation or build commands. It refuses to overwrite an existing `app/`.
