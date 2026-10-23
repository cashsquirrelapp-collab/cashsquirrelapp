import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChanges } from '../shared/validation.ts';
import { calculateDocumentTotals, formatDocDate, formatMoney, thaiBahtText } from '../frontend/src/features/invoices/documentMath.ts';

test('thaiBahtText reads common amounts', () => {
  assert.equal(thaiBahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(thaiBahtText(1), 'หนึ่งบาทถ้วน');
  assert.equal(thaiBahtText(11), 'สิบเอ็ดบาทถ้วน');
  assert.equal(thaiBahtText(21), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.equal(thaiBahtText(101), 'หนึ่งร้อยเอ็ดบาทถ้วน');
  assert.equal(thaiBahtText(1250.5), 'หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์');
  assert.equal(thaiBahtText(15000), 'หนึ่งหมื่นห้าพันบาทถ้วน');
  assert.equal(thaiBahtText(1000000), 'หนึ่งล้านบาทถ้วน');
  assert.equal(thaiBahtText(1000001), 'หนึ่งล้านเอ็ดบาทถ้วน');
  assert.equal(thaiBahtText(2500000.25), 'สองล้านห้าแสนบาทยี่สิบห้าสตางค์');
  assert.equal(thaiBahtText(0.01), 'หนึ่งสตางค์');
});

test('document totals apply line discounts, VAT and withholding', () => {
  const items = [{ id: 'a', description: 'x', quantity: 2, price: 1000, discount: 200 }, { id: 'b', description: 'y', quantity: 1, price: 500 }];
  const t = calculateDocumentTotals(items, 7, 3);
  assert.equal(t.gross, 2500);
  assert.equal(t.discount, 200);
  assert.equal(t.subtotal, 2300);
  assert.equal(t.vatAmount, 161);
  assert.equal(t.total, 2461);
  assert.equal(t.whtAmount, 69);
  assert.equal(t.payable, 2392);
});

test('money and date formatting', () => {
  assert.equal(formatMoney(1234.5), '1,234.50');
  assert.equal(formatDocDate('2026-09-26'), '26/09/2026');
  assert.equal(formatDocDate(''), '');
});

test('invoice validation accepts the new document types and keeps the new fields', () => {
  const profile = { name: 'a', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
  const data = {
    id: 'x', documentType: 'receiptTaxInvoice', documentNo: 'RTX-1', createdDate: '2026-09-26', issuer: profile,
    client: { name: 'c', address: '', phone: '', email: '', taxId: '', contactName: 'k', code: 'C1', branch: 'HQ' },
    items: [{ id: 'i', description: 'd', quantity: 1, price: 10, discount: 2, unit: 'งาน', detail: 'more' }],
    vatRate: 7, whtRate: 0, paidDate: '2026-09-27', paymentMethod: 'โอน', paidAmount: 5
  };
  const [change] = validateChanges([{ table: 'cashflow_invoices', id: 'x', op: 'set', version: null, data }]);
  assert.deepEqual((change.data as any).items[0], data.items[0]);
  assert.deepEqual((change.data as any).client, data.client);
  assert.equal((change.data as any).paidAmount, 5);
  assert.throws(() => validateChanges([{ table: 'cashflow_invoices', id: 'x', op: 'set', version: null, data: { ...data, documentType: 'bogus' } }]));
});
