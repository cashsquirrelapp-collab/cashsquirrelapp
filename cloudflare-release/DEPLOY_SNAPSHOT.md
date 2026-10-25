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

## Home screen icon: larger tail, brighter rust - 2026-10-22

Built on top of 460bcd2. The owner said: "หางกระรอกมันแอบเล็กไป ... ขยายออกมาให้มันเท่าเดิมเหมือนของอันก่อน ... สีแดงอิฐ ... ทึบไป ทำให้มันสว่างขึ้นอีกนิดนึง ... ให้ดูเด่น". Approved ("ดีพอย").

- **Tail size:** the tail now fills 64–66% of the icon, measured to match the previous icon (it was 49–50%). The Android round version fills 52%, inside the safe circle.
- **Colour:** the same rust, a step brighter: 165deg #B8481D → #C9531F → #DD6530. It keeps the LINE-card sheen.
- **Files:** in `frontend/public/brand/home-v2/` (a new folder, so no cache serves the earlier files under the same names). `manifest.json` and the apple-touch-icon point there.
- **Unchanged:** the name "Krarok", the home-v1 files, and everything else.
- Archive SHA256 `ae8e6cc13ead7e1c348f193d9757bf39c257e9a4067b01fc69eae56bd5288151`; manifest SHA256 `1e17d91a126b3281c45b44a1cdacbe586b02aa3d41d94ba9a5b117bacaeb8612`.
- Checked: cloudflare:check (16), the build and preflight on the extracted package.
- Preview: `artifacts/home-icon/home-icon-preview.png`. Generator: `artifacts/home-icon/make.mjs bright`.

## No reply for unrecognised LINE messages - 2026-10-22

Built on top of 320a65a. The owner asked to remove the "เลขายังไม่เข้าใจครับ" card and the rule that sent it: "ไม่สำคัญขนาดนั้นเอาออกเลย". Approved ("ดีพอย").

- When a linked user's message is not a command the bot knows and no draft is open, the bot now sends nothing.
  - Before, it sent the "เลขายังไม่เข้าใจครับ" / "สวัสดีครับ" help card.
  - `buildLineEntryHelp` and `isLineGreeting` are gone.
- The assistant now returns an empty list for "handled, nothing to send". `null` still means "not linked".
  - The webhook skips the reply call and marks the event done.
  - So a linked user is never answered with the link-code "ไม่พบรหัสเชื่อมต่อ" text.
- **Unchanged:**
  - the commands, the job examples (welcome card, greeting text), "ถาม AI", the open-draft hints, the welcome and disconnect cards
  - expense and job recording
- If LINE Official Account Manager has its own auto-response turned on, LINE may answer by itself. That is a console setting, not this code.
- Archive SHA256 `f420a6ce4eb1f37c66d59c8b0f177601e5d7c2721ea4edbd7f071891b160a94c`; manifest SHA256 `dc0d4dfa76019d4a225a86110ef5955c8f19ddd33f465f1ee66f42914066817b`.
- Checked:
  - cloudflare:check (16), the build and preflight on the extracted package.
  - LINE assistant tests on the extracted package.
  - Unit suite 411/416 with the same 5 known failures.
  - New test: a linked user's unrecognised message returns [] and an unlinked one still returns null.

## English and Thai in every feature; rewritten privacy policy and terms - 2026-10-22

Built on top of 472cf95. The owner asked for complete English and Thai in every feature with no Thai showing in English, and for the privacy policy and terms linked before sign-in to be rewritten as a real business would. Approved ("ดีพอย").

- **Languages**
  - Every screen, dialog, menu, toast, export file (CSV/Excel/ZIP names and headings) and server error message now has English.
    - About 2,400 entries in `frontend/src/i18n/en/`, looked up by the Thai text with `tr()` (`frontend/src/i18n/tr.ts`).
  - Thai screens are unchanged: the visible text and labels of every page were compared line by line with the previous build.
    - The one deliberate change is the sign-in chooser, which was English-only and now reads in Thai in Thai mode.
  - Saved data stays Thai and is translated only where it is shown, so LINE and existing accounts read the same data:
    - default statuses, job types and installment names ("งวดที่ N")
    - expense categories, goal history notes and bank names
  - Admin quick replies to users stay Thai. LINE messages are not translated.
- **English formatting**
  - Dates use the English calendar (2026), and documents spell amounts in English words.
  - A4 titles stay bilingual, as Thai tax documents need.
- **Legal pages**
  - `privacy.html` and `terms.html` rewritten in Thai and English. They follow the app language, and the button on each page switches language.
  - New `legal.css` and `legal.js`.
  - Facts checked against the code: 14-day trial, 10 free documents a month, data deleted 30 days after pausing or closing, current Pro prices.
- **Unchanged:** backend, payments, Stripe, Wrangler config, Secrets and crons.
- Archive SHA256 `6ad4c39056e333a39a9bdddde392ae7bed335b23cebaa2e78303bacf2e19b4d9`; manifest SHA256 `0540acc4a1c5751e304fef326bfdc2c709e4e498c76d4e42e740db8529cc3f69`.
- **Checked:**
  - cloudflare:check (16), the build and preflight on the extracted package.
  - Unit suite 414/419, with the same 5 known failures as the live code. New `tests/i18n-coverage.test.ts`: every translated text has English and the placeholders match.
  - New `tests/e2e/i18n-english.spec.ts` (37 tests): every page and the main dialogs in English, on a computer and a phone, show no Thai.

## Business contact email in the privacy policy and terms - 2026-10-22

Built on top of a507705. The owner asked to replace his personal email in the policies with the business account email used for Cloudflare and Supabase. Approved ("ดีพอย").

- `privacy.html` and `terms.html` now give cashsquirrelapp@gmail.com as the contact address, in Thai and English.
- **Unchanged:**
  - The owner account that the backend recognises for admin analytics and staging is still the owner's own login.
  - The app bundle, backend, payments, Wrangler config, Secrets and crons.
- Archive SHA256 `0736b8298063770df69f1181982ddbe8860ae5995d3855692af4a1f9a79eb3a1`; manifest SHA256 `bcc170b3ef3ee7ef84e86def60c14569af9ffee93ae3599bb8fab7f6d35683a2`.
- **Checked:** cloudflare:check (16), the build and preflight on the extracted package. The built pages contain the new address.

## Import from Excel and CSV - 2026-10-22

Built on top of 5389d7f. The owner asked how people who already keep their jobs in Excel can bring them in without typing them again. The proposal was accepted, and the import is free for every account ("ให้ฟรีทุกกรณีทุกฟีเจอร์"). Approved ("ดีพอย").

- **Where:** "นำเข้าจาก Excel", on the Jobs page header and in Settings > สำรอง & นำเข้าข้อมูล. Computers and iPads only; the phone layout is unchanged.
- **Reading the file**
  - .xlsx, .xls, .ods and CSV, including CSV saved by Thai Excel (Windows-874).
  - Read in the browser with the SheetJS library already in the app. Nothing is sent until the person presses Import.
- **Matching columns**
  - The header row is found even under a title or blank rows.
  - Each column is matched by Thai and English header words and by its values (dates, amounts, rates, status words). The person can change any match, choose another header row, or set the tab to jobs, expenses or mixed.
  - Columns that match nothing are kept in the note with their header.
  - Mappings are remembered on that device.
- **Reading values**
  - Buddhist or Western dates, day-first or month-first, Thai and English month names, and Excel date cells.
  - Amounts such as ฿12,000, 12,000.- or (500).
  - Withholding tax as a rate or an amount, with an option for amounts already after withholding.
  - Credit terms and payment/delivery status words, including TRUE/FALSE ticks.
  - Monthly tabs give the month to rows without a date.
  - Total rows and repeated headers are skipped.
  - A summary with months across the columns is recognised and not imported.
- **Review table**
  - Every row is marked ready, check or not imported, with the reason. Name, amount and date can be edited.
  - Totals are compared with the file's own total row.
  - Duplicates of existing jobs are left out unless ticked.
- **Saving**
  - Jobs and expenses are built exactly as the job and expense forms build them, and pass the same validation.
  - Saved data stays Thai, as with the other forms.
  - Each row carries `importBatchId` and `importedAt`. The whole import can be undone for 7 days, from the done screen or from Settings.
  - At most 2,000 rows per import.
- A downloadable template (Thai or English headers, job examples) imports with no column matching.
- **Unchanged:** backend, payments, Wrangler config, Secrets and crons.
- Archive SHA256 `48f25502bbd72236de5156d517c14b50ce769c0ddb9febaf92a56110ef93ac44`; manifest SHA256 `28f0184222e0940e5158c789f48e7343ea32bf5755fbff31d3597e1c6bc3e74b`.
- **Checked:**
  - cloudflare:check (16), the build and preflight on the extracted package.
  - New `tests/sheet-import.test.ts` (24 tests: 20 sheet layouts, the template in both languages, and form validation).
  - New `tests/e2e/excel-import.spec.ts` (4 tests: match, review, save with batch tag and undo; Settings entry; no button on phones; English).
  - Unit suite 438/443, with the same 5 known failures as the live code.

## Import reads whole workbooks; tidy English wordmark and sign-in legal lines - 2026-10-22

Built on top of 8450f73. This replaces the unpublished pkg34 and includes its changes. Approved ("ดีพอย").

**The owner's test workbook.** The owner made a sample personal-finance workbook in Numbers with these tabs: export summary, Dashboard, Transactions, Projects, Invoices and Read Me. He imported it and exported the result. The live import counted:
- the Dashboard's category table as jobs;
- each project three times (ledger payments, the project list, the unpaid invoices);
- savings and tax transfers as income.

That gave 27 jobs worth ฿473,740 instead of 6 jobs worth ฿199,300. Expenses (27, ฿63,440) were already right.

- **Summary tabs**
  - Dashboards, summaries, read-me pages and Numbers' export notes are recognised by tab name, or by having no date and nothing naming a job, client or project.
  - They are left unticked, with a note; the person can still tick them.
- **Transfers**
  - Transfer rows (savings, tax pot, transfers between the person's own accounts) are neither income nor expense.
  - They are shown but not imported unless ticked.
- **New column types**
  - "Project / Area" is its own column type: money in is named after its project, and expenses keep it in the note.
  - With a header row, an unknown text column (payment method, account) is no longer guessed as the client.
- **One job per project**
  - When ledger payments add up to the project list's received amount, or unpaid invoices add up to its outstanding amount, they are folded into that one job: deposit date, installments for several payments, due dates and invoice notes.
  - The folded rows are left out, each marked "รวมเข้ากับ Projects 3".
  - Rows with the same name that don't add up are flagged for a check.
- **Totals check:** each tab's own total row is compared with the rows read from that tab, instead of the whole import with one total.
- **More layouts**
  - Google Sheets' side-by-side expense and income tables are split into two tables.
  - Bank statements (ถอน/ฝาก, withdrawal/deposit) are read as money out and in.
  - A single +/− amount column means money in and out.
  - Income-only lists are read as received on their date.
  - A month-only date becomes the 1st, flagged.
  - A day number in a monthly tab gets that month.
  - ✅ ❌ ⏳ ใช่ ไม่ are read as statuses.
  - $ amounts are read.
  - Placeholders ("-", "ไม่ระบุ") count as empty.
  - "สถานะโครงการ" is read as the status.
  - A paid date guessed from the job's own date is flagged.
- **Re-importing the app's own CSV export** gives back the same jobs, with installment rows grouped into one job.
- **Result on the owner's workbook:** 6 jobs worth ฿199,300 (received ฿137,300, outstanding ฿62,000) and 27 expenses worth ฿63,440, all matching the workbook's own Dashboard. Every tab's total row matches.
- **From pkg34**
  - Sign-in legal text on two even lines.
  - English logo name a step smaller and tighter; Thai unchanged.
- **Unchanged:** backend, payments, Wrangler config, Secrets and crons.
- Archive SHA256 `5562efd46293b66a372d57efbefbfdcf73098c79b3508c7f6d811ab54c6bb226`; manifest SHA256 `750d1154d58a3da4976d0979fcea7b8595f2763989059b78ffa492f6a223d7a7`.
- **Checked:**
  - cloudflare:check (16), the build and preflight on the extracted package.
  - `tests/sheet-import.test.ts` (31: the earlier layouts plus the whole workbook, unmatched payments, invoice-only lists, Google Sheets budget, Thai bank statement, month/day dates, the app's own CSV export).
  - Unit suite 445/450, with the same 5 known failures as the live code.

## Smart import: guesses wait for the person, rows keep their source, updates, reconciliation, safe CSV - 2026-10-22

Built on top of 9e0f2e9. Approved ("ดีพอย").

**Why.** The owner tested two fictional workbooks: a personal-finance workbook and a solo-freelancer bookkeeping file whose tabs link by code (P001, C001, E001).
- pkg33 (8450f73) read the solo file as ฿168,000 received instead of ฿84,000. The 4 ledger payments were added on top of the 4 invoices, and the Dashboard figures became jobs.
- The live import (9e0f2e9) gives ฿84,000 received, but 16 jobs worth ฿334,000 and 60 expenses worth ฿78,764, because the projects, invoices and expense register are each counted twice.
- A re-imported CSV export took 1 Oct 2026 from its file name.
- The CSV export wrote the due date as "วันรับเงินจริง" for unpaid jobs.

**Changes**
- **Codes**
  - Code columns are never amounts or dates. That covers "Expense ID", "Reference ID", "รหัส", "เลขที่", and any column whose values are nearly all codes.
  - Clients and Projects tabs name the codes used in other tabs. A Clients tab is a lookup tab: left out of the import, with a note.
- **One count per transaction**
  - A project list with values only is folded with the invoices that add up to it.
  - Ledger payments are folded into their invoice.
  - The same expense in a ledger and a register is imported once.
  - Transfers are never income or expense.
  - Money comparisons are exact to the satang; there is no ±฿1 tolerance any more.
- **Guesses wait for the person**
  - A column read from its values alone must be confirmed before the review.
  - Rows are left out until ticked when they involve a guess (unreadable or month-only date, paid date taken from the job date, negative amount), a possible double count (same name in another tab, repeated row), an update, or a non-baht amount.
  - Ticking works one row at a time or "ยืนยันทั้ง N แถว" per reason.
- **Source and re-import**
  - Each saved row keeps `importSource`: file name, SHA-256 fingerprint, tab, row and its own code.
  - Re-importing the same file adds nothing, even after edits.
  - A newer version of a file offers updates to the rows it changes (same code or same job, payment changed), shown before and after.
  - Updated rows keep `importUpdate.before`, so undo restores them.
  - Rows made or edited in the app are flagged before they are updated.
- **Review screen**
  - Counts: read / new / update / duplicate / waiting / to check / left out.
  - Value, received and outstanding; expenses split business / personal, with a toggle for personal expenses.
  - Reconciliation against each tab's total row and against the Dashboard figures (received, outstanding, invoiced, business and personal expenses, transfers, project count), with the unreconciled difference.
  - Each row opens to show the file's cells, the field each went to, and why.
- **Saving:** the done screen waits for the server. A failed save shows the error with "ลองบันทึกอีกครั้ง" and undo.
- **Files**
  - The file's real type is checked from its first bytes.
  - Only cached cell values are read: no formulas, no macros, a row limit per tab.
  - Every CSV export (jobs, expenses, report) writes formula-like text as text.
  - The jobs export writes the real received date.
- **Headers:** a data row with numbers or dates is no longer taken as the header.
- **Unchanged:** database schema and migrations, backend, payments, Wrangler config, Secrets and crons. The phone layout is unchanged; the import is computer/iPad only.

**Result**
- Solo file: 8 jobs, ฿167,000 / ฿84,000 / ฿83,000; 30 expenses ฿39,382 (business ฿31,742 + personal ฿7,640); ฿15,000 transfers not counted. All 7 Dashboard figures match.
- Personal-finance file: 6 jobs, ฿199,300 / ฿137,300 / ฿62,000; 27 expenses ฿63,440; ฿14,000 transfers. All Dashboard figures and total rows match.

**Hashes:** archive SHA256 `c6b2d6eb4f95a48b17b4db035771884654bfad9337ec9326eef18388d81e7905`; manifest SHA256 `733991bede0dda5907244e6423effe56f531a302f03d2e6e057330d12f346f1c`.

**Checked**
- cloudflare:check (16), the build and preflight on the extracted package.
- Import tests on the package: 47.
- Unit suite 461/466, with the same 5 known failures.
- Database tests 17, including import batches across accounts.
- e2e excel-import and English 43/43.
- Full e2e: 184 passed; the 34 failures are the same as the live baseline.

## One import card on computers and iPads: Excel, CSV and the .json backup - 2026-10-23

Built on top of 56aad7c. Approved ("ดีพอย").

**Why.** The owner saw two import cards on Settings › สำรอง & นำเข้าข้อมูล ("นำเข้าจาก Excel / CSV" and "นำเข้าข้อมูล" for the .json backup) and asked to remove the duplicate. The .json card restores a whole backup, which the Excel import cannot do, so the two are merged rather than one being dropped.

- **Computers and iPads**
  - One card, "นำเข้าข้อมูล", with one button that opens the import window. The window takes Excel, CSV, .ods and the app's own .json backup.
  - A .json file closes the window and goes to the existing restore, after the same confirmation ("นำเข้าข้อมูลจากไฟล์สำรอง", replaces the same sections).
  - Recent imports and undo stay on the card.
- **Phone:** unchanged. The phone has no Excel import, so its .json restore card stays exactly as it was.
- **Unchanged:** backend, payments, Wrangler config, Secrets and crons.
- Archive SHA256 `db8cfac11696f2afe5c3996b0da05ded9aaa1c3320b57854f176bcff0df15a79`; manifest SHA256 `324e757b425c2efd8847e75b1fe5d67ee228109b6562c3acd58e89d13c622c4c`.
- **Checked:**
  - cloudflare:check (16), the build and preflight on the extracted package.
  - Unit suite 462/467, with the same 5 known failures.
  - e2e excel-import (6, now also checking the .json path on a computer and the unchanged phone card) and English (37).

## English brand name in the browser tab - 2026-10-23

Built on top of e8ddcfc. Approved ("ดีพอย").

- The app's tab title is "Krarok Tunngern" in both languages, as in the manifest and the English wordmark. It was "กระรอกตุนเงิน" (owner, 2026-10-23).
- The privacy, terms and LINE entry pages end their titles with the same name. Their page text is unchanged.
- **Note:** e8ddcfc (pkg37) was deployed directly with `npm run cloudflare:deploy` (Version 383fabc7). GitHub did not trigger Workers Builds during its incident, and the owner approved the direct deploy.
- **Unchanged:** app code and bundle (same entry `index-Cobj-Mwp.js`), backend, payments, Wrangler config, Secrets and crons.
- Archive SHA256 `3d824b77b43864fa0ec027c8cd1cb2fb87e5a67f099bcf3e8f26d489c32bb590`; manifest SHA256 `27ed848cdee11e9bbebb2dc08ef7eb7c2190c23015f7cd36f440e284bbf606b8`.
- **Checked:**
  - cloudflare:check (16), the build and preflight on the extracted package.
  - e2e excel-import (now checks the tab title) and English (43/43).

## DOMPurify 3.4.17, Vite 6.4.5 and a full dependency audit before every release - 2026-10-23

Built on top of 95f1cb2. Approved ("ดีพอย").

**Why.** The owner asked for care after news of sites being taken over through PHP, then asked for the safest setting ("ให้มันปลอดภัยที่สุด"). This app has no PHP, and the read-only check found no committed secrets. Security headers, private vault storage with byte sniffing and sandboxed serving, and RLS were all in place. `npm audit` did report:
- one critical advisory in DOMPurify 3.4.16, which jsPDF pulls in (GHSA-cg2g-xh64-v4q7 and related). The app only uses jsPDF's `addImage`, so that code was not reached.
- one high advisory in Vite 6.4.3, the build tool's local dev server (GHSA-9jrq-w75r-8gcw and related). Production never runs the dev server.

- **DOMPurify 3.4.16 → 3.4.17 and Vite 6.4.3 → 6.4.5 (`^6.4.5`)**
  - Only those lockfile entries change. Stripe stays 23.0.0 and @stripe/stripe-js 10.1.0.
  - A plain `npm update` in the work tree tried to move Stripe to 22 by reading the outer repo's package.json. That change was discarded. The update was made in an isolated folder and checked with a clean `npm ci`.
  - The production bundle is the same with the new Vite (same entry `index-4iRRFO3a.js`).
- **Dependency audit before every release**
  - New script `security:audit` = `npm audit --audit-level=high`. It covers every package, shipped or used to build and test.
  - `cloudflare:check` starts with it. So the CI release step (`npm ci` → `cloudflare:check`) and `cloudflare:deploy` stop on any known high or critical advisory.
  - Checked: it fails on the old lockfile (exit 1) and passes on this one (0 vulnerabilities in all packages).
- **Test:** `tests/security.test.ts` keeps the audit at the start of the release check, DOMPurify ≥3.4.17, Vite ≥6.4.5, and Stripe unmoved.
- **Unchanged:** app code, backend, payments, Wrangler config, Secrets and crons.
- Archive SHA256 `2f34383d08b8e2dc3053f5448c58ddfbb0115ccd146b04fa6afc00cd5bd24c53`; manifest SHA256 `2f8220f1bffcff8e443fa9f5c9136ead92f261bb28be8e7a8f16766acaa1e311`.
- **Checked:**
  - On the extracted package with a clean `npm ci`: cloudflare:check (17, including the audit), the build and preflight.
  - Unit suite 463/468, with the same 5 known failures.
  - An invoice PDF downloaded in the browser with the new DOMPurify (valid %PDF).
  - Full e2e with the Vite 6.4.5 build: 184 passed; the 34 failures are the same as the live baseline.


## Liquid Glass and iOS look, phone account sheet, and the เลขากระรอก chat preview - 2026-10-23

Built on top of bdc473e.

**Why.** The owner approved the Liquid Glass canvas and said "ทำในแอปจริงได้เลย". They asked for:
- glass only on notifications, a few tappable buttons and the bottom bar;
- the glass sidebar on computers;
- iOS-like icons everywhere;
- an easy way to switch account or log out on phones;
- no text that overlaps.

They then asked for an in-app chat with the squirrel, screen only, as a Pro feature that they will wire to an AI API later, named เลขากระรอก. Their brief "KRAROK — AI SECRETARY CHAT UI BRIEF" asks for a ChatGPT/Dot-style workspace, frontend only. A typography brief followed: lighter, natural Thai text on the chat page only. Then the owner chose option ข.: on computers the app's sidebar folds away inside the chat, with a way back, and the suggested questions become a tidy 2 × 2 grid. Last, the owner asked for a glam, Gen Z dark mode ("ดึกดำบรรพ์" before) and for notifications "เหมือน LINE": LINE's templates, its UI, everything, inside the chat.

**Glass, kept to the places the owner named**
- Computers and iPads (1024px+):
  - The sidebar floats as a glass panel over a warm wash.
  - The open page has a pill with a filled icon (`NavGlyph`).
- The overview's bell and theme buttons are round glass.
- Notifications are frosted glass with the strong fill, so the page never reads through.
- Pop-up menus are glass with the strong fill and open under their buttons: row ⋯, jobs, expenses, exports, ออกต่อเป็น / แชร์, and the profile menu.
- Phones:
  - The bottom bar is a floating glass capsule with filled icons for the open tab. Pages scroll under it.
  - An iOS-style fade, with a clear patch under the squirrel's ears, keeps text from showing half-covered behind it.
  - The action sheet floats over an 8px blur.
- The บอกเรา message box is a glass capsule.

**iOS look**
- Segmented controls on jobs, calendar, expenses and documents, on computers and phones.
- Grey filled search fields.
- Coloured rounded-square tiles in Settings and on the phone เมนู screen. The LINE rows keep the real LINE logo.
- Grey round ⋯ and close buttons.
- Lucide icons at stroke 1.7.

**Phone account sheet.** Signed-in accounts open it by tapping the profile box on เมนู. It is the existing account switcher, titled บัญชีของฉัน, with โปรไฟล์ and ออกจากระบบ rows under the accounts. Guests keep the old profile link.

**เลขากระรอก chat (`/assistant`, `features/assistant`)**
- Who can open it: admins only, because it is not in the launch list. Members land on the overview. It carries a Pro badge.
- Layout:
  - A history sidebar (new chat, search, Today / Yesterday / Previous 7 days). It sits beside the chat from 940px and is a drawer below that.
  - A slim glass header with the official mascot, the name, status, a token ring and a ⋯ menu.
  - The conversation renders answers as safe Markdown (tables, lists, links into the app).
  - A floating glass message box. Attach and microphone are marked "เร็ว ๆ นี้".
  - A welcome with four suggested questions as equal cards in a 2 × 2 grid, each with an icon. A short label sits on the card, and tapping it asks the full question.
- LINE inside the chat (screen only, labelled sample data; nothing is sent to LINE and no data changes):
  - A pinned "แจ้งเตือนอัตโนมัติ" thread at the top of the history, with an unread badge, a header bell on computers and iPads, and a dot on phones.
  - The automatic notifications the app really sends to LINE, drawn with the same template as `lineCards.ts`: the 08:00 เตือนรับเงิน, บันทึกรับเงินแล้ว and สรุปการเงินประจำเดือน.
    - Same band colours, category chip, official mascot poses (`/line/mascot-v6-*.png`), rows, buttons and wording (`lineMock.ts`, `LineCard.tsx`).
  - LINE's chat look: date chips, and อ่านแล้ว with the time beside the bubble.
  - The reminder's buttons answer as LINE does:
    - ได้รับแล้ว shows the receipt card;
    - ยังไม่ได้ shows the real "พรุ่งนี้ 08:00" reply;
    - ได้ไม่ครบ fills in "รับเงินบางส่วน #… ยอด".
  - Quick replies รอรับเงิน, สรุปเดือนนี้ and กำลังดำเนินการ get LINE's own answer cards. A rich menu was tried and then taken out at the owner's request.
  - A LINE-style push banner, previewed from the ⋯ menu.
- Dark mode, chat only (light unchanged). After the owner's "แอบลายตา" it is toned down:
  - a near-black stage with one soft warm glow at the top and a faint rose glow low down, drifting slowly (no motion with reduced motion);
  - deeper glass with a lit edge;
  - a gentle gradient on the welcome line;
  - quieter accents.
  - LINE cards stay light, as LINE shows them.
- The top of the chat has no glass bar any more (owner: it blocked the view). Round glass buttons sit at the sides and only the squirrel is in the middle; the name and status remain for screen readers. The squirrel is bigger (80px on computers, 64px on phones), with a halo and a shadow. The owner plans outfits and colours for it later. It hangs a little below the row, but only over the strip where the conversation has already faded out, so it never covers text.
- Focus mode on computers (1024px+):
  - Opening the chat slides the app's sidebar away to the left (0.34s; none with reduced motion). While folded it is inert and hidden from screen readers, so only the chat's history sidebar is on screen.
  - The chat sits 12px from the window edges.
  - "‹ กลับ" at the top of the history sidebar, or the arrow in the header when the history is hidden, returns to the page you came from, and the sidebar slides back.
  - iPad and phones keep their own way back; other pages are unchanged.
- Sample result cards: project, document, money summary, and a confirmation card (confirm / cancel / failed / retry). Every one is labelled "ข้อมูลตัวอย่าง".
- Every UI state from the brief can be previewed from the ⋯ menu: low or empty tokens, trial ended, Pro required, connection failed (retry), action failed (retry).
- The squirrel uses existing moods and actions only (the mascot stays locked): greets, naps, listens, thinks (with a bulb accessory), types and looks proud. `MascotSlot` is the interface for later animation.
- Where the AI connects later: `assistantApi.ts` (`AssistantTransport`: send / conversations / balance / confirm). Today it is a sample transport. Nothing calls an AI, billing or the backend, and the tests check for no such requests.
- Typography (chat page only):
  - The app's own IBM Plex Sans Thai, using real font files only (`font-synthesis: none`), drawn the light macOS/iOS way (`-webkit-font-smoothing: antialiased`).
  - Weights: 400 for reading, 500 for buttons and light emphasis, 600 for titles only. No 700.
  - Reading text is 15px at line height 1.65–1.7, and nothing is under 11px.
  - Layout, colours, glass, icons and the mascot are unchanged.

**Also**
- A job menu that opens while the page is still settling from a scroll no longer closes at once.
- Usage counters skip the chat preview.

**Unchanged:** backend, payments, Stripe, Wrangler config, Secrets, crons and stored data.

**Tests**
- New `tests/e2e/assistant-chat.spec.ts` (15 tests):
  - phone, iPad, computer and wide computer;
  - every UI state; sleeping; members; dark mode;
  - phone full screen and drawer;
  - the sidebar icon and focus mode (the slide is sampled frame by frame; the way back from both places);
  - the 2 × 2 question grid on computer and phone;
  - LINE: the thread and its cards, the buttons' replies, quick replies, the push banner, no rich menu and no top bar, phones and the dark stage;
  - typography (font, weights 400/500/600, Thai line height, no text under 11px, no text shadow).
- New `tests/e2e/textOverlap.ts`: the owner's no-overlap rule, measured on real letter shapes. It runs in the chat tests.
- Phone account sheet test added to `account-switcher.spec.ts`. `mobile-phone.spec.ts` was updated for the profile box opening the sheet.

**Package**
- Archive SHA256 `3841b78d3a060b7b4a8e250f8ee3a27d6c16584a6c21693f2cd6063bfcaa2cdc`; manifest SHA256 `4145b64702c8756d829ef1cb6fe3bac6ccee88453adb7ad9a0dcf752d202ee4d`.
- 726 files, 39 changed or new.
- New entry `assets/index-D5WUKphW.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, including the audit, 0 vulnerabilities), the build and preflight.
- Unit suite 463/468, with the same 5 known failures.
- Full e2e on the LINE version: 200 passed; the 34 failures are exactly the live baseline. After the last changes (rich menu out, no top bar, calmer dark, bigger squirrel), the chat, account-switcher and phone specs pass 36/36.
- In the browser at 375, 390, 820, 1024, 1280 and 1440px, light and dark: the overlap checker is clean.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-23.


## The เลขากระรอก chat opened to every member - 2026-10-23

Built on top of ad55025.

**Why.** The owner asked: "เปิดให้สมาชิกทั่วไปเห็นหน้าแชตด้วย".

**What changed**
- `shared/featureAvailability.ts`: `assistant` joins the launch list. Members now see เลขากระรอก:
  - in the sidebar on computers and iPads;
  - in the LINE AI Pro section of เมนู on phones;
  - at `/assistant`.
- What members see is the same as what admins already had:
  - It is still a labelled screen preview with sample answers. The message box says "ตัวอย่างหน้าจอ · คำตอบเป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อ AI".
  - It stays behind the Pro gate. Accounts without Pro or the trial see the Pro notice and cannot send.
  - Nothing calls an AI, LINE or billing, and no stored data changes.
- The team's preview tools in the chat's ⋯ menu ("ดูตัวอย่างสถานะ", "จำลองแจ้งเตือนเข้า") stay with admins (`previewTools`). This way members never see, for example, a "trial ended" notice that is not true for them.

**Unchanged:** backend, API permissions, payments, Stripe, Wrangler config, Secrets, crons and stored data.

**Tests**
- `tests/e2e/assistant-chat.spec.ts` (15 tests): the old "members do not see the chat" test is now "members see the chat in the sidebar and the phone menu, without the team preview tools".

**Package**
- Archive SHA256 `ab0f01c5665c02199f8f88b5572a65ba77faa07f85a97d528c1282942460a18f`; manifest SHA256 `bffc1ca317971a1eb1f4581805db1242f83436029f2c3a4330d66f749138556b`.
- 726 files, 4 changed.
- New entry `assets/index-CqjhHoEt.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, including the audit, 0 vulnerabilities), the build and preflight.
- The chat spec passes 15/15.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-23.


## เลขากระรอก: chat history menu, delete with undo, and a try mode without Pro - 2026-10-23

Built on top of 56e2927.

**Why.** The owner asked for three things:
- Chat history that can be deleted, so it does not fill up and slow down.
- The row menu ChatGPT has ("ทำแบบนี้").
- For accounts without Pro: let them try the chat with its preset questions, and ask them to get Pro when they type their own.

**History**
- Each row has a ⋯ menu. Computers show a pin button and the ⋯ on hover; phones and touch screens always show the ⋯. The menu has:
  - เปลี่ยนชื่อ: inline. Enter saves, Escape cancels.
  - ปักหมุด / เลิกปักหมุด: pinned chats move under แชตที่ปักหมุด, after the notifications thread.
  - แชร์: marked "เร็ว ๆ นี้", because sharing needs a backend.
  - เก็บถาวร: the chat moves into a folded "เก็บถาวร · n" section and can be taken out again.
  - ลบ: in red.
- The chat's own ⋯ menu also has ลบประวัติแชตทั้งหมด. The pinned notifications thread is never deleted.
- After a delete, "ลบแชตแล้ว · เลิกทำ" stays for 6 seconds. Only after that does the chat go for good.
- `AssistantTransport` gains the optional `remove(ids)` and `update(id, {title, pinned, archived})` for the real backend later. Today the history lives in the browser only.

**Try mode without Pro**
- Shown to accounts without Pro or the trial, and in the "trial ended" and "Pro required" previews.
- The suggested questions, quick replies and LINE card buttons answer with labelled sample answers.
- A typed question is not sent. A card appears instead: "พิมพ์ถามเองได้เมื่อเป็นสมาชิก Pro". It offers the sample questions, ดูแพ็กเกจ Pro and ไว้ทีหลัง, and the typed text stays in the box.
- A small notice says "โหมดทดลอง · กดคำถามตัวอย่างได้ พิมพ์ถามเองต้องใช้ Pro". The token counter is hidden, because tokens do not apply.

**Also**
- The conversation now keeps following new messages while the message area grows. Only the reader scrolling up stops it, and the area is measured in the same frame.
- The overlap checker treats the open history drawer as a layer, like the phone's เมนู screen.

**Unchanged:** backend, API permissions, payments, Stripe, Wrangler config, Secrets, crons and stored data.

**Tests**
- `tests/e2e/assistant-chat.spec.ts` (18 tests). New tests:
  - history: delete one chat, delete all, undo;
  - rename, pin and archive from the row menu;
  - the try mode on computer and phone.

**Package**
- Archive SHA256 `acb248ae2106cdaa465d4b76ba1cf3c9f28373d055ff6ee3b379b2069c9513cd`; manifest SHA256 `18bb83268bbed7f16aebf0422a205ba1d5f2b887acf18099c89eeb2c9ce77815`.
- 726 files, 7 changed.
- New entry `assets/index-DOJZpp3h.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, including the audit, 0 vulnerabilities), the build and preflight.
- The chat spec passes 18/18. Full e2e: 202 passed; 35 failed = the 34 of the live baseline plus "marking work as done previews the expected payment date…", which then passed 5 runs in a row on its own (a timing flake; nothing in this package touches jobs).

**Approved** by the owner in chat ("ดีพอย"), 2026-10-23.


## เลขากระรอก follows Pro on every page, wears its Pro outfit, and arrives after paying; the ฿159 popup and the setup questions are removed - 2026-10-23

Built on top of 1e6dd06.

**Why.** The owner asked for several things:
- เลขากระรอก should follow Pro members to every page ("ให้น้องตามไปทุกที่ทุกฟีเจอร์สำหรับคนที่ใช้โปร ... คล้าย Cowork").
- After a video of an AI dashboard, a docked assistant panel and an arrival moment. The owner first wanted it to feel like a game, then turned that down: it should be formal, like OpenAI's launch for dots ("ต้องดูเหมือนนักบัญชี หรือเลขาที่พร้อมเข้ามาช่วย UI จะต้องทางการ"). In it the squirrel walks out of a door on its own legs, jumps and waves.
- The arrival plays only right after paying ("ถ้าขึ้นทุกครั้งมันจะดูน่ารำคาญ").
- A Pro form of the squirrel: the owner chose option ก. Pro เลขา.
- Remove the ฿159 advert that opened by itself and all the new-member questions ("เราจะรื้อแล้วเราจะทำใหม่").

**The squirrel at the corner (Pro and the trial only, every page but the chat)**
- On computers, an "ถามเลขากระรอก ⌘K" pill; on phones, a round squirrel above the bottom bar. ⌘K / Ctrl+K opens and closes it.
- The panel knows the page: a greeting, questions for that page and a reply about the page. It can prepare an action to confirm, for example a new job, which is a labelled sample that changes nothing. "เปิดแชตเต็ม" opens /assistant.
- Where the panel opens:
  - Very wide screens (1720px+): docked at the right, with the page making room beside it.
  - Other computers: a side sheet over a dimmed, blurred page. Pushing the page narrower had broken tables that size themselves by the screen width.
  - Phones: a sheet from the bottom.
- After landing it shows "แตะผมได้ทุกหน้า" for a few seconds, with a tap icon.
- Like the full chat, this is a screen preview: the sample transport answers and nothing is saved.

**Pro เลขา outfit**
- `components/mascot/MascotProGear.tsx` and `Mascot gear="pro"`: a headset with a microphone and a green light, an aura with a slowly turning ring, a star pin and sparkles. Under 40px only the headset is drawn.
- These are accessories drawn over the official artwork; the squirrel itself is unchanged.
- It appears everywhere in เลขากระรอก: the corner squirrel, the panel, the top of the chat, the welcome screen, the small avatars, the try-mode card, the sidebar icon and the arrival. Squirrels elsewhere in the app are unchanged.
- New actions `walk` (the feet take turns stepping, the body shifts its weight, the paws swing) and `jump` (crouch, push off, feet tucked, land). They move the mascot's existing shapes; nothing is redrawn.

**The arrival after paying (AssistantBirth.tsx)**
- It plays when a payment is confirmed (the "สมัครสมาชิกสำเร็จ!" message), right after that message is closed. It never plays on ordinary visits, for the trial or on renewals.
- The page goes behind frosted glass, and a doorway of soft light rises from a glowing horizon with soft orbs around it.
- The Pro squirrel walks out of the light on its own feet, jumps, then waves with twinkles by its paw.
- "สวัสดีครับ คุณ…" types itself out letter by letter, keeping Thai marks whole, followed by "เลขากระรอกพร้อมช่วยดูแลงาน เอกสาร และการเงินของคุณแล้ว".
- The glass then opens from the squirrel outward and it flies to its corner.
- It can be skipped at any moment. With reduced motion it is a still hello.
- The team can replay it from the chat's ⋯ menu ("ดูตอนน้องเกิดอีกครั้ง", which uses `?hello=krarok`).

**Removed**
- The Pro advert (฿159) that opened by itself, daily and after 7 days.
- The new-member setup questions (ProfileSetupWizard) and the "replay" button in ตั้งค่า. The wizard file is kept but unused.
- Still there: the Pro dialog at a Free account's 11th document of the month.

**Unchanged:** backend, API permissions, payments, prices, Stripe, Wrangler config, Secrets, crons and stored data. Checkout stays as it is.

**Tests**
- `tests/e2e/assistant-buddy.spec.ts` (new, 10 tests) covers:
  - the corner squirrel and its panel on computers, very wide screens and phones;
  - no squirrel without Pro;
  - the arrival only after a confirmed payment and never on a visit;
  - typing that keeps Thai marks whole;
  - skip and reduced motion;
  - no automatic promo.
- `tests/e2e/app.spec.ts`: the three onboarding tests are replaced by "new accounts are no longer asked the setup questions".

**Package**
- Archive SHA256 `0b4b0a5e95f4e028fb9577f56639fb0dcc680f61fa54b7207a7a0619f8cecb60`; manifest SHA256 `f88519823e75189ac184261d1ba773b736e6c49871fb85b3dfa32ab0752c411d`.
- 730 files, 16 changed (4 new).
- New entry `assets/index-DgIz5G8t.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, including the audit, 0 vulnerabilities), the build and preflight.
- Full e2e before the last animation change: 211 passed. The 33 failures are all among the 34 of the live baseline; the 34th was the onboarding test this package replaces. The chat and corner-squirrel specs pass on the final code.

**Approved** by the owner in chat ("ดีพอยทั้งหมดเลยชอบมาก"), 2026-10-23.


## A smoother เลขากระรอก arrival, and the jobs list keeps its order after a row action - 2026-10-24

Built on top of c5d48a4.

**Why.** The owner asked for two things:
- The arrival after paying should run as one continuous movement ("ค่อย ๆ เฟด ... ให้มันคอนติเนียกัน ... มูฟลงไปแล้วก็ค่อยขยายออก ... สมูท").
- On the jobs list: "เวลากดรับเงินทำไมมันเด้งขึ้นด้านบน แก้ด้วย".

**The arrival (AssistantBirth.tsx, AssistantBuddy.tsx)**
- **Walk-in:** the squirrel fades in out of the doorway's light while it walks, over a second, and its glow settles over 1.3 s. It used to appear in 0.4 s.
- **Words:** they come in softer (0.6 s, with a blur that clears; the line under the greeting over 0.8 s). They leave in a new "leave" phase half a second before the glass opens, so they never sit over the page.
- **Flight:** it is one curved movement instead of a spring. It drops first, then glides across (1.15 s), aimed at the corner squirrel's own picture.
  - It starts while the glass opens.
  - On phones the distance is divided by the scene's 0.86 scale, so it lands within a pixel on both computer and phone.
- **Corner pill:** while the scene plays, the computer pill waits folded into a round bubble around the squirrel. After the landing it opens out to "ถามเลขากระรอก ⌘K" over 0.75 s, its words fading in on their own. The tip "แตะผมได้ทุกหน้า" then fades in. Phones keep the round button.

**The jobs list (JobsTab.tsx)**
- **The bug:** recording money, delivering or changing a stage from a row re-sorted the list at once. A paid job is dated the day the money arrived, so under "ล่าสุด" it jumped to the top. Focus then went back to its button and scrolled the page up.
- **The fix:** after a row action the list keeps the order it had, until the view changes (search, tab, month, filters, sort) or the page is opened again. Undo keeps the row in place too.

**Unchanged:** backend, API permissions, payments, Stripe, Wrangler config, Secrets, crons and stored data.

**Tests**
- `tests/e2e/assistant-buddy.spec.ts`: the arrival test now checks that the pill waits folded and opens out with its words after the landing.
- `tests/e2e/jobs-hold-order.spec.ts` (new): receiving money from the last row keeps the row, its height on screen and the page scroll; changing the view sorts the list again.

**Package**
- Archive SHA256 `3adcf2166a7a7d9167fae765bddd9c5510874b94048a568a78574b4f41ca1ab9`; manifest SHA256 `1867dce1020fa85a0fb0f5e8a1ad394ab17c651b730cbdb1d81507e3e50f22e9`.
- 731 files, 7 changed (1 new).
- New entry `assets/index-DyRXHdgi.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, including the audit, 0 vulnerabilities), the build and preflight.
- Full e2e on this code: 212 passed; the 33 failures are all in the live baseline (the onboarding test of the baseline was replaced in pkg43). The new jobs-hold-order test passes.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## เลขากระรอก answers for real (admins only), voice and files, a 3-day trial for new accounts, and zod 4.6.6 - 2026-10-24

Built on top of 75b625e.

**Why.** The owner asked to connect the AI (brief "KRAROK AI SECRETARY — AI TRAINING & BACKEND IMPLEMENTATION BRIEF"): "ทำต่อเลย ปุ่มยืนยันกับระบบโทเคน", then "ทำข้อ 2 เลย" (connect the chat screen). Gemini only for now ("ใช้ Gemini อย่างเดียวไปก่อน"); Pro tokens reset on the renewal day ("รีเซ็ตตามวันต่ออายุ Pro"); 1,000 tokens a month ("เอา 1,000 ตามเดิม"); the prompt may live in the public repo ("เอา ก. ปล่อยไปตามนี้").

**What it does**
- `/api/assistant` (new): GET returns whether เลขา is on, the plan and the tokens left. POST sends a message, or confirms or cancels a card.
- The AI is Gemini 3.5 Flash-Lite, called from the backend. The key is the Worker secret `GEMINI_API_KEY`, which the owner set; it never reaches the browser.
- The AI reads the account through the same calculations as the overview. It never writes. Each change comes back as a confirmation card, and ยืนยัน saves it through `cashflow_apply_changes` with the job version the AI read: a job changed since gives 409, and a double tap saves once.
- **Krarok Tokens:** 1 token = $0.001 of real cost.
  - Pro: 1,000 a month, reset on the renewal day.
  - Trial: 25 tokens for the whole trial (owner: about 10 ordinary messages, counted by real work).
  - System admins: no cap.
  - A failed answer costs nothing. The whole app stops for the day at $5.
- Tables: `cashflow_ai_proposals`, `cashflow_ai_usage` and `cashflow_ai_memories` (`database/ai_secretary.sql`). The owner ran it in Supabase on 2026-10-24 and confirmed the 3 tables.
- **The chat screen and the floating squirrel:** same layout, same cards. When `/api/assistant` says on, they use the live transport. Sample labels give way to plain ones ("บันทึกแล้ว", "เลขากระรอกตอบผิดได้ ตรวจสอบก่อนกดยืนยันทุกครั้ง"), and the data reloads after a save. Only accounts that can see เลขา ask.
- **Switch:** `AI_ENABLED=true` with `AI_ADMINS_ONLY=true` in wrangler.production.jsonc, so only system admins get the real เลขา. Everyone else keeps the sample chat until AI_ADMINS_ONLY is "false".
- **Voice and files (owner: "ฝากทำฟังก์ชันกดเสียงแล้วก็พูดออกได้ด้วย ... เพิ่มภาพเพิ่มไฟล์ด้วย"), full chat screen**
  - The mic turns speech into text in the message box with the browser's own recognition (no tokens; Chrome sends the sound to Google, Safari to Apple). Browsers without it show the button as not available.
  - A speaker button beside each answer's time reads it aloud with the device's voice.
  - The paperclip, live only, attaches a picture or a PDF up to 4 MB. Pictures are redrawn at most 1600px as JPEG, which drops their location data.
  - The backend checks the file's real first bytes, allows 10 files per 10 minutes, and sends the file to Gemini with that one message without storing it.
  - The prompt tells the model to read slips and quotations as data and to propose record_payment or add_job.
- **Free trial: 3 days for accounts created from 25 Oct 2569 00:00 Bangkok** (owner: option ก). Older accounts keep their 14 days. One rule in `shared/trial.ts` replaces the 10 separate 14-day constants (app, LINE, vault, reports, admin lists, feedback, เลขา). terms.html (Thai and English) says the same.
- **zod 4.6.5 → 4.6.6** (GHSA-mrhx-c7xc-m3w5, high). The audit gate found it on the clean install. Only zod changed in the lockfile.

**Unchanged:** payments, Stripe, crons, LINE, and all stored data.

**Tests**
- tests/ai-gateway.test.ts (16), tests/ai-service.test.ts (11) and tests/trial-length.test.ts (3).
- tests/e2e/assistant-live.spec.ts (11): live answers, cards, tokens, files, mic, read aloud, and computer and phone layout with the text-overlap check.
- assistant-chat.spec.ts now expects a working mic.
- phase-one-feedback.spec.ts now mocks `/api/assistant`.
- Live Gemini runs of the Thai test set: 40 cases, about $0.0016 per reply.

**Package**
- Archive SHA256 `39beb0ec580a33aa42d2cf6662613f2ba5c2633793aa32bd3c83fe2e599a3df9`; manifest SHA256 `631190b004e84de3f7fdabd7816d644a0cb54be512e39c265b67144aa1228d36`.
- 753 files, 46 changed (22 new).
- New entry `assets/index-BokDseeu.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, audit 0 vulnerabilities), the build and preflight.
- Unit tests 493/498 (the 5 known failures).
- Full e2e on the final code: 219 passed, 37 failed. 33 of those are the live baseline; the other 4 were assistant-chat still expecting a "coming soon" mic, now updated (assistant-chat and assistant-live: 29/29).

**Approved** by the owner in chat ("ดีพอบ"), 2026-10-24.


## body-parser 2.4.0 (pkg45 could not deploy) - 2026-10-24

Built on top of 2a2aac3.

**Why.** The owner ran `npm run cloudflare:deploy` for pkg45. Its audit gate stopped the deploy on a new high advisory:
- **Advisory:** body-parser 2.0.0–2.3.0, GHSA-27r3-jxmh-p828 (denial of service via trailing bytes after a compressed body).
- **Timing:** it was published after pkg45 had passed the same audit.
- **Effect:** nothing was deployed; the live Worker stayed on 75b625e.

**Change.** `npm update body-parser` changed one file, package-lock.json:
- body-parser 2.3.0 → 2.4.0, through express 5.2.1.
- qs 6.16.0 → 6.16.1, which body-parser 2.4.0 needs.
- No other file and no other package changed.

**Package**
- Archive SHA256 `875568280cd6c31667b7b5e853be948c6c1623c9abb9d4192c9840f06d6864f0`; manifest SHA256 `ccf366d66bd9bdf6ba38a9f31a1192776911335bf7ce796de437510a2d711317`.
- 753 files, 1 changed.
- The entry stays `assets/index-BokDseeu.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, audit 0 vulnerabilities), the build and preflight.
- Unit tests 493/498 (the 5 known failures).
- e2e assistant-live, app and billing: the only failures are in the baseline.

**Approved.** This is part of the pkg45 deploy the owner approved ("ดีพอบ") and asked to fix ("มันขึ้น error ดูให้หน่อย"), 2026-10-24.


## The mic button works: the page allows the microphone - 2026-10-24

Built on top of 78d6ee2.

**Why.** The owner reported: "ฟังก์ชันเสียงยังใช้ไม่ได้นะทำให้มันใช้ได้เลย".
- **Cause:** every page was served with `Permissions-Policy: camera=(), microphone=(), geolocation=()`. That stops the browser from opening the microphone for the page, so speech-to-text was refused.
- **Why tests missed it:** the e2e tests use a stand-in for the browser's speech tools, so they never saw the rule.

**Change**
- `microphone=(self)` in all four places that send the rule: cloudflare/worker.ts, backend/src/http/securityHeaders.ts, frontend/public/_headers and vercel.json.
- Only this site may ask for the microphone; other sites and frames still may not.
- Camera and location stay off.
- The browser still asks the person once before the mic turns on.

**Tests**
- tests/permissions-policy.test.ts (new): all four places agree and allow only `microphone=(self)`.
- assistant-live.spec.ts: also checks the header on the chat page.

**Package**
- Archive SHA256 `d6470edde1459df50da6e73fb9ed62dcc91207f8b68f2251603629ccc8a052a7`; manifest SHA256 `8ed07bc12642e6a9ed1b4afbcb35eee0046a863185b5ce667ca6e8e508714a7d`.
- 754 files, 6 changed (1 new).
- The entry stays `assets/index-BokDseeu.js`.

**Checked**
- On the extracted package with a clean `npm ci`: cloudflare:check (17/17, audit 0 vulnerabilities), the build and preflight.
- Unit tests 494/499 (the 5 known failures).
- assistant-live and assistant-chat e2e: 29/29.

**Approved.** The owner asked for the fix in chat ("ทำให้มันใช้ได้เลย"), 2026-10-24, and runs the deploy.


## เลขากระรอก asks before adding a job, answers lists as tables, shows real document cards; nodemailer 10.2.1 - 2026-10-24

Built on top of 95dcb3b.

**Why.** The owner reported two problems:
- A job was prepared from a name and an amount alone, without asking the due date or credit term, the payment status and so on ("ถ้ามันไม่มีข้อมูลวันที่วันกำหนดส่ง มันจะตามเครดิตเทอมยังไง ... ข้อมูลสำคัญ").
- Summaries came back as long prose instead of a table ("แทนที่จะทำออกมาให้มันเป็นตาราง").

**propose_add_job (ai/tools.ts) follows the app's job form (JobFormDrawer)**
- **Asks before preparing.** It prepares no card until it has the client (or "ไม่ระบุ"), delivered or in progress (with the delivery day if delivered), the payment status (unpaid, partial with the amount, or paid) and withholding tax.
- **Due date.** It also needs the credit term or a due date, unless the job is fully paid.
- **What it answers when something is missing.** ok:false with the exact list. The model asks for all of it in one numbered message and never fills a value in itself.
- **The job record.** It is built like the form: status from the account's statuses, payDate = delivery + credit term (or the date given), or the paid date when fully paid. An in-progress job keeps its term and has no due date yet.
- **The card.** It now shows the job status, the payment, the due date with its credit term, and the WHT amount.

**Other tools**
- **search_jobs** takes `month` (this or last), using the app's jobsInMonth rule. It returns the count, total_value and total_pending of all matches, so the model never adds rows up.
- **money_summary** comes with the chat's existing summary card (รายรับ, รายจ่าย, เงินคงเหลือ for the month), so the text stays to a line or two.

**Documents and admin status**
- **search_documents (new tool):** the account's quotations, invoices, receipts and tax invoices, by client, number or type, newest first, with the same total as the documents page. The top three come as the chat's existing document cards, whose เปิดในแอป button goes to /invoice?type=…&document=…. This answers the owner's example ("ใบเสนอราคาของบริษัท ตัวอย่าง อยู่ตรงไหน").
- **Admin-only line under the chat:** says why the real เลขา is not on for the account (AI only for admins, server switch off, a group account, or the server's error). Members never see it.
- **nodemailer 10.0.12 → 10.2.1:** fixes three moderate address-parser advisories (GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h). Only nodemailer changed in the lockfile; the audit now shows 0 vulnerabilities.

**Prompt secretary-v3**
- Lists of three or more items are a Markdown table (at most 10 rows), with a bold count and total above it and the items needing action first.
- "สรุป" answers are a headline, then a table or short bullets, then one line on what needs attention.
- A table never changes the voice (friend style stays กู/มึง).
- English answers translate status words and dates.

**Tested on real Gemini 3.5 Flash-Lite** (artifacts/ai-secretary/eval 202610240604 and 202610240607; about $0.19 in all)
- "เพิ่มงานออกแบบโลโก้ 5000" asks the 5 missing points in one numbered message, with no card.
- With full details, it prepares a correct card: due 23 Nov, 30 days after delivery.
- A follow-up answer after the questions prepares the card from the history.
- Unpaid jobs and summaries come as tables. "งานเดือนนี้" now counts 4 jobs, ฿53,500, by the app's rule.

**Other tests**
- Unit: ai-gateway (19) and ai-service (11); all 497/502 (the 5 known failures).
- e2e: assistant-live (12/12); with assistant-chat, assistant-buddy and i18n-english, 75 passed. The one failure was the switched-off test seeing the new admin line, now updated.
- Real Gemini: docs-01, docs-02 and personality-03 open document cards, and how-to questions still get the menu answer.

**Package**
- Archive SHA256 `a437c067aba7277ce5e6af77cb7e2a7e22f62505a79bb4e6d5d5276d4b023f90`; manifest SHA256 `8606b756c363935950ac8b19d4e1606dfc5858129035f8940831772d9943ae0e`.
- 754 files, 13 changed.
- New entry `assets/index-BbsEFDSR.js`.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full `npm audit` 0 vulnerabilities, the build and preflight.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## LINE talks to เลขากระรอก (the same Gemini assistant as the app) - 2026-10-24

Built on top of 95f2e90.

**Why.** The owner asked to connect LINE ("ส่วนของ LINE AI ยังไม่เชื่อม ทำให้มันเชื่อมด้วย ... ทำ LINE ก่อน") and to use Gemini only.
- **Before:** LINE answered with AI only after an "ถาม AI" prefix, through Claude Haiku, which has no key in production. Any other unknown message got no reply.

**What changes in LINE (services/lineAssistant.ts)**
- **Unchanged:** the account, lifecycle and Pro checks, the 08:00 payment buttons, documents, shortcuts, quick replies, and quick job/expense drafts. They stay deterministic, free and instant.
- **New:** every other message goes to เลขากระรอก (ai/lineBridge.ts), with or without "ถาม AI". It uses the same rules, tools and Krarok Tokens as the app, in one pool per account. The 20-minute LINE chat history goes along with it.
- **Claude:** the Claude path is no longer called.
- **When the real เลขา is off for the account** (AI_ADMINS_ONLY, or AI off), the old behaviour stays: no reply to unknown text, and the help text after "ถาม AI".

**Answers shaped for LINE (ai/lineFormat.ts)**
- **Text:** no Markdown, no tables. The prompt has a LINE channel rule (count and total first, then short • lines). A table that slips through still becomes one line per row.
- **Cards** become the formal LINE cards:
  - The summary card becomes a report card with a link to the overview.
  - A document card links to "เปิดเอกสาร / PDF".
  - A confirmation card gets ยืนยัน / ยกเลิก postbacks (`ai:confirm|cancel:<proposal>`, decoded in line-webhook.ts). They go to the same confirmProposal as the app: saved once, refused if the job changed, expires after 30 minutes.
- **Size:** at most two text bubbles plus three cards.

**Formal fixed messages, no emoji**
- Pro expired: "แพ็กเกจ Pro ของบัญชีนี้หมดอายุแล้วครับ …".
- Greeting: "สวัสดีครับคุณ…".
- Asking the user's name.

**Tested**
- tests/line-ai.test.ts (7): routing, quick drafts not sent to AI, AI off, failure text, postbacks to confirm, table flattening, cards and the five-message limit.
- Two wording checks updated. Unit 504/509 (the 5 known failures).
- Real Gemini in LINE mode (eval 202610241118, about $0.01): no tables, a summary card, document cards, and add-job asks first.

**Package**
- Archive SHA256 `a3370856cabfffc41ab185adca414fb7527a4df70f553cd591d1d4340c051b32`; manifest SHA256 `d91169d605daaae2d76bb0b1fb20443cfd71f56d4cdedaa714b4cad2d6694617`.
- 757 files, 11 changed (3 new).
- The entry stays `assets/index-BbsEFDSR.js`; no frontend change.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full audit 0 vulnerabilities, the build, preflight and unit tests.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## The notifications thread shows this account's real notices - 2026-10-24

Built on top of 984b9b1.

**Why.** The owner reported that the chat's "แจ้งเตือนอัตโนมัติ" thread was still a mock-up: "ทำให้มันแจ้งเตือนมันของ LINE ด้วยดิ ... ยังเป็นม็อกอัพอยู่ ... ต้องเอาเป็นของยูสเซอร์ account นั้น".

**What changes**
- **GET `/api/assistant?view=line`** (ai/lineInbox.ts) builds the thread from the signed-in account's own data. It uses the same rules and wording as LINE, and does not need the AI:
  - The 08:00 reminder (findJobsNeedingAttention, the same grouping as buildDigestFlexMessage) with ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ on money already due.
  - Last month's summary.
  - The quick-reply answers: รอรับเงิน, สรุปเดือนนี้, กำลังดำเนินการ.
- **POST `line-due` / `line-partial`** record money exactly as LINE's 08:00 buttons do. lineDuePayments now exposes dueActionOutcome and duePartialOutcome, which LINE also uses: reread, apply, save with its version, one retry.
- **The chat** (AssistantChat) swaps the real notices into the thread, whichever loads last:
  - No sample tag.
  - A line saying so when LINE is not linked or the reminder is off.
  - The buttons, quick replies and the typed partial amount work, and the app's data reloads after a payment.
  - The labelled sample stays only if the server cannot answer.
- **Types:** shared/lineInbox.ts holds the card types for both sides.

**Tested**
- tests/line-inbox.test.ts (4) and the LINE payment tests (unchanged, passing).
- assistant-live e2e 13/13, three runs in a row. This fixed a race where the thread's sample came back after the live transport loaded.
- Unit tests 508/513 (the 5 known failures).
- Full e2e: 225 passed, 33 failed, all of them the live baseline.

**Package**
- Archive SHA256 `33cf6358ce9b05bd515ed482e803e195d9d3a9f64bbc44228b756ce8d8dd5b8f`; manifest SHA256 `ecff0fbc44dcbcbaf46284734229b5d3fd91ef33fd78757b3b45782005d46026`.
- 761 files, 11 changed (4 new).
- New entry `assets/index-BtXraGoo.js`.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full audit 0 vulnerabilities, the build, preflight and unit tests.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## Package 50 — waveform dictation and personal assistant data (2026-10-24)

Based on production package 49 (`ab39a1bb2fe909f4a51ad49b7f52b02c0721f828`), preserving its real notification thread and LINE payment behavior. Source commit: `70699799e3724b2c284df7f45d41affce5555c09`.

The microphone displays live audio levels, stops capture before transcription, and places the transcript in an editable draft without automatically sending a chat message. Cancellation and silence do not upload audio. Backend transcription uses existing account authentication, CSRF, token accounting and request limits.

The assistant can query calendar-year/month/range receipts, expenses, job installments, documents, goals, clients, settings and calendar events for the authenticated personal account. File tools return scoped metadata only. The current feature catalog and courteous response instructions replace obsolete preview and profanity-mirroring guidance.

Validation: 113 focused merged-release tests passed; TypeScript and Cloudflare build/preflight passed; 17 release/security checks passed; npm audit reported zero vulnerabilities. No schema, billing, provider-secret or launch-access changes. A live voice transcription smoke check follows deployment.

Archive SHA256: `6af03db4b9d4733ccdb6cec4d8b5ab8844bc01acf703e90343d1c9fe7b28f65c`
Manifest SHA256: `71ee457126317af8f8ba59f85bdf6612a529c6ee792e6cf71b4b35d10009802f`


## Accounts allowed into เลขากระรอก before customers - 2026-10-24

Built on top of dc2f114 (package 50: waveform dictation and scoped assistant knowledge), keeping all of it.

**Why.** The owner reported that typing in LINE gets no conversation, only the menu commands. AI_ADMINS_ONLY is on and the owner's own account is not a system admin, so both the app and LINE treated เลขา as switched off for it. The owner chose to let their own account in first ("เปิดให้บัญชีของฉันก่อน").

**What changes**
- **AI_ALLOWED_EMAILS** (ai/config.ts): a Worker secret with comma-separated account emails. It is never in the repository. While AI_ADMINS_ONLY is on, system admins and these accounts get the real เลขา. Everyone else stays as before.
  - aiAllowedFor: the rule; case and spaces in the email do not matter.
  - aiConfigFor: the settings for one account, used by /api/assistant (chat, voice, status) and the LINE bridge. If the account is let in, the admins-only check no longer applies to it, so voice transcription works too. If not, the AI is switched off for it.
- **The LINE bridge** reads the account's email with its plan (assistantPlanForUserId).
- **No change** to customers, prices, tokens, the trial or the database.

**Tested**
- tests/ai-gateway.test.ts: who is let in.
- tests/ai-transcription.test.ts: an allowed account can dictate while admins-only; others get ai_disabled.
- Unit tests 589/594 (the 5 known failures).
- assistant-live and assistant-chat e2e: 31 passed. 2 mic tests from package 50 fail the same way on dc2f114 alone: "กำลังฟังอยู่" appears in both the header status and the voice box.

**Package**
- Archive SHA256 `0a9f2fcdab27c097eaa8097c4a8ce968221f380aa6ec5d543b8d8dda43ff3dec`; manifest SHA256 `a72b99eed9631fd00beee9132c41953de8ba7f8229393e9c0b1aaa5716ca2ba7`.
- 776 files, 7 changed, none new.
- The page entry stays `assets/index-CP0pYm7l.js`; the change is backend only.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full audit 0 vulnerabilities, the build, preflight and unit tests.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## เลขา speaks only about open areas; LINE replies for a phone; one token pool - 2026-10-24

Built on top of 3f5cc81.

**Why.** The owner tried เลขา in LINE after pkg51. Three problems:
- Replies were long and the text ran together.
- เลขา mentioned features not launched yet, such as 50 ทวิ. The owner asked to limit it to what an ordinary (non-admin) account sees on the website, and to know every corner of that.
- Tokens must be one pool per account, capped, whether the account uses LINE or the app.

**What changes**

*Open areas only.* Everything follows the launch policy (shared/featureAvailability.ts), so an area comes back on its own the day it launches.
- The catalog, lookup and catalog answers cover only open areas.
- A question that names a hidden area (50 ทวิ, document vault, tax, reports, goals, teams) gets only "not available yet, suggest it in บอกเรา". A word inside an open area's term does not count: ใบกำกับภาษี is a document. The admin overview is never named.
- The tools for hidden areas are off: search_vault, wht_tracking, tax_year_summary, and the goals domain of account_data.
- The prompt (secretary-v5) adds an ONLY OPEN AREAS rule. It drops "a restricted menu can exist… do not call it absent".
- Open areas are rewritten from a walk-through as an ordinary account (guest mode, 2026-10-24): real menu names (รายจ่าย, เงินค้างรับ), buttons, forms, filters, export menus, LINE menu buttons and the file attach in the chat. The full-year Excel export is on the jobs page.
- LINE follows the website: the vault, 50 ทวิ and ส่งเอกสาร shortcuts and saving files sent in LINE stay for system admins (services/lineLaunch.ts). Ordinary accounts get "ส่วนนี้ยังไม่เปิดให้ใช้งานในตอนนี้ครับ".
- Monthly summary cards no longer mention goals or link to the hidden reports page.

*LINE readability.*
- The prompt has LINE rules: short beats complete, answer first, at most 3 short lines, at most 5 items, at most 4 steps, blank lines between parts, no repeating the answer as steps.
- markdownToLineText:
  - A table row becomes "• name · amount" with the details on a second line.
  - "1. … 2. …" written on one line is split one per line (only in order, so "15, 30)" stays whole).
  - A long Thai paragraph is split one sentence per line.
  - Lists show at most 5 items plus "…และอีก N รายการ ดูต่อในแอป".

*One token pool.* The pool was already one per account (same user and cycle). Now:
- LINE AI messages share the app's per-minute limit (MESSAGE_RATE, same key).
- LINE shows a low balance (10% or less) under the answer.
- "เช็กโทเคน" in LINE answers with the same number as the app's ring, without calling the AI.
- Limits are unchanged:
  - Pro: 1,000 tokens a month, at most $1 of AI cost per account.
  - Trial: 25 tokens.
  - $5 a day for the whole app.

**Tested**
- Unit tests 596/601 (the 5 known failures).
  - New tests: the token pool shared by LINE and the app, the balance check, the shared rate limit, the low-balance note and refusal, the LINE text shaping, the LINE prompt rules, the LINE shortcut gate and the launch gate.
  - Catalog and prompt tests rewritten for open areas only.
- Real model, 8 LINE questions plus 2 reruns, $0.022: short answers, no hidden areas, "not available yet" for 50 ทวิ and goals, add-job questions one per line. One add-job run hit the 30 s timeout once; it answered in about 5 s on both reruns.
- e2e: assistant-live, assistant-chat and i18n-english, 68 passed. The 2 mic tests from package 50 fail as on dc2f114.

**Package**
- Archive SHA256 `72a8bfd257a4768256985a40e8ca39b1d3861d25bef16263c086ea9c5f8448a7`; manifest SHA256 `286387abf8b495444937eaea3ed14b9434759c879eab82147449a8c7d27e5e84`.
- 777 files, 21 changed (1 new).
- New entry `assets/index-tmKs63dv.js`.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full audit 0 vulnerabilities, the build, preflight and unit tests.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## LINE menu: แนบเอกสาร only for admin accounts - 2026-10-24

Built on top of 019cf43.

**Why.** The owner: "ปุ่มแนบเอกสารใน Line อ่ะให้เห็นแค่ของบัญชีแอดมินนะนอกนั้นไม่สามารถเห็นได้". แนบเอกสาร opens the document vault (/line-documents), which only admins have on the website. Ordinary accounts got a page that keeps loading.

**What changes**
- **Two LINE menus** (services/lineRichMenus.ts):
  - **Everyone:** a 5-tile default without แนบเอกสาร. Its picture is frontend/public/line/richmenu-everyone-2026-10-24.jpg, made from the live picture: the top half, the mascot tile included, is unchanged, and the bottom row has two wider tiles (กำลังดำเนินงาน, เปิดแอป).
  - **Admins:** the live 6-tile menu with the same actions, attached to LINE chats linked to a system admin.
  - Once the vault opens to everyone, the 6-tile menu becomes the default.
- **The server publishes them itself**, so no one types a secret:
  - Once per version and launch state, claimed through cashflow_claim_webhook so two Workers never publish at once. A failed picture upload removes the half-made menu.
  - Later runs find the menus by name.
  - The picture comes from the Worker's asset store. cloudflare/worker.ts shares env.ASSETS, and the content type is checked.
- **When it runs:**
  - The first LINE message after release publishes both menus and fixes that chat.
  - Each chat is checked once per Worker.
  - Linking a LINE account checks that chat right away.
  - Disconnecting returns the chat to the default menu.
  - Every day at 09:00 Bangkok, /api/setup-line-richmenu is added to the 0 2 cron and attaches the admin menu to admins' chats in bulk (and returns everyone else to the default). This covers role changes.
- The old one-time setup endpoint now runs the same sync (CRON_SECRET, safe to repeat).

**Tested**
- tests/line-menus.test.ts (6):
  - The admin menu equals the live one (scripts/line-menu.json areas).
  - The everyone menu has 5 tiles and no แนบเอกสาร.
  - The picture is a 2500x1686 JPEG under 1 MB.
  - The menus are published once; a busy claim waits; a failed picture is cleaned up.
  - Per-chat and daily bulk sync, and reset on disconnect.
- cloudflare-scheduled test updated for the 09:00 job.
- Unit tests 602/607 (the 5 known failures).

**Package**
- Archive SHA256 `ef5652793ebf72f096c0caba40d544b5fb3786a2b96eb24cb19e296730fe1ef5`; manifest SHA256 `dd14616611ffaed43d8745640fae84208ed3e0fa63e127741b89ba9366bf4b1a`.
- 780 files, 9 changed (3 new).
- The page entry stays `assets/index-tmKs63dv.js`.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full audit 0 vulnerabilities, the build, preflight, unit tests and a wrangler dry run.

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## Package 53 — Pro account assistant actions and navigation (2026-10-24)

Built on latest production commit (`a8ba732501377b638fa7bfa2ce83393b6910049c`) with its launched-feature policy, concise LINE replies, shared app/LINE token pool and rate limits preserved. Reviewed source commit: `7c93af73307c655f25ce22fe9783d1a612287e4f`. The owner explicitly requested deployment.

The assistant prepares owner-scoped quotation/invoice drafts, expenses and selected account settings from chat. Writes require a complete confirmation card and a fresh version of the authenticated account's record. Confirmations cannot select another owner, replay a committed action, change signed documents, send documents or move money. Exact confirmation text for one pending action does not invoke the paid model again; multiple actions require choosing the card.

Named page links and an optional automatic navigation mode open only launched pages in the current account's workspace while keeping the conversation open. Account changes clear the old conversation and discard delayed replies. Hidden goal/vault/tax tools remain unavailable for every plan. Existing waveform recording and editable transcription remain.

Active Pro and existing eligible Pro-trial accounts can use the real assistant with current verified-plan eligibility, quotas and the global kill switch unchanged. The actual deployment wrapper sets `keep_vars: true` and `AI_ADMINS_ONLY: "false"`, preserving other remote variables, secrets and both cron schedules.

Production prerequisite completed: applied the reviewed proposal-kind constraint expansion to project `rcllghixkclvkxhvttaw`; SQL results show all 18 action kinds, RLS enabled, and no anon/authenticated table privileges. No customer rows or grants changed. Private database evidence stays outside this repository.

Validation: merged full unit run 666 tests; 658 initially passed, five known baseline notification/monthly-report failures remained, and three new failures were resolved (launch-policy expectations and missing English labels). Focused follow-up passed all 20 affected tests, plus 9 knowledge/prompt and 72 LINE/shared-pool checks. TypeScript and Cloudflare build/preflight passed. Earlier owner/replay/atomic database tests, navigation/account-switch browser checks and release security checks are retained; live two-account validation is still pending and is not inferred from mocks.

Package: 802 files, 22,022,213 source bytes. Archive SHA256 `90981d3b8e68775befd5891de7fc83eebc56f71affa5bd22977981d660b2023b`; manifest SHA256 `9e678e390467948cfb221222791fad706f9c05c85829f5de4a19755ae252e745`. No private account evidence, credentials, dependency folders or symlinks included.

Rollback: redeploy package 52 and preserve runtime variables; restore the prior admins-only launch setting if needed. Keep the additive schema and customer records.

The later admin-only LINE attachment-menu release is also preserved; 33 menu/scheduler/LINE tests passed. The new disconnect endpoint is mocked in HTTP tests, and its focused disconnect regression passed without external LINE calls. Cloudflare dashboard currently deploys Git production from main; this release branch is published for provenance and the verified wrapper is deployed directly.


## Compound job edits and final tool execution — pkg54, 2026-10-24

The assistant can prepare withholding and payment changes to the same owned job in one confirmation. For example, no withholding plus fully received uses the new net amount and is saved atomically only after confirmation. Existing deposit dates/amounts and delivery state are preserved; ambiguous historical receipts ask for the specific missing date.

Both model providers now execute tools returned by the final allowed model response. They do not add another paid model call just to describe a prepared card. A final-step job-edit validation failure is shown directly instead of a generic request to split the task.

- Source commit: `513bc9e15b5377ffaef2ad939fb999c12ea9060b`. Production base: `9760e9650ef2fe39f6074cfbc32c7db4606b2678`.
- Package: 805 files, 22071193 bytes. Eight existing files changed, three added; all other pkg53 files unchanged.
- Archive SHA256: `00f3f1326f29410827b4f87710a236131d8c835bedbf08f0b45bec7cf1b25c3e`. Manifest SHA256: `ceddacfc0be3f4010817f58ceddfd8df77acd0715b1de4e9945d5bbddff7a9c9`.
- Validation: 100 focused tests, 17 security/cron/policy tests, TypeScript, Cloudflare build/preflight, zero npm audit vulnerabilities. Two synthetic owner accounts, identical IDs, foreign confirmation, replay and stale-version rejection tested. No paid model evaluation or customer record update.
- No schema/grant or dependency changes. Existing Pro rollout, microphone waveform, navigation and latest LINE changes retained. Wrapper variables/secrets and cron triggers retained with keep_vars.
- Live production chat and confirmation with two real Pro accounts remain unverified; the controllable session is Free and native Chrome interaction is unreliable. Asset parity cannot establish conversational correctness.
- Deployment: publish this package on cloudflare-production-20261018 and deploy its verified wrapper directly; Git build currently watches main. Record the resulting version separately after success.
- Rollback: redeploy the pkg53 package from 9760e9650ef2fe39f6074cfbc32c7db4606b2678; retain existing database data.


## เลขา finishes complex requests in one go - 2026-10-24

Built on top of 7fb59b7 (package 54: compound job edits and final tool execution). All of it is kept, including its one-card withholding plus payment edit.

**Why.** The owner: complex or detailed requests failed with "หลายขั้นตอนเกินไป บอกทีละขั้นตอน". The example: "บริษัท A paid the full price; change the job from 3% withholding to none and mark it paid". The owner asked whether a new API was needed. It was not. The limits were in our code.

**What changes**
- **8 tool steps by default** (AI_MAX_TOOL_STEPS, cap 12; was 4). That is enough to find, read, prepare one card per job and answer, also after the conversation model hands over. Every step is paid from the same token pool.
- **Long messages:** the message being answered may be 6,000 characters in the app (chat box, API) and LINE. Earlier turns stay at 2,000.
- **Gemini stalls:** a call that takes over 12 s, or answers 429/5xx, is tried once more while the request still has time. Two such stalls hit the 30 s timeout in about 25 test runs on 2026-10-24; the same calls normally take 1–3 s.
- **Every LINE card shown:** several cards go out as swipeable carousels (12 bubbles and 48 KB each, within LINE's five messages), and each keeps its own buttons. Before, LINE dropped every card after the third.
- **Wording:** the step-limit message no longer asks to split the request.
- **Prompt secretary-v7:** when the user clearly means several jobs, or lists items, it prepares one card per job or item in the same turn. Long messages are worked through, and the steps are never sent back one at a time.
- **wrangler.production.jsonc:** `keep_vars: true`, as the direct deploys of packages 53–54 did, so dashboard variables survive a deploy.

**Tested**
- Real Gemini 3.5 Flash-Lite on the merged code, five complex requests, $0.032. All gave correct cards in 3–7 s:
  - The owner's example: one card, withholding 3% → 0%, the deposit kept, received ฿10,000 → ฿30,000, outstanding ฿0.
  - Two jobs paid yesterday: 2 cards.
  - Three new jobs pasted in one message: 3 complete cards.
  - Rename plus new due date: 1 card.
  - Delivered plus 15-day credit plus 3%: 1 card.
- Unit tests 692/697 (the 5 known failures). Package 54's step-budget tests run at an explicit budget of 4.
- New tests: the 8-step default, the stall and busy retry, the 6,000-character message, the carousels (14 and 40 cards, every message under 50 KB) and the prompt rules.
- e2e: assistant-live, assistant-chat and i18n-english, 68 passed. The 2 known mic tests fail as before.

**Package**
- Archive SHA256 `a10fd0e53bf3956cbdbea6d30086a62958db51e31193257478edfd39f1ee121a`; manifest SHA256 `c4bffb027c6686499fa44d636160dc5827551b09362e759c25b292444eeb9ddf`.
- 805 files, 14 changed, none new.
- New entry `assets/index-D3x_NmWQ.js`.

**Checked** on the extracted package with a clean `npm ci`: cloudflare:check (17/17), full audit 0 vulnerabilities, the build, preflight, unit tests and a wrangler dry run (AI_ADMINS_ONLY "false" as live).

**Approved** by the owner in chat ("ดีพอย"), 2026-10-24.


## เลขา: Sonnet for thinking work, 2,500 tokens, 100-token ceiling; ฿159 until 30 Nov, consent v3 - 2026-10-24

Built on 82ca6a5 (package 55).

**Why.** The owner wanted Claude Sonnet 5.5 for hard requests and about 300–450 messages a Pro month. The owner asked "แก้ข้อยินยอม ดีพอย" for the move from ฿159 to ฿249 on 1 Dec 2569.

**AI**
- **Routing.** Claude Sonnet 5.5 (AI_SMART_MODEL) takes the work that needs thinking: analysis, advice, ranking, money targets, charts and statistics, writing, a picture or PDF, steps that build on each other, and texts of 600+ characters. Plain changes, even several at once, stay on Gemini 3.5 Flash-Lite. Gemini prepared those cards correctly in the real test.
- **Fallback.** Sonnet stays off until the Worker secret ANTHROPIC_API_KEY exists. If Sonnet fails (no credit, wrong key, outage), the same request is answered by Gemini.
- **Cache.** The shared rules (tools + system before USER) are cached for an hour. A 1-hour write is billed at 2×.
- **Allowance.** Pro gets 2,500 Krarok Tokens a month (AI_PRO_TOKENS_PER_CYCLE). One message costs at most 100 (AI_MESSAGE_TOKEN_CAP): the loop stops before a round that would pass it, the cards prepared so far stay, and the charge is capped.
- **Output cap.** Sonnet max_tokens is 4× the route cap (2,400 chat / 4,800 action), not 8,000.
- **Hidden goals.** Goals (not launched) no longer reach the model through cash_position or the settings fields.
- **Measured** on the sample account:
  - Gemini: 1–8 tokens a message.
  - Sonnet with the cache warm: 15–27.
  - The first Sonnet request of an hour: 57–66.

**Price notice and consent**
- **Notice.** The plans page, the Pro dialog and the landing page say "ราคาพิเศษถึง 30 พ.ย. 2569 · ตั้งแต่ 1 ธ.ค. 2569 รายเดือน ฿249". The notice hides itself from 1 Dec (Bangkok time). เลขา knows the date.
- **Prices.** Every price is unchanged: ฿159, ฿849, ฿1,490.
- **Consent v3.** A monthly card renewal agreed while the promotion runs reads "ยินยอมต่ออายุ Pro อัตโนมัติ ฿159/เดือน ถึงวันที่ 30 พ.ย. 2569 จากนั้น ฿249/เดือน จนกว่าจะยกเลิก …".
- **Next-charge line.** The card dialog's next-charge line matches it.
- **Database first.** supabase/migrations/20261024090000_card_consent_v3.sql makes the database accept v1, v2 and v3. It must run in Supabase before this release, or new card renewals are refused (as on 2026-10-22).

**Tested**
- Unit tests 704/709 (the 5 known failures).
- e2e: assistant-live, assistant-chat, billing, card-choice and i18n-english all pass, except the 2 known mic tests.
- Real Gemini and Sonnet: 10 questions, $0.24.
- The plans page was checked at 1280 and 375 px with no overlap.

**Package**
- Archive SHA256 `7144b18a94227bf336ceda723d5d608171e59265b4ac014e38b438744edb9719`; manifest SHA256 `49321d89bd4eeef5c955faba598bb95549e2d1458f8457d00836dca695a75322`.
- 811 files, 34 changed, 6 new.
- New entry `assets/index-C0UqKoq-.js`.

**Checked** on the extracted package with a clean `npm ci`: audit 0 vulnerabilities, cloudflare:check 17/17, the build, preflight, unit tests, and a wrangler dry run (AI_PRO_TOKENS_PER_CYCLE "2500", AI_MESSAGE_TOKEN_CAP "100").

**Approved** by the owner in chat ("แก้ข้อยินยอม ดีพอย"), 2026-10-24.


## เลขา thinks like a bookkeeper: slips, installments, tap-to-answer questions, editable cards; pictures, files and a looped font - 2026-10-24

Built on 067651d (package 56).

**Why.** The owner tested package 56 in production and found three problems:
- The owner sent a quotation request, then their own address and tax ID. That reply went to Gemini, which came back empty, so the user saw "ตอนนี้ยังตอบไม่ได้".
- "เพิ่มงานให้หน่อย ยายพึ่งให้เงินมา 3000 บาท" got four questions back. The owner: "มันจะมาถามตามแพทเทิร์นทำไม".
- After a failed quotation tool call, เลขา said "เตรียมใบเสนอราคาให้แล้ว" although no card existed.
- A slip paid to a shop was recorded as "บันทึกการโอน". The owner: "ดูชื่อดิว่าโอนให้ใคร".
- An attached picture showed as a file name. The owner wanted previews "เหมือนที่ทำกับมึงเลย" (as in Claude).
- The chat's loopless Thai was hard to read. The owner: "ฟอนต์ที่ไม่มีหัวแล้วมันทำให้อ่านยาก", like ChatGPT.
- A job paid in 3 installments was recorded as a partial payment, although the app has installments.
- Questions had to be answered by typing ("กูต้องมาตอบคำถามอีก 3 ข้อ"). The owner wants to tick the answers.
- A card could not be changed before confirming ("แก้ไขยอดได้ในแชทเลย").

**What changes**
- **Follow-ups.** A reply to the smart model's own question stays with it: the previous user message needed Sonnet, and the answer asked something.
- **Empty answers.** When the light model ends with no text and no card, Sonnet answers once more while time is left.
- **Prompt secretary-v8: infer the obvious.** Every change goes through a card, so job entry fills what the message clearly implies and states the assumptions:
  - who paid is the client;
  - money received means paid today;
  - no withholding mentioned means 0, and a private person never withholds;
  - fully paid means delivered today;
  - no name becomes "งานของ" + client.
- **Prompt secretary-v8: ask less.** เลขา asks only for what is still unknown. An amount or a name is never invented.
- **Prompt secretary-v8: honest status.**
  - A failed proposal is never described as prepared.
  - Issuer details given for a pending document go into that document, and saving them to the profile is offered.
- **propose_add_job.** The description was changed to match.
- **Transfer slips (prompt).** Work out the direction first:
  - Money out (a bill paid, or the user as the sender): an expense named after who was paid ("SCB มณี SHOP (สมาน)" → "ร้านสมาน", never "บันทึกการโอน"). The date comes from the slip in พ.ศ. The category is the app's, or อื่นๆ. The note holds the reference number only, never account numbers.
  - Money in, thought through step by step:
    - The payer's core name (บจก./หจก./บมจ. expanded) plus the memo ("Kol bbg") pick the job.
    - The amount is checked against what is owed after withholding. A full ฿3,000 on a job expecting ฿2,910 at 3% means the client did not withhold: ONE edit card with 0% and paid.
    - Several fits are asked about. No fit offers a paid new job with the client written in full.
    - Two-digit Thai years are พ.ศ.
  - The account context carries the owner's own saved names (issuer, bank account holder, LINE name; never account numbers) so the slip's sides can be told apart.
- **Payment card.** Paying the rest of a job with a deposit shows "รับครั้งนี้" (the slip) and "รับรวมทั้งงาน" apart. Before, it showed "ยอดรับ ฿29,100" for a ฿19,100 slip.
- **Deposit guard.** A second partial payment is refused instead of overwriting the deposit already recorded.
- **Pictures in the chat (computer, iPad and phone).**
  - A picture can be dragged onto the chat or pasted, as well as picked with the paperclip.
  - Before sending it shows as a thumbnail above the box, with a remove button.
  - In the chat it shows whole (not cropped) in a 240 px square (200 px on phones) on a soft grey, and a tap opens it large.
  - A picture sent alone shows no text bubble.
  - A file dropped where attaching is off never opens in the tab.
  - A PDF is a file card (icon, name, "PDF · size") before sending and in the chat.
- **Installments.**
  - propose_add_job takes installments, with the same rules as the app's job form: the installments together equal the amount after withholding, a received one is ticked with its date, an amount left out splits the rest equally, the status is installment, and the next due date becomes payDate.
  - propose_record_payment on such a job ticks the installment with that amount, never a deposit.
  - Prompt: งวด / ผ่อน / แบ่งจ่าย uses installments.
- **Tap-to-answer questions.**
  - New tool ask_user (up to 5 questions, each with up to 6 options, typed text where only the user knows) shows a card. Taps plus ส่งคำตอบ send all the answers as one message, and เลขา carries on.
  - The questions stay in the history, so a reply to Sonnet stays with Sonnet.
  - In LINE: the questions as lines, with quick replies for the first.
  - Prompt: never type the questions as a list.
- **Editable confirmation cards.**
  - A card for a new job, a payment or an expense has แก้ไข. Its fields (name, client, value, withholding, dates; amount and date; expense fields) become inputs.
  - ใช้ค่านี้ sends action "revise". The server prepares the card again from the original tool call with those fields, with every check and no model call or tokens. The old proposal is cancelled.
  - Proposals now keep tool and args. **Run supabase/migrations/20261024120000_ai_proposal_args.sql in Supabase first.** Without it, proposals are saved as before (the insert retries without the columns) and editing answers "แก้ในการ์ดไม่ได้แล้ว".
- **Chat font.** The chat (เลขา page, panel, buddy) uses IBM Plex Sans Thai Looped, the same family with heads on the letters. The rest of the app keeps IBM Plex Sans Thai. The typography test now expects the looped face.

**Tested**
- Real AI:
  - "เพิ่มงานให้หน่อย ยายพึ่งให้เงินมา 3000 บาท" gave one card (งานของยาย · ลูกค้า ยาย · ฿3,000 · delivered and paid today · no withholding) with the assumptions listed, on Gemini, 6 tokens.
  - An unpaid job asked only about delivery and the credit term.
  - The quotation chat (synthetic address and tax ID): the reply went to Sonnet and asked for the missing name; the next message gave the quotation card with the issuer details.
- Synthetic slips with real Sonnet:
  - A ฿60 bill paid to "SCB มณี SHOP (ป้าแดง)" gave an expense card "ร้านป้าแดง · ฿60 · 24 ต.ค. 2569 · อื่นๆ", noting the reference only.
  - A ฿19,100 transfer from the client was matched to its ฿19,100 balance, with "รับครั้งนี้ ฿19,100".
  - A K BIZ ฿3,000 transfer from "บจก. ตัวอย่างมีเดีย" with the memo "Kol bbg":
    - with a matching job: recorded in full;
    - with the job at 3%: one edit card, 3% → 0% and paid ฿3,000, with the reason;
    - with no job: a paid new job "Kol bbg" for "บริษัท ตัวอย่างมีเดีย จำกัด".
- Unit tests 715/720 (the 5 known failures). New tests: tests/ai-installments-questions.test.ts (installments, ticking an installment, ask_user and LINE, revise).
- Real Gemini:
  - The owner's "ค่าเรียนขับรถ 500,000 ... 3 งวด" gave 200,000 received plus 150,000 due 1 Nov and 150,000 due 1 Dec.
  - "เพิ่มงานออกแบบโลโก้ 4500" used ask_user (client, credit term).
- e2e: assistant-live, assistant-chat and i18n-english all pass except the 2 known mic tests. New tests: picture preview, drag and drop, sent picture and viewer, PDF card, tap-to-answer questions and card editing at 1440 and 390 px, no overlapping text. billing e2e also passes.

**Package**
- Archive SHA256 `6991289c9b2f95d4aa8018da85980510bbb30a2a772cf7976b76ee051ff4b8fe`; manifest SHA256 `7722e0daf82e2087038400a5d76eeac4dd8652da1c3fb1485108fd711c71f0e9`.
- 814 files, 23 changed, 3 new (2 tests, 1 migration).
- New entry `assets/index-BvZWtjjS.js`.

**Checked** on the extracted package with a clean `npm ci`: audit 0 vulnerabilities, cloudflare:check 17/17, the build, preflight, unit tests and a wrangler dry run.


## เลขา chat history kept per account; the privacy page names the AI providers - 2026-10-24

Built on 4e2b97f (package 57).

**Why.** The owner: "ทำให้บันทึกประวัติการคุยได้ สำหรับผู้ใช้นั้นๆ". Chats disappeared on reload ("ประวัติแชตจะหายเมื่อโหลดหน้าใหม่").

**What changes**
- **Storage.** supabase/migrations/20261024150000_ai_conversations.sql adds cashflow_ai_conversations and cashflow_ai_messages.
  - Row level security is on with no policy, and anon/authenticated have no grants, so only the server reads them.
  - The rows go with the account (on delete cascade from auth.users), at most 200 chats per account (the oldest unpinned ones go), 400 messages per chat read back.
  - Pictures and files are not stored, only their name and kind.
  - **Run it in Supabase first.** Before it runs, chat works as before and is not kept.
- **Server** (backend/src/ai/conversations.ts).
  - A message with a conversationId (c_ + uuid) is kept with its answer and cards after the answer succeeds. A history failure never costs the answer.
  - GET ?view=conversations lists the account's chats. GET ?view=conversation&id= returns one chat, with each confirmation card's current state from its proposal (applied / cancelled / stale / expired).
  - Actions conversation-update (rename, pin, archive) and conversations-delete.
  - An edited card replaces the old one in the stored chat.
  - Every read and write is scoped to the session's user id.
- **App.**
  - New chats get a c_ id.
  - The list loads from the account, grouped today / yesterday / 7 days / earlier (new group ก่อนหน้านี้).
  - A stored chat loads its messages when opened.
  - Confirmed cards show บันทึกแล้ว. Expired ones show a new "หมดเวลายืนยัน" state.
  - Pin, archive, rename and delete reach the server.
  - The sidebar note reads "ประวัติแชตเก็บไว้ในบัญชีของคุณ".
- **Privacy page (Thai and English, effective 24 Oct 2569).**
  - Chat history is a kept data type: it can be deleted, attachments are not stored, and there is a 200-chat limit and deletion with the account.
  - Google (Gemini) and Anthropic (Claude) process เลขา requests in the app and LINE. Before, it said Anthropic for LINE only and did not list Gemini.

**Tested**
- Unit tests 717/722 (the 5 known failures). New test: tests/ai-conversations-database.test.ts runs the migration in PGlite and checks the cascade, the constraints, RLS and that there are no browser grants.
- e2e: a stored chat list, opening a chat with its card state, a follow-up kept in the same chat with its history, a new chat id. assistant-live, assistant-chat, i18n-english and billing pass except the 2 known mic tests.

**Package**
- Archive SHA256 `483a518423d5f7c8a20c1e56a0232b469b05f60ded9756a0324879bbcaf208c4`; manifest SHA256 `e2d682d59d1f546c4bed786bf2fc0e23b208ef84ad035afe0f71399d6ed86f5c`.
- 817 files, 12 changed, 3 new.
- New entry `assets/index-B-WATazB.js`.

**Checked** on the extracted package with a clean `npm ci`: audit 0 vulnerabilities, cloudflare:check 17/17, the build, preflight, unit tests and a wrangler dry run.


## The notifications thread keeps what was tapped and typed; each chat keeps its latest 400 messages; the chat font reads like Thonburi - 2026-10-24

Built on 98de117 (package 58). No SQL: it uses the chat history tables from package 58.

**Why.** The owner tapped สรุปเดือนนี้ in แจ้งเตือนอัตโนมัติ and it was gone after a reload ("แชทนี้ทำไมมันไม่จดจำ"). The thread's quick replies were answered in the browser and never kept. On space, the owner chose to tidy up quietly: no "storage full" message, nobody is stopped from chatting.

**What changes**
- **The notifications thread is kept** (backend/src/ai/conversations.ts, handlers/assistant.ts).
  - One history per account. Its id is made on the server from the account id in a v5 uuid shape. Chats a browser starts must be v4 (crypto.randomUUID), so no browser can take another account's thread id.
  - Kept: quick replies (new action line-quick; the server makes the card again from the account's own data), the payment buttons (line-due with the button's line as `shown`), typed partial amounts (line-partial), and messages to เลขา typed in the thread (message with thread: 'line').
  - GET ?view=line returns `history` (its latest 200 messages). The app puts them among the notices in time order, and confirmation cards show what became of them.
  - The thread is left out of the chat list and out of the 200-chat pruning.
- **Space.** Each chat keeps its latest 400 messages (all the app shows); older ones are deleted after each new message, only in that account's chat. The notifications thread keeps 200. Measured: about 1.6 KB per message and answer.
- **Chat font.** The owner found IBM Plex Sans Thai Looped dated and wants the look of Apple's Thonburi (as in the Claude app). The chat now uses Noto Sans Thai Looped (Google Fonts, looped, close to Thonburi, the same on every device); the IBM Plex Looped download is gone. The rest of the app keeps its font.
- **Chat list.** The hidden pin / ⋯ buttons on a chat row take no clicks until they show, so the end of a long title opens the chat instead of pinning it.
- **Privacy page (Thai and English).** Chat history includes what is tapped or typed in the notifications thread; each chat keeps its latest 400 messages (200 in the notifications thread), older ones are deleted automatically.

**Checks.** Unit tests 720/725 (the 5 failing are the same as before). New: the thread is kept per account and B's history stays empty; B's thread id is refused from A's browser; the thread is not in the chat list; a chat keeps 400 and another account's chat is untouched; the thread id fits the table's check. Screen tests 46 pass, the 2 microphone tests fail as before; new: kept taps come back in time order, no overlapping text. A one-off run with the real Google font loaded (computer and phone) found no overlapping text. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.


## Chat: Apple's Thonburi, no Share item, an iOS look on computers, and quotations that remember what a file showed - 2026-10-25

Built on ce83a6f (package 59). No SQL.

**Why.** The owner saw Noto Sans Thai Looped live and found it not pretty ("มันไม่สวยเลยไอ้ฟอนต์น่ะเปลี่ยน"); they want the Claude app's look, which is Apple's Thonburi.

**What changes**
- frontend/src/features/assistant/assistant.css: a 'Krarok Chat Thai' face made from the device's own Thonburi (local(), Thai letters only: regular for 300–500, bold for 600–900). The chat stack is 'Krarok Chat Thai', -apple-system, BlinkMacSystemFont, 'Noto Sans Thai Looped', then the app's font.
  - Mac, iPhone and iPad: Thai in Thonburi, English in the system font, as in the Claude app; nothing is downloaded.
  - Other devices (no Thonburi): Noto Sans Thai Looped as before.
  - Chrome's own fallback would not pick Thonburi before Noto (checked with getPlatformFontsForNode), hence the local() face. Apple's Thonburi UI (without the small gap before โ/ใ) cannot be reached by a web page, so the gap shows as it does in the Claude app.
- The rest of the app keeps its font.
- **No Share item.** The owner: "เอาปุ่มแชร์ออก". The chat row menu (⋯) loses its disabled "แชร์ · เร็ว ๆ นี้" item; it now has เปลี่ยนชื่อ, ปักหมุด, เก็บถาวร and ลบ. The English entry goes too, and the history test checks there is no Share item.

- **iOS-style chat on computers and iPads** (the owner: "หน้าตาอยากได้ทางการขึ้น เหมือนระบบ ios หน่อย อันนี้ดูเหมือนเด็กเล่นไป"). Only the 744px+ layout (`.asx:not(.is-mobile)`); phone screenshots before and after are pixel-identical apart from the clock.
  - Start screen: a plain title (no gradient text), the squirrel at 72px without its glow, and the four questions as one iOS inset-grouped list under the section title คำถามแนะนำ: Settings-style orange icon squares, hairlines, chevrons.
  - Dark: iOS black behind the chat instead of the orange and pink aurora; your own bubble is a solid colour instead of a gradient; no glow behind the top-bar squirrel.
  - The welcome test now expects one column of four rows on computers and the 2 × 2 cards on phones.

- **Quotations remember files** (the owner, after a quotation chat: the client in a picture was asked for again, shortened to "มูลนิธิ", the job was asked again, the price came as invented options and 1 × total).
  - New tool note_from_file (both routes, only for a file in this message): the model writes down what the file shows in the same step as its other tools. The reply carries it as `memo`; the chat keeps it on เลขา's message (never drawn) and sends it with later messages as "[อ่านจากไฟล์ที่แนบ: …]" before that answer; a user turn with a file says "[แนบไฟล์: name]". Stored chats keep it as a hidden `memo` card. History turns may be 2,000 characters.
  - The smart model stays on while the questions run: walking back through เลขา's question turns, a user turn that needed it or any file keeps it (continuesSmartWork replaces answersSmartQuestion). An answer that asked nothing ends the run.
  - Prompt secretary-v9: never ask again for what the chat has (earlier words, answers, file notes; "ส่งไปแล้ว" means look back), all missing items in one ask_user call, options only from real data (no invented round prices), "งานตัดต่อ 5 คลิป" = quantity 5 unit คลิป with the price per clip, a client from a file in full with address/tax ID/phone.
  - LINE sends no files to เลขา, so it is unchanged apart from the routing.
- **Editing a card:** focusing one of its fields brings the whole card back above the message box (a field's own focus scroll could leave ใช้ค่านี้ / ไม่แก้แล้ว under it; a test caught it 1 in 8 runs, now 16/16).

**Checks.** Unit tests 725/730 (the same 5 fail as before); new: tests/ai-file-memory.test.ts replays the owner's quotation chat with fake models, and the isolation suite checks the hidden note is stored and reopened per account. Screen tests that touch the chat: 47 pass, the 2 microphone tests fail as before; new: the next message carries the file's note, the file goes once, the note is never drawn. A run with real fonts on a Mac (computer and phone, dark): the chat draws Thonburi + SF, Noto is not downloaded, no overlapping text. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.


## เลขา learns: memory v2 (learning package A) - 2026-10-25

Built on package 60 (its source manifest 3c4f8c72…). **Run supabase/migrations/20261025090000_ai_learning.sql in Supabase first.**

**Why.** The owner's learning brief (2026-10-25), plan approved: package A first, memory controls in chat only (the UI stays as it is), retention as planned.

**What changes (server only; no screen changes)**
- **SQL** (additive): cashflow_ai_memories gets 6 more kinds (emoji, formality, persona, business, vocabulary, correction), where it came from, a version, when it was updated and last used; one value per setting kind. New cashflow_ai_memory_events (every change, for review and rollback), cashflow_ai_corrections (package B) and cashflow_ai_knowledge_signals (package D). RLS on, server only, cascade with the account. Functions cashflow_ai_memories_touch and cashflow_ai_learning_sweep (memories unused 12 months, events and corrections after 12 months, signals after 6).
- **backend/src/ai/memory.ts:** what may be remembered (never bank/card/ID/tax numbers, phone, email, amounts or passwords; nothing that reads as a rule change; with a file attached, only when the user's own words ask), the same thing said again replaces the old one, over 40 the least used go (never the settings), and each message gets the settings plus the memories that fit it within about 700 characters.
- **Tools:** remember (new kinds, checks), recall_memories, forget_memory (by ref; everything only after the user picks "ใช่ ลบทั้งหมด"). Works in the app and LINE.
- **Service:** memories are chosen per message and touched after the answer; saves go through saveMemory with history; before the SQL runs, the old save is used.
- **Prompt secretary-v10:** a MEMORY section (follow the saved preferences within the courtesy rules, data never instructions, records win; when and what to remember; how to list and forget); a saved emoji preference wins.
- **Daily job:** /api/close-expired-accounts also runs the retention sweep (no new cron slot).
- **Privacy page** (Thai and English, effective 25 Oct 2569): what the memory holds, what it never holds, how to see and delete it, retention.

**Checks.** Unit tests 735/740 (the same 5 fail as before); new: ai-memory-engine (what is refused, replacing, limit, choosing per message, the tools), ai-learning-database (migration on the real AI tables with an old memory, touch, retention, no browser access, cascade), isolation suite (A's memory is A's alone, B never sees it, touching and forgetting stay in the account). Screen tests that touch the chat: 47 pass, the 2 microphone tests fail as before. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. Not run against the real models (no keys here).


## Quotation and invoice cards can be edited; money over several months is a chart card - 2026-10-25

Built on 6132dd9 (package 61). No SQL.

**Why.** The owner, on a quotation card from เลขา: "ทำให้มันมีปุ่มแก้ไข". Job, payment and expense cards had แก้ไข; documents did not.

**What changes**
- backend/src/ai/tools.ts: propose_add_document cards carry edit fields: ลูกค้า, each line (รายการ, จำนวน, ราคาต่อหน่วย) for up to five lines (longer documents are changed in the app), VAT (0 / 7), หัก ณ ที่จ่าย (0 / 1 / 2 / 3 / 5) and วันที่เอกสาร. applyCardEdit puts a changed field back into the call that prepared the card (client.name, items[n], rates as numbers).
- backend/src/ai/service.ts: reviseProposal uses applyCardEdit, and an edited quotation keeps its number (the old card is cancelled, so its number was never used). The tool checks everything again; a bad value answers 422 and the card stays.
- frontend/src/features/assistant/ChatCards.tsx: a 0% choice reads "ไม่มี VAT" for VAT and "ไม่หัก" for withholding (English: No VAT / None). The edit form itself is the same one job cards use.
- assistant.css: an editing card scrolls 48px (was 20px) above the message box, so the time line under it stays clear too.

- **Money chart card** (the owner's brief "FINANCIAL RESPONSE RENDERING FIX": "2 เดือนที่ผ่านมารายได้กูเป็นไงบ้าง" came back as ASCII bars and a Markdown table). Cause: financial_summary returned exact monthly figures to the model only; no card drew them, and the prompt allowed Markdown tables, so the model drew its own.
  - backend/src/ai/moneyChart.ts: moneyChartFrom builds a `money_chart` card (title, period, months [month, label, income = received, expense = actual_expenses, net = net_cash_flow, partial], totals from the tool's totals, omitted) from financial_summary's own result, checked with a zod schema; months not started are left out, the month in progress is marked, at most 12 months are drawn while totals cover the whole period. moneyChartDisplay gives the model the same figures written the same way. cleanAnswerText drops character-drawn bars always and a Markdown money table when a money card is shown (other tables stay); the gateway runs it on every answer, Gemini and Sonnet alike.
  - shared/thb.ts: formatTHB = Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }) for the server and the app.
  - Prompt secretary-v11: several months → financial_summary once; one or two lines about the card, amounts only from display; never character charts; tables only for lists of records.
  - App (ChatCards.tsx, assistant.css): the card shows totals, grouped bars (income then expense, colours checked for colour-blind separation in light and dark, the month in progress hatched), a legend, a figures line for the picked month (hover, focus, tap; latest by default), a "ดูเป็นตาราง" table, an empty state and the 12-month note; an invalid card draws nothing. Month names follow the reader's language.
  - LINE: the same card as rows (totals, then the latest six months).

**Checks.** Unit tests 744/749 (the same 5 fail as before); new tests/ai-money-chart.test.ts (exact figures and satang, totals equal the months, month in progress, future months left out, 12-month cap, empty period, formatting, text cleanup, LINE rows, the prompt contract) and tests/ai-document-card-edit.test.ts (fields, revised totals with VAT 7% and WHT 3%, same number, bad values refused, numbered labels, six lines → app). Screen tests that touch the chat: 53 pass, the 2 microphone tests fail as before; new: a quotation card edited on a computer and a phone, with the right 0% labels, the revise request, and no overlapping text; the money chart on a computer (light and dark) and a phone: totals, bars, legend, hover figures, table, no characters drawn, no overlap; the empty state. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.


## เลขา learns from corrections (learning package B) - 2026-10-25

Built on 31fa17f (package 62). No SQL: cashflow_ai_corrections came with package 61's migration.

**Why.** The owner's learning plan, package B ("ทำชุด B ต่อ"): learn from what the user fixes, per account, verified, with history.

**What changes (server only; no screen changes)**
- backend/src/ai/learning.ts: lessons only from confirmed cards: a field the user changed on เลขา's card (expense category or name, a job's client, name or withholding, a quotation's client or line wording), or an edit card changing an expense's category or a job's client or withholding. Each lesson becomes this account's rule (memory kind correction, source correction), e.g. "ค่าใช้จ่าย 'ร้านสมาน' → หมวด ค่าอุปกรณ์/ซอฟต์แวร์", replacing the earlier rule for the same subject; three changes with different answers in 60 days mark it "เปลี่ยนบ่อย ถามผู้ใช้ก่อน". Amounts and dates are never lessons; a rule that names money or ID numbers, contacts or reads as an instruction is not kept. Every learned correction goes in cashflow_ai_corrections.
- tools.ts: lessons ride on the card's saved call as __learn, written only by the server (reviseProposal's comparison, or the record's current values for edit cards); a model's own __learn is dropped. cardValue reads a field's value before the change.
- service.ts: reviseProposal keeps เลขา's first value across several edits; confirmProposal learns after the card is applied (a failure never costs the confirmation); the app and LINE both learn (channel recorded).
- supabaseDb.ts: claimProposal returns the card's call; saveCorrection, recentCorrections.
- memory.ts: a rule comes with a message naming its shop, client or work, and with any file (a slip names them in the picture), within the budget; isRememberable shared with memory saving.
- Prompt secretary-v12: how to use กฎจากการแก้ rules, follow the user when they now say otherwise, ask first when a rule is marked เปลี่ยนบ่อย, never call remember for them.
- Privacy page (Thai and English): what is learned from corrections, its history, 12-month retention, and that it is per account and can be forgotten.

**Checks.** Unit tests 749/754 (the same 5 fail as before); new tests/ai-correction-learning.test.ts (card edit → confirm → rule and history; used for the same shop or a slip, not otherwise; newer correction replaces; back-and-forth asks first; cancelled cards and a model's __learn teach nothing; phone numbers never a rule; edit cards; quotation client and wording). cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. Not run against the real models.


## The floating panel edits cards and answers questions; an expense card's category is picked from a list - 2026-10-25

Built on de65b24 (package 63). No SQL.

**Why.** The owner, on an expense card in the floating panel on the dashboard: "นิดนึง อยากให้กดแก้ไขได้". The panel (AssistantBuddy) drew cards without onRevise and onAnswer, so แก้ไข and tap-to-answer questions only worked on the full chat page.

**What changes**
- frontend/src/features/assistant/AssistantBuddy.tsx: cards get onRevise (the card is replaced by the revised one, as in the full chat) and onAnswer/answered for questions cards; a reply's file note is kept like the full chat's.
- backend/src/ai/tools.ts: an expense card's หมวดหมู่ is a choice from the app's 8 categories (APP_EXPENSE_CATEGORIES, the same list as ExpenseDrawer's; a test compares them), then up to 6 of the account's own categories, and the current one.
- frontend/src/features/assistant/ChatCards.tsx: only rate fields read as percentages (0% = ไม่หัก / ไม่มี VAT); other choices read as themselves.

**Checks.** Unit tests 750/755 (the same 5 fail as before); new: the category list matches the expense form, the account's categories come along, the card offers them. Screen tests for the chat and the panel: 54 pass, the 2 microphone tests fail as before; new: in the panel on the dashboard a question is answered by tapping and an expense card is edited with the category picked from the list, no overlapping text. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.


## เลขา starts from past work for the same client (learning package C) - 2026-10-25

Built on 52ae524 (package 64). No SQL.

**Why.** The owner's learning plan, package C ("ทำชุด C ต่อเลย"): remember how work for a regular client was done, offer it as the starting point, never treat past amounts as current.

**What changes (server only; no screen changes)**
- backend/src/ai/pastWork.ts: read tool past_work(client). From the account's own saved documents and jobs (work done without เลขา counts too; nothing new is stored): the names in the records, the client's saved details (from the newest document: full name, address, tax ID, branch, contact, phone), the usual VAT, withholding, credit term and payment term (most common), the usual lines (wording, unit, latest unit price, how often), the latest three documents and jobs. Payment status, amounts received and paid dates are never included. Names match by their core (บจก. / บริษัท … จำกัด / Co., Ltd., spaces and punctuation ignored); an unknown client says there is no earlier work.
- tools.ts: past_work among the read tools in both routes; only the signed-in account's data.
- Prompt secretary-v13: before a quotation, invoice or job for a client the account may know, call past_work with the other reads; start from its details, rates and wording; offer a past unit price as an option, never as a fact; say it comes from past work; ask only for what is still missing.

**Checks.** Unit tests 753/758 (the same 5 fail as before); new tests/ai-past-work.test.ts (details, usual rates and terms, lines with the latest price, newest first, no payment fields, no other client, name matching, unknown client, refused arguments, the prompt rule). cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. Not run against the real models.


## เลขา notices what its feature knowledge misses, and a weekly report for the owner (learning package D) - 2026-10-25

Built on 9554776 (package 65). No SQL (cashflow_ai_knowledge_signals and its 6-month sweep came with package 63).

**Why.** The owner's learning plan, package D ("ทำชุด D ต่อ"): know what people could not find, asked for, or got a wrong menu answer about, and measure cost, cards and corrections, so a person decides what to change. Nothing changes the knowledge, prompt, rules or tools by itself.

**What changes (server only; no screen changes)**
- backend/src/ai/signals.ts (new): rules, no model call. Four kinds: not_found (an app question with no match in the knowledge), not_available (a feature that is not open yet), feature_request ("อยากให้มี…"), wrong_answer ("ผิด ไม่มีเมนูนี้" right after an app how-to answer; corrections while adding a job do not count). At most two per message. The question is kept without e-mail addresses or long numbers, at most 200 characters.
- gateway.ts: signals from the message, plus feature_lookup searches that found nothing; service.ts saves them after the reply (best effort; never charges tokens, never blocks the reply); supabaseDb.ts writes them to cashflow_ai_knowledge_signals with the channel and prompt version.
- database/ai_learning_report.sql (new, read only, not run by the app): one JSON for the owner to run in the Supabase SQL editor. Covers 7-day cost per message, route and model; 30-day cost per active account; cards prepared, confirmed and cancelled; corrections per 100 confirmed cards; expense category fixes per 100 new expenses; signals and the most common questions; wrong answers per prompt version; memory counts. No user ids leave it.
- knowledgeBase.ts kb-2026-10-25.1: "ทวิ 50", "ทวิ50" and "ใบทวิ" now find the 50 ทวิ entry.
- privacy.html (Thai and English): questions the secretary cannot answer yet, what is kept and why, kept 6 months.

**Checks.** Unit tests 755/760 (the same 5 fail as before); new tests/ai-learning-report.test.ts (signal kinds, no signal for money questions or job corrections, redaction, report numbers on a test database, no user ids, read only). English privacy page test. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. Not run against the real models; a local learning test set (18 cases) is ready for that.


## Model routing V2: Gemini or Sonnet by intent, complexity, risk and context, with a routing log - 2026-10-25

Built on package 66 (published first; its manifest f6cc9952…). SQL: supabase/migrations/20261025130000_ai_routing_log.sql (additive, one column; the app works before it runs, the routing log is simply not saved until then).

**Why.** The owner's brief "KRAROK AI — INTELLIGENT MODEL ROUTING V2": the cheap model for simple work, Sonnet where it is needed, risky work checked and confirmed, and every request traceable to the model chosen and why.

**What changes (server only; no screen changes)**
- backend/src/ai/routingPolicy.ts (new): each message is read on intent, complexity, risk and context with plain rules, no model call. Sonnet for documents (quotation, invoice, receipt), deletes, important edits (amount, tax, client, terms), complex additions (three or more conditions, installments), files, long texts and analysis. Gemini for talk, app questions, money and job lookups, summaries and charts, plain additions and payments. Clear changes go straight to the change tools (no hand-over round). Replies to Sonnet's own questions stay with Sonnet.
- Answers without a model, 0 tokens: "<page> อยู่ตรงไหน" (only when the whole message is that question, only for pages open to everyone) with the page button, and "เรียกกูว่า …" / "ไม่ต้องใช้อีโมจิ" saved through the same memory checks.
- gateway.ts: when Sonnet fails, Gemini still answers questions and analysis, but a document, delete, important edit or complex change is held back with a polite message and no charge (AI_LIGHT_FALLBACK_WRITES=true allows the take-over). At most one step up from Gemini to Sonnet per message, only when Gemini left nothing behind: an empty answer, stuck in tool calls, or a change failing the tool's checks three times; and when Gemini hands over a document, delete or important edit, the action model is Sonnet. No tool action is repeated on a model switch.
- Routing log on the usage row (service.ts, supabaseDb.ts, best effort after the charge): version, intent, complexity, risk, context, tier and reason, tool set, hand-over, escalations, fallback, provider retries, each model call (provider, model, USD, tokens, rounds), tool names, time taken, outcome, card ids, channel. Never the user's words, figures or names. Failed requests are logged too.
- database/ai_learning_report.sql: routing sections (Sonnet share, cost per provider, per tier with p50/p90 time, per intent, escalations, failed routing, confirmed cards by model, cost per confirmed card); runs before and after the SQL.
- config.ts: AI_ROUTING_POLICY (v2 by default; v1 restores the 24 Oct rules exactly), AI_LIGHT_FALLBACK_WRITES. Gemini adapter reports its retries. Prompt and tools unchanged (secretary-v13); one personality and memory for both models as before.

**Checks.** Unit tests 765/770 (the same 5 fail as before); new tests/ai-routing-v2.test.ts (the brief's table and extra cases, exact answers, Sonnet hold-back and allowed take-over, one-step escalation and no repeat after a saved proposal or memory, hand-over to Sonnet, prompt injection still a confirm card, two accounts at once, the log has no user words, v1 rollback, charge before the log, failures and timeouts logged); report tests with and without the column. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. Not run against the real models.


## AI cost fix: fair token accounting, cheaper shared cache, no cut-off answers - 2026-10-25

Built on 1c1534f (package 67). SQL: supabase/migrations/20261025150000_ai_cost_accounting.sql (additive; the app works before it runs, with the earlier settle and without the soft budget and cache choice).

**Why.** The owner's brief "KRAROK AI — COST OPTIMIZATION & PROFITABILITY FIX". In the real-model test the first Sonnet request after the shared cache expired cost $0.100 instead of about $0.018: the shared rules' 1-hour cache write (21,217 tokens at $4/MTok, about $0.083). It reached the user's 100-token ceiling, the user paid 100 tokens, and the answer stopped early with a questions card under "could not finish".

**What changes (server only; no screen changes)**
- cost.ts costSplit: each call's real spend, what the user pays (the shared rules' cache write priced as a read) and the app's overhead. Krarok Tokens come from what the user pays; cost_usd stays the real spend, so the daily cap and reports keep every dollar.
- gateway.ts: the 100-token ceiling counts what the user pays; a separate real-spend safety limit per message (AI_REQUEST_COST_LIMIT_USD, $0.30). A card prepared before a provider failure is kept (no second preparation). A failed Sonnet attempt's finished rounds are the app's cost, never charged. Questions end the turn (no paid round for a lead-in line; Sonnet questions turns 24–29% cheaper in the real test), with a standard line above them. Soft budget: past 80% of the daily cap (AI_SOFT_BUDGET_SHARE), no optional Sonnet use.
- Shared cache choice: 5 minutes while Sonnet is quiet (fewer than 2 Sonnet answers in the last hour), 1 hour while busy; the 1-hour write only pays off from two Sonnet messages an hour. Before the SQL runs it stays on 1 hour.
- service.ts: never charges past the tokens left (cashflow_ai_settle_capped, atomic under the account lock, idempotent); a request that could pass the daily cap is refused before it starts; a failed request keeps its real cost on the released row.
- pastWork.ts: a client name no longer takes another client's records ("ร้านกาแฟตัวอย่าง" took the address and 3% withholding of "บริษัท ตัวอย่าง จำกัด"); exact name first, a partial name only when it fits one client, otherwise ask which.
- database/ai_learning_report.sql: spend by day and month, cost per paid account (no ids), trial cost, platform overhead (shared cache writes, failed attempts, quota overrun, cache read savings), Sonnet hours (whether the 1-hour cache pays off).

- The 5 unit tests that had failed since before the Cloudflare move were stale, not regressions, and now match the code: two notification tests used record-added, which notify.ts acknowledges without sending since the LINE cards moved to their own routes (they now check line-disconnected: no DB error text, a LINE rejection is 502); the monthly report and LINE summary tests now expect the three-number LINE summary (net profit −฿ 4,000 in the header; the email and Excel keep the net cash flow −5,000); the monthly work value test counts work in progress by its payment date (owner, 2026-10-25: "นับตามวันนัดจ่าย", as the app already does). No code changed for them.

**Checks.** Unit tests 782/782; new tests/ai-cost-accounting.test.ts (cost split, first-of-the-hour cache write, cache hit, expiry, safety limit, partial tool success, failed attempts, soft budget, settle capped and idempotent on a test database, two settles at once, other accounts untouched, hard stop before start, timeout cost, cache choice); past-work name tests. cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. Real models (owner-approved budget): about $1.21 spent on about 70 test messages.


## Pro prices include Stripe's card fee: ฿177 / ฿895 / ฿1,562 - 2026-10-25

Built on package 68. No SQL. Stripe step after the deploy (owner): scripts/stripe-reprice.ts.

**Why.** Owner, 2026-10-25: "ผู้ใช้ออกค่าธรรมเนียมเอง กูต้องได้ยอดสุทธิ ตามราคาที่กูตั้งเป๊ะๆ" (the customer pays the Stripe fee; the owner keeps ฿159 / ฿849 / ฿1,490), one price for every payment method.

**What changes**
- shared/proPricing.ts: PRO_NET_TARGET 159 / 849 / 1,490; STRIPE_TH_CARD_FEE (3.65% + ฿10, VAT 7% on the fee: stripe.com/en-th/pricing and Stripe's Thailand tax page, checked 2026-10-25); PRO_PRICING 177 / 895 / 1,562, each the lowest whole baht that nets the target after a domestic card (tested). Every price screen, the consent text and เลขา's knowledge read it. The regular ฿249 and the 30 Nov end of the monthly promotion are unchanged. Consent stays v3 (same wording; each checkout stores its exact text).
- scripts/stripe-reprice.ts: the owner moves the Stripe catalog (dry run first, --apply to create; new price per existing lookup key, same product and metadata, the lookup key transferred; checked with checkout's own rules). Until it runs, checkout refuses to sell (the catalog no longer matches the screen) instead of charging another amount.
- Nets per payment: domestic card ฿159.39 / ฿849.35 / ฿1,490.30; PromptPay about ฿174 / ฿879 / ฿1,534; foreign cards up to about ฿2 / ฿10 / ฿18 less than the target. At a 10% VAT rate a domestic card nets ฿0.11 / ฿0.93 / ฿1.71 under the target.

**Checks.** Unit tests 784/784 (pricing, consent text, catalog checks, checkout amounts, the repricing plan); pricing and card screen tests 34/34 on phone and computer; cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.


## The plans page shows ฿159 with the payment fee before paying (฿159 + ฿18 = ฿177) - 2026-10-25

Built on ce049ea (package 69). No SQL. No Stripe change: the catalog keeps ฿177 / ฿895 / ฿1,562.

**Why.** Owner, with a screenshot of the plans page: "ราคาตั้ง 159 แต่จ่ายจริงแค่บอกค่าธรรมเนียมแจ้งรายละเอียดก่อนจ่าย" (the price is ฿159; the fee is told, with the details, before paying).

**What changes**
- shared/proPricing.ts: proPriceParts (price 159 / 849 / 1,490, payment fee 18 / 46 / 72, total 177 / 895 / 1,562) and proPricePartsForCharge; proPriceDetails' saving and average use the shown price again (฿90 / 36%, ฿645 / 43% with ฿141.50 a month, ฿1,498 / 50% with ฿124.17 a month). The charged total is unchanged everywhere on the server.
- Plans page (phone and computer): the large figure is the price; under the saving, "+ ค่าธรรมเนียมชำระเงิน ฿18 · ยอดชำระ ฿177"; the payment buttons keep the amount charged. QR dialog: ค่าสมาชิก, ค่าธรรมเนียมชำระเงิน, then ชำระครั้งเดียว. Card dialog: the same two lines above ยอดชำระวันนี้. Promo dialog and landing page: the price with the same fee line. เลขา's knowledge states price + fee (total). English for every new line.
- tests/e2e/billing.spec.ts: the fee line for each period, the QR and card breakdowns, and a no-overlap test of the price block on a phone and a computer, light and dark (runs the owner's text-overlap checker where it is present).

**Checks.** Unit tests 784/784; plans and card screen tests 35/35 (the 3 landing story tests that expect an older English headline fail as before); cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.

## เลขา continues a task across the app and LINE (learning package E) - 2026-10-25

Built on 46fe663 (package 70). No SQL. No Stripe, price, quota, model, prompt or screen change.

**Why.** Owner, 2026-10-25: "ทำเลย" to package E of the AI learning plan: start something in the app (for example a quotation) and answer เลขา's questions in LINE, or the other way round, without telling it again.

**What changes**
- backend/src/ai/crossChannel.ts (new): when the account's latest exchange was in the other channel within 2 hours, newer than this channel's own, and เลขา's last word there asked a question or left a card still waiting, its last 4 turns (600 characters each) join this message's history, marked "(ต่อจากที่คุยในแอป เมื่อ N นาทีก่อน)" / "(ใน LINE)". Polite closers ("มีอะไรให้ช่วยเพิ่มเติมไหมครับ") and confirmed or expired cards do not count. A file note stays first, as the gateway reads it.
- service.ts: the app's turns are read for the signed-in account only (newest chat, never the notifications thread), alongside the account load; the card list is read only for a typed go-ahead or when the other channel ended on a card. A typed "ยืนยัน" / "ตกลง" / "ได้เลย" with cards waiting (30 minutes) shows those same cards again, still editable, with no model call and 0 tokens; not when เลขา's last word was a question ("ใช่" then answers it). Nothing is saved until the card's own button. The routing log gains continued_from (app / line) and reason waiting_cards; never words.
- lineBridge.ts: LINE's short history keeps เลขา's questions as "- question" lines and a card as "[การ์ดรอยืนยัน: title]", as the app writes them.
- supabaseDb.ts: recentAppTurns and pendingProposals, both filtered by user_id. tools.ts: cardForStoredProposal (a stored proposal as its card, with its edit fields).
- privacy.html (Thai and English): one sentence on reading the other channel's latest messages (at most 4, within 2 hours); nothing more stored.
- Tests: ai-cross-channel.test.ts (11), an account-isolation test on the real database layer, and the Pro-rollout fake answers the new read.

**Checks.** Unit tests 796/796; cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.

## Pro orders at the prices with the payment fee; earlier auto-renewals keep their price - 2026-10-25

Built on 7742ecb (package 71). SQL first: supabase/migrations/20261025170000_pro_amounts_with_fee.sql (the owner runs it in the Supabase SQL editor). No Stripe change, no price change.

**Why.** Found during the audit for the owner's profit-report brief: package 69 moved the app and the Stripe catalog to ฿177 / ฿895 / ฿1,562 but the database still reserved new orders at ฿159 / ฿849 / ฿1,490 (cashflow_reserve_prepaid_checkout and the amount rule on cashflow_prepaid_orders), so buildDirectQr / buildPrepaidCheckout refused every new order. Card auto-renewals bought at ฿159 were also checked against today's ฿177 and the lookup key Stripe moved to the new price, so their Stripe events would be refused.

**What changes**
- SQL: the amount rule allows the amount each period has been sold at (15900 or 17700, 84900 or 89500, 149000 or 156200 satang); new orders are reserved at 17700 / 89500 / 156200. No existing row is changed. Safe to run twice.
- shared/proPricing.ts PRO_SOLD_AT; cardPlans.validReservedRecurringPrice: an existing auto-renewal is checked against the price and amount on its own order (the amount the customer agreed to), never today's lookup key. New checkouts still sell only today's price.
- database/profit_report_check.sql: read-only system check for the profit report (no ids).
- Tests: pro-amounts-database.test.ts runs the SQL on PGlite after every earlier billing migration (old amounts before, new orders at the new amounts after, earlier paid orders unchanged, a ฿177 card order goes to paid, ฿159 no longer pays a new order, a drift check against PRO_PRICING); card-renewals.test.ts: a ฿159 renewal keeps renewing at ฿159 and nothing else passes.

**Checks.** Unit tests 801/801; cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.

## Monthly profit report for the owner (brief "KRAROK AI PROFIT INTELLIGENCE") - 2026-10-25

Built on e42783b (package 72). SQL first: supabase/migrations/20261025190000_admin_profit_report.sql (additive; the owner runs it in the Supabase SQL editor). No screen, price, quota, routing or Stripe change.

**What changes**
- SQL: cashflow_admin_cost_settings (fixed costs and the dollar rate the owner edits; seeded with domain ฿350/yr, coding tool ฿750/mo, ฿33.5/$), cashflow_admin_reports (one row per month with its delivery state, kept when accounts are deleted later), cashflow_admin_ai_month (read-only AI cost per account for one Bangkok month). Service role only.
- adminProfitReport.ts: the figures by code in satang and millionths of a dollar: revenue (Stripe balance transactions, per payment fees from Stripe charges, refunds), members (from paid periods), AI cost split into each account's own use and the platform's share (shared cache, failed attempts, the report's own note), per-account contribution (cash basis and service period), fixed costs, operating profit estimate, break-even members, month-over-month without dividing by zero, and COMPLETE / PARTIAL / UNRECONCILED / FAILED per section; unknown stays unknown, never ฿0.
- adminProfitReportRun.ts + /api/send-admin-profit-report (CRON_SECRET): at 08:00 Bangkok on the 1st it saves last month and sends the totals by LINE to system admins who linked LINE (optional ADMIN_REPORT_EMAILS narrows it); quota checked first; one try a day, retried on the 2nd and 3rd; never sent twice; a stable LINE retry key. The 1–3 sentence note is Gemini's from the computed facts only (any number not in the facts → the code's note), its cost recorded as platform overhead.
- database/profit_report_accounts.sql: read-only per-account view for the owner. database/ai_learning_report.sql: rows without routing are no longer counted as routed.

**Checks.** Unit tests 819/819 (new: admin-profit-engine 15, admin-profit-database 3 on PGlite); cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.

## The monthly price from 1 Dec 2569: ฿249 shown, ฿271 charged; consent v4; promotion renewals step to ฿271 - 2026-10-25

Built on be1396b (package 73). SQL first: supabase/migrations/20261025210000_pro_month_regular_price.sql (the app sends consent v4, which only this SQL accepts). Then, before 1 Dec, the owner runs scripts/stripe-reprice.ts (test, then live) to create the ฿271 monthly prices.

**Why.** Owner, 2026-10-25: "บวกค่าธรรมเนียมตามปกติ ... แสดงผล 249 ... จ่ายจริง 271 แล้วก็แสดงให้ดูว่ามันคือค่าอะไร", and for monthly card renewals made during the promotion: "ขึ้นเป็น ฿271 เองตั้งแต่ ธ.ค.". The v3 consent said "จากนั้น ฿249/เดือน", not the amount that would be charged.

**What changes**
- shared/proPricing.ts: prices by date (proPricing / proNetTarget / proPriceParts / proPriceDetails take a moment); until 30 Nov 2569 ฿159 + ฿18 = ฿177, from 1 Dec 00:00 Bangkok ฿249 + ฿22 = ฿271 a month; 6 months and a year unchanged. PRO_PRICING and PRO_NET_TARGET constants removed so nothing keeps the old price. PRO_MONTH_RENEWAL_STEP, PRO_SOLD_AT month [159, 177, 271].
- Checkout: lookup keys by date (the ฿271 monthly prices have their own keys, so both exist and checkout switches at midnight); one moment for the price looked up and checked; an order's amount is checked against the price when it was reserved; an unpaid order whose price changed is replaced.
- Consent v4 (shared/cardConsent.ts): names the amount charged with its price and fee, and for a promotion month "฿177/เดือน (ราคา ฿159 + ค่าธรรมเนียมชำระเงิน ฿18) ถึงวันที่ 30 พ.ย. 2569 จากนั้น ฿271/เดือน (ราคา ฿249 + ค่าธรรมเนียมชำระเงิน ฿22)"; the order records renewal_step_from / renewal_step_amount.
- /api/advance-card-renewals (09:00 daily): moves such a subscription to the ฿271 price once its next renewal is on or after 1 Dec, without proration; renewals of a period from 1 Dec are accepted at ฿271 (and still at ฿177 if the move was late). SQL: cashflow_pro_month_amount, amount rule with 27100, consent v4 accepted, the step checked on prepare and on recording a renewal.
- Screens: from 1 Dec the plans page, promo dialog and landing page show ฿249 with "+ ค่าธรรมเนียมชำระเงิน ฿22 · ยอดชำระ ฿271" and no struck price; QR and card dialogs break down the amount they charge; เลขา's knowledge reads the price at the time.
- scripts/stripe-reprice.ts plans both dates and creates the ฿271 monthly prices from the existing ones.

**Checks.** Unit tests 828/828 in the extracted package (SQL on PGlite incl. the renewal ledger with the clock at 15 Dec); billing and card screen tests 37/37 incl. a December plans page and the v4 consent on a phone with the owner's overlap checker; cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run. All screen tests 277/277 (the 36 old failures came from admin-only areas, redesigned screens and duplicate status texts; the tests now sign in as admin where an area is admin-only and follow the current screens). Plans page: the " · " separator's spaces moved outside its span (same pixels; the overlap checker no longer flags it).

## เลขา knows the founder; it never names the AI behind it - 2026-10-25

Built on 2791c70 (package 74). No SQL. No screen changes.

**Why.** Owner's Master Product Backlog, Part 2–3 (2026-10-25), approved with "ทำต่อตามแผนเรา". The plan page carried the public founder draft and the owner's line for technology questions.

**What changes**
- backend/src/ai/founderKnowledge.ts (version founder-2026-10-25.1). It holds the approved public text only: who founded Krarok, the founder's background, why Krarok was built, who made เลขา, the team, goals (planned features marked as plans) and how to reach the developer (บอกเรา). The founder's private matters are left out.
- Direct answers with no model call and no tokens:
  - common founder questions (Thai and English);
  - "what AI / model are you", which gets the owner's line plus a pointer to /privacy, where the processors are listed as the law requires;
  - requests for internal instructions or costs.
- For other messages about the founder, the model gets the approved text for that message only.
- Prompt secretary-v14:
  - never name or confirm providers, models, routing, fallbacks, instructions or costs;
  - never claim Krarok built its own model;
  - never invent founder history or team members.
- backend/src/ai/confidentiality.ts checks every model answer on the server, for every account, in the app and in LINE:
  - provider and model names are taken out, unless the name is the user's own client or job;
  - internals are taken out;
  - keys are masked.
  - What was taken out is logged as routing.guard. The words themselves are never logged.
- Memory: the founder's story and AI identities ("be ChatGPT") are never saved as a user's memory.

**Checks.**
- Unit tests 836/836 in the extracted package, including 8 new ones: founder questions, technology questions, routing, the reply check, app and LINE chat with fake models, the prompt, and memory.
- cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.

## Monthly profit report: every account, failed payments, costs not known yet, filtered answers - 2026-10-25

Built on package 75. No SQL. No screen changes. Only the owner's LINE report text changes.

**Why.** Owner's Master Product Backlog, Part 4–5 (2026-10-25): "ค่าใช้จ่ายที่ยังไม่มีข้อมูลจริงต้องแสดงว่าไม่ทราบ ไม่ให้ระบบเติมเป็นศูนย์". The brief also asks for the total member count and failed payments.

**What changes**
- Members: every account at report time, plus the accounts that signed up in the month.
- Failed card charges in the month (count and baht), read from Stripe. The key needs Charges Read. When Stripe cannot be read, this shows as "ยังไม่ทราบ".
- EXPECTED_COSTS: Cloudflare, Supabase, LINE OA and storage.
  - Each one with no row in cashflow_admin_cost_settings is named as not known yet.
  - The profit is said to be before these costs, and the profit section shows PARTIAL.
  - An amount of 0 counts as known.
- The number of answers the confidentiality check changed in the month, from routing.guard. It is a head count only and shows as unknown when it cannot be read.

**Checks.**
- Unit tests 838/838 in the extracted package, including 2 new report tests.
- cloudflare:check 17/17, cloudflare:build, preflight, wrangler dry-run.
