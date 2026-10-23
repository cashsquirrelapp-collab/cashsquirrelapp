import { calculatePayDate } from '../../shared/calendar';
import type { Job } from '../../shared/types';

// Sample account used to photograph the real app for the landing page. Everything is made up:
// example clients, example.com emails, no phone, tax id or bank account. Pay dates of credit-term
// jobs come from the app's own calculatePayDate, so the screens show what the app would show.

/** The moment the screenshots are taken at (the app's "today"). */
export const CAPTURE_NOW = '2026-10-14T10:00:00+07:00';
export const TODAY = '2026-10-14';

export const sampleUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'studio@example.com',
  role: 'user',
  // Old account with no subscription = Free. The Pro shots swap in an active subscription.
  created_at: '2026-01-05T00:00:00Z',
  user_metadata: {},
};

const base = { note: '', excludeHolidays: false };

export const sampleJobs: Job[] = [
  {
    ...base, id: 'job-video', name: 'งานตัดต่อวิดีโอ', type: 'Video Production', client: 'Brand A', value: 6000,
    status: 'installment', creditTerm: 0, postDate: '2026-10-05', startDate: '2026-09-28', isPosted: true,
    installments: [
      { id: 'inst-1', label: 'งวดที่ 1 (มัดจำ)', amount: 2000, dueDate: '2026-10-05', paidAt: '2026-10-05', status: 'paid' },
      { id: 'inst-2', label: 'งวดที่ 2', amount: 1000, dueDate: '2026-10-16', paidAt: null, status: 'pending' },
      { id: 'inst-3', label: 'งวดที่ 3', amount: 3000, dueDate: '2026-10-30', paidAt: null, status: 'pending' },
    ],
    received: 2000, pending: 4000, payDate: '2026-10-16', paymentStatus: 'partial',
  },
  {
    ...base, id: 'job-review', name: 'รีวิวสินค้า', type: 'Sponsored Post', client: 'Brand B', value: 8000,
    status: 'pending', creditTerm: 30, postDate: '2026-10-01', startDate: '2026-09-24', isPosted: true,
    received: 0, pending: 8000, payDate: calculatePayDate('2026-10-01', 30, false), paymentStatus: 'unpaid',
  },
  {
    ...base, id: 'job-campaign', name: 'แคมเปญเปิดตัวสินค้า', type: 'Sponsored Post', client: 'Agency C', value: 15000,
    status: 'pending', creditTerm: 45, postDate: '2026-10-08', startDate: '2026-09-28', isPosted: true,
    received: 0, pending: 15000, payDate: calculatePayDate('2026-10-08', 45, false), paymentStatus: 'unpaid',
  },
  {
    ...base, id: 'job-logo', name: 'ออกแบบโลโก้', type: 'Design', client: 'Cafe D', value: 3000,
    status: 'pending', creditTerm: 0, postDate: '2026-10-10', startDate: '2026-10-03', isPosted: true,
    received: 0, pending: 3000, payDate: calculatePayDate('2026-10-10', 0, false), paymentStatus: 'unpaid',
  },
  {
    ...base, id: 'job-photo', name: 'ถ่ายภาพสินค้า', type: 'Photography', client: 'Studio E', value: 4500, whtRate: 3, whtAmount: 135,
    status: 'done', creditTerm: 0, postDate: '2026-10-02', startDate: '2026-09-29', isPosted: true,
    received: 4365, pending: 0, payDate: '2026-10-02', paymentStatus: 'paid',
  },
  {
    ...base, id: 'job-interview', name: 'ถ่ายวิดีโอสัมภาษณ์', type: 'Video Production', client: 'Brand B', value: 10000, whtRate: 3, whtAmount: 300,
    status: 'done', creditTerm: 0, postDate: '2026-09-18', startDate: '2026-09-12', isPosted: true,
    received: 9700, pending: 0, payDate: '2026-09-25', paymentStatus: 'paid',
  },
];

export const sampleExpenses = [
  { id: 'exp-1', name: 'ค่าโปรแกรมตัดต่อ', category: 'Equipment', amount: 800, date: '2026-10-03' },
  { id: 'exp-2', name: 'ค่าเดินทางไปถ่ายงาน', category: 'Travel', amount: 400, date: '2026-10-02' },
];

const issuer = { name: 'สตูดิโอตัวอย่าง', address: 'กรุงเทพมหานคร', phone: '', email: 'studio@example.com', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };

const brandA = { name: 'Brand A', address: 'กรุงเทพมหานคร', phone: '', email: 'hello@brand-a.example.com', taxId: '' };

// Three documents of the same job, งานตัดต่อวิดีโอ for Brand A (6,000 baht, paid in three instalments):
// the quotation is for the whole job, the invoice bills instalment 2, the receipt is for that same instalment.
export const sampleInvoices = [
  {
    id: 'doc-qt-1', documentType: 'quotation', documentNo: 'QT-2569-001', createdDate: '2026-09-25', dueDate: '2026-10-09', issuer, client: brandA,
    items: [
      { id: 'i1', description: 'งานตัดต่อวิดีโอ: ตัดต่อวิดีโอโปรโมต 1 คลิป (ความยาวไม่เกิน 3 นาที)', quantity: 1, price: 4500 },
      { id: 'i2', description: 'งานตัดต่อวิดีโอ: ทำซับไตเติลและปรับสี', quantity: 1, price: 1500 },
    ],
    vatRate: 0, whtRate: 0, note: 'มูลค่างานทั้งหมด 6,000 บาท แบ่งชำระ 3 งวด: มัดจำ 2,000 บาท / งวดที่ 2 1,000 บาท / งวดที่ 3 3,000 บาท',
  },
  {
    id: 'doc-inv-1', documentType: 'invoice', documentNo: 'INV-2569-002', createdDate: '2026-10-09', dueDate: '2026-10-16', issuer, client: brandA, refNo: 'QT-2569-001',
    items: [{ id: 'i1', description: 'งานตัดต่อวิดีโอ งวดที่ 2 (จากมูลค่างานทั้งหมด 6,000 บาท)', quantity: 1, price: 1000 }],
    vatRate: 0, whtRate: 0, note: 'เรียกเก็บงวดที่ 2 จาก 3 งวด ตามใบเสนอราคา QT-2569-001',
  },
  {
    id: 'doc-rc-1', documentType: 'receipt', documentNo: 'RC-2569-002', createdDate: '2026-10-14', dueDate: '2026-10-14', paidDate: '2026-10-14', issuer, client: brandA, refNo: 'INV-2569-002',
    items: [{ id: 'i1', description: 'งานตัดต่อวิดีโอ งวดที่ 2 (จากมูลค่างานทั้งหมด 6,000 บาท)', quantity: 1, price: 1000 }],
    vatRate: 0, whtRate: 0, note: 'รับเงินงวดที่ 2 ตามใบแจ้งหนี้ INV-2569-002',
  },
];

export const sampleVaultFiles = [
  { id: 'f0000000-0000-4000-8000-000000000001', kind: 'wht50', jobId: 'job-photo', jobName: 'ถ่ายภาพสินค้า', client: 'Studio E', fileName: '50ทวิ_StudioE_ตค69.pdf', mimeType: 'application/pdf', sizeBytes: 182000, createdAt: '2026-10-06T03:00:00Z' },
  { id: 'f0000000-0000-4000-8000-000000000002', kind: 'contract', jobId: 'job-campaign', jobName: 'แคมเปญเปิดตัวสินค้า', client: 'Agency C', fileName: 'PO_AgencyC_แคมเปญ.pdf', mimeType: 'application/pdf', sizeBytes: 420000, createdAt: '2026-09-18T03:00:00Z' },
  { id: 'f0000000-0000-4000-8000-000000000003', kind: 'expense', jobId: 'exp-1', jobName: 'ค่าโปรแกรมตัดต่อ', client: null, fileName: 'ใบเสร็จ_โปรแกรมตัดต่อ.pdf', mimeType: 'application/pdf', sizeBytes: 96000, createdAt: '2026-10-03T03:00:00Z' },
  { id: 'f0000000-0000-4000-8000-000000000004', kind: 'wht50', jobId: null, jobName: 'รีวิวสินค้า (ปีก่อน)', client: 'Brand B', fileName: '50ทวิ_BrandB_ธค68.pdf', mimeType: 'application/pdf', sizeBytes: 175000, createdAt: '2025-12-20T03:00:00Z' },
];

export const sampleSettings = { monthlyExpense: 0, monthlyRevenueGoal: 30000, savingsPercentage: 20, profileSetupCompleted: true, userPersona: 'freelance' };

export const snapshot = (jobs: Job[] = sampleJobs) => ({
  jobs, expenses: sampleExpenses, goals: [], invoices: sampleInvoices, settings: sampleSettings,
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post', 'Video Production', 'Design', 'Photography'],
  notif_settings: { enabled: true, alertEmail: sampleUser.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
  avatar_data_url: null, issuer_profile: issuer,
});

export const versions = (jobs: Job[] = sampleJobs) => ({
  cashflow_jobs: Object.fromEntries(jobs.map(j => [j.id, 1])),
  cashflow_expenses: Object.fromEntries(sampleExpenses.map(e => [e.id, 1])),
  cashflow_goals: {}, cashflow_invoices: Object.fromEntries(sampleInvoices.map(d => [d.id, 1])),
  cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1, issuer_profile: 1 },
});

export const SUBSCRIPTION = {
  free: { status: 'free', plan: null, current_period_end: null, cancel_at_period_end: false, stripe_status: null, has_subscription: false, intro_eligible: true, managed: false, intro_paid_cycles: 0, promptpay_checkout: null },
  // The shape /api/data returns on the billing branch: an active, card-paid monthly subscription.
  pro: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z', cancel_at_period_end: false, stripe_status: 'active', has_subscription: true, intro_eligible: false, managed: true, intro_paid_cycles: 1, promptpay_checkout: null },
} as const;
