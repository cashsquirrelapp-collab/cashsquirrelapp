// The guest LINE menu picture (guest.html) as a 2500x843 JPEG under LINE's 1 MB limit.
//   node scripts/line-menu/render-guest.mjs   (Chrome: PLAYWRIGHT_EXECUTABLE_PATH or the default install)
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const out = new URL('../../frontend/public/line/richmenu-guest-2026-11-13.jpg', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 2500, height: 843 }, deviceScaleFactor: 1 });
await page.goto(`file://${here}guest.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: out, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 2500, height: 843 } });
await browser.close();
console.log(out, statSync(out).size, 'bytes');
