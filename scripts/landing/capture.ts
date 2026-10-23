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

// ---------------------------------------------------------------- Free account: what Free includes
{
  const s = await open('free'); const { page } = s;
  await go(page, '/');
  await screen(s, 'dashboard', {
    source: 'ภาพรวม (/)',
    proves: 'บัญชี Free เห็นภาพรวมรายรับ รอรับเงิน รายจ่าย กำไร และรายการเงินที่ต้องติดตาม',
    alt: 'หน้าภาพรวม: มูลค่างานเดือนนี้ 21,365 บาท รับเงินจริง 6,365 บาท รอรับเงิน 15,000 บาท',
  }, { follow: card(page, 'เงินที่ต้องติดตาม') });
  await piece(s, 'follow-up', card(page, 'เงินที่ต้องติดตาม'), {
    source: 'ภาพรวม: การ์ด “เงินที่ต้องติดตาม”',
    proves: 'บัญชี Free: รายการงานที่ต้องตามเงิน เรียงจากเร่งด่วนที่สุด',
    alt: 'รายการเงินที่ต้องติดตาม: ออกแบบโลโก้เลยกำหนด 4 วัน งานตัดต่อวิดีโออีก 2 วัน',
  });
  await go(page, '/calendar?view=calendar');
  await screen(s, 'calendar', {
    source: 'ปฏิทิน (/calendar?view=calendar)',
    proves: 'บัญชี Free: ปฏิทินกำหนดส่งงานและกำหนดรับเงินรายเดือน',
    alt: 'หน้าปฏิทินเดือนตุลาคม 2569 แสดงวันส่งงานและวันครบกำหนดชำระ',
  }, { month: card(page, 'เงินเข้าเดือนนี้') });
  await piece(s, 'month-money', card(page, 'เงินเข้าเดือนนี้'), {
    source: 'ปฏิทิน: การ์ด “เงินเข้าเดือนนี้”',
    proves: 'บัญชี Free: สรุปรับแล้ว รอรับ และเกินกำหนดของเดือน',
    alt: 'เงินเข้าเดือนนี้ 21,365 บาท แยกรับแล้ว รอรับ และเกินกำหนดชำระ',
  });
  await go(page, '/report');
  await screen(s, 'report', {
    source: 'รายงาน (/report)',
    proves: 'บัญชี Free: รายงานรายได้จากงาน ลูกค้า และประเภทงาน',
    alt: 'หน้ารายงาน: รายได้จากงาน จำนวนงาน และแนวโน้มรายได้',
  });
  if (s.errors.length) console.log('free errors', s.errors.slice(0, 3));
  await s.close();
}

// ---------------------------------------------------------------- Pro account: documents and vault
/** Cuts a strip of the page around a piece of text: the row that text sits in. */
async function rowAround(s: { page: Page; dpr: number; account: Shot['account'] }, name: string, text: string, box: { left: number; right: number; above: number; below: number }, meta: Meta) {
  const at = await s.page.getByText(text, { exact: true }).first().boundingBox();
  if (!at) throw new Error(`"${text}" is not on screen`);
  const rect = { x: box.left, y: Math.round(at.y - box.above), w: box.right - box.left, h: box.above + box.below };
  const png = path.join(TMP, `${name}.png`);
  await s.page.screenshot({ path: png, clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } });
  shots[name] = { file: webp(png, name), w: rect.w, h: rect.h, dpr: s.dpr, account: s.account, ...meta };
  console.log('row   ', name);
}
const DOCS = [
  { type: 'quotation', name: 'doc-quotation', th: 'ใบเสนอราคา', no: 'QT-2569-001', says: 'ใบเสนอราคาของงานตัดต่อวิดีโอ มูลค่างานทั้งหมด 6,000 บาท' },
  { type: 'invoice', name: 'doc-invoice', th: 'ใบแจ้งหนี้', no: 'INV-2569-002', says: 'ใบแจ้งหนี้งวดที่ 2 ของงานเดียวกัน 1,000 บาท อ้างอิง QT-2569-001' },
  { type: 'receipt', name: 'doc-receipt', th: 'ใบเสร็จ', no: 'RC-2569-002', says: 'ใบเสร็จรับเงินงวดที่ 2 ของงานเดียวกัน 1,000 บาท อ้างอิง INV-2569-002' },
] as const;
{
  const s = await open('pro'); const { page } = s;
  for (const doc of DOCS) {
    await go(page, `/invoice?type=${doc.type}`);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.getByRole('button', { name: 'ดาวน์โหลด PDF' }).click()]);
    const pdf = path.join(TMP, `${doc.name}.pdf`);
    await download.saveAs(pdf);
    // Page 1 of the file the app produced, whole sheet, turned into an image without changing it.
    execFileSync('pdftoppm', ['-r', '150', '-f', '1', '-l', '1', '-png', '-singlefile', pdf, path.join(TMP, doc.name)]);
    const dims = execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(path.join(TMP, `${doc.name}.png`))}); print(im.size[0], im.size[1])`]).toString().trim().split(' ').map(Number);
    shots[doc.name] = {
      file: webp(path.join(TMP, `${doc.name}.png`), doc.name), w: dims[0] / 2, h: dims[1] / 2, dpr: 2, account: 'Pro',
      source: `เอกสาร → ${doc.th} ${doc.no} → ดาวน์โหลด PDF → ไฟล์ ${download.suggestedFilename()} หน้า 1 เต็มแผ่น (แปลงเป็นภาพด้วย pdftoppm 150dpi)`,
      proves: `ไฟล์ PDF ที่ระบบสร้างจริง: ${doc.says}`,
      alt: `${doc.th} ${doc.no} เต็มแผ่น: ${doc.says}`,
    };
    console.log('pdf   ', download.suggestedFilename(), dims);
    await settle(page, 600);
  }

  await go(page, '/vault');
  const year = page.locator('select').last();
  await year.selectOption({ label: 'อัปโหลดปี 2569' });
  await settle(page, 500);
  await screen(s, 'vault-year', {
    source: 'เอกสาร → คลังเอกสาร → ตัวกรอง “อัปโหลดปี 2569”',
    proves: 'คลังเอกสารกรองตามปีที่อัปโหลด เลือกปี 2569 แล้วเหลือ 3 ไฟล์ และมีปุ่มดาวน์โหลดไฟล์ที่แสดง',
    alt: 'หน้าคลังเอกสารเมื่อกรองปีที่อัปโหลด 2569 เหลือ 3 ไฟล์',
  }, { filter: year, download: page.getByRole('button', { name: /ดาวน์โหลดไฟล์ที่แสดง/ }) });
  const files = [['vault-file-wht', '50ทวิ_StudioE_ตค69.pdf', 'ใบ 50 ทวิของงานถ่ายภาพสินค้า (Studio E)'], ['vault-file-po', 'PO_AgencyC_แคมเปญ.pdf', 'สัญญา / PO ของงานแคมเปญเปิดตัวสินค้า (Agency C)'], ['vault-file-slip', 'ใบเสร็จ_โปรแกรมตัดต่อ.pdf', 'สลิปรายจ่ายค่าโปรแกรมตัดต่อ']] as const;
  for (const [name, text, what] of files) {
    await rowAround(s, name, text, { left: 280, right: 1400, above: 22, below: 62 }, { source: `คลังเอกสาร (ปีที่อัปโหลด 2569): แถวไฟล์ ${text}`, proves: `ไฟล์ที่เก็บในคลังพร้อมประเภทและงานที่ผูกไว้: ${what}`, alt: `ไฟล์ในคลังเอกสาร: ${text} · ${what}` });
  }
  await piece(s, 'vault-download', page.getByRole('button', { name: /ดาวน์โหลดไฟล์ที่แสดง/ }), { source: 'คลังเอกสาร: ปุ่ม “ดาวน์โหลดไฟล์ที่แสดง (3)”', proves: 'ดาวน์โหลดไฟล์ที่กรองไว้เป็นชุดเดียว (ZIP) ได้จากหน้าคลัง', alt: 'ปุ่มดาวน์โหลดไฟล์ที่แสดง 3 ไฟล์' });
  await piece(s, 'vault-filter', year, { source: 'คลังเอกสาร: ตัวกรองปี เลือก “อัปโหลดปี 2569”', proves: 'ตัวกรองเป็นปีที่อัปโหลดไฟล์ ไม่ใช่ปีภาษีหรือปีของเอกสาร', alt: 'ตัวกรอง: อัปโหลดปี 2569' });

  await go(page, '/wht50');
  const whtTable = () => page.locator('.ui-surface', { hasText: 'งาน / ลูกค้า' }).last();
  await piece(s, 'wht-waiting', whtTable(), { source: 'ติดตามใบ 50 ทวิ → แท็บ “ยังรอ”', proves: 'งานถ่ายวิดีโอสัมภาษณ์ รับเงินแล้วแต่ยังไม่ได้ใบ 50 ทวิ รอมา 19 วัน', alt: 'งานที่ยังรอใบ 50 ทวิ: ถ่ายวิดีโอสัมภาษณ์ Brand B หัก ณ ที่จ่าย 3% 300 บาท รอมา 19 วัน' });
  await page.getByRole('tab', { name: /ได้รับแล้ว/ }).or(page.getByRole('button', { name: /^ได้รับแล้ว/ })).first().click(); await settle(page, 700);
  await piece(s, 'wht-received', whtTable(), { source: 'ติดตามใบ 50 ทวิ → แท็บ “ได้รับแล้ว”', proves: 'งานถ่ายภาพสินค้า ได้รับใบ 50 ทวิและแนบไฟล์แล้ว', alt: 'งานที่ได้รับใบ 50 ทวิแล้ว: ถ่ายภาพสินค้า Studio E' });
  if (s.errors.length) console.log('pro errors', s.errors.slice(0, 3));
  await s.close();
}

// ---------------------------------------------------------------- LINE: the menu as it shows today
{
  // The menu as it shows in LINE today: cut from a phone screenshot the project owner sent on 13 Oct 2026.
  // Only the menu is kept (no chat messages). It is not the older frontend/public/richmenu-large.jpg.
  const src = path.join(ROOT, 'scripts/landing/sources/line-menu-2026-10-13.png');
  shots['line-menu'] = {
    file: webp(src, 'line-menu'), w: 462, h: 311.5, dpr: 2, account: 'LINE',
    source: 'ภาพหน้าจอแอป LINE จริงจากมือถือของเจ้าของโปรเจกต์ (13 ต.ค. 2569) ครอปเฉพาะส่วน rich menu ไม่มีข้อความแชต — scripts/landing/sources/line-menu-2026-10-13.png',
    proves: 'เมนู LINE ที่ผู้ใช้เห็นจริงตอนนี้ 6 ปุ่ม: เพิ่มรายการ รอรับเงิน สรุปเดือนนี้ งานเดือนนี้ กำลังดำเนินงาน เปิดแอป',
    alt: 'เมนู LINE ของกระรอกตุนเงิน 6 ปุ่ม: เพิ่มรายการ รอรับเงิน สรุปเดือนนี้ งานเดือนนี้ กำลังดำเนินงาน เปิดแอป',
  };
}

// ---------------------------------------------------------------- Narrow window: the same web app re-framed for small screens
{
  const s = await open('free', 430, 932, 3); const { page } = s;
  await go(page, '/calendar?view=timeline');
  const parts = {
    summary: page.locator('div.rounded-\\[14px\\]', { hasText: 'เงินคาดว่าจะเข้าเดือนนี้' }).first(),
    logo: row(page, /^ออกแบบโลโก้/),
    video2: row(page, /งานตัดต่อวิดีโอ.*งวดที่ 2/),
    video3: row(page, /งานตัดต่อวิดีโอ.*งวดที่ 3/),
    review: row(page, /^รีวิวสินค้า/),
  };
  await screen(s, 'narrow-timeline', {
    source: 'ไทม์ไลน์ เปิดในหน้าต่างกว้าง 430px (เว็บแอปเดียวกัน จัดเรียงตามความกว้างเอง)',
    proves: 'ใช้บนหน้า Landing จอเล็ก เพื่อให้ตัวหนังสือในภาพอ่านได้โดยไม่ย่อหน้าจอคอมทั้งหน้า',
    alt: 'ไทม์ไลน์กำหนดรับเงินในหน้าต่างแคบ: เงินคาดว่าจะเข้าเดือนนี้ 21,365 บาท และรายการงาน',
  }, parts);
  for (const [key, loc] of Object.entries(parts)) {
    await piece(s, `ntl-${key}`, loc, { source: 'ไทม์ไลน์ (หน้าต่างแคบ): ตัดเฉพาะแถวนี้จากหน้าจอเดียวกัน', proves: 'ชิ้นส่วนของหน้าไทม์ไลน์จริง สำหรับจอเล็ก', alt: '' });
  }
  await go(page, '/receivables');
  const receivable = (name: string) => page.locator('p', { hasText: new RegExp(`^${name}$`) }).locator('xpath=ancestor::div[3]');
  await piece(s, 'ncredit-30', receivable('รีวิวสินค้า'), {
    source: 'เงินค้างรับ (หน้าต่างแคบ): การ์ดงานรีวิวสินค้า',
    proves: 'เครดิตเทอม 30 วัน เริ่มนับ 1 ต.ค. ครบกำหนด 31 ต.ค. (สำหรับจอเล็ก)',
    alt: 'งานรีวิวสินค้า 8,000 บาท ระยะเวลารับเงิน 30 วัน เริ่มนับ 1 ต.ค. ครบกำหนด 31 ต.ค.',
  });
  await piece(s, 'ncredit-45', receivable('แคมเปญเปิดตัวสินค้า'), {
    source: 'เงินค้างรับ (หน้าต่างแคบ): การ์ดงานแคมเปญเปิดตัวสินค้า',
    proves: 'เครดิตเทอม 45 วัน เริ่มนับ 8 ต.ค. ครบกำหนด 22 พ.ย. (สำหรับจอเล็ก)',
    alt: 'งานแคมเปญเปิดตัวสินค้า 15,000 บาท ระยะเวลารับเงิน 45 วัน เริ่มนับ 8 ต.ค. ครบกำหนด 22 พ.ย.',
  });
  await go(page, '/jobs');
  await screen(s, 'narrow-jobs', {
    source: 'งาน เปิดในหน้าต่างกว้าง 430px (บัญชี Free)',
    proves: 'ใช้บนหน้า Landing จอเล็ก: รายการงานและสถานะการชำระ',
    alt: 'รายการงานในหน้าต่างแคบ: ชื่องาน ลูกค้า กำหนด และจำนวนเงิน',
  });
  await s.close();
}
{
  const s = await open('pro', 430, 932, 3); const { page } = s;
  await go(page, '/vault');
  await page.locator('select').last().selectOption({ label: 'อัปโหลดปี 2569' }); await settle(page, 500);
  const files = [['nvault-file-wht', '50ทวิ_StudioE_ตค69.pdf'], ['nvault-file-po', 'PO_AgencyC_แคมเปญ.pdf'], ['nvault-file-slip', 'ใบเสร็จ_โปรแกรมตัดต่อ.pdf']] as const;
  for (const [name, text] of files) {
    await page.getByText(text, { exact: true }).first().scrollIntoViewIfNeeded();
    await rowAround(s, name, text, { left: 14, right: 416, above: 16, below: 52 }, { source: `คลังเอกสาร (หน้าต่างแคบ): แถวไฟล์ ${text}`, proves: 'แถวไฟล์เดียวกัน สำหรับจอเล็ก', alt: '' });
  }
  await go(page, '/wht50');
  const card = () => page.locator('.ui-surface', { hasText: 'ถ่าย' }).last();
  await piece(s, 'nwht-waiting', card(), { source: 'ติดตามใบ 50 ทวิ (หน้าต่างแคบ) → “ยังรอ”', proves: 'การ์ดงานที่ยังรอใบ 50 ทวิ สำหรับจอเล็ก', alt: '' });
  await page.getByRole('tab', { name: /ได้รับแล้ว/ }).or(page.getByRole('button', { name: /^ได้รับแล้ว/ })).first().click(); await settle(page, 700);
  await piece(s, 'nwht-received', card(), { source: 'ติดตามใบ 50 ทวิ (หน้าต่างแคบ) → “ได้รับแล้ว”', proves: 'การ์ดงานที่ได้รับใบ 50 ทวิแล้ว สำหรับจอเล็ก', alt: '' });
  await s.close();
}
await browser.close();

// ---------------------------------------------------------------- Outputs
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
fs.writeFileSync(GEN, `// Generated by scripts/landing/capture.ts on ${today} from build ${BUILD}. Do not edit by hand.
// Sizes and positions are in CSS pixels of the captured window; the files hold dpr times as many.
export type ShotRect = { x: number; y: number; w: number; h: number; r?: number };
export type Shot = { file: string; w: number; h: number; dpr: number; account: 'Free' | 'Pro' | 'LINE'; alt: string; rects?: Record<string, ShotRect> };

export const SHOTS = ${JSON.stringify(Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, { file: `/landing/${v.file}`, w: v.w, h: v.h, dpr: v.dpr, account: v.account, alt: v.alt, ...(v.rects ? { rects: v.rects } : {}) }])), null, 2)} as const satisfies Record<string, Shot>;

export type ShotName = keyof typeof SHOTS;
`);

const kb = (file: string) => `${Math.round(fs.statSync(path.join(OUT, file)).size / 1024)} KB`;
fs.writeFileSync(DOC, `# Asset manifest — Landing Draft 2

สร้างโดย \`scripts/landing/capture.ts\` · วันที่ถ่าย ${today} · build \`${BUILD}\`${DIRTY}

> ภาพหน้าจอแอปชุดนี้ถ่ายจากซอร์สชุดเดียวกับที่อยู่บนเว็บจริง ณ 13 ต.ค. 2569 13:02 (Vercel deployment \`dpl_BT2AByCT93D7gB3PHNnmMetyPnh5\`) ตรวจแล้วว่าไฟล์ในเครื่องตรงกับ deployment นั้นทุกไฟล์ ก่อนแก้ Landing รอบนี้
> ข้อมูลตัวอย่างเป็นชุดเดียวทั้งหน้า: งานตัดต่อวิดีโอ (Brand A) 6,000 บาท รับแล้ว 2,000 → บันทึกรับงวดที่ 2 อีก 1,000 → รับแล้ว 3,000 ค้างรับ 3,000 เอกสารสามใบเป็นของงานนี้ (ใบเสนอราคาทั้งงาน 6,000 / ใบแจ้งหนี้งวดที่ 2 1,000 / ใบเสร็จงวดที่ 2 1,000)
> การ์ด LINE สองใบบนหน้า Landing ไม่ใช่ภาพถ่าย: สร้างจากตัวสร้างข้อความของระบบเอง (\`buildUnpaidJobsMessage\`, \`buildDigestFlexMessage\`) ด้วย \`scripts/landing/lineMessages.ts\` โดยใช้ข้อมูลงานที่แอปบันทึกไว้หลังรับเงินงวดที่ 2 แล้ววาดตามนิยาม Flex ของข้อความนั้น ส่วนกรอบหน้าแชต จุดกำลังพิมพ์ และแถบแจ้งเตือนเป็นการจำลองตามที่เจ้าของสั่ง เมนูด้านล่างครอปจากภาพหน้าจอ LINE จริง
> การออกเอกสารและการอัปโหลดเข้าคลังยังเป็นของ Pro (\`freeDocumentsAvailable\` เป็น false, \`vault-upload\` ตรวจสิทธิ์ Pro) ตัวกรองในคลังคือ “ปีที่อัปโหลด”

**วิธีถ่าย** เปิดแอปที่ build จากโค้ดชุดนี้บนเครื่อง (\`npm run build && npm start\`) ด้วย Playwright แล้วแทนคำตอบของ \`/api\` ด้วยบัญชีตัวอย่างใน \`scripts/landing/sampleData.ts\` ไม่ได้ล็อกอินบัญชีจริง ไม่ได้เขียนฐานข้อมูล ไม่ได้ส่ง LINE หรืออีเมล
หน้าจอ ปุ่ม แผ่นรับเงิน ตัวเลข และวันครบกำหนดทุกจุดเป็นผลจากโค้ดของแอปเอง วันครบกำหนดของงานเครดิตเทอมมาจาก \`calculatePayDate\` ใน \`shared/calendar.ts\`
นาฬิกาของเบราว์เซอร์ตรึงไว้ที่ 14 ต.ค. 2569 10:00 (Asia/Bangkok) ธีมสว่าง

**บัญชีตัวอย่าง** \`studio@example.com\` ลูกค้าชื่อ Brand A / Brand B / Agency C / Cafe D / Studio E ไม่มีเบอร์โทร เลขภาษี หรือเลขบัญชี
- Free = บัญชีเก่ากว่า 14 วัน ไม่มี subscription
- Pro = subscription สถานะ active

| ไฟล์ | ขนาดภาพ | บัญชี | หน้าและขั้นตอนต้นทาง | สิ่งที่ภาพนี้ยืนยันได้ |
| --- | --- | --- | --- | --- |
${Object.entries(shots).map(([, v]) => `| \`frontend/public/landing/${v.file}\` | ${Math.round(v.w * v.dpr)}×${Math.round(v.h * v.dpr)} · ${kb(v.file)} | ${v.account} | ${v.source} | ${v.proves} |`).join('\n')}

## ภาพที่ยังขาด (ยังไม่มีบนหน้า Landing และไม่ได้ทำของปลอมแทน)

| สิ่งที่ขาด | เหตุผล | ต้องใช้อะไร |
| --- | --- | --- |
| คลิปหรือภาพหน้าจอ LINE จริงของสองเหตุการณ์ (แตะ “รอรับเงิน” แล้วได้การ์ด, แจ้งเตือนเลยกำหนดเด้งเข้า) | ตอนนี้ใช้หน้าแชตจำลองที่เล่นข้อความจริงของระบบ ถ้าต้องการภาพจากเครื่องจริงต้องถ่ายจากบัญชีทดสอบ | คลิปหรือภาพหน้าจอจากมือถือ |
| ข้อความที่ขึ้นเป็นบับเบิลฝั่งผู้ใช้เมื่อแตะปุ่ม “รอรับเงิน” บนเมนู | โค้ดรับทั้งคำว่า “รอรับเงิน” และ “งานค้างจ่าย” แต่ค่าที่ตั้งไว้ในเมนูจริงอยู่ฝั่ง LINE ผมอ่านไม่ได้ จึงยังไม่แสดงบับเบิลนี้ | ภาพหน้าจอหลังแตะปุ่ม |
| ไฟล์โมเดล CashSquirrel_V2_Plump(1).glb | ไม่ได้รับไฟล์ในแชตนี้และไม่อยู่ในโปรเจกต์ จึงยังไม่ได้ลองใส่ | ไฟล์ .glb |
`);
console.log(`\n${Object.keys(shots).length} shots → ${path.relative(ROOT, OUT)}`);
