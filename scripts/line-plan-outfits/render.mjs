// The LINE plan cards' top pictures (services/lineUpgrade.ts, owner 2026-11-18): each plan's outfit (outfit.py, drawn over
// the official mascot poses) large on its card colour. Writes frontend/public/line/plan-hero-{pro,plus,free}-v1.jpg.
// Run: node scripts/line-plan-outfits/render.mjs   (needs python3 with numpy and Pillow; PLAYWRIGHT_EXECUTABLE_PATH for Chrome)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const out = resolve(here, '../../frontend/public/line');
const work = mkdtempSync(join(tmpdir(), 'plan-outfits-'));
execFileSync('python3', [join(here, 'outfit.py'), work], { stdio: 'inherit' });
copyFileSync(join(here, 'hero.html'), join(work, 'hero.html'));
const server = http.createServer((req, res) => {
  const file = join(work, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
  let body;
  try { body = readFileSync(file); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.png') ? 'image/png' : 'text/html' });
  res.end(body);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
for (const plan of ['pro', 'plus', 'free']) {
  const page = await browser.newPage({ viewport: { width: 1040, height: 720 } });
  await page.goto(`http://127.0.0.1:${port}/hero.html?plan=${plan}`);
  await page.waitForFunction(() => window.ready === true);
  await page.screenshot({ path: join(out, `plan-hero-${plan}-v1.jpg`), type: 'jpeg', quality: 88 });
  await page.close();
  console.log(`plan-hero-${plan}-v1.jpg`);
}
await browser.close();
server.close();
