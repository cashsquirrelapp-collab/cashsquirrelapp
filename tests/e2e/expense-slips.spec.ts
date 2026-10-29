import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Slips in the เพิ่มรายจ่าย form (owner, 2026-10-29: "เพิ่มเป็นการแนบสลิป ... แค่เฉพาะเมนูแอดมิน"): admins pick or drop slips
// in the form itself; saving keeps the expense first, then its slips in the vault (kind 'expense', linked by the
// expense's id). Everyone else's form is unchanged.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'slips@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: true, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
// A real 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

async function open(page: Page, { admin, width = 1280, height = 900 }: { admin: boolean; width?: number; height?: number }) {
  const saved: any[] = [];
  const uploads: any[] = [];
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: admin ? 'admin' : 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/vault-upload', route => {
    const meta = JSON.parse(decodeURIComponent(route.request().headers()['x-vault-meta']));
    uploads.push(meta);
    return route.fulfill({ status: 201, json: { file: { id: `vf-${uploads.length}`, kind: meta.kind, jobId: meta.jobId, jobName: meta.jobName, client: null, fileName: meta.fileName, mimeType: 'image/png', sizeBytes: PNG.length, createdAt: new Date().toISOString() } } });
  });
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { saved.push(...(route.request().postDataJSON().changes || [])); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.setViewportSize({ width, height });
  await page.goto('/incomeExpense');
  return { saved, uploads };
}

const openForm = async (page: Page) => {
  await page.getByRole('button', { name: 'เพิ่มรายจ่าย', exact: true }).first().click();
  const drawer = page.getByRole('dialog', { name: 'เพิ่มรายจ่าย' });
  await expect(drawer).toBeVisible();
  return drawer;
};

test('admins attach a slip in the form; it is kept with the new expense', async ({ page }) => {
  const { saved, uploads } = await open(page, { admin: true });
  const drawer = await openForm(page);
  const slips = drawer.getByTestId('expense-form-slips');
  await expect(slips).toContainText('สลิป / ใบเสร็จ');
  await expect(slips).toContainText('เฉพาะแอดมิน');
  await drawer.getByLabel('รายการ').fill('ค่าไฟสตูดิโอ');
  await drawer.getByLabel('จำนวนเงิน').fill('1250');
  await slips.locator('input[type="file"]').setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: PNG });
  await expect(slips.getByText('slip.png')).toBeVisible();
  await expect(slips.locator('img')).toHaveCount(1); // the picture's preview
  // A file of another type is listed with the reason and never sent.
  await slips.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(slips).toContainText('รองรับเฉพาะ PDF, JPG, PNG, WEBP');
  expect(await textOverlapIssues(page)).toEqual([]);
  if (process.env.SHOT_DIR) await drawer.screenshot({ path: `${process.env.SHOT_DIR}/expense-slips-computer.png` });
  await drawer.getByRole('button', { name: 'บันทึกรายจ่าย' }).click();
  await expect.poll(() => uploads.length).toBe(1);
  const expense = await expect.poll(() => saved.find(change => change.table === 'cashflow_expenses')?.data?.name).toBe('ค่าไฟสตูดิโอ').then(() => saved.find(change => change.table === 'cashflow_expenses'));
  expect(uploads[0]).toMatchObject({ kind: 'expense', jobId: expense.id, jobName: 'ค่าไฟสตูดิโอ', fileName: 'slip.png' });
  await expect(page.getByText(/บันทึกรายจ่ายเรียบร้อยแล้ว พร้อมสลิป 1 ไฟล์/)).toBeVisible();
  await expect(drawer).toHaveCount(0);
});

test('everyone else: the form has no slip field', async ({ page }) => {
  await open(page, { admin: false });
  const drawer = await openForm(page);
  await expect(drawer.getByTestId('expense-form-slips')).toHaveCount(0);
});

test('phones: admins see the slip field in the form, nothing overlapping', async ({ page }) => {
  await open(page, { admin: true, width: 390, height: 844 });
  const drawer = await openForm(page);
  const slips = drawer.getByTestId('expense-form-slips');
  await slips.scrollIntoViewIfNeeded();
  await expect(slips).toContainText('แนบสลิปโอนเงินหรือใบเสร็จ');
  await slips.locator('input[type="file"]').setInputFiles({ name: 'slip-from-bank.png', mimeType: 'image/png', buffer: PNG });
  await expect(slips.getByText('slip-from-bank.png')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/expense-slips-phone.png` });
});
