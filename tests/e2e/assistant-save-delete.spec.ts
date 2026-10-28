import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// Owner, 2026-10-28: (1) "บันทึกให้หน่อย" saves at once, and each saved card opens its job ("กดเข้าไปดูงานตรงนั้นได้ ...
// ไม่ใช่ว่าต้องไปเลื่อนหาเอง"); (2) deleting every job is one card and one go-ahead, no password; (3) several waiting
// cards are confirmed with one ยืนยันทั้งหมด. The backend is mocked; no AI is called.

test.use({ serviceWorkers: 'block' });

const user = { id: '22222222-2222-4222-8222-222222222222', email: 'save@example.test', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const job = (id: string, name: string, value: number) => ({ id, name, client: 'ลูกค้าตัวอย่าง', type: 'ยังไม่ระบุ', note: '', value, received: 0, pending: value, status: 'pending', paymentStatus: 'unpaid',
  creditTerm: 15, isPosted: false, postDate: '2026-10-28', payDate: '2026-11-12', whtRate: 0, whtAmount: 0 });
const snapshot = { jobs: [job('job-a', 'ตัดคลิปรีวิว', 2000), job('job-b', 'ออกแบบปก', 3500)], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [],
  notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: { 'job-a': 1, 'job-b': 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const P = (n: number) => `p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4${n}`;

type Plan = { subscription?: Record<string, unknown>; status?: Record<string, unknown>; path?: string };
async function open(page: Page, reply: (body: any) => { status?: number; json: unknown }, size = { width: 1440, height: 900 }, plan: Plan = {}) {
  const posts: any[] = [];
  let dataReads = 0;
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-2222222222', displayName: 'มายด์' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'GET') dataReads += 1;
    return route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: plan.subscription ?? { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: plan.status ?? { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } });
    const body = request.postDataJSON();
    posts.push(body);
    const answer = reply(body);
    return route.fulfill({ status: answer.status ?? 200, json: answer.json });
  });
  await page.setViewportSize(size);
  await page.goto(plan.path ?? '/assistant');
  if (!plan.path) await expect(page.locator('#asx-message')).toBeVisible();
  await loadLayoutFonts(page);
  return { posts, dataReads: () => dataReads };
}
const ask = async (page: Page, text: string) => { await page.locator('#asx-message').fill(text); await page.locator('.asx-send').click(); };
/** The job form shows this job's name in one of its fields. */
const formShows = (page: Page, name: string) => expect.poll(() => page.getByRole('dialog', { name: 'แก้ไขงาน' }).locator('input')
  .evaluateAll((fields, wanted) => fields.some(field => (field as HTMLInputElement).value === wanted), name)).toBe(true);

test('saved at once: every card says saved, the pages reload, and เปิดดูงาน opens that job\'s form', async ({ page }, info) => {
  const mock = await open(page, body => (body.action === 'message' ? { json: {
    text: 'บันทึกงานให้แล้ว 2 งานครับ กด "เปิดดูงาน" บนการ์ดเพื่อดูหรือแก้ไขรายละเอียดได้เลย', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null,
    cards: [
      { kind: 'confirm', id: P(1), title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'ตัดคลิปรีวิว' }, { label: 'มูลค่า', value: '฿2,000' }], status: 'applied', path: '/jobs?job=job-a' },
      { kind: 'confirm', id: P(2), title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'ออกแบบปก' }, { label: 'มูลค่า', value: '฿3,500' }], status: 'applied', path: '/jobs?job=job-b' },
    ] } } : { json: {} }));
  const before = mock.dataReads();
  await ask(page, 'บันทึกให้หน่อย งานตัดคลิปรีวิว 2,000 งานออกแบบปก 3,500');
  const cards = page.locator('.asx-rcard.is-confirm');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card).toContainText('บันทึกแล้ว');
    await expect(card.getByRole('button', { name: 'เปิดดูงาน' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'บันทึกงาน' })).toHaveCount(0);
  }
  // Nothing was confirmed by tapping.
  expect(mock.posts.filter(post => post.action === 'confirm')).toEqual([]);
  await expect.poll(() => mock.dataReads()).toBeGreaterThan(before);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('saved-at-once-1440.png') });
  await cards.nth(1).getByRole('button', { name: 'เปิดดูงาน' }).click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect(page.getByRole('dialog', { name: 'แก้ไขงาน' })).toBeVisible();
  await formShows(page, 'ออกแบบปก');
  await page.screenshot({ path: info.outputPath('saved-job-opened-1440.png') });
});

test('a card confirmed by tapping also opens its job', async ({ page }) => {
  await open(page, body => body.action === 'message' ? { json: { text: 'เตรียมการ์ดไว้แล้วครับ', route: 'action', tokens: 2, tokensLeft: 992, trialLeft: null,
    cards: [{ kind: 'confirm', id: P(3), title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'ตัดคลิปรีวิว' }] }] } }
    : body.action === 'confirm' ? { json: { status: 'applied', kind: 'add_job', jobId: 'job-a', path: '/jobs?job=job-a' } } : { json: {} });
  await ask(page, 'เพิ่มงานตัดคลิปรีวิว 2,000');
  const card = page.locator('.asx-rcard.is-confirm');
  await card.getByRole('button', { name: 'บันทึกงาน' }).click();
  await card.getByRole('button', { name: 'เปิดดูงาน' }).click();
  await formShows(page, 'ตัดคลิปรีวิว');
});

const deleteAll = { kind: 'confirm', id: P(4), title: 'ลบงานทั้งหมด 2 งาน', changes: [
  { label: 'จำนวนงาน', value: '2 งาน' }, { label: 'มูลค่ารวม', value: '฿5,500' },
  { label: 'ผลกระทบ', value: 'งานทั้งหมดจะหายจากรายการ รายงาน และเงินค้างรับ ส่วนเอกสารและรายจ่ายยังอยู่' },
] };
for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`delete all (${size.width}px): one card, one go-ahead, no password`, async ({ page }, info) => {
    const mock = await open(page, body => {
      if (body.action === 'message') return { json: { text: 'เตรียมการ์ดลบงานทั้งหมดไว้แล้วครับ กดลบงานทั้งหมดบนการ์ดเพื่อยืนยัน', route: 'action', tokens: 3, tokensLeft: 991, trialLeft: null, cards: [deleteAll] } };
      if (body.action === 'confirm') return { json: { status: 'applied', kind: 'delete_job', allJobs: true, count: 2, path: '/jobs' } };
      return { json: {} };
    }, size);
    await ask(page, 'ลบโปรเจกต์ทั้งหมดเลย');
    const card = page.locator('.asx-rcard.is-confirm');
    await expect(card).toContainText('ลบงานทั้งหมด 2 งาน');
    await expect(card.locator('input[type="password"]')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'แก้ไข' })).toHaveCount(0);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`delete-all-card-${size.width}.png`) });
    await card.getByRole('button', { name: 'ลบงานทั้งหมด' }).click();
    await expect(card).toContainText('บันทึกแล้ว');
    await expect(card.getByRole('button', { name: 'ไปที่หน้างาน' })).toBeVisible();
    expect(mock.posts.filter(post => post.action === 'confirm')).toEqual([{ action: 'confirm', proposalId: P(4) }]);
  });
}

test('several cards waiting: ยืนยันทั้งหมด confirms each one, then goes away', async ({ page }, info) => {
  const payment = (n: number, name: string) => ({ kind: 'confirm', id: P(5 + n), title: 'บันทึกรับเงินครบ', changes: [{ label: 'งาน', value: name }, { label: 'ยอดรับ', value: '฿1,000' }] });
  const mock = await open(page, body => {
    if (body.action === 'message') return { json: { text: 'เตรียมการ์ดรับเงินไว้ 3 ใบครับ', route: 'action', tokens: 3, tokensLeft: 991, trialLeft: null,
      cards: [payment(0, 'ตัดคลิปรีวิว'), payment(1, 'ออกแบบปก'), payment(2, 'ถ่ายรูปสินค้า')] } };
    if (body.action === 'confirm') return { json: { status: 'applied', kind: 'record_payment', jobId: 'job-a', path: '/jobs?job=job-a' } };
    return { json: {} };
  });
  await ask(page, 'งานที่รอรับเงินได้รับครบแล้ว');
  const all = page.getByRole('button', { name: 'ยืนยันทั้งหมด 3 รายการ' });
  await expect(all).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('confirm-all-1440.png') });
  await all.click();
  await expect(page.locator('.asx-rcard.is-confirm', { hasText: 'บันทึกแล้ว' })).toHaveCount(3);
  await expect(all).toHaveCount(0);
  expect(mock.posts.filter(post => post.action === 'confirm').map(post => post.proposalId).sort()).toEqual([P(5), P(6), P(7)].sort());
});

test('Pro ended: เลขา still answers with the tokens left, says so, and the floating window stays', async ({ page }, info) => {
  const ended = { subscription: { status: 'canceled', plan: 'pro_monthly', current_period_end: '2026-10-01T00:00:00Z' },
    status: { enabled: true, plan: 'lapsed', tokensLeft: 500, trialLeft: null, resetsAt: null, tokenLimit: 1650, requestLimit: null } };
  const mock = await open(page, body => (body.action === 'message' ? { json: { text: 'สวัสดีครับ คุณมายด์', route: 'chat', tokens: 2, tokensLeft: 498, trialLeft: null, cards: [] } } : { json: {} }), undefined, ended);
  await expect(page.locator('.asx-hint')).toHaveText('Pro หมดอายุแล้ว ใช้โทเคนที่เหลือได้จนหมด ต่ออายุ Pro เพื่อรับโทเคนใหม่');
  await expect(page.locator('.asx-token')).toContainText('500');
  await ask(page, 'สวัสดี');
  await expect(page.getByText('สวัสดีครับ คุณมายด์')).toBeVisible();
  expect(mock.posts.filter(post => post.action === 'message')).toHaveLength(1);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('pro-ended-chat-1440.png') });
  // Elsewhere in the app the floating เลขา is still there while tokens are left.
  await page.goto('/jobs');
  await expect(page.locator('.asx-buddy')).toBeVisible();
});

test('typing ยืนยันทั้งหมด confirms every waiting card here and never asks again', async ({ page }) => {
  const expense = (n: number, name: string) => ({ kind: 'confirm', id: P(8 + n), title: 'ลบรายจ่าย', changes: [{ label: 'รายการ', value: name }, { label: 'ยอดที่จะลบ', value: '฿60' }] });
  const mock = await open(page, body => {
    if (body.action === 'message') return { json: { text: 'เตรียมการ์ดลบรายจ่ายไว้ 2 ใบครับ ต้องการแก้อะไรไหมครับ?', route: 'action', tokens: 3, tokensLeft: 991, trialLeft: null, cards: [expense(0, 'ร้านสมาน'), expense(1, 'ค่ากาแฟ')] } };
    if (body.action === 'confirm') return { json: { status: 'applied', kind: 'delete_expense', recordId: 'e', path: '/incomeExpense' } };
    return { json: {} };
  });
  await ask(page, 'ลบรายจ่ายร้านสมานกับค่ากาแฟ');
  await expect(page.locator('.asx-rcard.is-confirm')).toHaveCount(2);
  await ask(page, 'ยืนยันทั้งหมด');
  await expect(page.locator('.asx-rcard.is-confirm', { hasText: 'บันทึกแล้ว' })).toHaveCount(2);
  await expect(page.getByText('มีหลายรายการที่รอยืนยัน')).toHaveCount(0);
  expect(mock.posts.filter(post => post.action === 'confirm').map(post => post.proposalId).sort()).toEqual([P(8), P(9)].sort());
  expect(mock.posts.filter(post => post.action === 'message')).toHaveLength(1);
});
