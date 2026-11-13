import type { LineMessage, LineQuickReply } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineValueRow } from './lineCards.js';
import { LINE_JOB_EXAMPLES } from './lineEntryRouting.js';
import { greetingHeader, greetingTile, SHEETS_TILE } from './lineTry.js';

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

/**
 * A new friend of the LINE OA who has no account yet (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย"): what เลขา does and
 * one button that opens the sign-up page inside LINE (LIFF ?start=1, liff-add.js). Someone with a website account can
 * still send the 16-character code from Settings.
 */
export function buildLineStart(liffId: string | undefined): LineMessage {
  const start = liffId ? { label: 'เริ่มใช้งาน', uri: `https://liff.line.me/${liffId}?start=1` } : lineAppLink('/login', 'เริ่มใช้งาน');
  return lineCard({
    title: 'เลขากระรอกพร้อมช่วยครับ', subtitle: 'ดูแลงาน รายรับ รายจ่าย ในแชทนี้', character: 'welcome',
    altText: 'เลขากระรอกพร้อมช่วยครับ กดเริ่มใช้งานเพื่อเริ่มบันทึกงานและรายจ่ายใน LINE',
    body: [
      { type: 'text', text: 'กดเริ่มใช้งาน ใส่ชื่อและประเภทงาน แล้วพิมพ์บอกเลขาได้เลย ไม่ต้องใช้อีเมล', size: 'sm', color: C.text, wrap: true },
      feature('บันทึกด้วยการพิมพ์', `พิมพ์ “${LINE_JOB_EXAMPLES[0]}” หรือส่งรูปใบเสร็จ เลขาเตรียมให้ตรวจก่อนบันทึก`),
      feature('ลงชีตของคุณเอง', 'เชื่อม Google Sheets แล้วเลขาเพิ่มแถวให้ทุกครั้งที่บันทึก'),
      feature('เตือนรับเงิน', 'แจ้งเวลา 08:00 เมื่องานใกล้ถึงกำหนดรับเงิน'),
    ],
    note: 'มีบัญชีบนเว็บอยู่แล้ว ไปที่ ตั้งค่า › เชื่อมต่อ LINE แล้วส่งรหัส 16 ตัวมาที่แชทนี้',
    footer: start,
  });
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
