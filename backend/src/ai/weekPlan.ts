import { deliveredNotInvoiced, type UninvoicedJob } from '../../../shared/briefing.js';
import { todayInBangkok } from '../../../shared/dueJobs.js';
import type { Invoice, Job } from '../../../shared/types.js';
import type { UserRow } from '../services/lineAssistant.js';
import { owedJobs, thaiDay, type OwedJob } from './collections.js';

// "สัปดาห์นี้มีอะไรต้องทำ" (owner, 2026-11-02: plan the week). Worked out from the saved data with plain rules, Monday
// to Sunday in Bangkok: work to hand over, delivered work with no bill yet, money that should come in, money already
// late, quotations still waiting. The same answer as a quick reply (no model, no tokens) and as a tool for เลขา.

const dayMs = 86_400_000;
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * dayMs).toISOString().slice(0, 10);
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const baht = (amount: number) => `฿${Number(amount || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const MAX = 5;

export interface WeekPlan {
  start: string; end: string; next: boolean;
  deliver: { id: string; name: string; client: string; due: string }[];
  bill: UninvoicedJob[];
  money: OwedJob[];
  late: OwedJob[];
  quotes: { number: string; client: string; days: number }[];
}

export function weekPlan(user: UserRow, options: { next?: boolean; now?: Date } = {}): WeekPlan {
  const today = todayInBangkok(options.now);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
  const monday = addDays(today, -weekday + (options.next ? 7 : 0));
  const start = options.next ? monday : today;
  const end = addDays(monday, 6);
  const jobs = (user.jobs || []) as unknown as Job[];
  const invoices = ((user as UserRow & { invoices?: Invoice[] }).invoices || []) as Invoice[];
  const deliver = jobs.filter(job => job.isPosted === false && isDay(job.postDate) && job.postDate >= start && job.postDate <= end)
    .map(job => ({ id: String(job.id), name: job.name || 'งาน', client: (job.client || '').trim(), due: job.postDate! }))
    .sort((a, b) => a.due.localeCompare(b.due));
  const owed = owedJobs(user, options.now);
  const money = owed.filter(job => job.due && job.due >= start && job.due <= end).sort((a, b) => a.due!.localeCompare(b.due!));
  const late = options.next ? [] : owed.filter(job => (job.daysLate ?? 0) > 0).sort((a, b) => b.daysLate! - a.daysLate!);
  const bill = options.next ? [] : deliveredNotInvoiced(jobs, invoices, today);
  const answered = new Set(invoices.map(doc => doc.linkedFromId).filter(Boolean));
  const quotes = options.next ? [] : invoices.filter(doc => doc.documentType === 'quotation' && !doc.responseDate && !answered.has(doc.id) && isDay(doc.createdDate))
    .map(doc => ({ number: doc.documentNo || '-', client: doc.client?.name || '', days: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${doc.createdDate}T00:00:00Z`)) / dayMs) }))
    .filter(doc => doc.days >= 7 && doc.days <= 90).sort((a, b) => b.days - a.days);
  return { start, end, next: Boolean(options.next), deliver, bill, money, late, quotes };
}

/** The facts for เลขา (amounts as text, dates in Thai), each list cut to five with its full count. */
export function weekPlanFacts(plan: WeekPlan) {
  const cut = <T,>(rows: T[]) => ({ count: rows.length, items: rows.slice(0, MAX) });
  return {
    week: `${thaiDay(plan.start)} – ${thaiDay(plan.end)}`,
    to_deliver: cut(plan.deliver.map(job => ({ name: job.name, client: job.client, by: thaiDay(job.due) }))),
    to_bill: cut(plan.bill.map(job => ({ name: job.name, client: job.client, owed: baht(job.pending), delivered_days_ago: job.days }))),
    money_expected: { ...cut(plan.money.map(job => ({ name: job.name, client: job.client, amount: baht(job.amount), due: thaiDay(job.due!) }))), total: baht(plan.money.reduce((sum, job) => sum + job.amount, 0)) },
    money_late: { ...cut(plan.late.map(job => ({ name: job.name, client: job.client, amount: baht(job.amount), days_late: job.daysLate }))), total: baht(plan.late.reduce((sum, job) => sum + job.amount, 0)) },
    quotes_waiting: cut(plan.quotes.map(doc => ({ number: doc.number, client: doc.client, waiting_days: doc.days }))),
  };
}

/** The plan as เลขา's reply, in the chat's Markdown. */
export function weekPlanText(plan: WeekPlan): string {
  const head = `${plan.next ? 'สัปดาห์หน้า' : 'สัปดาห์นี้'} (${thaiDay(plan.start)} – ${thaiDay(plan.end)})`;
  const sections: string[] = [];
  const more = (count: number) => (count > MAX ? [`และอีก ${count - MAX} รายการ`] : []);
  if (plan.late.length) {
    sections.push(`**เงินที่เลยกำหนดแล้ว ${plan.late.length} งาน · ${baht(plan.late.reduce((sum, job) => sum + job.amount, 0))}**`,
      ...plan.late.slice(0, MAX).map(job => `- ${job.name}${job.client ? ` · ${job.client}` : ''} — ${baht(job.amount)} · เลยมา ${job.daysLate} วัน`), ...more(plan.late.length), '');
  }
  if (plan.deliver.length) {
    sections.push(`**งานที่ต้องส่ง ${plan.deliver.length} งาน**`,
      ...plan.deliver.slice(0, MAX).map(job => `- ${job.name}${job.client ? ` · ${job.client}` : ''} — ส่งภายใน ${thaiDay(job.due)}`), ...more(plan.deliver.length), '');
  }
  if (plan.bill.length) {
    sections.push(`**ส่งงานแล้ว ยังไม่ออกใบแจ้งหนี้ ${plan.bill.length} งาน**`,
      ...plan.bill.slice(0, MAX).map(job => `- ${job.name}${job.client ? ` · ${job.client}` : ''} — ${baht(job.pending)} · ส่งงานมา ${job.days} วัน`), ...more(plan.bill.length), '');
  }
  if (plan.money.length) {
    sections.push(`**เงินที่ควรเข้า ${plan.money.length} งาน · ${baht(plan.money.reduce((sum, job) => sum + job.amount, 0))}**`,
      ...plan.money.slice(0, MAX).map(job => `- ${job.name}${job.client ? ` · ${job.client}` : ''} — ${baht(job.amount)} · ครบกำหนด ${thaiDay(job.due!)}`), ...more(plan.money.length), '');
  }
  if (plan.quotes.length) {
    sections.push(`**ใบเสนอราคารอลูกค้าตอบ ${plan.quotes.length} ฉบับ**`,
      ...plan.quotes.slice(0, MAX).map(doc => `- ${doc.number}${doc.client ? ` · ${doc.client}` : ''} — รอมา ${doc.days} วัน`), ...more(plan.quotes.length), '');
  }
  if (!sections.length) return `${head} ยังไม่มีงานที่ต้องส่ง เงินที่ครบกำหนด หรือเรื่องที่ต้องตามครับ`;
  const tips: string[] = [];
  if (plan.late.length) tips.push('ให้เลขาร่างข้อความทวงได้ เช่น "ช่วยร่างข้อความทวงเงินให้หน่อย"');
  if (plan.bill.length) tips.push('ออกใบแจ้งหนี้ได้ที่ [หน้าเอกสาร](/invoice)');
  return [`${head} มีเรื่องที่ควรทำดังนี้ครับ`, '', ...sections, ...tips.map(tip => `${tip}`)].join('\n').trim();
}
