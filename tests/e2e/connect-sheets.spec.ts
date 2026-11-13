import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// เชื่อมชีตจาก LINE (owner, 2026-11-13): the เชื่อมชีต card opens the LINE page, which hands the person to the phone's own
// browser with a one-use link (Google refuses sign-in inside LINE); /connect-sheets is the website's Sheets panel there,
// Google's sign-in comes back to it, and a done screen sends the person back to LINE. LINE, Google and the server are
// stood in; the server side is tested in tests/line-handoff.test.ts.

test.use({ serviceWorkers: 'block' });

const user = { id: '77777777-7777-4777-8777-777777777777', email: 'u0123456789abcdef0123456789abcdef@line.krarok.invalid', role: 'user', created_at: '2026-11-13T01:00:00Z', user_metadata: {} };
const FILE = { id: 'file-12345678', name: 'บัญชีร้าน 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
const cell = (text: string) => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text, text });
const TABS = [{ name: 'รายจ่าย', truncated: false, rows: [
  [cell('วันที่'), cell('รายการ'), cell('หมวดหมู่'), cell('ยอดเงิน')],
  [{ ...cell('5/10/2569'), date: '2026-10-05' }, cell('ค่าเช่ากล้อง'), cell('อุปกรณ์'), cell('1,200')],
] }];
const FAKE_PICKER = `window.gapi = { load: function (name, options) {
  window.google = window.google || {};
  function View() {} View.prototype.setMimeTypes = function () { return this; }; View.prototype.setMode = function () { return this; }; View.prototype.setIncludeFolders = function () { return this; };
  function Builder() {} ['addView','setDeveloperKey','setAppId','setLocale','setTitle','setOAuthToken'].forEach(function (m) { Builder.prototype[m] = function () { return this; }; });
  Builder.prototype.setCallback = function (cb) { this.cb = cb; return this; };
  Builder.prototype.build = function () { var cb = this.cb; return { setVisible: function () { setTimeout(function () { cb({ action: 'picked', docs: [{ id: '${FILE.id}', name: '${FILE.name}' }] }); }, 50); } }; };
  window.google.picker = { ViewId: { SPREADSHEETS: 's' }, DocsViewMode: { LIST: 'l' }, Action: { PICKED: 'picked', CANCEL: 'cancel' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id', NAME: 'name' }, DocsView: View, PickerBuilder: Builder };
  options.callback();
} };`;

async function openPage(page: Page, path: string, opts: { signedIn?: boolean; labsOn?: string[] } = {}) {
  const google = { connected: false, file: null as typeof FILE | null, map: null as unknown };
  const posts: Record<string, unknown>[] = [];
  const status = () => ({ google: { configured: true, connected: google.connected, ...(google.connected ? { email: 'shop@example.com' } : {}), file: google.file, map: google.map } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th');
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('https://apis.google.com/js/api.js', route => route.fulfill({ contentType: 'text/javascript', body: FAKE_PICKER }));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: opts.signedIn === false ? null : { user } } }));
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: opts.labsOn ?? ['sheets', 'sheetMap'] } } }));
  await page.route('**/api/google', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: status() });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    // Google's sign-in is skipped: the page comes back connected, as the callback would send it.
    if (body.action === 'start') { google.connected = true; return route.fulfill({ json: { ...status(), url: `${new URL(page.url()).origin}/connect-sheets?google=connected` } }); }
    if (body.action === 'token') return route.fulfill({ json: { token: 'ya29.test', expiresIn: 3600, apiKey: 'picker-key', appId: '875278739350' } });
    if (body.action === 'pick') { google.file = { ...FILE }; return route.fulfill({ json: status() }); }
    if (body.action === 'read') return route.fulfill({ json: { ...status(), tabs: TABS, readAt: '2026-11-13T03:00:00.000Z' } });
    if (body.action === 'saveMap') { google.map = body.map; return route.fulfill({ json: status() }); }
    return route.fulfill({ status: 400, json: { error: 'bad' } });
  });
  await page.goto(path);
  return { posts };
}

test('the เชื่อมชีต card opens the phone\'s own browser with a one-use link', async ({ page }) => {
  const asked: unknown[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.__opened=[];window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",getProfile:async()=>({displayName:"x"}),openWindow(o){window.__opened.push(o)},closeWindow(){},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff', signup: true } }));
  await page.route('**/api/line-handoff', route => { asked.push(route.request().postDataJSON()); return route.fulfill({ json: { url: 'https://staging.krarok.com/api/line-handoff?t=abc&openExternalBrowser=1' } }); });
  await page.goto('/liff-add.html?connect=sheets');
  await expect(page.getByRole('heading', { name: 'ทำต่อในเบราว์เซอร์ได้เลย' })).toBeVisible();
  expect(asked).toEqual([{ idToken: 'token', purpose: 'sheets' }]);
  expect(await page.evaluate(() => (window as any).__opened)).toEqual([{ url: 'https://staging.krarok.com/api/line-handoff?t=abc&openExternalBrowser=1', external: true }]);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('/connect-sheets: sign in with Google, pick the file, save the map, then back to LINE', async ({ page }) => {
  const { posts } = await openPage(page, '/connect-sheets');
  const panel = page.getByTestId('sheets-panel');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'เชื่อมบัญชี Google' }).click();
  await expect(page).toHaveURL(/\/connect-sheets$/);
  expect(posts.find(post => post.action === 'start')).toEqual({ action: 'start', back: 'connect' });
  await expect(panel.getByRole('status')).toContainText('เชื่อม Google แล้ว');
  await panel.getByTestId('sheets-pick').click();
  await expect(panel.getByTestId('sheets-save-map')).toBeVisible({ timeout: 10_000 });
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/connect-sheets-map-phone.png' });
  await panel.getByTestId('sheets-save-map').click();
  await expect(page.getByRole('heading', { name: 'เชื่อมชีตแล้ว' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'กลับไปที่ LINE' })).toHaveAttribute('href', 'https://line.me/R/nv/chat');
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/connect-sheets-done-phone.png' });
});

test('/connect-sheets with a used or old link, or signed out, says to tap เชื่อมชีต in LINE again', async ({ page }) => {
  await openPage(page, '/connect-sheets?handoff=expired');
  await expect(page.getByRole('heading', { name: 'ลิงก์นี้ใช้ไม่ได้แล้ว' })).toBeVisible();
  await expect(page).toHaveURL(/\/connect-sheets$/);
  await page.screenshot({ path: 'test-results/connect-sheets-expired-phone.png' });
});

test('/connect-sheets for an account the feature is not open to says so, and shows no Google button', async ({ page }) => {
  await openPage(page, '/connect-sheets', { labsOn: [] });
  await expect(page.getByRole('heading', { name: 'การเชื่อมชีตยังไม่เปิดให้บัญชีนี้' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เชื่อมบัญชี Google' })).toHaveCount(0);
});

test('the real Google Sheets and Excel icons show in the panel and on question 5', async ({ page }) => {
  await openPage(page, '/connect-sheets', { labsOn: ['sheets', 'sheetMap', 'excel'] });
  const panel = page.getByTestId('sheets-panel');
  await expect(panel.locator('.lab-gs-icon.is-logo img').first()).toHaveAttribute('src', '/brand/partners/google-sheets.png');
  await expect(panel.getByRole('tab', { name: 'Google Sheets' }).locator('img')).toHaveAttribute('src', '/brand/partners/google-sheets.png');
  await expect(panel.getByRole('tab', { name: 'ไฟล์ Excel' }).locator('img')).toHaveAttribute('src', '/brand/partners/excel.svg');
  for (const src of ['/brand/partners/google-sheets.png', '/brand/partners/excel.svg', '/brand/partners/excel.png']) {
    expect((await page.request.get(src)).status(), src).toBe(200);
  }
  expect(await panel.locator('img[src="/brand/partners/google-sheets.png"]').first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/connect-sheets-logos-phone.png' });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.goto('/line-start?preview=1');
  await page.locator('#wob-name').fill('ปาร์ค');
  await page.locator('.wob-go').click();
  for (let at = 0; at < 3; at += 1) await page.locator('.wob-next').click();
  await expect(page.getByRole('heading', { name: 'ตอนนี้คุณจดรายรับรายจ่ายไว้ที่ไหน?' })).toBeVisible();
  await expect(page.locator('.wob-ico.is-logo img')).toHaveCount(2);
  await page.getByText('Google Sheets').click();
  await page.waitForTimeout(900);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/onboarding-records-logos-phone.png' });
});

test('the promise says rows are written on confirm where writing is on, and read only where it is not', async ({ page }) => {
  await openPage(page, '/connect-sheets', { labsOn: ['sheets', 'sheetMap', 'sheetWrite'] });
  await expect(page.getByTestId('sheets-panel')).toContainText('เขียนเฉพาะแถวที่คุณกดยืนยันในการ์ด');
  await expect(page.getByTestId('sheets-panel')).not.toContainText('ตอนนี้อ่านอย่างเดียว');
});

test('the real Google Drive icon shows where a file is picked from Drive', async ({ page }) => {
  await openPage(page, '/connect-sheets');
  const panel = page.getByTestId('sheets-panel');
  await panel.getByRole('button', { name: 'เชื่อมบัญชี Google' }).click();
  await expect(panel.getByTestId('sheets-pick').locator('img')).toHaveAttribute('src', '/brand/partners/google-drive.png');
  expect((await page.request.get('/brand/partners/google-drive.png')).status()).toBe(200);
  await page.screenshot({ path: 'test-results/connect-sheets-drive-phone.png' });
});
