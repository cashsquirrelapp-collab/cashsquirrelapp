import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentA4 } from '../frontend/src/features/invoices/DocumentA4';
import type { Invoice } from '../shared/types';

// A receipt says when the money came in, how, and how much (owner, 2026-10-30: "ใส่วันที่รับเงินกับวิธีชำระลงในใบเสร็จด้วย"):
// the same sheet is the app's preview, its PDF and the picture sent into LINE.
const base: Invoice = {
  id: 'r1', documentType: 'receipt', documentNo: 'REC-2569-0001', createdDate: '2026-10-30',
  issuer: { name: 'สตูดิโอตัวอย่าง', address: 'กรุงเทพฯ', phone: '089-999-9999', email: '', taxId: '0105561234567', bankName: '', bankAccount: '', bankAccountName: '' },
  client: { name: 'คุณบี', address: '', phone: '', email: '', taxId: '' },
  items: [{ id: 'i1', description: 'ตัดต่อวิดีโอ', quantity: 1, price: 5000 }], vatRate: 0, whtRate: 0,
  paidDate: '2026-10-29', paymentMethod: 'โอนเงิน',
};
const sheet = (invoice: Invoice) => renderToStaticMarkup(React.createElement(DocumentA4, { invoice, print: true })).replace(/<!-- -->/g, '');

test('a receipt shows the day the money came in, how it was paid and the amount received', () => {
  const html = sheet(base);
  for (const text of ['การรับชำระเงิน', 'วันที่รับเงิน :', 'วิธีชำระเงิน :', 'โอนเงิน', 'จำนวนเงินที่ได้รับ :', '5,000.00 บาท']) assert.ok(html.includes(text), text);
  assert.match(html, /29\/10\/2026|29 ต\.ค\./);
  assert.ok(!html.includes('กำหนดชำระ :'), 'a receipt has no due date');
  // a part payment shows what came in; nothing said shows a dash, never a guess
  assert.ok(sheet({ ...base, paidAmount: 2000 }).includes('2,000.00 บาท'));
  const blank = sheet({ ...base, paidDate: undefined, paymentMethod: undefined });
  assert.match(blank, /วันที่รับเงิน :<\/span><span>-<\/span>/);
  assert.match(blank, /วิธีชำระเงิน :<\/span><span>-<\/span>/);
  assert.ok(sheet({ ...base, documentType: 'receiptTaxInvoice', vatRate: 7 }).includes('การรับชำระเงิน'));
});

test('other documents keep their payment section and have no received block', () => {
  for (const documentType of ['quotation', 'invoice', 'taxInvoice'] as const) {
    assert.ok(!sheet({ ...base, documentType }).includes('การรับชำระเงิน'), documentType);
  }
});
