import { createHash } from 'node:crypto';
import type { ExpenseDraft, JobDraft } from './lineAssistant.js';
import { lineCard, lineValueRow, LINE_CARD_COLORS } from './lineCards.js';
import { formatCurrency } from './monthlySummary.js';
import type { LineMessage } from './line.js';

export type DraftKind = 'job' | 'expense';
export type StoredLineDraft = { createdAt: string; draft: JobDraft | ExpenseDraft; operationKey?: string };
const commands = { job: 'ยืนยันบันทึกงาน', expense: 'ยืนยันบันทึกรายจ่าย' };

export function lineDraftEditLink(kind: DraftKind, stored: StoredLineDraft): string | undefined {
  const liffId = process.env.LIFF_ID;
  if (!liffId || !/^[A-Za-z0-9-]+$/.test(liffId)) return undefined;
  return `https://liff.line.me/${liffId}?draftKind=${kind}&draftKey=${lineDraftKey(kind, stored)}`;
}

// JSONB may reorder keys; derive the same identity before and after storage.
export function lineDraftKey(kind: DraftKind, stored: StoredLineDraft): string {
  const values = Object.entries(stored.draft).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify([kind, stored.createdAt, values])).digest('hex').slice(0, 16);
}

export function lineDraftOperationId(kind: DraftKind, stored: StoredLineDraft): string {
  return `line-draft:${kind}:${stored.operationKey || lineDraftKey(kind, stored)}`;
}

export function decodeLineDraftAction(data: string): string | null {
  const match = /^draft:(confirm|cancel):(job|expense):([a-f0-9]{16})$/.exec(data);
  if (!match) return null;
  return match[1] === 'confirm' ? `${commands[match[2] as DraftKind]} ${match[3]}` : `ยกเลิกบันทึก ${match[2]} ${match[3]}`;
}

export function buildLineDraftReview(kind: DraftKind, stored: StoredLineDraft): LineMessage {
  const key = lineDraftKey(kind, stored);
  const draft = stored.draft;
  const job = draft as JobDraft;
  const expense = draft as ExpenseDraft;
  const amount = kind === 'job' ? job.value || 0 : expense.amount || 0;
  const complete = !!draft.name && amount > 0 && (kind === 'expense' || ['paid','partial','pending'].includes(job.paymentStatus || ''));
  const editUrl = lineDraftEditLink(kind, stored);
  const payment = job.paymentStatus === 'paid' ? 'รับเงินครบแล้ว' : job.paymentStatus === 'partial' ? `รับมัดจำ ${formatCurrency(job.receivedAmount || 0)}` : job.paymentStatus === 'pending' ? 'ยังไม่ได้รับเงิน' : 'ยังไม่ได้เลือก';
  const card = lineCard({
    title: 'ตรวจรายการก่อนบันทึก',
    character: 'review', compact: true,
    subtitle: kind === 'job' ? 'รายรับ / งาน · รอยืนยัน' : 'รายจ่าย · รอยืนยัน',
    metric: { label: draft.name || 'ยังไม่ได้ระบุชื่อ', value: amount > 0 ? formatCurrency(amount) : 'เพิ่มจำนวนเงิน' },
    body: [lineValueRow(kind === 'job' ? 'ชื่องาน' : 'รายการ', draft.name || '—', { bold: false }),
      ...(kind === 'job' ? [
        ...(job.client ? [lineValueRow('ลูกค้า', job.client, { bold: false })] : []),
        lineValueRow('การรับเงิน', payment, { bold: false }),
        ...(job.creditTerm ? [lineValueRow('เครดิต', `${job.creditTerm} วัน`, { bold: false })] : []),
        ...(job.whtRate ? [lineValueRow('หัก ณ ที่จ่าย', `${job.whtRate}%`, { bold: false })] : []),
      ] : [lineValueRow('หมวด', expense.category || 'อื่นๆ (เปลี่ยนได้)', { bold: false })]),
    ],
    note: editUrl ? 'ยังไม่บันทึก · แก้รายละเอียดได้ก่อนยืนยันภายใน 15 นาที' : 'ยังไม่บันทึก · พิมพ์ “ชื่อ …” หรือ “ยอด …” เพื่อแก้ไขก่อนยืนยัน',
    altText: `รอยืนยัน${kind === 'job' ? 'งาน' : 'รายจ่าย'} ${draft.name} ${formatCurrency(amount)}`,
  });
  (card as Extract<LineMessage, { type: 'flex' }>).contents = {
    ...(card as any).contents,
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: [
      ...(complete ? [{ type: 'button', style: 'primary', color: LINE_CARD_COLORS.accent, height: 'sm',
        action: { type: 'postback', label: 'ยืนยันบันทึก', data: `draft:confirm:${kind}:${key}`, displayText: commands[kind] } }] : []),
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        ...(editUrl ? [{ type: 'button', style: complete ? 'secondary' : 'primary', height: 'sm', flex: 2,
          ...(complete ? {} : { color: LINE_CARD_COLORS.accent }), action: { type: 'uri', label: complete ? 'แก้ไขรายการ' : 'เติมข้อมูล / แก้ไข', uri: editUrl } }] : []),
        { type: 'button', style: 'secondary', color: LINE_CARD_COLORS.subtle, height: 'sm', flex: 1,
          action: { type: 'postback', label: 'ยกเลิก', data: `draft:cancel:${kind}:${key}`, displayText: 'ยกเลิกรายการ' } },
      ] },
    ] },
  };
  return card;
}
