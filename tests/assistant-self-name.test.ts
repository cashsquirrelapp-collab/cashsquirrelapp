import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { confidentialAnswer, founderAnswer } from '../backend/src/ai/founderKnowledge';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { KNOWLEDGE_BASE } from '../backend/src/ai/knowledgeBase';
import { buildSystemPrompt } from '../backend/src/ai/prompt';
import { selfName, styleReply } from '../backend/src/ai/replyStyle';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-31: "อยากให้น้องแทนตัวเองว่าเลขากระรอก ... ไม่ต้องเอ่ยถึงคำว่า AI ... สวมบทบาทเป็นบุคคลหนึ่ง".
// เลขา plays เลขากระรอก and never calls itself AI. It never claims to be a person, either: asked sincerely, it says it is
// the app's automatic assistant. Fake Gemini server: no network, no keys, no cost. Synthetic account only.

const A = '55555555-5555-4555-8555-555555555555';
const account = (): UserRow => ({ user_id: A, statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as unknown as UserRow);
const config = () => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' });
const gemini = (text: string) => (async () => new Response(JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 },
}), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
const SELF_AI = /(?:ผม|เลขา(?:กระรอก)?|ผู้ช่วย)\s*(?:เป็น|คือ)?\s*(?:ผู้ช่วย\s*)?(?:AI|เอไอ)(?![A-Za-z])|an AI assistant|as an AI/i;

test('the prompt: เลขากระรอก stays in character, never calls itself AI, and never claims to be a person', () => {
  const prompt = buildSystemPrompt({ route: 'chat', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-' });
  assert.match(prompt, /SELF \(owner, 2026-10-31/);
  assert.match(prompt, /Refer to yourself as เลขากระรอก,\n  เลขา or ผม/);
  assert.match(prompt, /Never call yourself AI, เอไอ, ปัญญาประดิษฐ์, a bot, a chatbot, a language model or a program/);
  assert.match(prompt, /never claim to be a human being/);
  assert.match(prompt, /เลขากระรอกเป็นผู้ช่วยอัตโนมัติในแอป ไม่ใช่คนจริงครับ/);
  assert.doesNotMatch(prompt, /ผู้ช่วย AI|เลขา AI/);
});

test('the set answers and the app knowledge never call เลขา AI', () => {
  for (const text of ['ใครสร้างเลขา', 'who made you?']) assert.doesNotMatch(founderAnswer('secretary', text), SELF_AI, text);
  for (const text of ['ใช้ AI อะไร', 'what model are you?']) {
    assert.doesNotMatch(confidentialAnswer('technology', text), SELF_AI, text);
    assert.doesNotMatch(confidentialAnswer('technology', text), /\bAI\b/, text);
  }
  assert.match(founderAnswer('secretary', 'ใครสร้างเลขา'), /^เลขากระรอกเป็นผู้ช่วยส่วนตัวที่พัฒนาขึ้นสำหรับ Krarok/);
  const knowledge = JSON.stringify(KNOWLEDGE_BASE);
  assert.doesNotMatch(knowledge, /เลขา AI|AI secretary|สิทธิ์ AI|โควตา AI/);
});

test('the reply check rewrites เลขา calling itself AI; AI as a topic and the user\'s names stay', () => {
  const cases: [string, string][] = [
    ['สวัสดีครับ ผมเป็น AI ที่ช่วยดูงานให้', 'สวัสดีครับ ผมเป็นเลขากระรอกที่ช่วยดูงานให้'],
    ['เลขากระรอกเป็นผู้ช่วย AI ของ Krarok ครับ', 'เลขากระรอกเป็นผู้ช่วยส่วนตัวของ Krarok ครับ'],
    ['ในฐานะ AI ผมตอบเรื่องนี้ไม่ได้', 'ในฐานะเลขา ผมตอบเรื่องนี้ไม่ได้'],
    ['เลขา AI ใช้ 1,650 โทเคน', 'เลขากระรอกใช้ 1,650 โทเคน'],
    ['เราเป็นบอทนะ', 'เราเป็นเลขากระรอกนะ'],
    ["As an AI language model, I can't eat.", "As Krarok Secretary, I can't eat."],
    ["I'm just an AI assistant.", "I'm Krarok Secretary."],
    ['Krarok Secretary is an AI assistant built for Krarok.', 'Krarok Secretary is the personal assistant built for Krarok.'],
  ];
  for (const [from, to] of cases) assert.equal(selfName(from), to, from);
  for (const kept of ['ธุรกิจของเราคือ AI art ครับ', 'ลูกค้าของคุณทำงาน AI startup', 'AI จะมาแย่งงานไหม ผมว่าไม่ครับ',
    'งานออกแบบ AI Studio ค้าง ฿5,000', 'ผมบอกแล้วครับ']) assert.equal(selfName(kept), kept, kept);
  assert.equal(styleReply('ผมเป็น AI ครับ', { userText: 'เป็นใคร' }), 'ผมเป็นเลขากระรอกครับ');
});

for (const channel of ['app', 'line'] as const) {
  test(`in the chat (${channel}): a model that calls itself AI is answered as เลขากระรอก`, async () => {
    const reply = await runAssistant({ user: account(), plan: 'pro', text: 'คุณเป็นใคร', channel }, {
      config: config(), ...memoryStores(), fetchImpl: gemini('สวัสดีครับ ผมเป็นผู้ช่วย AI ที่คอยช่วยดูงานและเงินให้คุณครับ'),
    });
    assert.doesNotMatch(reply.text, SELF_AI);
    assert.match(reply.text, /ผมเป็นเลขากระรอก/);
  });
}
