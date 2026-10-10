import { expect, test } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};

const job = {
  id: 'wht-job',
  name: 'TikTok Campaign',
  value: 10_000,
  whtRate: 3,
  whtAmount: 300,
  received: 9_700,
  pending: 0,
  client: 'Brand A',
  type: 'Sponsored Post',
  status: 'done',
  paymentStatus: 'paid',
  creditTerm: 0,
  note: '',
  postDate: '2026-09-01',
  payDate: '2026-10-01',
  isPosted: true,
};

const snapshot = {
  jobs: [job],
  expenses: [],
  goals: [],
  invoices: [],
  settings: {
    monthlyExpense: 0,
    monthlyRevenueGoal: 20_000,
    savingsPercentage: 40,
    profileSetupCompleted: true,
    userPersona: 'freelance',
  },
  statuses: [
    { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
    { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
    { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
  ],
  job_types: ['Sponsored Post'],
  notif_settings: {
    enabled: true,
    alertEmail: user.email,
    serviceType: 'mailto',
    emailjsServiceId: '',
    emailjsTemplateId: '',
    emailjsPublicKey: '',
    pendingQueue: [],
    lineUserId: null,
  },
  avatar_data_url: null,
  issuer_profile: null,
};

const versions = {
  cashflow_jobs: { [job.id]: 1 },
  cashflow_expenses: {},
  cashflow_goals: {},
  cashflow_invoices: {},
  cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 },
};

test('the document vault opens the existing 50 ทวิ management page without changing stored files', async ({ page }) => {
  const files = [{
    id: 'f0000000-0000-4000-8000-000000000001',
    kind: 'wht50',
    jobId: job.id,
    jobName: job.name,
    client: job.client,
    fileName: '50Tawi_BrandA.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4_000,
    createdAt: '2026-10-01T00:00:00Z',
  }];

  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: {
    userId: user.id,
    publicId: 'SQ-1111111111',
    displayName: 'Test user',
  } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: {
    systemRole: 'user', groups: [], invitations: [], total: 0, page: 0,
  } }));
  await page.route('**/api/data*', route => route.fulfill({ json: {
    snapshot,
    versions,
    subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' },
  } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files } }));

  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.getByText('50Tawi_BrandA.pdf')).toBeVisible();

  await page.getByRole('button', { name: 'จัดการใบ 50 ทวิ' }).click();

  await expect(page).toHaveURL(/\/wht50\//);
  await expect(page.getByRole('heading', { name: 'ใบ 50 ทวิ', level: 1 })).toBeVisible();
  await expect(page.getByText('เอกสารพร้อม 1 จาก 1 รายการ')).toBeVisible();
  await expect(page.locator('aside').getByRole('button', { name: 'ใบ 50 ทวิ' })).toHaveAttribute('aria-current', 'page');

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.getByText('50Tawi_BrandA.pdf')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('button', { name: 'จัดการใบ 50 ทวิ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
