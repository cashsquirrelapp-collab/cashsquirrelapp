// The members' LINE menu picture (members.html over members-erase.py's cleaned 2026-11-03 picture), 2500x1686 JPEG
// under LINE's 1 MB limit. Owner, 2026-11-14: the six buttons บันทึก · รอรับเงิน · สรุปเดือนนี้ · ส่งสลิป · ออกเอกสาร ·
// เปิดแอป, in the picture already in use (only three tiles' words and one icon change).
//   node scripts/line-menu/render-members.mjs   (Chrome: PLAYWRIGHT_EXECUTABLE_PATH or the default install; Python + Pillow)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const here = new URL('.', import.meta.url).pathname;
const source = new URL('../../frontend/public/line/richmenu-ci-6-2026-11-03.jpg', import.meta.url).pathname;
const out = new URL('../../frontend/public/line/richmenu-members-2026-11-14.jpg', import.meta.url).pathname;
const erased = join(mkdtempSync(join(tmpdir(), 'line-menu-')), 'erased.png');
execFileSync('python3', [join(here, 'members-erase.py'), source, erased], { stdio: 'inherit' });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 2500, height: 1686 } });
await page.goto(`file://${here}members.html?bg=${encodeURIComponent(`file://${erased}`)}`);
const { sizes, jpeg } = await page.evaluate(() => window.render());
await browser.close();
writeFileSync(out, Buffer.from(jpeg.split(',')[1], 'base64'));
console.log(sizes.map(item => `${item.text} ${item.size}px`).join('\n'));
console.log(out, statSync(out).size, 'bytes');
