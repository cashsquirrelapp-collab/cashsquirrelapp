# Custom card form and optional renewal

Deployed 2026-10-21 Bangkok as Cloudflare version 69f87583-dcbe-4a83-8978-3fbd8c214718 with KRAROK_CUSTOM_CARD_ENABLED=true. Existing direct QR remains enabled. Live unpaid Checkout UI QA passed for all three packages, both one-time and optional renewal. No live charge has been made.

## Customer behavior

The app owns the card modal, colors, price summary, pay button and consent controls. Stripe Checkout Elements renders secure payment fields; PAN/CVC never reaches our server. Save-card is visible and enabled initially, can be disabled, and does not authorize automatic payment. Automatic renewal is separately unchecked initially. Checking it requires card saving and records the exact price/cadence consent version, text and server timestamp. Changing choices expires the old unpaid Checkout before creating another. Submission passes the explicit save-card choice to Stripe.

No renewal consent creates a one-time payment Checkout. Explicit consent creates native Stripe Billing for THB159 each month, THB849 each six months, or THB1490 each year. No custom charge cron is used. Native bank authentication may still be required. The app offers stop-renewal; healthy subscriptions cancel at period end, while past-due/unpaid/incomplete/paused subscriptions cancel immediately without invoicing or proration to stop further retries. Paid access remains until its recorded invoice period end.

## Server and data protection

Ownership, CSRF, immutable order requests and canonical Stripe objects are checked. Browser success never grants Pro. Subscription status alone cannot grant Pro: a signed event or owner poll must resolve the exact completed Checkout, subscription, invoice and successful card PaymentIntent/Charge. Amount, currency, account, mode, customer, price, quantity and period must match. Failed renewals do not extend access. Duplicate invoices are idempotent; refunds/disputes invalidate that invoice cycle. Existing admin ban/revoke/reset boundaries remain enforced.

Migration supabase/migrations/20261020172734_custom_card_renewals.sql was applied ONCE through the production SQL editor on 2026-10-21. SQL editor returned success. Readback confirmed both new tables have RLS and no anon/authenticated SELECT privilege, and both new mutation functions deny anon/authenticated execution while allowing service_role. This manual migration is not in CLI migration history. Do not reapply older admin migrations or this migration.

## Stripe setup

Account Vispark acct_1TeotMC4uZ5mcDl1; existing product prod_VTbexQEI6jrH8r. New live recurring prices created and read back, with no customer subscriptions created:

| Duration | THB | Price | Lookup |
|---|---:|---|---|
| 1 month | 159 | price_1USh8hC4uZ5mcDl1h1SZ2PbS | krarok_card_20261021_month |
| 6 months | 849 | price_1USh9PC4uZ5mcDl1G7W1Yyu6 | krarok_card_20261021_halfYear |
| 1 year | 1490 | price_1USh9uC4uZ5mcDl19A1xroAz | krarok_card_20261021_year |

One-time prices, webhook endpoint and its 17 events remain unchanged. Existing runtime restricted key Cash Squirrel Cloudflare Replacement 2026-10-19 (mk_1URyxTC4uZ5mcDl1rQv2Em4R) now has user-approved Subscriptions WRITE for the customer stop-renewal endpoint. The owner explicitly approved this exact permission expansion; it was saved and reread as Write in Stripe. No credential rotation or disclosure occurred. No tax setting was changed; catalog amounts remain fixed.

## Validation and remaining rollout

- Typecheck and production build pass.
- 27 targeted card renewal / SQL / HTTP tests pass, including exact evidence, consent switching, duplicates, refunds, failed renewal and admin boundaries. HTTP tests were rerun after adding immediate cancellation of past-due renewal: 21 pass.
- 16 Cloudflare/security checks pass.
- Billing UI suite: 19 original scenarios passed; 3 changed scenarios passed after updating request expectations and waiting for async checkbox recreation; additional stop-renewal scenario passed (23 distinct passing scenarios across runs).
- SQL tests use PGlite and payment tests use simulated Stripe evidence. No live card details, live payment confirmation or real charge was performed. Saved-card reuse and successful native subscription billing still need real Stripe test-environment end-to-end validation; do not represent simulated tests as live settlement.
- Subscriptions write was approved, saved and verified. The actual release app was deployed with existing secrets and daily crons intact. Initial live UI loaded the actual secure card fields and unchecked renewal option. All three packages were inspected on the live page with actual secure Stripe fields, and both one-time and opt-in modes were read back from Stripe. Every session remained unpaid, with subscription=null. Switching choices expired the prior session. No payment was confirmed.
- Reviewable source delta: custom-card-renewals.patch. Restore prior source/flag if rollout fails; retain additive database tables and paid-cycle records.

Stripe SDK transport now explicitly uses Stripe.createFetchHttpClient() with a 20-second per-attempt timeout and existing two network retries, avoiding retained Node HTTP agent sockets across Worker requests. This was added after live QA encountered stalled requests. Typecheck, 16 Cloudflare/security checks and all 27 targeted payment tests passed again. No underlying price or idempotency behavior changed.

## Production evidence

Final runtime version: 69f87583-dcbe-4a83-8978-3fbd8c214718 (following initial custom-card 8e538d3a-4257-4149-9ba5-00d65bcec4c7). Existing daily 01:00/02:00 UTC triggers and encrypted secrets preserved.

Verified unpaid Checkout sessions on the existing QA customer, with correct currency/amount and Elements UI:

- Month payment: cs_live_a1pDzUJO3SdnavCC4RPpFpsVVQO2f9VQuUydlSP3Yr9t4gcXGcp95wFw2M; month subscription-mode: cs_live_a1gIQBhQk6GANpnDbYUBcpa92FKAMg2qAxMWFZv0Q9YhDEALHuZ44XNnsa.
- Six-month payment: cs_live_a1RXT8wcsMU3zhSteZ5Gb0jmYRNsLiWtQQXd70riEEnAPouMTL6QjdG2TL; six-month subscription-mode: cs_live_a1VZqiATLR0gCwCJlDkq6EXJXpTh2xAcSDswYKtJIBaMDbofMlVkJ9KnBW.
- Annual payment: cs_live_a1NOp6zSrfZKLv0l9xOXioQBqh4JL48mBRMcbdBIH9VGRa2LYxqu2Qf9Vg; annual subscription-mode: cs_live_a1ZzqSNhjldixWn4U9EPY0x3bVLtR1u2tdS1Z2FpR3EJceEzcYWtlZOwAG.

No test entered card data, confirmed payment or created a native subscription. Automated fixtures verify paid access, expiry and cancellation; actual bank settlement and saved-card reuse have not been exercised. Local proof images: krarok-card-custom-159.png, krarok-card-custom-849.png, krarok-card-auto-1490.png, krarok-card-auto-849.png, stripe-subscriptions-write-saved.png.


## Combined release preserving concurrent mobile UI — 2026-10-21

Merged remote commit 6690dde (terracotta mobile UI and ticket-style Pro card) with card-payment commit 9ba60dc using a three-way merge of the actual archived source. No source conflicts remained. Incoming changes contain no backend payment changes. User explicitly approved publishing the combined version after automatic deployment review requested confirmation.

- Production runtime: 89f6b73d-4129-4d0e-9cc1-90fe4e181167.
- Archive SHA256: c41a4e1db30d88612f6cfffd5dea0a22cee5f1b7bc78e3cd6fc612c27b9c54c5 (593 source files).
- Combined source passed typechecking, 16 Cloudflare/security checks, production build, archive verification and 4 focused browser tests: mobile Pro readability, all package prices, separate save/renewal consent, and cancellation preserving the paid end date.
- Daily triggers, encrypted secrets, payment catalog and already-applied database migration remain unchanged. No actual card payment was submitted.
- custom-card-renewals.patch now describes the card payment changes relative to 6690dde, preserving its mobile UI.
