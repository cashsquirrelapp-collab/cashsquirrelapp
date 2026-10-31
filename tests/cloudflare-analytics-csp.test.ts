import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productionCsp } from '../backend/src/http/securityHeaders.js';

const scriptHost = 'https://static.cloudflareinsights.com';
const beaconHost = 'https://cloudflareinsights.com';

function assertAnalyticsSources(csp: string, source: string) {
  const directives = new Map(csp.split(';').map(part => {
    const [name, ...values] = part.trim().split(/\s+/);
    return [name, values];
  }));
  assert.ok(directives.get('script-src')?.includes(scriptHost), `${source} permits the Cloudflare Insights script host`);
  assert.ok(directives.get('connect-src')?.includes(beaconHost), `${source} permits the Cloudflare Insights beacon host`);
}

test('production CSP permits only the required Cloudflare Web Analytics hosts', () => {
  assertAnalyticsSources(productionCsp, 'backend');

  const worker = readFileSync(new URL('../cloudflare/worker.ts', import.meta.url), 'utf8');
  const workerCsp = worker.match(/'Content-Security-Policy':\s*("[^"]+")/)?.[1];
  assert.ok(workerCsp, 'Cloudflare Worker has a CSP string');
  assertAnalyticsSources(JSON.parse(workerCsp), 'Cloudflare Worker');

  const staticHeaders = readFileSync(new URL('../frontend/public/_headers', import.meta.url), 'utf8');
  const staticCsp = staticHeaders.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
  assert.ok(staticCsp, 'static asset headers have a CSP string');
  assertAnalyticsSources(staticCsp, 'static asset headers');

  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
    headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  };
  const vercelCsp = vercel.headers.flatMap(route => route.headers).find(header => header.key === 'Content-Security-Policy')?.value;
  assert.ok(vercelCsp, 'Vercel headers have a CSP string');
  assertAnalyticsSources(vercelCsp, 'Vercel');
});

test('PWA metadata keeps iOS support and declares the standard mobile capability', () => {
  const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"\s*\/>/);
  assert.match(html, /<meta\s+name="mobile-web-app-capable"\s+content="yes"\s*\/>/);
});
