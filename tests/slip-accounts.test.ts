import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import { buildSystemPrompt } from '../backend/src/ai/prompt';
import { accountKey, accountLabel, accountsInUse, slipAccountOf, slipAlreadyRecorded, slipRefOf } from '../shared/slipAccounts';
import { validateChanges } from '../shared/validation';

// Slips by account and a slip sent twice (owner, 2026-11-14, item 3: "แยกสลิปไว้แบบเป็นระเบียบ ... เป็นของคนละบัญชี";
// agreed: by account, "KBank •1234", named by the person, and the same slip pointed out before it is saved again).

const job = { id: 'job-web', name: 'เว็บไซต์บริษัทตัวอย่าง', client: 'บริษัท ตัวอย่าง จำกัด', type: 'งานออกแบบ', note: '', value: 30000, whtRate: 0, whtAmount: 0,
  received: 0, pending: 30000, status: 'pending', creditTerm: 30, isPosted: true, postDate: '2026-11-04', payDate: '2026-12-04' };
const user = (over: Record<string, unknown> = {}) => ({ user_id: '33333333-3333-4333-8333-333333333333', statuses: [], goals: [], expenses: [], settings: {}, jobs: [{ ...job }], ...over } as any);
const rows = (outcome: any) => (outcome.card?.changes ?? []) as { label: string; value: string }[];
/** The stores, and the record a confirmed card would save. */
function stores() {
  const saved: any[] = [];
  const base = memoryStores();
  return { saved, value: { ...base, proposals: { async save(proposal: any) { saved.push(proposal); } } } as any };
}

test('slip accounts: only a known bank and exactly four digits; the reference compared without spaces or case', () => {
  assert.deepEqual(slipAccountOf('KBANK', 'x1234'), { bank: 'KBANK', last4: '1234' });
  assert.equal(slipAccountOf('KBANK', '123456'), null, 'never more than four digits');
  assert.equal(slipAccountOf('NOTABANK', '1234'), null);
  assert.equal(slipRefOf(' 2025111412 3456 abc '), '20251114123456ABC');
  assert.equal(slipRefOf('12'), null);
  assert.equal(accountLabel({ bank: 'KBANK', last4: '1234' }), 'KBank •1234');
  assert.equal(accountLabel({ bank: 'KBANK', last4: '1234' }, { 'KBANK:1234': 'บัญชีธุรกิจ' }), 'บัญชีธุรกิจ');
  const used = accountsInUse([{ account: { bank: 'SCB', last4: '9876' } }, { account: { bank: 'KBANK', last4: '1234' } }], [{ account: { bank: 'KBANK', last4: '1234' } }, { account: 'junk' }]);
  assert.deepEqual(used.map(item => [accountKey(item.account), item.count]), [['KBANK:1234', 2], ['SCB:9876', 1]]);
  assert.deepEqual(slipAlreadyRecorded('ABC123456', [{ id: 'e1', name: 'ร้านสมาน', slipRef: 'abc-123-456' }]), { kind: 'expense', id: 'e1', name: 'ร้านสมาน' });
  assert.equal(slipAlreadyRecorded('ABC123456', [{ id: 'e1', name: 'ร้านสมาน', slipRef: 'ABC123456' }], [], 'e1'), null, 'the record itself is not a repeat');
});

test('the app keeps the account and the reference with an expense and a job, and refuses a full account number', () => {
  const ok = { id: 'e1', name: 'ร้านสมาน', amount: 120, category: 'อื่นๆ', date: '2026-11-14', account: { bank: 'KBANK', last4: '1234' }, slipRef: 'ABC123456' };
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_expenses', id: 'e1', op: 'set', version: null, data: ok }]));
  assert.throws(() => validateChanges([{ table: 'cashflow_expenses', id: 'e1', op: 'set', version: null, data: { ...ok, account: { bank: 'KBANK', last4: '1234567890' } } }]));
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_jobs', id: 'j1', op: 'set', version: null, data: { ...job, id: 'j1', account: { bank: 'SCB', last4: '0001' }, slipRefs: ['ABC123456'] } }]));
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: null,
    data: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, accountNames: { 'KBANK:1234': 'บัญชีธุรกิจ' } } }]));
});

test('money out from a slip: the card shows the account; the expense keeps it and the reference', async () => {
  const kept = stores();
  const execute = createToolbox({ user: user({ settings: { accountNames: { 'KBANK:1234': 'บัญชีธุรกิจ' } } }), ...kept.value });
  const outcome = await execute({ id: 'e', name: 'propose_add_expense', args: { name: 'ร้านสมาน', amount: 120, category: 'อื่นๆ', date: '2026-11-14',
    slip: { bank: 'KBANK', account_last4: '1234', reference: '015318123456ABC' } } });
  assert.equal((outcome.result as any).ok, true);
  assert.deepEqual(kept.saved[0].record.account, { bank: 'KBANK', last4: '1234' });
  assert.equal(kept.saved[0].record.slipRef, '015318123456ABC');
  assert.equal('slip' in kept.saved[0].record, false, 'the raw argument is not kept on the record');
  assert.equal(rows(outcome).find(row => row.label === 'บัญชี')?.value, 'บัญชีธุรกิจ');
  assert.equal(rows(outcome).some(row => row.label === 'สลิปซ้ำ'), false);
});

test('the same slip sent again: the card and เลขา say it was already recorded, before anything is saved', async () => {
  const expenses = [{ id: 'e-old', name: 'ร้านสมาน', amount: 120, category: 'อื่นๆ', date: '2026-11-14', slipRef: '015318123456ABC' }];
  const execute = createToolbox({ user: user({ expenses }), ...memoryStores() });
  const outcome = await execute({ id: 'e', name: 'propose_add_expense', args: { name: 'ร้านสมาน', amount: 120, category: 'อื่นๆ', date: '2026-11-14',
    slip: { bank: 'KBANK', account_last4: '1234', reference: '015318 123456 abc' } } });
  assert.match(rows(outcome)[0].value, /สลิปนี้บันทึกไว้แล้วในรายจ่าย “ร้านสมาน”/);
  assert.equal(rows(outcome)[0].label, 'สลิปซ้ำ');
  assert.deepEqual((outcome.result as any).duplicate_slip, { recorded_as: 'expense', name: 'ร้านสมาน' });
  assert.equal((outcome.result as any).ok, true, 'the person still decides: the card is there to confirm or cancel');
});

test('money in from a slip: the job keeps the account it came into and the reference; a repeat on another job is said', async () => {
  const kept = stores();
  const execute = createToolbox({ user: user(), ...kept.value });
  const outcome = await execute({ id: 'p', name: 'propose_record_payment', args: { job_id: 'job-web', mode: 'full', date: '2026-11-14',
    slip: { bank: 'SCB', account_last4: '9876', reference: 'SCB2026111400001' } } });
  assert.equal(rows(outcome).find(row => row.label === 'บัญชี')?.value, 'SCB •9876');
  assert.deepEqual(kept.saved[0].record.account, { bank: 'SCB', last4: '9876' });
  assert.deepEqual(kept.saved[0].record.slipRefs, ['SCB2026111400001']);
  const other = { ...job, id: 'job-old', name: 'งานเก่า', slipRefs: ['SCB2026111400001'] };
  const again = await createToolbox({ user: user({ jobs: [{ ...job }, other] }), ...memoryStores() })({ id: 'p', name: 'propose_record_payment',
    args: { job_id: 'job-web', mode: 'full', slip: { reference: 'SCB2026111400001' } } });
  assert.match(rows(again)[0].value, /บันทึกไว้แล้วในงาน “งานเก่า”/);
  assert.equal((again.result as any).duplicate_slip.recorded_as, 'job');
});

test('the prompt asks for the own account\'s bank and last four digits and the reference, never more', () => {
  const system = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '14 พ.ย. 2569 18:00', knowledge: '', accountContext: '', files: true } as any);
  assert.match(system, /carries slip: bank = the bank of the user's OWN account/);
  assert.match(system, /exactly 4, never more/);
  assert.match(system, /duplicate_slip/);
  assert.match(system, /never account numbers/);
});
