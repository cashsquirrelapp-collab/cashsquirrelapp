import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// ฟีเจอร์ทดลอง, phase 1 (owner, 2026-11-12): ปฏิทิน › ยื่นภาษี for a test account that turned it on: the six business
// questions, the month's returns with paper and online dates, ยื่นแล้ว saved into settings, and the bookkeeping template
// download. Computer and phone, no overlapping text. An account without the lab sees the calendar as before.

test.use({ serviceWorkers: 'block' });

const user = { id: '33333333-3333-4333-8333-333333333333', email: 'tester2@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const baseSettings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, labs: unknown, size: { width: number; height: number }, path = '/calendar') {
  const saves: string[] = [];
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+07:00'));
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-3333333333', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { saves.push(route.request().postData() ?? ''); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings: baseSettings, statuses: [], jobTypes: [], notifSettings: {} }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.route('**/api/labs', route => route.fulfill({ json: labs }));
  await page.setViewportSize(size);
  await page.goto(path);
  await loadLayoutFonts(page);
  return { saves };
}

const LAB_ON = { labs: { tester: true, on: ['filingCalendar', 'templates'] } };

async function answerQuestions(page: Page) {
  const form = page.getByTestId('business-questions');
  await expect(form).toBeVisible();
  await form.getByRole('radio', { name: 'บริษัทจำกัด' }).click();
  await form.getByRole('radio', { name: 'จดแล้ว' }).click();
  await form.getByRole('radio', { name: 'โปรดักชันวิดีโอ / ภาพนิ่ง' }).click();
  await expect(form.getByText('รับงานเป็นครั้ง หรือเปิดกิจการเอง')).toHaveCount(0);
  await form.getByRole('button', { name: 'จ่ายฟรีแลนซ์ ทีมงาน หรือนักแสดง' }).click();
  await form.getByRole('button', { name: 'มีลูกจ้างประจำ' }).click();
  await expect(form.getByRole('button', { name: 'บันทึกคำตอบ' })).toBeDisabled();
  await form.getByRole('radio', { name: 'เกิน 1.8 ล้านบาท' }).click();
  await form.getByRole('button', { name: 'บันทึกคำตอบ' }).click();
  await expect(form).toHaveCount(0);
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`ปฏิทิน › ยื่นภาษี on the ${device.name}: six answers, the month's returns, ยื่นแล้ว saved`, async ({ page }) => {
    const { saves } = await open(page, LAB_ON, device);
    const tab = page.getByRole(device.name === 'phone' ? 'button' : 'tab', { name: 'ยื่นภาษี' });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.getByTestId('tax-filing')).toBeVisible();
    await page.getByRole('button', { name: 'เริ่มตอบ 6 ข้อ' }).click();
    expect(await textOverlapIssues(page)).toEqual([]);
    await answerQuestions(page);
    await expect(page.getByRole('heading', { name: 'ต้องยื่นใน พ.ย. 2569' })).toBeVisible();
    const pnd3 = page.getByTestId('filing-pnd3:2026-10');
    await expect(pnd3).toContainText('ภ.ง.ด.3');
    await expect(pnd3).toContainText('งวด ต.ค. 2569');
    await expect(pnd3).toContainText('จ. 9 พ.ย.');
    await expect(pnd3).toContainText('จ. 16 พ.ย.');
    await expect(pnd3).toContainText('อีก 4 วัน');
    for (const key of ['pnd1:2026-10', 'pnd53:2026-10', 'pp30:2026-10', 'sso:2026-10']) await expect(page.getByTestId(`filing-${key}`)).toBeVisible();
    await expect(page.getByTestId('filing-pp30:2026-10')).toContainText('อีก 11 วัน');
    const done = page.getByTestId('filing-pp30:2026-10').getByRole('button', { name: 'ยื่นแล้ว' });
    await done.click();
    await expect(done).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => saves.join('\n'), { timeout: 15_000 }).toContain('pp30:2026-10');
    await expect.poll(() => saves.join('\n')).toContain('"entity":"company"');
    await page.getByRole('button', { name: 'เดือนถัดไป' }).click();
    await expect(page.getByRole('heading', { name: 'ต้องยื่นใน ธ.ค. 2569' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-tax-${device.name}.png`, fullPage: device.name === 'phone' });
  });
}

test('the template download: the answers pick โปรดักชันเฮาส์, its tabs are listed, and the file is an Excel workbook', async ({ page }) => {
  await open(page, LAB_ON, { width: 1440, height: 900 }, '/calendar?view=tax');
  await expect(page.getByTestId('tax-filing')).toBeVisible();
  await page.getByRole('button', { name: 'เริ่มตอบ 6 ข้อ' }).click();
  await answerQuestions(page);
  await page.getByRole('button', { name: 'สร้างชีตบัญชี' }).click();
  const dialog = page.getByTestId('template-dialog');
  await expect(dialog).toContainText('โปรดักชันเฮาส์');
  for (const tab of ['งบโปรดักชัน', 'ทีมงานและนักแสดง', 'เงินทดรอง', 'เคลียร์เงิน', 'ทะเบียนหัก ณ ที่จ่าย']) await expect(dialog).toContainText(tab);
  expect(await textOverlapIssues(page)).toEqual([]);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'ดาวน์โหลดไฟล์ Excel' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^ชีตบัญชี_โปรดักชันเฮาส์_2569_\d{4}\.xlsx$/);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  await expect(dialog.getByRole('status')).toContainText('ดาวน์โหลดแล้ว');
});

test('Settings › ฟีเจอร์ทดลอง opens the two built features', async ({ page }) => {
  await open(page, LAB_ON, { width: 1440, height: 900 }, '/settings');
  await page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ }).click();
  await expect(page.getByTestId('lab-open-templates')).toBeVisible();
  await page.getByTestId('lab-open-templates').click();
  await expect(page.getByTestId('business-questions')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('lab-open-filingCalendar').click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByTestId('tax-filing')).toBeVisible();
});

test('without the lab the calendar has no ยื่นภาษี, even from a link', async ({ page }) => {
  await open(page, { labs: { tester: true, on: [] } }, { width: 1440, height: 900 }, '/calendar?view=tax');
  await expect(page.getByRole('tab', { name: 'ไทม์ไลน์' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'ยื่นภาษี' })).toHaveCount(0);
  await expect(page.getByTestId('tax-filing')).toHaveCount(0);
});
