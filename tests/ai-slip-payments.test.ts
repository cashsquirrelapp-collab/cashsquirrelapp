import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import { buildSystemPrompt } from '../backend/src/ai/prompt';

// Owner, 2026-10-24: a slip is read like a person would (who was paid, which way the money went), and the payment
// card shows the amount on the slip, not the job's running total.

const web = { id: 'job-web', name: 'เว็บไซต์บริษัทตัวอย่าง', client: 'บริษัท ตัวอย่าง จำกัด', type: 'งานออกแบบ', note: '', value: 30000, whtRate: 3, whtAmount: 900,
  received: 10000, pending: 19100, status: 'partial', creditTerm: 30, isPosted: true, postDate: '2026-10-04', payDate: '2026-10-28', depositDate: '2026-10-04', depositAmount: 10000 };
const user = () => ({ user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [{ ...web }] } as any);

test('paying the rest of a job with a deposit shows this receipt and the total apart', async () => {
  const execute = createToolbox({ user: user(), ...memoryStores() });
  const outcome = await execute({ id: 'p', name: 'propose_record_payment', args: { job_id: 'job-web', mode: 'full', date: '2026-10-24' } });
  const changes = (outcome.card as any).changes as { label: string; value: string }[];
  assert.deepEqual(changes.find(row => row.label === 'รับครั้งนี้')?.value, '฿19,100');
  assert.match(changes.find(row => row.label === 'รับรวมทั้งงาน')!.value, /฿29,100 \(รับไว้ก่อน ฿10,000\)/);
  assert.equal(changes.some(row => row.label === 'ยอดรับ'), false);
});

test('a second partial payment never overwrites the deposit already received', async () => {
  const execute = createToolbox({ user: user(), ...memoryStores() });
  const outcome = await execute({ id: 'p', name: 'propose_record_payment', args: { job_id: 'job-web', mode: 'partial', amount: 5000 } });
  assert.equal((outcome.result as any).ok, false);
  assert.match((outcome.result as any).error, /รับเงินไว้แล้ว ฿10,000/);
  assert.equal(outcome.card, undefined);
});

test('the prompt reads slips by direction and names an expense after who was paid', () => {
  const system = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '24 ต.ค. 2569 18:00', knowledge: '', accountContext: '' } as any);
  assert.match(system, /TRANSFER SLIPS/);
  assert.match(system, /"SCB มณี SHOP \(สมาน\)" →\s+"ร้านสมาน"/);
  assert.match(system, /Never a generic name such as\s+"บันทึกการโอน"/);
  assert.match(system, /พ\.ศ\. \(24 พ\.ค\. 2569 →\s+2026-05-24\)/);
  assert.match(system, /never account numbers/);
});

test('เลขา knows the owner\'s own names (never account numbers) to tell which side of a slip is them', async () => {
  const { accountContext } = await import('../backend/src/ai/tools');
  const context = JSON.parse(accountContext({ ...user(), issuer_profile: { name: 'สมชาย ตัวอย่าง', bankAccountName: 'นาย สมชาย ตัวอย่าง', bankAccount: '123-4-56789-0' }, notif_settings: { userName: 'สมชาย ตัวอย่าง' } } as any));
  assert.deepEqual(context.own_names, ['สมชาย ตัวอย่าง', 'นาย สมชาย ตัวอย่าง']);
  assert.doesNotMatch(JSON.stringify(context), /56789/);
  assert.equal('own_names' in JSON.parse(accountContext(user())), false);
});

test('money in is thought through: payer, memo, amount against what is owed, withholding, Thai years', () => {
  const system = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '24 ต.ค. 2569 18:00', knowledge: '', accountContext: '' } as any);
  assert.match(system, /บจก\. = บริษัท … จำกัด/);
  assert.match(system, /"Kol bbg" → a KOL job for bbg/);
  assert.match(system, /the client did not withhold/);
  assert.match(system, /24 ต\.ค\. 69 → 2569 → 2026-10-24/);
  assert.match(system, /บจก\. ตัวอย่าง → บริษัท ตัวอย่าง จำกัด/);
});
