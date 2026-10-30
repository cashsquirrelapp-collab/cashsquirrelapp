import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-31: "สกิลความจำน้องหายไปไหน เรื่องของประวัติผู้สร้าง CEO ... น้องไปจำชื่อใครก็ไม่รู้". Krarok's CEO, owner
// or maker, asked in any of those words, gets the approved founder facts (or the direct answer), never a guessed name.
// A client's CEO, "เรียกผมว่า CEO" and work questions are left alone. Fake models: no network, no cost.

const user = { user_id: '77777777-7777-4777-8777-777777777777', statuses: [], goals: [], settings: {}, jobs: [], expenses: [] } as unknown as UserRow;
const config = () => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' });

async function ask(text: string) {
  let system = '';
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const claude = String(input).includes('anthropic');
    system = claude ? JSON.stringify(body.system) : body.systemInstruction?.parts?.[0]?.text ?? '';
    const reply = claude
      ? { id: 'm', type: 'message', role: 'assistant', model: 'x', content: [{ type: 'text', text: 'ตอบ' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      : { candidates: [{ content: { role: 'model', parts: [{ text: 'ตอบ' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'r' } });
  }) as unknown as typeof fetch;
  const reply = await runAssistant({ user, plan: 'pro', text, accountName: 'ผู้ใช้ตัวอย่าง' }, { config: config(), ...memoryStores(), fetchImpl });
  return /นพรัตน์/.test(system) || /นพรัตน์/.test(reply.text);
}

test('Krarok\'s CEO, owner or maker, in any of those words, is answered from the founder facts', async () => {
  for (const text of ['CEO ของแอปนี้คือใคร', 'ใครเป็น CEO', 'ซีอีโอคือใคร', 'ประวัติ CEO', 'คนทำแอปนี้ชื่ออะไร', 'เจ้าของแอปคือใคร', 'เจ้าของกระรอกตุนเงินคือใคร',
    'ใครเป็นคนสร้างแอปนี้', 'ประวัติผู้สร้าง', 'เล่าประวัติผู้ก่อตั้งหน่อย']) {
    assert.equal(await ask(text), true, text);
  }
});

test('a client\'s CEO, a nickname and work questions do not pull in the founder', async () => {
  for (const text of ['CEO ของบริษัท ABC คือใคร', 'เรียกผมว่า CEO', 'งานของ CEO สตูดิโอค้างเท่าไหร่']) assert.equal(await ask(text), false, text);
});
