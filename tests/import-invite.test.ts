import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferImport } from '../frontend/src/features/import/importInvite.ts';

// "ย้ายข้อมูลเข้าแอป" on the overview (owner, 2026-11-04): only an account of one's own with nothing recorded, until ไม่ต้อง.
test('the overview offers the import only to an empty account of its own that has not said ไม่ต้อง', () => {
  const empty = { jobs: 0, expenses: 0, dismissed: false, guest: false, groupWorkspace: false };
  assert.equal(shouldOfferImport(empty), true);
  assert.equal(shouldOfferImport({ ...empty, jobs: 1 }), false);
  assert.equal(shouldOfferImport({ ...empty, expenses: 3 }), false);
  assert.equal(shouldOfferImport({ ...empty, dismissed: true }), false);
  assert.equal(shouldOfferImport({ ...empty, guest: true }), false);
  assert.equal(shouldOfferImport({ ...empty, groupWorkspace: true }), false);
});
