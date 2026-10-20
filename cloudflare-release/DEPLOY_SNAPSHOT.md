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


## Phone fixes and the Pro plans page at the owner's prices - 2026-10-20

The owner approved after the preview ("deploy"; chose "ทุกอย่างตามพรีวิว" knowing that new Pro purchases stay closed until Stripe charges the new prices).

**Phone overview**
- Pulling down no longer separates the terracotta bar from the card (`overscroll-behavior-y: none`; the backdrop carries on upward).
- Large amounts keep the card's layout and show every digit, only smaller (`useFitFigures.ts`).
- The overview chart's axis uses short labels (฿180M).
- The phone menu section "LINE AI Pro" also opens the Pro package page.

**Plans page**
- One Pro card: a large official mascot, the price as the main figure, the 4 launch benefits (the LINE AI chat is marked เร็ว ๆ นี้), then the button. The Free card is gone from this page only; the Free tier is unchanged.
- Prices come from `shared/proPricing.ts`, which the plans page, ProPromoModal and the landing read:
  - ฿159 per month.
  - ฿849 for 6 months: average ฿141.50, saves ฿105 (11%) against paying monthly.
  - ฿1,490 for 1 year: average ฿124.17, saves ฿418 (22%), "คุ้มที่สุด".
- **Checkout is closed (`PRO_CHECKOUT_OPEN` all false).** The billing API still charges the earlier monthly offer (฿199 for 3 cycles, then ฿249; it refuses any other Stripe Price), and there is no 6-month or yearly price. Every buy button reads "เปิดรับชำระเร็ว ๆ นี้", disabled.
- These still work and charge nothing new: existing subscribers' "จัดการการสมัครสมาชิก" (Stripe portal) and the guest sign-up.
- No change to Stripe, webhooks, entitlements, the Free tier, crons or Secrets.

Changed against de31a95: frontend/src/app/App.tsx, frontend/src/features/billing/PlanMascot.tsx, frontend/src/features/billing/PlansTab.tsx, frontend/src/features/billing/ProPromoModal.tsx, frontend/src/features/billing/plans.css, frontend/src/features/dashboard/IncomeExpenseChart.tsx, frontend/src/features/marketing/saas/SaasLanding.tsx, frontend/src/features/mobile/MobileHome.tsx, frontend/src/features/mobile/mobile.css, frontend/src/features/mobile/mobileNavigation.ts, frontend/src/i18n/translations.ts, tests/e2e/billing.spec.ts; new: frontend/src/features/mobile/useFitFigures.ts, tests/e2e/mobile-phone.spec.ts, shared/proPricing.ts, tests/pro-pricing.test.ts.
- Archive SHA256 `bfa5594eb7f2412df5f7eb11d348f784ec0687dacd8bb9c9078a730dfedd621e`; manifest SHA256 `9d3bae4eda0174c9fe0006d53ae557e96ab2e8a76ec18cf71698e7274057e5e1`.
- Checked:
  - Lint, Cloudflare build and preflight on the extracted package.
  - Unit suite 285 pass with the same 5 known failures (`pro-pricing` guards that checkout cannot open while the API charges another amount).
  - billing e2e 8 pass, 2 deferred until checkout opens.
  - Phone, feedback and mobile e2e pass.
- Rollback: restore the three release files of de31a95.


## Plans page: premium Pro card, ฿249 struck, "คุ้มที่สุด" in the corner - 2026-10-20

**Prices.** The owner set the regular price at ฿249 a month (`PRO_REGULAR_MONTHLY` in `shared/proPricing.ts`). Every period shows its promotion against it:
- ฿249 → ฿159: saves ฿90 every month (36%).
- ฿1,494 → ฿849: average ฿141.50, saves ฿645 (43%).
- ฿2,988 → ฿1,490: average ฿124.17, saves ฿1,498 (50%), "คุ้มที่สุด".

The landing page and the Pro promo dialog strike ฿249 too.

**Card.**
- On a computer or an iPad, the price and button sit beside the benefits. The whole card fits on one screen (measured from 1000×630 up, and on iPad). Phones keep one column.
- "คุ้มที่สุด" sits in the card's top-right corner on every screen. It is slightly larger (13px), so the price line stays at the same height for every period, phones included (owner's request).
- Premium styling:
  - Warm hairlines and a single soft shadow.
  - A fine terracotta line on the top edge, and a faint warm panel behind the price.
  - A soft glow behind the official mascot.
  - The price is set like a tag, with a small raised ฿ and the regular price struck beside it.
  - Thin outline icons and a black selector pill.
  - A quiet, inactive "เปิดรับชำระเร็ว ๆ นี้" button.
- Unused old price strings were removed from the translations (one of them said ฿149).

**Releases 4f756d3 and f674b11 are kept.** They changed the login page by patching `Login.tsx` inside `prepare-release.mjs`:
- They removed the Facebook "Soon" badge.
- They removed the LINE sign-in entry and its `/api/liff-config` request.

The same lines are now removed in the source itself, so this `prepare-release.mjs` needs no patch. The login page is the same as f674b11. LINE linking, the LIFF form and notifications are unchanged.

**Checkout is still closed** (`PRO_CHECKOUT_OPEN` all false). Stripe, billing, entitlements and the Free tier are unchanged.

Changed against ea8e4aa: frontend/src/features/auth/Login.tsx, frontend/src/features/billing/PlansTab.tsx, frontend/src/features/billing/ProPromoModal.tsx, frontend/src/features/billing/plans.css, frontend/src/features/marketing/saas/SaasLanding.tsx, frontend/src/features/marketing/saas/saas.css, frontend/src/i18n/translations.ts, shared/proPricing.ts, tests/e2e/billing.spec.ts, tests/pro-pricing.test.ts.
- Archive SHA256 `fa9345b32f2766b17cc6d71741eed392fafa2da7840110e0d2fd342ce928fea8`; manifest SHA256 `50d3fefe82a541396c27d8b7af3d5a96bc0f6fd1c0f4596e5edae86565c96ed8`.
- Checked:
  - Lint, the Cloudflare build and preflight on the extracted package.
  - Unit suite: 285 pass, with the same 5 known failures.
  - Billing and phone e2e: 11 pass, 2 deferred.
  - Full e2e: 55 pass. 34 fail, and the same 34 fail on the pkg10 source.
- Rollback: restore the three release files of f674b11.

## Live prepaid card and PromptPay — 2026-10-20

Checkout is now enabled on the production Worker. This supersedes the closed-checkout notes above.

| One-time total (THB) | Pro entitlement | Methods |
| --- | --- | --- |
| 159 | 1 calendar month | Card, PromptPay |
| 849 | 6 calendar months | Card, PromptPay |
| 1,490 | 12 calendar months | Card, PromptPay |

- Live Stripe account: Vispark (`acct_1TeotMC4uZ5mcDl1`), explicitly confirmed by the owner.
- Production version: `e85104c0-a1a8-4db1-aa48-c1298ea24e7a`, deployed at 100%.
- Origin: `https://kraroktunngern.cashsquirrelapp.workers.dev`.
- Source archive: 573 files, 20,579,566 bytes; SHA256 `31439c67d3d514895dbb223670541a15bfb294a7d554801d29b266a2efe8375c`.
- Server-controlled prices, quantities and durations; authenticated owner binding; canonical Stripe validation before entitlement fulfillment; replay-safe fulfillment and checkout creation.
- No automatic renewal for these offers. Existing recurring subscribers keep the existing portal flow.
- Unpaid pending checkouts can be canceled to change the package or method. A paid/cancellation race is reconciled against Stripe before releasing an order.
- Polling and payment mutations use separate rate-limit buckets. Payment-confirmation notices appear only after a completed-checkout redirect.
- The prepaid database migration was applied and its RLS/RPC permissions verified in the production SQL editor. Do not reapply it blindly; reconcile migration history as described in PREPAID_BILLING.md.
- Card and PromptPay are enabled in the live payment-method configuration. The owner authorized and completed Stripe verification for Payment Method Configurations Read on the existing restricted key.
- Webhook refund/dispute handling is included. OAuth, domain access, cron schedules and secret values were not changed by this release.

Validation:

- 21 focused payment/HTTP/database tests passed, including tampered requests, duplicate fulfillment, owner isolation, cancellation races and calendar-month boundaries.
- 15 billing browser tests passed, including all six plan/method combinations and pending-order cancellation.
- Lint, TypeScript/Cloudflare checks, production build and packaged-source verification passed.
- The wider unit suite retains five pre-existing notification/monthly-report failures; this release does not claim a completely green unrelated suite.
- Created all six real live Checkout combinations through the app. Stripe API confirmed each exact THB amount, month metadata, `mode=payment`, and the intended sole payment method (`card` or `promptpay`).
- Visually inspected hosted card checkout at all three prices and hosted PromptPay at THB849, plus the app's QR modal for each period.
- Canceled all six QA sessions through the app. Stripe confirmed all six `expired` and `unpaid`. No card details were entered, QR payment submitted/scanned, or money charged. A real paid transaction and real paid webhook fulfillment have not been exercised.

Operational instructions and the setup/audit script are documented in `PREPAID_BILLING.md`. `prepaid-billing.patch` is the readable source diff against the previously packaged production release.

## Separate admin Pro revoke and ban — 2026-10-20

- Production Worker version `0aca6044-2692-4364-bda6-785be60a2ce5`, 100% traffic.
- The user management panel offers Grant Pro, Revoke Pro, Ban Pro and Unban Pro. Revoke permits repurchase; ban blocks both payment methods until an explicit unban. Unban does not restore past Pro access. These actions do not refund payments or ban account sign-in.
- Existing revocations from the old two-state UI are converted to repurchasable Free accounts. Admin grants are preserved.
- The service-only transactional RPC shares the billing advisory lock, checks the current admin role and blocks changes during pending/unknown payment outcomes, ongoing recurring billing or account closure. The API retains CSRF and account-binding checks.
- Entitlement reset time prevents old payments/refunds and legacy entitlement sources from restoring revoked access or extending a later package. A new paid order restores access normally.
- Audit table has RLS, no browser access, and nullable identity references on account deletion so audit history does not block normal deletion.
- `20261020155537_admin_pro_controls.sql` applied via the production SQL editor. It is not recorded by the CLI migration history. Do not reapply its legacy-state conversion after new explicit bans are created.
- Final archive: 578 files / 20,614,964 bytes; SHA256 `74b232ec514e4e7146f7f2c7d6bcd02a392d05c55810cb2b5736f6d58e61a5d0`.
- Validation: 29 targeted payment/admin HTTP and database tests (28 combined plus the added account-deletion audit test), 17 browser tests, 16 Cloudflare/security checks, lint and build. Database actions also tested under `service_role`. Browser admin mutations use simulated accounts; no real customer was granted or banned for testing.
- The global signup trial policy remains unchanged pending clarification of the user's statement about no trial/test account. Revoking or banning an individual account suppresses its initial trial.
- Readable source delta: `admin-pro-controls.patch`; operations: `ADMIN_PRO_CONTROLS.md`.

## Inline card and PromptPay checkout — 2026-10-20

- Production Worker version `b979bde6-6f19-4bd7-9d44-67b3e89e16e0`, deployed at 100% after inline version `345c036a-4a2a-41b5-ba91-e8e57fc9ec56` (last change keeps the loading button stable).
- New purchases open Stripe's secure embedded Checkout inside the application's payment dialog. Card data is sent directly to Stripe. PromptPay generates its QR in an embedded overlay; the top-level URL remains the app. The existing recurring-subscription portal is preserved.
- The unpaid-order banner and cancellation button are removed. Same selection resumes; a different period/method or old hosted checkout is safely expired and reconciled before replacement. Unknown create outcomes replay the original request and idempotency key. A paid/processing or uncertain expiration cannot be discarded.
- Amounts remain THB159/1 month, THB849/6 months, THB1490/12 months. No recurring renewal. Only canonical verified Stripe evidence fulfills Pro; UI completion only polls the database. Admin ban/revoke controls are preserved.
- Official Stripe SDK updated to 23.0.0 (API 2026-09-30.endive); official Stripe.js loader added. Vispark's existing public key is configured in the Worker. Secret values, restricted-key permissions, webhook destination, database schema, domain access and cron schedules are unchanged.
- Validation: 42 targeted payment/admin/legacy-billing tests (41 combined plus the additional unknown-create replay test), 18 billing/admin browser tests, 16 security/Cloudflare tests, lint, production/Cloudflare builds and archive verification. Three focused browser tests were rerun after the final loading-button adjustment. No claim of a fully green unrelated suite.
- Production browser verified inline card at THB159 and THB1490, PromptPay at THB159 and THB849, and a real PromptPay QR rendered on our origin. No card data entered, QR scanned, or money paid. Paid-event behavior was exercised with simulated signed webhooks, not a real charge.
- Live QA sessions: monthly card `cs_live_a1jONPWIL6oX0NcsrBi7qFLO8YLChJBo5NSLLFEloBy5ZoXv8NDdOkqGaf`; monthly QR `cs_live_a1Bl0QltOsilIOehPSNv3yd8oOiWzv1cAIV4k7Ic2oTcrMWo64xQu9bQcp`; half-year QR `cs_live_a1gVl8jUFMFPTPdcKtzlDjT3QOWjnVvsbcPZyqFFEQkuQzsINVJgLoYyGt`; annual card `cs_live_a1QjuM0vEDgIF8OCZUWzzaGO8ihnJyRq6EHz7HXtdaH77k8UNyp1Jml74I`. Each switch expired the preceding session; the last unpaid session uses the normal 45-minute expiration and requires no customer cancellation.
- Final packaged source: 580 files, 20,625,844 bytes; archive SHA256 `db1f977d7431bf28ecb6633a555499e332898ff1db03fc7a1035813e37c6dfcb`.
- Readable source delta: `inline-checkout.patch`; operations: `INLINE_CHECKOUT.md`.

## 2026-10-21 — direct PromptPay QR in the app

- Production version `dde32a54-ddf3-46b3-8e1e-e7400520cd8e` at 100%, following `15fcbb07-1303-4a1c-aadb-32a275318620`. QR-only flow uses canonical PaymentIntents; embedded card flow remains available. Same existing daily crons and encrypted secrets.
- Source snapshot: 584 files, 20,669,496 bytes; archive SHA256 `c3970983d2bc4b61f77eeca5840b6ea5f0620b337d7ff06c0283042006721e38`. Human-readable changes in `direct-promptpay.patch`; flow/security/deployment details in `DIRECT_PROMPTPAY.md`.
- Migration `20261020165518_direct_promptpay.sql` applied once through production SQL editor. Live read-only validation: intent column true, RLS true, anon prepare false, authenticated finish false, service_role prepare true, security_definer false. No payment or subscription entitlements were manually changed.
- User approved Payment Intents/Payment Methods write on the existing restricted runtime key and personally completed Stripe identity verification. Saved permissions re-read. Existing production webhook expanded from 14 to 17 events, adding PaymentIntent succeeded/payment_failed/canceled; endpoint/signing secret/API version unchanged.
- Live browser QA on the existing test customer `cus_VTcB33bXS3nKfB`: all three prices showed actual QR images directly on `/plans/kraro-app`, without an iframe, extra Continue step or leaving the origin. An ingress polling-budget collision found in QA was fixed with separate read/mutation budgets and a regression test. Closing causes no unpaid-order banner.
- Stripe verified: monthly `pi_3USgZOC4uZ5mcDl11OnHYbo1` THB159 canceled/unpaid when switched; six-month `pi_3USgc3C4uZ5mcDl10bOCj61K` THB849 canceled/unpaid when switched; annual `pi_3USgcWC4uZ5mcDl11qGRRbQi` THB1490 requires_action/unpaid, months12. All `amount_received=0`. No scan, card details or real charge performed.
- Validation: 49 targeted unit/HTTP/SQL/payment/admin tests (48 combined before polling-budget addition; 19 HTTP tests including the new regression rerun after), 16 Cloudflare/security checks, 21 billing/admin E2E tests, typecheck, production build and archive verification. Payment settlement/refund evidence is simulated in automated tests, not a live end-to-end charge.
- Proof screenshots retained locally: `krarok-direct-qr-159.png`, `krarok-direct-qr-849.png`, `krarok-direct-qr-1490.png`, `qr-webhook-ready.png` under the task visualization folder.
