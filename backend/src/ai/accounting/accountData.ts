import { getJobPendingEntries } from '../../../../shared/installmentPayments.js';
import { todayInBangkok } from '../../../../shared/dueJobs.js';
import { jobNetReceivable, jobWhtAmount, whtAmountFor } from '../../../../shared/wht.js';
import type { Expense, Job } from '../../../../shared/types.js';
import type { UserRow } from '../../services/lineAssistant.js';

// Reads of the signed-in account's own snapshot for the accounting tools (brief section 5 and module 11): a check for
// records that look wrong, and a cash forecast with stated assumptions. Read only, names never IDs, and a finding is
// "worth checking", never a verdict that the user made a mistake.

const TOLERANCE = 1; // baht: rounding differences under this are not findings
const MAX_FINDINGS = 15;

const satang = (baht: number) => Math.round((Number.isFinite(baht) ? baht : 0) * 100);
const baht = (value: number) => Math.round(value) / 100;
const clean = (text: unknown) => (typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').toLowerCase() : '');
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));

export interface Finding { kind: string; severity: 'check' | 'info'; record: string; detail: string; suggestion: string }

export function accountingCheck(user: UserRow, scope: 'all' | 'jobs' | 'expenses' = 'all', now = new Date()): Record<string, unknown> {
  const jobs = (user.jobs || []) as unknown as Job[];
  const expenses = (user.expenses || []) as unknown as Expense[];
  const today = todayInBangkok(now);
  const findings: Finding[] = [];
  const push = (finding: Finding) => findings.push(finding);

  if (scope !== 'expenses') {
    // The same client, value and name within three days looks like one job entered twice.
    const seen = new Map<string, Job>();
    for (const job of jobs) {
      const key = `${clean(job.name)}|${clean(job.client)}|${satang(job.value || 0)}`;
      const first = seen.get(key);
      const date = job.startDate || job.payDate || job.postDate || '';
      const firstDate = first ? first.startDate || first.payDate || first.postDate || '' : '';
      if (first && (!isDate(date) || !isDate(firstDate) || Math.abs(days(firstDate, date)) <= 3)) {
        push({ kind: 'possible_duplicate_job', severity: 'check', record: `งาน "${job.name}" (${job.client || 'ไม่ระบุลูกค้า'})`,
          detail: `มีงานชื่อ ลูกค้า และมูลค่า ${(job.value || 0).toLocaleString('en-US')} บาท เหมือนกันมากกว่าหนึ่งรายการ`, suggestion: 'ตรวจว่าเป็นงานเดียวกันที่บันทึกซ้ำหรือไม่' });
      } else if (!first) seen.set(key, job);
    }
    for (const job of jobs) {
      const name = `งาน "${job.name}"`;
      const net = satang(jobNetReceivable(job));
      const received = satang(job.received || 0);
      const pending = satang(job.pending || 0);
      if (received > net + TOLERANCE * 100) push({ kind: 'received_over_value', severity: 'check', record: name,
        detail: `บันทึกรับเงินแล้ว ${baht(received).toLocaleString('en-US')} บาท มากกว่ายอดที่ควรได้หลังหัก ณ ที่จ่าย ${baht(net).toLocaleString('en-US')} บาท`, suggestion: 'ตรวจยอดรับเงินหรือมูลค่างาน' });
      else if (received + pending > net + TOLERANCE * 100) push({ kind: 'received_plus_pending_over_value', severity: 'check', record: name,
        detail: `รับแล้วรวมค้างรับเป็น ${baht(received + pending).toLocaleString('en-US')} บาท มากกว่ายอดที่ควรได้ ${baht(net).toLocaleString('en-US')} บาท`, suggestion: 'ตรวจว่ามีการนับมัดจำหรืองวดซ้ำหรือไม่' });
      if (job.whtRate && job.whtAmount !== undefined && Math.abs(satang(job.whtAmount) - satang(whtAmountFor(job.value || 0, job.whtRate))) > TOLERANCE * 100) {
        push({ kind: 'wht_mismatch', severity: 'check', record: name,
          detail: `ยอดหัก ณ ที่จ่ายที่บันทึก ${job.whtAmount.toLocaleString('en-US')} บาท ไม่ตรงกับ ${job.whtRate}% ของ ${(job.value || 0).toLocaleString('en-US')} บาท (${whtAmountFor(job.value || 0, job.whtRate).toLocaleString('en-US')} บาท)`,
          suggestion: 'ตรวจกับ 50 ทวิหรือยอดที่ลูกค้าโอนจริง' });
      }
      if (job.installments?.length) {
        const total = job.installments.reduce((sum, row) => sum + satang(row.amount || 0), 0);
        if (Math.abs(total - net) > TOLERANCE * 100 && Math.abs(total - satang(job.value || 0)) > TOLERANCE * 100) {
          push({ kind: 'installments_mismatch', severity: 'check', record: name,
            detail: `งวดทั้งหมดรวม ${baht(total).toLocaleString('en-US')} บาท ไม่เท่ามูลค่างาน ${(job.value || 0).toLocaleString('en-US')} บาท หรือยอดหลังหัก ณ ที่จ่าย ${baht(net).toLocaleString('en-US')} บาท`,
            suggestion: 'ตรวจจำนวนเงินแต่ละงวด' });
        }
      }
      if ((job.depositAmount || 0) > (job.value || 0) + TOLERANCE) push({ kind: 'deposit_over_value', severity: 'check', record: name,
        detail: `มัดจำ ${(job.depositAmount || 0).toLocaleString('en-US')} บาท มากกว่ามูลค่างาน`, suggestion: 'ตรวจยอดมัดจำ' });
      const due = job.payDate || job.dueDate;
      if (isDate(due) && isDate(job.startDate) && days(job.startDate, due) < 0) push({ kind: 'due_before_start', severity: 'check', record: name,
        detail: `วันครบกำหนดชำระ (${due}) อยู่ก่อนวันเริ่มงาน (${job.startDate})`, suggestion: 'ตรวจวันที่ทั้งสอง' });
      if (!clean(job.client)) push({ kind: 'missing_client', severity: 'info', record: name, detail: 'ยังไม่ได้ระบุชื่อลูกค้า', suggestion: 'ใส่ชื่อลูกค้าเพื่อให้ติดตามเงินและออกเอกสารได้' });
      if (job.whtRate && job.whtRate > 0 && jobWhtAmount(job) === 0) push({ kind: 'wht_zero', severity: 'check', record: name,
        detail: `ตั้งอัตราหัก ${job.whtRate}% แต่ยอดหักเป็น 0`, suggestion: 'ตรวจยอดหัก ณ ที่จ่าย' });
    }
  }
  if (scope !== 'jobs') {
    const seen = new Set<string>();
    for (const expense of expenses) {
      const key = `${clean(expense.name)}|${satang(expense.amount || 0)}|${expense.date}`;
      if (seen.has(key)) push({ kind: 'possible_duplicate_expense', severity: 'check', record: `รายจ่าย "${expense.name}" วันที่ ${expense.date}`,
        detail: `มีรายจ่ายชื่อ จำนวน ${(expense.amount || 0).toLocaleString('en-US')} บาท และวันที่เดียวกันมากกว่าหนึ่งรายการ`, suggestion: 'ตรวจว่าบันทึกซ้ำหรือไม่' });
      seen.add(key);
      if (!(expense.amount > 0)) push({ kind: 'expense_not_positive', severity: 'check', record: `รายจ่าย "${expense.name}"`, detail: 'จำนวนเงินเป็น 0 หรือติดลบ', suggestion: 'ตรวจจำนวนเงิน' });
      if (isDate(expense.date) && days(today, expense.date) > 0) push({ kind: 'expense_in_future', severity: 'info', record: `รายจ่าย "${expense.name}"`,
        detail: `วันที่ ${expense.date} ยังไม่ถึง จึงยังไม่นับในยอดใช้จ่ายจริง`, suggestion: 'ถ้าเป็นการจ่ายจริงแล้ว ให้แก้วันที่' });
    }
  }
  return {
    ok: true, scope, checked: { jobs: scope === 'expenses' ? 0 : jobs.length, expenses: scope === 'jobs' ? 0 : expenses.length },
    findings_total: findings.length, findings: findings.slice(0, MAX_FINDINGS),
    ...(findings.length > MAX_FINDINGS ? { more: findings.length - MAX_FINDINGS } : {}),
    note: 'ผลเป็นรายการที่ "ควรตรวจ" จากกฎที่ทดสอบได้ ไม่ใช่ข้อสรุปว่าผิด การแก้ข้อมูลต้องผ่านการ์ดยืนยันตามปกติ',
  };
}

export function cashForecast(user: UserRow, windowDays: 30 | 60 | 90 = 30, includeBudget = true, now = new Date()): Record<string, unknown> {
  const jobs = (user.jobs || []) as unknown as Job[];
  const today = todayInBangkok(now);
  let expected = 0; let overdue = 0; let undated = 0;
  const expectedRows: { job: string; client: string; amount: number; due: string }[] = [];
  const overdueRows: { job: string; client: string; amount: number; due: string; days_overdue: number }[] = [];
  const undatedRows: { job: string; client: string; amount: number }[] = [];
  for (const job of jobs) {
    for (const entry of getJobPendingEntries(job)) {
      const amount = satang(entry.amount);
      if (amount <= 0) continue;
      if (!isDate(entry.dueDate)) { undated += amount; undatedRows.push({ job: job.name, client: job.client || '', amount: baht(amount) }); continue; }
      const away = days(today, entry.dueDate);
      if (away < 0) { overdue += amount; overdueRows.push({ job: job.name, client: job.client || '', amount: baht(amount), due: entry.dueDate, days_overdue: -away }); }
      else if (away <= windowDays) { expected += amount; expectedRows.push({ job: job.name, client: job.client || '', amount: baht(amount), due: entry.dueDate }); }
    }
  }
  const monthly = satang(Number((user.settings as { monthlyExpense?: number } | undefined)?.monthlyExpense) || 0);
  const budget = includeBudget ? Math.round(monthly * windowDays / 30) : 0;
  const best = expected + overdue - budget;
  const base = expected - budget;
  const worst = Math.round(expected / 2) - budget;
  expectedRows.sort((a, b) => a.due.localeCompare(b.due));
  overdueRows.sort((a, b) => b.days_overdue - a.days_overdue);
  return {
    ok: true, from: today, days: windowDays,
    expected_in_window: baht(expected), overdue_now: baht(overdue), no_due_date: baht(undated),
    budgeted_spending: baht(budget),
    scenarios: {
      best: { net: baht(best), assumption: 'ได้เงินที่ครบกำหนดในช่วงนี้ครบ และเก็บเงินที่เลยกำหนดได้ทั้งหมด' },
      base: { net: baht(base), assumption: 'ได้เงินที่ครบกำหนดในช่วงนี้ตรงเวลา ยังเก็บเงินที่เลยกำหนดไม่ได้' },
      worst: { net: baht(worst), assumption: 'ได้เพียงครึ่งหนึ่งของเงินที่ครบกำหนดในช่วงนี้ และเก็บเงินที่เลยกำหนดไม่ได้' },
    },
    due_soon: expectedRows.slice(0, 10), overdue: overdueRows.slice(0, 10), no_due_date_jobs: undatedRows.slice(0, 10),
    notes: [
      'เงินที่คาดว่าจะได้ยังไม่ใช่เงินที่ได้รับแล้ว',
      includeBudget ? (monthly ? 'หักรายจ่ายประจำตามงบที่ตั้งไว้ในแอปตามสัดส่วนของช่วงเวลา' : 'ยังไม่ได้ตั้งงบรายจ่ายประจำในแอป จึงไม่ได้หักรายจ่าย') : 'ไม่ได้หักรายจ่าย',
      'ยังไม่รวมเงินที่มีอยู่ตอนนี้ ดูได้จาก cash_position',
      ...(undated ? ['งานที่ยังไม่ได้กำหนดวันรับเงินไม่ได้นับในช่วงนี้ ควรบอกผู้ใช้ว่ามีอยู่และชวนกำหนดวันรับเงิน'] : []),
    ],
  };
}
