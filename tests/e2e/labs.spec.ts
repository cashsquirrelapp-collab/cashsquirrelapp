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

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`a tester sees ฟีเจอร์ทดลอง in Settings on the ${device.name}; every feature is listed, the unfinished ones locked, the built ones switchable`, async ({ page }) => {
    await open(page, { labs: { tester: true, on: [] } }, device);
    const row = page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ });
    await expect(row).toBeVisible();
    expect(await textOverlapIssues(page)).toEqual([]);
    await row.click();
    const list = page.getByTestId('labs-list');
    await expect(list).toBeVisible();
    await expect(page.getByText('เห็นเฉพาะบัญชีทดสอบ ลูกค้าทั่วไปไม่เห็น', { exact: false })).toBeVisible();
    for (const name of ['เชื่อม Google Sheets', 'เชื่อมไฟล์ Excel', 'แผนที่ชีต', 'บันทึกลงชีตของคุณ', 'สร้างชีตตามประเภทธุรกิจ', 'ปฏิทินยื่นภาษี', 'โปรเจกต์และเงินทดรอง', 'สำนักงานบัญชี']) {
      await expect(list).toContainText(name);
    }
    // Phase 1 (2026-11-12): the template download and the filing calendar are built; phase 2: the Google Sheets
    // connection, the Excel file and the sheet map. The other three are still locked.
    await expect(list.getByText('กำลังสร้าง')).toHaveCount(3);
    await expect(list.getByRole('switch')).toHaveCount(5);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-settings-${device.name}.png` });
  });
}

test('an ordinary account, or one whose state cannot be read, sees Settings as before: no ฟีเจอร์ทดลอง', async ({ page }) => {
  const { labReads } = await open(page, { labs: { tester: false, on: [] } });
  await expect(page.getByRole('button', { name: /^ความยินยอม/ })).toBeVisible();
  await expect.poll(() => labReads.length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ })).toHaveCount(0);
  await expect(page.getByText('ฟีเจอร์ทดลอง')).toHaveCount(0);
});

test('an answer the app cannot read counts as not a tester', async ({ page }) => {
  await page.route('**/api/labs', route => route.fulfill({ status: 503, json: { error: 'busy' } }));
  await open(page, { labs: { tester: true, on: [] } });
  await page.unroute('**/api/labs');
  await page.route('**/api/labs', route => route.fulfill({ status: 503, json: { error: 'busy' } }));
  await page.reload();
  await expect(page.getByRole('button', { name: /^ความยินยอม/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ })).toHaveCount(0);
});
