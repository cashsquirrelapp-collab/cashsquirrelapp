import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liffPageRequest } from '../cloudflare/liffPage';

// The LINE form's address as registered in LINE (/liff-add.html) is answered there, never redirected to /liff-add: LIFF
// reloads the page when its address differs from the endpoint, which cut off the form's first request (2026-11-13).
test('/liff-add.html is asked of the asset store as /liff-add with its query; nothing else is touched', () => {
  const page = liffPageRequest(new Request('https://staging.krarok.com/liff-add.html?liff.state=%3FdraftKind%3Djob'), '/liff-add.html')!;
  assert.equal(page.url, 'https://staging.krarok.com/liff-add?liff.state=%3FdraftKind%3Djob');
  assert.equal(page.method, 'GET');
  assert.equal(liffPageRequest(new Request('https://staging.krarok.com/liff-add.html', { method: 'HEAD' }), '/liff-add.html')!.method, 'HEAD');
  assert.equal(liffPageRequest(new Request('https://staging.krarok.com/liff-add'), '/liff-add'), null);
  assert.equal(liffPageRequest(new Request('https://staging.krarok.com/privacy.html'), '/privacy.html'), null);
  assert.equal(liffPageRequest(new Request('https://staging.krarok.com/liff-add.html', { method: 'POST', body: 'x' }), '/liff-add.html'), null);
  // The Worker asks the asset store with it before anything else.
  assert.match(readFileSync(new URL('../cloudflare/worker.ts', import.meta.url), 'utf8'), /const liffPage = liffPageRequest\(request, path\);\n\s+if \(liffPage\) return env\.ASSETS\.fetch\(liffPage\);/);
});
