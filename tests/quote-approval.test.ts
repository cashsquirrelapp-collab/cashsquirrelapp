import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuoteToken, readQuoteToken } from '../backend/src/services/quoteLink.js';
import { quoteAcceptSchema, quoteRevision } from '../shared/quoteApproval.js';

const secret = 'x'.repeat(40);
const link = { owner: '11111111-1111-4111-8111-111111111111', document: 'd0000001-0000-4000-8000-000000000001', revision: 'abcd1234abcd1234' };

test('quotation link: reads back what it was made with', () => {
  const token = makeQuoteToken(link, secret, 1_000);
  const read = readQuoteToken(token, secret, 2_000);
  assert.deepEqual({ ...read, expires: undefined }, { ...link, expires: undefined });
  assert.ok(token.length < 300);
});

test('quotation link: a changed character, another key or an old link is refused', () => {
  const token = makeQuoteToken(link, secret, 1_000);
  const flipped = token.slice(0, 10) + (token[10] === 'A' ? 'B' : 'A') + token.slice(11);
  assert.equal(readQuoteToken(flipped, secret, 2_000), null);
  assert.equal(readQuoteToken(token, 'y'.repeat(40), 2_000), null);
  assert.equal(readQuoteToken(token, secret, 1_000 + 61 * 86_400_000), null);
  assert.equal(readQuoteToken(`${token}.x`, secret, 2_000), null);
  assert.equal(readQuoteToken('', secret, 2_000), null);
});

test('quotation revision: any change the client agrees to makes a new one; saved notes do not', () => {
  const base = { documentNo: 'QT-1', createdDate: '2026-11-22', client: { name: 'A', address: '', phone: '', email: '', taxId: '' }, items: [{ id: '1', description: 'งาน', quantity: 1, price: 1000 }], vatRate: 0, whtRate: 0, issuer: { name: 'B', taxId: '', address: '', phone: '', email: '', bankName: '', bankAccount: '', bankAccountName: '' } } as any;
  const first = quoteRevision(base);
  assert.match(first, /^[0-9a-f]{16}$/);
  assert.equal(quoteRevision({ ...base, approvalRequestedAt: 'x' }), first);
  assert.notEqual(quoteRevision({ ...base, items: [{ ...base.items[0], price: 1001 }] }), first);
  assert.notEqual(quoteRevision({ ...base, vatRate: 7 }), first);
  assert.notEqual(quoteRevision({ ...base, client: { ...base.client, name: 'C' } }), first);
});

test('quotation confirmation input: a name, a PNG signature and the tick', () => {
  const ok = { action: 'accept', token: 'a'.repeat(40), name: 'สมชาย', signature: 'data:image/png;base64,AAAA', agree: true };
  assert.equal(quoteAcceptSchema.safeParse(ok).success, true);
  assert.equal(quoteAcceptSchema.safeParse({ ...ok, agree: false }).success, false);
  assert.equal(quoteAcceptSchema.safeParse({ ...ok, name: ' ' }).success, false);
  assert.equal(quoteAcceptSchema.safeParse({ ...ok, signature: 'data:image/svg+xml;base64,AAAA' }).success, false);
});
