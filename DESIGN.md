---
version: 1
name: Krarok (กระรอกตุนเงิน) design system
description: >-
  A calm, formal finance assistant for Thai freelancers, business owners and their accountants: a warm near-white
  canvas, white content cards with hairline borders, charcoal type in IBM Plex Sans Thai, and one CI orange reserved
  for เลขากระรอก (the assistant) and the single primary action on a screen. Frosted glass is chrome only. It must
  read like an iOS system app or a bank, never like a toy or a game.
updated: 2026-10-27
colors:
  # Light values. Code tokens in brackets; several legacy names do not match their colour (see "Colour tokens").
  brand-orange: "#E65F2B"      # [--blue-acc, --asx-accent] CI orange: เลขา identity, the one primary action
  brand-orange-text: "#C24A16" # [--asx-accent-text] orange text and icons on light surfaces (AA on white)
  brand-orange-hover: "#D35221"
  rust: "#A63F1B"              # [--pink-acc] CI rust: overdue, danger text, the overview hero band
  caramel: "#C17817"           # [--yellow-acc] CI caramel: due soon, warnings
  cream: "#FFF1E8"             # [--asx-cream] orange tint: เลขา's own surfaces, icon tiles, the user's bubble
  ink: "#1C1917"               # [--text] all primary text
  muted: "#7D7772"             # [--muted] labels, captions, metadata
  canvas: "#FAFAF9"            # [--bg] page canvas inside the page card
  shell: "#F1EFEB"             # [--shell-bg] the wash behind the page card and the sidebar
  surface: "#FFFFFF"           # [--white] cards, inputs
  faint: "#F3F2F0"             # [--faint] hover, subtle fills
  hairline: "#E5E3DF"          # [--border] 1px borders and dividers
  income: "#12804F"            # [--asx-income] money in, success ("บันทึกแล้ว")
  expense: "#C43A3A"           # [--asx-expense] money out, failure
  warning: "#8A5A0B"           # [--asx-amber] on warning-bg "#FDF6EC"
colors-dark:
  brand-orange: "#F07440"
  brand-orange-text: "#FFA473"
  rust: "#FA7E52"
  caramel: "#F2B76B"
  cream: "rgba(255,164,115,0.14)"
  ink: "#F2F0ED"
  muted: "#9A968F"
  canvas: "#17181B"
  shell: "#0E0F11"
  surface: "#212226"
  faint: "#2A2B2F"
  hairline: "#34353A"
  income: "#4ADE80"
  expense: "#F19A9A"
  warning: "#F2B76B"
typography:
  ui: "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif"     # every page
  brand: "'Prompt', 'IBM Plex Sans Thai', sans-serif"                     # wordmark
  assistant: "'IBM Plex Sans Thai Looped', 'IBM Plex Sans', var(--font-sans)"  # เลขา on every device (2026-10-27)
  numbers: "font-variant-numeric: tabular-nums on every amount, date and count that lines up"
  weights: [400, 500, 600]      # 700+ only in the logo wordmark
  thai-line-height-min: 1.45    # body text 1.6-1.65
radius:
  page-card: 28px      # the computer/iPad page card
  sidebar: 20px        # concentric with the page card (28 - 8)
  chat-card: 20px     # direction A (owner, 2026-10-27)
  chat-group: 14px     # the grey group of rows inside a chat card
  control: 10px        # buttons, inputs, selects (.ui-button, .ui-input)
  icon-tile: 9px
  pill: 999px          # chips, segmented controls, quick replies only
spacing: [4, 8, 12, 16, 20, 24, 32]
---

# Krarok design system (DESIGN.md)

Read this before changing anything people see. The owner's words always win over this file; when they ask for
something new, update this file in the same change. Rules marked **(owner)** were set by the owner and need the
owner's approval to change.

## 1. Visual theme and atmosphere

- Formal and calm, like iOS system apps (Settings, Wallet) or a bank. **(owner, 2026-10-24)** "Not a toy, not a
  game." Grouped lists, quiet chrome, the content is the hero.
- Audience: Thai freelancers, small-business owners and the accountants who check their books. Figures must be
  readable at a glance and never ambiguous.
- Warm neutrals with one orange. Depth comes from surfaces (white on warm wash), not from heavy shadows.
- **Liquid glass is chrome only (owner, 2026-10-23):** the sidebar, menus, toasts, the phone's bottom capsule and the
  floating เลขา window. Content cards are solid.
- No glows, neon, gradient text, emoji as icons, or decorative gradients on content. The two sanctioned gradients
  are the overview's rust hero band and the LINE card header (owner choices).

## 2. Colour and roles

| Role | Use it for | Never for |
| --- | --- | --- |
| brand-orange | เลขากระรอก, the one primary button on a screen or card, the active nav item | decoration, section backgrounds, a second button |
| rust | overdue, destructive confirmations, the overview hero | positive states |
| caramel / warning | due soon, "ใกล้ครบกำหนด", soft warnings | errors |
| income (green) | money in, "บันทึกแล้ว", paid | brand accents, buttons |
| expense (red) | money out, failures | warnings that are not failures |
| ink / muted | all text; muted for labels and captions | coloured text on coloured fills |

- Text on a tinted fill uses the darkest shade of the same family (orange text on cream, green on green tint).
- Never use opacity to mute text; use `muted`.
- Every colour is defined for light and dark. Dark mode is a designed palette, not an inversion.

### Colour tokens (legacy names)

The CSS tokens kept older names: `--blue-acc` is the CI **orange**, `--pink-acc` is **rust**, `--yellow-acc` is
**caramel**, `--purple-acc` is a brown. Use the role, not the name, when choosing one. Chat surfaces use the
`--asx-*` set in `frontend/src/features/assistant/assistant.css`.

## 3. Typography

- UI: IBM Plex Sans Thai (with IBM Plex Sans for Latin and digits), the CI type. Brand: Prompt, for the wordmark only.
  Everything of เลขา (the full chat, the floating window, the phone sheet, the pill, the folded squirrel and their menus)
  is in the CI family's looped cut, IBM Plex Sans Thai Looped, on every device (owner, 2026-10-27: "ฟอนต์ยังไม่ตรง CI",
  "ทำในมือถือด้วยนะ", then "เปลี่ยนเป็นฟอนต์ Looped"); Latin and digits in IBM Plex Sans.
- Amounts on cards keep the sign with the figure in the text ("฿9,650") but set it a hair apart on screen (0.16em on the
  large figure, 0.1em in rows: owner, 2026-10-27 "ติดสัญลักษณ์ของบาทเกินไป").
- **Thai line-height at least 1.45 (owner, 2026-10-23)**; body 1.6 to 1.65. No letter-spacing on Thai.
- Weights 400 / 500 / 600 only. Amounts: 600, tabular numerals, the currency sign written attached (฿12,000); chat cards
  set it a hair apart on screen (see above).
- Card scale: title 14.5/600, hero amount 26/600, label 12.5-13.5 muted, value 14/500, body 15/400.
- UI copy is formal Thai **(owner)**: no ค้าบ/น้า in system messages; toasts are icon + heading + one line;
  a deletion notice is information, not a warning.

## 4. Components

### Buttons

- Primary: brand-orange fill, white text, radius 10, min-height 40 (44 on phones). **One per card or dialog.**
- Secondary: white fill, 1px hairline, ink text. Quiet actions (แก้ไข, ดูรายละเอียด) may be text buttons.
- Pills (radius 999) are for chips, segmented controls and quick replies, not for actions. Chat cards use the
  grouped buttons of §4.
- Destructive: rust text on a secondary button, or a rust fill only inside the confirmation of that action.

### Chat cards (เลขากระรอก): direction A "Grouped" (owner, 2026-10-27: "เอาแบบ A เลย เป็นระเบียบดี")

Like iOS Wallet and Settings. Every card the assistant draws follows one anatomy, top to bottom; leave out the parts a
card does not need:

1. **Header**: a small orange icon and the kind (13/600, orange text) on the left; the state on the right (a dot and
   its word).
2. **Figure**: an eyebrow label (muted), the key amount (32/600, digits in IBM Plex Sans), then what it is (15, ink-2).
3. **Group**: the facts as rows in a grey rounded group (radius 14), label left (muted), value right (tabular, wraps).
4. **Details**: everything else behind "ดูรายละเอียดทั้งหมด".
5. **Actions**: one full-width primary button (orange, 46px, radius 14) that names what happens ("บันทึกงาน",
   "สร้างใบเสนอราคา", "ลบรายการนี้" in rust), and grey secondary buttons side by side under it (แก้ไข, ยกเลิก).
6. **Note**: one muted line when needed.

- Surface: solid white (dark #1F2023), radius 20, padding 16, a soft two-layer shadow; no glass, no border.
- States, the same words everywhere: รอยืนยัน, กำลังบันทึก, บันทึกแล้ว (green), ไม่สำเร็จ (red, with
  ลองอีกครั้ง), ยกเลิกแล้ว, หมดเวลา (with เตรียมใหม่).
- Questions: each question is a grey group of rows with a round tick; typed answers sit in the same group. Credit
  terms are a segmented control (ไม่มี / 30 / 45 / 60 / 90). Withholding questions always offer ไม่หัก, 1% ค่าขนส่ง,
  2% ค่าโฆษณา, 3% ค่าบริการ ค่าจ้าง ฟรีแลนซ์, 5% ค่าเช่า and "อัตราอื่น" typed by hand.
- Anything that changes data goes through a confirmation card the user confirms **(owner)**.
- Cards show the server's figures verbatim; they never recompute totals.
- LINE notification cards keep the CI gradient band (owner, 2026-10-22); their buttons follow this section: the one
  primary in orange, the rest grey, corners 10px. They share a template with the real LINE Flex messages
  (`frontend/src/features/assistant/LineCard.tsx` and `backend/src/services/lineCards.ts`, `lineReminders.ts`).

### Forms

- Inputs and selects: radius 10, min-height 42, hairline border, 16px text on phones (no iOS zoom).
- Labels above fields; helper text muted; errors in expense red next to the field, saying how to fix it.

### Mascot (เลขากระรอก)

- **The squirrel is locked (owner):** never redraw it. Only its mood, action and props may change; props are added
  only when the owner asks (headset removed, hologram added on 2026-10-27).

## 5. Layout

- Breakpoints: phones below 744px (their own `ksm-*` design), 744-1023px iPad without the sidebar, 1024px and up with
  the sidebar.
- Computers and iPads: one rounded page card on the shell wash, 12px from the screen edges; the glass sidebar is
  layered on it, 8px inside its rim **(owner, 2026-10-27)**. Page content keeps its place and width.
- **Phones stay pixel-identical unless the owner asks (owner, 2026-10-21).** A computer/iPad redesign touches only
  the 744px+ branch.
- **Desktop parity (owner):** every phone fix gets a matching computer/iPad fix, designed for that screen, not
  copied from the phone.
- **No overlapping text (owner, 2026-10-23):** flow layout, menus anchored to their buttons, nothing positioned over
  text. Run the overlap check (`tests/e2e/textOverlap.ts`) on every screen you change.
- The page never scrolls sideways; wide tables scroll inside their own container.

## 6. Depth and elevation

| Level | Treatment | Use |
| --- | --- | --- |
| 0 | shell wash | behind the page card |
| 1 | page card: translucent canvas, glass rim, soft shadow | the page |
| 2 | white surface + 1px hairline | content cards, chat cards, tables |
| 3 | glass + shadow | sidebar (on the page card), menus, toasts, floating เลขา window |
| 4 | dialog with scrim | confirmations, forms |

Never stack two glass layers on content. Shadows belong to chrome; content cards stay flat.

## 7. Do and don't

Do:
- Keep one orange action per view; make everything else secondary.
- Show money with sign, colour and words together (รายรับ green, รายจ่าย red), never colour alone.
- Put the summary before the detail; the most urgent item first.
- Test light and dark, phone and computer, Thai and English.

Don't:
- Don't add a second accent colour, gradient text, glows or emoji.
- Don't pill-round action buttons or mix radii within one component.
- Don't change phone screens, the mascot drawing or the CI colours without the owner.
- Don't let text clip, overlap or run under another element.
- Don't put API keys or secrets anywhere in the frontend, logs or this repository.

## 8. Responsive behaviour

- Touch targets at least 44px on phones; 40px on computers.
- Cards go full width on phones; action bars stack with the primary action last (closest to the thumb).
- The corner on computers and iPads (owner, 2026-10-27: version 2): the official squirrel standing whole, waving, with
  a bubble at its left: "มีอะไรให้ช่วยไหมครับ" and only "กดที่ผม" under it (no shortcut written), now and then; news
  (thinking, an answer, a card waiting, a save) takes the same bubble. No pill, no haze behind it. Phones the same
  since 2026-10-27 ("ทำในมือถือด้วยเลย"): 72px above the bottom bar, the hello about 5 seconds in every 20.
- The floating เลขา window (computers and iPads) moves aside or folds into the mini squirrel when a document preview
  would be covered.
- Its expand button is never a bigger window: it opens the full chat page, the same page as the sidebar's เลขากระรอก,
  with the conversation carried over (owner, 2026-10-27).
- The full chat on computers and iPads is the same set as the window (owner, 2026-10-27: "ทำให้เหมือนตัวนี้เลย"): the
  window's perched squirrel with its calm motion and name capsule at the top, the token ring top-left, white round
  buttons, the start's title, line, briefing and questions in one 760px column, the white composer.
- The window is the same set as the full chat (owner, 2026-10-27: "ทำเป็นชุดใหม่ทั้งหมด"): a plain warm-white surface,
  a plain title and line, the briefing and the questions as inset-grouped lists, the cream bubble, a white composer with
  one solid orange send button, and Krarok Tokens as a ring in the header's top-left corner for everyone.
- เลขา never greets with "สวัสดีครับ คุณ…" on every open. Computers and iPads start with the time of day ("สวัสดีตอน
  บ่ายครับ") and one question about what the person does most (pages opened and questions asked over 30 days, counted
  on the device, greeting.ts), else about the page they are on. Phones the same since 2026-10-27.
- Phones are in the same set, drawn for a phone: the perched squirrel (68px in the chat bar, 72px in the sheet header)
  with its name, the token chip, one-line greeting and sentence, the questions as one grouped list with short words,
  the white composer; the top bar stays under 66px.
- Money cards (owner, 2026-10-27): the month is design A (money left large, "+฿… จากเดือนก่อน" from
  the server, a bar of the income spent, income and expenses side by side); several months are design A too ("เปลี่ยน
  เป็น A อย่างเดียว"): the money left over the period large, a pair of bars a month (income, expenses) on one scale,
  the month shown lit, a legend with the totals, the table kept. Drawn at the card's real width, so the figures on the
  chart never shrink.
- เลขา calls the person by the account's name. A new name ("เรียกผมว่า…", "อยากเปลี่ยนชื่อ") is a rename card the person
  saves themselves through the profile API; nothing is remembered as a nickname.

## 9. Working with this file (for AI agents)

- Before a UI change: read sections 2, 4 and 7 and the owner rules. Use existing tokens; add a token here first if a
  new one is needed.
- After a UI change: run the text overlap check, compare phone screenshots against production (they must match unless
  the change is for phones), and show the owner before/after pictures with the release.
- Production deploys from `main`. Deploy once every check passes (owner, 2026-10-27); changes needing an owner-only
  step (SQL, Stripe, secrets) or touching payments wait for the owner.
- After changing a chat card, retake the card gallery (every card, phone and computer) and show it to the owner.
