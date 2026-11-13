// LINE card titles in the CI typeface (Prompt 700). LINE draws a card's words with the phone's own font,
// so the fixed word at the top of each kind of card is a picture (owner, 2026-11-14: "ใช้ฟอนต์ CI").
// Run: node scripts/render-line-titles.mjs (PLAYWRIGHT_EXECUTABLE_PATH may point at Chrome).
// Writes frontend/public/line/titles-v1/<key>.png at 2× and backend/src/services/lineTitleImages.ts with their sizes.
// Changing a word: bump the folder (titles-v2) so LINE, which keeps pictures by address, shows the new one.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FOLDER = 'titles-v1';
const WHITE = '#FFFFFF', INK = '#1C1917';
// key: [words (a line break as \n), colour]. White sits on the deep document/notice headers, ink on the pastel money headers.
const TITLES = {
  quotation: ['ใบเสนอราคา', WHITE],
  invoice: ['ใบแจ้งหนี้', WHITE],
  'tax-invoice': ['ใบกำกับภาษี', WHITE],
  receipt: ['ใบเสร็จรับเงิน', WHITE],
  'receipt-tax-invoice': ['ใบเสร็จรับเงิน\nใบกำกับภาษี', WHITE],
  document: ['เอกสาร', WHITE],
  assistant: ['เลขากระรอก', WHITE],
  line: ['เชื่อมต่อ LINE', WHITE],
  review: ['บันทึกรายการ', WHITE],
  work: ['งาน', WHITE],
  update: ['อัปเดตรายการ', WHITE],
  report: ['รายงาน', WHITE],
  reminder: ['แจ้งเตือน', WHITE],
  expense: ['รายจ่าย', INK],
  income: ['รายรับ', INK],
  saving: ['เงินออม', INK],
  withdraw: ['ถอนเงินออม', INK],
};

const out = resolve('frontend/public/line', FOLDER);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const sizes = {};
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 300 }, deviceScaleFactor: 2 });
  for (const [key, [words, colour]] of Object.entries(TITLES)) {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@700&display=block" rel="stylesheet">
<style>html,body{margin:0;background:transparent}#t{display:inline-block;font:700 44px/1.3 'Prompt';padding:4px 2px;white-space:pre;color:${colour}}</style>
</head><body><div id="t">${words.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    if (!await page.evaluate(() => document.fonts.check("700 44px 'Prompt'", 'ก'))) throw new Error('Prompt did not load');
    const element = await page.$('#t');
    await element.screenshot({ path: resolve(out, `${key}.png`), omitBackground: true });
    const box = await element.boundingBox();
    sizes[key] = { words: words.replace('\n', ' '), width: Math.round(box.width), height: Math.round(box.height) };
  }
  // The brand symbol in CI orange for the pastel headers (LINE shows PNG, not SVG).
  const symbol = await readFile(resolve('frontend/public/brand/logo01-v1/symbol-ci.svg'), 'utf8');
  const icon = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 2 });
  await icon.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:64px;height:64px}</style>${symbol}`);
  await icon.screenshot({ path: resolve('frontend/public/brand/logo01-v1/symbol-ci.png'), omitBackground: true });
} finally {
  await browser.close();
}

const lines = Object.entries(sizes).map(([key, s]) => `  '${key}': { words: '${s.words}', width: ${s.width}, height: ${s.height} },`);
await writeFile(resolve('backend/src/services/lineTitleImages.ts'), `// Made by scripts/render-line-titles.mjs: the CI-typeface title pictures in /line/${FOLDER}/ and their sizes (CSS pixels at 44px).
export const LINE_TITLE_FOLDER = '/line/${FOLDER}';
export const LINE_TITLE_IMAGES = {
${lines.join('\n')}
} as const;
export type LineTitleKey = keyof typeof LINE_TITLE_IMAGES;
`);
console.log(sizes);
