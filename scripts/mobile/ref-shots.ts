// Screenshots of the owner's mobile design file (the reference), one per screen, for side-by-side checks.
//   npx tsx scripts/mobile/ref-shots.ts "<path to kraroktunngern-Numeric-Value.html>" [width] [height]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const file = process.argv[2];
const width = Number(process.argv[3] || 390), height = Number(process.argv[4] || 844);
const out = path.resolve(import.meta.dirname, '../../artifacts/mobile-ref');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const theme of ['light', 'dark'] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  const page = await ctx.newPage();
  await page.addInitScript(t => { try { if (t === 'dark') localStorage.setItem('kraroktunngern-explicit-appearance-v1', 'dark'); } catch { /* file URL without storage */ } }, theme);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const shot = async (name: string) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${width}-${theme}-${name}.png`) }); };
  await shot('home');
  if (theme === 'light') {
    await page.screenshot({ path: path.join(out, `${width}-light-home-full.png`), fullPage: true });
    const routes = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-nav]')].map(el => el.getAttribute('data-nav')))]);
    console.log('nav targets on the home screen:', routes.join(', '));
    const nav = await page.evaluate(() => { const el = document.querySelector('nav'); return el ? el.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 1800) : 'no nav'; });
    console.log('bottom nav markup:', nav);
    // Screens reached from the bottom bar, then every tool listed on the menu screen.
    const tap = async (selector: string) => { await page.locator(selector).first().click(); await page.waitForTimeout(450); };
    for (const route of ['jobs', 'finance', 'menu']) { await tap(`#bottom-nav [data-nav="${route}"]`); await shot(route); if (route === 'menu') await page.screenshot({ path: path.join(out, `${width}-light-menu-full.png`), fullPage: true }); }
    const tools = await page.evaluate(() => [...new Set([...document.querySelectorAll('#main [data-nav]')].map(el => el.getAttribute('data-nav')))].filter(Boolean) as string[]);
    console.log('tools on the menu screen:', tools.join(', '));
    for (const route of tools) {
      await tap('#bottom-nav [data-nav="menu"]');
      const target = page.locator(`#main [data-nav="${route}"]`).first();
      if (!(await target.count())) continue;
      await target.click(); await page.waitForTimeout(450); await shot(`tool-${route}`);
    }
    // The add-job sheet from the centre button, empty and with a value typed in.
    await tap('#bottom-nav [data-nav="home"]');
    await tap('#bottom-nav [data-action="job:add"]'); await shot('job-form');
    console.log('job form fields:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#sheet input, #sheet select, #sheet textarea, #sheet button')].map(el => `${el.tagName.toLowerCase()}${el.getAttribute('name') ? '[' + el.getAttribute('name') + ']' : ''}${el.getAttribute('inputmode') ? '{' + el.getAttribute('inputmode') + '}' : ''}:${(el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.textContent || '').trim()).slice(0, 26)}`))));
    const value = page.locator('#sheet input[inputmode="decimal"], #sheet input[name="value"]').first();
    if (await value.count()) { await value.click(); await page.keyboard.type('12500.509'); await shot('job-form-value'); console.log('typed 12500.509 ->', await value.inputValue()); }
  }
  console.log(theme, 'errors:', JSON.stringify(errors.slice(0, 3)));
  await ctx.close();
}
await browser.close();
