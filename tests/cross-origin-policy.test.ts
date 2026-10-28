import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expectedHeader = 'Cross-Origin-Opener-Policy';
const sources = [
  'cloudflare/worker.ts',
  'backend/src/http/securityHeaders.ts',
  'frontend/public/_headers',
  'vercel.json',
];

test('all deployment paths isolate opener contexts with the same-origin policy', () => {
  for (const file of sources) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const hasPolicy = file === 'vercel.json'
      ? (JSON.parse(text) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> })
          .headers.some(route => route.headers.some(header => header.key === expectedHeader && header.value === 'same-origin'))
      : /(?:['"]Cross-Origin-Opener-Policy['"]\s*:\s*['"]same-origin['"]|setHeader\(['"]Cross-Origin-Opener-Policy['"],['"]same-origin['"]\)|^\s*Cross-Origin-Opener-Policy:\s*same-origin)/m.test(text);
    assert.equal(hasPolicy, true, `${file} sets COOP to same-origin`);
  }
});
