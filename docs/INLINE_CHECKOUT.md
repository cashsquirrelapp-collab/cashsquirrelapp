# Inline card and PromptPay checkout

Supersedes the hosted Checkout UX in PREPAID_BILLING.md. Uses Stripe Checkout Sessions `ui_mode=embedded_page`, official Stripe.js `createEmbeddedCheckoutPage`, and `redirect_on_completion=if_required`. Cards and PromptPay are restricted by the same server-validated configuration/exclusions. The QR is generated/displayed by Stripe's secure frame inside the application's dialog. Issuer authentication may still require a bank flow.

Amounts/rights remain THB159/1 calendar month, THB849/6 months, THB1490/12 months, single payment, no auto-renewal. Fulfillment remains canonical Stripe evidence + service-only idempotent DB RPCs; browser callbacks only poll authoritative subscription state. No migrations or webhook endpoint changes required.

The pending unpaid-order banner and cancellation button are removed. On the next purchase attempt, an open matching embedded session is resumed; a different package/method or legacy hosted session is expired and reconciled before replacement. Unknown create outcomes replay the original persisted request and idempotency key before expiration. Unknown expiration, completed/processing or paid sessions cannot be released as unpaid. Records remain internally for reconciliation and audit; an abandoned purchase never grants Pro.

The authenticated billing POST returns its owner's session client secret (never logged or stored in browser storage), public key and exact summary. No hosted payment URL is returned. The production public key is the Vispark publishable key, configured as STRIPE_PUBLISHABLE_KEY; existing restricted secret and webhook secret are unchanged. Stripe SDK 23.0.0 uses API 2026-09-30.endive; Stripe.js is loaded from Stripe on demand. CSP permits documented Stripe script/frame/connect/image origins, retaining account auth, CSRF and other policies.

Closing or switching accounts destroys the embedded frame; late initialization is serialized and discarded. Paid confirmation shows only after database-confirmed entitlement. Existing recurring customers retain their billing portal for managing old subscriptions. Admin revoke/ban/unban behavior is preserved.

Validation uses local fake Stripe responses for all amounts/methods, signed webhook tests, database transactions and a browser SDK stub. These do not constitute a real charge. A separate production browser check must confirm the actual Stripe form and QR render in our origin without entering card data or making a payment.
