import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { readFileSync } from 'node:fs';
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
  await page.goto(noRadar(options.path ?? '/jobs'));
}

test('showcase mode: admins on a computer; amounts hidden until shown; real figures only; Esc leaves', async ({ page }) => {
  await open(page, 1440, 900, { path: '/dashboard' });
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).click();
  await page.getByRole('button', { name: 'โหมดโชว์ผลงาน' }).click();
  const flex = page.getByRole('dialog', { name: 'โหมดโชว์ผลงาน' });
  await expect(flex).toBeVisible();
  await expect(flex.locator('.kfx-num')).toHaveText('฿ ••••••');
  // October 27,600 against September 20,000: +38%.
  await expect(flex).toContainText('+38% จากเดือนก่อน');
  await expect(flex).toContainText('เดือนที่ดีที่สุดในรอบ 6 เดือน');
  await expect(flex).not.toContainText('ลูกค้าตัวอย่าง');
  await expect(flex).not.toContainText('ร้าน');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('flex-income-hidden.png') });
  await flex.getByRole('switch', { name: 'แสดงยอดเงิน' }).click();
  await expect(flex.locator('.kfx-num')).toHaveText('฿27,600');
  await flex.getByRole('radio', { name: 'การเติบโต' }).click();
  await expect(flex.locator('.kfx-num')).toHaveText('+38%');
  await flex.getByRole('radio', { name: 'สรุปเดือน' }).click();
  await expect(flex.locator('.kfx-tile').first()).toContainText('2');
  await expect(flex).toContainText('Freelancer Wrapped · ตุลาคม 2569');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('flex-wrapped.png') });
  // The controls step aside while the mouse rests, so a photo has only the figures and the brand.
  await page.waitForTimeout(3400);
  await expect(flex.locator('.kfx-controls')).toHaveClass(/is-idle/);
  await page.keyboard.press('Escape');
  await expect(flex).toHaveCount(0);
});

test('showcase mode is for admins only for now', async ({ page }) => {
  await open(page, 1440, 900, { role: 'user', path: '/dashboard' });
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).click();
  await expect(page.getByRole('switch', { name: 'โหมดมืด' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'โหมดโชว์ผลงาน' })).toHaveCount(0);
});

test('Story: five templates from real figures, amounts hidden by default, saved as a 1080 × 1920 picture', async ({ page }) => {
  await open(page, 1440, 900, { path: '/dashboard' });
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).click();
  await page.getByRole('button', { name: 'โหมดโชว์ผลงาน' }).click();
  await page.getByRole('button', { name: 'ทำภาพ Story' }).click();
  const maker = page.getByRole('dialog', { name: 'ทำภาพ Story' });
  await expect(maker).toBeVisible();
  await expect(maker.getByRole('radio')).toHaveCount(7, { timeout: 5000 });
  const preview = maker.locator('.kst-preview');
  await expect(preview).toContainText('+38%');
  await expect(preview).not.toContainText('฿27,600');
  await maker.getByText('Achievement Flex').click();
  await expect(preview).toContainText('รับเงินครบ ฿10K');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('story-maker.png') });
  const [achievement] = await Promise.all([page.waitForEvent('download'), maker.getByRole('button', { name: 'บันทึกภาพ' }).click()]);
  await achievement.saveAs(test.info().outputPath('story-achievement.png'));
  await maker.getByText('Income Flex').click();
  await maker.getByRole('switch', { name: 'แสดงยอดเงิน' }).click();
  await expect(preview).toContainText('฿27,600');
  const [download] = await Promise.all([page.waitForEvent('download'), maker.getByRole('button', { name: 'บันทึกภาพ' }).click()]);
  expect(download.suggestedFilename()).toBe('krarok-story-income-2026-10.png');
  await download.saveAs(test.info().outputPath('story-income.png'));
  const png = readFileSync(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
  await page.keyboard.press('Escape');
  await expect(maker).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'โหมดโชว์ผลงาน' })).toBeVisible();
});
