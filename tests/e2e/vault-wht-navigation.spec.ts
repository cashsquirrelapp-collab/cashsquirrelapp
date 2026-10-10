import { expect, test, type Page, type Route } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'test@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};

const bangkokNow = new Date(Date.now() + (7 * 60 * 60 * 1_000));
const currentYear = bangkokNow.getUTCFullYear();
const todayInBangkok = `${currentYear}-${String(bangkokNow.getUTCMonth() + 1).padStart(2, '0')}-${String(bangkokNow.getUTCDate()).padStart(2, '0')}`;
const dateInCurrentYear = (day: number) => `${currentYear}-01-${String(day).padStart(2, '0')}`;
const calendarDaysSince = (iso: string) => {
  const today = Date.parse(`${todayInBangkok}T00:00:00Z`);
  const paid = Date.parse(`${iso}T00:00:00Z`);
  return Math.max(0, Math.floor((today - paid) / 86_400_000));
};
const jobValues = [0, 10_100, 10_200, 13_000, 14_000, 15_000, 16_000, 18_000, 17_000];
const whtAmounts = [0, 303, 306, 390, 420, 900, 480, 540, 510];
const paidJob = (index: number) => ({
  id: `wht-job-${index}`,
  name: index <= 2 ? `Received Campaign ${index}` : `Waiting Campaign ${index}`,
  value: jobValues[index] || 10_000 + index * 100,
  whtRate: 3,
  whtAmount: whtAmounts[index] || 300,
  received: 9_700,
  pending: 0,
  client: index % 2 ? 'Brand A' : 'Brand B',
  type: 'Sponsored Post',
  status: 'done',
  paymentStatus: 'paid',
  creditTerm: 0,
  note: '',
  // Deliberately differs from payDate: the waiting-age UI must use the actual payment date.
  postDate: `${currentYear}-12-${String(index).padStart(2, '0')}`,
  payDate: dateInCurrentYear(index),
  isPosted: true,
});

const eligibleJobs = Array.from({ length: 8 }, (_, index) => paidJob(index + 1));
const excludedJobs = [
  { ...paidJob(9), id: 'no-wht', name: 'No WHT', whtRate: 0, whtAmount: 0 },
  { ...paidJob(10), id: 'not-paid', name: 'Not Paid Yet', received: 0, pending: 10_000, paymentStatus: 'unpaid' },
  { ...paidJob(11), id: 'previous-year', name: 'Previous Year', payDate: `${currentYear - 1}-12-01` },
  { ...paidJob(12), id: 'unknown-paid-date', name: 'Legacy Payment Without Date', received: 3_000, pending: 7_000, paymentStatus: 'partial', depositDate: null, payDate: null, postDate: dateInCurrentYear(12) },
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

async function setup(
  page: Page,
  vaultHandler: (route: Route) => Promise<void> | void = route => route.fulfill({ json: { files } }),
  dataSnapshot = snapshot,
) {
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot: dataSnapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/vault', vaultHandler);
}

test('the vault opens the separate 50 ทวิ page without conflating job and file counts', async ({ page }) => {
  const fetchedFiles: string[] = [];
  await setup(page);
  await page.route('**/api/vault-file*', route => {
    fetchedFiles.push(new URL(route.request().url()).searchParams.get('id') || '');
    return route.fulfill({ body: Buffer.from('%PDF-1.7 test'), contentType: 'application/pdf' });
  });

  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'มุมมองคลังเอกสาร' })).toHaveCount(0);
  await expect(page.getByText('PO_General.pdf')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'ประเภทไฟล์ที่จัดเก็บ' }).getByRole('tab', { name: /ไฟล์ 50 ทวิ/ })).toContainText('3 ไฟล์');
  await expect(page.getByRole('button', { name: 'จัดการใบ 50 ทวิ' })).toBeVisible();
  await expect(page.locator('aside').getByRole('button', { name: 'คลังเอกสาร' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('aside').getByRole('button', { name: /ใบ 50 ทวิ/ })).toBeVisible();

  await page.getByRole('button', { name: 'จัดการใบ 50 ทวิ' }).click();
  await expect(page).toHaveURL(/\/wht50\/test-user$/);
  await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 1 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'มุมมองคลังเอกสาร' })).toHaveCount(0);
  const summary = page.getByLabel('สรุปการติดตามใบ 50 ทวิ');
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText('8 งานที่ต้องมีใบ 50 ทวิ');
  await expect(summary).toContainText('ได้รับแล้ว 2');
  await expect(summary).toContainText('ยังรอ 6');
  await expect(summary).toContainText('25%');
  await expect(page.getByText('ยอดภาษีหัก ณ ที่จ่าย', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Not Paid Yet')).toHaveCount(0);
  await expect(page.getByText('No WHT')).toHaveCount(0);
  await expect(page.getByText('Previous Year')).toHaveCount(0);
  await expect(page.getByText('Legacy Payment Without Date')).toHaveCount(0);
  await expect(page.locator('aside').getByRole('button', { name: /ใบ 50 ทวิ/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('aside').getByRole('button', { name: 'คลังเอกสาร' })).not.toHaveAttribute('aria-current', 'page');

  const statuses = page.getByRole('tablist', { name: 'สถานะใบ 50 ทวิ' });
  const statusNames = (await statuses.getByRole('tab').allTextContents()).map(text => text.replace(/\s+/g, ' ').trim());
  expect(statusNames).toEqual(['ยังรอ 6', 'ได้รับแล้ว 2', 'ทั้งหมด 8']);
  await expect(statuses.getByRole('tab', { name: /^ยังรอ/ })).toHaveAttribute('aria-selected', 'true');

  const tableRows = page.getByRole('table').locator('tbody tr');
  await expect(tableRows).toHaveCount(6);
  await expect(tableRows.first()).toContainText('Waiting Campaign 3');
  const waitingRow = tableRows.filter({ hasText: 'Waiting Campaign 3' });
  const waitedDays = calendarDaysSince(eligibleJobs[2].payDate);
  const waitingDaysLabel = waitingRow.getByText(new RegExp(`${waitedDays}\\s*วัน`));
  await expect(waitingDaysLabel).toBeVisible();
  const waitingTone = await waitingDaysLabel.getAttribute('class');
  expect(waitingTone).toMatch(/A9650B|F2C66D/i);
  expect(waitingTone).not.toMatch(/red|danger|error|C43A3A|E95454|B83434|F19A9A|FDEEEE/i);

  const sort = page.getByRole('combobox', { name: 'เรียงตาม' });
  const sortNames = (await sort.locator('option').allTextContents()).map(text => text.replace(/\s+/g, ' ').trim());
  expect(sortNames).toHaveLength(4);
  expect(sortNames[0]).toMatch(/รอนานที่สุด/);
  expect(sortNames[1]).toMatch(/ล่าสุด/);
  expect(sortNames[2]).toBe('WHT สูงสุด');
  expect(sortNames[3]).toBe('ยอดงานสูงสุด');
  await sort.selectOption({ index: 1 });
  await expect(tableRows.first()).toContainText('Waiting Campaign 8');
  await sort.selectOption({ index: 2 });
  await expect(tableRows.first()).toContainText('Waiting Campaign 5');
  await sort.selectOption({ index: 3 });
  await expect(tableRows.first()).toContainText('Waiting Campaign 7');

  const search = page.getByRole('searchbox', { name: 'ค้นหางานหรือลูกค้า' });
  await search.fill('Waiting Campaign 4');
  await expect(tableRows).toHaveCount(1);
  await expect(tableRows.first()).toContainText('Waiting Campaign 4');
  await search.fill('Brand A');
  await expect(tableRows).toHaveCount(3);
  await search.fill('Missing client');
  await expect(page.getByText('ไม่พบงานที่ตรงกับคำค้นหา')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await search.fill('');

  const taxYear = page.getByRole('combobox', { name: 'ปีภาษี' });
  await expect(taxYear.locator('option[value="unknown"]')).toHaveText('ไม่ระบุปีภาษี (1 งาน)');
  await page.getByRole('button', { name: '1 งานไม่พบวันที่รับเงินจริง' }).click();
  await expect(taxYear).toHaveValue('unknown');
  await expect(summary).toContainText('1 งานที่ต้องมีใบ 50 ทวิ');
  await expect(summary).toContainText('ยังรอ 1');
  await expect(page.getByRole('table').getByText('Legacy Payment Without Date')).toBeVisible();
  await expect(page.getByRole('table').getByText('ไม่พบวันที่รับเงินจริง')).toBeVisible();
  await taxYear.selectOption(String(currentYear));

  await statuses.getByRole('tab', { name: /^ได้รับแล้ว/ }).click();
  await expect(statuses.getByRole('tab', { name: /^ได้รับแล้ว/ })).toHaveAttribute('aria-selected', 'true');
  await expect(tableRows).toHaveCount(2);
  await expect(tableRows.filter({ hasText: 'Received Campaign 1' })).toHaveCount(1);
  await expect(tableRows.filter({ hasText: 'Received Campaign 2' })).toHaveCount(1);
  await expect(tableRows.filter({ hasText: 'Waiting Campaign' })).toHaveCount(0);
  await expect(page.getByRole('table').getByText('ได้รับแล้ว · 2 ไฟล์')).toBeVisible();
  await statuses.getByRole('tab', { name: /^ทั้งหมด/ }).click();
  await expect(statuses.getByRole('tab', { name: /^ทั้งหมด/ })).toHaveAttribute('aria-selected', 'true');
  await expect(tableRows).toHaveCount(8);
  await expect(tableRows.filter({ hasText: 'Received Campaign 1' })).toHaveCount(1);
  await expect(tableRows.filter({ hasText: 'Waiting Campaign 3' })).toHaveCount(1);
  await statuses.getByRole('tab', { name: /^ยังรอ/ }).click();
  await expect(statuses.getByRole('tab', { name: /^ยังรอ/ })).toHaveAttribute('aria-selected', 'true');
  await expect(tableRows).toHaveCount(6);
  await waitingRow.getByRole('button', { name: 'แนบใบ 50 ทวิ' }).click();
  await expect(page.getByRole('dialog', { name: 'แนบใบ 50 ทวิ' })).toContainText('Waiting Campaign 3');
  await page.keyboard.press('Escape');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /ดาวน์โหลดใบที่ได้รับแล้ว \(3 ไฟล์\)/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`ใบ50ทวิ-${currentYear + 543}.zip`);
  expect(fetchedFiles.filter(Boolean).sort()).toEqual(files.filter(file => file.kind === 'wht50').map(file => file.id).sort());

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 1 })).toBeVisible();
  const mobileWaitingRow = page.locator('ul').getByRole('listitem').filter({ hasText: 'Waiting Campaign 3' });
  await expect(mobileWaitingRow.getByText(new RegExp(`${waitedDays}\\s*วัน`))).toBeVisible();
  await expect(mobileWaitingRow.getByRole('button', { name: 'แนบใบ 50 ทวิ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('button', { name: /ไปที่คลังเอกสาร/ }).click();
  await expect(page).toHaveURL(/\/vault\/test-user$/);
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.getByText('PO_General.pdf')).toBeVisible();
});

test('legacy 50 ทวิ links open the separate 50 ทวิ page', async ({ page }) => {
  await setup(page);
  for (const path of ['/wht50', '/wht50/test-user', '/tax?view=wht50', '/tax/test-user?view=wht50']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 1 })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'มุมมองคลังเอกสาร' })).toHaveCount(0);
    await expect(page.locator('aside').getByRole('button', { name: /ใบ 50 ทวิ/ })).toHaveAttribute('aria-current', 'page');
  }

  await page.goto('/invoice?area=vault');
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 1 })).toBeVisible();
  await expect(page.locator('aside').getByRole('button', { name: 'คลังเอกสาร' })).toHaveAttribute('aria-current', 'page');
});

test('deleting the final linked certificate immediately returns its job to waiting', async ({ page }) => {
  let storedFiles = files.map(file => ({ ...file }));
  const deleted: string[] = [];
  await setup(page, route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { action: string; id: string };
      expect(body.action).toBe('delete');
      deleted.push(body.id);
      storedFiles = storedFiles.filter(file => file.id !== body.id);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { files: storedFiles } });
  });

  await page.goto('/wht50');
  const summary = page.getByLabel('สรุปการติดตามใบ 50 ทวิ');
  const statuses = page.getByRole('tablist', { name: 'สถานะใบ 50 ทวิ' });
  await statuses.getByRole('tab', { name: /^ได้รับแล้ว/ }).click();
  await page.getByRole('button', { name: 'ดูเอกสารของ Received Campaign 1' }).click();
  const drawer = page.getByRole('dialog', { name: 'ใบ 50 ทวิ' });

  for (const fileName of ['50Tawi_BrandA_part1.pdf', '50Tawi_BrandA_part2.pdf']) {
    await drawer.getByRole('button', { name: `ลบ ${fileName}` }).click();
    const confirm = page.getByRole('dialog', { name: 'ลบไฟล์นี้?' });
    await expect(confirm).toContainText(fileName);
    await confirm.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(drawer.getByText(fileName)).toHaveCount(0);
  }

  expect(deleted).toEqual(files.filter(file => file.jobId === 'wht-job-1').map(file => file.id));
  await expect(summary).toContainText('ได้รับแล้ว 1');
  await expect(summary).toContainText('ยังรอ 7');
  await drawer.getByRole('button', { name: 'ปิด' }).click();
  await statuses.getByRole('tab', { name: /^ยังรอ/ }).click();
  await expect(page.getByRole('table').getByText('Received Campaign 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'แนบใบ 50 ทวิสำหรับ Received Campaign 1' })).toBeVisible();
});

test('50 ทวิ waits for the vault before deriving status and fails safely', async ({ page }) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await setup(page, async route => { await gate; await route.fulfill({ json: { files } }); });
  await page.goto('/wht50');
  await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 1 })).toBeVisible();
  await expect(page.getByLabel('กำลังโหลดสถานะใบ 50 ทวิ')).toBeVisible();
  await expect(page.getByLabel('สรุปการติดตามใบ 50 ทวิ')).toHaveCount(0);
  release?.();
  await expect(page.getByLabel('สรุปการติดตามใบ 50 ทวิ')).toContainText('ยังรอ 6');

  await page.unroute('**/api/vault');
  let vaultFails = true;
  await page.route('**/api/vault', route => vaultFails
    ? route.fulfill({ status: 500, json: { error: 'temporary vault failure' } })
    : route.fulfill({ json: { files } }));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('โหลดสถานะใบ 50 ทวิไม่สำเร็จ');
  await expect(page.getByLabel('สรุปการติดตามใบ 50 ทวิ')).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'สถานะใบ 50 ทวิ' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeVisible();
  vaultFails = false;
  await page.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
  await expect(page.getByLabel('สรุปการติดตามใบ 50 ทวิ')).toContainText('ได้รับแล้ว 2');
});

test('50 ทวิ shows a truthful empty state when the selected year has no eligible jobs', async ({ page }) => {
  await setup(page, undefined, { ...snapshot, jobs: [] });
  await page.goto('/wht50');

  await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 1 })).toBeVisible();
  const summary = page.getByLabel('สรุปการติดตามใบ 50 ทวิ');
  await expect(summary).toContainText('0 งานที่ต้องมีใบ 50 ทวิ');
  await expect(summary).toContainText('ได้รับแล้ว 0');
  await expect(summary).toContainText('ยังรอ 0');
  await expect(summary).toContainText('0%');
  await expect(page.getByRole('tablist', { name: 'สถานะใบ 50 ทวิ' }).getByRole('tab', { name: /^ยังรอ/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('ยังไม่มีงานที่ต้องติดตามใบ 50 ทวิ')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});
