import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';
import { safeLineDestination } from '../../shared/lineDestination';

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
    const body = route.request().postDataJSON();
    sent.push({ url: 'line-session', body });
    // As the real server (shared/lineDestination.ts): only the app's own LINE destinations.
    if (!safeLineDestination(body.destination)) return route.fulfill({ status: 400, json: { error: 'ลิงก์เปิดแอปไม่ถูกต้อง กรุณาเปิดใหม่จาก LINE' } });
    return opts.linked
      ? route.fulfill({ json: { ok: true, destination: '/app?from=line' } })
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
    await page.goto('/line-start?full=1'); // every welcome question at once (one tap is the default)
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

    // Steps 2-5: the website's own first-run questions, ข้ามก่อน included.
    await expect(page.getByRole('heading', { name: 'ตอนนี้คุณทำงานรูปแบบไหน?' })).toBeVisible();
    await expect(page.getByText('ข้อ 2 จาก 6')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ข้ามก่อน' })).toBeVisible();
    await page.getByText('เจ้าของกิจการ / เอเจนซี / โปรดักชัน').click();
    await page.waitForTimeout(1000);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/line-start-2-${device.name}.png` });
    await page.locator('.wob-next').click();
    await expect(page.getByRole('heading', { name: 'คุณทำงานด้านไหนบ้าง?' })).toBeVisible();
    await page.getByText('ช่างภาพ / วิดีโอ').click();
    await page.getByText('คอนเทนต์ครีเอเตอร์').click();
    await page.locator('.wob-next').click();
    await expect(page.getByRole('heading', { name: 'อยากให้ Krarok ช่วยเรื่องไหนบ้าง?' })).toBeVisible();
    await page.getByText('ตามเงินที่ลูกค้ายังไม่จ่าย').click();
    // Question 4 lists the problems Krarok solves, each with its line; the Sheets one only off the real site.
    await expect(page.getByText('พิมพ์หรือส่งรูปใบเสร็จ ไม่ต้องจำไปจดทีหลัง')).toBeVisible();
    await expect(page.getByText('กรอกชีตหรือ Excel ที่ใช้อยู่ให้อัตโนมัติ')).toBeVisible();
    await page.waitForTimeout(900);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/line-start-goals-${device.name}.png`, fullPage: true });
    await page.locator('.wob-next').click();
    // Off the real site the Sheets goal is offered (the test server is not krarok.com).
    await expect(page.getByRole('heading', { name: 'ตอนนี้คุณจดรายรับรายจ่ายไว้ที่ไหน?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ข้ามก่อน' })).toBeVisible();
    await page.getByText('Google Sheets').click();
    await page.locator('.wob-next').click();

    // Step 6: the agreements, protections first; nothing is sent until ticked.
    await expect(page.getByRole('heading', { name: 'ก่อนเริ่ม อ่านสั้น ๆ ครับ' })).toBeVisible();
    await expect(page.getByText('ข้อสุดท้าย')).toBeVisible();
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
    expect(sent.find(item => item.url === 'line-signup')?.body).toEqual({ idToken: 'token', name: 'ปาร์ค', workType: 'business_owner',
      occupations: ['photo_video', 'content_creator'], goals: ['receivables'], recordsIn: 'google_sheets', agreed: true });
    expect(await page.evaluate(() => sessionStorage.getItem('krarok_line_signup'))).toBeNull();
  });
}

test('the server\'s reason is shown when the sign-up is refused, and the person can try again', async ({ page }) => {
  await open(page, { status: 409, reply: { error: 'LINE นี้เชื่อมกับบัญชีอื่นอยู่แล้ว' } });
  await expect(page).toHaveURL(/\/line-start$/);
  await page.goto('/line-start?full=1');
  await page.locator('.wob-go').click();
  await page.getByRole('button', { name: 'ข้ามก่อน' }).click();
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
  await open(page, { query: '?openPath=%2Fjobs' });
  await expect(page).toHaveURL(/\/line-start$/);
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('krarok_line_signup') || '{}')).destination).toBe('/jobs');
});

test('/line-start opened without LINE asks to open it from the chat', async ({ page }) => {
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.goto('/line-start');
  await expect(page.getByRole('heading', { name: 'เปิดหน้านี้จากแชท LINE' })).toBeVisible();
});

test('with sign-up switched off, a chat without an account is sent to the website as before', async ({ page }) => {
  await open(page, { signup: false, query: '?openPath=%2Fjobs' });
  await expect(page.getByRole('heading', { name: 'เปิดบัญชีไม่ได้' })).toBeVisible();
  await expect(page).toHaveURL(/liff-add\.html/);
});

test('/line-start?preview=1 shows the same three screens and sends nothing', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/line-signup')) posts.push(request.url()); });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/line-start?preview=1&full=1');
  await page.locator('#wob-name').fill('ปาร์ค');
  await page.locator('.wob-go').click();
  await page.getByRole('button', { name: 'ข้ามก่อน' }).click();
  await page.getByText('ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว').click();
  await page.locator('.wob-next').click();
  await expect(page.getByRole('heading', { name: 'จบหน้าตัวอย่าง' })).toBeVisible({ timeout: 10_000 });
  expect(posts).toEqual([]);
});

test('a browser already signed in to an account stays on /line-start instead of being taken to the overview', async ({ page }) => {
  const user = { id: '66666666-6666-4666-8666-666666666666', email: 'signed@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
  await page.addInitScript(id => {
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
    // The signed-in hint shows the opening logo on other pages; it must not cover this one.
    localStorage.setItem('cashflow_signed_in', '1');
  }, user.id);
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-6666666666', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/line-start?preview=1&full=1');
  await expect(page.locator('#wob-name')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/line-start\?preview=1&full=1$/);
  await expect(page.locator('#app-splash')).toHaveCount(0);
  // A tab change at start-up (navigateTab) must not read line-start as a workspace name either.
  await page.evaluate(() => { window.history.replaceState({}, '', '/line-start?preview=1&full=1'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/line-start\?preview=1&full=1$/);
});

test('ข้ามก่อน in LINE keeps what was picked, goes to the agreements, and ย้อนกลับ returns to the skipped step', async ({ page }) => {
  const sent = await open(page);
  await expect(page).toHaveURL(/\/line-start$/);
  await page.goto('/line-start?full=1');
  await page.locator('.wob-go').click();
  await page.getByText('นักเรียน / นักศึกษา').click();
  await page.locator('.wob-next').click();
  await expect(page.getByRole('heading', { name: 'คุณทำงานด้านไหนบ้าง?' })).toBeVisible();
  await page.getByRole('button', { name: 'ข้ามก่อน' }).click();
  await expect(page.getByRole('heading', { name: 'ก่อนเริ่ม อ่านสั้น ๆ ครับ' })).toBeVisible();
  await page.getByRole('button', { name: 'ย้อนกลับ' }).click();
  await expect(page.getByRole('heading', { name: 'คุณทำงานด้านไหนบ้าง?' })).toBeVisible();
  await page.getByRole('button', { name: 'ข้ามก่อน' }).click();
  await page.getByText('ยอมรับเงื่อนไขการใช้งานและนโยบายความเป็นส่วนตัว').click();
  await page.locator('.wob-next').click();
  await page.waitForURL(/liff-add\.html\?done=1/, { timeout: 15_000 });
  expect(sent.find(item => item.url === 'line-signup')?.body).toEqual({ idToken: 'token', name: 'Park LINE', workType: 'student', occupations: [], goals: [], skippedAtStep: 3, agreed: true });
});

// One tap on ?quick=1 (the website's full welcome is the default in LINE again, owner 2026-11-13: "กูชอบธีมเดิม").
const KEEP = Buffer.from(JSON.stringify({ k: 'e', n: 'ข้าวมันไก่', a: 50 })).toString('base64url');
for (const device of [{ name: 'phone', width: 390 }, { name: 'iPad', width: 768 }]) {
  test(`one tap: the LINE name in, ใช้แบบไหน picked, the tried record kept as the first (${device.name})`, async ({ page }) => {
    const sent = await open(page, { width: device.width, query: `?start=1&use=personal&keep=${KEEP}` });
    await expect(page).toHaveURL(/\/line-start$/);
    // The website's full welcome is the default again (owner, 2026-11-13); the one-tap screen is on ?quick=1.
    await expect(page.getByTestId('line-quick-start')).toHaveCount(0);
    await page.goto('/line-start?quick=1');
    const screen = page.getByTestId('line-quick-start');
    await expect(screen.locator('#lq-name')).toHaveValue('Park LINE');
    await expect(screen.getByRole('radio', { name: 'ใช้ส่วนตัว' })).toHaveAttribute('aria-checked', 'true');
    await expect(screen.getByTestId('line-quick-keep')).toContainText('ข้าวมันไก่');
    await expect(screen.getByTestId('line-quick-keep')).toContainText('−฿50');
    await page.waitForTimeout(1600);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/line-quick-start-${device.name}.png` });
    await screen.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน' }).click();
    await expect(page.getByText('พร้อมแล้วครับ')).toBeVisible();
    await page.waitForURL(/liff-add\.html\?done=1/, { timeout: 15_000 });
    expect(sent.find(item => item.url === 'line-signup')?.body).toEqual({ idToken: 'token', name: 'Park LINE', skippedAtStep: 2, agreed: true, use: 'personal', keep: KEEP });
  });
}

test('one tap asks for a name of two letters, and works without a pick or a tried record', async ({ page }) => {
  const sent = await open(page);
  await page.goto('/line-start?quick=1');
  const screen = page.getByTestId('line-quick-start');
  await expect(screen.getByTestId('line-quick-keep')).toHaveCount(0);
  await screen.locator('#lq-name').fill('ก');
  await screen.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน' }).click();
  await expect(screen.locator('.wob-error')).toHaveText('กรุณาใส่ชื่ออย่างน้อย 2 ตัวอักษร');
  await screen.locator('#lq-name').fill('ปาร์ค');
  await screen.getByRole('radio', { name: 'บริษัท / สำนักงาน' }).click();
  await screen.getByRole('button', { name: 'ยอมรับและเริ่มใช้งาน' }).click();
  await page.waitForURL(/liff-add\.html\?done=1/, { timeout: 15_000 });
  expect(sent.find(item => item.url === 'line-signup')?.body).toEqual({ idToken: 'token', name: 'ปาร์ค', skippedAtStep: 2, agreed: true, use: 'company' });
});

for (const device of [{ name: 'phone', width: 390 }, { name: 'iPad', width: 768 }]) {
  test(`มีบัญชีอยู่แล้ว: the LINE chat is linked to the website account instead of making a new one (${device.name})`, async ({ page }) => {
    const sent = await open(page, { width: device.width, reply: { ok: true, created: false, linked: true, destination: null } });
    await expect(page).toHaveURL(/\/line-start$/);
    await page.getByTestId('line-have-account').click();
    const form = page.getByTestId('line-link-existing');
    await expect(form.getByRole('heading', { name: 'เชื่อมกับบัญชีเดิม' })).toBeVisible();
    await loadLayoutFonts(page);
    await page.waitForTimeout(2200); // the heading and the line under it rise into place first
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/line-link-existing-${device.name}.png` });
    // Back to signing up and in again: nothing is lost.
    await form.getByRole('button', { name: 'ยังไม่มีบัญชี สมัครใหม่' }).click();
    await expect(page.locator('#wob-name')).toBeVisible();
    await page.getByTestId('line-have-account').click();
    await page.locator('#lq-email').fill('park@example.com');
    await page.locator('#lq-password').fill('krarok2569');
    await page.getByTestId('line-link-existing-go').click();
    await expect(page.getByText('เชื่อมบัญชีแล้วครับ')).toBeVisible();
    await page.waitForURL(/liff-add\.html\?done=1/, { timeout: 15_000 });
    expect(sent.filter(item => item.url === 'line-signup').map(item => item.body)).toEqual([
      { action: 'link', idToken: 'token', email: 'park@example.com', password: 'krarok2569', agreed: true },
    ]);
    expect(await page.evaluate(() => sessionStorage.getItem('krarok_line_signup'))).toBeNull();
  });
}

test('มีบัญชีอยู่แล้ว: a wrong password shows the server\'s words and the person can try again', async ({ page }) => {
  await open(page, { status: 401, reply: { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' } });
  await expect(page).toHaveURL(/\/line-start$/);
  await page.getByTestId('line-have-account').click();
  await page.locator('#lq-email').fill('park@example.com');
  await page.locator('#lq-password').fill('wrong-guess1');
  await page.getByTestId('line-link-existing-go').click();
  await expect(page.locator('.wob-error')).toHaveText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  await expect(page.getByTestId('line-link-existing-go')).toHaveText('เชื่อมบัญชี');
  await expect(page).toHaveURL(/\/line-start$/);
});
