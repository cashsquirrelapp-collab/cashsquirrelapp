import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPassword, passwordRequirements } from '../shared/passwordPolicy.ts';

// Owner, 2026-10-21: the old rules (upper, lower, digit and symbol) were too strict.
test('8 characters with a letter and a digit are enough', () => {
  assert.equal(isValidPassword('squirrel1'), true);
  assert.equal(isValidPassword('กระรอก2569'), true); // Thai letters count as letters
  assert.equal(isValidPassword('Squirrel!2026'), true); // the old strong form still works
});

test('too short, no digit, no letter or too long is refused', () => {
  assert.equal(isValidPassword('abc123'), false);
  assert.equal(isValidPassword('onlyletters'), false);
  assert.equal(isValidPassword('12345678'), false);
  assert.equal(isValidPassword(`a1${'x'.repeat(127)}`), false);
  assert.deepEqual(passwordRequirements('abc'), { length: false, letter: true, number: false });
});
