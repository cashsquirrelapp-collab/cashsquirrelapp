import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Signing up inside LINE (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย", name + work type): the เริ่มใช้งาน card opens
// /liff-add.html?start=1; a LINE chat without an account gets the form, fills it and goes back to the chat. LINE's SDK and
// the server's answers are stood in; the server side is tested in tests/line-signup.test.ts.

async function open(page: Page, opts: { linked?: boolean; signup?: boolean; query?: string; width?: number } = {}) {
  const sent: any[] = [];
  await page.setViewportSize({ width: opts.width ?? 390, height: 844 });
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",getProfile:async()=>({displayName:"Park LINE"}),closeWindow(){},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff', signup: opts.signup ?? true } }));
  await page.route('**/api/line-session', route => {
    sent.push({ url: 'line-session', body: route.request().postDataJSON() });
    return opts.linked
      ? route.fulfill({ json: { ok: true, destination: '/assistant' } })
      : route.fulfill({ status: 403, json: { error: 'LINE นี้ยังไม่ได้ผูกกับบัญชี', code: 'line_not_linked' } });
  });
  await page.route('**/api/line-signup', route => {
    sent.push({ url: 'line-signup', body: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true, created: true, destination: null } });
  });
  await page.route('**/assistant', route => route.fulfill({ contentType: 'text/html', body: '<h1>assistant page</h1>' }));
  await page.goto(`/liff-add.html${opts.query ?? '?start=1'}`);
  await page.evaluate(() => document.fonts.ready);
  return sent;
}

for (const width of [390, 768]) {
  test(`a LINE chat without an account signs up with a name and a work type (${width}px)`, async ({ page }) => {
    const sent = await open(page, { width });
    await expect(page.locator('#signup-view')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'เริ่มใช้เลขากระรอก' })).toBeVisible();
    // The LINE name is offered as the name.
    await expect(page.locator('#signup-name')).toHaveValue('Park LINE');
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/liff-signup-${width}.png`, fullPage: true });

    // Nothing is sent until the form is complete.
    await page.locator('#signup-name').fill('ปาร์ค');
    await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
    await expect(page.locator('#signup-error')).toHaveText('กรุณาเลือกประเภทงาน');
    await page.getByLabel('อื่น ๆ').check();
    await expect(page.locator('#signup-other-field')).toBeVisible();
    await page.locator('#signup-other').fill('ร้านขนม');
    await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
    await expect(page.locator('#signup-error')).toHaveText('กรุณากดยอมรับเงื่อนไขก่อนเริ่มใช้งาน');
    expect(sent.filter(item => item.url === 'line-signup')).toEqual([]);

    await page.locator('#signup-agree').check();
    await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
    await expect(page.getByRole('heading', { name: 'พร้อมแล้วครับ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'กลับไปแชท' })).toBeVisible();
    expect(sent.find(item => item.url === 'line-signup')?.body).toEqual({ idToken: 'token', name: 'ปาร์ค', workType: 'other', agreed: true, workTypeOther: 'ร้านขนม' });
    await page.screenshot({ path: `test-results/liff-signup-done-${width}.png` });
  });
}

test('someone already linked who taps เริ่มใช้งาน again is told the account is ready', async ({ page }) => {
  await open(page, { linked: true });
  await expect(page.getByRole('heading', { name: 'บัญชีนี้พร้อมใช้อยู่แล้ว' })).toBeVisible();
  await expect(page.locator('#signup-view')).toBeHidden();
});

test('a menu button tapped before signing up opens the form, then goes where it was going', async ({ page }) => {
  const sent = await open(page, { query: '?openPath=%2Fassistant' });
  await expect(page.locator('#signup-view')).toBeVisible();
  await page.locator('#signup-name').fill('ปาร์ค');
  await page.getByLabel('ฟรีแลนซ์ / อาชีพอิสระ').check();
  await page.locator('#signup-agree').check();
  await page.route('**/api/line-signup', route => route.fulfill({ json: { ok: true, created: true, destination: '/assistant' } }));
  await page.getByRole('button', { name: 'เริ่มใช้งาน' }).click();
  await expect(page.getByRole('heading', { name: 'assistant page' })).toBeVisible();
  expect(sent.filter(item => item.url === 'line-session').length).toBe(1);
});

test('with sign-up switched off, a chat without an account is sent to the website as before', async ({ page }) => {
  await open(page, { signup: false, query: '?openPath=%2Fassistant' });
  await expect(page.getByRole('heading', { name: 'เปิดบัญชีไม่ได้' })).toBeVisible();
  await expect(page.locator('#signup-view')).toBeHidden();
});
