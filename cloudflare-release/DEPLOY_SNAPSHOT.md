# Phase-one release - document copy follow-up

Prepared 2026-10-19. The initial phase-one source is deployed from GitHub commit `7dbf9c8a88ce9206183e96e56da1075e58a86c0d`, active Cloudflare version prefix `d2a836a5`. This package contains the copy follow-up found during guest browser QA; its own Cloudflare deployment and live verification remain pending.

## Source integrity

- Files: 538
- Source bytes: 19509525
- Archive SHA256: `b6003439345565fa7a2eae25a98d73e46e2d59fbdcdc72a602dfd28eda085de4`
- Manifest SHA256: `128e6b1777944665b710f9aa5605e1ebc7a552be06fe4dbae89758fc3f713422`
- Identical reviewed 538-file allowlist: zero files added or removed. Exactly four source files changed from the initial phase-one package; the other 534 source files are byte-identical.
- Changes are limited to document heading/subtitle copy, its shared header prop, translations, and the corresponding end-to-end regression specification.
- No secrets, dependency directories, generated build output, or symlinks are included. The four-file upload does not contain root Wrangler configuration.
- Verify: `node prepare-release.mjs --verify-only`

## Release behavior

Reversible ordinary-user navigation exposes Overview, Income/Expenses, Jobs, Calendar, invoice/receipt/tax invoice documents, and Feedback. Same-account trusted admins retain all prior features. Hidden data and deferred feature code remain intact. Legacy document import is additive. Public landing and billing copy match phase one; prior editorial components remain available behind a flag.

Feedback adds simple user threads and an independent admin inbox with replies/status. API session/ownership/admin/CSRF checks, atomic SQL, RLS and service-only privileges protect private conversations.

Guest browser QA of the initial deployed release found the document subtitle still mentioning quotations. This follow-up limits ordinary-user document copy to the three released document types while retaining the full admin copy and deferred quotation implementation.

## Deployment status and order

1. The owner explicitly approved publishing the reviewed four-file release package to the public repository and requested that deferred features be retained for future gradual launches.
2. Applied `database/feedback_phase_one.sql` once to `rcllghixkclvkxhvttaw` before the initial release. Verified two RLS-enabled tables, no anon/authenticated table privileges, and three service-only SECURITY INVOKER functions with empty search_path. Service-role create/reply/status/detail/admin-list smoke test passed in a transaction whose test writes were rolled back. Do not reapply.
3. Initial phase one is live at `https://kraroktunngern.cashsquirrelapp.workers.dev`, GitHub commit `7dbf9c8a88ce9206183e96e56da1075e58a86c0d`, active Cloudflare version prefix `d2a836a5`.
4. Upload only `source.tar.gz`, `source-manifest.json`, `prepare-release.mjs`, and this `DEPLOY_SNAPSHOT.md` to repository `cashsquirrelapp-collab/cashsquirrelapp`, branch `cloudflare-production-20261018`, directory `cloudflare-release` for this follow-up.
5. Keep the existing ROOT `wrangler.jsonc`, 15 encrypted Secrets and both cron triggers unchanged. This candidate intentionally omits root Wrangler config.
6. Verify the follow-up Cloudflare Ready/active version and its document copy. Live feedback UI verification is in progress separately; do not infer completion from package checks.

## Validation and limitations

- Follow-up TypeScript, Cloudflare check (16/16 tests) and Cloudflare build passed.
- Initial package: 29 targeted phase-one/document/feedback tests passed, including PGlite permissions, ownership and atomic rollback. Those runtime implementations are unchanged by this follow-up.
- Static normal/admin desktop/mobile/settings and Thai/English feedback markup checks passed for the initial package.
- Initial release has received live guest browser QA. The four isolated Playwright scenarios typecheck and are discovered; they have NOT executed because standalone Chromium launch was blocked by OS sandbox permissions. The changed regression specification is included but not claimed as executed.
- Prior full unit run: 263/268 passed; all five failures reproduce identically in untouched v3. They concern pre-existing notification status and monthly-report calculations/format expectations. Relevant files remain unchanged.
- Existing authenticated APIs and previously enabled LINE notifications remain; existing users retain opt-out/disconnect controls.
- Rollback: redeploy the initial phase-one source if needed, retaining the additive feedback tables/data. Do not drop customer feedback or deferred feature data.

## LINE webhook early answer - 2026-10-19

Production log showed `POST /api/line-webhook` ending as "canceled" at about 1.7 s with no error: LINE gave up before the handler (several database calls, then the reply) finished, so chat replies were never sent. `cloudflare/worker.ts` now answers LINE within 900 ms and lets the handler finish and reply in the background (`ctx.waitUntil`); new helper `cloudflare/deferred.ts` with `tests/cloudflare-deferred.test.ts`.

- Files: 540 (was 538). One file changed (`cloudflare/worker.ts`, 11 added lines, none removed), two added; the other 537 are byte-identical to the previous package.
- Archive SHA256: `4aaacb35e71d62f10b660a599788efd722983d66460c6bade6f76cdcd76f79a5`; manifest SHA256: `592818e425d99faf3b4298d7bbfa80e9f4a2ad363f7f1bdbc6f85303dfda392a` (pinned in `prepare-release.mjs`).
- Checked on the extracted package: lint, `tsc -p tsconfig.cloudflare.json`, 19 Cloudflare tests, frontend build and `scripts/cloudflare-preflight.mjs` all pass.
- Root `wrangler.jsonc`, the 15 Secrets and the two cron triggers are unchanged.
- Rollback: restore the previous commit's `source.tar.gz`, `source-manifest.json` and `prepare-release.mjs` (commit 689fd88).

## LINE replies: independent reads run in parallel - 2026-10-19

After the early-answer fix the LINE bot replied, but each reply still took 2.2-2.7 s: the handler made about eight database round trips one after another (claim, rate limit, link lookup, snapshot, lifecycle check, Pro check, reply, mark done), each 150-250 ms from a Worker. `prefetchLinkedContext` (lineAssistant.ts) now starts the user, lifecycle and Pro reads at the same moment the webhook claims the event and checks the rate limit, so the user waits for about four round trips instead of seven. The reads only read; the assistant still uses the answers at the same steps (unlinked, closed and expired accounts are stopped as before, and a failed lookup still fails closed).

- Files: 541 (was 540). Two changed (`backend/src/handlers/line-webhook.ts`, `backend/src/services/lineAssistant.ts`), one added (`tests/line-assistant-prefetch.test.ts`); the other 538 are byte-identical to the previous package.
- Archive SHA256: `ec63fc5b621d05c8571d6ee0c7d54828e8dcbddceff8476bc410c18850c1724e`; manifest SHA256: `2cb152adc6fc8fecde26fc2f206748c830e3b0288246af33ee7e9b8d73bde52f` (pinned in `prepare-release.mjs`).
- Checked on the extracted package: lint, `tsc -p tsconfig.cloudflare.json`, 19 Cloudflare tests, 23 assistant tests, the full unit suite (273 pass, the same 5 known failures as before), frontend build and `scripts/cloudflare-preflight.mjs`.
- Root `wrangler.jsonc`, the 15 Secrets and the two cron triggers are unchanged.
- Rollback: restore the previous commit's `source.tar.gz`, `source-manifest.json` and `prepare-release.mjs` (commit bb0170c).

## Sign-in method chooser - 2026-10-20

The login card now opens on a method chooser with no form: Google, Facebook, LINE and email, as tonal pill buttons with each brand's official mark (Simple Icons, CC0) on a clean white card. Email opens the existing form one step behind it (sign-in, sign-up, password reset and lockout are unchanged). Apple is not offered (Apple Developer costs USD 99/year).

- Backend: `action: 'oauth'` accepts `provider` google or facebook (allow-list); `GET /api/auth?providers=1` reports which are switched on in Supabase Auth (cached 5 min), so Facebook shows "เร็ว ๆ นี้" until it is enabled. First social sign-up welcome email covers Facebook too.
- LINE opens the existing LIFF entry (`liff-add.js` logs in from a normal browser and opens the app for accounts already linked to LINE).
- Files: 541, six changed (auth handler, Login.tsx, index.css, services/auth.ts, two e2e specs), none added.
- Archive SHA256 `21dbecb012387b9e72fe5b60aca0b5c198ab1c9832b366d6894cb36c5e008d57`; manifest SHA256 `dc46ecf48cf583862ad48946c026a1f483c9c358ec2aa5976bdf9a52ccbdc981`.
- Checked: lint, Cloudflare tests (26), unit suite (273 pass, same 5 known failures), frontend build, preflight; full e2e against the previous build shows no new failures.
- Rollback: restore the previous commit's three release files (e437389).


## Clean English sign-in card - 2026-10-20

Follow-up to 1859dab at the owner's request, matching the Fastwork sign-in layout: English copy ("Welcome to Kraroktunngern", "Continue with ..."), black monochrome brand marks, one top row (back, centred "Kraroktunngern" wordmark next to the mascot logo, language and theme), the legal line on two even lines, no guest-trial button and no footer under the card. The email step and every account flow behind it are unchanged.

- Changed against 1859dab: Login.tsx, index.css, BrandLogo.tsx (optional latin wordmark), one e2e spec.
- Archive SHA256 `199ad7695d24e8e678d144c0e94b852a45eae75ee2131d520bf9d1bf0f41d7ee`; manifest SHA256 `d54b140b5236f33255eebb96139645cdf197e463cd1e32ff665e84c7d7eb2f74`.
- Checked: lint, unit suite (273 pass, same 5 known failures), sign-in e2e (4), Cloudflare build, preflight.
- Rollback: restore the three release files of 1859dab.


## Phone overview and phone menu - 2026-10-20

Phones only (below 744px); desktop and iPad unchanged. Approved by the owner after the preview (kraroktunngern-preview.cashsquirrelapp.workers.dev, example data).

- Overview: terracotta "Bold header" from the owner's reference; the summary card shows the month's work value large, received / all expenses / net profit in three columns, and closes into a 64px bar as the page scrolls (one scroll container; the card is pinned and keeps its height in the layout). Logo on the header without a disc, "ตุนเงิน" in CI peach.
- Phone menu: five numbered sections (expenses, calendar and timeline, documents, LINE AI Pro, account and settings) plus an admin-only group for tools not released yet. Layout config in frontend/src/features/mobile/mobileNavigation.ts; access still decided by shared/featureAvailability.ts, which is unchanged (phase one kept: regular accounts see LINE and notifications as "เร็ว ๆ นี้").
- Settings can open on a given page (profile, notifications, LINE) from the menu.
- Changed against b9e1b28: App.tsx, DashboardTab.tsx, MobileChrome.tsx, MobileHome.tsx, icons.tsx, mobile.css, SettingsTab.tsx, one e2e spec; new: mobileNavigation.ts, useCollapsingCard.ts. No backend, database, API, Wrangler config, Secrets or cron changes.
- Archive SHA256 `e26db947c9e7d5dbb42254db43f8fbdf9e036856b62162f8b07a94fa6850fd20`; manifest SHA256 `cddd7364579e51681708c842d83c04b3659bc521925db2c96d2841543b824f8d`.
- Checked: lint, unit suite (273 pass, same 5 known failures), phone and desktop/tablet e2e (only the known phase-one failures), touch-scroll and menu checks in mobile emulation, Cloudflare build, preflight.
- Rollback: restore the three release files of b9e1b28.


## Phase one widened, new landing, linked documents, บอกเรา chat, admin inbox - 2026-10-20

Approved by the owner ("ดีพอย") after the preview (kraroktunngern-preview.cashsquirrelapp.workers.dev, example data).

- Launch policy (`shared/featureAvailability.ts`): receivables, quotations, notifications and LINE are now open to every account (owner's choice). Goals, reports, tax, vault, 50 ทวิ, teams and the workspace picker stay hidden for regular accounts.
- Landing for signed-out visitors: new SaaS page (`features/marketing/saas/`, real app screenshots in `public/landing-v3/`). Pro is shown at ฿159 with a "เร็ว ๆ นี้" button; checkout prices are unchanged.
- Desktop overview: the work-value card in terracotta (that card only). Sidebar for regular accounts: ภาพรวม, งาน, ปฏิทิน (เงินค้างรับ under it), รายจ่าย, เอกสาร, บอกเรา.
- Documents: "ออกต่อเป็น…" issues an invoice or receipt from another document, linked (`linkedFromId`, source number as the reference) or as a copy; saved client details can be reused. No API or database change (the schema passes extra fields through).
- Feedback becomes the "บอกเรา" chat on the existing feedback tables. The admin "ข้อความจากผู้ใช้" becomes a split view with waiting / in progress / closed boxes by who wrote last, the longest wait first, type filters, quick replies and "send and close".
- **Database:** the admin inbox needs `database/feedback_admin_inbox.sql`. It adds one read-only RPC; tables and the existing RPCs are untouched. Until it is run in Supabase, only the admin inbox shows a message naming the file; everything else works.
- Changed against 2bf22fd: 22 files; new: 18 (listed in the manifest). No Wrangler config, Secrets or cron changes.
- Archive SHA256 `0bb3e866b02b5e801ee90271a78dbc93c048a2c58241ec545a525b16b753c8fc`; manifest SHA256 `6d6644e998088460d8c2c005515ab34a6c636e26a6c0acbf422f689e6581d2a2`.
- Checked on the extracted package: lint, `tsc -p tsconfig.cloudflare.json`, Cloudflare build, preflight, Cloudflare/feedback/document tests (46 pass). Work source: unit suite 283 pass with the same 5 known failures; feedback e2e 6/6. Full e2e: 46 pass / 42 fail, against 39 pass / 47 fail for 2bf22fd on the same machine; no test fails that passes on 2bf22fd (the two landing tests now look for the sign-in links).
- Rollback: restore the three release files of 2bf22fd.
