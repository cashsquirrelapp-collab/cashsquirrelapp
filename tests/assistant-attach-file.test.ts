import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { buildSystemPrompt } from '../backend/src/ai/prompt';
import { executeVaultTool } from '../backend/src/ai/vaultQueries';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-31: "ถ้ายูเซอร์มีสลิป ส่งเข้าไปในแชทน้อง แล้วน้องแนบเข้าในโปรเจกต์นั้นได้เลย ... ใบ 50 ทวิ แจ้งเตือนได้ด้วย".
// attach_file shows a card; the app keeps the file only when the user presses it. Fake Gemini: no network, no cost.
// Synthetic account only.

const A = '66666666-6666-4666-8666-666666666666';
const job = { id: 'job-wht', name: 'รีวิวสินค้า', client: 'บริษัท ตัวอย่าง จำกัด', value: 10_000, whtRate: 3, whtAmount: 300, received: 0, pending: 9_700,
  status: 'pending', paymentStatus: 'unpaid', payDate: '2026-10-30', postDate: '2026-10-01' };
const user = (): UserRow => ({ user_id: A, statuses: [], goals: [], settings: {}, jobs: [job],
  expenses: [{ id: 'exp-1', name: 'ค่าเน็ต', amount: 599, date: '2026-10-05', category: 'อื่นๆ' }] } as unknown as UserRow);
const config = () => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]).toString('base64');

function gemini(text: string) {
  const tools: string[][] = [];
  // Gemini or Claude, whichever the routing picks; both answer with plain text.
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const claude = String(input).includes('anthropic');
    tools.push(claude ? (body.tools || []).map((tool: { name: string }) => tool.name) : (body.tools?.[0]?.functionDeclarations || []).map((tool: { name: string }) => tool.name));
    const reply = claude
      ? { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 60, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      : { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
  return { tools, fetchImpl };
}

test('attach_file: a card for the user\'s own job or expense, never another account\'s record, never "saved"', async () => {
  const wht = await executeVaultTool('attach_file', { kind: 'wht50', job_id: 'job-wht' }, user(), undefined, new Date(), 'ใบ50ทวิ.jpg');
  const card = wht.card as Record<string, unknown>;
  assert.equal(card.kind, 'attach');
  assert.match(String(card.id), /^at_/);
  assert.deepEqual([card.fileKind, card.fileName, card.jobId, card.jobName, card.client], ['wht50', 'ใบ50ทวิ.jpg', 'job-wht', 'รีวิวสินค้า', 'บริษัท ตัวอย่าง จำกัด']);
  assert.match(JSON.stringify(wht.result), /NOT saved yet/);

  const slip = await executeVaultTool('attach_file', { kind: 'expense', expense_id: 'exp-1' }, user(), undefined, new Date(), 'slip.jpg');
  assert.deepEqual([(slip.card as Record<string, unknown>).expenseId, (slip.card as Record<string, unknown>).expenseName], ['exp-1', 'ค่าเน็ต']);

  // A record being prepared in the same answer: its name, found in the app once it is saved.
  const pending = await executeVaultTool('attach_file', { kind: 'other', record_name: 'งานใหม่ของบริษัท B' }, user(), undefined, new Date(), 'slip.jpg');
  assert.equal((pending.card as Record<string, unknown>).jobName, 'งานใหม่ของบริษัท B');
  assert.equal((pending.card as Record<string, unknown>).jobId, undefined);

  for (const args of [{ kind: 'wht50', job_id: 'someone-else' }, { kind: 'expense', expense_id: 'someone-else' }, { kind: 'wht50', user_id: 'x' }, { kind: 'bad' }]) {
    const refused = await executeVaultTool('attach_file', args, user(), undefined, new Date(), 'slip.jpg');
    assert.equal((refused.result as { ok: boolean }).ok, false, JSON.stringify(args));
    assert.equal(refused.card, undefined);
  }
});

test('attach_file is offered only with a file in the app chat, not in LINE and not without a file', async () => {
  const withFile = gemini('สลิปนี้ ฿9,700 ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'สลิปงานรีวิว', attachment: { name: 'slip.jpg', mimeType: 'image/jpeg', data: jpeg } }, { config: config(), ...memoryStores(), fetchImpl: withFile.fetchImpl });
  assert.ok(withFile.tools[0].includes('attach_file'));

  const earlier = gemini('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'แนบไว้กับงานรีวิวด้วย', history: [{ role: 'user', text: 'สลิปงานรีวิว [แนบไฟล์: slip.jpg]' }, { role: 'assistant', text: 'เห็นแล้วครับ' }] },
    { config: config(), ...memoryStores(), fetchImpl: earlier.fetchImpl });
  assert.ok(earlier.tools.some(list => list.includes('attach_file')), 'a file from a recent message still counts');

  const noFile = gemini('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'งานรีวิวได้รับเงินแล้ว' }, { config: config(), ...memoryStores(), fetchImpl: noFile.fetchImpl });
  assert.ok(noFile.tools.every(list => !list.includes('attach_file')));

  const line = gemini('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'แนบไว้กับงานรีวิวด้วย', channel: 'line', history: [{ role: 'user', text: 'สลิป [แนบไฟล์: slip.jpg]' }] },
    { config: config(), ...memoryStores(), fetchImpl: line.fetchImpl });
  assert.ok(line.tools.every(list => !list.includes('attach_file')), 'LINE keeps files through its own vault cards');
});

test('the prompt: ask for the ใบ 50 ทวิ after a received payment; with a file, offer to keep it', () => {
  const action = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-' });
  assert.match(action, /ใบ 50 ทวิ: after you prepare a received payment/);
  assert.match(action, /Not for 1% \(e-WHT: no paper certificate\)/);
  assert.doesNotMatch(action, /FILES TO KEEP/);
  const withFile = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-', files: true });
  assert.match(withFile, /FILES TO KEEP: the app keeps the user's files in คลังเอกสาร/);
  assert.match(withFile, /the file is kept only after the user presses the card/);
});
