# Cash Squirrel Cloudflare source snapshot — landing restore v3

This immutable snapshot restores the previous Editorial/Motion landing page in
`cloudflare-production-release`. The source inventory is exactly the same 521-file
allowlist as the reviewed v2 snapshot. Only
`frontend/src/features/marketing/LandingPage.tsx` differs: its lazy import now
loads `./editorial/Landing` instead of `./kinetic/KineticLanding`.

The previous landing components, styles, screenshots and LINE demonstration
assets were already included. Their existing files are unchanged. This release
does not change backend code, authentication, payments, provider configuration,
application features, dependencies or scheduled-job code.

## Upload scope

Replace only these four files together under `cloudflare-release/` on the
reviewed `cloudflare-production-20261018` branch:

- `source.tar.gz`
- `source-manifest.json`
- `prepare-release.mjs`
- `DEPLOY_SNAPSHOT.md`

Do not upload or replace `wrangler.jsonc`. The live root configuration already
contains the approved scheduling handoff: `CRON_ENABLED="true"` and the two
production triggers `0 1 * * *` and `0 2 * * *`. Preserve that configuration.
The archived `wrangler.production.jsonc` remains the reviewed pre-cutover
configuration (`CRON_ENABLED="false"`, no registered triggers) because this
release changes only the landing wrapper. The CI deploy command explicitly
uses the root `wrangler.jsonc`; the archived preflight does not establish the
live cron state.

`package.json`, `package-lock.json` and `.gitignore` are unchanged and do not
need to be uploaded. Never upload `.env` files, local credentials or generated
build directories.

## Standard Cloudflare Git build settings

- Repository directory: `cloudflare-release`
- Build command: `node prepare-release.mjs`
- Deploy command: `npx --yes wrangler@4.151.0 deploy --config wrangler.jsonc`
- Node.js: 22.12 or newer
- Target Worker: `kraroktunngern`
- Account: `7cb26b23e102b0d36824da093b2a267c`

The bootstrap verifies fixed SHA256 digests for the archive and manifest,
checks every member against the manifest, rejects unsafe paths and non-regular
entries, and extracts into a new `app/` directory. It then installs locked
dependencies, runs the Cloudflare checks and build, and runs configuration
preflight. Deployment remains a separate CI step.

## Snapshot integrity

- Source file count: 521
- Total source bytes: 19,370,612
- Archive bytes: 15,003,238
- Archive SHA256: `80d3551eabe6948fc51c1ed4219bdba1b50efc4755dc5f0f6691e1256c69ee8d`
- Manifest SHA256: `dbf6f521bacac37d5cbc56e77fa809c3f09f1b5147db4163e6519044b61248bc`
- Landing wrapper SHA256: `d87d2d82a179bc3ba6455b705b5394d3d9fe07acf42ee028bbde9118694880d2`
- Exactly one source hash differs from v2; the other 520 files are unchanged.
- USTAR entries are regular files only, ordered by path, with fixed mode 0644,
  zero timestamps/owners, and empty owner/group names. Gzip metadata is fixed.
- The exact v2 allowlist excludes dependencies, generated output, local deploy
  state, `.env*`, private-key/database/log files, internal Markdown and `docs/`.

The archived source remains an intermediate migration package. Future
maintenance should move the unpacked source into an ordinary reviewed Git
branch rather than repeatedly update binary archives.

## Offline verification

```sh
node prepare-release.mjs --verify-only
```

This checks all source bytes without extraction, dependency installation,
network access or deployment. `--extract-only` performs the same verification
and extracts into a new `app/`, refusing to overwrite an existing directory.
Local snapshot verification is not evidence of a successful remote build or
production deployment; those checks must be recorded after CI completes.
