// Screenshots of the real app's mobile layout with the sample account (mocked /api, nothing real is touched),
// to compare with the reference shots from ref-shots.ts.
//   npm run build && PORT=3100 npm start
//   CAPTURE_BASE=http://localhost:3100 npx tsx scripts/mobile/app-shots.ts [width] [height]
import { chromium, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleUser, sampleVaultFiles, snapshot, versions } from '../landing/sampleData';

const BASE = process.env.CAPTURE_BASE || 'http://localhost:3000';
const width = Number(process.argv[2] || 390), height = Number(process.argv[3] || 844);
const out = path.resolve(import.meta.dirname, '../../artifacts/mobile-app');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--lang=th-TH'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light', hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(CAPTURE_NOW));
await page.addInitScript(({ email }) => {
  const day = new Date().toISOString().split('T')[0];
  if (!sessionStorage.getItem('ks_shots_seeded')) { localStorage.setItem('cashflow_dark_mode', 'false'); sessionStorage.setItem('ks_shots_seeded', '1'); }
  localStorage.setItem(`cashflow_promo_last_shown_${email}`, day);
  localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`, String(Date.now()));
  sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`, '1');
}, { email: sampleUser.email });
const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: snapshot(), versions: versions(), subscription: SUBSCRIPTION.free } }) : r.fulfill({ json: { ok: true } }));

const shot = async (name: string) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, `${width}-${name}.png`) }); console.log('shot', name); };
const tab = (label: string) => page.locator('nav[aria-label="เมนูหลัก"]').getByRole('button', { name: label, exact: true });
const overflow = async (where: string) => { const px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (px > 0) console.log(`horizontal overflow on ${where}: ${px}px`); };

await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
await shot('home'); await overflow('home');
await tab('งาน').click(); await shot('jobs'); await overflow('jobs');
await tab('รอรับ').click(); await shot('receivables'); await overflow('receivables');
await tab('เมนู').click(); await shot('menu');
await page.locator('.ksm-group > summary').first().click(); await shot('menu-open');
await page.getByRole('button', { name: /^ปฏิทิน/ }).first().click(); await shot('tool-calendar'); await overflow('calendar');
await tab('เมนู').click();
await page.getByPlaceholder(/ค้นหา เช่น/).fill('ภาษี'); await shot('menu-search');
await tab('ภาพรวม').click();
await page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).first().click(); await shot('add-job');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await tab('ภาพรวม').click();
await page.getByRole('button', { name: 'เปลี่ยนเป็นโหมดมืด' }).click(); await shot('home-dark');
await tab('เมนู').click(); await shot('menu-dark');
console.log('errors:', JSON.stringify([...new Set(errors)].slice(0, 4)));
await browser.close();
