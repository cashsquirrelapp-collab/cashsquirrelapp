import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox, type Proposal, type ToolContext } from '../backend/src/ai/tools.js';

function fixture(overrides: Record<string, unknown> = {}) {
  const saved: Proposal[] = [];
  const job = { id: 'job', name: 'งาน ก', value: 1000, received: 0, pending: 1000, client: 'ก', type: 'บริการ', status: 'pending', creditTerm: 7,
    postDate: '2026-10-20', payDate: '2026-10-27', isPosted: false, note: '', whtRate: 0, ...overrides };
  const context: ToolContext = { user: { user_id: 'owner', jobs: [job], statuses: [{ id: 'pending', label: 'รอ', behavior: 'pending' }, { id: 'done', label: 'ครบ', behavior: 'done' }] } as ToolContext['user'],
    proposals: { async save(proposal) { saved.push(proposal); } }, memory: { async remember() {} } };
  const run = (args: Record<string, unknown>) => createToolbox(context)({ id: 'call', name: 'propose_edit_job', args: { job_id: 'job', ...args } });
  return { run, saved, job };
}

test('job calendar changes preserve the receipt ledger and recompute the unpaid due date with existing credit rules', async () => {
  const f = fixture();
  const reply = await f.run({ delivery_date: '2026-10-25', delivered: true, credit_term_days: 10, remind_date: '2026-11-05', type: 'ออกแบบ' });
  assert.equal(reply.card?.kind, 'confirm');
  const record = f.saved[0].record!;
  assert.equal(record.postDate, '2026-10-25');
  assert.equal(record.payDate, '2026-11-04');
  assert.equal(record.remindAt, '2026-11-05');
  assert.equal(record.isPosted, true);
  assert.equal(record.received, 0);
  assert.equal(f.job.postDate, '2026-10-20', 'preparation does not mutate the account snapshot');
});

test('calendar edits do not move an existing receipt into another income period', async () => {
  const f = fixture({ received: 1000, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-10-22' });
  await f.run({ delivery_date: '2026-10-25', credit_term_days: 30 });
  assert.equal(f.saved[0].record!.payDate, '2026-10-22');
  const refused = await f.run({ pay_date: '2027-01-01' });
  assert.equal((refused.result as any).ok, false);
  assert.equal(f.saved.length, 1);
});

test('combined withholding, payment and delivery edits keep the actual receipt date rather than the recalculated due date', async () => {
  const f = fixture({ whtRate: 3, whtAmount: 30, pending: 970 });
  const reply = await f.run({ wht_rate: 0, payment_status: 'paid', paid_date: '2026-10-24',
    delivery_date: '2026-10-23', delivered: true, credit_term_days: 30 });
  assert.equal(reply.card?.kind, 'confirm');
  assert.equal(f.saved.length, 1);
  const record = f.saved[0].record!;
  assert.equal(record.whtRate, 0);
  assert.equal(record.received, 1000);
  assert.equal(record.pending, 0);
  assert.equal(record.payDate, '2026-10-24');
  assert.equal(record.postDate, '2026-10-23');
  assert.equal(record.isPosted, true);
  assert.equal(f.job.received, 0, 'no change is applied until the owner confirms');
});

test('invalid dates or installment financial changes are refused while clearing a reminder is explicit', async () => {
  const f = fixture();
  assert.equal((await f.run({ delivery_date: '2026-02-30' })).card, undefined);
  assert.equal((await f.run({ credit_term_days: -1 })).card, undefined);
  const installment = fixture({ installments: [{ id: 'one', label: 'งวด 1', amount: 1000, dueDate: '2026-11-01', paidAt: null, status: 'pending' }] });
  assert.equal((await installment.run({ pay_date: '2026-11-15' })).card, undefined);
  const cleared = await f.run({ remind_date: '' });
  assert.equal(cleared.card?.kind, 'confirm');
  assert.equal(f.saved[0].record!.remindAt, null);
});
