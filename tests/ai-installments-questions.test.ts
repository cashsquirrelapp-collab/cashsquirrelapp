import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox, type Proposal } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import { reviseProposal, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';
import { lineAssistantReply } from '../backend/src/ai/lineFormat';

// Owner, 2026-10-24: jobs paid in installments use the app's installments, questions are answered with a tap, and a
// confirmation card can be edited before confirming.

const USER = '22222222-2222-4222-8222-222222222222';
const user = (jobs: unknown[] = []) => ({ user_id: USER, statuses: [], goals: [], expenses: [], settings: {}, jobs } as any);
const course = { name: 'ค่าเรียนขับรถ', value: 500000, client: 'ลูกค้าตัวอย่าง', delivered: false, wht_rate: 0,
  installments: [{ amount: 200000, paid: true, paid_date: '2026-10-24' }, { due_date: '2026-11-01' }, { due_date: '2026-12-01' }] };

test('a job paid in installments is saved as the app\'s installments, the rest split equally', async () => {
  const stores = memoryStores();
  const execute = createToolbox({ user: user(), ...stores });
  const outcome = await execute({ id: 'a', name: 'propose_add_job', args: course });
  assert.equal((outcome.result as any).ok, true, JSON.stringify(outcome.result));
  const record = [...stores.saved.values()][0].record as any;
  assert.equal(record.status, 'installment');
  assert.deepEqual(record.installments.map((row: any) => [row.label, row.amount, row.status, row.dueDate, row.paidAt]), [
    ['งวดที่ 1', 200000, 'paid', null, '2026-10-24'], ['งวดที่ 2', 150000, 'pending', '2026-11-01', null], ['งวดที่ 3', 150000, 'pending', '2026-12-01', null]]);
  assert.deepEqual([record.received, record.pending, record.payDate, record.paymentStatus], [200000, 300000, '2026-11-01', 'partial']);
  const changes = (outcome.card as any).changes as { label: string; value: string }[];
  assert.match(changes.find(row => row.label === 'การชำระ')!.value, /แบ่ง 3 งวด · รับแล้ว ฿200,000 · ค้าง ฿300,000/);
  assert.match(changes.find(row => row.label === 'งวดที่ 2')!.value, /฿150,000 · ครบกำหนด 1 พ\.ย\. 2569/);
  // An installment plan is checked against the value, so only the name and client are edited on the card.
  assert.deepEqual((outcome.card as any).edit.map((field: any) => field.field), ['name', 'client']);
});

test('installments that do not add up are refused with the difference', async () => {
  const execute = createToolbox({ user: user(), ...memoryStores() });
  const outcome = await execute({ id: 'a', name: 'propose_add_job', args: { ...course, installments: [{ amount: 200000, paid: true }, { amount: 100000, due_date: '2026-11-01' }] } });
  assert.equal((outcome.result as any).ok, false);
  assert.match((outcome.result as any).error, /ไม่เท่ายอดสุทธิของงาน ฿500,000/);
});

test('money for an installment job ticks the installment with that amount, never a deposit', async () => {
  const stores = memoryStores();
  const first = createToolbox({ user: user(), ...stores });
  await first({ id: 'a', name: 'propose_add_job', args: course });
  const job = { ...([...stores.saved.values()][0].record as any) };
  const execute = createToolbox({ user: user([job]), ...memoryStores() });
  const outcome = await execute({ id: 'p', name: 'propose_record_payment', args: { job_id: job.id, mode: 'partial', amount: 150000, date: '2026-11-01' } });
  assert.equal((outcome.card as any).title, 'บันทึกรับงวดที่ 2');
  const changes = (outcome.card as any).changes as { label: string; value: string }[];
  assert.equal(changes.find(row => row.label === 'รับงวดที่ 2')!.value, '฿150,000 · 1 พ.ย. 2569');
  assert.match(changes.find(row => row.label === 'คงเหลือ')!.value, /1 งวด ฿150,000 · งวดถัดไป 1 ธ\.ค\. 2569/);
  const wrong = await execute({ id: 'q', name: 'propose_record_payment', args: { job_id: job.id, mode: 'partial', amount: 90000 } });
  assert.match((wrong.result as any).error, /ไม่ตรงกับงวดที่ยังไม่ได้รับ/);
});

test('ask_user shows tap-to-answer questions; LINE gets the questions and quick replies', async () => {
  const execute = createToolbox({ user: user(), ...memoryStores() });
  const outcome = await execute({ id: 'k', name: 'ask_user', args: { questions: [
    { text: 'ลูกค้าคือใคร', options: ['ร้านกาแฟตัวอย่าง'], allow_text: true },
    { text: 'ส่งงานแล้วหรือยัง', options: ['ส่งแล้ววันนี้', 'ยังไม่ส่ง'] },
    { text: 'หัก ณ ที่จ่ายไหม', options: ['ไม่หัก', '1%', '3%'] },
  ] } });
  const card = outcome.card as any;
  assert.equal(card.kind, 'questions');
  assert.deepEqual(card.questions.map((question: any) => [question.text, question.options.length, question.allowText]), [['ลูกค้าคือใคร', 1, true], ['ส่งงานแล้วหรือยัง', 2, false], ['หัก ณ ที่จ่ายไหม', 3, false]]);
  const messages = lineAssistantReply('ขอข้อมูลเพิ่ม 3 ข้อครับ', [card]);
  const last = messages.at(-1) as any;
  assert.match(last.text, /1\. ลูกค้าคือใคร \(ร้านกาแฟตัวอย่าง\)\n2\. ส่งงานแล้วหรือยัง \(ส่งแล้ววันนี้ \/ ยังไม่ส่ง\)/);
  assert.deepEqual(last.quickReply.items.map((item: any) => item.action.text), ['ลูกค้าคือใคร: ร้านกาแฟตัวอย่าง']);
});

test('a confirmation card edited before confirming is prepared again from its own call, and the old one cancelled', async () => {
  const saved: StoredProposal[] = [];
  const cancelled: string[] = [];
  const firstStore = { save: async (proposal: Proposal) => { saved.push({ ...proposal, baseVersion: null }); } };
  const first = createToolbox({ user: user(), proposals: firstStore, memory: { remember: async () => undefined } });
  const prepared = await first({ id: 'a', name: 'propose_add_job', args: { name: 'แปลเอกสาร', value: 4000, client: 'ลูกค้าตัวอย่าง', delivered: true, delivery_date: '2026-10-24', payment_status: 'paid', paid_date: '2026-10-24', wht_rate: 0 } });
  const card = prepared.card as any;
  assert.deepEqual(card.edit.map((field: any) => field.field), ['name', 'client', 'value', 'wht_rate', 'delivery_date', 'paid_date']);
  assert.equal(saved[0].tool, 'propose_add_job');
  const db = {
    getProposal: async (owner: string, id: string) => saved.find(proposal => proposal.id === id && proposal.userId === owner) ?? null,
    loadAccount: async () => ({ user: user(), versions: {}, absentRecords: [] }),
    saveProposal: async (proposal: StoredProposal) => { saved.push(proposal); },
    cancelProposal: async (_owner: string, id: string) => { cancelled.push(id); return true; },
  } as unknown as AssistantDb;
  const { card: next } = await reviseProposal(db, USER, card.id, { value: '4,500' });
  assert.notEqual((next as any).id, card.id);
  assert.equal((next as any).changes.find((row: any) => row.label === 'มูลค่า').value, '฿4,500');
  assert.deepEqual(cancelled, [card.id]);
  await assert.rejects(reviseProposal(db, USER, card.id, { note: 'x' } as any), /แก้ช่องนี้ในการ์ดไม่ได้/);
  await assert.rejects(reviseProposal(db, '33333333-3333-4333-8333-333333333333', card.id, { value: 1 }), /แก้ในการ์ดไม่ได้แล้ว/);
  await assert.rejects(reviseProposal(db, USER, (next as any).id, { value: '-5' }), /มูลค่างาน|ข้อมูล/);
});
