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

await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
await shot('home'); await overflow('home');
console.log('home rects', await page.evaluate(() => ['.ksm-heading', '.ksm-heading h2', '.ksm-month', '.ksm-summary', '.ksm-face', '.ksm-net strong', '.ksm-cash', '.ksm-work', '.ksm-notice', '.ksm-actions', '.ksm-quick-icon', '.ksm-counts', '.ksm-section-title', '.ksm-agenda', '.ksm-date', '.ksm-tools-entry']
  .map(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${sel} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]` : `${sel} (missing)`; }).join(' | ')));
await page.getByRole('button', { name: 'เพิ่มเติม', exact: true }).click(); await shot('home-more');
console.log('sheet rects', await page.evaluate(() => ['.ksm-sheet', '.ksm-sheet-header', '.ksm-sheet-header h2', '.ksm-sheet-intro', '.ksm-list', '.ksm-list > button', '.ksm-sheet-all', '.ksm-hint']
  .map(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${sel} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]` : `${sel} (missing)`; }).join(' | ')));
await page.getByRole('button', { name: 'ปิดหน้าต่าง' }).click(); await page.waitForTimeout(300);
await page.getByRole('button', { name: /ช่วงเวลาที่แสดง/ }).click(); await shot('home-month'); await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'รับเงินด่วน', exact: true }).click(); await shot('home-quickpay');
await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2000);
await page.getByRole('button', { name: /^ยอดเงินปัจจุบัน/ }).click(); await shot('home-profit');
await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2000);
await tab('งาน').click(); await shot('jobs'); await overflow('jobs');
console.log('jobs rects', await page.evaluate(() => ['.ksm-pagetitle', '.ksm-pagetitle h2', '.ksm-toolbtn', '.ksm-search', '.ksm-tabs', '.ksm-tabs > button', '.ksm-filter-note', '.ksm-joblist', '.ksm-jobcard', '.ksm-jobcard-top', '.ksm-jobstatus', '.ksm-deadline']
  .map(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${sel} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]` : `${sel} (missing)`; }).join(' | ')));
await page.getByRole('button', { name: 'ตัวกรองและเครื่องมืองาน' }).click(); await shot('jobs-tools');
await page.getByRole('dialog', { name: 'ตัวกรอง' }).getByRole('button', { name: 'ปิด', exact: true }).click(); await page.waitForTimeout(250);
await page.getByRole('button', { name: /^ตัวเลือกของงาน/ }).first().click(); await shot('jobs-menu'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
await page.getByRole('button', { name: /^ช่วงเวลา:/ }).click(); await page.waitForTimeout(250);
await page.getByRole('button', { name: 'เดือนทั้งหมด' }).click(); await shot('jobs-all');
await tab('รอรับ').click(); await shot('receivables'); await overflow('receivables');
console.log('due rects', await page.evaluate(() => ['.ksm-pagetitle', '.ksm-screen > .ksm-month', '.ksm-moneycard', '.ksm-scope', '.ksm-duelist', '.ksm-due', '.ksm-due-body', '.ksm-due-foot', '.ksm-btn']
  .map(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${sel} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]` : `${sel} (missing)`; }).join(' | ')));
await page.getByRole('button', { name: /^เตือนฉัน/ }).first().click(); await shot('receivables-remind');
// A fresh load first: after a long headless session the dialog's enter animation can stall at 0 opacity.
await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2000); await tab('รอรับ').click(); await page.waitForTimeout(400);
await page.locator('.ksm-due .ksm-btn').first().click(); await page.waitForTimeout(500); await shot('receivables-confirm');
await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click(); await page.waitForTimeout(250);
await page.getByRole('tab', { name: /เลยกำหนดรับเงิน/ }).click(); await shot('receivables-overdue');
await tab('เมนู').click(); await shot('menu');
await page.locator('.ksm-group > summary').first().click(); await shot('menu-open');
await page.getByRole('button', { name: /^ปฏิทิน/ }).first().click(); await shot('tool-calendar'); await overflow('calendar');
for (const [label, name] of [['รายจ่าย', 'tool-expenses'], ['เป้าหมาย', 'tool-goals'], ['ออกเอกสาร', 'tool-documents'], ['คลัง', 'tool-vault'], ['50 ทวิ', 'tool-wht'], ['รายงาน', 'tool-report'], ['ภาษี', 'tool-tax'], ['ตั้งค่า', 'tool-settings']] as const) {
  // Each tool from a fresh load, so a prompt one page raises cannot block the next.
  await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1800);
  await tab('เมนู').click(); await page.waitForTimeout(250);
  await page.getByPlaceholder(/ค้นหา เช่น/).fill(label);
  const hit = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' }).locator('.ksm-row').first();
  if (!(await hit.count())) { console.log('no tool for', label); continue; }
  await hit.click(); await shot(name); await overflow(name);
  const prompt = await page.locator('.ksm-modal [role=dialog]').first().getAttribute('aria-label').catch(() => null);
  if (prompt) console.log(`${name}: the page opened a prompt: ${prompt}`);
}
await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1800);
await tab('เมนู').click();
await page.getByPlaceholder(/ค้นหา เช่น/).fill('ภาษี'); await shot('menu-search');
await tab('ภาพรวม').click();
await page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).first().click(); await shot('add-job');
console.log('job rects', await page.evaluate(() => ['.ksm-jobsheet', '.ksm-jobsheet .ksm-sheet-header', '.ksm-jobform-intro', '#job-form-name', '.ksm-amount', '#job-form-value-input', '#job-form-client', '.ksm-jobmore', '.ksm-jobmore > summary', '.ksm-jobform-footer', '.ksm-primary']
  .map(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${sel} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}]` : `${sel} (missing)`; }).join(' | ')));
await page.locator('#job-form-name').fill('ตัดต่อคลิปเปิดตัวสินค้า');
await page.locator('#job-form-value-input').pressSequentially('12500.5'); await shot('add-job-value');
await page.locator('.ksm-jobmore > summary').click(); await shot('add-job-more');
await page.locator('#job-tab-payment').click(); await shot('add-job-payment');
await page.locator('#job-tab-other').click(); await shot('add-job-other');
await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1800);
await page.getByRole('button', { name: 'เปลี่ยนเป็นโหมดมืด' }).click(); await shot('home-dark');
await tab('งาน').click(); await shot('jobs-dark');
await tab('รอรับ').click(); await shot('receivables-dark');
await tab('เมนู').click(); await shot('menu-dark');
console.log('errors:', JSON.stringify([...new Set(errors)].slice(0, 4)));
await browser.close();
