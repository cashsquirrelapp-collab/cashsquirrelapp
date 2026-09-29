# Draft 6 Implementation Plan

**Branch:** `feature/draft6-implementation` (do not merge/deploy without explicit approval)
**Source documents:** Draft 6 = visual source of truth (Design canvas mockup, `https://claude.ai/artifact/Gybq3DjCjqpRVV6BdgNWMN`); current repo = functional source of truth; `coverage-audit.md` (delivered to the user separately, not committed here since it contains no code) = the verified feature/migration map every phase below is built against.

**Locked product decisions** (per the "BEGIN REAL IMPLEMENTATION" instruction):
- Clients page: derive from `Job.client` only. No standalone Client entity, no CRM migration this release.
- Credit Term Aging: use the NEW 5-bucket model (Overdue / Due Today / ≤7d / ≤14d / ≤30d). This is an intentional product improvement, not a restoration of old behavior — production's real aging only ever had 3 buckets.
- Keep as new UX (not preserved-from-old, build knowingly): Quick Payment (รับเงินด่วน), Financial Goals as an opt-in module, persistent Dashboard 4-month radar.
- Explicitly deferred to backlog, do not build this release: follow-up tone templates, Expense→Job linking, custom/arbitrary Credit Term days, WHT credit subtraction from estimated tax due.

This file is the live phase tracker. Update the status column as work lands; do not mark a row DONE until it's typechecked, built, and — where the change is visually observable — checked in the browser preview.

---

## Phase 1 — Foundation

| Item | Status | Notes |
|---|---|---|
| 1A. Workspace Selector | **DONE** (restyle only) | `FinanceWorkspacePicker.tsx` already existed and was already fully wired into `App.tsx:2366` with real save-before-switch / 409-conflict-block logic intact (`App.tsx:916-926`) — nothing to build functionally. Restyled from the old hardcoded brown hex values (`#E8D9C7`/`#FFF5E7`/`#79583F`) to the `brand-*` design tokens so it matches Draft 6's neutral palette. Verified: renders correctly in the profile-corner dropdown pattern in both light and dark mode (guests don't see it, by design — `!session.isGuest` gate, unchanged). |
| 1B. i18n Foundation | NOT STARTED | Real system exists (`i18n/translations.ts`, 1,256 lines, `useLanguage()`/`t()`, 1,094 call sites). Nothing to build in the *system* — the work is: every new/restyled Draft 6 component must use `t('key')` instead of hardcoded Thai, and new keys need adding to both `th`/`en` in `translations.ts`. Do this per-component as each phase below touches it, not as one giant upfront pass. |
| 1C. Dark Mode Foundation | **DONE** (core neutral tokens) | `frontend/src/index.css` `.dark` block: replaced the old brown cinnamon/cocoa values (`#1C130B`/`#261810`/`#79583F`-family) with charcoal/dark-gray tokens (`--bg:#17181B`, `--white:#212226`, `--text:#F2F0ED`, `--muted:#9A968F`, `--faint:#2A2B2F`, `--border:#34353A`), keeping the existing orange-leaning accent tokens (`--blue-acc:#FFA473` etc.) untouched. Verified live in guest-mode dashboard: sidebar, cards, and profile dropdown now render charcoal/dark-gray with the orange CI still popping, not brown. **Not yet touched:** the semantic accent bg/acc pairs (green/blue/pink/yellow/purple) and the warm-tinted `body` background-image gradient — left alone deliberately this pass since they weren't flagged as broken and touching them isn't zero-risk; revisit only if a later phase's dark-mode pass surfaces a real clash. |
| 1D. Common Components | PARTIAL (MascotFeedback done) | Card/KPI/Badge/Button-hierarchy/Modal/Drawer/Stepper/Tabs/Table/EmptyState/Skeleton/Toast/FormFields/StatusColors still don't exist as a shared library. **`Mascot.tsx` now does**: extended with 8 new moods (thinking/worried/relieved/excited/received-money/checking/waiting/error) alongside the original 6, a new `action` prop (idle/wave/hold-coin/hold-calendar/hold-document/hold-phone/celebrate/sleep) driving arm pose independent of mood, a `prop` overlay system (coin/calendar/document/phone/clipboard/chart/warning) that takes priority over each mood's default floating accessory, and a `size` prop that now also accepts `'sm'\|'md'\|'lg'` presets alongside the original numeric API. Character geometry (body/head/ear/tail/belly/cheek paths) was never touched — every new mood reuses the exact same shapes, only recoloring + swapping eyes/mouth/accessory. Verified: `npm run check` passes, and existing call sites (Dashboard, Plans) render pixel-identical to before in the browser — confirms the extension is fully backward compatible. Not implemented: the more elaborate poses from the brief (run/walk/peek/use-laptop/check-report) — those need new limb/prop geometry beyond a safe one-pass extension and are left for a follow-up if actually needed. |

## Phase 2 — Auth / Onboarding / Account Entry — NOT STARTED
Login, Google login, Guest Mode, email confirmation, forgot/reset password, account recovery all have real, verified backend logic (coverage-audit.md §14) with **zero Draft 6 UI built yet**. Onboarding wizard exists and works (`ProfileSetupWizard.tsx`) — needs restyle + simplification, not a rebuild.

## Phase 3 — Core Cash-Flow Flow (Jobs) — NOT STARTED
Jobs table + Job Detail Drawer + 3-step wizard. Exact field-level spec verified in coverage-audit.md §1-3. Locked constraints: payment states `done/partial/installment/pending`; WHT `0/1/3/5%` only; Credit Term presets `0/30/45/60/90` only (no 7/15/custom this release); installment auto-distribute range 2–100; installments stay binary paid/pending (no partial-within-installment).

## Phase 4 — Receivables / Reminders / Expenses — NOT STARTED
Reminder queue (pending/sent/skipped, send-one/send-all/skip/clear-history) has real backend (coverage-audit.md §4). Expenses: restore the real 8 categories, itemized `fixedExpenseItems` UI in Settings→การเงิน (replacing the current single-number placeholder).

## Phase 5 — Goals Optional Module — NOT STARTED
Default OFF via Settings→ฟีเจอร์เสริม (toggle UI already exists in the Draft 6 mockup's Settings page). Full verified functionality to restore listed in coverage-audit.md §6.

## Phase 6 — Documents — NOT STARTED
Full field set in coverage-audit.md §7. Move logo/signature controls into the document editor (matching real prod location, not Settings). Do not re-enable `receiptTaxInvoice` creation; old documents of that type must keep rendering.

## Phase 7 — Reports — NOT STARTED
12-month table, real exports (CSV/XLSX/print/email — note SummaryTab's "Export เป็น Excel" button is CSV mislabeled as Excel in current prod, flag don't silently fix). Credit Term tab: build the new 5-bucket model per the locked decision above.

## Phase 8 — Tax — NOT STARTED
Side-by-side ภ.ง.ด.94/90 (not a stepper-only flow), real deduction categories with real per-period caps, real bracket table, sync-from-system, manual external income. Do NOT add WHT-credit subtraction — backlog item only.

## Phase 9 — Groups / Admin — NOT STARTED
Full CRUD + roles + 409 handling per coverage-audit.md §9-10. Depends on Phase 1A (done) for workspace context.

## Phase 10 — LINE / Notifications — NOT STARTED
Real connect/link-code/assistant/LIFF/Rich-Menu/digest UI replacing the current 2-toggle placeholder. Full spec in coverage-audit.md §13.

## Phase 11 — Security / Settings / Plan / PWA — NOT STARTED
Backup-email OTP, pause account, delete + 30-day recovery, reset-financial-data as distinct actions. Plans page copy verification (14-day trial / ฿149 / manual renewal — values confirmed correct in coverage-audit.md §15, just need the mockup copy double-checked against them).

---

## Verification checklist per change (apply every phase)
1. `npm run check` (lint + unit tests + build) from repo root — must pass before commit.
2. If visually observable: `preview_start` the dev server, check both light and dark mode in the browser.
3. Commit with a clear phase-tagged message. Do not push or merge without explicit approval.
4. Update this file's status table in the same commit.

## Deferred to backlog (explicitly out of scope this release)
- Follow-up tone templates (สุภาพ/เป็นกันเอง/เร่งด่วน)
- Expense → Job linking
- Custom/arbitrary Credit Term days
- WHT credit subtraction from estimated tax due
- Standalone Client entity / CRM migration
- Full PWA offline business-data caching (intentionally excluded in current prod)
