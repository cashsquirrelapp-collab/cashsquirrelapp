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

export function incomeRows(jobs: Job[], inPeriod: (monthKey: string) => boolean): IncomeRow[] {
  const rows: IncomeRow[] = [];
  for (const job of jobs) {
    const net = jobNetReceivable(job);
    const wht = jobWhtAmount(job);
    for (const entry of getJobPaymentEntries(job)) {
      const date = (entry.date || '').slice(0, 10);
      if (!date || !inPeriod(getMonthKeyFromDate(date))) continue;
      const share = net > 0 ? entry.amount / net : 0;
      const whtPart = roundMoney(wht * share);
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
