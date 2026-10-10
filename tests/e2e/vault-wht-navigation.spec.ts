import { expect, test, type Page, type Route } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};

const currentYear = new Date().getFullYear();
const paidJob = (index: number) => ({
  id: `wht-job-${index}`,
  name: index <= 2 ? `Received Campaign ${index}` : `Waiting Campaign ${index}`,
  value: 10_000 + index * 100,
  whtRate: 3,
  whtAmount: 300,
  received: 9_700,
  pending: 0,
  client: index % 2 ? 'Brand A' : 'Brand B',
  type: 'Sponsored Post',
  status: 'done',
  paymentStatus: 'paid',
  creditTerm: 0,
  note: '',
  postDate: `${currentYear}-09-${String(index).padStart(2, '0')}`,
  payDate: `${currentYear}-10-${String(index).padStart(2, '0')}`,
  isPosted: true,
});

const eligibleJobs = Array.from({ length: 8 }, (_, index) => paidJob(index + 1));
const excludedJobs = [
  { ...paidJob(9), id: 'no-wht', name: 'No WHT', whtRate: 0, whtAmount: 0 },
  { ...paidJob(10), id: 'not-paid', name: 'Not Paid Yet', received: 0, pending: 10_000, paymentStatus: 'unpaid' },
  { ...paidJob(11), id: 'previous-year', name: 'Previous Year', payDate: `${currentYear - 1}-12-01` },
];
const jobs = [...eligibleJobs, ...excludedJobs];

const snapshot = {
  jobs,
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
  cashflow_jobs: Object.fromEntries(jobs.map(job => [job.id, 1])),
  cashflow_expenses: {},
  cashflow_goals: {},
  cashflow_invoices: {},
  cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 },
};

const files = [
  { id: 'f0000000-0000-4000-8000-000000000001', kind: 'wht50', jobId: 'wht-job-1', jobName: 'Received Campaign 1', client: 'Brand A', fileName: '50Tawi_BrandA_part1.pdf', mimeType: 'application/pdf', sizeBytes: 4_000, createdAt: `${currentYear}-10-01T00:00:00Z` },
  { id: 'f0000000-0000-4000-8000-000000000002', kind: 'wht50', jobId: 'wht-job-1', jobName: 'Received Campaign 1', client: 'Brand A', fileName: '50Tawi_BrandA_part2.pdf', mimeType: 'application/pdf', sizeBytes: 5_000, createdAt: `${currentYear}-10-02T00:00:00Z` },
  { id: 'f0000000-0000-4000-8000-000000000003', kind: 'wht50', jobId: 'wht-job-2', jobName: 'Received Campaign 2', client: 'Brand B', fileName: '50Tawi_BrandB.pdf', mimeType: 'application/pdf', sizeBytes: 6_000, createdAt: `${currentYear}-10-03T00:00:00Z` },
  { id: 'f0000000-0000-4000-8000-000000000004', kind: 'contract', jobId: null, jobName: null, client: null, fileName: 'PO_General.pdf', mimeType: 'application/pdf', sizeBytes: 7_000, createdAt: `${currentYear}-10-04T00:00:00Z` },
];

async function setup(page: Page, vaultHandler: (route: Route) => Promise<void> | void = route => route.fulfill({ json: { files } })) {
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/vault', vaultHandler);
}

test('the vault consolidates uploaded files and complete 50 ทวิ tracking without conflating their counts', async ({ page }) => {
  const fetchedFiles: string[] = [];
  await setup(page);
  await page.route('**/api/vault-file*', route => {
    fetchedFiles.push(new URL(route.request().url()).searchParams.get('id') || '');
    return route.fulfill({ body: Buffer.from('%PDF-1.7 test'), contentType: 'application/pdf' });
  });

  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  const views = page.getByRole('tablist', { name: 'มุมมองคลังเอกสาร' });
  await expect(views.getByRole('tab', { name: 'ทุกไฟล์', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('PO_General.pdf')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'ประเภทไฟล์ที่จัดเก็บ' }).getByRole('tab', { name: /ไฟล์ 50 ทวิ/ })).toContainText('3 ไฟล์');
  await expect(page.getByRole('button', { name: 'จัดการใบ 50 ทวิ' })).toHaveCount(0);
  await expect(page.locator('aside').getByRole('button', { name: 'ใบ 50 ทวิ' })).toHaveCount(0);

  await views.getByRole('tab', { name: '50 ทวิ', exact: true }).click();
  await expect(page).toHaveURL(/\/wht50\/test-user$/);
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(views.getByRole('tab', { name: '50 ทวิ', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('ได้รับแล้ว 2 จาก 8 งานที่ต้องมีใบ 50 ทวิ')).toBeVisible();
  await expect(page.getByText('2 งาน', { exact: true })).toBeVisible();
  await expect(page.getByText('6 งาน', { exact: true })).toBeVisible();
  await expect(page.getByText('Not Paid Yet')).toHaveCount(0);
  await expect(page.getByText('No WHT')).toHaveCount(0);
  await expect(page.getByText('Previous Year')).toHaveCount(0);
  await expect(page.locator('aside').getByRole('button', { name: 'คลังเอกสาร' })).toHaveAttribute('aria-current', 'page');

  const statuses = page.getByRole('tablist', { name: 'สถานะใบ 50 ทวิ' });
  await statuses.getByRole('tab', { name: /^ได้รับแล้ว/ }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('table').getByText('ได้รับแล้ว · 2 ไฟล์')).toBeVisible();
  await statuses.getByRole('tab', { name: /^รอรับ/ }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(7);
  const waitingRow = page.getByRole('table').getByRole('row').filter({ hasText: 'Waiting Campaign 3' });
  await waitingRow.getByRole('button', { name: 'แนบเอกสาร' }).click();
  await expect(page.getByRole('dialog', { name: 'แนบใบ 50 ทวิ' })).toContainText('Waiting Campaign 3');
  await page.keyboard.press('Escape');

  await statuses.getByRole('tab', { name: /^ทั้งหมด/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /ดาวน์โหลดใบที่ได้รับแล้ว \(3 ไฟล์\)/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`ใบ50ทวิ-${currentYear + 543}.zip`);
  expect(fetchedFiles.filter(Boolean)).toHaveLength(3);

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(views.getByRole('tab', { name: '50 ทวิ', exact: true })).toBeVisible();
  await expect(page.locator('ul').filter({ hasText: 'Waiting Campaign 3' }).getByText('รอรับ', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await views.getByRole('tab', { name: 'ทุกไฟล์', exact: true }).click();
  await expect(page).toHaveURL(/\/vault\/test-user$/);
  await expect(page.getByText('PO_General.pdf')).toBeVisible();
  await page.goBack();
  await expect(views.getByRole('tab', { name: '50 ทวิ', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('legacy 50 ทวิ links open the consolidated vault tracking view', async ({ page }) => {
  await setup(page);
  for (const path of ['/wht50', '/wht50/test-user', '/tax?view=wht50', '/tax/test-user?view=wht50']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'มุมมองคลังเอกสาร' }).getByRole('tab', { name: '50 ทวิ', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('aside').getByRole('button', { name: 'คลังเอกสาร' })).toHaveAttribute('aria-current', 'page');
  }
});

test('50 ทวิ waits for the vault before deriving status and fails safely', async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await setup(page, async route => { await gate; await route.fulfill({ json: { files } }); });
  await page.goto('/wht50');
  await expect(page.getByLabel('กำลังโหลดสถานะใบ 50 ทวิ')).toBeVisible();
  await expect(page.getByText('6 งาน', { exact: true })).toHaveCount(0);
  release?.();
  await expect(page.getByText('ได้รับแล้ว 2 จาก 8 งานที่ต้องมีใบ 50 ทวิ')).toBeVisible();

  await page.unroute('**/api/vault');
  await page.route('**/api/vault', route => route.fulfill({ status: 500, json: { error: 'temporary vault failure' } }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('โหลดสถานะใบ 50 ทวิไม่สำเร็จ');
  await expect(page.getByText('รอรับใบ')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeVisible();
});
