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


## Phones in one terracotta mood; a ticket-style Pro card - 2026-10-21

Built on top of 4ac218f (prepaid Pro, admin Pro controls, embedded checkout, direct PromptPay QR). Those files are unchanged here; only the files listed below differ.

**Phones (below 744px; computers and iPads are unchanged except the Pro card).**
- Every page has the overview's terracotta header in one piece with the top bar: งาน, ปฏิทิน/ไทม์ไลน์, เมนู, and each page the menu opens (เงินรอรับ, รายจ่าย, เอกสาร, แพ็กเกจ Pro, ตั้งค่า and its pages, บอกเรา, เป้าหมาย, 50 ทวิ).
- On scroll, the title and the way back fade out and the page's summary box closes into a bar pinned under the top bar (`MobilePageHero`, built on the overview's `useCollapsingCard`).
- งาน gets a summary card (still to receive, by stage) and a receive button on each card.
- The bottom bar's fourth slot is ปฏิทิน. เงินรอรับ moved to the menu, and the menu is reordered (01 เงินรอรับ … 05 บัญชีและการตั้งค่า). Reminders sit in 04 LINE AI Pro, and the LINE logo marks that section.
- Timeline: date rail and event cards. The month card shows only เงินรอรับ.
- Expense rows say ประจำ or ทั่วไป.
- Orange buttons carry white type.
- Confirmations are a centred card with the mascot (a new held accessory, `hold-cross`, on the existing raised arm; the character is not redrawn).
- The job sheet from the timeline is a calm statement-style sheet.
- The 50 ทวิ reminder is hidden until that feature launches, except for full-access accounts and accounts that already turned it on.

**Pro card (all screens).**
- Terracotta period switch and badge.
- A ticket look: a dashed tear line with notches.
- Benefits centred vertically.
- Payment logic from 4ac218f is untouched.

Changed against 4ac218f: frontend/src/app/App.tsx, frontend/src/components/mascot/Mascot.tsx, frontend/src/components/ui/CustomDialog.tsx, frontend/src/features/billing/plans.css, frontend/src/features/calendar/CalendarTab.tsx, frontend/src/features/calendar/JobPeekSheet.tsx, frontend/src/features/feedback/feedbackChat.css, frontend/src/features/goals/SplitTab.tsx, frontend/src/features/incomeExpense/IncomeExpenseTab.tsx, frontend/src/features/jobs/JobsTab.tsx, frontend/src/features/mobile/MobileChrome.tsx, frontend/src/features/mobile/MobilePageHero.tsx, frontend/src/features/mobile/mobile.css, frontend/src/features/mobile/mobileNavigation.ts, frontend/src/features/mobile/useCollapsingCard.ts, frontend/src/features/mobile/useFitFigures.ts, frontend/src/features/receivables/ReceivablesTab.tsx, frontend/src/features/settings/SettingsParts.tsx, frontend/src/features/settings/SettingsTab.tsx, frontend/src/features/vault/Wht50Page.tsx, tests/e2e/app.spec.ts, tests/e2e/billing.spec.ts, tests/e2e/mobile-phone.spec.ts.
- Archive SHA256 `650ce1ac91e1a9205378a8b48ea400bfa8bb99e0f8eceee8a9f077b0d7790513`; manifest SHA256 `e1d65912d6d452a1f7774f8d9e51328b2e862dafd7723422e9885c4fef0c68bc`.
- Checked:
  - Lint, the Cloudflare build and preflight on the extracted package.
  - Unit suite: 325 of 330 pass, with the same 5 known failures.
  - Full e2e compared against the 4ac218f source (see the release note in chat).
- Rollback: restore the three release files of 4ac218f.

## 2026-10-21 — custom card and explicit optional renewal

Production version 69f87583-dcbe-4a83-8978-3fbd8c214718 follows initial custom-card version 8e538d3a-4257-4149-9ba5-00d65bcec4c7. KRAROK_CUSTOM_CARD_ENABLED=true; direct QR stays enabled. Existing encrypted secrets and two daily cron schedules are unchanged.

Own themed card modal uses secure Stripe Elements, separate save-card and unchecked renewal consent, exact three package prices/cadences and native Stripe Billing. Paid invoice evidence grants only the verified period; failed renewal never extends access. Stop-renewal preserves paid time, immediately stopping retrying delinquent subscriptions.

Migration 20261020172734_custom_card_renewals.sql applied once and RLS/service-only access verified. User approved Subscriptions write on the existing runtime restricted key, saved and read back. Three new recurring prices were created on the same product; no subscriptions or charges were created by QA.

All three actual card UI amounts and default unchecked renewal were inspected. Stripe readback verified unpaid payment-mode and subscription-mode Elements Checkouts at 159/849/1490 THB, subscription=null; replaced sessions expired. During QA, stalled requests motivated explicit Stripe fetch transport and a 20-second timeout. After that change the remaining plan switches succeeded. 27 targeted payment/SQL/HTTP tests and 16 Cloudflare/security checks rerun and passed; typecheck/build passed. 23 distinct billing UI scenarios passed across runs. No real payment, stored-card reuse or full native billing settlement was tested.

Detailed operations and evidence: CUSTOM_CARD_RENEWALS.md. Readable source delta: custom-card-renewals.patch.


## Combined release preserving concurrent mobile UI — 2026-10-21

Merged remote commit 6690dde (terracotta mobile UI and ticket-style Pro card) with card-payment commit 9ba60dc using a three-way merge of the actual archived source. No source conflicts remained. Incoming changes contain no backend payment changes. User explicitly approved publishing the combined version after automatic deployment review requested confirmation.

- Production runtime: 89f6b73d-4129-4d0e-9cc1-90fe4e181167.
- Archive SHA256: c41a4e1db30d88612f6cfffd5dea0a22cee5f1b7bc78e3cd6fc612c27b9c54c5 (593 source files).
- Combined source passed typechecking, 16 Cloudflare/security checks, production build, archive verification and 4 focused browser tests: mobile Pro readability, all package prices, separate save/renewal consent, and cancellation preserving the paid end date.
- Daily triggers, encrypted secrets, payment catalog and already-applied database migration remain unchanged. No actual card payment was submitted.
- custom-card-renewals.patch now describes the card payment changes relative to 6690dde, preserving its mobile UI.


## CI card fonts and button-based save consent — 2026-10-21

User requested matching the website CI and removing the save-card checkbox. Stripe Elements now loads the same IBM Plex font families as the app and reads its color tokens. The save checkbox is removed; the confirm button explicitly states payment plus card saving, with adjacent purpose disclosure. Saving occurs only upon customer confirmation. Renewal remains separately unchecked; no existing customer was opted into recurring charges.

- Production version: 57898943-29a0-4a55-a1a2-54c62aadf340.
- Archive SHA256: 3b6f0a0b1244478adb263bb457d1702aa226777f06c2f94012d3424e74b73572 (593 files).
- Saved-card disclosure version/text are carried in immutable request metadata. Old unpaid requests without this version are replaced before reuse; unpaid metadata is not proof of consent.
- Validation: typecheck and production build; 16 Cloudflare/security checks; 27 payment/SQL/HTTP tests; 3 focused UI tests covering mobile readability, no save checkbox and explicit button consent, and stop-renewal preserving paid time. No actual card data or real payment used.
- No database migration, Stripe permission, price, tax, secret or cron change. Source delta: card-ci-save-consent.patch.


## Responsive renewal selection — 2026-10-21

- Production version: 10f87540-49ba-442e-aaf6-79f0ba7adb8f.
- Archive SHA256: 74df26e67c7943f8cdc06007e9c7b7fc9df4d34d91edb30196d09e5ef968c32e; 593 source files.
- Checkbox updates locally without waiting for the server. A 350 ms debounce coalesces changes. Updates serialize; older responses cannot overwrite the displayed latest choice. Payment stays blocked until Checkout mode and ready fields match the latest selection. Errors retain the selection and require retry/reconciliation. Late responses do not reopen a dismissed custom card dialog.
- Validation: typecheck, production build, 16 Cloudflare/security checks and 4 focused browser tests pass. Deliberately held responses confirm checkbox changes within a 250 ms assertion budget while the request remains unresolved, no parallel writes, and only the final matching session can be confirmed. Failed preparation and retry also pass. This assertion is local test evidence, not a universal latency guarantee.
- No backend payment, database, price, permission, consent default, secret or cron changes. No actual card or bank payment submitted. Source delta: card-responsive-selection.patch.

## Checkout loading and parallel preparation — 2026-10-21

- Production version: e1276fcf-5775-48b8-a606-b7f92fe61b8d.
- Archive SHA256: f0fb886cc59976d41cb80374323b37b77da8bc69db795c7d2686e8b98fb84fea; 593 source files.
- Independent rate/eligibility, catalog/pending and existing-customer/subscription reads run concurrently. Successful expiration uses Stripe's canonical response; unknown/failed outcomes retain retrieval and payment-race handling. Unpaid resume avoids duplicate order retrieval.
- Stripe SDK preloads during server preparation. Fields and confirmation actions load concurrently, but payment remains disabled until both are ready. Immediate package/amount dialog can be dismissed safely without a late response reopening it.
- Sanitized live server timings: unpaid resume 1,094 ms; replace monthly with 6-month session 2,648 ms. These are individual server samples, not whole-page timing guarantees or before/after comparisons.
- Validation: TypeScript, production build, 16 Cloudflare/security checks, 29 payment/SQL/HTTP cases across targeted runs, 6 browser scenarios including delayed API/actions, early dismissal, renewal rapid changes/retry, CI/disclosures and stop-renewal. No real card details or payments submitted.
- No prices, database migration, key permissions, secrets, consent defaults or daily schedules changed. Readable source delta: card-checkout-loading.patch.
- Final live UI verification: the package/amount preparation dialog was visible in the immediate post-click snapshot, and real Stripe fields subsequently loaded with the pay action ready and auto-renew unchecked. Evidence: krarok-checkout-immediate-loading.png and krarok-checkout-speed-ready.png in the thread's visualization folder.
- Residual provider variance: a later final-version checkout measured 7,633 ms server time, with authentication alone accounting for 4,324 ms; other tail samples were 3,881 and 2,948 ms. Authentication/revocation checks were intentionally retained, so this release does not promise every checkout opens fully in 1–3 seconds. The 1,094/2,648 ms earlier samples must not be presented as a universal upper bound. No matched pre-release latency baseline was recorded.

## Google Pay domain registration — 2026-10-21

Reported symptom: Google Pay selected in the custom Payment Element, no card input fields, and the app's generic confirmation-exception message. Missing inline card fields are expected for a wallet; the Google wallet sheet handles card selection. The old catch-all message alone does not prove the precise error.

Stripe live account Vispark (acct_1TeotMC4uZ5mcDl1) initially listed only js.stripe.com, checkout.stripe.com and buy.stripe.com as payment-method domains. Registered the actual payment-page domain kraroktunngern.cashsquirrelapp.workers.dev via the Stripe Dashboard after the connector write repeatedly returned an authentication retry. Readback confirmed pmd_1USiUjC4uZ5mcDl1cwy08BKg, enabled=true, google_pay.status=active. No permissions, keys, source code, prices, subscriptions or charges changed.

This fixes a documented wallet setup prerequisite. A successful live Google Pay authorization/charge was not attempted; the customer must retry in their browser to confirm the complete payment flow. Do not claim the previously observed confirmation error has been fully reproduced or its only cause proven.

## Native Google Pay confirmation path — 2026-10-21

The customer reproduced the generic confirmation exception after domain registration. Its original exception was swallowed, so domain registration alone was not a verified fix. Replaced the wallet tab flow with Stripe Express Checkout Element mounted from the same Checkout Session SDK as the card form. Google Pay/Apple Pay use the provider's native wallet button and pass expressCheckoutConfirmEvent to actions.confirm; the traditional card button remains separate. Wallets are disabled in the traditional Payment Element to prevent an empty duplicate tab. Unavailable wallets show an explanation while retaining card payment.

Both paths retain the selected session, explicit card-saving disclosure, unchecked renewal default, preparation/reconciliation gates and expiry checks. A synchronous lock prevents duplicate confirms; stale wallet events are rejected. Failure releases controls without showing provider payloads or secrets. Entitlements remain server/webhook-driven; no backend, price, permissions, CSP, database, secrets or cron changes.

Validation: TypeScript and 16 Cloudflare/security tests, production build, archive verification, and 14 browser scenarios passed. Wallet boundary simulations cover every 159/849/1490 THB package with renewal off/on, correct native event, duplicate confirmation, thrown-error retry, unavailable wallets, existing card/renewal/latency behavior. Initial test run overlapped a build and included stale/deleted assets; the complete rerun after build passed. These simulations do not prove real Google wallet authorization or settlement. No actual payment or card-saving action performed.

Archive SHA256: 372d3144301077d07de513ef06f374097395906a35c4a0ce3a6ced5573ea33b1 (593 files). Readable source delta: google-pay-confirmation.patch.

Published production version: 3348512c-b81e-422e-8416-b47164c61d42. Existing daily schedules retained.

Live verification: refreshed the production plans page and observed real Stripe card fields plus the native black “ชำระด้วย G Pay” button, with renewal unchecked. No duplicate Google Pay tab remains. In the in-app QA browser, clicking the wallet button did not produce an observable Google wallet sheet or a console error; real Google wallet authorization is therefore still unverified. Asked the customer to test only opening the native wallet sheet in their Chrome, without confirming payment. Evidence: krarok-google-pay-native-button.png in the thread visualization folder. Do not report end-to-end payment success from the mocked tests or rendered button.

## Logo01 symbol with the original Thai wordmark — 2026-10-21

The requested result is the new tail symbol beside **กระรอกตุนเงิน**, retaining the original Thai type treatment and colours. The character remains a mascot. Shared app logos, standalone LINE form, account email header, legal pages, favicons/PWA icons and public product screenshots were updated. The separate about.krarok.com public-information site uses the same symbol and Thai name. See BRAND_LOGO01.md and logo01-branding.patch.

Final app version: 0bb0d541-69c8-4dc8-b3d0-64d308e69840. Public-info version: d6276517-3c91-48ec-92fd-097b1f9c7e41. Archive: 608 files, 18,920,974 bytes; SHA256 32d822e00cf00193677aa43bfadbf433fbf763a4894bb98a712d10b38239c700.

An initial deployment used the kit's English horizontal wordmark; the owner corrected this during the turn. That intermediate release was superseded by the versions above and is not the requested final state. Live browser verification confirms the original Thai name with the new symbol on the app dashboard and the public-information site. The authenticated QA session initially stayed in its loading skeleton before completing; no new runtime exception was observed. No payment, permission, database or schedule changes.

Validation: TypeScript, Cloudflare checks, 16 security/scheduled tests, production build and packaged-source verification passed. Fixture screenshots reviewed for desktop/mobile and light/dark themes, with no observed page errors or horizontal overflow. Live proof: krarok-thai-logo-live.png in the task visualization folder.


## Computer and iPad parity; a tidy card payment dialog with its font - 2026-10-21

Built on top of 94de852 (new tail symbol, Thai wordmark kept). Those files are unchanged here; only the files listed below differ.

**Computers and iPads (744px and up), designed for the wide layout rather than copied from phones.**
- Jobs table:
  - A receive button sits beside ⋯ on every unpaid job, labelled รับมัดจำ or รับเงิน from 768px. The full action is in the tooltip.
  - Client and payment columns show from 1280px. Below that, the client sits under the job name and the payment chip under the status.
- Settings: notifications moved into "LINE AI Pro · การแจ้งเตือน" beside LINE.
- Confirm dialogs: the official mascot sits beside the message (same poses as on phones, the character is not redrawn).
- A job opened from the timeline is a centred panel: value, received and owed with a bar, facts in two columns, actions on the right.
- Dark mode primary buttons: white type on #E65F2B.

**Card payment dialog (all screens).**
- One type scale. The amount sits in a summary box with the next-round note. A divider separates card fields from wallets.
- Stripe field labels are regular weight.
- Consent text, disclosure, button labels, test ids and payment logic are unchanged.

**CSP:** `connect-src` gains `https://fonts.googleapis.com`. Stripe.js fetches the font stylesheet from the host page, and the old policy blocked it, so the card fields fell back to a system font. Same change in `_headers`, `cloudflare/worker.ts`, `backend/src/http/securityHeaders.ts` and `vercel.json`.

Changed against 94de852: backend/src/http/securityHeaders.ts, cloudflare/worker.ts, frontend/public/_headers, frontend/src/components/ui/CustomDialog.tsx, frontend/src/features/billing/CardPaymentModal.tsx, frontend/src/features/calendar/JobPeekSheet.tsx, frontend/src/features/jobs/JobsTab.tsx, frontend/src/features/settings/SettingsTab.tsx, frontend/src/index.css, tests/e2e/desktop-parity.spec.ts (new), vercel.json.
- Archive SHA256 `585ee4a6af30fc3824dda67301e81cfbd04bbf581748c8101abca983709fb866`; manifest SHA256 `25674e85d9b987659b8f3d374faf65cb68373ec3d09cfc0b374b7393cece3bf7`.
- Checked:
  - cloudflare:check (lint, typecheck, 16 tests), the Cloudflare build and preflight on the extracted package.
  - Unit suite: 335 of 340 pass, with the same 5 known failures.
  - Billing and computer/iPad e2e: 41/41.
  - App e2e: no new failures against the 94de852 source.


## Supabase timeouts; easier passwords; renewal-only card dialog; clear tab icon - 2026-10-21

Built on top of d717a19. Owner approved ("ดีพอย").

**Slow loading (owner reported long skeleton screens).**
- Findings:
  - The database is 19 MB of 500 MB.
  - In pg_stat_statements no statement exceeds 2.8s.
  - Yet Worker requests sometimes waited 10–60s on Supabase with almost no CPU.
- New `backend/src/config/supabaseFetch.ts`:
  - It is the `global.fetch` of every supabase-js client, including the inline auth client.
  - Each request gets a deadline for response headers: read-only RPCs 3s, GET/HEAD 6s, storage GET 20s, writes 25s, storage writes 60s.
  - Reads are sent once more after a timeout or a dropped connection. The read set is GET/HEAD plus `cashflow_rate_limit`, `cashflow_session_active`, `cashflow_groups_snapshot`, `cashflow_profile_get` and `cashflow_group_detail`.
  - Writes, auth token calls and `cashflow_login_lock_status` are never repeated.
  - Logs carry only the method and a coarse route.
- `requireUser`: an `AuthRetryableFetchError` (a Supabase Auth timeout or 5xx) now answers 503 and keeps the session cookie. Before, it signed the person out.
- The browser's session check retries /api/auth twice on 5xx or network errors.

**Passwords (owner: the rules were too strict).**
- `shared/passwordPolicy.ts` now requires 8–128 characters with at least one letter (Thai or English) and one digit.
- Checklist and server messages updated.
- "Other sign-in options" is now translated.
- Note: Supabase Auth's own Password Requirements setting must not be stricter, or signup returns `weak_password`.

**Card dialog (owner: ticking consent reset the card fields).**
- One-time purchases are PromptPay QR, so card checkout opens as the renewal: `handleUpgrade` defaults to `autoRenew: true`.
- The consent checkbox is unticked by default and only gates payment (button, Google Pay, confirm). Ticking it no longer swaps the Stripe session, so typed card data stays. Verified with Stripe's real test-mode fields.
- Prices and consent text are unchanged, and recurring prices exist for all three periods. billing.spec was updated for this flow.

**Look.**
- The tab icon is a transparent PNG/ICO/SVG of the existing tail symbol, tightly framed. The old favicon.ico had an opaque white square. New file names avoid cached icons. The root /favicon.ico is replaced too.
- The mascot tiles are removed on the empty receivables page and the overview's follow-up card.

Changed against d717a19: backend/src/config/supabase.ts, backend/src/config/supabaseFetch.ts (new), backend/src/handlers/auth.ts, backend/src/handlers/password-reset-line.ts, backend/src/security/session.ts, frontend/index.html, frontend/public/brand/logo01-v1/favicon-clear{.ico,-32.png,-192.png,.svg} (new), frontend/public/favicon.ico, frontend/public/{liff-add,privacy,terms}.html, frontend/src/app/App.tsx, frontend/src/features/auth/Login.tsx, frontend/src/features/billing/CardPaymentModal.tsx, frontend/src/features/dashboard/DashboardTab.tsx, frontend/src/features/receivables/ReceivablesTab.tsx, frontend/src/i18n/translations.ts, frontend/src/services/auth.ts, shared/passwordPolicy.ts, tests (billing.spec, card-choice.spec, session-retry.spec, password-policy, supabase-fetch, supabase-slow-session).
- Archive SHA256 `8793a94e5275daa2c67bdb77738dc5c81f58900774d1e2329c4e96aff0acf813`; manifest SHA256 `dbab069a08ea06eaa4fd2290985a675f9af6464005c35b013c9d47cdcb3a546a`.
- Checked:
  - cloudflare:check (lint, typecheck, 16 tests), the Cloudflare build and preflight on the extracted package.
  - Unit suite: 348/353 with the same 5 known failures.
  - Billing and card e2e: 34/34.
  - No new app/phone e2e failures against the live source.


## Smaller goal pictures - 2026-10-21

Built on top of 0e14635. Owner approved shrinking existing pictures and the release ("ดีพอย").

- Goal pictures are shown at 60px at most, yet one account stored 1,126 kB + 195 kB + 55 kB of them, downloaded on every visit.
- New uploads keep 256px: `imageFileToDataUrl(file, { maxSide: 256 })`. Document logos keep 960px.
- Existing pictures over 100 kB are re-encoded once to 256px webp (`shrinkImageDataUrl`) after the person's own data loads, then saved through the normal sync. Group workspaces are skipped. Goals and other data are never deleted.

Changed against 0e14635: frontend/src/app/App.tsx, frontend/src/features/goals/SplitTab.tsx, frontend/src/services/images.ts, tests/e2e/goal-image-shrink.spec.ts (new).
- Archive SHA256 `6bc7036cd106fd10993349cb1ab627729cc3ef28c3f091f78166e7d44807da07`; manifest SHA256 `3ad209cd33dbd7f1f0e5046afc8e2fca6a0e2cf203e4ec994550a86c633c9131`.
- Checked:
  - cloudflare:check (16 tests), the Cloudflare build and preflight on the extracted package.
  - Unit suite: 348/353 with the same 5 known failures.
  - The new e2e test passes.
  - No new e2e failures against the live source.


## Owner's renewal consent wording (consent v2) - 2026-10-21

Built on top of 4e1bf16. Owner supplied the sentence and approved the release ("ดีพอย").

- New wording, in `shared/cardConsent.ts`:
  - Monthly: "ยินยอมต่ออายุ Pro อัตโนมัติ ฿159/เดือน จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก".
  - 6 months: ฿849/6 เดือน. 1 year: ฿1,490/ปี.
- Versions:
  - `CARD_CONSENT_VERSION` is now `krarok-card-20261021-v2`. New checkouts record v2 with the exact text in `consent_text`.
  - `ACCEPTED_CARD_CONSENT_VERSIONS` keeps v1, so `assertAutoSubscription` keeps renewing subscriptions that agreed to the earlier wording. A subscription's consent version must equal its own order's.
  - Requests still accept only the current version.
- An open renewal order prepared under an older consent version is replaced (prepaidBilling), so payment always follows the wording on screen.
- Prices, Stripe objects, Secrets and crons are unchanged.

Changed against 4e1bf16: backend/src/services/cardRenewals.ts, backend/src/services/prepaidBilling.ts, shared/cardConsent.ts, tests/card-renewals.test.ts, tests/e2e/billing.spec.ts, tests/e2e/card-choice.spec.ts.
- Archive SHA256 `da388e48a4101ff8a3f2d9b7fef4424b0b942ebc70e5e811144d6400fc033128`; manifest SHA256 `d75bc46db2f8bbba9f969454252dccd298e0b5d162d855306345eaec41dbea6e`.
- Checked:
  - cloudflare:check (16 tests), the Cloudflare build and preflight on the extracted package.
  - 27 payment unit/HTTP tests, including v1 renewals still valid, an unknown version refused, and the exact wording per period.
  - Billing and card e2e: 34/34.
  - Unit suite: 349/354 with the same 5 known failures.


## Goals page "Liquid Amber" on computers and iPads (admin-only) - 2026-10-21

Built on top of 677c47d. Owner approved ("ดีพอย").

- Goals stay unreleased. Only accounts with the admin system role see them: a Pro subscription is not enough, and 'split' remains outside PHASE_ONE_FEATURES. They open to everyone only when the owner launches them.
- Redesign of SplitTab's non-phone branch (744px and up) after the owner's reference, kept to the CI:
  - Vault card in a #A63F1B → #E65F2B → #F3B08C gradient with slow glossy waves (reduced motion respected).
  - The tail symbol is solid CI in a white circle. The Thai title is "คลังเงินพร้อมจัดสรร".
  - Frosted-glass plan panel; white pill actions.
  - Status card with the official mascot (pose only).
  - Wider goal rows.
- Every figure, action and handler is the existing one; copy follows the real manual allocation.
- Styles live in `frontend/src/features/goals/goalsAmber.css`, `ga-*` classes only, loaded from App.tsx (unit tests import SplitTab).
- The phone branch is untouched. Screens at 390/375 in light and dark are pixel-identical to 677c47d.

Changed against 677c47d: frontend/src/app/App.tsx, frontend/src/features/goals/SplitTab.tsx, frontend/src/features/goals/goalsAmber.css (new), tests/e2e/goals-desktop.spec.ts (new).
- Archive SHA256 `e7fdf73c59d0933de55cc909e1d2db5055d918b1bc3ea991fa7d8435b6bf5038`; manifest SHA256 `67629e5e8df17b856dea008dd5cb92bb5b0b7d857fbf32af83c803979e28b48b`.
- Checked:
  - cloudflare:check (16 tests), the Cloudflare build and preflight on the extracted package.
  - goal-split unit tests 7/7.
  - goals-desktop e2e 6/6: 1440/1280/768 actions, the empty month, phone actions, and regular/Pro accounts see no goals.
  - Full e2e: no new failures against the live source.


## Account switcher; steady Facebook button - 2026-10-21

Built on top of 0270ef7. Owner approved ("ดีพอย").

**Switch sign-in accounts like Google/Facebook (computer and iPad account menu; phones unchanged).**
- Sessions on this browser:
  - The active session stays in `cashflow-session`.
  - Up to three other signed-in sessions wait in sealed `cashflow-acct-2..4` cookies (`__Secure-`, Path=/api/auth, HttpOnly, SameSite=Lax). Ordinary API calls never carry them.
  - A sealed `cashflow-known` cookie (30 days) lists id, email and name, so an account whose 8-hour session ended still shows and only needs its password.
- New sign-ins go through `adoptSession` (password, unlock, signup, OAuth callback). It keeps the current account aside; a fifth account replaces and revokes the oldest waiting one.
- `GET /api/auth?accounts=1` reads cookies only. POST `switch-account` / `forget-account` sit behind the existing CSRF guard and check the account id.
- Switching re-checks `cashflow_session_active`; a revoked session is dropped with 409 `account_signin_required`.
- Logout revokes every waiting session as well.
- UI:
  - "สลับบัญชี" in the profile menu opens `AccountSwitcher`: switch and reload, re-sign-in with the email filled in, remove from this browser, or "เพิ่มบัญชีอื่น".
  - "เพิ่มบัญชีอื่น" shows sign-in with a back arrow while the current account stays signed in.

**Login:** the provider buttons start from the last answer saved in localStorage, and `.auth-pill` fades opacity. Facebook no longer draws faded and pops in on refresh. The server still refuses a disabled provider.

Changed against 0270ef7: backend/src/handlers/auth.ts, backend/src/security/deviceAccounts.ts (new), backend/src/security/session.ts, frontend/src/app/App.tsx, frontend/src/components/account/AccountSwitcher.tsx (new), frontend/src/features/auth/Login.tsx, frontend/src/index.css, frontend/src/services/auth.ts, tests/device-accounts.test.ts (new), tests/e2e/account-switcher.spec.ts (new), tests/e2e/login-providers.spec.ts (new).
- Archive SHA256 `1b6d6b328dc8cd941855c970309a05d055fb58da2fd41e04ad02a75a86ccd75b`; manifest SHA256 `733441c768b762451c3a276cfc4e10dfc5507864b77934033bb560e3d0cbec63`.
- Checked:
  - cloudflare:check (16), the Cloudflare build and preflight on the extracted package.
  - 11 auth tests, including a forged-origin switch refused with 403.
  - Switcher e2e 4/4 and login-provider e2e 2/2.
  - Unit suite: 357/362 with the same 5 known failures.
  - Phone login, overview and jobs at 390/375 in both themes are pixel-identical to 0270ef7.

## Owner Stripe finance and missing prepaid revenue — 2026-10-21

Built on `3412a3a`, preserving all 627 original source members and all deferred features; seven new source members, no removals. Full explanation and runtime access checklist: `ADMIN_STRIPE_FINANCE.md`. Reviewable delta: `admin-stripe-finance.patch`.

- Existing owner analytics now includes live completed prepaid orders and recurring card cycles, deduplicates payment identities, retains refund exclusions, uses Bangkok signup dates and refuses silently truncated database totals.
- A separate owner-only read endpoint displays actual Stripe payment/refund/fee totals, current pending/available balances, original payment settlement, upcoming bank arrival estimates and payout history. No predicted bank arrival is invented for unscheduled payouts. All provider reads are bounded and independent; unavailable access is never shown as zero.
- Registrations, new users, paid Pro and granted Pro counts remain visible. The original app ledger and actual Stripe finances are explicitly distinguished.
- No changes to payment processing, entitlements, webhooks, database schema/data, Wrangler configuration, encrypted secrets or cron schedules.
- Verification: 31 focused backend tests; 16 required Cloudflare security/scheduling tests; TypeScript/Cloudflare checks, production build and preflight; in-app browser desktop/mobile checks including errors/permission denial. Standalone Playwright browser launch is blocked by macOS sandbox, so its seven scenarios are not claimed as passed.
- Runtime setup is still pending action-time confirmation: add Read for Balance, Charges and Refunds, Payouts to the existing restricted key. Production owner sign-in is awaiting account confirmation after automatic review blocked selecting an unspecified Google account. No key permission or credential changes have been made.
- Archive SHA256 `3477a479e8107ef954ae8e37fb54c2733d0584daf3e04338df24ddf32058fe8f`; manifest SHA256 `23e3db94f584a4964b82d6919fb87fc0edacfe8dffc12ba7bbe22a48c9ccbdff`.


## Stripe finance: bank date per payment; phone admin page as before - 2026-10-22

Built on top of ac85bb8 (Codex's owner Stripe finance dashboard), keeping all of it. Owner chose this over replacing it, and approved ("ดีพอย").

- **Phones:** the admin dashboard on phones is back to exactly how it was before ac85bb8:
  - No Stripe finance panel and no `/api/admin-stripe-finance` request.
  - Whole-baht amounts.
  - The original card labels: รายได้, ผู้ใช้ที่ใช้งาน, อัตราเปลี่ยนเป็น Pro, ยอดชำระสำเร็จ, and the chart title รายได้รายวัน.
  - The rule is that phone UI stays untouched (owner, 2026-10-21). Computers and iPads keep Codex's version unchanged.
- **Bank date per payment** (owner asked when each payment reaches the bank):
  - After the existing reads, the six most recent automatic payouts (pending, in transit or paid) are listed with `balanceTransactions.list({ payout })`.
  - Each payment whose balance transaction one of them carried gets `payout { id, arrivalDate, status }`.
  - The panel shows "จะเข้าธนาคารประมาณ …" or "โอนเข้าธนาคารแล้ว …" on the latest payment and in the payment list.
  - Not found, or any read failure (for example no Balance read), shows no bank date. Nothing is guessed, and the existing "พร้อมใช้ใน Stripe" date stays.
- Read-only. Payment processing, webhooks, entitlements, the database, Wrangler config, Secrets and crons are untouched.
- Runtime access is still pending from ac85bb8: the owner adds Read for Balance, Charges and Refunds, and Payouts to the restricted key. Until then those sections show as unavailable.

Changed against ac85bb8: backend/src/services/adminStripeFinance.ts, frontend/src/features/groups/AdminDashboard.tsx, frontend/src/features/groups/AdminStripeFinance.tsx, shared/adminStripeFinance.ts, tests/admin-stripe-finance.test.ts, tests/e2e/phase-one-feedback.spec.ts (mocks the finance endpoint), tests/e2e/admin-stripe-finance-phone.spec.ts (new).
- Archive SHA256 `ca24d198a1ac29d323c77e369e1165651ce761d57753723419ad37568afe1d20`; manifest SHA256 `b5106b37ad8b977940d11963276a0a367ce721e4c64c636b4bc53616e34d84bd`.
- Checked:
  - cloudflare:check (16), the Cloudflare build and preflight on the extracted package.
  - Stripe finance and admin tests 32/32, including the new bank-date test.
  - Unit suite 380/385 with the same 5 known failures.
  - Admin, feedback and new phone/bank-date browser tests 15/15.
  - Phone admin overview and revenue at 390/375, both themes, scrolled through (32 screens), pixel-identical to 3412a3a. The same check on ac85bb8 differed on all 32.


## Stripe finance hides what it cannot read - 2026-10-22

Built on top of 6a72896. Owner asked: "ถ้าตรงนี้มันไม่สามารถอ่านได้เอาออกเลยก็ได้" (if this cannot be read, just take it out). Approved ("ดีพอย").

- Unreadable parts are left out (computers and iPads). A Stripe finance part that comes back unavailable is not drawn and has no explanation box: totals, balance, next payout, payment list or payout history.
- A part that is only incomplete (period too long) still shows its "choose a shorter period" note.
- With nothing readable, the request refused, or the request failed, the panel is not shown at all.
- No loading skeleton until the panel has had something to show, so it does not flash and vanish. Refreshing a shown panel keeps its skeleton.
- The panel appears by itself once the owner adds Read for Balance, Charges and Refunds, and Payouts to the restricted key.
- Phones unchanged: there is still no panel and no request, and the phone admin page stays pixel-identical to 3412a3a.
- Read-only. Payments, the database, Wrangler config, Secrets and crons are untouched.

Changed against 6a72896: frontend/src/features/groups/AdminStripeFinance.tsx, frontend/src/features/groups/AdminDashboard.tsx (Suspense fallback is now null), tests/e2e/admin-analytics.spec.ts.
- Archive SHA256 `83088ca5a75d6aee4c5a2d50edad4fc317d2e7dd7a802f30a8da08552e6a2ec0`; manifest SHA256 `dbeefc05ac0613b24bc45450777f1a90aa3c7da67e2000b37c6c1e7c9e9bb003`.
- Checked:
  - cloudflare:check (16), the Cloudflare build and preflight on the extracted package.
  - Unit suite 380/385 with the same 5 known failures.
  - Admin, feedback and phone browser tests 15/15.
  - Phone admin overview and revenue, 32 screens, pixel-identical to 3412a3a.


## Live revenue; phone admin design; phone opening logo; scheduled jobs on Cloudflare - 2026-10-22

Built on top of 28b0983. The owner asked for revenue to update in real time on computers, iPads and phones ("เอาใส่ทั้งในมือถือด้วยก็ดี"), and approved deploying everything ("deploy ส่วนที่เหลือทั้งหมด").

- **Pulse:** `GET /api/admin-analytics?pulse=1`.
  - Same owner-only gate as the analytics, with its own rate limit (20/min).
  - Makes eight count-only requests over the live payment sources: prepaid orders paid/refunded, invoice.paid events, refunded card cycles, PromptPay and legacy payments with refunds.
  - Returns only a signature made of counts. No payment rows, names or amounts.
- **Snapshot:** the full analytics response carries `liveSignature`, taken before its data is read, so a payment landing mid-read is caught by the next pulse.
- **Page:**
  - While the admin page is open and on screen, it asks every 15 seconds. A hidden tab does not ask, and returning to it asks at once.
  - On a change, the numbers reload quietly with no skeleton, and the shared toast reads "มีการชำระเงินใหม่" with the payer's name, Public ID and amount. Refunds update the numbers without a toast.
  - The Stripe finance panel refreshes quietly too.
  - 401 or 403 on the pulse triggers a full reload, which clears the money shown.
- **Indicator:** "● อัปเดตอัตโนมัติ" on computers and iPads, beside อัปเดต; on phones "● สด" in the admin header.
- Payments, the database and Secrets are untouched. The Wrangler config and crons change as described below.

**Admin dashboard on phones, in the phone design** (owner: "อิงตามแบบมือถือ ... ไม่ต้องเอาเหมือนในคอม"):
- `AdminDashboardPhone.tsx` is chosen by the app's phone layout (`useMobileLayout`, under 744px).
- Layout:
  - The terracotta `MobilePageHero` carries the period's revenue; the box collapses on scroll.
  - Below it: a 7/30/90 switch, metric cards, a daily-users chart, the latest payments and a list of admin tools.
  - Each tool opens as its own page with a back link: revenue + all payments, accounts (search, plan chips, persona filter, detail bottom sheet), feature usage, inbox, users, teams.
  - Tips and personas are on the main page; tapping a persona opens the accounts filtered to it.
- When the figures fail, the error shows and the inbox, users and teams still open.
- The phone has no Stripe finance panel and makes no request for it.
- Labels moved to `adminLabels.ts`.
- Computers and iPads are unchanged: 18 screens at 1440, 1024 and 768 in both themes are pixel-identical to the live-revenue build.
- The phone header box is drawn from the first render and never swaps element types, because `useCollapsingCard` measures once.

**Opening logo on phones** (owner: no grey skeleton when the app opens; the logo with an animation):
- Who sees it: when the screen is phone width and the visitor signed in before (or opened the installed app), `boot-skeleton.js` draws `#app-splash` outside `#root`, not on /login, /recover or /privacy.
- What it shows: the official symbol (inline SVG, not redrawn) turns in with a glow and two ripples. The wordmark appears once its Prompt subset loads, and dots pulse while loading.
- How it closes: App calls `hideSplash()` once the session is known and the account's data has loaded or failed.
- It waits at least 1.1s and until no `#root [aria-busy]` placeholder is left (at most 2.5s), fades and scales out, and is removed after 15s at the latest. ErrorBoundary also hides it.
- Reduced motion gets a plain fade. Computers keep the skeleton.

**Scheduled jobs now run on Cloudflare** (owner approved in chat 2026-10-22: "อนุมัติตามเวลาเลย"):
- Why: the Vercel deployment that ran them is paused (DEPLOYMENT_PAUSED) and the Worker had `crons: []` and `CRON_ENABLED: "false"`, so no scheduled job ran anywhere.
- `wrangler.production.jsonc` now has crons `0 1 * * *` and `0 2 * * *`, and `CRON_ENABLED: "true"`. `CRON_SECRET` was already a Worker secret.
- `0 1 * * *` is the 08:00 Bangkok credit-term and overdue digest, plus the monthly report on the 1st. The monthly report goes only to accounts that turned it on.
- `0 2 * * *` is the 09:00 closing of paused accounts past their deletion date (permanent, at most 50 a run). The owner ran the read-only backlog query in Supabase first and reported "Success".
- The 50 ทวิ reminder is hidden (owner: feature not launched yet). `cloudflare/schedule.ts` no longer lists it; its handler stays. A test asserts it is never scheduled. Bringing it back is one line.

Changed against 28b0983: cloudflare/schedule.ts, wrangler.production.jsonc, tests/cloudflare-scheduled.test.ts, backend/src/handlers/admin-analytics.ts, backend/src/services/adminPaymentPulse.ts (new), frontend/index.html, frontend/public/boot-skeleton.js, frontend/src/app/App.tsx, frontend/src/app/splash.ts (new), frontend/src/components/ui/ErrorBoundary.tsx, frontend/src/features/groups/AdminDashboard.tsx, frontend/src/features/groups/AdminDashboardPhone.tsx (new), frontend/src/features/groups/AdminStripeFinance.tsx, frontend/src/features/groups/adminLabels.ts (new), frontend/src/features/mobile/mobile.css, frontend/src/services/adminAnalytics.ts, shared/adminAnalytics.ts, tests/admin-analytics-access.test.ts, tests/e2e/admin-analytics.spec.ts, tests/e2e/admin-stripe-finance-phone.spec.ts, tests/e2e/admin-live-revenue.spec.ts (new), tests/e2e/admin-phone.spec.ts (new), tests/e2e/phone-splash.spec.ts (new).
- Archive SHA256 `06ea69197c26a41163acaef4ff841cad01ad28bedbb0d112eec88922558c3cef`; manifest SHA256 `25bfd98353074078d73b4bb8fb95a3297ee638e3f2f5fa6cd07732e3f31be0d6`.
- Checked:
  - cloudflare:check (16), the Cloudflare build and preflight ("Cron is enabled") on the extracted package.
  - Schedule tests 4/4, including the hidden 50 ทวิ reminder.
  - Admin access tests 10/10, including the pulse gate and that it reads counts only.
  - Unit suite 381/386 with the same 5 known failures.
  - Live revenue e2e 3/3 (computer, hidden tab and access loss, phone), stable over 3 runs.
  - Phone admin e2e 5/5 and opening logo e2e 4/4.
  - Full e2e: 135 passed, the 34 known failures and none new.
  - Other phone pages (overview, jobs, sign-in at 390/375, both themes): 12 screens pixel-identical to the previous build.


## Payment buttons in the 08:00 LINE reminder; smooth phone page switches - 2026-10-22

Built on top of de1ccf7. Owner asked: "ทำปุ่มได้รับแล้วในแจ้งเตือน 08:00 ต่อเลย". Approved ("ดีพอย").

- The same single 08:00 reminder card (`buildDigestFlexMessage`) now has pill buttons under each overdue or due-today job: ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ. Instalments get the first two. Jobs due later have none. No new message is sent.
- **ได้รับแล้ว:**
  - Records what the app's payment dialogs record. For a plain job: status done, received = net after WHT, pending 0, paid, pay date today (Bangkok). For an instalment: that row is paid today, then totals and the next due date are recomputed (Jobs page logic).
  - Saved through `cashflow_apply_changes` with the row's version, retried once on a conflict, so an edit made elsewhere is never overwritten.
  - The bot replies with a "บันทึกรับเงินแล้ว" card. Pressing again says it is already recorded.
- **ยังไม่ได้:** saves nothing; the bot replies that it will remind again tomorrow at 08:00.
- **ได้ไม่ครบ:**
  - The postback opens the keyboard with "รับเงินบางส่วน #XXXXXX ยอด " filled in. The typed amount is matched by that short code among the user's unpaid jobs. It records a first deposit, or full payment if the amount covers the rest.
  - A second partial payment, or one on an instalment, is sent to the app, as in the app.
- Postbacks `due:(paid|later|partial):<jobId>[:<installmentId>]` reach the assistant after the usual linked-account, lifecycle and Pro checks, and are handled without the model.
- Safety: if LINE refuses the card with buttons, the 08:00 job immediately resends it without buttons. The settings test alert shows the buttons on sample jobs; they only reply with a sample notice.

**Phone page switches no longer flicker** (owner: "กระพริบ ... ให้มันสมูท"):
- Before, every switch faded the whole page in from nothing (`app-tab-enter`), then the phone page (`ksm-screen` / `ksm-home`), then the header's summary box (`ksm-hero-in`). The area under the top bar went white (249,249,246 measured) and took about 0.2s to turn terracotta again.
- Now phones skip `app-tab-enter`. In `mobile.css`, the terracotta header, its box and figures and the overview greeting have no entrance animation; only what sits under the header fades in (160ms, opacity only).
- Recorded frames show the header area terracotta in every frame.
- Settled screens are unchanged: at most 2 of 255 colour levels on header text, from the removed animation layer.
- Computers and iPads are untouched.

Changed against de1ccf7: frontend/src/app/App.tsx, frontend/src/features/mobile/mobile.css, backend/src/services/lineDuePayments.ts (new), backend/src/services/lineReminders.ts, backend/src/handlers/line-webhook.ts, backend/src/services/lineAssistant.ts, backend/src/handlers/send-overdue-digest.ts, tests/line-due-payments.test.ts (new).
- Archive SHA256 `cf9b5b28d7b80dff6d64335f787f9d6f15f6f1f39249305a0333bbb7d05fbd36`; manifest SHA256 `bcb49a1de0a284265fcff0841ec6580cf7d4788eaea9cd7878914517bab399bd`.
- Checked:
  - cloudflare:check (16), the build and preflight ("Cron is enabled") on the extracted package.
  - Payment button tests 9/9.
  - Unit suite 390/395 with the same 5 known failures.
  - Rendered preview of the card and the replies: `artifacts/line-due/line-due-preview.png`.

## New versions open without an error page or a new sign-in - 2026-10-22

Built on top of 9370b1c. Owner asked: "วัตถุประสงค์กูก็คือแค่ให้แอปฟีเจอร์ใหม่มันเข้ามาเลยอ่ะโดยที่ไม่ต้องกดล็อกอินใหม่หรือเออร์เลอร์อ่ะ". Approved ("ดีพอย").

Causes found on the live site:
1. A tab opened before a deploy asks for code files of its own build. They are gone after the deploy, and the server answers 200 text/html, so the import fails and the orange "โหลดหน้านี้ไม่สำเร็จ" page appeared.
2. A sign-in ended 8 hours after signing in, however actively the app was used (a refresh kept the original time), so "โหลดหน้าใหม่" often landed on the login page.
3. While the deploy switched over, a failed session check at startup was taken as "signed out".

What changed:
- `frontend/src/app/appUpdate.ts` (new) compares the running build with the one "/" names when the app comes back on screen and every 5 minutes. With a newer one waiting, the next page switch opens that page as a fresh page load (the sign-in cookie stays), and returning after more than 30 s away opens it at once.
- A page whose code is gone reloads into the new build by itself, once, showing "กำลังเปิดเวอร์ชันใหม่…" instead of the error (`ErrorBoundary`). A missing file found while preloading (hovering a menu item) only marks the new build as ready; nothing reloads under the pointer.
- Nothing reloads while a save is still on its way (it waits up to 5 s). A second failure within 20 s shows the error page as before, so an outage cannot loop.
- Sign-in (`backend/src/security/session.ts`): `SESSION_LIFETIME` is 30 days, and each token refresh (about hourly while in use) starts it again. 30 days without use signs out. Revocation checks are unchanged. Parked accounts in the switcher follow the same rule.
- Startup (`App.tsx`): for someone signed in on this browser before, a failed session check is asked again every 2 s (up to 10 times) behind the loading screen instead of showing the login page.

Changed against 9370b1c: backend/src/security/session.ts, backend/src/security/deviceAccounts.ts (comment), frontend/src/app/appUpdate.ts (new), frontend/src/app/App.tsx, frontend/src/components/ui/ErrorBoundary.tsx, frontend/src/main.tsx, tests/app-update.test.ts (new), tests/e2e/app-update.spec.ts (new), tests/http.test.ts, tests/device-accounts.test.ts.
- Archive SHA256 `83e5b039f2127a2fe327868dbacf1369ba06d302136baf44acf5dc1f468427b4`; manifest SHA256 `8240236521ec1df616f40244ea3b2e9af129a9c927e21bbc16b4d208bc785a16`.
- Checked:
  - cloudflare:check (16), the build and preflight ("Cron is enabled") on the extracted package.
  - Unit suite 390/395 with the same 5 known failures, plus 4 new update tests.
  - New browser tests 6/6, acting out a deploy on an open tab on computer and phone.
  - Full browser suite: 141 passed; the 34 failures are the known list, no new ones.
- Limit: tabs still running the build before this one do not have the new code. This deploy can still show them the old error once; it applies from the next deploy on.

## Formal LINE cards, LINE welcome and disconnect notice, card consent v2 database rule - 2026-10-22

Built on top of 6e759e8. Approved ("ดีพอย").

**Owner requests, in order:**
- "ดูน่ารักเกินไป ... ทางการ ... worldwide ... clean"
- "เพิ่มลิควิดการ์ด ... เกรเดียนต์ ... สีสันแบบทางการ"
- "รายจ่ายควรเป็นสีแดง ... เป็นสัญลักษณ์"
- "มาสคอต ... ใช้ให้มันดูแบบคิวท์ทางการ"
- "ไม่ต้องเพิ่มกรอบ ... อยากได้เหมือน Apple"
- "ของเรามันเอาไว้จดงาน"
- the LINE disconnect notice and connect welcome

**LINE cards** (`backend/src/services/lineCards.ts`; every card uses it):
- **Header:** a CI gradient band with a light sheen.
  - The colour follows the event (`LINE_CARD_THEMES`): brand rust-orange, green for money in, crimson red for expenses and goal withdrawals, deep red for overdue, graphite for cancelled.
  - On the band: the official white brand symbol, a category chip with a Lucide icon (11 new PNGs in `frontend/public/line/icons`), a white title, a full-width hairline, and the key amount.
- **Mascot:** the official pose for the event (`/line/mascot-v6-*.png`, never redrawn) stands on the band with no frame. It is 92px beside an amount and 76px beside a title.
- **Body:** white label/value statement rows. Colours come from one palette (`lineTone()` folds any other colour into text).
- The 08:00 total and the monthly net profit moved onto the band. The reminder groups are dotted headings instead of tinted boxes.

**Examples are jobs, not coffee:**
- `LINE_JOB_EXAMPLES` holds เพิ่มงาน ออกแบบโลโก้ 5000 / เพิ่มงาน ถ่ายภาพ ให้ร้านดอกไม้ 12000 / เพิ่มงาน ตัดต่อวิดีโอ 8000 รอรับเงิน.
- Each one is checked to parse as a job draft. They are used on the help card and in the greeting text.

**Unrecognised messages:** `buildLineEntryHelp(text)` answers a hello with "สวัสดีครับ · มีอะไรให้เลขากระรอกช่วยไหมครับ" and anything else with "เลขายังไม่เข้าใจครับ" plus the examples.

**Connecting** (`line-webhook.ts` → `welcomeAfterLink`, `lineLinkCards.ts`):
- The reply is a welcome card in the secretary's voice.
- Pro accounts (trial included) get quick replies and an add-job button.
- Other accounts are told the LINE features are Pro and get a /plans button.
- If the plan lookup fails, the account gets the version that promises nothing extra.

**Disconnecting** (`line-link-code.ts`):
- Reads the linked LINE chat, removes the link and its challenge, then pushes "ยกเลิกการเชื่อมต่อแล้ว". The card says alerts have stopped, nothing in the app was deleted, and how to reconnect.
- The push is best effort (`lineNotified` in the response) and counts toward the LINE monthly message quota.
- Before this, nothing was sent.

**Card consent v2 database rule:** `supabase/migrations/20261022040000_card_consent_v2.sql`.
- The owner already ran it in Supabase on 2026-10-22, with Success.
- Verified live afterwards: POST /api/billing returned 200 and reached the create and attach stages.
- `tests/card-renewals-database.test.ts` now covers every accepted consent version.

Changed against 6e759e8:
- line-link-code.ts, line-webhook.ts, notify.ts
- lineAssistant.ts, lineCards.ts, lineCashSummary.ts, lineDraftReview.ts, lineEntryRouting.ts, lineLinkCards.ts (new), lineReminders.ts, lineVaultChat.ts
- 11 icons (new)
- scripts/tutorial/line/clip/flex.tsx (preview renderer)
- the migration (new)
- tests: card-renewals-database, http, line-cards-formal (new), line-entry-help (new)

The web app bundle is unchanged (entry index-D053UY1J.js).
- Archive SHA256 `55913fe73308d5cec56c17ab18ad64aaa311b521d5bad0142c649f9868885c55`; manifest SHA256 `774bef28d9e7c6324effa5aa46b9b23aa075f61f3655cbfd33de98e44efc6cf0`.
- Checked:
  - cloudflare:check (16), build and preflight ("Cron is enabled") on the extracted package.
  - LINE and card tests 28/28, plus the disconnect HTTP test, on the extracted package.
  - Unit suite 411/416 with the same 5 known failures. The two notification tests fail identically on 6e759e8.
  - Before/after previews: `artifacts/line-formal/*.png`.

## Home screen icon and English home screen name; LINE card amounts tidied - 2026-10-22

Built on top of 56994fe. Owner asked for a new home screen icon: the red gradient, a white squirrel tail, and the name in English ("ภาษาคาราโอเกะ"). They pointed at the deep rust with the white tail as the one they liked ("fulfill เนี้ยมันดูดีนะ"). Approved ("ดีพอย").

**Icon:**
- The official white tail symbol (`brand/logo01-v1/symbol-white.svg`), at 60% of the canvas, on the phone overview's deep rust gradient: 165deg #9C3A17 → #A63F1B → #B4471D.
- The same light sheen as the LINE cards, and a soft shadow under the tail.
- Files in `frontend/public/brand/home-v1/`:
  - home-icon-180.png (apple-touch-icon)
  - home-icon-192.png and home-icon-512.png
  - home-maskable-512.png (tail at 46%, inside Android's circle crop)
  - home-icon.svg
- Generated by `artifacts/home-icon/make.mjs hero`.

**Home screen name:** `manifest.json` name and short_name, and the `apple-mobile-web-app-title`, are now "Krarok Tunngern". The browser tab title stays "กระรอกตุนเงิน".

**LINE cards tidied** (owner, from a real phone screenshot: "ตัวใหญ่เกินไปเปล่า ... ทำให้มันเป็นระเบียบ"; "−฿ 1,810.91" broke across two lines):
- `lineAmountSize()` sets the headline amount size: xxl for up to 9 characters, xl for up to 13, lg beyond. 3xl (35px) is no longer used.
- The mascot beside an amount is 80px (was 92), and 72px beside a title.
- Statement rows give the value two thirds of the width. `lineValueRow` takes a `caption`, which sits under its own label. The monthly summary uses it for "ประจำ + ทั่วไป", and its income and expense amounts are md (was lg).
- The preview renderer now uses LINE's real 3xl size (35) and the iPhone system font, so previews match phones.

**Unchanged:**
- The favicons and the official logo files.
- The web app bundle (entry index-D053UY1J.js).

**For people who already added the app to their home screen:** the icon and name they have stay until they remove it and add it again. Phones save both when the app is added.

- Archive SHA256 `b5f4071b6b7b3a7f7da570da63cc54fef54bc712e98c7b6ac54cf36aa2f38bc7`; manifest SHA256 `66753a2218c35182a53c89c930fac422effa2e7dde7ba196cd2ab29a7b1a61f6`.
- Checked:
  - cloudflare:check (16), the build and preflight on the extracted package.
  - LINE and card tests 28/28 on the extracted package; unit suite 411/416 with the same 5 known failures.
  - The local server serves the five icons and the new tags.
- Preview: `artifacts/home-icon/home-icon-preview.png`.

## Home screen name "Krarok" - 2026-10-22

Built on top of fb4a45b. After pkg27 the owner chose the short name: "Krarok เอาอันนี้". This came with the same deploy approval ("ดีพอย").
- `manifest.json` short_name and the `apple-mobile-web-app-title` are now "Krarok". iOS cut "Krarok Tunngern" to "Krarok Tunn…".
- `name` stays "Krarok Tunngern"; Android shows it in the install prompt.
- Nothing else changed.
- Archive SHA256 `fca2953c7ffb6a6fc3ac83828fb668e99c34040179588437725ef90588b9c483`; manifest SHA256 `24e6e95c3b0b09c57e1ba8c27b5fc3fb47529a4fea7706c1ec262ee468cf02f1`.
- Checked: cloudflare:check (16), the build and preflight on the extracted package.
