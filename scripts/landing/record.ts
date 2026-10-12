// A screen recording of the landing page being scrolled with the mouse wheel, for review.
//
//   npm run build && PORT=3100 npm start   (in another shell)
//   CAPTURE_BASE=http://localhost:3100 npx tsx scripts/landing/record.ts
//
// Writes artifacts/landing-draft2/scroll-<width>.webm (git-ignored).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE || 'http://localhost:3000';
const out = path.resolve(import.meta.dirname, '../../artifacts/landing-draft2');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const [width, height] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'th-TH', colorScheme: 'light', recordVideo: { dir: out, size: { width, height } } });
  const page = await ctx.newPage();
  await page.route('**/api/**', r => r.fulfill({ json: { session: null } }));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.mouse.move(width / 2, height / 2);
  await page.waitForTimeout(1800);
  const wheel = async (distance: number, speed: number) => {
    const step = Math.sign(distance) * Math.max(4, Math.round(speed / 60));
    for (let done = 0; Math.abs(done) < Math.abs(distance); done += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(16); }
  };
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await wheel(height * 3.2, 620);          // hero to the job card
  await wheel(-height * 1.6, 900);         // back up: the story runs in reverse
  await wheel(total - height * 1.6 + 40, 760); // and on to the end
  await page.waitForTimeout(1500);
  const video = page.video();
  await ctx.close();
  const file = path.join(out, `scroll-${width}.webm`);
  if (video) { fs.rmSync(file, { force: true }); fs.renameSync(await video.path(), file); console.log('recorded', path.relative(process.cwd(), file), `${Math.round(fs.statSync(file).size / 1024)} KB`); }
}
await browser.close();
