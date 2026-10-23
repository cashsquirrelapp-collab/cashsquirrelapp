import type { LineMessage, LineQuickReply } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineValueRow } from './lineCards.js';
import { LINE_JOB_EXAMPLES } from './lineEntryRouting.js';

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

export function buildLineWelcome(options: { pro: boolean; quickReply?: LineQuickReply }): LineMessage {
  const card = lineCard({
    title: 'ยินดีต้อนรับครับ', subtitle: 'เชื่อมต่อ LINE เรียบร้อยแล้ว', character: 'welcome',
    altText: 'ยินดีต้อนรับครับ เชื่อมต่อ LINE กับกระรอกตุนเงินเรียบร้อยแล้ว',
    body: [
      { type: 'text', text: options.pro
        ? 'ผมคือเลขากระรอก ผู้ช่วยดูแลงานและรายรับของคุณ มีอะไรให้ช่วย พิมพ์บอกได้เลยครับ'
        : 'ผมคือเลขากระรอก ผู้ช่วยดูแลงานและรายรับของคุณครับ', size: 'sm', color: C.text, wrap: true },
      feature('บันทึกงาน', `พิมพ์ “${LINE_JOB_EXAMPLES[0]}” แล้วตรวจก่อนบันทึก`),
      feature('เตือนรับเงิน', 'แจ้งเวลา 08:00 เมื่อมีงานใกล้ถึงกำหนดรับเงิน เปิดได้ในหน้าตั้งค่า'),
      feature('ดูภาพรวม', 'พิมพ์ “สรุปเดือนนี้” หรือ “รอรับเงิน”'),
    ],
    note: options.pro ? undefined : 'การบันทึกงานและแจ้งเตือนผ่าน LINE เป็นสิทธิ์ของสมาชิก Pro',
    footer: options.pro ? lineAppLink('/jobs?openAddJob=1', 'เพิ่มงานในแอป') : lineAppLink('/plans', 'ดูแพ็กเกจ Pro'),
  });
  return options.pro && options.quickReply ? { ...card, quickReply: options.quickReply } : card;
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
