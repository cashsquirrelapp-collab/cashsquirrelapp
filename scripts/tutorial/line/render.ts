// Renders the "เชื่อมต่อ LINE" tutorial clip frame by frame.
//
//   npx tsx scripts/tutorial/line/cards.ts        (the real LINE cards)
//   CAPTURE_BASE=... npx tsx scripts/tutorial/line/shots.ts   (the real settings screens)
//   npx tsx scripts/tutorial/line/render.ts stills 1.5 10 26     → artifacts/line-tutorial/stills/*.png
//   npx tsx scripts/tutorial/line/render.ts frames               → artifacts/line-tutorial/frames/*.jpg
//   swift scripts/tutorial/line/encode.swift artifacts/line-tutorial/frames artifacts/line-tutorial/line-tutorial.mp4 30
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'artifacts/line-tutorial');
const SITE = path.join(OUT, 'clip');
const FPS = 30;
const [mode = 'stills', ...args] = process.argv.slice(2);

// 1. the page: bundle, cards, and the pictures it shows
fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });
await build({ entryPoints: [path.join(ROOT, 'scripts/tutorial/line/clip/main.tsx')], bundle: true, format: 'iife', jsx: 'automatic', outfile: path.join(SITE, 'bundle.js'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
const copy = (from: string, to: string) => { fs.mkdirSync(path.dirname(path.join(SITE, to)), { recursive: true }); fs.cpSync(path.join(ROOT, from), path.join(SITE, to), { recursive: true }); };
copy('artifacts/line-tutorial/shots', 'shots');
copy('frontend/public/line', 'line');
copy('frontend/public/icons/app-icon-192-v4.png', 'icons/app-icon-192-v4.png');
copy('frontend/public/landing/line-menu.webp', 'landing/line-menu.webp');
const cards = fs.readFileSync(path.join(OUT, 'cards.json'), 'utf8');
const pictures = [...new Set([...cards.matchAll(/"url":\s*"\/([^"]+)"/g)].map(m => m[1])), ...fs.readdirSync(path.join(SITE, 'shots')).filter(f => !f.startsWith('_')).map(f => `shots/${f}`), 'icons/app-icon-192-v4.png', 'landing/line-menu.webp'];
fs.writeFileSync(path.join(SITE, 'index.html'), `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เชื่อมต่อ LINE กับกระรอกตุนเงิน</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Prompt:wght@600&display=block">
<style>html,body{margin:0;background:#FAFAF9}h1,p{margin:0}#preload{position:absolute;width:0;height:0;overflow:hidden}</style></head>
<body><div id="root"></div><div id="preload">${pictures.map(p => `<img src="${p}" alt="">`).join('')}</div>
<script>window.__CARDS=${cards.replace(/</g, '\\u003c')};</script><script src="bundle.js"></script></body></html>`);

// 2. serve it (card art is addressed from the site root)
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(SITE, decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;

// 3. photograph it
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, locale: 'th-TH' })).newPage();
const problems: string[] = []; page.on('pageerror', e => problems.push(e.message)); page.on('requestfailed', r => problems.push(`failed: ${r.url()}`));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode().catch(() => undefined))); });
const duration: number = await page.evaluate(() => (window as unknown as { __DURATION: number }).__DURATION);
const seek = async (t: number) => {
  await page.evaluate(async time => {
    (window as unknown as { __seek: (t: number) => void }).__seek(time);
    await Promise.all([...document.images].filter(img => !img.complete).map(img => img.decode().catch(() => undefined)));
    await new Promise(requestAnimationFrame);
  }, t);
};
if (mode === 'stills') {
  const dir = path.join(OUT, 'stills'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const value of args.length ? args.map(Number) : [1.5]) { await seek(value); await page.screenshot({ path: path.join(dir, `t${value.toFixed(1).padStart(4, '0')}.png`) }); }
  console.log('stills:', fs.readdirSync(dir).length, '| fonts:', await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')));
} else {
  const dir = path.join(OUT, 'frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await seek(i / FPS);
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  console.log('frames:', total, `(${duration}s at ${FPS} fps)`);
}
if (problems.length) console.log('problems:', [...new Set(problems)].slice(0, 6));
await browser.close(); server.close();
