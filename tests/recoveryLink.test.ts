import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecoveryLink, readRecoveryToken } from '../shared/recoveryLink.js';

test('recovery links keep their token in the fragment, outside the initial HTTP request URL', () => {
  const token = 'admin-recovery_secret-0123456789';
  const link = new URL(buildRecoveryLink('https://example.test', token));

  assert.equal(link.pathname, '/recover');
  assert.equal(link.search, '');
  assert.equal(link.hash, `#r=${token}`);
  assert.equal(readRecoveryToken(link.search, link.hash).token, token);
});

test('recovery links still accept legacy query tokens during their short expiry window', () => {
  const token = 'legacy-recovery_secret-0123456789';
  const recovery = readRecoveryToken(`?r=${token}`, '');

  assert.equal(recovery.present, true);
  assert.equal(recovery.token, token);
});

test('ordinary hash navigation is not treated as a recovery link', () => {
  assert.deepEqual(readRecoveryToken('', '#login'), { token: '', present: false });
});
