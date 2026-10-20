# Logo01 symbol rollout — 2026-10-21

The customer explicitly corrected the naming requirement: retain **กระรอกตุนเงิน**, including the established Thai wordmark font and colours. Use only the new tail symbol from Krarok-Logo01-Full-Kit-v1. Do not replace the app name with krarok.com or use the kit’s English horizontal wordmark.

## Included surfaces
- Shared BrandLogo/BrandLockup: desktop sidebar/drawer, mobile headers and fallback avatars, login, landing variants, tour and feedback identity.
- Standalone LINE form and documents header, privacy/terms, account-reminder email identity.
- SVG/ICO favicons, Apple touch icon and installable-app manifest. Legacy icon URLs also serve the new symbol. Fresh versioned paths avoid reusing the old favicon URL in current pages.
- Real fixture screenshots on the current landing page and retained story previews were re-captured with the new mark and Thai name. No real customer records or payment actions were used.
- about.krarok.com homepage, policies and favicon. The public-info folder is the deployable source for that separate Worker; its routing and Access policy were not changed.

## Mascot boundary
The character remains in greetings, status/loading/error illustrations, plan illustrations, assistant chat avatars, LINE cards and the mobile add-job character button. It is no longer the app identity mark. The preserved static illustration has an explicit /mascots/character-full.svg path. Customer/company-uploaded document logos and the Vispark merchant identity are unchanged. This release does not modify external Google/LINE account profile settings.

## Validation
TypeScript and Cloudflare checks; 16 security/scheduled tests; production frontend build; deterministic source-archive verification. Fixture browser checks cover six desktop app pages, mobile overview, desktop/mobile dark themes, landing and login at 1440px/390px, with no page errors or horizontal overflow. Existing story capture needed a targeted fixture-admin capture for the currently restricted report/vault pages; screenshots retain those pages’ actual content.

No pricing, renewal consent, payment logic, entitlements, database, secrets, permissions or schedules changed. No new charge was submitted. Roll back the app with the preceding source package from d81382b if needed.
