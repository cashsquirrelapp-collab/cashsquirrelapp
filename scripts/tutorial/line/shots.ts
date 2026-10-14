// Screenshots of the real settings pages used in the "เชื่อมต่อ LINE" tutorial clip: the LINE row,
// the connect button, the one-time code, and the connected state. Sample Pro account, mocked /api
// (the code shown is a sample value; nothing is linked).
//
//   npm run build && PORT=3100 HOST=127.0.0.1 npm start
//   CAPTURE_BASE=http://127.0.0.1:3100 npx tsx scripts/tutorial/line/shots.ts
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleUser, sampleVaultFiles, snapshot, versions } from '../../landing/sampleData';

const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:3100';
const out = path.resolve(import.meta.dirname, '../../../artifacts/line-tutorial/shots');
fs.mkdirSync(out, { recursive: true });
const SAMPLE_CODE = 'A1B2C3D4E5F60718';
const browser = await chromium.launch({ args: ['--lang=th-TH'] });

async function open(linked: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(CAPTURE_NOW));
  await page.addInitScript(({ email }) => {
    const day = new Date().toISOString().split('T')[0];
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem(`cashflow_promo_last_shown_${email}`, day);
    localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`, String(Date.now()));
    sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`, '1');
  }, { email: sampleUser.email });
  const data = snapshot() as ReturnType<typeof snapshot> & { notif_settings: Record<string, unknown> };
  data.notif_settings = { ...data.notif_settings, lineUserId: linked ? 'U00000000000000000000000000000000' : null, dailyDigestEnabled: true, monthlyReportEnabled: true };
  await page.route('**/api/**', r => r.fulfill({ json: {} }));
  await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
  await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
  await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
  await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/line-link-code', r => r.fulfill({ json: { code: SAMPLE_CODE, expiresAt: new Date(new Date(CAPTURE_NOW).getTime() + 5 * 60 * 1000).toISOString() } }));
  await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: data, versions: versions(), subscription: SUBSCRIPTION.pro } }) : r.fulfill({ json: { ok: true } }));
  await page.goto(BASE + '/settings', { waitUntil: 'load' }); await page.waitForTimeout(2200);
  return { ctx, page };
}
const shot = async (page: import('playwright').Page, name: string) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('shot', name); };

{ // not linked yet: the way in, the button, the code
  const { ctx, page } = await open(false);
  const main = page.locator('#main-content');
  const notifications = main.getByRole('button', { name: /^การแจ้งเตือน/ }).first();
  await notifications.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await shot(page, '1-settings');
  console.log('row rects', JSON.stringify(await notifications.boundingBox()));
  await notifications.click();
  await shot(page, '2-notifications');
  const lineRow = main.getByRole('button', { name: /^LINE/ }).first();
  console.log('line row', JSON.stringify(await lineRow.boundingBox()));
  await lineRow.click();
  await shot(page, '3-line');
  const connect = page.getByRole('button', { name: 'เชื่อมต่อ LINE', exact: true });
  console.log('connect button', JSON.stringify(await connect.boundingBox()));
  await connect.click(); await page.waitForTimeout(500);
  await shot(page, '4-confirm');
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click(); await page.waitForTimeout(700);
  await shot(page, '5-code');
  console.log('code text:', (await page.locator('.font-mono').filter({ hasText: SAMPLE_CODE }).first().innerText()).trim());
  await ctx.close();
}
{ // linked
  const { ctx, page } = await open(true);
  const main = page.locator('#main-content');
  await main.getByRole('button', { name: /^การแจ้งเตือน/ }).first().click();
  await shot(page, '6-notifications-linked');
  await main.getByRole('button', { name: /^LINE/ }).first().click();
  await shot(page, '7-line-linked');
  await ctx.close();
}
await browser.close();
