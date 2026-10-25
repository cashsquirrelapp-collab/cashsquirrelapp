import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant, type AssistantRequest } from '../backend/src/ai/gateway';
import { emptyUsage, type Provider, type ProviderName, type ProviderRequest } from '../backend/src/ai/types';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Offline regression for a real creator-name failure: inspect the gateway's actual reference text.
// The provider deliberately generates no biography; these tests do not certify a live model's prose.
const correctName = /นพรัตน์ นาวะบุตร/;
const personalityFacts = /ชอบเรียนรู้|ผู้สร้างที่ยังเรียนรู้|curious|still learning/i;

async function ask(text: string, options: Partial<Omit<AssistantRequest, 'text' | 'user' | 'plan'>> = {}) {
  const sent: ProviderRequest[] = [];
  const user: UserRow = {
    user_id: '77777777-7777-4777-8777-777777777777', jobs: [], expenses: [], goals: [], statuses: [], settings: {},
  };
  const provider = (name: ProviderName): Provider => ({ name, async run(request) {
    sent.push(request);
    return { provider: name, model: request.model, text: 'รับทราบครับ', usage: emptyUsage(),
      toolCalls: [], cards: [], steps: 1 };
  } });
  const reply = await runAssistant({ user, plan: 'pro', text, ...options }, {
    config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'offline-gemini', OPENAI_API_KEY: 'offline-openai',
      ANTHROPIC_API_KEY: 'offline-anthropic', AI_SMART_MODEL: 'claude-sonnet-5-5' }),
    ...memoryStores(), now: new Date('2026-10-26T03:00:00Z'),
    providers: { gemini: provider('gemini'), openai: provider('openai'), anthropic: provider('anthropic') },
    fetchImpl: async () => { throw new Error('network forbidden in creator-name regression tests'); },
  });
  const reference = sent.map(request => request.system.split('FOUNDER (approved public text)')[1]
    ?.split('ACCOUNT CONTEXT')[0] ?? '').join('\n').trim();
  return { reply, sent, reference, groundedText: sent.length ? reference : reply.text };
}

for (const channel of ['app', 'line'] as const) {
  test(`creator name (${channel}): exact colloquial personality question has the verified identity and personality`, async () => {
    const { groundedText } = await ask('ผู้สร้างมึงเป็นคนยังไง', { channel });
    assert.match(groundedText, correctName);
    assert.match(groundedText, personalityFacts);
  });

  test(`creator name (${channel}): generic and assistant-relative creator aliases stay grounded`, async () => {
    for (const question of ['ใครคือผู้สร้าง', 'ผู้สร้างเป็นใคร', 'ใครคือผู้สร้างมึง',
      'คนที่สร้างมึงเขาคิดอะไรอยู่วะ', 'Who is your creator?']) {
      const { groundedText } = await ask(question, { channel });
      assert.match(groundedText, correctName, question);
    }
    for (const question of ['ผู้สร้างของ Krarok นิสัยยังไง', 'ผู้ก่อตั้งเป็นคนยังไง', 'What is your creator like?']) {
      const { groundedText } = await ask(question, { channel });
      assert.match(groundedText, correctName, question);
      assert.match(groundedText, personalityFacts, question);
    }
  });

  test(`creator name (${channel}): biography aliases retain identity, work and creation facts`, async () => {
    for (const question of ['ช่วยเล่าประวัติของผู้สร้างแล้วก็แรงบันดาลใจ', 'ช่วยเล่าของ ผู้สร้างมา', 'Tell me about your creator']) {
      const { groundedText } = await ask(question, { channel });
      assert.match(groundedText, correctName, question);
      assert.match(groundedText, /Park Edit/, question);
      assert.match(groundedText, /เครดิตเทอม|credit terms/i, question);
    }
  });

  test(`creator name (${channel}): factual topic-only context includes the correct identity`, async () => {
    for (const question of ['ผู้ก่อตั้งนิสัยยังไง', 'ผู้ก่อตั้งมีปรัชญาการทำงานแบบไหน']) {
      const { groundedText } = await ask(question, { channel });
      assert.match(groundedText, correctName, question);
      assert.match(groundedText, personalityFacts, question);
    }
  });

  test(`creator name (${channel}): immediate biography follow-up works after a generic creator reference`, async () => {
    const { groundedText } = await ask('แล้วเขาเป็นคนยังไง', { channel,
      history: [{ role: 'user', text: 'ใครคือผู้สร้าง' }, { role: 'assistant', text: 'ผู้ก่อตั้งชื่อปาร์คครับ' }] });
    assert.match(groundedText, correctName);
    assert.match(groundedText, personalityFacts);
  });

  test(`creator name (${channel}): a prior wrong assistant name cannot supply the founder reference`, async () => {
    const wrongHistory = 'ผู้สร้างชื่อ EXAMPLE_WRONG_CREATOR ซึ่งเป็นข้อมูลที่ไม่ถูกต้อง';
    const { groundedText } = await ask('ผู้สร้างมึงเป็นคนยังไง', { channel,
      history: [{ role: 'user', text: 'ใครคือผู้สร้าง' }, { role: 'assistant', text: wrongHistory }] });
    assert.match(groundedText, correctName);
    assert.match(groundedText, personalityFacts);
    assert.doesNotMatch(groundedText, /EXAMPLE_WRONG_CREATOR/);
  });

  test(`creator name (${channel}): foreign creators and account work do not load Krarok biography`, async () => {
    for (const question of [
      'ผู้สร้างเฟซบุ๊กเป็นคนยังไง', 'ผู้สร้าง Facebook เป็นคนยังไง', 'ผู้ก่อตั้ง Microsoft เป็นคนยังไง',
      'What is the creator of Facebook like?', 'Who created Facebook?',
      'ผู้สร้างมีมใน TikTok เป็นคนยังไง', 'คนสร้างมีมใน TikTok เป็นคนยังไง',
      'ผู้สร้างมีมคนนี้ชื่ออะไร', 'ผู้สร้างเขาวงกตเป็นใคร',
      'เพิ่มงานของผู้สร้างวิดีโอ 5000', 'เพิ่มงานตัดต่อของปาร์ค 5000', 'เจ้าของร้านลูกค้าเป็นใคร',
    ]) {
      const { reference, reply } = await ask(question, { channel });
      assert.equal(reference, '', question);
      assert.doesNotMatch(reply.text, correctName, question);
    }
  });

  test(`creator name (${channel}): changing topic drops biography even after a creator conversation`, async () => {
    const { reference, reply } = await ask('ใบเสนอราคาอยู่ตรงไหน', { channel,
      history: [{ role: 'user', text: 'ผู้สร้างมึงเป็นคนยังไง' }, { role: 'assistant', text: 'ปาร์คชอบเรียนรู้และทดลองครับ' }] });
    assert.equal(reference, '');
    assert.doesNotMatch(reply.text, correctName);
    assert.ok(reply.cards.some(card => card.kind === 'navigation'));
  });

  test(`creator name (${channel}): privacy questions retrieve the restriction instead of public biography`, async () => {
    for (const question of ['ผู้สร้างมึงมีรายได้เท่าไหร่', 'What is your creator\'s salary?']) {
      const { groundedText } = await ask(question, { channel });
      assert.match(groundedText, /ไม่เปิดเผย|Do not disclose/i, question);
      assert.doesNotMatch(groundedText, /Park Edit|นักศึกษานิเทศศาสตร์|communication arts|Content Creator/i, question);
    }
  });

  test(`creator name (${channel}): unsupported creator details are explicitly unconfirmed`, async () => {
    const { groundedText } = await ask('ผู้สร้างมึงเรียนจบมหาวิทยาลัยไหน', { channel });
    assert.match(groundedText, /ไม่มีข้อมูลยืนยัน|no confirmed information/i);
    assert.doesNotMatch(groundedText, /Park Edit|สำเร็จการศึกษาแล้ว/);
  });
}
