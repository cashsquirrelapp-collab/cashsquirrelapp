# Owner Stripe finance dashboard

Built on production commit `3412a3ab30c62b4ddb22664a2d9a9b2cae137345` (21 October 2026). All original source files and deferred features are retained.

## Revenue repair

The previous analytics endpoint omitted the new prepaid order ledger and custom recurring card cycles. Direct PromptPay now fulfills `cashflow_prepaid_orders`; recurring cards write `cashflow_card_cycles`. The owner dashboard now reads completed live records from both, deduplicates payment identities, and retains existing refund exclusions. Signup date grouping uses Bangkok time. Incomplete database pagination fails explicitly.

This is a read-path repair: no payment processing, webhook, entitlement, subscription, database schema, stored records, secrets, or cron schedules change. The existing app ledger conservatively excludes a payment marked refunded/disputed; exact partial refunds and fees are in the Stripe finance section.

## Actual Stripe finance

`GET /api/admin-stripe-finance?range=7|30|90` is restricted to the verified owner email, current database admin role, authenticated session and matching account header. Responses are no-store and rate limited. Only read operations are used.

Independent sections show:
- Payment/refund/fee totals from balance transactions, separated by currency; incomplete scans never appear as complete totals.
- Actual fees, fee percentage, and net amounts in currency minor units, including fee tax and credits.
- Current available/pending Stripe balances, including negative balances.
- Recent successful payments, original settlement fees/net, refunds, and the date funds become available in Stripe.
- Pending/in-transit payouts with Stripe's estimated bank arrival, plus recent payout history. With no scheduled payout, no arrival date is invented.
- Live app registrations, new signups, paid Pro and administrator-granted Pro counts in the existing analytics view.

Payout dates and balance availability are different events. Payment net excludes disputes and other adjustments; balances/payouts can include those and other periods. A Stripe paid status should be reconciled against the bank statement. Financial API failures do not hide user statistics or feedback; missing access is shown as unavailable, never zero.

## Runtime access required

The existing restricted key `Cash Squirrel Cloudflare Replacement 2026-10-19` currently has None for the three additional resources needed:
- Balance: Read
- Charges and Refunds: Read
- Payouts: Read

These permissions have not been changed. The implementation does not need Balance Transaction Sources or write permission for these resources. Expanding the existing key requires the owner's action-time confirmation. The key value stays server-side and does not change.

## Verification

- 31 focused backend tests pass across analytics repair, Stripe arithmetic/pagination/mode isolation and owner-only HTTP access.
- Cloudflare type checks and its 16 required security/scheduling tests pass; production build and preflight pass.
- Browser automation's standalone Chromium launch is blocked by the macOS sandbox. Local UI inspection uses the in-app browser with synthetic fixtures, not production credentials.
- In-app browser checks passed at desktop and 390px mobile: money precision, date-range selection, payment/payout detail navigation, separate settlement/arrival dates, analytics failure isolation, restricted-key unavailable states, owner access refusal and no horizontal page overflow. The four money totals use two columns on phones.
- Production owner sign-in awaits explicit confirmation of the Google account selected for verification. Automatic approval review rejected the account selection because the user had not explicitly identified that account.
- No production database backfill was performed; the exact production prepaid row has not yet been read through the app session.

Source changes are reviewable in `admin-stripe-finance.patch`; the archive and manifest are checksum verified by `prepare-release.mjs`.
