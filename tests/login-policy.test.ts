import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSignIn } from '../backend/src/security/loginPolicy.js';

test('temporary login lock blocks wrong credentials but never the correct password', () => {
  assert.equal(decideSignIn(240, false, true), 'locked');
  assert.equal(decideSignIn(240, true, false), 'accept');
  assert.equal(decideSignIn(0, false, true), 'record-failure');
  assert.equal(decideSignIn(240, false, false), 'reject');
});
