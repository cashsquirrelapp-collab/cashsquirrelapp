import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmationDetail } from '../frontend/src/features/billing/confirmationDetail.ts';

// Owner, 2026-10-31: a card payment failed with only the general message. The provider's reason is now shown, with ids,
// secrets and long numbers taken out.
test('the provider reason is shown without ids, secrets or long numbers', () => {
  const error = new Error('Invalid value for confirm(): savePaymentMethod is not allowed for cs_live_a1B2c3D4e5F6g7H8 with key pk_live_51AbCdEfGhIjKl card 4242424242424242');
  error.name = 'IntegrationError';
  const detail = confirmationDetail(error);
  assert.match(detail, /savePaymentMethod is not allowed/);
  assert.doesNotMatch(detail, /cs_live|pk_live|4242424242/);
  assert.match(detail, /\[id\].*\[id\].*\[number\]/);
  assert.equal(confirmationDetail('x'.repeat(500)).length, 220);
  assert.equal(confirmationDetail(undefined), '');
  assert.equal(confirmationDetail({ message: 'not an error' }), '');
});
