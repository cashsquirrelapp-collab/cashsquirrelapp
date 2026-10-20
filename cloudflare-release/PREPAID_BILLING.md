# krarok.com prepaid Pro — 20 October 2026

The app sells three one-time purchases by card or PromptPay. It does not save card details or create a recurring subscription for these offers.

| Period | Charged once (THB) | Access | Live Stripe Price |
|---|---:|---:|---|
| `month` | 159 | 1 calendar month | `price_1USeQzC4uZ5mcDl1xjJxXBRG` |
| `halfYear` | 849 | 6 calendar months | `price_1USeQzC4uZ5mcDl1f9H2ikao` |
| `year` | 1,490 | 12 calendar months | `price_1USeQzC4uZ5mcDl1PlsA7eHC` |

Approved account: Vispark, `acct_1TeotMC4uZ5mcDl1`. Product: `prod_VTbexQEI6jrH8r`.
Amounts in the API/database are satang. Calendar arithmetic uses Asia/Bangkok and clamps month ends (31 January + 1 month = 28 February). Access begins at the confirmed Stripe charge time. Early renewal while existing prepaid access is active is blocked.

## Code and safeguards

- `shared/proPricing.ts` is the displayed/server catalog. SQL independently enforces the three amount/month combinations.
- `POST /api/billing` accepts only `action` and `period`; authentication, account binding, CSRF and rate limits apply. The server chooses Stripe Price and payment configuration.
- Checkout uses Stripe-hosted fields, exact quantity 1, no promotion codes and a locked payment method. Card/PromptPay are enabled in the existing default configuration. Unexpected extra methods fail closed.
- A persisted request and per-order Stripe idempotency key protect retries and unknown network outcomes. A pending order blocks switching methods/periods until it is conclusively expired/failed. The UI displays this conflict and offers cancellation of an attached unpaid checkout. Cancellation verifies ownership, expires that exact Stripe session and re-fetches canonical state before releasing the reservation; a racing payment is fulfilled, never discarded.
- Access requires a signed webhook plus canonical Stripe retrieval: correct account, customer, owner, price, quantity, amount, currency, duration, paid PaymentIntent and successful charge. A browser redirect cannot grant access.
- Duplicate events do not extend access. Any partial/full refund or dispute suspends that purchase, preserving other independent rights. A dispute resolved in the merchant's favor requires manual review to restore access; no automatic restoration is implemented.
- Legacy recurring subscriptions continue through the existing webhook and Billing Portal. These new offers do not modify previous subscriptions or prices.
- The new table has RLS and no anon/authenticated privileges. Only service-role RPCs can fulfill orders.

## Setup and audit

The runtime restricted key needs Payment Method Configurations Read in addition to its existing billing permissions. The owner approved this read permission and completed Stripe identity verification during live checkout QA.

Environment-only credentials: `STRIPE_SECRET_KEY`, matching `STRIPE_MODE`. Never put credentials in source or command arguments.

```sh
npm run billing:setup
npm run billing:setup -- --apply
```

The first command audits. `--apply` only creates missing offer prices or completes their metadata after validating their amounts. It refuses other live accounts, duplicate lookups, inactive or mismatched prices. It never charges a customer, changes webhook secrets, changes destinations, or modifies old prices.

Apply `supabase/migrations/20261020144448_krarok_prepaid_plans.sql` to the approved Supabase project `rcllghixkclvkxhvttaw`. This migration was applied through the project's authenticated SQL Editor on 20 October 2026 (the connector lacked permission). Do not run it a second time. It does not delete existing data.

The existing production endpoint `we_1UP5I6C4uZ5mcDl1mXqFpy32` remains at:
`https://kraroktunngern.cashsquirrelapp.workers.dev/api/stripe-webhook`.
All 12 existing events remain enabled; `charge.dispute.created` and `charge.dispute.closed` were added. Existing signing secret is retained.

Keep `KRAROK_PREPAID_ENABLED` unset/false until prices, schema and webhook are installed. Set it to `true` to open checkout. Optional `KRAROK_PAYMENT_CONFIGURATION` pins a specific validated configuration; otherwise the active default is used. `APP_URL` remains the existing production origin.

## Verification and operation

- 21 new payment tests cover all six period/method combinations, authenticated HTTP, signed/forged/unpaid webhooks, immutable amounts, retries, SQL fulfillment, refunds, leap dates and privileges.
- 15 billing browser tests cover all purchase choices, displayed duration, server-readiness gating, account switches, pending confirmation and mobile layout.
- TypeScript and Cloudflare checks/build pass. The full existing test suite has five unrelated baseline failures in notification delivery and monthly finance reports.
- Browser/HTTP payment tests use mocks; no real card/QR payment was submitted.

To stop new purchases, set `KRAROK_PREPAID_ENABLED=false` and keep this webhook code running for already-issued checkouts. Do not roll back the webhook to the old implementation while payments are outstanding.

An unknown Stripe create outcome older than the safe idempotency window is held for manual review. Search Checkout Sessions in Stripe by the stored customer/reservation metadata, retrieve canonical state, then process through `retrieveAndApplyPrepaid`; never clear a pending reservation based only on a browser timeout or cancel redirect.
