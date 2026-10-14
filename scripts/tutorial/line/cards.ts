// Builds the LINE messages shown in the "เชื่อมต่อ LINE" tutorial clip by calling the app's own
// message builders with the sample account. Nothing is sent to LINE and no database is touched.
//
//   npx tsx scripts/tutorial/line/cards.ts
//
// Output: artifacts/line-tutorial/cards.json (git-ignored)
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, sampleJobs } from '../../landing/sampleData';
import type { Job } from '../../../shared/types';

const FIXED = new Date(CAPTURE_NOW).getTime();
const RealDate = Date;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Date = class extends RealDate { constructor(...args: any[]) { if (args.length) super(...(args as [any])); else super(FIXED); } static now() { return FIXED; } };
process.env.TZ = 'Asia/Bangkok';
process.env.APP_URL = 'https://kraroktunngern.vercel.app';
process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'sample-key-not-used';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const jobs: Job[] = sampleJobs;
const assistant = await import('../../../backend/src/services/lineAssistant');
const { buildDigestFlexMessage } = await import('../../../backend/src/services/lineReminders');
const { buildLineFeatureShortcut } = await import('../../../backend/src/services/lineFeatureShortcuts');
const { buildLineEntryHelp } = await import('../../../backend/src/services/lineEntryRouting');
const { buildLineDraftReview } = await import('../../../backend/src/services/lineDraftReview');
const { parseLineQuickDraft } = await import('../../../backend/src/services/lineQuickDraft');
const { computeMonthlySummary } = await import('../../../shared/monthlySummary');
const { getRelativeDaysText } = await import('../../../shared/calendar');

const today = new RealDate(FIXED + 7 * 3600e3).toISOString().slice(0, 10);
const monthKey = today.slice(0, 7);
const days = (date: string) => Math.round((new RealDate(`${date}T00:00:00+07:00`).getTime() - new RealDate(`${today}T00:00:00+07:00`).getTime()) / 86400000);

// The same selections lineAssistant's buildDataSnapshot and the daily digest make (they are not exported).
const unpaidJobs = jobs.filter(j => (j.pending || 0) > 0 && j.status !== 'done');
const snapshot = {
  unpaid: unpaidJobs.map(j => ({ name: j.name, client: j.client || '', pending: j.pending || 0, dueDate: j.payDate || null, dueText: j.payDate ? getRelativeDaysText(j.payDate).text : 'ไม่ระบุวันครบกำหนด' })),
  totalPendingAllTime: unpaidJobs.reduce((sum, j) => sum + (j.pending || 0), 0),
};
const attention = jobs.flatMap(j => {
  if (j.installments?.length) return j.installments.flatMap(row => (row.status === 'paid' || row.amount <= 0 || !row.dueDate || days(row.dueDate) > 2) ? [] : [{ ...j, id: `${j.id}:${row.id}`, name: `${j.name} · ${row.label}`, pending: row.amount, payDate: row.dueDate, diffDays: days(row.dueDate) }]);
  return (j.pending <= 0 || !j.payDate || days(j.payDate) > 2) ? [] : [{ ...j, diffDays: days(j.payDate) }];
});
const expenses = [
  { id: 'e1', name: 'ค่าโปรแกรมตัดต่อ', category: 'equipment', amount: 800, date: `${monthKey}-03` },
  { id: 'e2', name: 'ค่าเดินทางไปถ่ายงาน', category: 'travel', amount: 400, date: `${monthKey}-02` },
];

const cards: Record<string, unknown> = {};
const add = (name: string, build: () => unknown) => {
  try { cards[name] = build(); console.log('ok   ', name, '|', (cards[name] as { altText?: string; text?: string })?.altText ?? (cards[name] as { text?: string })?.text ?? ''); }
  catch (error) { console.log('FAIL ', name, '|', (error as Error).message.split('\n')[0]); }
};
/* eslint-disable @typescript-eslint/no-explicit-any */
add('unpaid', () => assistant.buildUnpaidJobsMessage(snapshot as any));
add('digest', () => buildDigestFlexMessage(attention as any));
add('monthly', () => assistant.buildMonthlySummaryMessage({ ...computeMonthlySummary(jobs as any, expenses as any, [], { monthlyExpense: 0 } as any, monthKey), monthKey } as any));
add('extras', () => buildLineFeatureShortcut('เมนูเพิ่มเติม', jobs as any, new RealDate(FIXED)));
add('entryHelp', () => buildLineEntryHelp());
add('draftReview', () => {
  const parsed = parseLineQuickDraft('กาแฟ80') as any;
  if (!parsed) throw new Error('the quick-draft parser did not recognise "กาแฟ80"');
  console.log('      parsed "กาแฟ80":', JSON.stringify(parsed));
  const draft = { name: parsed.expenseName, amount: parsed.expenseAmount, category: parsed.expenseCategory, date: parsed.expenseDate || today };
  return buildLineDraftReview('expense', { createdAt: new RealDate(FIXED).toISOString(), draft: draft as any });
});
add('expenseSaved', () => {
  // The same path the bot takes after "ยืนยัน": the parsed draft becomes an expense, then the saved card.
  const parsed = parseLineQuickDraft('กาแฟ80') as any;
  const expense = assistant.buildExpenseFromDraft({ name: parsed.expenseName, amount: parsed.expenseAmount, category: parsed.expenseCategory, date: parsed.expenseDate || today } as any);
  return assistant.buildExpenseSavedMessage(expense);
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// Card art is served by the app; point at it by path so the clip can be rendered offline.
const local = JSON.parse(JSON.stringify(cards).replaceAll('https://kraroktunngern.vercel.app/', '/'));
const out = path.join(ROOT, 'artifacts/line-tutorial/cards.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(local, null, 1));
console.log('wrote', path.relative(ROOT, out));
process.exit(0);
