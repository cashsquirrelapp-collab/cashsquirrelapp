import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// Welcome Onboarding (owner brief, 2026-10-28; look E): four questions after the first sign-in of a new account. The
// name is required and becomes the account's name (what เลขา calls the person); step 1 is only the greeting and one
// field, with no step count and no ข้ามก่อน. The answers are kept with stable IDs in the settings; ข้ามก่อน (steps 2-4)
// keeps SKIPPED and never asks again; the answers can be changed from Settings; the admin sees the groups.
// Everything is mocked: no real account or service is used.

test.use({ serviceWorkers: 'block' });

const NEW_USER = { id: '77777777-7777-4777-8777-777777777777', email: 'new@example.test', role: 'user', created_at: new Date().toISOString(), user_metadata: {} };
const OLD_USER = { ...NEW_USER, created_at: '2026-10-01T00:00:00.000Z' };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const baseSettings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: false };

type Saved = { settings: any[]; names: string[] };
async function open(page: Page, options: { user?: typeof NEW_USER; settings?: Record<string, unknown>; width?: number; height?: number; path?: string; admin?: boolean; analytics?: unknown; dark?: boolean } = {}) {
  const user = options.user ?? NEW_USER;
  let settings: Record<string, unknown> = { ...baseSettings, ...(options.settings ?? {}) };
  let displayName = 'new.user';
  const saved: Saved = { settings: [], names: [] };
  await page.addInitScript(dark => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', String(dark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, options.dark === true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user: { ...user, role: options.admin ? 'admin' : 'user', canViewAdminAnalytics: !!options.admin } } } }));
  await page.route('**/api/profile', route => {
    if (route.request().method() === 'POST') { displayName = route.request().postDataJSON().displayName; saved.names.push(displayName); }
    return route.fulfill({ json: { userId: user.id, publicId: 'SQ-7777777777', displayName } });
  });
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: options.admin ? 'admin' : 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') {
      for (const change of route.request().postDataJSON().changes ?? []) {
        if (change.table === 'cashflow_documents' && change.id === 'settings') { settings = change.data; saved.settings.push(change.data); }
      }
      return route.fulfill({ json: { ok: true, versions } });
    }
    return route.fulfill({ json: { snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings, statuses: [], job_types: ['Sponsored Post', 'Video Production'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null }, versions, subscription: null } });
  });
  if (options.admin) {
    // The admin page's other parts are not under test: unavailable, as in the feedback inbox tests.
    for (const path of ['**/api/admin-stripe-finance?*', '**/api/admin-ai-credit', '**/api/admin-payment-readiness', '**/api/admin-profit-live*', '**/api/usage-analytics']) {
      await page.route(path, route => route.fulfill({ status: 503, json: { error: 'Unavailable in this test' } }));
    }
  }
  if (options.analytics) await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: options.analytics }));
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 860 });
  await page.goto(options.path ?? '/dashboard');
  await loadLayoutFonts(page);
  return { saved, settings: () => settings };
}
const dialog = (page: Page) => page.getByRole('dialog', { name: /อยากให้เราเรียกคุณว่าอะไร|ตอนนี้คุณทำงานรูปแบบไหน|คุณทำงานด้านไหนบ้าง|อยากให้ Krarok ช่วยเรื่องไหนบ้าง/ });
const step = (page: Page) => dialog(page).getByRole('progressbar');

test('a new account: four steps in order, "อื่น ๆ" opens a box, the exclusive goal, and everything is kept', async ({ page }, info) => {
  const mock = await open(page);
  const box = dialog(page);
  await expect(box).toBeVisible();
  // Step 1: the greeting, the question and one field; no step count, no ข้ามก่อน, no back.
  await expect(box.getByText('สวัสดีครับ', { exact: true })).toBeVisible();
  await expect(box.getByRole('heading', { name: 'อยากให้เราเรียกคุณว่าอะไร?' })).toBeVisible();
  await expect(box.getByText('ใช้ทั้งในแอปและ LINE ไม่ใช้แทนชื่อจริงในเอกสาร')).toBeVisible();
  await expect(step(page)).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'ข้ามก่อน' })).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'ย้อนกลับ' })).toHaveCount(0);
  const name = box.getByLabel('ชื่อที่ให้เลขากระรอกเรียก');
  await expect(name).toHaveAttribute('placeholder', 'เช่น ปาร์ค, มายด์, บอส');
  await expect(name).toBeFocused();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-step1.png') });
  // The name is required: empty or one letter says so and stays.
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(box.getByText('กรุณาใส่ชื่อที่อยากให้เราเรียก')).toBeVisible();
  await name.fill('ม');
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(box.getByText('ชื่อต้องมีอย่างน้อย 2 ตัวอักษร')).toBeVisible();
  await expect(box.getByRole('heading', { name: 'อยากให้เราเรียกคุณว่าอะไร?' })).toBeVisible();
  await name.fill('มายด์');
  // The name appears under the greeting as it is typed.
  await expect(box.getByText('คุณมายด์', { exact: true })).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-step1-named.png') });
  await name.press('Enter');

  await expect(step(page)).toHaveAttribute('aria-valuenow', '2');
  await expect(box.getByRole('heading', { name: 'ตอนนี้คุณทำงานรูปแบบไหน?' })).toBeVisible();
  const work = box.getByRole('radiogroup');
  await expect(work.getByRole('radio')).toHaveCount(5);
  await expect(box.getByPlaceholder('ระบุรูปแบบการทำงานของคุณ')).toHaveCount(0);
  await work.getByText('อื่น ๆ (โปรดระบุ)').click();
  await expect(box.getByPlaceholder('ระบุรูปแบบการทำงานของคุณ')).toBeFocused();
  await box.getByPlaceholder('ระบุรูปแบบการทำงานของคุณ').fill('ช่างแต่งหน้า');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-step2.png') });
  // Back keeps what was typed.
  await box.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await expect(name).toHaveValue('มายด์');
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(box.getByPlaceholder('ระบุรูปแบบการทำงานของคุณ')).toHaveValue('ช่างแต่งหน้า');
  await box.getByRole('button', { name: 'ถัดไป' }).click();

  await expect(step(page)).toHaveAttribute('aria-valuenow', '3');
  const fields = box.getByRole('group');
  await expect(fields.getByRole('checkbox')).toHaveCount(8);
  await fields.getByText('คอนเทนต์ครีเอเตอร์').click();
  await fields.getByText('การตลาด / โฆษณา').click();
  await fields.getByText('อื่น ๆ (โปรดระบุ)').click();
  await box.getByPlaceholder('ระบุสายงานของคุณ').fill('งานแต่งงาน');
  await expect(fields.getByRole('checkbox', { checked: true })).toHaveCount(3);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-step3.png') });
  await box.getByRole('button', { name: 'ถัดไป' }).click();

  await expect(step(page)).toHaveAttribute('aria-valuenow', '4');
  const goals = box.getByRole('group');
  await goals.getByText('ติดตามเงินค้างรับจากลูกค้า').click();
  await goals.getByText('ทำใบเสนอราคาและเอกสาร').click();
  await goals.getByText('ยังไม่แน่ใจ อยากลองใช้ก่อน').click();
  await expect(goals.getByRole('checkbox', { checked: true })).toHaveCount(1);
  await goals.getByText('จัดการงานและโปรเจกต์').click();
  await goals.getByText('ทำใบเสนอราคาและเอกสาร').click();
  await expect(goals.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(goals.getByRole('checkbox', { name: /ยังไม่แน่ใจ/ })).not.toBeChecked();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-step4.png') });
  await box.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
  await expect(box).toHaveCount(0);

  expect(mock.saved.names).toEqual(['มายด์']);
  await expect.poll(() => mock.saved.settings.at(-1)?.onboarding?.status).toBe('COMPLETED');
  const kept = mock.saved.settings.at(-1);
  expect(kept.onboarding).toMatchObject({
    version: 'welcome-v1', status: 'COMPLETED', work_type: 'other', work_type_other: 'ช่างแต่งหน้า',
    occupations: ['content_creator', 'marketing', 'other'], occupation_other: 'งานแต่งงาน', goals: ['projects', 'documents'],
  });
  expect(kept.profileSetupCompleted).toBe(true);
  // A reload never asks again.
  await page.reload();
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(dialog(page)).toHaveCount(0);
});

test('ข้ามก่อน keeps SKIPPED with what was picked, and the next sign-in does not ask again', async ({ page }) => {
  const mock = await open(page);
  const box = dialog(page);
  await expect(box).toBeVisible();
  await expect(box.getByRole('button', { name: 'ข้ามก่อน' })).toHaveCount(0);
  await box.getByLabel('ชื่อที่ให้เลขากระรอกเรียก').fill('บอส');
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await box.getByRole('radiogroup').getByText('พนักงานประจำ').click();
  await box.getByRole('button', { name: 'ข้ามก่อน' }).click();
  await expect(box).toHaveCount(0);
  await expect.poll(() => mock.saved.settings.at(-1)?.onboarding?.status).toBe('SKIPPED');
  expect(mock.saved.settings.at(-1).onboarding).toMatchObject({ status: 'SKIPPED', skipped_at_step: 2, work_type: 'employee', goals: [] });
  // The work type already sets the menu as the old setup did; the name given in step 1 is kept.
  expect(mock.saved.settings.at(-1).userPersona).toBe('employee');
  expect(mock.saved.names).toEqual(['บอส']);
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(dialog(page)).toHaveCount(0);
});

test('accounts from before the rollout are never asked', async ({ page }) => {
  await open(page, { user: OLD_USER });
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(dialog(page)).toHaveCount(0);
});

test('390px phone: the whole screen, step 1 as few things as possible, ถัดไป within reach, nothing overlaps', async ({ page }, info) => {
  const mock = await open(page, { width: 390, height: 844 });
  const box = dialog(page);
  await expect(box).toBeVisible();
  const frame = (await box.boundingBox())!;
  expect([Math.round(frame.width), Math.round(frame.height)]).toEqual([390, 844]);
  const next = box.getByRole('button', { name: 'ถัดไป' });
  // Step 1: the arrow sits in the name field, in the upper half (above the keyboard), at least 44px.
  const arrow = (await next.boundingBox())!;
  expect(arrow.height).toBeGreaterThanOrEqual(44);
  expect(arrow.y + arrow.height).toBeLessThan(500);
  await expect(step(page)).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'ข้ามก่อน' })).toHaveCount(0);
  await expect(box.getByText('ยินดีต้อนรับสู่กระรอกตุนเงิน')).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-390-step1.png') });
  await box.getByLabel('ชื่อที่ให้เลขากระรอกเรียก').fill('บอส');
  await expect(box.getByText('คุณบอส', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('onboarding-390-step1-named.png') });
  await next.click();
  await expect(step(page)).toHaveAttribute('aria-valuenow', '2');
  expect((await next.boundingBox())!.y).toBeGreaterThan(740);
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-390-step2.png') });
  await box.getByRole('radiogroup').getByText('ฟรีแลนซ์ / อาชีพอิสระ').click();
  await next.click();
  await box.getByRole('group').getByText('ช่างภาพ / วิดีโอ').click();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-390-step3.png') });
  await next.click();
  await box.getByRole('group').getByText('ดูภาพรวมรายรับรายจ่ายและกระแสเงินสด').click();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-390-step4.png') });
  await box.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
  await expect(box).toHaveCount(0);
  await expect.poll(() => mock.saved.settings.at(-1)?.onboarding?.goals).toEqual(['cashflow_overview']);
  expect(mock.saved.settings.at(-1).userPersona).toBe('freelance');
  expect(mock.saved.names).toEqual(['บอส']);
});

test('dark mode: the same screens on the dark sky, computer and phone, nothing overlaps', async ({ page }, info) => {
  await open(page, { dark: true });
  const box = dialog(page);
  await expect(box).toBeVisible();
  await box.getByLabel('ชื่อที่ให้เลขากระรอกเรียก').fill('มายด์');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-dark-step1.png') });
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await box.getByRole('group').getByText('คอนเทนต์ครีเอเตอร์').click();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-1280-dark-step3.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel('ชื่อที่ให้เลขากระรอกเรียก').fill('มายด์');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-390-dark-step1.png') });
  await dialog(page).getByRole('button', { name: 'ถัดไป' }).click();
  await dialog(page).getByRole('button', { name: 'ถัดไป' }).click();
  await dialog(page).getByRole('group').getByText('คอนเทนต์ครีเอเตอร์').click();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-390-dark-step3.png') });
});

test('Settings: the answers open again with what was chosen, and saving changes them', async ({ page }) => {
  const done = { version: 'welcome-v1', status: 'COMPLETED', work_type: 'student', work_type_other: null, occupations: ['teacher_coach'], occupation_other: null, goals: ['exploring'], updated_at: '2026-10-28T01:00:00.000Z', completed_at: '2026-10-28T01:00:00.000Z' };
  const mock = await open(page, { settings: { onboarding: done }, path: '/settings' });
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: /เกี่ยวกับการทำงานของคุณ/ }).click();
  const box = dialog(page);
  await expect(box).toBeVisible();
  await expect(box.getByRole('button', { name: 'ข้ามก่อน' })).toHaveCount(0);
  await expect(box.getByLabel('ชื่อที่ให้เลขากระรอกเรียก')).toHaveValue('new.user');
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(box.getByRole('radio', { name: 'นักเรียน / นักศึกษา' })).toBeChecked();
  await box.getByRole('radiogroup').getByText('พนักงานประจำ').click();
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(box.getByRole('checkbox', { name: 'ครู / ติวเตอร์ / โค้ช' })).toBeChecked();
  await box.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(box.getByRole('checkbox', { name: /ยังไม่แน่ใจ/ })).toBeChecked();
  expect(await textOverlapIssues(page)).toEqual([]);
  await box.getByRole('button', { name: 'บันทึก' }).click();
  await expect(box).toHaveCount(0);
  await expect.poll(() => mock.saved.settings.at(-1)?.onboarding?.work_type).toBe('employee');
  expect(mock.saved.settings.at(-1).onboarding.completed_at).toBe('2026-10-28T01:00:00.000Z');
  // The name was not changed, so the profile was not written.
  expect(mock.saved.names).toEqual([]);
  // ปิด leaves without saving.
  await page.getByRole('button', { name: /เกี่ยวกับการทำงานของคุณ/ }).click();
  await dialog(page).getByRole('button', { name: 'ปิด' }).click();
  await expect(dialog(page)).toHaveCount(0);
});

const segment = (id: string, accounts: number, n = 0) => ({ id, accounts, project_created: n, document_created: Math.min(n, 1), expense_created: 0, ai_message_sent: n, pro_subscription_activated: Math.min(n, 1), returned: n });
const ANALYTICS = {
  range: 30, fromDate: '2026-09-29', toDate: '2026-10-28', generatedAt: new Date().toISOString(),
  totals: { accounts: 12, newAccounts: 6, activeUsers: 5, previousActiveUsers: 3, pageViews: 90, proAccounts: 2, paidProAccounts: 1, trialAccounts: 4, freeAccounts: 6, revenue: 177, previousRevenue: 0, paymentCount: 1, conversionRate: 0.08, averageRevenuePerPayer: 177 },
  daily: [], features: [], personas: [], accounts: [], payments: [],
  onboarding: {
    eligible: 6, completed: 4, skipped: 1, pending: 1,
    workTypes: [segment('freelance', 3, 2), segment('employee', 1), segment('student', 1), segment('business_owner', 0), segment('other', 0)],
    occupations: [segment('content_creator', 3, 2), segment('video_graphic', 2, 1), segment('developer_digital', 0), segment('marketing', 1), segment('photo_video', 0), segment('teacher_coach', 1), segment('trade_owner', 0), segment('other', 1)],
    goals: [segment('cashflow_overview', 2, 1), segment('receivables', 3, 2), segment('projects', 1), segment('documents', 2, 1), segment('exploring', 1)],
    otherWorkTypes: [], otherOccupations: [{ text: 'ช่างแต่งหน้า', accounts: 1 }],
  },
};
test('admin: the new users tab shows the groups and what they did, on the computer and the phone', async ({ page }, info) => {
  await open(page, { user: OLD_USER, admin: true, analytics: ANALYTICS, path: '/adminDashboard' });
  await page.getByRole('button', { name: 'ผู้ใช้ใหม่', exact: true }).click();
  const view = page.getByTestId('admin-onboarding');
  await expect(view).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'หมวดการวิเคราะห์' });
  await expect(tabs.getByRole('button', { name: 'ผู้ใช้ใหม่', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(tabs.getByRole('button', { name: 'ภาพรวม', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(view.getByText('ตอบครบ')).toBeVisible();
  const work = view.getByRole('region', { name: 'รูปแบบการทำงาน' });
  await expect(work.locator('tbody tr').first()).toContainText('ฟรีแลนซ์ / อาชีพอิสระ');
  await expect(work.locator('tbody tr').first()).toContainText('67%');
  await expect(view.getByRole('region', { name: 'สายงานที่พิมพ์เอง' })).toContainText('ช่างแต่งหน้า');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('admin-onboarding-1280.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/adminDashboard');
  await page.getByRole('button', { name: /ผู้ใช้ใหม่/ }).first().click();
  await expect(page.getByTestId('admin-onboarding')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('admin-onboarding-390.png'), fullPage: true });
});
