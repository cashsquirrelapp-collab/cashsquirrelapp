import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { CONSENT_VERSIONS } from '../../shared/consents';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// Consent before sensitive data (owner, 2026-11-05): the terms once before the app, เลขากระรอก's card before the first
// message, the LINE consent before the code, and Settings › ความยินยอม. The backend is mocked; nothing is sent anywhere.

test.use({ serviceWorkers: 'block' });

const user = { adminLevel: 'owner' as const, id: '11111111-1111-4111-8111-111111111111', email: 'consent@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], jobTypes: [], notifSettings: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const at = '2026-11-05T03:00:00.000Z';

type Setup = {
  /** What this device remembers for the account (the e2e default is everything agreed). */
  cached: Partial<Record<keyof typeof CONSENT_VERSIONS, string>>;
  /** What the server holds. */
  server: Record<string, unknown>;
  width?: number; height?: number; path?: string;
  reply?: (body: any) => { status: number; json: unknown };
};
async function open(page: Page, setup: Setup) {
  const consentPosts: any[] = [];
  const otherPosts: { url: string; body: any }[] = [];
  let server = { ...setup.server };
  await page.addInitScript(([id, cached]) => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id as string]: cached }));
    localStorage.setItem(`krarok.fileNotice.${id}`, '1');
  }, [user.id, setup.cached] as const);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.route('**/api/consent', route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { consents: server, versions: CONSENT_VERSIONS } });
    const body = request.postDataJSON();
    consentPosts.push(body);
    server = body.accepted ? { ...server, [body.key]: { version: body.version, at } } : { ...server, [body.key]: { ...(server[body.key] as object), withdrawnAt: at } };
    return route.fulfill({ json: { consents: server, versions: CONSENT_VERSIONS } });
  });
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } });
    const body = request.postDataJSON();
    otherPosts.push({ url: request.url(), body });
    if (setup.reply) { const reply = setup.reply(body); return route.fulfill({ status: reply.status, json: reply.json }); }
    return route.fulfill({ json: { text: 'คำตอบทดสอบ', route: 'chat', tokens: 1, tokensLeft: 993, trialLeft: null, cards: [] } });
  });
  await page.route('**/api/line-link-code', route => { otherPosts.push({ url: route.request().url(), body: route.request().postDataJSON() }); return route.fulfill({ json: { code: 'A1B2C3D4E5F60718', expiresAt: new Date(Date.now() + 300_000).toISOString() } }); });
  await page.setViewportSize({ width: setup.width ?? 1440, height: setup.height ?? 900 });
  await page.goto(setup.path ?? '/');
  await loadLayoutFonts(page);
  return { consentPosts, otherPosts };
}
const all = { ...CONSENT_VERSIONS };
const record = (key: keyof typeof CONSENT_VERSIONS) => ({ [key]: { version: CONSENT_VERSIONS[key], at } });

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`terms: asked once before the app on the ${device.name}; both ticks, then the agreement is kept with its version`, async ({ page }) => {
    const mock = await open(page, { cached: {}, server: {}, width: device.width, height: device.height });
    const gate = page.getByTestId('terms-gate');
    await expect(gate).toBeVisible();
    await expect(gate.getByRole('dialog', { name: 'ข้อตกลงก่อนใช้งาน' })).toBeVisible();
    const accept = gate.getByTestId('terms-gate-accept');
    await expect(accept).toBeDisabled();
    await gate.getByTestId('terms-gate-terms').check();
    await expect(accept).toBeDisabled();
    await gate.getByTestId('terms-gate-clients').check();
    await expect(gate.getByRole('link', { name: 'ข้อกำหนดการใช้งาน' })).toHaveAttribute('href', '/terms');
    await expect(gate.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy');
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/consent-terms-${device.name}.png` });
    await accept.click();
    await expect(gate).toBeHidden();
    expect(mock.consentPosts).toEqual([{ key: 'terms', accepted: true, version: CONSENT_VERSIONS.terms }]);
    // The next visit knows at once; nothing is asked again.
    await page.reload();
    await expect(page.getByRole('button', { name: 'ข้ามไปเนื้อหา' })).toBeAttached();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('terms-gate')).toHaveCount(0);
    expect(mock.consentPosts).toHaveLength(1);
  });
}

test('terms: the server\'s record counts on a new device, and an agreement whose save failed is sent again', async ({ page }) => {
  const mock = await open(page, { cached: {}, server: record('terms') });
  await expect(page.getByRole('button', { name: 'ข้ามไปเนื้อหา' })).toBeAttached();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('terms-gate')).toHaveCount(0);
  expect(mock.consentPosts).toEqual([]);

  const other = await page.context().newPage();
  const second = await open(other, { cached: { terms: CONSENT_VERSIONS.terms }, server: {} });
  await expect(other.getByRole('button', { name: 'ข้ามไปเนื้อหา' })).toBeAttached();
  await expect.poll(() => second.consentPosts).toEqual([{ key: 'terms', accepted: true, version: CONSENT_VERSIONS.terms }]);
  await expect(other.getByTestId('terms-gate')).toHaveCount(0);
});

test('เลขา: the consent card takes the place of the box until agreed; nothing reaches the assistant before', async ({ page }) => {
  const mock = await open(page, { cached: { terms: CONSENT_VERSIONS.terms }, server: record('terms'), path: '/assistant' });
  const card = page.getByTestId('ai-consent');
  await expect(card).toBeVisible();
  await expect(page.locator('#asx-message')).toHaveCount(0);
  await expect(card).toContainText('เลขาตอบผิดได้บ้าง');
  await expect(card).toContainText('ไม่ใช่คำปรึกษาทางภาษี บัญชี หรือกฎหมาย');
  await expect(card).toContainText('ไม่ถูกนำไปฝึก AI');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/consent-ai-computer.png' });
  expect(mock.otherPosts.filter(post => post.body?.action === 'message')).toEqual([]);
  await card.getByTestId('ai-consent-ok').click();
  await expect(card).toBeHidden();
  expect(mock.consentPosts).toEqual([{ key: 'ai', accepted: true, version: CONSENT_VERSIONS.ai }]);
  await expect(page.locator('#asx-message')).toBeVisible();
  await expect(page.locator('.asx-hint')).toHaveText('เลขาตอบผิดได้บ้าง โปรดตรวจก่อนกดยืนยัน · คำตอบเป็นข้อมูลประกอบ ไม่ใช่คำปรึกษาทางภาษี บัญชี หรือกฎหมาย');
});

test('เลขา on a phone: the same card, drawn for the phone', async ({ page }) => {
  await open(page, { cached: { terms: CONSENT_VERSIONS.terms }, server: record('terms'), path: '/assistant', width: 390, height: 844 });
  const card = page.getByTestId('ai-consent');
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/consent-ai-phone.png' });
});

test('เลขา: when the server says the agreement is missing (withdrawn elsewhere), the card comes back', async ({ page }) => {
  await open(page, { cached: all, server: { ...record('terms'), ...record('ai') }, path: '/assistant',
    reply: body => (body.action === 'message' ? { status: 428, json: { error: 'กรุณาอ่านและกดยินยอมการใช้เลขากระรอกก่อน', code: 'ai_consent_required' } } : { status: 200, json: {} }) });
  await page.locator('#asx-message').fill('สรุปเดือนนี้');
  await page.locator('.asx-send').click();
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  await expect(page.locator('.asx-msg.is-bot').last()).toContainText('กรุณาอ่านและกดยินยอมการใช้เลขากระรอกก่อน');
});

test('Settings › ความยินยอม lists what was agreed with its date; เลขา can be withdrawn there', async ({ page }) => {
  const mock = await open(page, { cached: { terms: CONSENT_VERSIONS.terms, ai: CONSENT_VERSIONS.ai }, server: { ...record('terms'), ...record('ai') }, path: '/settings' });
  await page.getByRole('button', { name: /^ความยินยอม/ }).click();
  const rows = page.getByTestId('consent-row');
  await expect(rows.first()).toContainText('ยอมรับแล้ว');
  await expect(rows.nth(1)).toContainText('ยินยอมแล้ว');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/consent-settings-computer.png' });
  await page.getByTestId('consent-withdraw-ai').click();
  const confirm = page.getByRole('dialog', { name: 'ถอนความยินยอมการใช้เลขากระรอก' });
  await confirm.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect.poll(() => mock.consentPosts).toEqual([{ key: 'ai', accepted: false }]);
  await expect(rows.nth(1)).toContainText('ยังไม่ได้ยินยอม');
});

test('LINE: pressing ยืนยัน in the connect dialog records the consent before the code is made', async ({ page }) => {
  const mock = await open(page, { cached: { terms: CONSENT_VERSIONS.terms, ai: CONSENT_VERSIONS.ai }, server: { ...record('terms'), ...record('ai') }, path: '/settings' });
  await page.getByRole('button', { name: /^LINE/ }).first().click();
  await page.getByRole('button', { name: 'เชื่อมต่อ LINE', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'ยินยอมการเชื่อมต่อ LINE' });
  await expect(confirm).toContainText('ถอนความยินยอมได้ทุกเมื่อด้วยการยกเลิกการเชื่อมต่อ');
  await confirm.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect(page.getByText('A1B2C3D4E5F60718')).toBeVisible();
  expect(mock.consentPosts).toEqual([{ key: 'line', accepted: true, version: CONSENT_VERSIONS.line }]);
  expect(mock.otherPosts.filter(post => post.url.endsWith('/api/line-link-code'))).toHaveLength(1);
});

test('short privacy lines sit beside client details, the issuer\'s details and the vault upload', async ({ page }) => {
  await open(page, { cached: all, server: { ...record('terms'), ...record('ai') }, path: '/settings' });
  await page.getByRole('button', { name: /^โปรไฟล์ธุรกิจ/ }).click();
  await expect(page.getByText('ลูกค้าที่ได้รับเอกสารจะเห็นข้อมูลนี้')).toBeVisible();
  await expect(page.getByText('ลูกค้าที่ได้รับเอกสารจะเห็นเลขบัญชีนี้')).toBeVisible();
  // The new lines only (the A4 preview beside them is its own drawing).
  expect((await textOverlapIssues(page)).filter(issue => [issue.a, issue.b].some(text => text?.includes('ลูกค้าที่ได้รับเอกสาร')))).toEqual([]);
});

test('the floating เลขา window shows the same card in place of its box (computers)', async ({ page }) => {
  await open(page, { cached: { terms: CONSENT_VERSIONS.terms }, server: record('terms'), path: '/jobs?radar=0' });
  await page.locator('.asx-buddy-btn').click();
  const win = page.locator('.kfw');
  await expect(win.getByTestId('ai-consent')).toBeVisible();
  await expect(win.locator('#asx-message')).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/consent-ai-window.png' });
});

test('the import window reads the file by its own rules and offers the consent in place of the box', async ({ page }) => {
  const mock = await open(page, { cached: { terms: CONSENT_VERSIONS.terms }, server: record('terms'), path: '/jobs?radar=0' });
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['วันที่', 'ชื่องาน', 'ลูกค้า', 'ราคา', 'ช่องทางพิเศษ'], ['15/10/2567', 'รีวิวสินค้า', 'แบรนด์ A', 12000, 'TikTok']]), 'งาน');
  await chat.locator('#import-sheet-file').setInputFiles({ name: 'งาน.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })) });
  const offer = chat.getByTestId('import-ai-consent');
  await expect(offer).toBeVisible();
  await expect(chat.locator('#import-chat-input')).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/consent-import.png' });
  expect(mock.otherPosts.filter(post => post.body?.action === 'map-columns' || post.body?.action === 'import-chat'), 'nothing goes to เลขา before the agreement').toEqual([]);
  await offer.getByRole('button', { name: 'อ่านและยินยอม' }).click();
  await chat.getByTestId('ai-consent-ok').click();
  await expect(chat.locator('#import-chat-input')).toBeVisible();
  await expect.poll(() => mock.otherPosts.filter(post => post.body?.action === 'map-columns').length, { message: 'after agreeing, เลขา reads the column names' }).toBeGreaterThan(0);
});
