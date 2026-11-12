import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// Signing up inside LINE (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย", name + work type, then "อยากให้มันเป็น UI
// ทรานซิชั่นเหมือนที่เราทำในเว็บไซต์ไว้"): the เริ่มใช้งาน card opens /liff-add.html?start=1; a LINE chat without an account
// goes to /line-start, the website's own welcome screens in three steps, and back to the chat. LINE's SDK and the server's
// answers are stood in; the server side is tested in tests/line-signup.test.ts.

test.use({ serviceWorkers: 'block' });

async function open(page: Page, opts: { linked?: boolean; signup?: boolean; query?: string; width?: number; reply?: Record<string, unknown>; status?: number } = {}) {
  const sent: any[] = [];
  await page.setViewportSize({ width: opts.width ?? 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
    (window as any).__closed = 0;
  });
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",getProfile:async()=>({displayName:"Park LINE"}),closeWindow(){window.__closed++},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff', signup: opts.signup ?? true } }));
  await page.route('**/api/line-session', route => {
    sent.push({ url: 'line-session', body: route.request().postDataJSON() });
    return opts.linked
      ? route.fulfill({ json: { ok: true, destination: '/assistant' } })
      : route.fulfill({ status: 403, json: { error: 'LINE นี้ยังไม่ได้ผูกกับบัญชี', code: 'line_not_linked' } });
  });
  await page.route('**/api/line-signup', route => {
    sent.push({ url: 'line-signup', body: route.request().postDataJSON() });
    return route.fulfill({ status: opts.status ?? 200, json: opts.reply ?? { ok: true, created: true, destination: null } });
  });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.goto(`/liff-add.html${opts.query ?? '?start=1'}`);
  return sent;
}

for (const device of [{ name: 'phone', width: 390 }, { name: 'iPad', width: 768 }]) {
  test(`a LINE chat without an account signs up on the website's welcome screens (${device.name})`, async ({ page }) => {
    const sent = await open(page, { width: device.width });
    await expect(page).toHaveURL(/\/line-start$/);
    // Step 1: the greeting, the LINE name already in the field and echoed under สวัสดีครับ.
    await expect(page.locator('#wob-name')).toHaveValue('Park LINE');
    await loadLayoutFonts(page);
    await expect(page.locator('.wob-hello-name')).toContainText('Park LINE');
    await page.waitForTimeout(2200); // the words and the mascot rise into place first
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/line-start-1-${device.name}.png` });
    await page.locator('#wob-name').fill('ปาร์ค');
    await page.locator('.wob-go').click();

    // Step 2: the work type, required here.
    await expect(page.getByRole('heading', { name: 'ตอนนี้คุณทำงานรูปแบบไหน?' })).toBeVisible();
    await expect(page.getByText('ข้อ 2 จาก 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ข้ามก่อน' })).toHaveCount(0);
    await page.locator('.wob-next').click();
    await expect(page.locator('.wob-error')).toHaveText('กรุณาเลือกประเภทงาน');
    await page.getByText('เจ้าของธุรกิจ / เอเจนซี').click();
    await page.waitForTimeout(1000);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/line-start-2-${device.name}.png` });
    await page.locator('.wob-next').click();

    // Step 3: the agreements, protections first; nothing is sent until ticked.
    await expect(page.getByRole('heading', { name: 'ก่อนเริ่ม อ่านสั้น ๆ ครับ' })).toBeVisible();
    await expect(page.getByText('ไม่ถูกนำไปฝึก AI')).toBeVisible();
    await expect(page.getByRole('link', { name: 'อ่านเงื่อนไขการใช้งาน' })).toHaveAttribute('href', '/terms.html');
    await page.locator('.wob-next').click();
    await expect(page.locator('.wob-error')).toHaveText('กรุณากดยอมรับเงื่อนไขก่อนเริ่มใช้งาน');
    expect(sent.filter(item => item.url === 'line-signup')).toEqual([]);
    await page.getByText('ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว').click();
    await page.waitForTimeout(1200);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/line-start-3-${device.name}.png` });
    await page.locator('.wob-next').click();

    // "พร้อมแล้วครับ", then back on the LINE page, which closes the window.
    await expect(page.getByText('พร้อมแล้วครับ')).toBeVisible();
    await page.waitForURL(/liff-add\.html\?done=1/, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => (window as any).__closed)).toBe(1);
    expect(sent.find(item => item.url === 'line-signup')?.body).toEqual({ idToken: 'token', name: 'ปาร์ค', workType: 'business_owner', agreed: true });
    expect(await page.evaluate(() => sessionStorage.getItem('krarok_line_signup'))).toBeNull();
  });
}

test('the server\'s reason is shown when the sign-up is refused, and the person can try again', async ({ page }) => {
  await open(page, { status: 409, reply: { error: 'LINE นี้เชื่อมกับบัญชีอื่นอยู่แล้ว' } });
  await expect(page).toHaveURL(/\/line-start$/);
  await page.locator('.wob-go').click();
  await page.getByText('ฟรีแลนซ์ / อาชีพอิสระ').click();
  await page.locator('.wob-next').click();
  await page.getByText('ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว').click();
  await page.locator('.wob-next').click();
  await expect(page.locator('.wob-error')).toHaveText('LINE นี้เชื่อมกับบัญชีอื่นอยู่แล้ว', { timeout: 10_000 });
  await expect(page.locator('.wob-next')).toHaveText('เริ่มใช้งาน');
});

test('someone already linked who taps เริ่มใช้งาน again is told the account is ready', async ({ page }) => {
  await open(page, { linked: true });
  await expect(page.getByRole('heading', { name: 'บัญชีนี้พร้อมใช้อยู่แล้ว' })).toBeVisible();
  await expect(page).toHaveURL(/liff-add\.html/);
});

test('a menu button tapped before signing up opens the welcome screens and keeps where it was going', async ({ page }) => {
  await open(page, { query: '?openPath=%2Fassistant' });
  await expect(page).toHaveURL(/\/line-start$/);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('krarok_line_signup') || '{}')).destination).toBe('/assistant');
});

test('/line-start opened without LINE asks to open it from the chat', async ({ page }) => {
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.goto('/line-start');
  await expect(page.getByRole('heading', { name: 'เปิดหน้านี้จากแชท LINE' })).toBeVisible();
});

test('with sign-up switched off, a chat without an account is sent to the website as before', async ({ page }) => {
  await open(page, { signup: false, query: '?openPath=%2Fassistant' });
  await expect(page.getByRole('heading', { name: 'เปิดบัญชีไม่ได้' })).toBeVisible();
  await expect(page).toHaveURL(/liff-add\.html/);
});

test('/line-start?preview=1 shows the same three screens and sends nothing', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/line-signup')) posts.push(request.url()); });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/line-start?preview=1');
  await page.locator('#wob-name').fill('ปาร์ค');
  await page.locator('.wob-go').click();
  await page.getByText('ฟรีแลนซ์ / อาชีพอิสระ').click();
  await page.locator('.wob-next').click();
  await page.getByText('ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว').click();
  await page.locator('.wob-next').click();
  await expect(page.getByRole('heading', { name: 'จบหน้าตัวอย่าง' })).toBeVisible({ timeout: 10_000 });
  expect(posts).toEqual([]);
});
