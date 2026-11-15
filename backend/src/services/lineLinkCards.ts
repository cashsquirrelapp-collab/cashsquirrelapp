import type { LineMessage, LineQuickReply } from './line.js';
import { LINE_BRICK, LINE_CARD_COLORS as C, lineAppLink, lineCard, lineValueRow } from './lineCards.js';
import { LINE_JOB_EXAMPLES } from './lineEntryRouting.js';
import { encodeTry, greetingHeader, greetingTile, SHEETS_TILE, type TryDraft, type UseType } from './lineTry.js';

// Cards for connecting and disconnecting LINE (owner, 2026-10-22): a warm welcome in the voice of the
// squirrel secretary, and a clear notice when the connection ends. Every line states what is true for
// this account: LINE recording and reminders are Pro features (free trial included), and the 08:00
// reminder also needs its switch on in Settings.

/** A feature with its one-line explanation, stacked so neither is squeezed. */
function feature(title: string, detail: string) {
  return { type: 'box', layout: 'vertical', spacing: 'xs', margin: 'lg', contents: [
    { type: 'text', text: title, size: 'sm', weight: 'bold', color: C.text, wrap: true },
    { type: 'text', text: detail, size: 'xs', color: C.muted, wrap: true },
  ] };
}

/**
 * Right after a chat is linked, in the greeting's look (owner, 2026-11-13, design C with the office buildings): the band,
 * what to do with its icons, the sheet line where the Sheets features are shown, and the plan's button.
 */
export function buildLineWelcome(options: { pro: boolean; sheets?: boolean; quickReply?: LineQuickReply }): LineMessage {
  const footer = options.pro ? lineAppLink('/jobs?openAddJob=1', 'เพิ่มงานในแอป') : lineAppLink('/plans', 'ดูแพ็กเกจ Pro');
  const card: LineMessage = { type: 'flex', altText: 'ยินดีต้อนรับครับ เชื่อมต่อ LINE กับกระรอกตุนเงินเรียบร้อยแล้ว', contents: {
    type: 'bubble', size: 'mega', styles: { body: { backgroundColor: '#FFFFFF' }, footer: { backgroundColor: '#FFFFFF' } },
    header: greetingHeader('ยินดีต้อนรับครับ', 'เชื่อมต่อ LINE เรียบร้อยแล้ว', 'guide'),
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingTop: '10px', contents: [
      { type: 'text', text: options.pro
        ? 'ผมคือเลขากระรอก ผู้ช่วยดูแลงานและรายรับของคุณ มีอะไรให้ช่วย พิมพ์บอกได้เลยครับ'
        : 'ผมคือเลขากระรอก ผู้ช่วยดูแลงานและรายรับของคุณครับ', size: 'sm', color: C.text, wrap: true, margin: 'md' },
      greetingTile('working', 'บันทึกงาน', `พิมพ์ “${LINE_JOB_EXAMPLES[0]}” แล้วตรวจก่อนบันทึก`),
      greetingTile('reminder', 'เตือนรับเงิน', 'แจ้งเวลา 08:00 เมื่อมีงานใกล้ถึงกำหนดรับเงิน เปิดได้ในหน้าตั้งค่า'),
      greetingTile('report', 'ดูภาพรวม', 'พิมพ์ “สรุปเดือนนี้” หรือ “รอรับเงิน”'),
      ...(options.sheets ? [SHEETS_TILE()] : []),
      ...(options.pro ? [] : [{ type: 'separator', color: C.border, margin: 'xl' }, { type: 'text', text: 'การบันทึกงานและแจ้งเตือนผ่าน LINE เป็นสิทธิ์ของสมาชิก Pro', size: 'xs', color: C.muted, wrap: true, margin: 'lg' }]),
    ] },
    ...(footer ? { footer: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingTop: '0px', contents: [
      { type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'uri', ...footer } },
    ] } } : {}),
  } } as LineMessage;
  return options.pro && options.quickReply ? { ...card, quickReply: options.quickReply } as LineMessage : card;
}

// A chat without an account (owner, 2026-11-15: "เวลาคนแอดไลน์ไปแล้วมึงควรแบบขึ้นข้อความทักหาเขาว่าเราคืออะไร ... สอนวิธีการ
// ล็อกอิน ... เวลาเขาทักไปไม่ว่าจะเป็นอะไร ... ให้เขาเชื่อมต่อก่อน"): adding the OA brings one card that says what Krarok is
// and how to connect, step by step; anything sent before connecting (words, a sticker, a picture, a file) brings the
// connect-first card. With sign-up in LINE on, both open the sign-up page inside LINE (LIFF ?start=1) or its
// มีบัญชีอยู่แล้ว screen (?link=1); with it off, the website and the 16-character code from Settings.

type Link = { label: string; uri: string };
/** The buttons that connect a chat: เริ่มใช้งาน, and มีบัญชีอยู่แล้ว where it opens inside LINE. A record typed before
 * connecting rides in the sign-up link (keep) and is saved as the first record (lineSignup.ts). */
export function connectLinks(options: { liffId?: string; signup: boolean; tried?: TryDraft | null; use?: UseType | null }): { start?: Link; existing?: Link } {
  if (!options.signup || !options.liffId) return { start: lineAppLink('/login', 'สมัครหรือเข้าสู่ระบบบนเว็บ') };
  const params = new URLSearchParams({ start: '1', ...(options.tried ? { keep: encodeTry(options.tried) } : {}), ...(options.use ? { use: options.use } : {}) });
  return {
    start: { label: 'เริ่มใช้งาน', uri: `https://liff.line.me/${options.liffId}?${params}` },
    existing: { label: 'มีบัญชีอยู่แล้ว · เข้าสู่ระบบ', uri: `https://liff.line.me/${options.liffId}?start=1&link=1` },
  };
}

/** One step of connecting: its number in a CI circle, what to do, and one line on it. */
function connectStep(number: number, title: string, detail: string) {
  return { type: 'box', layout: 'horizontal', spacing: 'md', margin: 'md', contents: [
    { type: 'box', layout: 'vertical', flex: 0, width: '24px', height: '24px', cornerRadius: '999px', backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
      contents: [{ type: 'text', text: String(number), size: 'xs', weight: 'bold', color: '#FFFFFF', align: 'center' }] },
    { type: 'box', layout: 'vertical', flex: 1, contents: [
      { type: 'text', text: title, size: 'sm', weight: 'bold', color: C.text, wrap: true },
      { type: 'text', text: detail, size: 'xs', color: C.muted, wrap: true },
    ] },
  ] };
}

/** The steps for this way in, and the line for an account made on the website. */
function connectSteps(signup: boolean) {
  return signup ? {
    steps: [
      connectStep(1, 'กด เริ่มใช้งาน ด้านล่าง', 'หน้าเริ่มใช้งานเปิดในแชทนี้ ใช้บัญชี LINE ไม่ต้องใช้อีเมล'),
      connectStep(2, 'ใส่ชื่อและประเภทงาน', 'เสร็จแล้วกลับมาพิมพ์บอกเลขาในแชทนี้ได้เลย'),
    ],
    existing: 'มีบัญชีบนเว็บอยู่แล้ว กด มีบัญชีอยู่แล้ว แล้วเข้าสู่ระบบด้วยอีเมลและรหัสผ่านเดิม ถ้าสมัครด้วย Google ให้ขอรหัส 16 ตัวที่ ตั้งค่า › เชื่อมต่อ LINE บนเว็บ แล้วส่งมาที่แชทนี้',
  } : {
    steps: [
      connectStep(1, 'สมัครหรือเข้าสู่ระบบบนเว็บ', 'กดปุ่มด้านล่างเพื่อเปิดเว็บกระรอกตุนเงิน'),
      connectStep(2, 'ไปที่ ตั้งค่า › เชื่อมต่อ LINE', 'กดขอรหัสเชื่อมต่อ จะได้รหัส 16 ตัว'),
      connectStep(3, 'ส่งรหัสมาที่แชทนี้', 'เชื่อมต่อเสร็จแล้วพิมพ์บอกเลขาได้เลย'),
    ],
    existing: '',
  };
}

/** The buttons under a card: เริ่มใช้งาน first, มีบัญชีอยู่แล้ว under it in grey. */
function connectFooter(links: { start?: Link; existing?: Link }) {
  const buttons = [
    ...(links.start ? [{ type: 'button', style: 'primary', color: C.accent, height: 'sm', action: { type: 'uri', ...links.start } }] : []),
    ...(links.existing ? [{ type: 'button', style: 'secondary', color: C.subtle, height: 'sm', action: { type: 'uri', ...links.existing } }] : []),
  ];
  return buttons.length ? { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: buttons } : undefined;
}

/**
 * Adding the OA, for a chat without an account: the greeting's look (design C, the brick band with the office buildings and
 * the official mascot), what Krarok does, then how to connect in numbered steps and the buttons for it.
 */
export function buildLineHello(options: { liffId?: string; signup: boolean; sheets?: boolean }): LineMessage {
  const links = connectLinks({ liffId: options.liffId, signup: options.signup });
  const { steps, existing } = connectSteps(options.signup);
  const footer = connectFooter(links);
  return { type: 'flex', altText: 'ยินดีที่ได้รู้จักครับ ผมคือเลขากระรอก เลขาการเงินในแชท LINE เชื่อมต่อบัญชีก่อน แล้วพิมพ์บอกรายรับรายจ่ายในแชทนี้ได้เลย', contents: {
    type: 'bubble', size: 'mega', styles: { header: { backgroundColor: LINE_BRICK }, body: { backgroundColor: '#FFFFFF' }, footer: { backgroundColor: '#FFFFFF' } },
    header: greetingHeader('ยินดีที่ได้รู้จักครับ', 'ผมคือเลขากระรอก เลขาการเงินในแชท LINE'),
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingTop: '14px', contents: [
      { type: 'text', text: 'กระรอกตุนเงินช่วยจดรายรับ รายจ่าย และงานที่รอรับเงิน ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และเตือนเมื่อถึงวันรับเงิน ทั้งหมดในแชทนี้', size: 'sm', color: C.text, wrap: true },
      greetingTile('spent', 'พิมพ์บอกหรือส่งรูปสลิป', 'เช่น ค่ากาแฟ 60 หรือ งานถ่ายรูป 5000'),
      greetingTile('review', 'ตรวจแล้วกดยืนยัน', 'เลขาทำการ์ดให้ดูก่อนบันทึกทุกครั้ง'),
      greetingTile('report', 'ดูสรุปเมื่อไหร่ก็ได้', 'พิมพ์ สรุปเดือนนี้ หรือ รอรับเงิน'),
      ...(options.sheets ? [SHEETS_TILE()] : []),
      { type: 'separator', color: C.border, margin: 'xl' },
      { type: 'text', text: options.signup ? 'เริ่มใช้งาน 2 ขั้นตอน' : 'เชื่อมต่อ 3 ขั้นตอน', size: 'md', weight: 'bold', color: C.text, margin: 'lg' },
      ...steps,
      ...(existing ? [{ type: 'text', text: existing, size: 'xs', color: C.muted, wrap: true, margin: 'lg' }] : []),
    ] },
    ...(footer ? { footer } : {}),
  } } as LineMessage;
}

const bahtText = (amount: number) => `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Anything from a chat without an account: connect first. No AI is called and nothing is stored; a record typed as
 * "ข้าวมันไก่ 50" is shown and kept with the sign-up, so it is saved as the first record.
 */
export function buildConnectFirst(options: { liffId?: string; signup: boolean; tried?: TryDraft | null; use?: UseType | null }): LineMessage {
  const tried = options.signup ? options.tried ?? null : null;
  const links = connectLinks({ liffId: options.liffId, signup: options.signup, tried, use: options.use });
  const { steps, existing } = connectSteps(options.signup);
  const card = lineCard({
    title: 'เชื่อมต่อบัญชีก่อนครับ', subtitle: 'LINE นี้ยังไม่ได้เชื่อมกับบัญชีกระรอกตุนเงิน', character: 'welcome',
    altText: tried ? `เชื่อมต่อบัญชีก่อนครับ กดเริ่มใช้งานแล้ว ${tried.name} ${bahtText(tried.amount)} จะถูกบันทึกให้`
      : 'เชื่อมต่อบัญชีก่อนครับ แล้วเลขาจะช่วยบันทึกและตอบในแชทนี้ได้',
    body: [
      // The record typed before connecting, in its own block: what it is, its amount, and that it is saved at sign-up.
      ...(tried ? [{ type: 'box', layout: 'vertical', spacing: 'xs', cornerRadius: '12px', backgroundColor: C.subtle, paddingAll: '12px', contents: [
        { type: 'text', text: tried.kind === 'income' ? 'รายรับที่พิมพ์มา' : 'รายจ่ายที่พิมพ์มา', size: 'xs', color: C.muted, wrap: true },
        { type: 'box', layout: 'horizontal', spacing: 'md', contents: [
          { type: 'text', text: tried.name, size: 'sm', weight: 'bold', color: C.text, wrap: true, flex: 1 },
          { type: 'text', text: `${tried.kind === 'income' ? '+' : '−'}${bahtText(tried.amount)}`, size: 'sm', weight: 'bold', color: tried.kind === 'income' ? C.positive : C.negative, flex: 0, align: 'end' },
        ] },
        { type: 'text', text: 'บันทึกให้ทันทีเมื่อเริ่มใช้งานเสร็จ', size: 'xs', color: C.muted, wrap: true },
      ] }] : []),
      { type: 'text', text: 'เชื่อมต่อก่อน แล้วเลขาจะช่วยบันทึกรายรับ รายจ่าย งาน และตอบคำถามในแชทนี้ได้', size: 'sm', color: C.text, wrap: true, ...(tried ? { margin: 'lg' } : {}) },
      ...steps,
    ],
    ...(existing ? { note: existing } : {}),
  }) as LineMessage & { contents: Record<string, unknown> };
  const footer = connectFooter(links);
  if (footer) card.contents.footer = footer;
  return card;
}

export function buildLineDisconnected(): LineMessage {
  return lineCard({
    title: 'ยกเลิกการเชื่อมต่อแล้ว', subtitle: 'LINE นี้ไม่ได้เชื่อมกับบัญชีแล้ว', character: 'disconnected',
    altText: 'ยกเลิกการเชื่อมต่อ LINE กับกระรอกตุนเงินแล้ว',
    body: [
      { type: 'text', text: 'ขอบคุณที่ให้เลขากระรอกได้ดูแลครับ', size: 'sm', color: C.text, wrap: true },
      lineValueRow('การแจ้งเตือน', 'หยุดส่งทาง LINE แล้ว', { bold: false }),
      lineValueRow('ข้อมูลในแอป', 'อยู่ครบ ไม่มีการลบ', { bold: false }),
    ],
    note: 'ต้องการเชื่อมต่ออีกครั้ง ไปที่ ตั้งค่า > เชื่อมต่อ LINE ในแอป',
    footer: lineAppLink('/settings', 'เปิดหน้าตั้งค่า'),
  });
}
