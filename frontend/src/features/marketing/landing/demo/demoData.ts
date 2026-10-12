// Sample data for the public product demo. Everything here is made up (no real account, client or
// amount) and fixed: no dates from the clock, no randomness, so every replay and every recording
// take shows exactly the same thing. All totals on screen are computed from these rows -- the
// dashboard, the jobs list and the callout can never disagree.

export interface DemoInstallment { id: string; label: string; amount: number; due: string; paid: boolean }

export interface DemoJob {
  id: string;
  name: string;
  type: string;
  client: string;
  value: number;
  /** กำหนด column, as the app words it. */
  due: string;
  dueShort: string; // for "เงินที่ต้องติดตาม": "อีก 3 วัน"
  stage: 'เสร็จแล้ว' | 'ปิดงานแล้ว';
  payment: 'แบ่งงวด' | 'รับครบแล้ว' | 'ยังไม่จ่าย';
  received: number;
  installments?: DemoInstallment[];
}

export interface DemoExpense { id: string; name: string; amount: number; day: number }
export interface DemoPayment { day: number; amount: number }

export const DEMO_MONTH = 'ต.ค. 2569';
export const DEMO_MONTH_LONG = 'ตุลาคม 2569';
/** The job the story follows. */
export const FOCUS_JOB_ID = 'video';
/** The installment recorded in scene 3. */
export const NEXT_INSTALLMENT_ID = 'inst-2';

const VIDEO_INSTALLMENTS: DemoInstallment[] = [
  { id: 'inst-1', label: 'งวดที่ 1', amount: 2000, due: '5 ต.ค. 2569', paid: true },
  { id: 'inst-2', label: 'งวดที่ 2', amount: 1000, due: '12 ต.ค. 2569', paid: false },
  { id: 'inst-3', label: 'งวดที่ 3', amount: 3000, due: '30 ต.ค. 2569', paid: false },
];

const BASE_JOBS: DemoJob[] = [
  { id: 'video', name: 'งานตัดต่อวิดีโอ', type: 'Video Production', client: 'Brand A', value: 6000, due: 'อีก 3 วัน', dueShort: 'อีก 3 วัน', stage: 'เสร็จแล้ว', payment: 'แบ่งงวด', received: 2000, installments: VIDEO_INSTALLMENTS },
  { id: 'logo', name: 'ออกแบบโลโก้', type: 'Design', client: 'Cafe B', value: 3000, due: 'อีก 11 วัน', dueShort: 'อีก 11 วัน', stage: 'เสร็จแล้ว', payment: 'ยังไม่จ่าย', received: 0 },
  { id: 'photo', name: 'ถ่ายภาพสินค้า', type: 'Photography', client: 'Studio C', value: 4500, due: '2 ต.ค. 2569', dueShort: '', stage: 'ปิดงานแล้ว', payment: 'รับครบแล้ว', received: 4500 },
];

const EXPENSES: DemoExpense[] = [
  { id: 'e1', name: 'ค่าโปรแกรมตัดต่อ', amount: 800, day: 3 },
  { id: 'e2', name: 'ค่าเดินทาง', amount: 400, day: 6 },
];

/** Days in the month money arrived, before the demo records anything. */
const BASE_PAYMENTS: DemoPayment[] = [{ day: 2, amount: 4500 }, { day: 5, amount: 2000 }];
const DEMO_TODAY = 9;

export interface DemoState {
  jobs: DemoJob[];
  expenses: DemoExpense[];
  payments: DemoPayment[];
  today: number;
  /** มูลค่างานเดือนนี้: the work itself. Recording a payment never changes it. */
  workValue: number;
  /** รับเงินจริงเดือนนี้ */
  received: number;
  /** รอรับเงิน */
  pending: number;
  /** รายจ่ายเดือนนี้ */
  spent: number;
  focus: DemoJob & { remaining: number };
  /** Jobs that still have money to collect, most urgent first. */
  followUps: { id: string; name: string; client: string; dueShort: string; amount: number }[];
  counts: { all: number; waiting: number; closed: number };
}

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

/** The whole demo state. `paid` = the next installment of the focus job has been recorded. */
export function demoState(paid: boolean): DemoState {
  const jobs = BASE_JOBS.map(job => {
    if (job.id !== FOCUS_JOB_ID || !paid) return job;
    const installments = job.installments!.map(row => (row.id === NEXT_INSTALLMENT_ID ? { ...row, paid: true } : row));
    const next = installments.find(row => !row.paid);
    return { ...job, installments, received: sum(installments.filter(r => r.paid).map(r => r.amount)), due: next ? next.due : job.due, dueShort: next ? 'อีก 21 วัน' : '' };
  });
  const payments = paid ? [...BASE_PAYMENTS, { day: DEMO_TODAY, amount: VIDEO_INSTALLMENTS[1].amount }] : BASE_PAYMENTS;
  const focusJob = jobs.find(j => j.id === FOCUS_JOB_ID)!;
  const open = jobs.filter(j => j.value - j.received > 0);
  return {
    jobs, expenses: EXPENSES, payments, today: DEMO_TODAY,
    workValue: sum(jobs.map(j => j.value)),
    received: sum(jobs.map(j => j.received)),
    pending: sum(jobs.map(j => j.value - j.received)),
    spent: sum(EXPENSES.map(e => e.amount)),
    focus: { ...focusJob, remaining: focusJob.value - focusJob.received },
    followUps: open.map(j => ({ id: j.id, name: j.name, client: j.client, dueShort: j.dueShort, amount: j.value - j.received })),
    counts: { all: jobs.length, waiting: open.length, closed: jobs.length - open.length },
  };
}

export const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;
