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
