import { taxReceiptSummaryForYear } from '../../../shared/tax.js';
import type { Job } from '../../../shared/types.js';
import { OFFICIAL_LINKS } from '../ai/accounting/officialLinks.js';
import { TAX_RULES } from '../ai/accounting/taxRules.js';
import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineCard, lineValueRow } from './lineCards.js';
import { todayInBangkok } from './lineReminders.js';

// The tax-season reminder (owner, 2026-11-02: "เตือนก่อนถึงฤดูยื่นภาษีเดือนมกราคม"): on 2 January, when online filing
// for the year just ended opens, and on 2 March, a month before the paper deadline. Pro accounts with LINE linked and
// notifications on. It says what the app knows for that year (money received, before withholding, and the tax already
// withheld) and when to file, from the verified rules (accounting/taxRules.ts); the tax itself needs the income type,
// so it points to เลขา for an estimate instead of guessing one.

export type TaxSeasonPhase = 'open' | 'closing';

/** The reminder's day: 2 January (open) or 2 March (closing), Bangkok time; null on any other day. */
export function taxSeasonPhase(now = new Date()): TaxSeasonPhase | null {
  const day = todayInBangkok(now);
  if (day.endsWith('-01-02')) return 'open';
  if (day.endsWith('-03-02')) return 'closing';
  return null;
}

/** The tax year being filed (BE): the calendar year that has just ended. */
export function filingYear(now = new Date()): number {
  return Number(todayInBangkok(now).slice(0, 4)) - 1 + 543;
}

const baht = (value: number) => `฿ ${(Math.round(value * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export interface TaxSeasonFacts { taxYear: number; gross: number; withheld: number; receipts: number }

export function taxSeasonFacts(jobs: Job[], now = new Date()): TaxSeasonFacts {
  const taxYear = filingYear(now);
  const summary = taxReceiptSummaryForYear(jobs, taxYear - 543);
  return { taxYear, gross: summary.fullYear.gross, withheld: summary.fullYear.wht, receipts: summary.rows.length };
}

export function buildTaxSeasonMessage(facts: TaxSeasonFacts, phase: TaxSeasonPhase): LineMessage {
  const rules = TAX_RULES[facts.taxYear];
  const paper = rules?.deadlines.paper ?? `31 มีนาคม ${facts.taxYear + 1}`;
  const online = rules?.deadlines.internet;
  const when = online
    ? `ยื่นแบบกระดาษได้ถึง ${paper} ยื่นออนไลน์ได้ถึง ${online}`
    : `ยื่นแบบกระดาษได้ถึง ${paper} ส่วนยื่นออนไลน์ กรมสรรพากรมักประกาศขยายเวลาเพิ่ม ตรวจวันล่าสุดที่เว็บ e-Filing`;
  const efiling = OFFICIAL_LINKS.efiling;
  const body: unknown[] = [
    lineValueRow('ภาษีที่ถูกหัก ณ ที่จ่าย', baht(facts.withheld), { caption: 'ใช้เป็นเครดิตตอนยื่นแบบ เก็บใบ 50 ทวิ ไว้ให้ครบ' }),
    lineValueRow('รายการรับเงินที่บันทึก', `${facts.receipts.toLocaleString('th-TH')} รายการ`),
    { type: 'text', text: when, size: 'xs', color: C.muted, wrap: true, margin: 'lg' },
    { type: 'text', text: `อยากรู้ภาษีโดยประมาณ พิมพ์ถามเลขาได้เลย เช่น "ประมาณภาษีปี ${facts.taxYear} ให้หน่อย" เลขาจะถามประเภทเงินได้ก่อนคำนวณ`, size: 'xs', color: C.text, wrap: true, margin: 'md' },
  ];
  return lineCard({
    compact: true, character: phase === 'closing' ? 'urgent' : 'report',
    title: phase === 'open' ? 'ฤดูยื่นภาษีมาแล้ว' : 'อีกไม่นานครบกำหนดยื่นภาษี',
    subtitle: `ปีภาษี ${facts.taxYear} · ภาษีเงินได้บุคคลธรรมดา`,
    altText: `${phase === 'open' ? 'ฤดูยื่นภาษีมาแล้ว' : 'ใกล้ครบกำหนดยื่นภาษี'} ปีภาษี ${facts.taxYear}: รายรับที่บันทึก ${baht(facts.gross)} ภาษีที่ถูกหัก ${baht(facts.withheld)}`,
    metric: { label: `รายรับที่บันทึกปี ${facts.taxYear} (ก่อนหัก ณ ที่จ่าย)`, value: baht(facts.gross), note: 'นับตามวันที่รับเงินจริง เฉพาะที่บันทึกในแอป' },
    body, note: 'เป็นข้อมูลจากแอป ไม่ใช่การคำนวณภาษีจากกรมสรรพากร',
    footer: { label: 'ยื่นแบบออนไลน์ (e-Filing)', uri: efiling.url },
  });
}
