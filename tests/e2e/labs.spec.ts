import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// ฟีเจอร์ทดลอง (owner, 2026-11-12: "เวลาดีพลอยเข้าพวกเซตติ้งนะ จะดูในนั้นเพื่อการทดลอง"): a tester sees the section in
// Settings and every new feature listed there; an ordinary account sees Settings exactly as before. The backend is mocked.

test.use({ serviceWorkers: 'block' });

const user = { id: '22222222-2222-4222-8222-222222222222', email: 'tester@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } }, statuses: [], jobTypes: [], notifSettings: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, labs: unknown, size = { width: 1440, height: 900 }) {
  const labReads: string[] = [];
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-2222222222', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.route('**/api/labs', route => { labReads.push(route.request().method()); return route.fulfill({ json: labs }); });
  await page.setViewportSize(size);
  await page.goto('/settings');
  await loadLayoutFonts(page);
  return { labReads };
}

// Since 2026-11-16 (owner: "ฟีเจอร์ทดลองอ่ะไม่ต้องให้มันเป็นฟีเจอร์ทดลองละ เอาเรียกมันมาใช้จริงได้เลย") the built ones are
// everyone's, under ตั้งค่า › ชีตและภาษี; a test account also sees the two still being built.
for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`every account opens Google Sheets และ Excel in Settings on the ${device.name}; a tester also sees the two still being built`, async ({ page }) => {
    await open(page, { labs: { tester: true, on: ['sheets', 'excel', 'sheetMap', 'sheetWrite', 'sheetJobs', 'templates', 'filingCalendar'] } }, device);
    const row = page.getByRole('button', { name: /^Google Sheets และ Excel/ });
    await expect(row).toBeVisible();
    expect(await textOverlapIssues(page)).toEqual([]);
    await row.click();
    const tools = page.getByTestId('tools-list');
    await expect(tools).toBeVisible();
    for (const name of ['เชื่อม Google Sheets', 'เชื่อมไฟล์ Excel', 'สร้างชีตตามประเภทธุรกิจ', 'ปฏิทินยื่นภาษี']) await expect(tools).toContainText(name);
    await expect(tools.getByRole('button', { name: 'เปิด' })).toHaveCount(4);
    await expect(tools.getByRole('switch')).toHaveCount(0);
    const list = page.getByTestId('labs-list');
    await expect(list).toBeVisible();
    await expect(page.getByText('เห็นเฉพาะบัญชีทดสอบ ลูกค้าทั่วไปไม่เห็น', { exact: false })).toBeVisible();
    for (const name of ['โปรเจกต์และเงินทดรอง', 'สำนักงานบัญชี']) await expect(list).toContainText(name);
    await expect(list.getByText('กำลังสร้าง')).toHaveCount(2);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-settings-${device.name}.png` });
  });
}

test('an ordinary account opens the same tools, without the part still being tested', async ({ page }) => {
  const { labReads } = await open(page, { labs: { tester: false, on: ['sheets', 'excel', 'sheetMap', 'sheetWrite', 'sheetJobs', 'templates', 'filingCalendar'] } });
  await expect(page.getByRole('button', { name: /^ความยินยอม/ })).toBeVisible();
  await expect.poll(() => labReads.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Google Sheets และ Excel/ }).click();
  await expect(page.getByTestId('tools-list').getByRole('button', { name: 'เปิด' })).toHaveCount(4);
  await expect(page.getByTestId('labs-list')).toHaveCount(0);
  await expect(page.getByText('ฟีเจอร์ทดลอง')).toHaveCount(0);
});

test('an answer the app cannot read opens nothing still being tested', async ({ page }) => {
  await page.route('**/api/labs', route => route.fulfill({ status: 503, json: { error: 'busy' } }));
  await open(page, { labs: { tester: true, on: [] } });
  await page.unroute('**/api/labs');
  await page.route('**/api/labs', route => route.fulfill({ status: 503, json: { error: 'busy' } }));
  await page.reload();
  await expect(page.getByRole('button', { name: /^ความยินยอม/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ })).toHaveCount(0);
});
