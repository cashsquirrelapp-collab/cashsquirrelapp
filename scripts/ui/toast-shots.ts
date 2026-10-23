// Screenshots of the notifications (MascotToast) raised by real actions on the jobs page:
// edit and save a job, record a full payment, delete a job. Sample data, mocked /api.
//   CAPTURE_BASE=http://127.0.0.1:3100 npx tsx scripts/ui/toast-shots.ts [light|dark] [width] [height]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleUser, sampleVaultFiles, snapshot, versions } from '../landing/sampleData';

const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:3100';
const theme = process.argv[2] === 'dark' ? 'dark' : 'light';
const width = Number(process.argv[3] || 1440), height = Number(process.argv[4] || 900);
const out = path.resolve(import.meta.dirname, '../../artifacts/toasts');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--lang=th-TH'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: theme });
const page = await ctx.newPage();
const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
await page.clock.setFixedTime(new Date(CAPTURE_NOW));
await page.addInitScript(({ email, dark }) => {
  const day = new Date().toISOString().split('T')[0];
  localStorage.setItem('cashflow_dark_mode', dark ? 'true' : 'false');
  localStorage.setItem(`cashflow_promo_last_shown_${email}`, day);
  localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`, String(Date.now()));
  sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`, '1');
}, { email: sampleUser.email, dark: theme === 'dark' });
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
await page.route('**/api/data*', r => r.request().method() === 'GET' ? r.fulfill({ json: { snapshot: snapshot(), versions: versions(), subscription: SUBSCRIPTION.free } }) : r.fulfill({ json: { ok: true, versions: versions() } }));
const shot = async (name: string) => {
  // Headless Chromium can stall the enter animation; wait until the notification is really opaque.
  await page.waitForFunction(() => { const el = document.querySelector('.app-toast'); return !!el && getComputedStyle(el).opacity === '1'; }, undefined, { timeout: 8000 }).catch(() => console.log('  (notification did not finish fading in)'));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `${name}-${theme}-${width}.png`) });
  console.log('shot', name, JSON.stringify(await page.locator('.app-toast').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return `${(el as HTMLElement).innerText.split('\n')[0]} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} opacity=${getComputedStyle(el).opacity} html.dark=${document.documentElement.classList.contains('dark')}`; }))));
};
const open = async () => { await page.goto(BASE + '/jobs', { waitUntil: 'load' }); await page.waitForTimeout(2200); const all = page.getByRole('button', { name: /เดือนทั้งหมด|ล้างตัวกรองเดือน/ }); };

// 1. edit a job and save
await open();
await page.getByRole('button', { name: /^ตัวเลือกของงาน/ }).first().click();
await page.getByRole('menuitem', { name: 'ดูและแก้ไขรายละเอียด' }).click();
await page.locator('#job-form-client').fill('Brand B (ฝ่ายการตลาด)');
await page.getByRole('button', { name: 'บันทึกงาน', exact: true }).click();
await shot('1-edit');
// 2. record a full payment (fresh load so the previous notification is gone)
await open();
await page.getByRole('button', { name: /^ตัวเลือกของงาน/ }).first().click();
await page.getByRole('menuitem', { name: 'รับเงินครบ' }).click();
await page.waitForTimeout(400);
await page.getByRole('dialog').getByRole('button', { name: /บันทึก|ยืนยัน/ }).last().click();
await shot('2-paid');
// 3. delete a job
await open();
await page.getByRole('button', { name: /^ตัวเลือกของงาน/ }).nth(1).click();
await page.getByRole('menuitem', { name: 'ลบงาน' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
await shot('3-delete');
console.log('errors:', JSON.stringify([...new Set(errors)].slice(0, 3)));
await browser.close();
