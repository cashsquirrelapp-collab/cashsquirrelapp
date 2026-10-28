import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import { lineAssistantReply } from '../backend/src/ai/lineFormat';
import { executeDocumentAction } from '../backend/src/ai/documentActions';
import { buildSystemPrompt, PROMPT_VERSION } from '../backend/src/ai/prompt';
import type { ToolContext } from '../backend/src/ai/tools';
import type { InvoiceProfile } from '../shared/types';
import { CREDIT_TERM_PRESETS } from '../shared/creditTerms';
import { partyAnswer, paymentAnswer, thaiDateAnswer } from '../shared/askQuestions';

// Owner, 2026-10-25 (เลขา's questions for a quotation): ask the client's details; the issuer's only when none are saved,
// then keep them; "ชำระวันไหน" with a calendar and "มีเครดิตเทอมไหม" with every credit term the app offers, never the
// word เครดิตเทอม alone. Synthetic accounts, no network, no keys.

const USER = '22222222-2222-4222-8222-222222222222';
const user = () => ({ user_id: USER, statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any);

test('ask_user: a calendar, when the client pays with the app\'s own credit terms, and a party form', async () => {
  const execute = createToolbox({ user: user(), ...memoryStores() });
  const outcome = await execute({ id: 'k', name: 'ask_user', args: { questions: [
    { text: 'ลูกค้าจะชำระเงินเมื่อไหร่', kind: 'payment', options: ['7 วัน', '15 วัน'] },
    { text: 'ข้อมูลลูกค้าสำหรับใบเสนอราคา', kind: 'party', role: 'client', prefill: { name: '  ปล่อยจอย ', tax_id: '0105559999999', email: 'x@y.z' } },
    { text: 'ข้อมูลผู้ออกเอกสารของคุณ', kind: 'party', role: 'issuer' },
    { text: 'ส่งงานวันไหน', kind: 'date' },
    { text: 'หัก ณ ที่จ่ายไหม', options: ['ไม่หัก', '3%'] },
  ] } });
  const card = outcome.card as any;
  assert.equal(card.kind, 'questions');
  const [payment, client, issuer, date, choice] = card.questions;
  // The payment question always shows the app's credit terms, whatever the model listed.
  assert.deepEqual([payment.kind, payment.options, payment.terms, payment.allowText], ['payment', [], [0, 30, 45, 60, 90], false]);
  assert.deepEqual(payment.terms, [...CREDIT_TERM_PRESETS]);
  assert.deepEqual([client.kind, client.role, client.prefill], ['party', 'client', { name: 'ปล่อยจอย', taxId: '0105559999999' }], 'only known fields, trimmed');
  assert.deepEqual([issuer.kind, issuer.role, issuer.prefill], ['party', 'issuer', undefined]);
  assert.deepEqual([date.kind, date.options], ['date', []]);
  assert.deepEqual([choice.kind, choice.options], [undefined, ['ไม่หัก', '3%']]);
  assert.equal(outcome.endTurn, true);
  // An empty payment question still reads as one.
  const plain = await execute({ id: 'l', name: 'ask_user', args: { questions: [{ text: '', kind: 'payment' }] } });
  assert.equal((plain.card as any).questions[0].text, 'การชำระเงิน');
});

test('LINE: the date, payment and details questions as lines, the app\'s credit terms as quick replies', async () => {
  const execute = createToolbox({ user: user(), ...memoryStores() });
  const outcome = await execute({ id: 'k', name: 'ask_user', args: { questions: [
    { text: 'ลูกค้าจะชำระเงินเมื่อไหร่', kind: 'payment' },
    { text: 'ข้อมูลลูกค้า', kind: 'party', role: 'client', prefill: { name: 'ปล่อยจอย' } },
  ] } });
  const last = lineAssistantReply('ขอข้อมูลเพิ่ม 2 ข้อครับ', [outcome.card as any]).at(-1) as any;
  assert.match(last.text, /1\. ลูกค้าจะชำระเงินเมื่อไหร่: ชำระวันไหน \(พิมพ์วันที่ เช่น 15 พ\.ย\.\) และมีเครดิตเทอมไหม \(ไม่มี \/ 0 วัน \/ 30 วัน \/ 45 วัน \/ 60 วัน \/ 90 วัน\)/);
  assert.match(last.text, /2\. ข้อมูลลูกค้า: ชื่อ ที่อยู่ เลขประจำตัวผู้เสียภาษี โทรศัพท์ .* · ที่มีแล้ว: ปล่อยจอย/);
  assert.deepEqual(last.quickReply.items.map((item: any) => item.action.label),
    ['ไม่มีเครดิตเทอม', 'เครดิตเทอม 0 วัน', 'เครดิตเทอม 30 วัน', 'เครดิตเทอม 45 วัน', 'เครดิตเทอม 60 วัน', 'เครดิตเทอม 90 วัน']);
  assert.equal(last.quickReply.items[2].action.text, 'ลูกค้าจะชำระเงินเมื่อไหร่: เครดิตเทอม 30 วัน');
});

test('the answers read the same in the app and for เลขา: a Thai date with its key, the credit term, every detail', () => {
  assert.equal(thaiDateAnswer('2026-11-15'), '15 พ.ย. 2569 (2026-11-15)');
  assert.equal(paymentAnswer('2026-11-15', 30), 'ชำระวันไหน: 15 พ.ย. 2569 (2026-11-15) · เครดิตเทอม: 30 วัน');
  assert.equal(paymentAnswer('2026-11-15', 'none'), 'ชำระวันไหน: 15 พ.ย. 2569 (2026-11-15) · เครดิตเทอม: ไม่มี');
  assert.equal(paymentAnswer('', 'none'), 'ชำระวันไหน: ไม่ระบุวัน · เครดิตเทอม: ไม่มี (ชำระเมื่อส่งงาน)');
  assert.equal(paymentAnswer('', 45), 'ชำระวันไหน: ไม่ระบุวัน · เครดิตเทอม: 45 วัน');
  assert.equal(partyAnswer({ name: 'บริษัท ปล่อยจอย จำกัด', address: ' 1 ถนนสุขุมวิท ', taxId: '' }),
    'ชื่อ บริษัท ปล่อยจอย จำกัด; ที่อยู่ 1 ถนนสุขุมวิท; เลขประจำตัวผู้เสียภาษี ไม่ระบุ; โทรศัพท์ ไม่ระบุ');
});

const emptyIssuer: InvoiceProfile = { name: '', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
function documentContext(profile: InvoiceProfile) {
  const saved: unknown[] = [];
  const context: ToolContext = { user: { user_id: USER, jobs: [], invoices: [], issuer_profile: profile } as ToolContext['user'],
    now: new Date('2026-10-25T08:00:00Z'), proposals: { async save(proposal) { saved.push(proposal); } }, memory: { async remember() {} } };
  return { context, saved };
}
const quotation = { document_type: 'quotation', client: { name: 'ปล่อยจอย' }, items: [{ description: 'งานตัดต่อวิดีโอ', quantity: 1, price: 3000 }] };

test('a quotation never uses the client as its issuer; the user\'s own issuer goes through', async () => {
  const empty = documentContext(emptyIssuer);
  const missing = await executeDocumentAction('propose_add_document', quotation, empty.context);
  assert.deepEqual((missing.result as any).missing, ['ชื่อผู้ออกเอกสาร (ยังไม่มีในโปรไฟล์)'], 'no saved issuer: asked for');
  for (const name of ['บริษัทปล่อยจอยจำกัด', 'บริษัท ปล่อยจอย จำกัด', 'ปล่อยจอย']) {
    const mixed = await executeDocumentAction('propose_add_document', { ...quotation, issuer: { name } }, empty.context);
    assert.equal((mixed.result as any).ok, false, name);
    assert.match((mixed.result as any).error, /ชื่อผู้ออกเอกสารตรงกับชื่อลูกค้า/);
  }
  assert.equal(empty.saved.length, 0, 'no card for a mixed-up issuer');
  const own = await executeDocumentAction('propose_add_document', { ...quotation, issuer: { name: 'นพรัตน์ สตูดิโอ', address: 'เชียงใหม่' } }, empty.context);
  assert.equal(own.card?.kind, 'confirm');
  // A saved issuer is used as it is, with nothing asked.
  const saved = documentContext({ ...emptyIssuer, name: 'ร้านเจ้าของบัญชี' });
  const reply = await executeDocumentAction('propose_add_document', quotation, saved.context);
  assert.equal(reply.card?.kind, 'confirm');
});

test('the prompt: client details asked, issuer asked only when not saved and then kept, the payment question', () => {
  assert.equal(PROMPT_VERSION, 'secretary-v21');
  // secretary-v21 (owner, 2026-10-28): the document rules go with a document in the chat.
  const prompt = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-', documents: true });
  assert.doesNotMatch(buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-' }), /role issuer/);
  assert.match(prompt, /ONE ask_user question of kind party, role client/);
  assert.match(prompt, /When it has a name, never ask about the issuer and never change it/);
  assert.match(prompt, /AND call propose_update_issuer in the same turn/);
  assert.match(prompt, /The client is never the issuer/);
  assert.match(prompt, /question of kind payment and no options/);
  assert.match(prompt, /Never ask with the word เครดิตเทอม alone/);
  assert.match(prompt, /0, 30, 45, 60 and 90/);
  assert.doesNotMatch(prompt, /"ครบกำหนดตามเครดิต 30 วัน" \/ "15 วัน"/, 'the old 15-day option is gone');
});
