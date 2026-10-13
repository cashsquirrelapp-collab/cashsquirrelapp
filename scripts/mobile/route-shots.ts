// Screenshots of single routes of the real app at phone size (sample data, mocked /api), each
// from a fresh load. Faster than app-shots.ts when only a few pages changed.
//   CAPTURE_BASE=http://127.0.0.1:3100 npx tsx scripts/mobile/route-shots.ts 390 844 calendar=/calendar?view=calendar ...
// Optional: RECTS='.sel1,.sel2' prints those elements' boxes; DARK=1 switches to dark mode first.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleUser, sampleVaultFiles, snapshot, versions } from '../landing/sampleData';

const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:3100';
const width = Number(process.argv[2] || 390), height = Number(process.argv[3] || 844);
const routes = process.argv.slice(4).map(arg => arg.split('=') as [string, string]).map(([name, ...rest]) => [name, rest.join('=')] as const);
const out = path.resolve(import.meta.dirname, '../../artifacts/mobile-app');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--lang=th-TH'] });
for (const [name, route] of routes) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date(CAPTURE_NOW));
  await page.addInitScript(({ email, dark }) => {
    const day = new Date().toISOString().split('T')[0];
    localStorage.setItem('cashflow_dark_mode', dark ? 'true' : 'false');
    localStorage.setItem(`cashflow_promo_last_shown_${email}`, day);
    localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`, String(Date.now()));
    sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`, '1');
  }, { email: sampleUser.email, dark: Boolean(process.env.DARK) });
  await page.route('**/api/**', r => r.fulfill({ json: {} }));
  await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
  await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
  await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
  await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: snapshot(), versions: versions(), subscription: process.env.PRO ? SUBSCRIPTION.pro : SUBSCRIPTION.free } }) : r.fulfill({ json: { ok: true } }));
  await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(out, `${width}-${name}${process.env.DARK ? '-dark' : ''}.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const rects = process.env.RECTS ? await page.evaluate(sels => sels.map(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${sel} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]` : `${sel} (missing)`; }).join(' | '), process.env.RECTS.split(',')) : '';
  console.log(name, `overflow=${overflow}`, `errors=${JSON.stringify([...new Set(errors)].slice(0, 3))}`, rects);
  await ctx.close();
}
await browser.close();
