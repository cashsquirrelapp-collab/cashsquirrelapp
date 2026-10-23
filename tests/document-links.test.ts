import assert from 'node:assert/strict';
import test from 'node:test';
import type { Invoice } from '../shared/types';
import { clientHasMoreDetails, documentChain, draftFromSource, findSavedClient, savedClients } from '../frontend/src/features/invoices/documentLinks';

const issuer = { name: 'ผู้ใช้ตัวอย่าง', address: '', phone: '', email: 'me@example.com', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
const client = (name: string, extra: Partial<Invoice['client']> = {}) => ({ name, address: '', phone: '', email: '', taxId: '', ...extra });
const doc = (id: string, documentType: Invoice['documentType'], createdDate: string, extra: Partial<Invoice> = {}): Invoice => ({
  id, documentType, documentNo: id.toUpperCase(), createdDate, issuer, client: client('ลูกค้าตัวอย่าง'), items: [{ id: 'i1', description: 'งาน', quantity: 1, price: 1000 }], vatRate: 0, whtRate: 3, ...extra,
});

test('a quotation, its invoice and the receipt form one chain, oldest first, from any of them', () => {
  const quotation = doc('qt-1', 'quotation', '2026-10-01');
  const invoice = doc('inv-1', 'invoice', '2026-10-05', { linkedFromId: 'qt-1' });
  const receipt = doc('rc-1', 'receipt', '2026-10-09', { linkedFromId: 'inv-1' });
  const other = doc('inv-2', 'invoice', '2026-10-06');
  const all = [receipt, other, invoice, quotation];
  for (const id of ['qt-1', 'inv-1', 'rc-1']) assert.deepEqual(documentChain(all, id).map(d => d.id), ['qt-1', 'inv-1', 'rc-1']);
  assert.deepEqual(documentChain(all, 'inv-2'), []); // not linked to anything
});

test('a deleted source or a loop never breaks the chain', () => {
  const orphan = doc('inv-1', 'invoice', '2026-10-05', { linkedFromId: 'gone' });
  assert.deepEqual(documentChain([orphan], 'inv-1'), []);
  const a = doc('a', 'invoice', '2026-10-01', { linkedFromId: 'b' });
  const b = doc('b', 'receipt', '2026-10-02', { linkedFromId: 'a' });
  assert.equal(documentChain([a, b], 'a').length, 2);
});

test('issuing onward copies the client, items and taxes, references the source and links to it', () => {
  const source = doc('qt-1', 'quotation', '2026-10-01', { client: client('สตูดิโอตัวอย่าง', { taxId: '0000000000000' }), paymentTerm: 'เครดิต 30 วัน', note: 'ขอบคุณ' });
  const draft = draftFromSource(source, 'invoice', '2026-10-20');
  assert.equal(draft.documentType, 'invoice');
  assert.equal(draft.refNo, 'QT-1');
  assert.equal(draft.linkedFromId, 'qt-1');
  assert.deepEqual(draft.client, source.client);
  assert.notEqual(draft.client, source.client); // a copy, not the same object
  assert.equal(draft.items[0].price, 1000);
  assert.notEqual(draft.items[0].id, source.items[0].id);
  assert.equal(draft.whtRate, 3);
  assert.equal(draft.paymentTerm, 'เครดิต 30 วัน');
  assert.equal(draft.createdDate, '2026-10-20');
});

test('saved clients keep the newest details per name and are found case-insensitively', () => {
  const older = doc('a', 'invoice', '2026-09-01', { client: client('Studio Example', { address: 'เก่า' }) });
  const newer = doc('b', 'invoice', '2026-10-01', { client: client('studio example', { address: 'ใหม่', email: 'a@example.com' }) });
  const list = savedClients([older, newer, doc('c', 'invoice', '2026-10-02', { client: client('  ') })]);
  assert.equal(list.length, 1);
  assert.equal(list[0].address, 'ใหม่');
  assert.equal(findSavedClient(list, 'STUDIO EXAMPLE')?.email, 'a@example.com');
  assert.equal(findSavedClient(list, ''), null);
  assert.equal(clientHasMoreDetails(list[0], client('studio example')), true);
  assert.equal(clientHasMoreDetails(list[0], { ...list[0] }), false);
});

test('documents missing a date or a client never break the helpers', () => {
  const broken = { id: 'x', documentType: 'quotation', documentNo: 'QT-X', items: [] } as unknown as Invoice;
  const fine = doc('a', 'invoice', '2026-10-01', { linkedFromId: 'x' });
  assert.doesNotThrow(() => savedClients([broken, fine]));
  assert.doesNotThrow(() => documentChain([broken, fine], 'a'));
  assert.equal(savedClients([broken, fine]).length, 1);
});
