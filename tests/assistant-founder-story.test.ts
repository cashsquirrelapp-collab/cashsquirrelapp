import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { founderStoryParts, founderStoryReference } from '../backend/src/ai/knowledgeAdditions/founderStoryWeb';
import { SECTIONS } from '../shared/founderStory';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-31: "ประวัติของกูหรือแรงบันดาลใจทุกอย่างที่เขียนไว้บนเว็บ ให้น้องเอาส่วนนั้นมาตอบ". A founder question gets the
// founder's own story from the website (shared/founderStory.ts, the same text /founder shows), the parts it is about; a
// private question never does. Fake models: no network, no cost.

const user = { user_id: '88888888-8888-4888-8888-888888888888', statuses: [], goals: [], settings: {}, jobs: [], expenses: [] } as unknown as UserRow;
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
  return { system, reply };
}

test('the story parts a question is about; a general question gets the beginning', () => {
  assert.deepEqual(founderStoryParts('เล่าประวัติผู้ก่อตั้งหน่อย'), ['01']);
  assert.deepEqual(founderStoryParts('ปาร์คสร้างแอปนี้นานแค่ไหน ทำคนเดียวไหม'), ['03']);
  assert.deepEqual(founderStoryParts('อนาคตของ Krarok จะเป็นยังไง'), ['05']);
  assert.deepEqual(founderStoryParts('ผู้ก่อตั้งอยากบอกอะไรกับผู้ใช้'), ['07']);
  assert.deepEqual(founderStoryParts('ช่วยเล่าเรื่อง CEO หน่อย'), ['01', '02', '03']);
  const reference = founderStoryReference('ปาร์คสร้างแอปนี้นานแค่ไหน', 'th');
  assert.match(reference, /5 เดือนแห่งการลงมือสร้าง/);
  assert.match(reference, /เพื่อนร่วมทีมอีกสองคน/);
  assert.match(reference, /\/founder/);
  assert.doesNotMatch(reference, /\*\*/, 'no Markdown markers from the page');
  assert.doesNotMatch(reference, /รูปที่|1600 ×/, 'no photo spaces');
  assert.match(founderStoryReference('How long did it take to build?', 'en'), /Five months of building/);
  assert.equal(SECTIONS.length, 7);
});

test('founder questions are answered from the website story; private ones are not', async () => {
  for (const [text, words] of [
    ['เล่าประวัติผู้ก่อตั้งหน่อย', /เครื่องกรองน้ำให้ยาย/],
    ['ทำไมปาร์คถึงสร้างแอปนี้', /ทำไมการทำบัญชีด้วยตัวเองถึงต้องยุ่งยากขนาดนี้/],
    ['CEO ของแอปนี้คือใคร', /เรื่องราวจากผู้ก่อตั้ง/],
    ['อนาคตที่ผู้ก่อตั้งอยากสร้างให้ Krarok คืออะไร', /ผู้ช่วยด้านงานและการเงินที่คุณสามารถพึ่งพาได้ในทุกวัน/],
  ] as const) {
    const { system, reply } = await ask(text);
    assert.ok(words.test(system) || words.test(reply.text), text);
  }
  const { system } = await ask('ปาร์ครายได้ต่อเดือนเท่าไหร่');
  assert.doesNotMatch(system, /เรื่องราวจากผู้ก่อตั้ง/, 'a private question gets no story');
});

test('the team answer says what the story says: one founder and two teammates', async () => {
  const { reply } = await ask('Krarok มีทีมกี่คน');
  assert.match(reply.text, /เพื่อนร่วมทีมอีกสองคน|สองคน/);
});
