import type { Job } from './types';
import { getJobPaymentEntries, getMonthKeyFromDate } from './installmentPayments';
import { jobNetReceivable, jobWhtAmount, roundMoney } from './wht';

// Money actually received, one row per payment (a full payment, a deposit, or an installment),
// on the date it arrived -- the same entries the dashboard counts. Withholding tax is split across
// a job's payments in proportion to the money each one brought in.

export interface IncomeRow {
  date: string; // YYYY-MM-DD the money arrived
  jobName: string;
  client: string;
  type: string;
  label: string; // รับเงิน / รับมัดจำ / งวดที่ 2 …
  gross: number; // before withholding tax
  whtRate: number;
  wht: number;
  received: number; // what actually arrived
}

export function isValidDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function actualReceiptDate(job: Job, entry: ReturnType<typeof getJobPaymentEntries>[number]): string | null {
  if (entry.kind === 'installment') {
    return job.installments?.find(row => row.id === entry.id)?.paidAt?.slice(0, 10) || null;
  }
  if (entry.label === 'รับมัดจำ') return job.depositDate?.slice(0, 10) || null;
  // A legacy partial-payment row without depositDate only tells us how much arrived, not when.
  // `payDate` belongs to the outstanding balance in that shape, so assigning the earlier receipt
  // to it can move cash into the wrong tax year. Only a settled single payment may use payDate.
  if (job.pending > 0) return null;
  // For paid single jobs `payDate` is the recorded paid date. `dueDate` is its legacy alias.
  // Posting/start dates are workflow dates, never evidence that cash arrived.
  return (job.payDate || job.dueDate)?.slice(0, 10) || null;
}

export function incomeRows(jobs: Job[], inPeriod: (monthKey: string) => boolean): IncomeRow[] {
  const rows: IncomeRow[] = [];
  for (const job of jobs) {
    const net = jobNetReceivable(job);
    const wht = jobWhtAmount(job);
    const entries = getJobPaymentEntries(job);
    // A fully withheld settled job brings in no bank cash, but the tax paid on the recipient's
    // behalf is still a received gross amount and a matching WHT credit. Require the explicit
    // paid flag so a future due date on a zero-net job cannot create income by itself.
    if (!entries.length && job.value > 0 && net === 0 && wht > 0 && job.pending <= 0 && job.paymentStatus === 'paid' && job.payDate) {
      entries.push({
        id: `${job.id}-fully-withheld`, jobId: job.id, jobName: job.name, client: job.client || '',
        label: 'หัก ณ ที่จ่ายเต็มจำนวน', amount: 0, date: job.payDate, kind: 'single',
      });
    }
    const receivedTotal = roundMoney(entries.reduce((sum, entry) => sum + entry.amount, 0));
    const settled = net === 0 ? entries.length > 0 : Math.abs(receivedTotal - net) <= 0.01;
    let allocatedWht = 0;
    for (const [index, entry] of entries.entries()) {
      const share = net > 0 ? entry.amount / net : 0;
      const whtPart = settled && index === entries.length - 1
        ? roundMoney(Math.max(0, wht - allocatedWht))
        : roundMoney(wht * share);
      allocatedWht = roundMoney(allocatedWht + whtPart);
      const date = actualReceiptDate(job, entry);
      if (!isValidDateKey(date) || !inPeriod(getMonthKeyFromDate(date))) continue;
      rows.push({
        date, jobName: job.name, client: job.client || '', type: job.type || '', label: entry.label,
        gross: roundMoney(entry.amount + whtPart), whtRate: job.whtRate || 0, wht: whtPart, received: roundMoney(entry.amount),
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.jobName.localeCompare(b.jobName, 'th'));
}

export const incomeRowsForMonth = (jobs: Job[], monthKey: string) => incomeRows(jobs, key => key === monthKey);
export const incomeRowsForYear = (jobs: Job[], year: number) => incomeRows(jobs, key => key.startsWith(`${year}-`));

export function sumIncome(rows: IncomeRow[]) {
  return rows.reduce((t, r) => ({ gross: roundMoney(t.gross + r.gross), wht: roundMoney(t.wht + r.wht), received: roundMoney(t.received + r.received) }), { gross: 0, wht: 0, received: 0 });
}
