import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// pkg77–78 (owner approved the mockups 2026-10-25, "ตามแนะนำหมด"): today's briefing in เลขา's panel and the squirrel's
// note on computers and iPads; the showcase mode and Story pictures for admins on computers and iPads; phones see
// none of it. Synthetic data; nothing calls an AI or a payment service. The clock is 22 Oct 2569 09:00 Bangkok.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'flex@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const job = (id: string, over: Record<string, unknown>) => ({ id, name: id, type: 'Other', client: 'ลูกค้าตัวอย่าง', value: 0, received: 0, pending: 0, status: 'done', creditTerm: 0, payDate: null, note: '', ...over });
const jobs = [
  job('ออกแบบโลโก้', { value: 12000, pending: 12000, status: 'pending', payDate: '2026-09-22' }),
  job('เว็บไซต์ตัวอย่าง', { value: 30000, pending: 30000, status: 'pending', payDate: '2026-10-22' }),
  job('งานกันยายน', { value: 20000, received: 20000, payDate: '2026-09-10', client: 'ร้าน ก' }),
  job('งานตุลาคม 1', { value: 18000, received: 18000, payDate: '2026-10-05', client: 'ร้าน ข' }),
  job('งานตุลาคม 2', { value: 9600, received: 9600, payDate: '2026-10-12', client: 'ร้าน ค' }),
];
const snapshot = { jobs, expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [],
  // The app's own once-a-day overdue dialog is off here, so the squirrel's note can be seen on its own.
  notif_settings: { enabled: false } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, width: number, height: number, options: { role?: 'admin' | 'user'; path?: string } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-22T02:00:00Z'));
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: options.role ?? 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2026-12-31T00:00:00Z' } } }));
  await page.setViewportSize({ width, height });
  await page.goto(options.path ?? '/jobs');
}

test('computer: the squirrel says the most important thing once, and the panel opens on today\'s briefing', async ({ page }) => {
  await open(page, 1280, 820);
  const note = page.locator('.asx-brief-tip');
  await expect(note).toBeVisible({ timeout: 6000 });
  await expect(note).toContainText('เลยกำหนดรับเงิน 1 รายการ');
  expect(await textOverlapIssues(page)).toEqual([]);
  await note.getByRole('button', { name: /เลยกำหนดรับเงิน/ }).click();
  const brief = page.getByRole('region', { name: 'สรุปวันนี้' });
  await expect(brief).toBeVisible();
  await expect(brief.locator('.asx-brief-item')).toHaveCount(2);
  await expect(brief).toContainText('รวม ฿12,000 · นานสุด 30 วัน (ออกแบบโลโก้)');
  await expect(brief).toContainText('ครบกำหนดรับเงินวันนี้ 1 รายการ');
  await expect(brief).toContainText('คำนวณจากข้อมูลที่บันทึกในแอป ไม่ใช่ยอดบัญชีธนาคาร');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('briefing-1280.png') });
  await brief.getByRole('button', { name: 'ดูรายการรอรับเงิน' }).first().click();
  await expect(page).toHaveURL(/\/receivables/);
  // Said once today: after a reload the note does not come back.
  await page.reload();
  await expect(page.getByRole('button', { name: /^ถามเลขากระรอกเรื่องหน้า/ })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator('.asx-brief-tip')).toHaveCount(0);
});

test('phones: no briefing, no note, no showcase mode', async ({ page }) => {
  await open(page, 390, 844, { path: '/dashboard' });
  const button = page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' });
  await expect(button).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator('.asx-brief-tip')).toHaveCount(0);
  await button.click();
  await expect(page.getByRole('dialog', { name: /^เลขากระรอก · หน้า/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'สรุปวันนี้' })).toHaveCount(0);
  await expect(page.getByText('โหมดโชว์ผลงาน')).toHaveCount(0);
});
