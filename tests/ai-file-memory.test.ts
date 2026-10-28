import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { buildSystemPrompt, PROMPT_VERSION } from '../backend/src/ai/prompt';
import { createToolbox } from '../backend/src/ai/tools';
import { historyText, splitMemo } from '../frontend/src/features/assistant/assistantApi';
import type { ChatMessage } from '../frontend/src/features/assistant/assistantMock';

// Owner, 2026-10-24: a quotation started with a picture of the client ("อันนี้นามลูกค้านะ"); two messages later เลขา
// asked for the client again, and shortened it to "มูลนิธิ". The picture goes to the model with its own message only,
// so the model notes what it shows (note_from_file), the note goes with every later message, and the smart model
// stays on while the questions run. Fake models only: no network, no keys, no cost.

const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any;
const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' };
const FACTS = 'ลูกค้า: มูลนิธิตัวอย่างเพื่อการศึกษา\nที่อยู่: 1 หมู่ 1 ต.ตัวอย่าง อ.เมือง จ.เชียงใหม่ 50000\nเลขผู้เสียภาษี: 0000000000000\nรายการเดิม: ตัดคลิปวิดีโอ 2 คลิป × 1,700';
const claude = (content: unknown[], stop: string) => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop, stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 } });

function fakeModels(claudeReplies: unknown[]) {
  const asked: { provider: 'claude' | 'gemini'; body: any }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(input).includes('anthropic')) {
      asked.push({ provider: 'claude', body });
      const next = claudeReplies.shift() ?? claude([{ type: 'text', text: 'รับทราบครับ' }], 'end_turn');
      return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
    }
    asked.push({ provider: 'gemini', body });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'ลูกค้าชื่ออะไรครับ' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
  }) as unknown as typeof fetch;
  return { asked, fetchImpl };
}

test('a picture is noted once; the note comes back with every later message and keeps the smart model on', async () => {
  // 1. The picture: the model writes down what it shows, then asks the rest.
  const first = fakeModels([
    claude([{ type: 'tool_use', id: 'toolu_1', name: 'note_from_file', input: { facts: FACTS } }], 'tool_use'),
    claude([{ type: 'text', text: 'ได้ชื่อลูกค้าจากรูปแล้วครับ ตอบอีกสามข้อได้เลย' }], 'end_turn'),
  ]);
  const withFile = await runAssistant({ user, plan: 'pro', text: 'อันนี้นามลูกค้านะ', attachment: { name: 'ภาพถ่ายหน้าจอ.png', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
    history: [{ role: 'user', text: 'ช่วยสร้างใบเสนอราคาให้หน่อย' }, { role: 'assistant', text: 'ขอข้อมูลเพิ่มครับ\n- ใบเสนอราคานี้ออกให้ลูกค้าชื่ออะไร' }] },
  { config: aiConfig(env), ...memoryStores(), fetchImpl: first.fetchImpl });
  assert.equal(withFile.memo, FACTS);
  assert.deepEqual(first.asked.map(row => row.provider), ['claude', 'claude']);

  // 2. The chat as the app sends it next: the file by name, and the note before เลขา's answer.
  const chat: ChatMessage[] = [
    { id: 'm1', from: 'me', text: 'ช่วยสร้างใบเสนอราคาให้หน่อย', at: 1 },
    { id: 'b1', from: 'bot', text: 'ขอข้อมูลเพิ่มครับ', at: 2, cards: [{ kind: 'questions', id: 'ask_1', questions: [{ id: 'q1', text: 'ใบเสนอราคานี้ออกให้ลูกค้าชื่ออะไร', options: [], allowText: true }] }] },
    { id: 'm2', from: 'me', text: 'อันนี้นามลูกค้านะ', at: 3, attachment: { name: 'ภาพถ่ายหน้าจอ.png', kind: 'image' } },
    { id: 'b2', from: 'bot', text: withFile.text, at: 4, memo: withFile.memo, cards: [{ kind: 'questions', id: 'ask_2', questions: [{ id: 'q1', text: 'รายการงาน จำนวน และราคาต่อหน่วย', options: [], allowText: true }] }] },
  ];
  const history = chat.map(message => ({ role: message.from === 'me' ? 'user' as const : 'assistant' as const, text: historyText(message) }));
  assert.equal(history[2].text, 'อันนี้นามลูกค้านะ [แนบไฟล์: ภาพถ่ายหน้าจอ.png]');
  assert.ok(history[3].text.startsWith(`[อ่านจากไฟล์ที่แนบ: ${FACTS}]\n`));
  assert.ok(history[3].text.endsWith('\n- รายการงาน จำนวน และราคาต่อหน่วย'));

  // 3. A short answer ("ตัดต่อ 5 คลิป ไม่มี VAT ไม่หัก") stays with the smart model, and the client is in what it reads.
  const second = fakeModels([]);
  await runAssistant({ user, plan: 'pro', text: 'รายการงาน: ตัดต่อ 5 คลิป\nVAT: ไม่มี\nหัก ณ ที่จ่าย: ไม่หัก', history }, { config: aiConfig(env), ...memoryStores(), fetchImpl: second.fetchImpl });
  assert.deepEqual(second.asked.map(row => row.provider), ['claude']);
  assert.match(JSON.stringify(second.asked[0].body.messages), /มูลนิธิตัวอย่างเพื่อการศึกษา/);

  // 4. Another question later in the same run ("ราคาต่อคลิป") still stays smart.
  const later = [...history, { role: 'user' as const, text: 'รายการงาน: ตัดต่อ 5 คลิป' }, { role: 'assistant' as const, text: 'ขอราคาต่อคลิปครับ\n- ราคาต่อคลิป' }];
  const third = fakeModels([]);
  await runAssistant({ user, plan: 'pro', text: '1,700', history: later }, { config: aiConfig(env), ...memoryStores(), fetchImpl: third.fetchImpl });
  assert.deepEqual(third.asked.map(row => row.provider), ['claude']);
});

test('easy chats stay light: a question chain without hard work or files, and an answer that asked nothing', async () => {
  const easy = fakeModels([]);
  await runAssistant({ user, plan: 'pro', text: 'ร้านกาแฟ', history: [{ role: 'user', text: 'ขอบคุณครับ' }, { role: 'assistant', text: 'ยินดีครับ มีอะไรให้ช่วยอีกไหม' }] },
    { config: aiConfig(env), ...memoryStores(), fetchImpl: easy.fetchImpl });
  assert.deepEqual(easy.asked.map(row => row.provider), ['gemini']);
  // An earlier file, but the chat moved on (เลขา's last answer asked nothing): back to light.
  const done = fakeModels([]);
  await runAssistant({ user, plan: 'pro', text: 'สวัสดีครับ', history: [{ role: 'user', text: 'อันนี้นามลูกค้านะ [แนบไฟล์: a.png]' }, { role: 'assistant', text: 'เตรียมใบเสนอราคาให้แล้วครับ' }] },
    { config: aiConfig(env), ...memoryStores(), fetchImpl: done.fetchImpl });
  assert.deepEqual(done.asked.map(row => row.provider), ['gemini']);
  // The answer that read the file finished the work without asking: a thank-you stays light.
  const finished = fakeModels([]);
  await runAssistant({ user, plan: 'pro', text: 'ขอบคุณครับ', history: [{ role: 'user', text: 'อันนี้นามลูกค้านะ [แนบไฟล์: a.png]' },
    { role: 'assistant', text: `[อ่านจากไฟล์ที่แนบ: ${FACTS}]\nเตรียมใบเสนอราคาให้แล้วครับ` }] }, { config: aiConfig(env), ...memoryStores(), fetchImpl: finished.fetchImpl });
  assert.deepEqual(finished.asked.map(row => row.provider), ['gemini']);
});

test('note_from_file keeps a note only for a file in this message; stored notes are hidden from the screen', async () => {
  const withFile = createToolbox({ user, ...memoryStores(), hasAttachment: true });
  const noted = await withFile({ id: 'n', name: 'note_from_file', args: { facts: `ลูกค้า: ${'ก'.repeat(2000)}` } });
  assert.equal((noted.result as any).ok, true);
  assert.equal(noted.memo?.length, 1500);
  const without = createToolbox({ user, ...memoryStores() });
  const refused = await without({ id: 'n', name: 'note_from_file', args: { facts: 'ลูกค้า: x' } });
  assert.equal((refused.result as any).ok, false);
  assert.equal(refused.memo, undefined);
  const card = { kind: 'confirm', id: 'p_1', title: 'สร้างใบเสนอราคา', changes: [] } as any;
  assert.deepEqual(splitMemo([card, { kind: 'memo', text: FACTS }]), { cards: [card], memo: FACTS });
  assert.deepEqual(splitMemo([{ kind: 'memo', text: FACTS }]), { memo: FACTS });
  assert.deepEqual(splitMemo(undefined), {});
});

test('the rules: never ask twice, real options only, per-unit prices, the client in full from a file', () => {
  assert.ok(Number(PROMPT_VERSION.replace('secretary-v', '')) >= 9, PROMPT_VERSION);
  // secretary-v20 (owner, 2026-10-28): the file rules go with a file in the chat (files), every other rule as before.
  const prompt = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '25 ต.ค. 2569 10:00', files: true } as any);
  assert.ok(!buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '25 ต.ค. 2569 10:00' } as any).includes('call note_from_file first'));
  for (const rule of ['Never ask again for what this chat already has', 'never ask the same question twice', 'ONE ask_user call',
    'Never\n  make up round numbers as price options', 'ราคาต่อคลิป', 'never a shortened มูลนิธิ', 'call note_from_file first']) {
    assert.ok(prompt.includes(rule), rule);
  }
});
