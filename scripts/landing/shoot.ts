// Screenshots of the landing page at chosen points of the scroll story, for review.
//
//   npm run build && PORT=3000 npm start   (in another shell)
//   npx tsx scripts/landing/shoot.ts [outDir] [widthxheight ...]
//
// Output goes to artifacts/landing-draft2/ (git-ignored) unless outDir is given.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { BEAT, SCREENS } from '../../frontend/src/features/marketing/landing/story/content';

const BASE = process.env.CAPTURE_BASE || 'http://localhost:3000';
const args = process.argv.slice(2);
const out = args.find(a => !/^\d+x\d+$/.test(a)) || path.resolve(import.meta.dirname, '../../artifacts/landing-draft2');
const sizes = args.filter(a => /^\d+x\d+$/.test(a)).map(a => a.split('x').map(Number));
if (!sizes.length) sizes.push([1440, 900], [390, 844]);
const only = process.env.ONLY?.split(',');
fs.mkdirSync(out, { recursive: true });

const B = BEAT;
// [name, share of the first act's scroll]
const money: [string, number][] = [
  ['01-hero', 0], ['02-gathering', 0.05], ['03-screen', B.seated + 0.02], ['04-zoom', B.zoomed + 0.02], ['05-card', B.card + 0.012],
  ['06-sheet', B.sheet + 0.01], ['07-saved', B.saved + 0.015], ['08-credit', B.credit + 0.03], ['09-to-line', (B.creditHeld + B.line) / 2],
  ['10-line', B.line + 0.012], ['11-typing', B.tap + 0.025], ['12-reply', B.reply + 0.03], ['13-notice-coming', B.notice - 0.036], ['14-notice', B.notice + 0.02], ['15-notice-held', 0.97],
];

const browser = await chromium.launch();
for (const [width, height] of sizes) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 700 ? 2 : 1, locale: 'th-TH', colorScheme: 'light', reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/api/**', r => r.fulfill({ json: { session: null } }));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const tag = `${width}${process.env.REDUCED ? '-reduced' : ''}`;
  const snap = async (name: string, y: number) => {
    if (only && !only.some(o => name.includes(o))) return;
    await page.evaluate(top => window.scrollTo(0, top), y);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
  };
  if (process.env.REDUCED) {
    // Walk down the page first so lazily loaded pictures are in before the full-page picture is taken.
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += height * 0.8) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(180); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400);
    // Pictures kept for the other screen width are display:none and never load; only the ones on show count.
    const pictures = await page.locator('main img').evaluateAll(els => { const shown = els.filter(el => (el as HTMLElement).offsetParent !== null) as HTMLImageElement[]; return { shown: shown.length, notLoaded: shown.filter(el => !el.complete || el.naturalWidth === 0).length }; });
    console.log('pictures', JSON.stringify(pictures));
    await page.screenshot({ path: path.join(out, `${tag}-full.png`), fullPage: true });
  } else {
    const travel = (SCREENS.money - 1) * height;
    for (const [name, at] of money) await snap(name, at * travel);
    const docsTop = await page.evaluate(() => { const el = document.querySelector('#documents section') as HTMLElement; return el.getBoundingClientRect().top + window.scrollY; });
    const docsTravel = (SCREENS.docs - 1) * height;
    for (const [name, at] of [['20-doc-1', 0.04], ['21-doc-2', 0.2], ['22-doc-3', 0.3], ['23-docs-row', 0.38], ['24-vault-in', 0.5], ['25-vault', 0.58], ['26-vault-pick', 0.7], ['27-wht', 0.86], ['28-wht-held', 0.97]] as const) await snap(name, docsTop + at * docsTravel);
    const freeTop = await page.evaluate(() => (document.querySelector('#plans') as HTMLElement).getBoundingClientRect().top + window.scrollY);
    for (const i of [0, 1, 2, 3, 4, 5]) await snap(`30-free-${i}`, freeTop + i * height * 0.8 - height * 0.35);
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    await snap('40-closing-mid', total - height * 1.5);
    await snap('41-closing', total - height);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${width}x${height}`, 'horizontal overflow:', overflow, 'errors:', JSON.stringify([...new Set(errors)].slice(0, 4)));
  await ctx.close();
}
await browser.close();
