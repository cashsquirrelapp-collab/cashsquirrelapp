import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const source = await readFile(resolve('frontend/public/icons/app-icon-v2.svg'), 'utf8');
const outputs = [
  { size: 512, path: 'frontend/public/icons/app-icon-512-v2.png' },
  { size: 192, path: 'frontend/public/icons/app-icon-192-v2.png' },
  { size: 180, path: 'frontend/public/apple-touch-icon-v2.png' },
];
const browser = await chromium.launch({ headless: true });

try {
  for (const output of outputs) {
    const page = await browser.newPage({ viewport: { width: output.size, height: output.size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body,svg{display:block;width:100%;height:100%;margin:0}</style>${source}`);
    await page.screenshot({ path: resolve(output.path), omitBackground: false });
    await page.close();
  }
} finally {
  await browser.close();
}
