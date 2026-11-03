import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasHeicBytes, isHeicFile } from '../frontend/src/utils/heic.js';

// Owner, 2026-11-04: "ฝากทำให้มันรับนามสกุลภาพนี้ด้วย" (an iPhone .heic photo). The app spots HEIC by its type, its name, or
// (with neither) its first bytes, and turns it into a JPEG before the chat or the vault use it.
test('a HEIC is spotted by its type or its name; other pictures are not', () => {
  for (const file of [{ type: 'image/heic', name: 'a' }, { type: 'image/HEIF', name: 'a' }, { type: '', name: 'IMG_3095.heic' }, { type: '', name: 'x.HEIF' }]) assert.equal(isHeicFile(file), true, JSON.stringify(file));
  for (const file of [{ type: 'image/jpeg', name: 'a.jpg' }, { type: 'image/png', name: 'heic.png' }, { type: 'application/pdf', name: 'a.pdf' }]) assert.equal(isHeicFile(file), false, JSON.stringify(file));
});

test('with no type and no telling name, its first bytes say HEIC', async () => {
  const heic = readFileSync(new URL('./e2e/fixtures/sample.heic', import.meta.url));
  assert.equal(await hasHeicBytes(new Blob([heic])), true);
  assert.equal(await hasHeicBytes(new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])])), false, 'a JPEG');
  assert.equal(await hasHeicBytes(new Blob([Buffer.from('short')])), false);
});
