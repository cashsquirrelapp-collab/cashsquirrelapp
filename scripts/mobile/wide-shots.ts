// Screenshots at tablet and desktop widths, to confirm they still show the layout they had
// before the mobile design (which is for phones only).
//   CAPTURE_BASE=http://127.0.0.1:3100 npx tsx scripts/mobile/wide-shots.ts
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleUser, sampleVaultFiles, snapshot, versions } from '../landing/sampleData';

const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:3100';
const out = path.resolve(import.meta.dirname, '../../artifacts/mobile-app');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--lang=th-TH'] });
for (const [width, height, name] of [[744, 1133, 'ipad-mini-portrait'], [820, 1180, 'ipad-portrait'], [1180, 820, 'ipad-landscape'], [1440, 900, 'desktop']] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(CAPTURE_NOW));
  await page.addInitScript(({ email }) => {
    const day = new Date().toISOString().split('T')[0];
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem(`cashflow_promo_last_shown_${email}`, day);
    localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`, String(Date.now()));
    sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`, '1');
  }, { email: sampleUser.email });
  await page.route('**/api/**', r => r.fulfill({ json: {} }));
  await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
  await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
  await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
  await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: snapshot(), versions: versions(), subscription: SUBSCRIPTION.free } }) : r.fulfill({ json: { ok: true } }));
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(out, `wide-${name}-home.png`) });
  const state = await page.evaluate(() => ({ mobileBars: document.querySelectorAll('.ksm-nav, .ksm-header, .ksm-home').length, sidebar: !!document.querySelector('aside.app-sidebar') && getComputedStyle(document.querySelector('aside.app-sidebar')!).display !== 'none' }));
  console.log(name, `${width}x${height}`, JSON.stringify(state));
  await ctx.close();
}
await browser.close();
