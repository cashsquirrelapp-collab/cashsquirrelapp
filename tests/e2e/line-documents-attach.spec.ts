import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Owner, 2026-11-04: "ตรงปุ่มรอเอกสาร ... กดแล้วก็แนบเอกสารได้เลยในไลน์". The 50 ทวิ LINE card's แนบใบ 50 ทวิ opens
// /line-documents?view=missing&attach=<id>: that job comes first, one tap from the camera or files. A customer (not an
// admin) must reach the page; until 2026-11-04 it sent them to the overview.
test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'customer@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const job = {
  id: 'job_a1', name: 'โพสต์ IG ร้านกาแฟ', client: 'ร้านกาแฟตัวอย่าง', type: 'Sponsored Post', creditTerm: 0, note: '',
  value: 10000, whtRate: 3, whtAmount: 300, received: 9700, pending: 0, status: 'done', paymentStatus: 'paid',
  isPosted: true, postDate: '2026-10-01', payDate: '2026-10-12', depositDate: '2026-10-12',
};
const snapshot = {
  jobs: [job], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }], job_types: ['Sponsored Post'],
  notif_settings: { enabled: true, pendingQueue: [], lineUserId: 'U-line' }, avatar_data_url: null, issuer_profile: null,
};
const versions = { cashflow_jobs: { job_a1: 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };

async function open(page: Page, path: string, dark = false) {
  const uploads: Record<string, unknown>[] = [];
  const files: Record<string, unknown>[] = [];
  await page.addInitScript(dark => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', String(dark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-02T00:00:00.000Z' }));
  }, dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ลูกค้าตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files } }));
  await page.route('**/api/vault-upload', async route => {
    const meta = JSON.parse(decodeURIComponent(route.request().headers()['x-vault-meta']));
    uploads.push(meta);
    const file = { id: '22222222-2222-4222-8222-222222222222', kind: meta.kind, jobId: meta.jobId, jobName: meta.jobName, client: meta.client, fileName: meta.fileName, mimeType: 'image/png', sizeBytes: 68, createdAt: '2026-11-04T01:00:00Z' };
    files.push(file);
    await route.fulfill({ json: { file } });
  });
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  return { uploads };
}

const shot = async (page: Page, name: string) => { if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

test('from the 50 ทวิ card: a customer lands on that job, attaches the certificate in one tap, and is told it will not be reminded again', async ({ page }) => {
  const { uploads } = await open(page, '/line-documents?view=missing&attach=job_a1&from=line');
  const card = page.getByTestId('line-documents-job');
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(/\/line-documents/);
  await expect(card).toContainText('แนบใบ 50 ทวิ');
  await expect(card).toContainText('โพสต์ IG ร้านกาแฟ');
  // The opening loader fades out over the page first; check once it has gone.
  await expect.poll(() => textOverlapIssues(page), { timeout: 6000 }).toEqual([]);
  await shot(page, 'attach-job');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('line-documents-job-attach').click();
  await (await chooser).setFiles({ name: 'cert.png', mimeType: 'image/png', buffer: PNG });
  await expect(card).toContainText('แนบใบ 50 ทวิ ให้ โพสต์ IG ร้านกาแฟ แล้ว งานนี้จะไม่ถูกเตือนอีก');
  await shot(page, 'attach-done');
  expect(uploads).toEqual([expect.objectContaining({ kind: 'wht50', jobId: 'job_a1', jobName: 'โพสต์ IG ร้านกาแฟ', fileName: 'cert.png' })]);
  await card.getByRole('button', { name: 'เสร็จสิ้น' }).click();
  await expect(card).toHaveCount(0);
  await expect(page).not.toHaveURL(/attach=/);
});

test('a job that is not in the account says so, with a way to close it', async ({ page }) => {
  await open(page, '/line-documents?view=missing&attach=demo-wht-1&from=line');
  const card = page.getByTestId('line-documents-job');
  await expect(card).toContainText('ไม่พบงานนี้ในบัญชีที่เชื่อมไว้');
  await card.getByRole('button', { name: 'ปิด' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('line-documents')).toBeVisible();
});

test('dark mode: the job card and the page read clearly, nothing overlapping', async ({ page }) => {
  await open(page, '/line-documents?view=missing&attach=job_a1&from=line', true);
  await expect(page.getByTestId('line-documents-job')).toContainText('โพสต์ IG ร้านกาแฟ');
  await expect.poll(() => textOverlapIssues(page), { timeout: 6000 }).toEqual([]);
  await shot(page, 'attach-job-dark');
});

test('an iPhone HEIC photo goes up as a JPEG, named .jpg', async ({ page }) => {
  const { uploads } = await open(page, '/line-documents?view=missing&attach=job_a1&from=line');
  const bodies: Buffer[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/vault-upload')) bodies.push(request.postDataBuffer() ?? Buffer.alloc(0)); });
  await expect(page.getByTestId('line-documents-job')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('line-documents-job-attach').click();
  await (await chooser).setFiles({ name: 'IMG_3095.heic', mimeType: 'image/heic', buffer: readFileSync(new URL('./fixtures/sample.heic', import.meta.url)) });
  await expect(page.getByTestId('line-documents-job')).toContainText('งานนี้จะไม่ถูกเตือนอีก', { timeout: 15000 });
  expect(uploads).toEqual([expect.objectContaining({ kind: 'wht50', jobId: 'job_a1', fileName: 'IMG_3095.jpg' })]);
  expect([...bodies[0].subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
});
