import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentBuild, isChunkLoadError, latestBuild } from '../frontend/src/app/appUpdate.js';

// Each reload case gets its own copy of the module, as a freshly opened page would.
let copies = 0;
const freshModule = () => import(`../frontend/src/app/appUpdate.js?copy=${++copies}`) as Promise<typeof import('../frontend/src/app/appUpdate.js')>;

// A minimal browser for the reload rules: an address, a reload counter and session storage.
function fakeBrowser(path = '/receivables') {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const timers: Array<() => void> = [];
  Object.assign(globalThis, {
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
    window: {
      location: { pathname: path, search: '', reload: () => calls.push('reload'), assign: (to: string) => calls.push(`assign ${to}`) },
      setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    },
  });
  return { calls, store, timers };
}

test('a failed on-demand import is recognised in every browser, other errors are not', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: https://example.com/assets/InvoiceTab-Ab12.js', // Chrome
    'Importing a module script failed.', // Safari
    'error loading dynamically imported module: https://example.com/assets/x.js', // Firefox
    "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\".",
    'Unable to preload CSS for /assets/InvoiceTab-Ab12.css', // Vite
  ]) assert.equal(isChunkLoadError(new TypeError(message)), true, message);
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 7 failed.' }), true);
  for (const message of ["Cannot read properties of undefined (reading 'amount')", 'Network request failed', 'กรุณาเข้าสู่ระบบ'])
    assert.equal(isChunkLoadError(new Error(message)), false, message);
  assert.equal(isChunkLoadError(null), false);
});

test('the running and the newest build are read from the page', async () => {
  const doc = (src: string | null) => ({ querySelector: () => (src === null ? null : { getAttribute: () => src }) }) as unknown as Document;
  assert.equal(currentBuild(doc('/assets/index-DVXbPsn0.js')), '/assets/index-DVXbPsn0.js');
  assert.equal(currentBuild(doc('/src/main.tsx')), null, 'development has no build file');
  assert.equal(currentBuild(doc(null)), null);

  const page = (status: number, html: string) => (async () => new Response(html, { status })) as unknown as typeof fetch;
  assert.equal(await latestBuild(page(200, '<script type="module" crossorigin src="/assets/index-Crp9WHc8.js"></script>')), '/assets/index-Crp9WHc8.js');
  assert.equal(await latestBuild(page(503, 'busy')), null);
  assert.equal(await latestBuild(page(200, '<html>no build here</html>')), null);
  assert.equal(await latestBuild((async () => { throw new TypeError('offline'); }) as unknown as typeof fetch), null);
});

test('opening the new build waits for saves and never loops', async () => {
  const { reloadForUpdate, reloadWhenSafe, setUpdateGuard } = await freshModule();
  const browser = fakeBrowser('/receivables');
  let saving = true;
  setUpdateGuard(() => !saving);
  assert.equal(reloadForUpdate('/jobs'), false, 'not while a save is on its way');
  assert.deepEqual(browser.calls, []);
  saving = false;
  assert.equal(reloadForUpdate('/jobs'), true);
  assert.deepEqual(browser.calls, ['assign /jobs']);
  assert.equal(reloadWhenSafe(), true, 'already on its way: the error screen says so');
  assert.deepEqual(browser.calls, ['assign /jobs'], 'and nothing reloads twice');

  // The new page fails again within seconds (a real outage): no second reload, the error shows.
  const again = await freshModule();
  assert.equal(again.reloadForUpdate('/jobs'), false);
  assert.equal(again.reloadWhenSafe(), false);
  assert.deepEqual(browser.calls, ['assign /jobs']);
});

test('after a failed import the page reloads once the save on its way is done', async () => {
  const { reloadWhenSafe, setUpdateGuard } = await freshModule();
  const browser = fakeBrowser('/receivables');
  let saving = true;
  setUpdateGuard(() => !saving);
  assert.equal(reloadWhenSafe(), true);
  assert.deepEqual(browser.calls, [], 'waits while saving');
  saving = false;
  browser.timers.shift()!();
  assert.deepEqual(browser.calls, ['reload'], 'the same address, in the new build');
});
