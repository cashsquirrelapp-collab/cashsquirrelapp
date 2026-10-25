import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox, type Proposal } from '../backend/src/ai/tools';
import { reviseProposal, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';

// Owner, 2026-10-25 ("ทำให้มันมีปุ่มแก้ไข"): a quotation card has the same แก้ไข button as a job card. The client, the
// lines, VAT, withholding and the date change on the card; the tool prepares the card again with every check, the
// quotation keeps its number, and the old card is cancelled. Synthetic data only.

const USER = '22222222-2222-4222-8222-222222222222';
const user = () => ({ user_id: USER, statuses: [], goals: [], expenses: [], settings: {}, jobs: [], invoices: [],
  issuer_profile: { name: 'ผู้ออกตัวอย่าง', address: 'ที่อยู่ตัวอย่าง', phone: '', email: '', taxId: '' } } as any);
const quote = { document_type: 'quotation', client: { name: 'ลูกค้าตัวอย่าง' }, items: [{ description: 'ออกแบบโลโก้งาน', quantity: 1, price: 3000 }] };

function store() {
  const saved: StoredProposal[] = [];
  const cancelled: string[] = [];
  const db = {
    getProposal: async (owner: string, id: string) => saved.find(proposal => proposal.id === id && proposal.userId === owner) ?? null,
    loadAccount: async () => ({ user: user(), versions: {}, absentRecords: [] }),
    saveProposal: async (proposal: StoredProposal) => { saved.push(proposal); },
    cancelProposal: async (_owner: string, id: string) => { cancelled.push(id); return true; },
  } as unknown as AssistantDb;
  const proposals = { save: async (proposal: Proposal) => { saved.push({ ...proposal, baseVersion: null }); } };
  return { saved, cancelled, db, proposals };
}
const row = (card: any, label: string) => card.changes.find((change: any) => change.label === label)?.value;

test('a quotation card can be edited: client, line, VAT and withholding, with the same number', async () => {
  const { saved, cancelled, db, proposals } = store();
  const execute = createToolbox({ user: user(), proposals, memory: { remember: async () => undefined } });
  const prepared = await execute({ id: 'a', name: 'propose_add_document', args: quote });
  const card = prepared.card as any;
  assert.equal(card.kind, 'confirm', JSON.stringify(prepared.result));
  assert.deepEqual(card.edit.map((field: any) => [field.field, field.label, field.value]), [
    ['client_name', 'ลูกค้า', 'ลูกค้าตัวอย่าง'],
    ['item_1_description', 'รายการ', 'ออกแบบโลโก้งาน'], ['item_1_quantity', 'จำนวน', '1'], ['item_1_price', 'ราคาต่อหน่วย (บาท)', '3000'],
    ['vat_rate', 'VAT (%)', '0'], ['wht_rate', 'หัก ณ ที่จ่าย (%)', '0'], ['created_date', 'วันที่เอกสาร', card.edit.at(-1).value],
  ]);
  assert.match(card.edit.at(-1).value, /^\d{4}-\d{2}-\d{2}$/);
  const number = (saved[0].record as any).documentNo;
  const { card: next } = await reviseProposal(db, USER, card.id, { client_name: 'ร้านกาแฟตัวอย่าง', item_1_quantity: '2', item_1_price: '3,500', vat_rate: '7', wht_rate: '3' });
  const revised = next as any;
  assert.notEqual(revised.id, card.id);
  assert.deepEqual(cancelled, [card.id]);
  assert.equal((saved.at(-1)!.record as any).documentNo, number, 'the quotation keeps its number');
  assert.match(row(revised, 'ผู้ออก / ลูกค้า'), /ร้านกาแฟตัวอย่าง/);
  assert.match(row(revised, 'รายการ 1'), /ออกแบบโลโก้งาน · 2 หน่วย × ฿3,500\.00/);
  assert.equal(row(revised, 'รวมก่อนภาษี'), '฿7,000.00');
  assert.equal(row(revised, 'VAT 7%'), '฿490.00');
  assert.equal(row(revised, 'หัก ณ ที่จ่าย 3%'), '฿210.00');
  // The new card can be edited again, from its own values.
  assert.equal(revised.edit.find((field: any) => field.field === 'item_1_price').value, '3500');
});

test('edits are checked again: bad numbers are refused, and only the card\'s own fields', async () => {
  const { db, proposals } = store();
  const execute = createToolbox({ user: user(), proposals, memory: { remember: async () => undefined } });
  const card = (await execute({ id: 'a', name: 'propose_add_document', args: quote })).card as any;
  await assert.rejects(reviseProposal(db, USER, card.id, { item_1_price: '-5' }), (error: any) => error.status === 422);
  await assert.rejects(reviseProposal(db, USER, card.id, { note: 'x' } as any), /แก้ช่องนี้ในการ์ดไม่ได้/);
  await assert.rejects(reviseProposal(db, '33333333-3333-4333-8333-333333333333', card.id, { client_name: 'x' }), /แก้ในการ์ดไม่ได้แล้ว/);
});

test('several lines get numbered labels; more than five lines are changed in the app', async () => {
  const { proposals } = store();
  const execute = createToolbox({ user: user(), proposals, memory: { remember: async () => undefined } });
  const two = (await execute({ id: 'a', name: 'propose_add_document', args: { ...quote, items: [quote.items[0], { description: 'แก้ไข Draft', quantity: 1, price: 100 }] } })).card as any;
  assert.deepEqual(two.edit.filter((field: any) => field.field.startsWith('item_2')).map((field: any) => field.label), ['รายการที่ 2', 'จำนวน (รายการที่ 2)', 'ราคาต่อหน่วย (บาท) (รายการที่ 2)']);
  const six = (await execute({ id: 'b', name: 'propose_add_document', args: { ...quote, items: Array.from({ length: 6 }, (_, index) => ({ description: `งาน ${index + 1}`, quantity: 1, price: 100 })) } })).card as any;
  assert.deepEqual(six.edit.map((field: any) => field.field), ['client_name', 'vat_rate', 'wht_rate', 'created_date']);
});
