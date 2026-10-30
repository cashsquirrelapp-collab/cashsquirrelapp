import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Owner, 2026-10-31: "ถ้ายูเซอร์มีสลิป ส่งเข้าไปในแชทน้อง แล้วน้องแนบเข้าในโปรเจกต์นั้นได้เลย" and "รายจ่ายประจำ ... แนบสลิปได้ด้วย
// ไม่ใช่แค่รายจ่ายทั่วไป". The chat's attach card opens the vault's own upload window with the file and its job; fixed
// monthly costs keep slips for their month. The backend is mocked; no AI is called.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'attach@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const month = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7);
const job = { id: 'job-wht', name: 'รีวิวสินค้า', client: 'Brand A', value: 10_000, whtRate: 3, whtAmount: 300, received: 9_700, pending: 0, type: 'Sponsored Post',
  status: 'done', paymentStatus: 'paid', creditTerm: 0, note: '', postDate: `${month}-02`, payDate: `${month}-02`, isPosted: true };
const versions = { cashflow_jobs: { [job.id]: 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
// A real 2×2 PNG, so the browser can decode and redraw it as the chat does.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGN4Fq8NRAwQCgArOgXBUA7+6wAAAABJRU5ErkJggg==', 'base64');

async function open(page: Page, { path, pro, settings = {} }: { path: string; pro: boolean; settings?: Record<string, unknown> }) {
  const uploads: Record<string, unknown>[] = [];
  const files: unknown[] = [];
  const snapshot = { jobs: [job], expenses: [], goals: [], invoices: [], statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }], job_types: ['Sponsored Post'],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', ...settings },
    notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
    avatar_data_url: null, issuer_profile: null };
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: pro ? { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } : null } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files } }));
  await page.route('**/api/vault-upload', async route => {
    const meta = JSON.parse(decodeURIComponent(route.request().headers()['x-vault-meta'] || '{}'));
    uploads.push(meta);
    const stored = { id: `f0000000-0000-4000-8000-00000000000${uploads.length}`, kind: meta.kind, jobId: meta.jobId ?? null, jobName: meta.jobName ?? null,
      client: meta.client ?? null, fileName: meta.fileName, mimeType: 'image/jpeg', sizeBytes: 900, createdAt: new Date().toISOString() };
    files.unshift(stored);
    await route.fulfill({ status: 201, json: { file: stored } });
  });
  await page.route('**/api/assistant', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } });
    const body = route.request().postDataJSON();
    if (body.action !== 'message') return route.fulfill({ json: {} });
    return route.fulfill({ json: {
      text: 'เห็นใบ 50 ทวิของงาน **รีวิวสินค้า** แล้วครับ กดแนบเข้าคลังเอกสารบนการ์ดเพื่อเก็บไว้กับงานนี้', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null,
      cards: [{ kind: 'attach', id: 'at_test-1', fileKind: 'wht50', fileName: body.attachment?.name ?? '', jobId: 'job-wht', jobName: 'รีวิวสินค้า', client: 'Brand A' }],
    } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path);
  return { uploads };
}

test('a 50 ทวิ sent in the chat: the card opens the vault window with the file and its job, and says when it is kept', async ({ page }) => {
  const { uploads } = await open(page, { path: '/assistant', pro: true });
  await expect(page.locator('#asx-message')).toBeVisible();
  await page.locator('.asx-composer input[type=file]').setInputFiles({ name: 'ใบ50ทวิ.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.asx-attach-tile img')).toBeVisible();
  await page.locator('#asx-message').fill('ใบ 50 ทวิ งานรีวิวสินค้า');
  await page.locator('.asx-send').click();

  const card = page.getByTestId('chat-attach-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('แนบเข้าคลังเอกสาร');
  await expect(card).toContainText('ใบ 50 ทวิ');
  await expect(card).toContainText('ใบ50ทวิ.jpg');
  await expect(card).toContainText('รีวิวสินค้า · Brand A');
  await expect(card).toContainText('รอแนบ');
  expect(await textOverlapIssues(page)).toEqual([]);

  await card.getByRole('button', { name: 'แนบเข้าคลังเอกสาร' }).click();
  const dialog = page.getByRole('dialog', { name: 'แนบใบ 50 ทวิ' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('รีวิวสินค้า');
  await expect(dialog).toContainText('ใบ50ทวิ.jpg');
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(dialog).toContainText('แนบเอกสารเรียบร้อยแล้ว');
  expect(uploads).toEqual([{ kind: 'wht50', jobId: 'job-wht', jobName: 'รีวิวสินค้า', client: 'Brand A', fileName: 'ใบ50ทวิ.jpg' }]);
  await dialog.getByRole('button', { name: 'เสร็จสิ้น' }).click();
  await expect(card).toContainText('แนบแล้ว');
  await expect(card).toContainText('เก็บไฟล์ไว้ในคลังเอกสารแล้ว');
  await expect(card.getByRole('button', { name: 'แนบเข้าคลังเอกสาร' })).toHaveCount(0);
});

test('free account: a fixed monthly cost takes a slip for its month, from the row menu, and shows it', async ({ page }) => {
  const { uploads } = await open(page, { path: '/incomeExpense', pro: false, settings: { fixedExpenseItems: [{ id: 'rent', name: 'ค่าห้อง', amount: 5000 }], monthlyExpense: 5000 } });
  await expect(page.getByText('ค่าห้อง').first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'ตัวเลือกของรายจ่าย ค่าห้อง' }).first().click();
  await page.getByRole('menuitem', { name: 'แนบสลิป / ใบเสร็จ' }).click();
  const dialog = page.getByRole('dialog', { name: 'แนบสลิป / ใบเสร็จ' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('ค่าห้อง ·');
  await page.getByTestId('vault-file-input').setInputFiles({ name: 'slip-rent.png', mimeType: 'image/png', buffer: PNG });
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(dialog).toContainText('แนบเอกสารเรียบร้อยแล้ว');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatchObject({ kind: 'expense', jobId: `fixed-rent@${month}` });
  expect(String(uploads[0].jobName)).toMatch(/^ค่าห้อง · /);
  await dialog.getByRole('button', { name: 'เสร็จสิ้น' }).click();
  // The row shows its paperclip, and its detail lists the slip.
  await expect(page.getByLabel(/มีสลิป 1 ไฟล์/).first()).toBeVisible();
  await page.getByRole('button', { name: 'ตัวเลือกของรายจ่าย ค่าห้อง' }).first().click();
  await page.getByRole('menuitem', { name: 'ดูรายละเอียด' }).click();
  await expect(page.getByTestId('expense-slips')).toContainText('slip-rent.png');
  expect(await textOverlapIssues(page)).toEqual([]);
});
