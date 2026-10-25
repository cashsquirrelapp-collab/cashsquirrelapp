import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

// Tests block third-party requests, including the app's Google Fonts imports. Load the same
// font families from licensed local fixtures before measuring ink, instead of relying on an
// OS-specific Thai fallback. This changes neither application CSS nor overlap tolerances.
const sources = [
  { family: 'IBM Plex Sans Thai', weight: '400', file: 'IBMPlexSansThai-Regular.ttf' },
  { family: 'IBM Plex Sans Thai', weight: '500', file: 'IBMPlexSansThai-Medium.ttf' },
  { family: 'IBM Plex Sans Thai', weight: '600', file: 'IBMPlexSansThai-SemiBold.ttf' },
  { family: 'Noto Sans Thai Looped', weight: '100 900', file: 'NotoSansThaiLooped.ttf' },
].map(({ file, ...face }) => ({ ...face, data: readFileSync(new URL(`./fixtures/fonts/${file}`, import.meta.url)).toString('base64') }));

export async function loadLayoutFonts(page: Page): Promise<void> {
  if (await page.evaluate(() => document.documentElement.dataset.layoutFonts === 'ready')) return;
  await page.evaluate(async fonts => {
    // Binary FontFace sources need no network URL and preserve the production font-src CSP.
    const faces = fonts.map(font => new FontFace(font.family, Uint8Array.from(atob(font.data), character => character.charCodeAt(0)), { weight: font.weight }));
    await Promise.all(faces.map(face => face.load()));
    for (const face of faces) document.fonts.add(face);
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    document.documentElement.dataset.layoutFonts = 'ready';
  }, sources);
}
