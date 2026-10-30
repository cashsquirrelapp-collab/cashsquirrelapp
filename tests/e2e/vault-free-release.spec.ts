import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Owner, 2026-10-31: "ฝากเอา 2 ฟีเจอร์นี้เข้ามาด้วย ... user ที่ใช้ฟรีจำกัดได้แค่ 5 เอกสาร ... Pro ใช้ได้ไม่จำกัด".
// เอกสาร › คลังเอกสาร and ติดตามใบ 50 ทวิ are open to every account. A free account keeps 5 files; Pro has no limit.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const year = new Date().getUTCFullYear();
const job = {
  id: 'wht-job-1', name: 'แคมเปญรีวิว', value: 10_000, whtRate: 3, whtAmount: 300, received: 9_700, pending: 0, client: 'Brand A',
  type: 'Sponsored Post', status: 'done', paymentStatus: 'paid', creditTerm: 0, note: '', postDate: `${year}-01-05`, payDate: `${year}-01-05`, isPosted: true,
};
const snapshot = {
  jobs: [job], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post'],
  notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
  avatar_data_url: null, issuer_profile: null,
};
const versions = { cashflow_jobs: { [job.id]: 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };
const file = (n: number) => ({ id: `f0000000-0000-4000-8000-00000000000${n}`, kind: 'contract', jobId: null, jobName: null, client: null,
  fileName: `PO_${n}.pdf`, mimeType: 'application/pdf', sizeBytes: 4_000, createdAt: `${year}-10-0${n}T00:00:00Z` });
const pdf = { name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 test') };

async function open(page: Page, { pro = false, count = 4, width = 1280, height = 820 } = {}) {
  const files = Array.from({ length: count }, (_, at) => file(at + 1));
  const uploads: string[] = [];
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  // An ordinary account, not an admin.
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions,
    subscription: pro ? { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } : null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files } }));
  await page.route('**/api/vault-upload', async route => {
    uploads.push(route.request().headers()['x-vault-meta'] || '');
    const stored = { ...file(9), id: `f0000000-0000-4000-8000-0000000001${uploads.length}`, fileName: 'contract.pdf', createdAt: new Date().toISOString() };
    files.unshift(stored);
    await route.fulfill({ status: 201, json: { file: stored } });
  });
  await page.setViewportSize({ width, height });
  await page.goto('/vault');
  return { uploads };
}

test('free account: both pages are in the menu, the vault shows 5 files, and the 6th file waits with an upgrade', async ({ page }) => {
  const { uploads } = await open(page);
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.locator('aside').getByRole('button', { name: 'คลังเอกสาร' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('aside').getByRole('button', { name: /ใบ 50 ทวิ/ })).toBeVisible();
  await expect(page.getByTestId('vault-free-usage')).toHaveText('บัญชีฟรีเก็บได้ 5 ไฟล์ · ใช้ไป 4 ไฟล์ · Pro เก็บได้ไม่จำกัด');
  expect(await textOverlapIssues(page)).toEqual([]);

  // One place left: the second picked file waits with a note and is not sent.
  await page.getByRole('button', { name: 'เพิ่มเอกสาร' }).click();
  await expect(page.getByTestId('vault-free-left')).toHaveText('บัญชีฟรีเพิ่มได้อีก 1 จาก 5 ไฟล์ · Pro เก็บได้ไม่จำกัด');
  await page.getByTestId('vault-file-input').setInputFiles([pdf, { ...pdf, name: 'second.pdf' }]);
  await expect(page.getByText('เกิน 5 ไฟล์ของบัญชีฟรี')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByText('แนบเอกสารเรียบร้อยแล้ว')).toBeVisible();
  expect(uploads).toHaveLength(1);
  await page.getByRole('button', { name: 'เสร็จสิ้น' }).click();
  await expect(page.getByTestId('vault-free-usage')).toHaveText('บัญชีฟรีเก็บได้ 5 ไฟล์ · ใช้ไป 5 ไฟล์ · Pro เก็บได้ไม่จำกัด');

  // Full: the dialog says so and offers Pro; nothing more is sent.
  await page.getByRole('button', { name: 'เพิ่มเอกสาร' }).click();
  const full = page.getByTestId('vault-free-full');
  await expect(full).toContainText('คลังเอกสารครบ 5 ไฟล์แล้ว');
  await expect(full).toContainText('บัญชีฟรีเก็บไฟล์ได้ 5 ไฟล์ ลบไฟล์ที่ไม่ใช้แล้วเพื่อเพิ่มไฟล์ใหม่ หรืออัปเกรดเป็น Pro เพื่อเก็บได้ไม่จำกัด');
  expect(await textOverlapIssues(page)).toEqual([]);
  await full.getByRole('button', { name: 'อัปเกรดเป็น Pro' }).click();
  await expect(page).toHaveURL(/\/plans/);
  expect(uploads).toHaveLength(1);
});

test('free account: the 50 ทวิ page opens with its summary', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'จัดการใบ 50 ทวิ' }).click();
  await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 1 })).toBeVisible();
  await expect(page.getByLabel('สรุปการติดตามใบ 50 ทวิ')).toContainText('1 งานที่ต้องมีใบ 50 ทวิ');
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('Pro account: no file limit is shown', async ({ page }) => {
  await open(page, { pro: true, count: 5 });
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.getByTestId('vault-free-usage')).toHaveCount(0);
  await page.getByRole('button', { name: 'เพิ่มเอกสาร' }).click();
  await expect(page.getByTestId('vault-drop-zone')).toBeVisible();
  await expect(page.getByTestId('vault-free-left')).toHaveCount(0);
  await expect(page.getByTestId('vault-free-full')).toHaveCount(0);
});

test('phone, free account: the vault page shows the 5-file note without overlapping text', async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  await expect(page.getByTestId('vault-free-usage')).toBeVisible();
  const box = (await page.getByTestId('vault-free-usage').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await textOverlapIssues(page)).toEqual([]);
});
