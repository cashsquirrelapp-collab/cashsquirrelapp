import test from 'node:test';
import assert from 'node:assert/strict';
import { LINE_AI_BUDGET_MS, lineAssistantAnswer } from '../backend/src/ai/lineBridge';
import type { handleMessage } from '../backend/src/ai/service';
import { showTyping } from '../backend/src/handlers/line-webhook';
import { HttpError } from '../backend/src/http/guard';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner, 2026-10-28: LINE's first message often got no answer, and the chat should show that เลขา is typing.

test('LINE typing dots: the loading API for this chat, 30 seconds; a failure never stops the answer', async () => {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  await showTyping('token-x', 'U123', (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('authorization') });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch);
  assert.deepEqual(calls, [{ url: 'https://api.line.me/v2/bot/chat/loading/start', body: { chatId: 'U123', loadingSeconds: 30 }, auth: 'Bearer token-x' }]);
  await showTyping('token-x', 'U123', (async () => { throw new Error('network'); }) as unknown as typeof fetch);
  await showTyping('token-x', 'U123', (async () => new Response('{}', { status: 400 })) as unknown as typeof fetch);
});

const base = {
  env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'test-gemini' },
  db: {} as never,
  plan: async () => ({ plan: 'pro' as const, email: null }),
  rateLimit: async () => undefined,
};

test('LINE answers get a deadline inside the Worker\'s background time; too slow says so plainly, at no cost', async () => {
  assert.ok(LINE_AI_BUDGET_MS <= 22_000, 'room left for the reads, the bookkeeping and the reply within about 30 s');
  let deadline: AbortSignal | undefined;
  const slow = await lineAssistantAnswer({ user_id: 'u1' } as UserRow, 'สรุปเดือนนี้', [], {
    ...base, budgetMs: 20,
    run: (async (_db: unknown, deps: { signal?: AbortSignal }) => {
      deadline = deps.signal;
      await new Promise(resolve => setTimeout(resolve, 40));
      throw new HttpError(503, 'เลขากระรอกตอบไม่ทันในตอนนี้ กรุณาลองใหม่อีกครั้ง', 'ai_provider');
    }) as unknown as typeof handleMessage,
  });
  assert.equal(deadline?.aborted, true, 'the model got the deadline and it ran out');
  assert.equal(slow!.text, 'ขอโทษครับ รอบนี้เลขาใช้เวลานานกว่าปกติ ส่งข้อความเดิมอีกครั้งได้เลยครับ (ไม่มีการหักโทเคน)');
  // Other refusals still say what they say.
  const tokens = await lineAssistantAnswer({ user_id: 'u1' } as UserRow, 'สรุปเดือนนี้', [], {
    ...base, run: (async () => { throw new HttpError(402, 'โทเคนของรอบนี้หมดแล้ว', 'ai_tokens_used'); }) as unknown as typeof handleMessage,
  });
  assert.equal(tokens!.text, 'โทเคนของรอบนี้หมดแล้ว');
});
