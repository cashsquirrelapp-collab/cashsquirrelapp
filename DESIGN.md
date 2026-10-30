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
- No glows, neon, gradient text, emoji as icons, or decorative gradients on content. The sanctioned gradients are the
  overview's rust hero band, the LINE card header, the chat greeting heading (CI rust, orange and caramel since
  2026-10-29), the Pro arrival's greeting (เลขา's looped type in a warm pastel, cream and peach into the orbs' rose,
  2026-10-29), the Welcome Onboarding greeting in CI colours (2026-10-28) and the plans page (design F, 2026-10-29:
  see "Plans page").

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
- The plans menu and page title (owner, 2026-10-28): "อัปเกรด Pro" for free and trial accounts, "แพ็กเกจ Pro" for
  members who already pay (`nav.plansMember`). Phones say "แพ็กเกจ Pro" for everyone.

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
- Anything that changes data goes through a confirmation card the user confirms **(owner)**. Owner rules for many
  items (2026-10-28): when the user's own message says to save now ("บันทึกให้หน่อย", "บันทึกทั้งหมด"), new jobs, money
  received and expenses are saved as soon as the app's checks pass and their cards arrive already บันทึกแล้ว; two or
  more cards waiting get one ยืนยันทั้งหมด button under them, and a typed "ยืนยัน" applies every waiting card; deleting
  every job is one card (rust ลบงานทั้งหมด), one go-ahead, no password.
- A saved card opens what it saved: เปิดดูงาน opens that job's form, เปิดเอกสาร the document, ไปที่หน้างาน after a
  delete.
- Cards show the server's figures verbatim; they never recompute totals.
- LINE notification cards keep the CI gradient band (owner, 2026-10-22); their buttons follow this section: the one
  primary in orange, the rest grey, corners 10px. They share a template with the real LINE Flex messages
  (`frontend/src/features/assistant/LineCard.tsx` and `backend/src/services/lineCards.ts`, `lineReminders.ts`).

### Forms

- Inputs and selects: radius 10, min-height 42, hairline border, 16px text on phones (no iOS zoom).
- Labels above fields; helper text muted; errors in expense red next to the field, saying how to fix it.

### Welcome Onboarding (owner brief, 2026-10-28; look E)

- Four questions after the first sign-in of a new account (`WelcomeOnboarding.tsx`, `shared/onboarding.ts`): the name
  เลขา uses (saved as the account's name), work type (one), occupations (several, "อื่น ๆ" opens a box), what Krarok
  should help with (several; "ยังไม่แน่ใจ อยากลองใช้ก่อน" stands alone). The name is required (2+ letters); the
  other three can be skipped.
- The whole screen on every device, white (dark follows the app), with background option 2 "กราฟโตขึ้น"
  (`OnboardingBackdrop.tsx`): graph-paper dots, a rising line chart that draws once, coins drifting up, soft CI glows.
  CI colours only: no space motifs, no violet or pink (owner, 2026-10-28). Still under reduced motion.
- Step 1 has as few things as possible: "สวัสดีครับ" in a CI gradient (rust → orange → caramel), the name appearing
  under it as it is typed, the question, one glass field with the next arrow, one note line. No logo, no step count,
  no ข้ามก่อน.
- Steps 2-4: a four-part bar and ข้ามก่อน (from Settings: a round ปิด) on top; glass tiles with a CI icon (orange on
  cream) and a tick, orange ring when picked. Phones: two-column tiles for several choices, rows for one, back at the
  top left, ถัดไป full width at the bottom. Computers and iPads: two columns, back and next under the choices.
- Exceptions for this screen only (owner): gradient text on the greeting, glass content tiles, pill-round buttons.
- Answers keep stable IDs; labels can change. Never put the nickname on documents.

### Plans page (owner, 2026-10-29; design F, phones too)

- One focal point: the price card in the middle. Above it the headline "เรื่องบัญชี / ไม่จำเป็นต้องเป็นเรื่องยากอีกต่อไป"
  (second line in a CI gradient) and "วันละไม่ถึง 6 บาท · ถูกกว่ากาแฟแก้วเดียว · ...". The owner changes the 6 บาท
  line by hand in December; do not compute it.
- The card: "Pro รายเดือน" pill on its top edge, ฿249 struck, ฿159 at 72px, "ประหยัด ฿90 ทุกเดือน", the countdown as
  small chips while the promotion runs, "สมัคร Pro" (no price on the button) and "จ่ายครั้งเดียวด้วยพร้อมเพย์ QR", then
  the two terms lines. No fee or total line here: the card and QR dialogs show the fee and the amount before paying.
  No squirrel on this page.
- Under it three small feature cards (เลขากระรอก, แจ้งเตือนอัตโนมัติ with the real Gmail and LINE logos, เอกสารไม่จำกัด);
  the one pressed springs open, the others fold into upright strips. They stay smaller than the price card.
- Exceptions for this page only (owner): gradient headline, glossy CI orbs, the orange halo and button glow. CI colours
  only (orange, rust, caramel, cream): no green, blue or violet except inside the Gmail and LINE logos.
- Phones (owner, 2026-10-29: "ทำบนมือถือด้วยเลย"): the same page under the app's terracotta header; the headline's
  second line sized to stay on one line (`min(24px, 6.1vw)`), the card full width with ฿159 at 60px, and the feature
  cards as full-width rows that open downward.

### Post-payment guide (owner, 2026-10-29: "การ์ดทีละขั้น พาไปกด")

- Paying plays the arrival at once, with no "สมัครสมาชิกสำเร็จ!" message box (owner, 2026-10-29); inside the scene a green
  tick draws itself in a ring with "ชำระเงินสำเร็จ" (about 2.4 s), then the door scene runs as before. The message box comes
  only where the arrival cannot play. After the arrival, a card beside the corner squirrel: "เริ่มใช้ Pro ใน 4 ขั้น", a four-part
  bar and the steps เชื่อม LINE, เปิดแจ้งเตือนอีเมล, ลองคุยกับเลขา, ตั้งข้อมูลผู้ออกเอกสาร (`ProGuide.tsx`).
- "ไปทำเลย" opens the page, dims it for about three seconds and rings the thing to press (elements marked
  `data-guide-target`); a bubble says what to do, with ข้ามขั้นนี้ and ดูทุกขั้น. Steps tick themselves from real data.
- Motion (owner, 2026-10-29: "อย่าให้มันกระตุก ... ให้มันนิ่งก่อนแล้วค่อยคุม"): the ring and bubble wait until the page has
  rendered and scrolled to the button and it has stayed put for a few frames; then the ring scales in and the bubble
  drops in from just above. While the page scrolls they follow the button in every frame (placed with `translate`).
- "ไว้ทีหลัง" leaves a small pill by the squirrel that reopens the card. `?guide=pro` opens it.
- Phones (owner, 2026-10-29): the card rises from the bottom over the tab bar like an iOS sheet (grip, no tail); the
  pill sits beside the phone's squirrel, whose hello bubble waits meanwhile.

### Weekly Pro invitation (owner, 2026-10-29; Gen Z poster, round 4 design 1)

- Accounts of their own not on Pro see it on the overview, at most once in 7 days; ✕ and ไว้ทีหลัง wait for next week,
  สมัคร Pro เลย opens the plans page (`ProKvBanner.tsx`, the date in localStorage `krarok.proKv.<userId>`). Automated
  browsers see it only with `?kv=auto` (weekly rule) or `?kv=pro` (now).
- Two layouts (owner, 2026-10-29: "ทำ KV เผื่อ iPad แล้วก็คอมด้วย ... ขนาดมันเล็ก"): a portrait poster (400 x 540) for phones
  and upright iPads, grown to fill the screen (up to 1.6x), and a landscape one (880 x 520, up to 1.25x) for computers and
  iPads lying down: headline, badge, what Pro gives and the button on the left, the squirrel big on the right, and the
  countdown as a timer in the top-right corner. "วันละไม่ถึง" sits right under the headline. CI colours only, no logo in the
  corner. It follows the app's
  theme (owner, 2026-10-29: "ทำธีมสว่างด้วยสิ"): light is cream into peach with dark and rust type and the big price in rust;
  dark is dark rust (#2B1B15 to #9A3A16) with gold (#FFC36B to #F2A23A) as the only highlight.
- The eye goes in this order: 1 the headline "จ้างเลขาส่วนตัว วันละไม่ถึง ฿N" (N worked out from the month's price, big
  gold); 2 เลขากระรอก peeking out of the glowing KRAROK PRO box (the app's own `MascotPeek`, never redrawn); 3 the round
  rust price badge (฿249 struck while the promotion runs); 4 "ได้ครบใน Pro": LINE, email and documents in a neat list;
  5 the countdown and the button. Chrome ribbons and the gold streak are decoration and never cross text.
- The button is the one bright action: CI orange, a gold rim, a glossy top, light sweeping across, an arrow that nudges
  (owner: "ทำให้มันเด่น ... เล่นแสงปาด ให้ดูน่ากด"). Reduced motion keeps everything still.

### Landing page (owner, 2026-10-29; clean liquid glass, `features/marketing/v5`)

- Clean and white, modern and Gen Z, with liquid glass cards and a finance feel (owner, after a premium-site reference:
  "คลีนๆขาวๆ ... ทันสมัย ... ลิควิดการ์ด ... ไฟแนนซ์"). Our own content, CI colours and squirrel, never a copy of
  another site (owner: "อย่าทำเหมือนเขา ... มันจะถือว่าเป็นการก๊อปปี้"). The first own-style landing stays in `v4`.
- The landing is the one place where content sits on liquid glass: frosted white with a bright rim over slow CI colour
  (`cl-glass`, `cl-liquid`). The app itself keeps the rule above (glass is chrome only). The landing's action is a CI
  pill with its arrow in a white dot; it is always light (no dark theme).
- Motion is GSAP 3.15 with `@gsap/react` (`useGSAP`), both at exact versions (owner: "เอา Gsap ไปศึกษาละทำออกมา", then the
  official gsap-skills). In use: ScrollTrigger (the pinned scene, reveals), CustomEase `krarok` (every rise), EasePack
  (SlowMo on the Pro card's light, ExpoScale for the cards shrinking into the phone), ScrambleText (digits only, on the
  hero's amounts), TextPlugin (the hero chip typed a Thai word at a time), DrawSVG (underline, sparkline, ribbon),
  MotionPath (Krarok coins riding the ribbon; they fade where they pass behind words), Physics2D and PhysicsProps (coins
  jumping out when ฿159 lands), Observer (the ticker speeds up and leans with wheel or swipe speed), ScrollToPlugin (the
  page's links glide to their section), Draggable (problem notes can be picked up and spring back, mouse only). GSDevTools
  and MotionPathHelper are build tools and are not shipped.
- Thai words come from the browser's word segmenter and React draws them (SplitText would rewrite markup React owns);
  each word rises out of its own one-line mask. A split heading carries its whole text as `aria-label`.
- Every motion is off with reduced motion, mouse-only effects need a fine pointer, and nothing that moves passes over
  text (checked at 10 sizes, Thai and English, through the whole scroll).
- Round 5b (owner's review, 2026-10-29 evening): pure white, no soft orange glows or tinted shadows anywhere ("ถ้าจะส้มก็
  ส้มไปเลย"): orange is solid (the start button, one hero card, the close) or absent; shadows are neutral grey. The top
  bar is a floating rounded glass capsule. No comparison with hiring a real secretary (accountants will use Krarok too).
  The hero is the headline, one line of copy and เริ่มใช้ฟรี only. The start button follows GSAP's magnetic-button demo
  (a CI gradient pill, ink label, pulled by the pointer, elastic spring back, an occasional CustomWiggle).
- Hero round 6 (owner, 2026-10-29 night): the headline reads "ตั้งแต่รับงาน จนถึงรับเงิน / ให้เลขากระรอกดูแล", two lines
  on every screen (phones size the type to fit). No line of copy under it: typing or speaking to เลขา is Pro only and
  the hero must not suggest it comes free. Under เริ่มใช้ฟรี, "พร้อมให้ใช้งานเต็มรูปแบบ 1 ธันวาคม 2569" counts down in four
  frosted tiles (`v5/launch.ts`) and goes on the day. เลขากระรอก's CI gradient runs slowly across the word without stopping
  (`is-flow`, 9 s a loop, still with reduced motion). The top bar is hazy frosted glass (see-through, blurred, a light
  sheen, a fine grain); its links sit on it with no pill; phones have no help button in it (help is in the footer and
  under the price). LINE, Gmail, the document and the squirrel float with no glass around them, the icons as large as
  a card (62px; 52px on phones), the squirrel a little larger (76px), each with only a soft shadow.
- Hero round 7 (owner, 2026-10-29 late): the headline a size smaller (clamp 48–68px; phones fit two lines at up to
  32px) and the launch countdown a size larger (96×86 tiles, 38px digits), the headline still the first thing seen.
  เลขากระรอก stands at the end of "…ดูแล", waving (the locked mascot, its own wave; 1.3× the type, 1.25× on phones, clear of
  the line above). The floating cards stay as they were, upright (a tilt toward the phone was tried and taken back).
- Features (owner, 2026-10-29): "ครบจบในแอปเดียว", and each feature says which plan it is in: KRAROK PRO (the chat, the
  morning reminder) or what Free gives (documents: ฟรี 10 ใบต่อเดือน · Pro ไม่จำกัด; the calendar: ใช้ฟรี); no legend line
  under the heading (taken out, owner 2026-10-30). Pictures are drawn, never captured: the chat is the app's own AssistantChat running in the page
  (`v5/ChatLive.tsx`: a scripted sample conversation, no AI called, inert, 1440×900 or 390×844 scaled to fit, only
  while near the screen), and the documents are the app's own DocumentA4 sheets with sample data (`v5/DocsLive.tsx`),
  so both stay sharp at any zoom. The landing keeps the page light while it shows (the app's evening dark mode would
  otherwise reach the chat).
- The first screen (owner, 2026-10-30): headline, the launch countdown, then the start button a size up (a white light
  crosses it now and then) with the real signup total beside it (under it on phones). The duplicate squirrel card is gone
  (the squirrel stands in the headline). The signup total (`v5/SignupCount.tsx`, `/api/public-stats`): "มีผู้สมัครแล้ว N คน
  · มาเริ่มจัดการเรื่องเงินไปด้วยกัน", every confirmed account once (not Pro), without guests, admins, the report inbox,
  accounts on their way out or test addresses (and any listed in the SIGNUP_COUNT_EXCLUDE secret); only the total leaves
  the server, counted at most once a minute; asked again every 60 s, never called live; digits roll from the old
  number; no number at all when there is none (never 0). On phones the chat is a phone in the page (272px, the hero
  phone's bezel), its own left alignment.
- Phones show the Gmail icon among the floating cards too (owner, 2026-10-30): LINE · 08:00 · Gmail, then +฿5,000.
- The 08:00 reminder phone shows LINE as LINE draws it (owner, 2026-10-30, from a screenshot of the real chat: the cards
  were too zoomed in): `v5/LinePhone.tsx` + `linePhone.css`, LINE's dark look (bars #111111, chat #1A1A1A), the bot's
  picture beside each card at about three quarters of the screen, grey times, the green message LINE sends when
  ได้รับแล้ว is pressed ("ได้รับเงินแล้ว · <job>", the button's displayText), the reply card, and the menu bar
  "เลขาการเงิน ▴". The chat moves up as messages arrive; the cards never pass over the bar.
- The hero's เลขากระรอก stays in type with its ordinary ร: a drawn wordmark with a squirrel-tail ร was tried and taken
  back (owner, 2026-10-30: "ใช้รอเรือเหมือนเดิมดีกว่า"; the drafts stay in `artifacts/wordmark-tail`).
- English (owner, 2026-10-30: shorter, same meaning as the Thai, sized for phones): "From job to payday, / Krarok
  Assistant is on it" with "Krarok Assistant" in a rounded type (Nunito 800, as เลขากระรอก is in Thai's looped type),
  two lines on every phone; headings a size down on phones, each two lines ("All in one app", "Reminded each morning,
  / before you forget", "Know when money lands, / and how much"). Headings and short paragraphs balance their lines in
  both languages. The chat demo talks in the page's language, written as เลขา writes: one short line, then a list with
  bold labels; a bold label arrives whole while it types.
- The language switch (owner, 2026-10-30: "สำคัญมาก"): a quiet pill at the bar's right end (beside เริ่มใช้ฟรี on phones;
  no globe under 375px) that names the language it switches to, in that language ("EN" / "ไทย"). The landing is drawn
  again in the new language, and the choice is kept for the app and the sign-in page.
- The bar has no เข้าสู่ระบบ (owner, 2026-10-30): every start button opens /login, which signs in or signs up. On computers
  and iPads the bar's start button is away while another start button is on screen (`useBarStart`): not on the first
  screen, sliding in (its room opening to its width, a small spring) once the page moves on to the phone, stepping aside
  under the price and at the closing card. The menu stays in the bar's middle. Phones keep their bar as it was.
- Who it is for (owner, 2026-10-30): the money ticker became a small heading "รับงานแบบไหน ก็มีเลขาช่วยได้" over the
  kinds of work moving past (กราฟิกดีไซเนอร์ · ช่างภาพ · คนตัดต่อ · ครีเอเตอร์ · นักเขียน · นักพัฒนา · ติวเตอร์ · คนรับงานอิสระ),
  each in a soft chip with a plain line icon in CI orange; screen readers get the same as one list; with reduced motion
  the chips simply wrap.
- The problems (owner's copy, 2026-10-29): "เคยเป็นแบบนี้ไหม?", "แค่รับงาน / ก็เหนื่อยพอแล้ว…", and five notes in the
  owner's words and line breaks (forgot to note it, documents, money mixed up, who has paid, the real profit). A note is
  as wide as its longest line (270–340px) on computers; a line wraps inside its note only where there is no room.
- Each feature is a page of its own. The chat with เลขา is the app's real chat screen, recorded with example data
  (`public/landing-v5/chat-*.mp4`, no AI called), big, with เลขากระรอก beside it in the chat's own poses and words, in
  step with the recording (listening while typed to, thinking with the bulb, typing its answer, proud when saved).
- Order: the hero and the phone as one scene (pinned on computers and iPads held sideways: the words lift away, the
  floating cards fly into the phone, the phone rises to the middle with "เห็นเงินทั้งเดือนในหน้าเดียว" beside it), the
  money ticker, the problem notes (Sriracha) around their heading, the price (Free beside the Pro card, ฿249 counting
  down to ฿159 while the deal runs), ครบในแอปเดียว then one page each: the chat recording, the 08:00 reminder, documents,
  the calendar and spending, questions, the close in a CI card with a ribbon and the countdown.
- Free features shown too (owner, 2026-10-29: "ฟีเจอร์ฟรี ... รายจ่ายใส่เข้าไปด้วย ... ไทม์ไลน์ ... 2 แบบ"), both in
  `v5/MoneyDemos.tsx` + `money.css`, drawn in the app's look with the page's one set of example numbers (October 2569,
  today the 13th, ฿13,000 received, ฿1,200 spent, ฿11,800 left, as the chat's monthly summary says):
  - The calendar section has the ปฏิทิน page's two views behind its iOS segmented switch: the month on a calendar, and
    the timeline with the jobs listed down the months in the app's own order and status colours (due soon, still to
    come, received), moving up to November and stopping on a row's edge. While on screen the views take turns (9 s
    each), each starting its motion again; a visitor's press keeps one. The calendar sets the height, so nothing moves.
  - "จดรายจ่าย / รู้กำไรจริง" (ใช้ฟรี): three costs are added one after another (a ประจำ one and two ทั่วไป ones with their
    categories), the total rolls up, then รับเงินจริง · รายจ่ายรวม · กำไรสุทธิ. Inside both cards the text keeps the app's
    left alignment on phones.
- Phones and iPads held upright get the same sections in order, with the cards in a row under the words.
- Only features every account has today. Nothing admin-only or still to come (50 ทวิ is not shown yet).
- Contact and reports (owner, 2026-10-29, in the page's existing look): the footer (`#cl-help`, where the menu's
  ช่วยเหลือ goes) lists ติดตามและติดต่อ and ช่วยเหลือ. Only channels the project holds are links: อีเมลหาเรา is the email the
  privacy and terms pages give; ติดตามบน Instagram links to the owner's account (instagram.com/kraroktunngern);
  TikTok reads "— เร็ว ๆ นี้" until its address goes into `v5/brandLinks.ts`. One report form (`v5/HelpForm.tsx`) opens from the menu, the beta note under the price and the
  footer, at the kind of the button pressed; it posts to `/api/feedback-public`, which files the report in the existing
  แจ้งปัญหา system (admin inbox, LINE alert) under the account set in `FEEDBACK_PUBLIC_ACCOUNT_ID`, and sends a picture to
  the team's email. No reply times or promises; a failed send says so and keeps what was typed.

### Sign-in page (owner, 2026-10-30: "ดูสร้างสรรค์มากกว่านี้เหมือนกับหน้า landing page")

- The landing's look (`features/auth/AuthStage.tsx`, `authStage.css`): white, always light (no moon; the app's own dark or
  light setting comes back after signing in), no language switch (the language is chosen on the landing beside
  เข้าสู่ระบบ). A frosted white card (28px corners) rises in once; switching forms does not replay it.
- Around the card on computers float the landing's things: LINE, เงินเข้าเดือนนี้ with its line, a document, Gmail, the
  08:00 reminder and +฿5,000 รับแล้ว, each arriving in turn and then drifting gently. iPads keep the icons only. Phones
  put LINE and Gmail on the card's top-left edge, so they move with the card whatever form it shows. Pictures only
  (aria-hidden); nothing floats over the card, the squirrel or the top bar on any form (`tests/e2e/login-stage.spec.ts`).
- เลขากระรอก stands on the card's top-right edge, waving (its own wave, never redrawn). The page keeps room at the top
  for the bar and the squirrel however tall the form grows.
- The sign-in buttons are equal (owner, 2026-10-30: the solid Facebook blue stood out): all three white with a grey line,
  the words in the middle, and each brand's own logo on a soft circle of its colour at the left (Google's four-colour G on
  #F1F3F4, the blue f on #E7F0FE, the CI mail icon on cream #FFF1E8). Below 390px the words sit just right of the circle so
  they keep one line. A switched-off Facebook still fades as before.
- With reduced motion nothing moves; everything is simply in place.

### Quotations and invoices in LINE (owner, 2026-10-30, after a competitor's LINE: cards, not question after question)
- "ทำ / ออก / สร้าง / ขอ + ใบเสนอราคา / ใบแจ้งหนี้ / ใบวางบิล" in LINE is read by fixed rules, with no model call
  (`backend/src/services/lineDocumentDraft.ts`): the client, line items ("20 รูป รูปละ 300"), the amount ("ยอด 4,000"),
  VAT, หัก ณ ที่จ่าย and เครดิต N วัน. "ขอใบเสนอราคา คุณเอ" (a name, no amount) is still a search.
- The draft card (the formal LINE card, `document` kind): ผู้ออกเอกสาร (the saved business), ลูกค้า, the lines, taxes,
  the net total, and "ยังไม่ได้กรอก" in amber for what is missing. Complete: สร้างเอกสาร, then แก้ไข / กรอกเพิ่ม and ยกเลิก.
  Not complete: กรอกข้อมูล (the LINE form) and ยกเลิก. A draft lasts 30 minutes; one card, one draft.
- The LINE form (`liff-add.html` draftKind=document, `liff-document.js`): one page in the job form's look, what the card
  knew filled in, the user's own words shown for reference, the business asked only when none is saved (then kept),
  lines with quantity, unit and price, VAT, หัก ณ ที่จ่าย, credit chips (ไม่มี / 7–90 วัน) and the totals.
- สร้างเอกสาร (card or form) saves the same unsigned draft document as the app's เลขา, through the same checked write
  (Free plan quota, validation); the same draft always gives the same document, so two presses make one. The created
  card shows the number, client and total, and opens the document in the app (signed in through LINE) to download the
  PDF, edit it or issue the next document.

### Mascot (เลขากระรอก)

- **The squirrel is locked (owner):** never redraw it. Only its mood, action and props may change; props are added
  only when the owner asks (headset removed, hologram added on 2026-10-27; the headset back on 2026-10-29).
- **The headset (owner, 2026-10-29: "อยากได้น้องที่ใส่หูฟังแทน"):** the squirrel walking out in the Pro arrival, the
  corner squirrel, the squirrel perched on the chat (window, full chat, phone sheet) and the folded mini squirrel all
  wear the headset alone (`gear="headset"`: no aura, ring or star). The arrival cannot be skipped; it closes itself.

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
- Don't add a second accent colour, gradient text (beyond the chat and onboarding greetings and the plans page), glows or emoji.
- Don't pill-round action buttons or mix radii within one component.
- Don't change phone screens, the mascot drawing or the CI colours without the owner.
- Don't let text clip, overlap or run under another element.
- Don't put API keys or secrets anywhere in the frontend, logs or this repository.
- Don't name, in anything customers can read (pages, the app, LINE, emails, the terms and privacy pages), the AI
  companies or models behind เลขา, the tools the app is built with, or the database and hosting companies; describe
  them by kind ("ผู้ให้บริการ AI"), which the privacy law allows (owner, 2026-10-30: "ต้องปิดเป็นความลับ"). Names people
  meet themselves stay: Google and Facebook sign-in, Gmail, LINE, Stripe.
- Don't mention features ordinary accounts cannot use yet (see `shared/featureAvailability.ts`), or a free trial: there
  is none for accounts created from 30 Oct 2569 09:30 (`shared/trial.ts`). Terms, privacy and help text follow only
  what is in effect today.

## 8. Responsive behaviour

- Touch targets at least 44px on phones; 40px on computers.
- Cards go full width on phones; action bars stack with the primary action last (closest to the thumb).
- The corner on computers and iPads (owner, 2026-10-27: version 2): the official squirrel standing whole, waving, with
  a bubble at its left: "มีอะไรให้ช่วยไหมครับ" and only "กดที่ผม" under it (no shortcut written), now and then; news
  (thinking, an answer, a card waiting, a save) takes the same bubble. No pill, no haze behind it. Phones the same
  since 2026-10-27 ("ทำในมือถือด้วยเลย"): 72px above the bottom bar, the hello about 5 seconds in every 20.
  It stays off แจ้งปัญหา, which is a chat with the team (owner, 2026-10-28); an open or folded เลขา window stays.
- The floating เลขา window (computers and iPads) moves aside or folds into the mini squirrel when a document preview
  would be covered.
- Its expand button is never a bigger window: it opens the full chat page, the same page as the sidebar's เลขากระรอก,
  with the conversation carried over (owner, 2026-10-27).
- The full chat on computers and iPads is the same set as the window (owner, 2026-10-27: "ทำให้เหมือนตัวนี้เลย"): the
  window's perched squirrel with its calm motion and name capsule at the top, the token ring top-left, white round
  buttons, the start's title, line, briefing and questions in one 760px column, the white composer.
- The full chat page, 940px wide and up (owner, 2026-10-28: "แท็บตรงหน้าจอกระรอกยาวไปเลย ... เอาแท็บด้านข้างแทรกขึ้นมา"):
  one chat card across the whole width; the chat history is a glass panel layered on it, 8px inside the rim, 20px
  corners, with the sidebar's shadow. Messages, the composer and the squirrel stay centred in the part left visible;
  folding the history gives the whole card to the chat. Narrower screens keep the history sliding over with a scrim.
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
