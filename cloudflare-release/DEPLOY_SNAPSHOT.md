# Cash Squirrel Cloudflare source snapshot

This directory holds an immutable source snapshot of the reviewed local
`cloudflare-production-release` from 18 October 2026. GitHub `main` was older
than this release. The archive keeps this deployment independent of stale
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

Upload the seven files in this directory together on the reviewed migration
branch. Do not select an unrelated branch or publish any `.env` file.

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

- 521 source files; 19,368,359 source bytes.
- Archive SHA256: `5f45630d2c8fccd0ce1c840afcd3f2dcf9c40710e544f14689f90a27db698934`
- Manifest SHA256: `4df7e446f41eb615bb1224c3c755c29ea717d9ae4d1826a91dfc815f1906f1dc`
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
Stripe catalog. `CRON_ENABLED` remains `false` until the scheduling handoff.

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
