import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';
import { buildXlsx } from '../../shared/xlsxWriter';

// ฟีเจอร์ทดลอง, phase 2 (owner, 2026-11-12): Settings › ฟีเจอร์ทดลอง › เชื่อม Google Sheets. Connect (Google's sign-in comes
// back to /settings?google=connected), pick a sheet in Google's picker (a stand-in script here), see the sheet map on
// the real table with formula columns marked, save it, read the overview, make the bookkeeping workbook straight into
// Google Drive, and disconnect. Computer and phone, no overlapping text. Google itself is never reached.

test.use({ serviceWorkers: 'block' });

const user = { id: '44444444-4444-4444-8444-444444444444', email: 'tester3@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const business = { version: 'biz-v1', entity: 'individual', vat: 'no', work: 'coach', income: 'per_job', pays: [], revenue: 'under_1m', updated_at: '2026-11-12T03:00:00.000Z' };
const baseSettings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' }, business };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const FILE = { id: 'file-12345678', name: 'บัญชีร้าน 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
const cell = (text: string, extra: Record<string, unknown> = {}) => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text, text, ...extra });
const TABS = [
  { name: 'รายรับ', truncated: false, rows: [
    [cell('วันที่'), cell('ลูกค้า'), cell('รายละเอียด'), cell('ยอดเงิน'), cell('สถานะ'), cell('หัก ณ ที่จ่าย')],
    [cell('3/10/2569', { date: '2026-10-03' }), cell('บริษัท ก'), cell('ถ่ายรูปสินค้า'), cell('10,000'), cell('ได้รับเงินแล้ว'), cell('300', { formula: true })],
    [cell('20/10/2569', { date: '2026-10-20' }), cell('บริษัท ข'), cell('ตัดต่อวิดีโอ'), cell('5,000'), cell('ยังไม่จ่าย'), cell('150', { formula: true })],
  ] },
  { name: 'รายจ่าย', truncated: false, rows: [
    [cell('วันที่'), cell('รายการ'), cell('หมวดหมู่'), cell('ยอดเงิน')],
    [cell('5/10/2569', { date: '2026-10-05' }), cell('ค่าเช่ากล้อง'), cell('อุปกรณ์'), cell('1,200')],
  ] },
];

// Google's picker, as a stand-in: it "picks" the file at once.
const FAKE_PICKER = `window.gapi = { load: function (name, options) {
  window.google = window.google || {};
  function View() {} View.prototype.setMimeTypes = function () { return this; }; View.prototype.setMode = function () { return this; }; View.prototype.setIncludeFolders = function () { return this; };
  function Builder() {} ['addView','setDeveloperKey','setAppId','setLocale','setTitle'].forEach(function (m) { Builder.prototype[m] = function () { return this; }; });
  Builder.prototype.setOAuthToken = function (t) { window.__pickerToken = t; return this; };
  Builder.prototype.setCallback = function (cb) { this.cb = cb; return this; };
  Builder.prototype.build = function () { var cb = this.cb; return { setVisible: function () { var meta = document.querySelector('meta[name="referrer"]'); window.__referrerAtPick = meta ? meta.content : 'none'; setTimeout(function () { cb({ action: 'picked', docs: [{ id: '${FILE.id}', name: '${FILE.name}' }] }); }, 30); }, dispose: function () {} }; };
  window.google.picker = { ViewId: { SPREADSHEETS: 's' }, DocsViewMode: { LIST: 'l' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id', NAME: 'name' }, DocsView: View, PickerBuilder: Builder };
  options.callback();
} };`;

async function open(page: Page, size: { width: number; height: number }, start: { connected: boolean; file?: boolean; labsOn?: string[]; tabs?: typeof TABS } = { connected: false }) {
  const google = { connected: start.connected, file: start.file ? FILE : null as typeof FILE | null, map: null as unknown };
  const posts: Record<string, unknown>[] = [];
  const status = () => ({ google: { configured: true, connected: google.connected, ...(google.connected ? { email: 'shop@example.com' } : {}), file: google.file, map: google.map } });
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00+07:00'));
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('https://apis.google.com/js/api.js', route => route.fulfill({ contentType: 'text/javascript', body: FAKE_PICKER }));
  const bodies: string[] = [];
  await page.route('**/api/**', route => { bodies.push(route.request().postData() ?? ''); return route.fulfill({ json: {} }); });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-4444444444', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { bodies.push(route.request().postData() ?? ''); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings: baseSettings, statuses: [], jobTypes: [], notifSettings: {} }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: start.labsOn ?? ['sheets', 'sheetMap', 'templates'] } } }));
  await page.route('**/api/google', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: status() });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    bodies.push(route.request().postData() ?? '');
    // Google's sign-in and the callback are skipped: the account is connected when the page comes back.
    if (body.action === 'start') { const reply = { ...status(), url: `${new URL(page.url()).origin}/settings?google=connected` }; google.connected = true; return route.fulfill({ json: reply }); }
    if (body.action === 'token') return route.fulfill({ json: { token: 'ya29.test', expiresIn: 3600, apiKey: 'picker-key', appId: '875278739350' } });
    if (body.action === 'pick') { google.file = { ...FILE }; google.map = null; return route.fulfill({ json: status() }); }
    if (body.action === 'read') return route.fulfill({ json: { ...status(), tabs: start.tabs ?? TABS, readAt: '2026-11-12T03:00:00.000Z' } });
    if (body.action === 'saveMap') { google.map = body.map; return route.fulfill({ json: status() }); }
    if (body.action === 'createTemplate') { google.file = { id: 'new-file-123456', name: String(body.name), url: 'https://docs.google.com/spreadsheets/d/new-file-123456/edit' }; google.map = null; return route.fulfill({ json: { ...status(), created: true } }); }
    if (body.action === 'forget') { google.file = null; google.map = null; return route.fulfill({ json: status() }); }
    if (body.action === 'disconnect') { google.connected = false; google.file = null; google.map = null; return route.fulfill({ json: status() }); }
    return route.fulfill({ status: 400, json: { error: 'bad' } });
  });
  await page.setViewportSize(size);
  await page.goto('/settings');
  await loadLayoutFonts(page);
  return { posts, google, bodies };
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ }).click();
  await page.getByTestId('lab-open-sheets').click();
  const panel = page.getByTestId('sheets-panel');
  await expect(panel).toBeVisible();
  return panel;
}

const ODD_TABS = [{ name: 'Income', truncated: false, rows: [
  [cell('วันที่โอน'), cell('Client'), cell('งาน'), cell('ค่าจ้าง (ก่อนหัก)'), cell('ภาษี 3%'), cell('โอนจริง'), cell('ZZ')],
  [cell('2/11/2569', { date: '2026-11-02' }), cell('บริษัท โกลว์อัพ จำกัด'), cell('ที่ปรึกษาคอนเทนต์'), cell('20,000'), cell('600', { formula: true }), cell('19,400', { formula: true }), cell('1/11/2569', { date: '2026-11-01' })],
  [cell('5/11/2569', { date: '2026-11-05' }), cell('คาเฟ่ลูมิน'), cell('ออกแบบโลโก้'), cell('5,000'), cell('0', { formula: true }), cell('5,000', { formula: true }), cell('3/11/2569', { date: '2026-11-03' })],
] }];

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`a sheet with other columns on the ${device.name}: the window hands over, เลขา asks in its chat, one tap at a time, then saves`, async ({ page }) => {
    const { posts, bodies } = await open(page, device, { connected: true, file: true, tabs: ODD_TABS });
    const panel = await openPanel(page);
    // The window only says the question waits in เลขา's chat (owner, 2026-11-14: "ย้ายคำถามไปขึ้นในหน้าแชทเลขาเลย").
    const handoff = panel.getByTestId('sheet-ask-handoff');
    await expect(handoff).toContainText(`อ่านชีต ${FILE.name} แล้วครับ`);
    await expect(handoff).toContainText('มีคำถามข้อเดียว ไปตอบในแชทเลขาได้เลยครับ');
    await expect(panel.getByTestId('sheets-save-map')).toHaveCount(0);
    await page.waitForFunction(() => { const dialog = document.querySelector('[role="dialog"]'); return Boolean(dialog && getComputedStyle(dialog).opacity === '1' && getComputedStyle(dialog.parentElement!).opacity === '1'); });
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-sheets-handoff-${device.name}.png` });
    await handoff.getByTestId('sheet-ask-in-chat').click();

    await page.waitForURL(/\/assistant/);
    await expect(page.getByTestId('sheets-panel')).toHaveCount(0);
    const thread = page.getByRole('log', { name: 'บทสนทนากับเลขากระรอก' });
    await expect(thread).toContainText(`อ่านชีต ${FILE.name} แล้วครับ เข้าใจเกือบหมด`);
    await expect(thread).toContainText('แท็บ Income เป็นงานและรายรับ');
    await expect(thread).toContainText('ช่อง ภาษี 3% กับ โอนจริง ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้');
    await expect(thread).toContainText('ขอถามข้อเดียวครับ');
    const card = thread.getByTestId('sheet-ask-card');
    await expect(card).toContainText('ช่อง "ZZ" คือวันที่ ใช่ไหมครับ');
    // Real data read from the sheet, whatever the chat's connection: never labelled as a sample answer.
    await expect(thread.locator('.asx-msg.is-bot').filter({ hasText: 'อ่านชีต' })).not.toContainText('คำตอบตัวอย่าง');
    await page.evaluate(() => document.fonts.ready);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-sheets-ask-${device.name}.png` });

    await card.getByRole('radio', { name: 'ไม่ใช่' }).click();
    const choose = thread.getByTestId('sheet-ask-card').last();
    await expect(choose).toContainText('แล้วช่อง "ZZ" คืออะไรครับ');
    await choose.getByRole('radio', { name: 'ไม่ใช้' }).click();
    // The last answer saves the map, with the answer in it.
    await expect(thread).toContainText('บันทึกแล้วครับ เลขาจะอ่านชีตนี้ตามนี้');
    const saved = posts.find(post => post.action === 'saveMap')?.map as { tabs: { columns: { index: number; target: string; formula?: boolean }[] }[] };
    expect(saved.tabs[0].columns.find(column => column.index === 6)?.target).toBe('ignore');
    expect(saved.tabs[0].columns.find(column => column.index === 5)?.formula).toBe(true);
    // Rule-based, on this device: nothing of it went to the AI.
    expect(bodies.some(body => body.includes('"action":"message"'))).toBe(false);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-sheets-asked-${device.name}.png` });
  });
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`Google Sheets on the ${device.name}: connect, pick, the sheet map on the real table, save, overview`, async ({ page }) => {
    const { posts } = await open(page, device);
    let panel = await openPanel(page);
    await expect(panel).toContainText('เข้าถึงเฉพาะไฟล์ที่คุณเลือกเอง');
    expect(await textOverlapIssues(page)).toEqual([]);
    await panel.getByRole('button', { name: 'เชื่อมบัญชี Google' }).click();
    // Google's sign-in (skipped here) comes back to /settings?google=connected: the panel opens by itself, once.
    await page.waitForURL(/\/settings/);
    panel = page.getByTestId('sheets-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('status')).toContainText('เชื่อม Google แล้ว');
    await expect(panel).toContainText('เชื่อมกับ shop@example.com');
    await expect.poll(() => page.url()).not.toContain('google=');

    await panel.getByTestId('sheets-pick').click();
    // Picked and not mapped yet: straight to เลขา's chat, no button to press (owner, 2026-11-14).
    await page.waitForURL(/\/assistant/);
    await expect(page.getByTestId('sheets-panel')).toHaveCount(0);
    await expect(page.getByRole('log', { name: 'บทสนทนากับเลขากระรอก' })).toContainText(`อ่านชีต ${FILE.name} แล้วครับ`);
    expect(posts.find(post => post.action === 'pick')).toEqual({ action: 'pick', fileId: FILE.id });
    expect(await page.evaluate(() => (window as unknown as { __pickerToken?: string }).__pickerToken)).toBe('ya29.test');
    // Google checks the picker key against the site's address: the origin is sent only while the picker is open.
    expect(await page.evaluate(() => (window as unknown as { __referrerAtPick?: string }).__referrerAtPick)).toBe('strict-origin');
    expect(await page.evaluate(() => document.querySelector<HTMLMetaElement>('meta[name="referrer"]')?.content)).toBe('no-referrer');

    // Back in Settings with the sheet still not mapped: the window offers the chat again; the full table is one tap away.
    await page.goBack();
    await page.waitForURL(/\/settings/);
    panel = await openPanel(page);
    await expect(panel).toContainText(FILE.name);
    const setup = panel.getByTestId('sheet-ask-handoff');
    await expect(setup).toContainText(`อ่านชีต ${FILE.name} แล้วครับ`);
    await expect(setup.getByTestId('sheet-ask-in-chat')).toBeVisible();
    await expect(panel.getByTestId('sheets-save-map')).toHaveCount(0);
    await setup.getByRole('button', { name: 'ดูทั้งตาราง' }).click();
    const table = device.name === 'phone' ? panel.getByTestId('sheet-map-list') : panel.getByTestId('sheet-map-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('สูตร ห้ามเขียนทับ');
    await expect(table).toContainText(device.name === 'phone' ? 'ยอดเงิน' : 'ถ่ายรูปสินค้า');
    await table.getByRole('combobox', { name: 'คอลัมน์ C คือ' }).selectOption('note');
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-sheets-map-${device.name}.png` });

    await panel.getByTestId('sheets-save-map').click();
    await expect(panel.getByRole('status')).toContainText('บันทึกแผนที่ชีตแล้ว');
    const saved = posts.find(post => post.action === 'saveMap')?.map as { fileId: string; tabs: { name: string; columns: { index: number; target: string; formula?: boolean }[] }[] };
    expect(saved.fileId).toBe(FILE.id);
    expect(saved.tabs.map(tab => tab.name)).toEqual(['รายรับ', 'รายจ่าย']);
    expect(saved.tabs[0].columns.find(column => column.index === 2)?.target).toBe('note');
    expect(saved.tabs[0].columns.find(column => column.index === 5)?.formula).toBe(true);
    await expect(panel.getByTestId('sheets-save-map')).toHaveText('บันทึกแล้ว');

    await panel.getByRole('tab', { name: 'ภาพรวม' }).click();
    const overview = panel.getByTestId('sheet-overview');
    await expect(overview).toContainText('รายจ่าย');
    await expect(overview).toContainText('1,200');
    await expect(overview).toContainText('ปี 2569');
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-sheets-overview-${device.name}.png` });

    await panel.getByRole('button', { name: 'ยกเลิกการเชื่อม Google' }).click();
    await expect(panel.getByRole('status')).toContainText('ยกเลิกการเชื่อม Google แล้ว');
    await expect(panel.getByRole('button', { name: 'เชื่อมบัญชี Google' })).toBeVisible();
    expect(posts.at(-1)).toEqual({ action: 'disconnect' });
  });
}

test('the bookkeeping workbook goes straight into Google Drive and becomes the sheet that is read', async ({ page }) => {
  const { posts } = await open(page, { width: 1440, height: 900 }, { connected: true });
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: /สร้างชีตใหม่/ }).click();
  const dialog = page.getByTestId('template-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('template-drive').click();
  await expect(dialog.getByRole('status')).toContainText('สร้างใน Google Drive แล้ว');
  const created = posts.find(post => post.action === 'createTemplate')!;
  expect(String(created.name)).toMatch(/^ชีตบัญชี_/);
  expect(String(created.xlsx).startsWith('UEsD')).toBe(true);
  expect(await textOverlapIssues(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'ดูแผนที่ชีต' }).click();
  await expect(page.getByTestId('sheets-panel')).toContainText('ชีตบัญชี_');
});

test('Google refused or a server without its Google keys: the panel says so plainly', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, { connected: true, file: true });
  await page.route('**/api/google', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { google: { configured: true, connected: true, email: 'shop@example.com', file: FILE, map: null } } })
    : route.fulfill({ status: 409, json: { error: 'การเชื่อม Google หมดอายุหรือถูกยกเลิก กรุณาเชื่อมใหม่' } }));
  const panel = await openPanel(page);
  await expect(panel.getByRole('alert')).toContainText('การเชื่อม Google หมดอายุหรือถูกยกเลิก');
  await page.keyboard.press('Escape');
  await page.route('**/api/google', route => route.fulfill({ json: { google: { configured: false, connected: false, file: null, map: null } } }));
  await page.getByTestId('lab-open-sheets').click();
  await expect(page.getByTestId('sheets-panel')).toContainText('ระบบเชื่อม Google ยังไม่พร้อม');
});

// เชื่อมไฟล์ Excel (owner, 2026-11-12: "อยากให้สามารถเชื่อมกับ Excel ได้ด้วย"): an Excel file on the device, read there.
const WORKBOOK = Buffer.from(buildXlsx([
  { name: 'รายรับ', rows: [
    ['วันที่', 'ลูกค้า', 'รายละเอียด', 'ยอดเงิน', 'สถานะ', 'หัก ณ ที่จ่าย'],
    [{ date: '2026-10-03' }, 'บริษัท ก', 'ถ่ายรูปสินค้า', 10000, 'ได้รับเงินแล้ว', { f: 'D2*3%' }],
    [{ date: '2026-10-20' }, 'บริษัท ข', 'ตัดต่อวิดีโอ', 5000, 'ยังไม่จ่าย', { f: 'D3*3%' }],
  ] },
  { name: 'รายจ่าย', rows: [['วันที่', 'รายการ', 'หมวดหมู่', 'ยอดเงิน'], [{ date: '2026-10-05' }, 'ค่าเช่ากล้อง', 'อุปกรณ์', 1200]] },
]));
const EXCEL_FILE = { name: 'บัญชีร้าน ต.ค.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: WORKBOOK };

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`an Excel file on the ${device.name}: read on the device, the sheet map, kept on the device, the overview`, async ({ page }) => {
    const { bodies } = await open(page, device, { connected: false, labsOn: ['sheets', 'excel', 'sheetMap', 'templates'] });
    await page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ }).click();
    await page.getByTestId('lab-open-excel').click();
    const panel = page.getByTestId('sheets-panel');
    await expect(panel.getByRole('tab', { name: 'ไฟล์ Excel' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toContainText('อ่านในเครื่องของคุณ ไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์');
    await page.waitForFunction(() => { const dialog = document.querySelector('[role="dialog"]'); return Boolean(dialog && getComputedStyle(dialog).opacity === '1' && getComputedStyle(dialog.parentElement!).opacity === '1'); });
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-excel-start-${device.name}.png` });

    await panel.getByTestId('excel-input').setInputFiles(EXCEL_FILE);
    await expect(panel).toContainText(EXCEL_FILE.name);
    const table = device.name === 'phone' ? panel.getByTestId('sheet-map-list') : panel.getByTestId('sheet-map-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('สูตร ห้ามเขียนทับ');
    await table.getByRole('combobox', { name: 'คอลัมน์ C คือ' }).selectOption('note');
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-excel-map-${device.name}.png` });

    await panel.getByTestId('sheets-save-map').click();
    await expect(panel.getByRole('status')).toContainText('บันทึกแผนที่ไว้ในเครื่องนี้แล้ว');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('krarok_excel_maps') || '[]'));
    expect(kept[0].name).toBe(EXCEL_FILE.name);
    expect(kept[0].map.tabs[0].columns.find((column: { index: number }) => column.index === 2).target).toBe('note');

    await panel.getByRole('tab', { name: 'ภาพรวม' }).click();
    await expect(panel.getByTestId('sheet-overview')).toContainText('1,200');
    expect(await textOverlapIssues(page)).toEqual([]);

    // Switching to Google Sheets and back keeps the file; choosing it again reads it with the kept map.
    await panel.getByRole('tab', { name: 'Google Sheets' }).click();
    await expect(panel.getByRole('button', { name: 'เชื่อมบัญชี Google' })).toBeVisible();
    await panel.getByRole('tab', { name: 'ไฟล์ Excel' }).click();
    await expect(panel).toContainText(EXCEL_FILE.name);
    await panel.getByTestId('excel-input').setInputFiles(EXCEL_FILE);
    await panel.getByRole('tab', { name: 'แผนที่ชีต' }).click();
    await expect(panel).toContainText('แผนที่ที่บันทึกไว้');
    await expect(table.getByRole('combobox', { name: 'คอลัมน์ C คือ' })).toHaveValue('note');

    // The file never left the device: no request carried anything from it.
    expect(bodies.filter(body => body.includes('ค่าเช่ากล้อง') || body.includes('ถ่ายรูปสินค้า'))).toEqual([]);
  });
}

test('a file that is not a spreadsheet is refused plainly', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, { connected: false, labsOn: ['excel', 'sheetMap'] });
  await page.getByRole('button', { name: /^ฟีเจอร์ทดลอง/ }).click();
  await page.getByTestId('lab-open-excel').click();
  const panel = page.getByTestId('sheets-panel');
  await expect(panel.getByRole('tab', { name: 'Google Sheets' })).toHaveCount(0);
  await panel.getByTestId('excel-input').setInputFiles({ name: 'photo.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a workbook') });
  await expect(panel.getByRole('alert')).toContainText('รองรับไฟล์ Excel');
});
