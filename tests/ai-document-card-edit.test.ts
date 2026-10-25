import test from 'node:test';
import assert from 'node:assert/strict';
import { cardValue, createToolbox, type Proposal } from '../backend/src/ai/tools';
import { confirmProposal, reviseProposal, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';

// Owner, 2026-10-25 ("ทำให้มันมีปุ่มแก้ไข"): a quotation card has the same แก้ไข button as a job card. The client, the
// lines, VAT, withholding and the date change on the card; the tool prepares the card again with every check, the
// quotation keeps its number, and the old card is cancelled. Synthetic data only.

const USER = '22222222-2222-4222-8222-222222222222';
const user = () => ({ user_id: USER, statuses: [], goals: [], expenses: [], settings: {}, jobs: [], invoices: [],
  issuer_profile: { name: 'ผู้ออกตัวอย่าง', address: 'ที่อยู่ตัวอย่าง', phone: '', email: '', taxId: '' } } as any);
const quote = { document_type: 'quotation', client: { name: 'ลูกค้าตัวอย่าง' }, items: [{ description: 'ออกแบบโลโก้งาน', quantity: 1, price: 3000 }] };

function store(account = user()) {
  const saved: StoredProposal[] = [];
  const cancelled: string[] = [];
  const writes: { owner: string; changes: any[] }[] = [];
  const applied = new Set<string>();
  const db = {
    getProposal: async (owner: string, id: string) => saved.find(proposal => proposal.id === id && proposal.userId === owner && !cancelled.includes(id) && !applied.has(id)) ?? null,
    loadAccount: async () => ({ user: account, versions: {}, absentRecords: [] }),
    saveProposal: async (proposal: StoredProposal) => { saved.push(proposal); },
    cancelProposal: async (_owner: string, id: string) => { cancelled.push(id); return true; },
    claimProposal: async (owner: string, id: string) => saved.find(proposal => proposal.id === id && proposal.userId === owner && !cancelled.includes(id) && !applied.has(id)) ?? null,
    finishProposal: async (_owner: string, id: string, status: string) => { if (status === 'applied') applied.add(id); },
    applyChanges: async (owner: string, changes: any[]) => { writes.push({ owner, changes }); return true; },
  } as unknown as AssistantDb;
  const proposals = { save: async (proposal: Proposal) => { saved.push({ ...proposal, baseVersion: null }); } };
  return { saved, cancelled, db, proposals, writes };
}
const row = (card: any, label: string) => card.changes.find((change: any) => change.label === label)?.value;

test('a quotation card can be edited: client, line, VAT and withholding, with the same number', async () => {
  const { saved, cancelled, db, proposals } = store();
  const execute = createToolbox({ user: user(), proposals, memory: { remember: async () => undefined } });
  const prepared = await execute({ id: 'a', name: 'propose_add_document', args: quote });
  const card = prepared.card as any;
  assert.equal(card.kind, 'confirm', JSON.stringify(prepared.result));
  assert.deepEqual(card.edit.map((field: any) => [field.field, field.label, field.value]), [
    ['issuer_name', 'ผู้ออก · ชื่อ', 'ผู้ออกตัวอย่าง'], ['issuer_address', 'ผู้ออก · ที่อยู่', 'ที่อยู่ตัวอย่าง'],
    ['issuer_phone', 'ผู้ออก · โทรศัพท์', ''], ['issuer_email', 'ผู้ออก · อีเมล', ''], ['issuer_tax_id', 'ผู้ออก · เลขผู้เสียภาษี', ''],
    ['client_name', 'ลูกค้า · ชื่อ', 'ลูกค้าตัวอย่าง'], ['client_address', 'ลูกค้า · ที่อยู่', ''],
    ['client_phone', 'ลูกค้า · โทรศัพท์', ''], ['client_email', 'ลูกค้า · อีเมล', ''], ['client_tax_id', 'ลูกค้า · เลขผู้เสียภาษี', ''],
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
  assert.deepEqual(six.edit.map((field: any) => field.field), ['issuer_name', 'issuer_address', 'issuer_phone', 'issuer_email', 'issuer_tax_id',
    'client_name', 'client_address', 'client_phone', 'client_email', 'client_tax_id', 'vat_rate', 'wht_rate', 'created_date']);
});

test('both document parties can fill missing details and confirm only the revised document, without saving a profile', async () => {
  const account = user();
  account.issuer_profile = { name: 'ผู้ออกตัวอย่าง', address: '', bankName: 'ธนาคารเดิม', bankAccount: '1234567890' };
  const originalProfile = structuredClone(account.issuer_profile);
  const { saved, cancelled, db, proposals, writes } = store(account);
  const execute = createToolbox({ user: account, proposals, memory: { remember: async () => undefined } });
  const card = (await execute({ id: 'a', name: 'propose_add_document', args: {
    ...quote, document_type: 'invoice', client: { name: 'ลูกค้าตัวอย่าง', contact_name: 'ผู้ติดต่อเดิม', branch: 'สาขาเดิม' },
  } })).card as any;
  for (const field of ['issuer_address', 'issuer_phone', 'issuer_email', 'issuer_tax_id', 'client_address', 'client_phone', 'client_email', 'client_tax_id']) {
    assert.equal(card.edit.find((item: any) => item.field === field)?.value, '', `${field} remains editable when absent`);
  }
  const initialRecord = structuredClone(saved[0].record);
  const { card: next } = await reviseProposal(db, USER, card.id, {
    issuer_name: 'ชื่อธุรกิจฉบับนี้', issuer_address: 'ที่อยู่ผู้ออกใหม่', issuer_phone: '020000001', issuer_email: 'issuer@example.test', issuer_tax_id: '0100000000001',
    client_name: 'ชื่อลูกค้าฉบับนี้', client_address: 'ที่อยู่ลูกค้าใหม่', client_phone: '020000002', client_email: 'client@example.test', client_tax_id: '0100000000002',
  });
  const revised = next as any;
  assert.notEqual(revised.id, card.id);
  assert.deepEqual(cancelled, [card.id]);
  assert.equal(writes.length, 0, 'revising does not write a document or profile');
  assert.deepEqual(saved[0].record, initialRecord, 'the old proposal remains immutable');
  const record = saved.at(-1)!.record as any;
  assert.deepEqual(record.issuer, { ...(initialRecord as any).issuer, name: 'ชื่อธุรกิจฉบับนี้', address: 'ที่อยู่ผู้ออกใหม่', phone: '020000001', email: 'issuer@example.test', taxId: '0100000000001' });
  assert.deepEqual(record.client, { ...(initialRecord as any).client, name: 'ชื่อลูกค้าฉบับนี้', address: 'ที่อยู่ลูกค้าใหม่', phone: '020000002', email: 'client@example.test', taxId: '0100000000002' });
  assert.equal(record.documentNo, (initialRecord as any).documentNo);
  assert.equal(row(revised, 'ยอดชำระสุทธิ'), row(card, 'ยอดชำระสุทธิ'), 'party edits preserve the financial result');
  for (const field of ['issuer_tax_id', 'client_tax_id']) {
    assert.equal(revised.edit.find((item: any) => item.field === field).value, field === 'issuer_tax_id' ? '0100000000001' : '0100000000002');
  }
  await assert.rejects(confirmProposal(db, USER, card.id), (error: any) => error.code === 'ai_proposal_gone');
  const done = await confirmProposal(db, USER, revised.id);
  assert.equal(done.documentId, record.id);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].owner, USER);
  assert.deepEqual(writes[0].changes.map(change => change.table), ['cashflow_invoices']);
  assert.deepEqual(writes[0].changes[0].data.issuer, record.issuer);
  assert.deepEqual(writes[0].changes[0].data.client, record.client);
  assert.deepEqual(account.issuer_profile, originalProfile, 'document details never overwrite the saved issuer profile');
});

test('clearing optional document details is explicit and later edits preserve both parties', async () => {
  const account = user();
  account.issuer_profile.taxId = 'PROFILE-TAX';
  const { saved, db, proposals } = store(account);
  const execute = createToolbox({ user: account, proposals, memory: { remember: async () => undefined } });
  const card = (await execute({ id: 'a', name: 'propose_add_document', args: { ...quote,
    issuer: { phone: '020000003' }, client: { ...quote.client, email: 'client@example.test', tax_id: 'CLIENT-TAX' },
  } })).card as any;
  assert.equal(cardValue('propose_add_document', {}, saved[0].record, 'issuer_tax_id'), 'PROFILE-TAX');
  assert.equal(cardValue('propose_add_document', { issuer: { tax_id: '' } }, saved[0].record, 'issuer_tax_id'), '', 'explicit clear wins over profile fallback');
  const { card: cleared } = await reviseProposal(db, USER, card.id, { issuer_tax_id: '', client_email: '' });
  const { card: editedAgain } = await reviseProposal(db, USER, (cleared as any).id, { item_1_price: '4500' });
  const record = saved.at(-1)!.record as any;
  assert.equal(record.issuer.taxId, '');
  assert.equal(record.issuer.phone, '020000003');
  assert.equal(record.client.email, '');
  assert.equal(record.client.taxId, 'CLIENT-TAX');
  assert.equal(record.issuer.address, account.issuer_profile.address);
  assert.equal(row(editedAgain, 'ยอดชำระสุทธิ'), '฿4,500.00');
  assert.equal(account.issuer_profile.taxId, 'PROFILE-TAX');
});

test('party edits reject identity injection and invalid required names before producing a replacement proposal', async () => {
  const { saved, cancelled, db, proposals } = store();
  const execute = createToolbox({ user: user(), proposals, memory: { remember: async () => undefined } });
  const card = (await execute({ id: 'a', name: 'propose_add_document', args: quote })).card as any;
  for (const edits of [{ issuer_user_id: 'other' }, { client_owner: 'other' }, { issuer_signatureUrl: 'signature' }, { issuer: { name: 'injection' } }, JSON.parse('{"__proto__":"injection"}')]) {
    await assert.rejects(reviseProposal(db, USER, card.id, edits as any), (error: any) => error.code === 'ai_revise_field');
  }
  const invalidNames: Record<string, string>[] = [{ issuer_name: '' }, { client_name: ' ' }, { issuer_name: 'ลูกค้าตัวอย่าง' }];
  for (const edits of invalidNames) {
    await assert.rejects(reviseProposal(db, USER, card.id, edits), (error: any) => error.code === 'ai_revise_invalid');
  }
  const mismatched = { ...db, loadAccount: async () => ({ user: { ...user(), user_id: 'other-owner' }, versions: {}, absentRecords: [] }) } as AssistantDb;
  await assert.rejects(reviseProposal(mismatched, USER, card.id, { issuer_address: 'x' }), (error: any) => error.code === 'ai_account_mismatch');
  assert.equal(saved.length, 1);
  assert.deepEqual(cancelled, [], 'invalid edits do not cancel the original proposal');
});

test('missing issuer name asks for own details before a valid card exposes both parties', async () => {
  const account = user(); account.issuer_profile = {};
  const { saved, proposals } = store(account);
  const execute = createToolbox({ user: account, proposals, memory: { remember: async () => undefined } });
  const incomplete = await execute({ id: 'a', name: 'propose_add_document', args: quote });
  assert.equal(incomplete.card, undefined, 'an unnamed issuer is not made confirmable');
  assert.ok((incomplete.result as any).missing.some((field: string) => field.includes('ชื่อผู้ออกเอกสาร')));
  assert.equal(saved.length, 0);
  const complete = await execute({ id: 'b', name: 'propose_add_document', args: { ...quote, issuer: { name: 'ชื่อที่ผู้ใช้ให้' } } });
  assert.equal(complete.card?.kind, 'confirm');
  const edit = (complete.card as any).edit;
  assert.equal(edit.find((field: any) => field.field === 'issuer_name').value, 'ชื่อที่ผู้ใช้ให้');
  assert.equal(edit.find((field: any) => field.field === 'issuer_address').value, '');
  assert.equal(edit.find((field: any) => field.field === 'client_name').value, quote.client.name);
});
