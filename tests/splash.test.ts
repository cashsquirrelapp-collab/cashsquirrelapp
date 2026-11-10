import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSEMBLED_MS, NAME_PARTS, readyToLeave } from '../frontend/src/app/splash.ts';

// The opening logo, look A (owner, 2026-11-11): it hands over only once it has assembled and the page is ready.

test('the name is split into letter groups that spell กระรอกตุนเงิน, marks kept with their letter', () => {
  assert.equal(NAME_PARTS.join(''), 'กระรอกตุนเงิน');
  assert.ok(NAME_PARTS.includes('ตุ') && NAME_PARTS.includes('งิ'));
});

test('it waits for the logo to assemble, then for the page placeholders (at most 2.5 s), and gives up after 4 s', () => {
  const askedAt = 10_000;
  // not assembled yet
  assert.equal(readyToLeave({ morphAt: 0, askedAt, now: askedAt + 100, placeholders: false }), false);
  assert.equal(readyToLeave({ morphAt: askedAt, askedAt, now: askedAt + ASSEMBLED_MS - 1, placeholders: false }), false);
  // assembled, page ready
  assert.equal(readyToLeave({ morphAt: askedAt, askedAt, now: askedAt + ASSEMBLED_MS, placeholders: false }), true);
  // assembled, page still drawing placeholders: waits up to 2.5 s after the app asked
  assert.equal(readyToLeave({ morphAt: askedAt - 2000, askedAt, now: askedAt + 2499, placeholders: true }), false);
  assert.equal(readyToLeave({ morphAt: askedAt - 2000, askedAt, now: askedAt + 2500, placeholders: true }), true);
  // never assembled (its code never ran): goes 4 s after the app asked
  assert.equal(readyToLeave({ morphAt: 0, askedAt, now: askedAt + 4000, placeholders: true }), true);
});
