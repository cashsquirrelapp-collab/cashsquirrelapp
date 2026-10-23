// Photographs the real app for the landing page.
//
//   npm run build && PORT=3000 npm start   (in another shell)
//   npx tsx scripts/landing/capture.ts
//
// Every picture is the running app, opened with the sample account in sampleData.ts. Only the
// network is replaced (the /api responses), so nothing here touches a real account or database and
// no LINE message or email is sent. The app's own code draws every screen, sheet and number.
// Output: WebP files in frontend/public/landing/, their sizes and element positions in
// frontend/src/features/marketing/landing/story/shots.gen.ts, and docs/landing-draft2/asset-manifest.md.
import { chromium, type Locator, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_NOW, SUBSCRIPTION, sampleJobs, sampleUser, sampleVaultFiles, snapshot, versions } from './sampleData';
import type { Job } from '../../shared/types';

const BASE = process.env.CAPTURE_BASE || 'http://localhost:3000';
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'frontend/public/landing');
const TMP = path.join(ROOT, 'artifacts/landing-capture');
const GEN = path.join(ROOT, 'frontend/src/features/marketing/landing/story/shots.gen.ts');
const DOC = path.join(ROOT, 'docs/landing-draft2/asset-manifest.md');
const BUILD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const DIRTY = execFileSync('git', ['status', '--porcelain', '--', 'frontend/src', 'shared', 'backend'], { cwd: ROOT }).toString().trim() ? ' + การแก้ไขที่ยังไม่ commit' : '';
for (const dir of [OUT, TMP, path.dirname(GEN), path.dirname(DOC)]) fs.mkdirSync(dir, { recursive: true });

type Rect = { x: number; y: number; w: number; h: number; r?: number };
type Shot = { file: string; w: number; h: number; dpr: number; account: 'Free' | 'Pro' | 'LINE'; source: string; proves: string; alt: string; rects?: Record<string, Rect> };
const shots: Record<string, Shot> = {};

const browser = await chromium.launch({ args: ['--lang=th-TH'] });

async function open(plan: 'free' | 'pro', width = 1440, height = 900, dpr = 2) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, locale: 'th-TH', timezoneId: 'Asia/Bangkok', colorScheme: 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(CAPTURE_NOW));
  // Light theme, and the once-a-day popups already seen, exactly as after a user closes them.
  await page.addInitScript(({ email }) => {
    const day = new Date().toISOString().split('T')[0];
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem(`cashflow_promo_last_shown_${email}`, day);
    localStorage.setItem(`cashflow_pro_banner_last_shown_${email}`, String(Date.now()));
    sessionStorage.setItem(`cashflow_queue_checked_${email}_${day}`, '1');
  }, { email: sampleUser.email });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  // The stand-in server keeps what the app saves, so a later read returns the app's own result.
  let jobs: Job[] = structuredClone(sampleJobs);
  await page.route('**/api/**', r => r.fulfill({ json: {} }));
  await page.route('**/api/auth', r => r.fulfill({ json: { session: { user: sampleUser } } }));
  await page.route('**/api/profile', r => r.fulfill({ json: { userId: sampleUser.id, publicId: 'SQ-0000000001', displayName: 'สตูดิโอตัวอย่าง' } }));
  await page.route('**/api/vault', r => r.fulfill({ json: { files: sampleVaultFiles } }));
  await page.route('**/api/groups?*', r => r.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', r => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { snapshot: snapshot(jobs), versions: versions(jobs), subscription: SUBSCRIPTION[plan] } });
    try {
      for (const c of (r.request().postDataJSON()?.changes ?? []) as { table: string; id: string; op: string; data: Job }[]) {
        if (c.table !== 'cashflow_jobs') continue;
        jobs = c.op === 'set' ? [...jobs.filter(j => j.id !== c.id), c.data] : jobs.filter(j => j.id !== c.id);
      }
    } catch { /* not a change set */ }
    return r.fulfill({ json: { ok: true } });
  });
  return { page, errors, close: () => ctx.close(), dpr, account: plan === 'free' ? 'Free' as const : 'Pro' as const, saved: () => jobs };
}

const settle = (page: Page, ms = 900) => page.waitForTimeout(ms);
const go = async (page: Page, route: string) => { await page.goto(BASE + route, { waitUntil: 'networkidle' }); await settle(page, 800); };

const webp = (png: string, name: string) => {
  const file = `${name}.webp`;
  execFileSync('cwebp', ['-quiet', '-q', '90', '-sharp_yuv', '-m', '6', png, '-o', path.join(OUT, file)]);
  return file;
};

async function rectOf(loc: Locator): Promise<Rect> {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element not on screen');
  const r = await loc.evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
  return { x: Math.round(box.x * 100) / 100, y: Math.round(box.y * 100) / 100, w: Math.round(box.width * 100) / 100, h: Math.round(box.height * 100) / 100, r };
}

type Meta = Pick<Shot, 'source' | 'proves' | 'alt'>;
/** The whole viewport, plus where the named elements sit inside it. */
async function screen(s: { page: Page; dpr: number; account: Shot['account'] }, name: string, meta: Meta, parts: Record<string, Locator> = {}) {
  await settle(s.page);
  const png = path.join(TMP, `${name}.png`);
  await s.page.screenshot({ path: png });
  const vp = s.page.viewportSize()!;
  const rects: Record<string, Rect> = {};
  for (const [key, loc] of Object.entries(parts)) rects[key] = await rectOf(loc);
  shots[name] = { file: webp(png, name), w: vp.width, h: vp.height, dpr: s.dpr, account: s.account, ...meta, ...(Object.keys(rects).length ? { rects } : {}) };
  console.log('screen', name);
}
/** One element of the screen, cut out along its own edge. */
async function piece(s: { page: Page; dpr: number; account: Shot['account'] }, name: string, loc: Locator, meta: Meta) {
  await loc.scrollIntoViewIfNeeded(); await settle(s.page, 400);
  const rect = await rectOf(loc);
  const png = path.join(TMP, `${name}.png`);
  await s.page.screenshot({ path: png, clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } });
  shots[name] = { file: webp(png, name), w: rect.w, h: rect.h, dpr: s.dpr, account: s.account, ...meta, rects: { self: { ...rect, x: 0, y: 0 } } };
  console.log('piece ', name);
}

/** Moves inside the app the way a user does, so what was just saved stays on screen. */
const nav = (page: Page, label: string) => page.locator('aside.app-sidebar').getByText(label, { exact: true }).first().click();
const row = (page: Page, re: RegExp) => page.getByRole('button', { name: re });
const card = (page: Page, text: string) => page.locator('.ui-surface', { hasText: text }).last();

// ---------------------------------------------------------------- Free account: jobs and money
{
  const s = await open('free'); const { page } = s;

  await go(page, '/calendar?view=timeline');
  const timelineParts = {
    summary: page.locator('div.rounded-\\[14px\\]', { hasText: 'เงินคาดว่าจะเข้าเดือนนี้' }).first(),
    logo: row(page, /^ออกแบบโลโก้/),
    video2: row(page, /งานตัดต่อวิดีโอ.*งวดที่ 2/),
    video3: row(page, /งานตัดต่อวิดีโอ.*งวดที่ 3/),
    review: row(page, /^รีวิวสินค้า/),
    photo: row(page, /^ถ่ายภาพสินค้า/),
  };
  await screen(s, 'timeline', {
    source: 'ปฏิทิน → ไทม์ไลน์ (/calendar?view=timeline)',
    proves: 'ไทม์ไลน์รวมกำหนดรับเงินของทุกงานในเดือน แยกงวดของงานที่แบ่งจ่าย และบอกรายการที่เกินกำหนด',
    alt: 'หน้าไทม์ไลน์ของแอป: เงินคาดว่าจะเข้าเดือนตุลาคม 21,365 บาท พร้อมรายการงานและวันครบกำหนดของแต่ละงาน',
  }, timelineParts);
  for (const [key, loc] of Object.entries(timelineParts)) {
    await piece(s, `tl-${key}`, loc, { source: 'ไทม์ไลน์: ตัดเฉพาะแถวนี้จากหน้าจอเดียวกัน', proves: 'ชิ้นส่วนของหน้าไทม์ไลน์จริง ใช้เป็นชิ้นที่เคลื่อนเข้าหาตำแหน่งจริงในหน้าจอ', alt: '' });
  }

  // One job, before the next instalment is recorded.
  await timelineParts.video2.click(); await settle(page, 1200);
  const peek = page.getByRole('dialog', { name: 'งานตัดต่อวิดีโอ' }).locator('div[class*="rounded-"]').filter({ hasText: 'รับแล้ว' }).first();
  await screen(s, 'timeline-peek', {
    source: 'ไทม์ไลน์ → กดแถว “งานตัดต่อวิดีโอ · งวดที่ 2”',
    proves: 'กดงานจากไทม์ไลน์แล้วเห็นยอดรับแล้ว ยอดค้างรับ และกำหนดชำระที่เหลือของงานนั้น',
    alt: 'การ์ดงานตัดต่อวิดีโอ มูลค่า 6,000 บาท รับแล้ว 2,000 บาท ค้างรับ 4,000 บาท',
  }, { card: peek });
  await piece(s, 'job-before', peek, {
    source: 'การ์ดงานที่เปิดจากไทม์ไลน์ (ก่อนบันทึกรับเงินงวดที่ 2)',
    proves: 'งาน 6,000 บาท รับแล้ว 2,000 ค้างรับ 4,000',
    alt: 'การ์ดงานตัดต่อวิดีโอ: รับแล้ว 2,000 บาท ค้างรับ 4,000 บาท กำหนดชำระเงินที่เหลืออีก 2 วัน',
  });
  await page.keyboard.press('Escape'); await settle(page, 600);

  // Receivables: credit terms as the app counts them.
  await nav(page, 'เงินค้างรับ'); await settle(page, 900);
  await screen(s, 'receivables', {
    source: 'ปฏิทิน → เงินค้างรับ (/receivables)',
    proves: 'ยอดค้างรับรวม และกลุ่มเกินกำหนด / ใกล้ครบกำหนด / ยังไม่ถึงกำหนด',
    alt: 'หน้าเงินค้างรับ: ค้างรับทั้งหมด 30,000 บาท 4 รายการ แยกตามกำหนด',
  });
  const receivable = (name: string) => page.locator('p', { hasText: new RegExp(`^${name}$`) }).locator('xpath=ancestor::div[3]');
  await piece(s, 'credit-30', receivable('รีวิวสินค้า'), {
    source: 'เงินค้างรับ: การ์ดงานรีวิวสินค้า',
    proves: 'เครดิตเทอม 30 วัน เริ่มนับ 1 ต.ค. ครบกำหนด 31 ต.ค. คำนวณโดยแอป (calculatePayDate)',
    alt: 'งานรีวิวสินค้า 8,000 บาท ระยะเวลารับเงิน 30 วัน เริ่มนับ 1 ต.ค. ครบกำหนด 31 ต.ค.',
  });
  await piece(s, 'credit-45', receivable('แคมเปญเปิดตัวสินค้า'), {
    source: 'เงินค้างรับ: การ์ดงานแคมเปญเปิดตัวสินค้า',
    proves: 'เครดิตเทอม 45 วัน เริ่มนับ 8 ต.ค. ครบกำหนด 22 พ.ย. คำนวณโดยแอป (calculatePayDate)',
    alt: 'งานแคมเปญเปิดตัวสินค้า 15,000 บาท ระยะเวลารับเงิน 45 วัน เริ่มนับ 8 ต.ค. ครบกำหนด 22 พ.ย.',
  });

  // Record the second instalment through the app's own sheet.
  await nav(page, 'งาน'); await settle(page, 900);
  await screen(s, 'jobs', {
    source: 'งาน (/jobs)',
    proves: 'รายการงานทั้งหมด กำหนด สถานะงาน และสถานะการชำระของแต่ละงาน',
    alt: 'หน้างาน: ตารางงาน 5 งานของเดือนนี้ พร้อมกำหนด สถานะ และจำนวนเงิน',
  });
  await page.getByRole('button', { name: 'เปลี่ยนการชำระของงาน งานตัดต่อวิดีโอ' }).click(); await settle(page, 500);
  await page.getByText('รับเงินงวดถัดไป').click(); await settle(page, 900);
  await page.getByRole('button', { name: /งวดที่ 2/ }).click(); await settle(page, 400);
  const sheet = page.locator('div.rounded-3xl', { hasText: 'รับเงินเป็นงวด' }).last();
  await screen(s, 'instalment-sheet', {
    source: 'งาน → การชำระของงานตัดต่อวิดีโอ → รับเงินงวดถัดไป → เลือกงวดที่ 2',
    proves: 'ขั้นตอนบันทึกรับเงินเป็นงวด: เลือกงวด ใส่วันที่รับจริง แล้วยืนยัน',
    alt: 'แผ่นรับเงินเป็นงวดของงานตัดต่อวิดีโอ เลือกงวดที่ 2 จำนวน 1,000 บาท',
  }, { sheet });
  await piece(s, 'instalment', sheet, {
    source: 'แผ่น “รับเงินเป็นงวด” ของแอป (เลือกงวดที่ 2 แล้ว)',
    proves: 'งวดที่ 2 จำนวน 1,000 บาท ครบกำหนด 16 ต.ค. พร้อมปุ่มยืนยันรับเงินงวดนี้',
    alt: 'แผ่นรับเงินเป็นงวด: งวดที่ 2 จำนวน 1,000 บาท และงวดที่ 3 จำนวน 3,000 บาท',
  });
  await page.getByRole('button', { name: 'ยืนยันรับเงินงวดนี้' }).click();
  await settle(page, 7000); // let the app's own confirmation and undo notice finish
  await page.keyboard.press('Escape'); await settle(page, 500);
  // What the app itself saved after that confirmation: the LINE scene is generated from this, not from a hand-edited copy.
  fs.writeFileSync(path.join(ROOT, 'scripts/landing/jobs-after.gen.json'), JSON.stringify(s.saved(), null, 2) + '\n');

  // The same job after the app saved it. Client-side navigation, no reload.
  await nav(page, 'ปฏิทิน'); await settle(page, 900);
  if (!(await page.getByText('เป็นต้นไป').count())) { await page.getByRole('button', { name: 'ไทม์ไลน์' }).click(); await settle(page, 900); }
  await screen(s, 'timeline-after', {
    source: 'ไทม์ไลน์ หลังยืนยันรับเงินงวดที่ 2 (ไม่ได้โหลดหน้าใหม่)',
    proves: 'หลังบันทึก งวดที่ 2 ย้ายเป็นรับแล้ว ยอดรับแล้ว/รอรับของเดือนเปลี่ยนตาม',
    alt: 'หน้าไทม์ไลน์หลังบันทึกรับเงินงวดที่ 2 ของงานตัดต่อวิดีโอ',
  });
  await row(page, /งานตัดต่อวิดีโอ.*งวดที่ 3/).click(); await settle(page, 1200);
  await piece(s, 'job-after', page.getByRole('dialog', { name: 'งานตัดต่อวิดีโอ' }).locator('div[class*="rounded-"]').filter({ hasText: 'รับแล้ว' }).first(), {
    source: 'การ์ดงานเดียวกัน หลังยืนยันรับเงินงวดที่ 2 ในแอป',
    proves: 'ผลลัพธ์ที่แอปคำนวณเอง: รับแล้ว 3,000 ค้างรับ 3,000',
    alt: 'การ์ดงานตัดต่อวิดีโอหลังบันทึก: รับแล้ว 3,000 บาท ค้างรับ 3,000 บาท',
  });
  await page.keyboard.press('Escape');
  if (s.errors.length) console.log('free errors', s.errors.slice(0, 3));
  await s.close();
}


await browser.close();
