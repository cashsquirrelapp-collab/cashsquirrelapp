import type { VaultFile } from '../../../shared/vault.js';
import { isWht50Trackable, wht50StatusOf, wht50WaitingDays, type WhtTrackingJob } from '../../../shared/vaultStatus.js';
import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, MAX_LINE_ITEMS, lineAppLink, lineCard, lineJobItem, lineSection } from './lineCards.js';

export type LineFeatureJob = WhtTrackingJob & { name: string; client?: string };
export interface LineFeatureContext {
  /** Omit if the owner's vault lookup has not succeeded. An unavailable list is not an empty vault. */
  vaultFiles?: readonly VaultFile[];
}

const normalize = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase();
const commands: Record<string, 'vault' | 'wht50' | 'extras' | 'help' | 'invoice' | 'calendar' | 'upload'> = {
  คลังเอกสาร: 'vault', เอกสารของฉัน: 'vault',
  '50ทวิ': 'wht50', ใบ50ทวิ: 'wht50', ติดตาม50ทวิ: 'wht50',
  เมนูเพิ่มเติม: 'extras', เมนูอื่นๆ: 'extras',
  วิธีบันทึก: 'help', วิธีใช้: 'help', สั่งงานเลขา: 'help', เพิ่มรายการ: 'help', เพิ่มงาน: 'help',
  ออกเอกสาร: 'invoice', ใบแจ้งหนี้: 'invoice',
  ปฏิทินเงิน: 'calendar',
  ส่งเอกสาร: 'upload',
};

export function isLineFeatureShortcut(text: string): boolean {
  return Object.prototype.hasOwnProperty.call(commands, normalize(text));
}

export function isLineWhtShortcut(text: string): boolean {
  return commands[normalize(text)] === 'wht50';
}

function secondaryLink(path: string, label: string): any[] {
  const link = lineAppLink(path, label);
  return link ? [{
    type: 'button', style: 'secondary', height: 'sm', margin: 'md', color: C.subtle,
    action: { type: 'uri', ...link },
  }] : [];
}

const paragraph = (text: string) => ({ type: 'text', text, size: 'sm', color: C.text, wrap: true, margin: 'md' });

/**
 * Exact commands only; no model, database, or financial write. The caller supplies jobs and
 * optional vault metadata already scoped to the linked owner. Routes still require app login.
 */
export function buildLineFeatureShortcut(
  text: string,
  userJobs: readonly LineFeatureJob[],
  now = new Date(),
  context: LineFeatureContext = {},
): LineMessage | null {
  if (!isLineFeatureShortcut(text)) return null;
  const command = commands[normalize(text)];
  if (command === 'extras') {
    const links = [
      ...secondaryLink('/line-documents', 'จัดเอกสารของฉัน'),
      ...secondaryLink('/invoice', 'ออกเอกสาร'),
      ...secondaryLink('/calendar', 'ปฏิทินเงิน'),
    ];
    return lineCard({
    title: 'ทำต่อในแอป', subtitle: 'เลือกเฉพาะสิ่งที่ต้องใช้ตอนนี้', character: 'guide', altText: 'คลังเอกสาร · ใบ 50 ทวิ · ออกเอกสาร · ปฏิทินเงิน',
    body: links.length ? links : [paragraph('เมนูนี้ยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง')],
    note: 'เปิดด้วยบัญชีที่คุณเชื่อมกับ LINE ไว้',
    });
  }
  if (command === 'vault') return lineCard({
    title: 'เอกสารของฉัน', subtitle: 'แนบไฟล์และจัดให้ตรงงาน', character: 'document', altText: 'ดูไฟล์ที่จัดแล้ว และงานรอเอกสาร',
    body: [paragraph('ดูไฟล์ที่จัดแล้ว หรืองานรอเอกสาร เลือกงานแล้วแนบไฟล์ได้เลย'),
      lineSection('รองรับ PDF, JPG, PNG และ WEBP · ไม่เกิน 10 MB ต่อไฟล์')],
    footer: lineAppLink('/line-documents', 'เปิดเอกสารของฉัน'),
    note: 'การอัปโหลดใช้สิทธิ์ Pro ตามแพ็กเกจของบัญชี',
  });
  if (command === 'upload') return lineCard({
    title: 'ส่งเอกสารในแชทได้เลย', character: 'document', altText: 'ส่ง PDF หรือรูปในแชท แล้วเลือกประเภทกับงานที่เกี่ยวข้อง',
    body: [paragraph('แตะปุ่ม + ในแชทนี้แล้วส่ง PDF หรือรูปมาได้เลย ระบบจะเก็บเข้าคลังส่วนตัว จากนั้นเลือกประเภทและงานจากการ์ดตอบกลับ'),
      lineSection('รองรับ PDF, JPG, PNG และ WEBP · ไม่เกิน 10 MB ต่อไฟล์')],
    footer: lineAppLink('/line-documents', 'จัดเอกสารของฉัน'),
    note: 'ส่งจากบัญชี LINE ที่เชื่อมแล้ว · ใช้สิทธิ์ Pro หรือช่วงทดลอง',
  });
  if (command === 'invoice') return lineCard({
    title: 'ออกเอกสาร', subtitle: 'เริ่มจากข้อมูลที่มีอยู่ในแอป', character: 'document', altText: 'เปิดหน้าออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ',
    body: [paragraph('จัดทำใบเสนอราคา ใบแจ้งหนี้ หรือใบเสร็จ และตรวจรายละเอียดก่อนดาวน์โหลด PDF')],
    footer: lineAppLink('/invoice', 'เปิดหน้าเอกสาร'),
  });
  if (command === 'calendar') return lineCard({
    title: 'ปฏิทินเงิน', subtitle: 'ดูวันรับเงินและรายการที่ต้องติดตาม', character: 'reminder', altText: 'เปิดปฏิทินเงินในแอป',
    body: [paragraph('ดูรายการตามวันที่ในปฏิทินเงิน และเปิดงานที่ต้องการจัดการต่อได้เลย')],
    footer: lineAppLink('/calendar', 'เปิดปฏิทินเงิน'),
  });
  if (command === 'help') {
    const form = lineAppLink('/jobs?openAddJob=1', 'เพิ่มงานในแอป');
    return lineCard({
      title: 'เพิ่มงาน', character: 'review', altText: 'เปิดฟอร์มเพิ่มงานในแอปด้วยบัญชีที่เชื่อม LINE ไว้',
      body: [paragraph('เปิดฟอร์มเพิ่มงานในแอป กรอกข้อมูลงานและการรับเงินได้เลย')],
      footer: form, note: 'ใช้บัญชีที่คุณเชื่อมกับ LINE ไว้',
    });
  }

  // A job's withholding amount alone cannot establish whether its certificate is missing.
  // Keep the link useful while refusing to report false zeroes when vault metadata is absent.
  if (context.vaultFiles === undefined) return lineCard({
    title: 'ติดตามใบ 50 ทวิ', character: 'document', altText: 'ดูงานที่รอใบ 50 ทวิและแนบเอกสารในแอป',
    body: [paragraph('ดูงานที่รอใบ 50 ทวิ แนบเอกสารให้ตรงงาน และรวมไฟล์ที่ได้รับแล้วในหน้าเดียว')],
    footer: lineAppLink('/line-documents?view=missing', 'ดูใบ 50 ทวิ'),
    note: 'เปิดหน้าในแอปเพื่อตรวจสถานะเอกสารล่าสุด',
  });
  const files = [...context.vaultFiles];
  const today = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const trackable = userJobs.filter(isWht50Trackable);
  const waiting = trackable.filter(job => wht50StatusOf(job, files) === 'waiting')
    .map(job => ({ job, days: wht50WaitingDays(job, today) }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  return lineCard({
    title: 'ติดตามใบ 50 ทวิ', subtitle: 'งานที่บันทึกว่ารับเงินแล้วและมีหัก ณ ที่จ่าย', character: 'document',
    altText: `รอใบ 50 ทวิ ${waiting.length} งาน`,
    metric: { label: 'ยังไม่มีไฟล์ใบ 50 ทวิแนบกับงาน', value: `${waiting.length} งาน`, note: `จาก ${trackable.length} งานที่ต้องติดตาม · ทุกปีในบัญชี` },
    body: waiting.length ? waiting.slice(0, MAX_LINE_ITEMS).map(({ job, days }) => lineJobItem({
      name: job.name, client: job.client, amount: 'รอเอกสาร', meta: days === null ? 'ไม่พบวันที่รับเงินจริง' : `รับเงินมาแล้ว ${days} วัน`,
    })) : [paragraph(trackable.length ? 'งานที่ต้องติดตามมีไฟล์ใบ 50 ทวิแนบครบแล้ว' : 'ยังไม่มีงานที่ต้องติดตามใบ 50 ทวิในขณะนี้')],
    footer: lineAppLink('/line-documents?view=missing', 'จัดการใบ 50 ทวิ'),
    note: waiting.length > MAX_LINE_ITEMS ? `แสดง ${MAX_LINE_ITEMS} จาก ${waiting.length} งาน · ดูทั้งหมดในแอป` : 'สถานะนี้ตรวจจากไฟล์ที่แนบ ยังไม่ได้ตรวจเนื้อหาหรือยอดในเอกสาร',
  });
}
