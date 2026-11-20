import { test, expect, type Page } from '@playwright/test';

// Overdue jobs on opening the app. The fullscreen Credit Radar (2026-10-30) was taken out on 2026-11-20 (owner: "เอาหน้านี้
// ออกมันดูติดเล่นไป"): computers and iPads now get the same plain alert as phones, leading to เงินรอรับ.

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };
const statuses = [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }];

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const owed = (id: string, name: string, client: string, pending: number, late: number) => ({
  id, name, client, value: pending, received: 0, pending, type: 'Sponsored Post', status: 'pending', paymentStatus: 'unpaid', creditTerm: 30, note: '',
  isPosted: true, postDate: daysAgo(late + 30), payDate: daysAgo(late), dueDate: daysAgo(late),
});
const paid = (id: string, name: string, client: string, amount: number, daysBack: number) => ({
  id, name, client, value: amount, received: amount, pending: 0, type: 'Sponsored Post', status: 'done', paymentStatus: 'paid', creditTerm: 30, note: '',
  isPosted: true, postDate: daysAgo(daysBack + 25), payDate: daysAgo(daysBack),
});
const sixLate = [
  owed('j1', 'รีวิวสกินแคร์ 3 คลิป', 'บริษัท ผิวใส จำกัด', 45000, 52),
  owed('j2', 'ไลฟ์ขายของ 2 ชั่วโมง', 'ร้านเสื้อผ้า Mint', 18500, 21),
  owed('j3', 'ถ่ายภาพสินค้า', 'Brew Days', 9200, 12),
  owed('j4', 'โพสต์ IG 1 โพสต์', 'Glow Lab', 6000, 5),
  owed('j5', 'คลิป TikTok', 'IzaBelle', 12500, 1),
  owed('j6', 'ออกแบบโลโก้', 'สตูดิโอเล็ก', 3500, 3),
];
const mixed = [
  owed('m1', 'รีวิวสกินแคร์ 3 คลิป', 'บริษัท ผิวใส จำกัด', 45000, 52),
  owed('m2', 'คลิป TikTok', 'IzaBelle', 12500, 2),
  owed('m3', 'ออกแบบเมนู', 'ร้านกาแฟ Good Day', 18500, -3),
  paid('m4', 'งานถ่ายภาพสินค้า', 'คุณเบย์', 8600, 2),
  owed('m5', 'โฆษณา IG & Reels', 'Give Lab', 6000, -20),
];

async function open(page: Page, list: unknown[], mode: 'light' | 'dark' = 'light', path = '/') {
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  const snapshot = {
    jobs: list, expenses: [], goals: [], invoices: [], statuses, job_types: ['Sponsored Post'],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode, darkFrom: '18:00', lightFrom: '06:00', asked: true } },
    notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
    avatar_data_url: null, issuer_profile: null,
  };
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.goto(path);
}

for (const [name, size] of [['computer', { width: 1440, height: 900 }], ['iPad', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`${name}: a visit with overdue jobs shows the plain alert, never the fullscreen radar`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, sixLate);
    await expect(page.getByText('ตรวจพบดีลค้างชำระเลยกำหนด!')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('credit-radar')).toHaveCount(0);
  });
}

test('computers: the receivables page has no radar button, and ?radar=1 opens nothing over the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, mixed, 'light', '/?radar=1');
  await expect(page.getByText('ตรวจพบดีลค้างชำระเลยกำหนด!')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('credit-radar')).toHaveCount(0);
  await page.goto('/receivables');
  await expect(page.getByRole('heading', { name: 'เงินค้างรับ', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByTestId('open-credit-radar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'เรดาร์เครดิตเทอม' })).toHaveCount(0);
});
