// การชำระ in our workbooks' รายรับ (owner, 2026-11-24: "ในชีตอ่ะกูอยากให้มันแบบว่ามีช่องบอกว่ารับเงินยังหรือยังไม่รับ เอาแบบให้
// เหมือนแบบที่กูส่งให้" — the computer's การชำระ column): a drop-down in the app's own words, coloured as the app colours them.
// It is the row's word on payment: the app reads it and writes it (a sheet-map 'status' column), so a job not received yet
// stays so on both sides. Added to a workbook made before it by the app itself (backend sheetWrite.ts addPaymentColumn).
export const PAYMENT_HEADER = 'การชำระ';
export const PAYMENT_CHOICES = ['รับครบแล้ว', 'รับบางส่วน', 'ยังไม่จ่าย'] as const;
export type PaymentChoice = typeof PAYMENT_CHOICES[number];
/** The app's colours for each (JobsTab paymentBadge): a soft fill and its ink, hex without #. */
export const PAYMENT_TONES: Record<PaymentChoice, { fill: string; ink: string }> = {
  'รับครบแล้ว': { fill: 'E6F4EC', ink: '047857' },
  'รับบางส่วน': { fill: 'FDF1DE', ink: 'B45309' },
  'ยังไม่จ่าย': { fill: 'FFF1E8', ink: 'C24A16' },
};
/** รับแล้ว and ค้างรับ beside การชำระ (owner, 2026-11-25: "บางทีกูก็ไม่รู้ว่ามันรับบางส่วนเท่าไหร่แล้วเหลืออีกเท่าไหร่ มึงทำช่อง
 *  บอกด้วยดิ"): รับแล้ว is the money in so far (after withholding, as the app counts it; the app reads and writes it), ค้างรับ
 *  works itself out: nothing once รับครบแล้ว, else the amount less the tax withheld less รับแล้ว. With the amount in its own
 *  column, การชำระ holds only its word, so the drop-down's chip keeps its colour. */
export const RECEIVED_HEADER = 'รับแล้ว';
export const PENDING_HEADER = 'ค้างรับ';
/** วันนัดรับเงิน after them (owner, 2026-11-25, the month tabs): the day a job not received yet is due, so it shows in its
 *  month; a received one is in the month of วันที่รับเงิน. */
export const DUE_HEADER = 'วันนัดรับเงิน';
/** The month tabs of our workbooks (shared/monthTabs.ts): read-only views of รายรับ and รายจ่าย, one per month. */
export const MONTH_TAB_NAMES = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'] as const;
/** ค้างรับ's formula for row r, from the column letters of the amount, the tax withheld (may be absent), การชำระ and รับแล้ว. */
export function pendingFormula(at: { value: string; wht?: string | null; status: string; received: string }, r: number): string {
  const less = [at.wht, at.received].filter(Boolean).map(column => `-N(${column}${r})`).join('');
  return `IF(${at.value}${r}="","",IF(${at.status}${r}="${PAYMENT_CHOICES[0]}",0,MAX(0,ROUND(${at.value}${r}${less},2))))`;
}
/** รับบางส่วน says how much came in (owner, 2026-11-24: "รับบางส่วนบอกด้วยว่ารับเท่าไหร่"): "รับบางส่วน ฿500". */
export const partialText = (received: number) => `รับบางส่วน ฿${received.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
/** The amount in a cell such as "รับบางส่วน ฿1,500.50" (null when it names none). */
export function amountInText(text: string): number | null {
  const found = /(\d[\d,]*(?:\.\d+)?)/.exec(text.replace(/\s+/g, ''));
  const value = found ? Number(found[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}
/** What the cell says for a job: its word, and for รับบางส่วน the amount received. */
export function paymentCellOf(record: Parameters<typeof paymentChoiceOf>[0]): string {
  const choice = paymentChoiceOf(record);
  const received = Number(record.received) || 0;
  return choice === 'รับบางส่วน' && received > 0 ? partialText(received) : choice;
}
/** A job's word in the column. */
export function paymentChoiceOf(record: { value?: unknown; received?: unknown; pending?: unknown; status?: unknown; paymentStatus?: unknown }): PaymentChoice {
  const value = Number(record.value) || 0, received = Number(record.received) || 0;
  const status = String(record.paymentStatus || record.status || '');
  if (status === 'done' || status === 'paid' || (value > 0 && received >= value) || (received > 0 && Number(record.pending) === 0)) return 'รับครบแล้ว';
  if (status === 'partial' || status === 'installment' || received > 0) return 'รับบางส่วน';
  return 'ยังไม่จ่าย';
}
