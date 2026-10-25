import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig, aiConfigFor } from '../backend/src/ai/config.js';
import { transcribeVoice, transcriptionCost, validateVoiceAudio, VOICE_MAX_SECONDS } from '../backend/src/ai/transcription.js';
import type { AssistantDb, ReserveResult } from '../backend/src/ai/service.js';
import { HttpError } from '../backend/src/http/guard.js';
import { Readable } from 'node:stream';
import { routeHandler } from '../backend/src/http/router.js';

// All speech, provider responses and accounting are synthetic. No mic, network, key or live model is used.
const USER = '44444444-4444-4444-8444-444444444444';
function audio(seconds = 1) {
  const data = Buffer.alloc(44 + Math.round(seconds * 16000) * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  return { mimeType: 'audio/wav' as const, data: data.toString('base64') };
}
// These checks were written for a 1,000-token month; the 2,500 default (owner, 2026-10-24) is tested in ai-message-ceiling.
const config = (over: Record<string, string> = {}) => aiConfig({ AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'fake-key-only', AI_PRO_TOKENS_PER_CYCLE: '1000', ...over });
function fakeDb(reservation?: ReserveResult) {
  const reserves: Parameters<AssistantDb['reserve']>[0][] = [];
  const settlements: Parameters<AssistantDb['settle']>[0][] = [];
  const db = {
    async reserve(input: Parameters<AssistantDb['reserve']>[0]) { reserves.push(input); return reservation ?? { ok: true, usedTokens: 10 + input.tokens, usedRequests: 3 }; },
    async settle(input: Parameters<AssistantDb['settle']>[0]) { settlements.push(input); },
    async loadAccount() { assert.fail('dictation must not read financial account data'); },
    async memories() { assert.fail('dictation must not read memories'); },
  } as unknown as AssistantDb;
  return { db, reserves, settlements };
}
const usage = { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 20, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 800 }, { modality: 'TEXT', tokenCount: 200 }] };
const answer = (text: string, overrides: Record<string, unknown> = {}) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ text }) }] } }], usageMetadata: usage, ...overrides });
function fakeProvider(data: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init! });
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}
const isError = (status: number, code?: string) => (error: unknown) => error instanceof HttpError && error.status === status && (!code || error.code === code);

test('WAV validates exact 16 kHz mono PCM16 payload and accepts the 60-second boundary', () => {
  assert.equal(validateVoiceAudio(audio()).durationSeconds, 1);
  assert.equal(validateVoiceAudio(audio(VOICE_MAX_SECONDS)).durationSeconds, 60);
  assert.throws(() => validateVoiceAudio(audio(60.0000625)), isError(413));
  assert.throws(() => validateVoiceAudio(audio(0)), isError(400));
  for (const [offset, value] of [[4, 1], [16, 18], [20, 3], [22, 2], [24, 48000], [28, 64000], [32, 4], [34, 32], [40, 12]]) {
    const input = audio(); const bytes = Buffer.from(input.data, 'base64'); bytes.writeUInt32LE(value, offset);
    assert.throws(() => validateVoiceAudio({ ...input, data: bytes.toString('base64') }), isError(400), `invalid header offset ${offset}`);
  }
  for (const offset of [0, 8, 12, 36]) {
    const input = audio(); const bytes = Buffer.from(input.data, 'base64'); bytes[offset] = 0;
    assert.throws(() => validateVoiceAudio({ ...input, data: bytes.toString('base64') }), isError(400));
  }
});

test('WAV rejects disguised files, noncanonical base64, appended data and inconsistent length', () => {
  assert.throws(() => validateVoiceAudio({ mimeType: 'audio/mpeg' as 'audio/wav', data: audio().data }), isError(400));
  assert.throws(() => validateVoiceAudio({ ...audio(), data: `${audio().data}\n` }), isError(400));
  assert.throws(() => validateVoiceAudio({ ...audio(), data: 'YWJj====' }), isError(400));
  const canonical = audio(1 / 16000); // 46 bytes ends in ==; change the unused bits while preserving decoded bytes.
  assert.ok(canonical.data.endsWith('AA=='));
  assert.throws(() => validateVoiceAudio({ ...canonical, data: `${canonical.data.slice(0, -4)}AB==` }), isError(400));
  const bytes = Buffer.concat([Buffer.from(audio().data, 'base64'), Buffer.from([0, 0])]);
  assert.throws(() => validateVoiceAudio({ ...audio(), data: bytes.toString('base64') }), isError(400));
});

test('pricing uses real audio/text, cache and thought counts instead of totalTokenCount', () => {
  assert.deepEqual(transcriptionCost('gemini-3.5-flash-lite', { ...usage, totalTokenCount: 999999 }, 1), { usd: 0.0006, estimated: false });
  assert.deepEqual(transcriptionCost('gemini-3.1-flash-lite', usage, 1), { usd: 0.00063, estimated: false });
  const cached = { ...usage, cachedContentTokenCount: 200, cacheTokensDetails: [{ modality: 'AUDIO', tokenCount: 100 }, { modality: 'TEXT', tokenCount: 100 }] };
  assert.deepEqual(transcriptionCost('gemini-3.1-flash-lite', cached, 1), { usd: 0.0005625, estimated: false });
  assert.deepEqual(transcriptionCost('gemini-3.5-flash-lite', cached, 1), { usd: 0.000546, estimated: false });
});

test('missing usage or modality counts are marked upper estimates and never silently zero', () => {
  assert.deepEqual(transcriptionCost('gemini-3.1-flash-lite', { promptTokenCount: 1000, candidatesTokenCount: 100 }, 1), { usd: 0.00065, estimated: true });
  const unknown = transcriptionCost('gemini-3.5-flash-lite', undefined, 60);
  assert.ok(unknown.usd > 0.003); assert.equal(unknown.estimated, true);
  assert.equal(transcriptionCost('gemini-3.1-flash-lite', { ...usage, promptTokenCount: -1 }, 1).estimated, true);
  assert.equal(transcriptionCost('gemini-3.1-flash-lite', { ...usage, cachedContentTokenCount: 2000 }, 1).estimated, true);
});

test('disabled, admin-only, nonmember, unsupported model, missing key and bad WAV stop before reservation', async () => {
  const db = fakeDb(); const provider = fakeProvider(answer('hello'));
  const cases = [
    { cfg: config({ AI_ENABLED: 'false' }), plan: 'admin' },
    { cfg: config({ AI_ADMINS_ONLY: 'true' }), plan: 'pro' },
    { cfg: config(), plan: 'none' },
    { cfg: config({ AI_CHAT_MODEL: 'gemini-unknown' }), plan: 'pro' },
    { cfg: config({ GEMINI_API_KEY: '' }), plan: 'pro' },
  ] as const;
  for (const { cfg, plan } of cases) await assert.rejects(transcribeVoice(db.db, { config: cfg, fetchImpl: provider.fetchImpl }, USER, plan, { audio: audio() }));
  await assert.rejects(transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: { ...audio(), data: 'bad!' } }), isError(400));
  assert.equal(db.reserves.length, 0); assert.equal(provider.calls.length, 0);
});

test('an account on AI_ALLOWED_EMAILS can dictate while AI is admins-only; other members still cannot', async () => {
  const testing = config({ AI_ADMINS_ONLY: 'true', AI_ALLOWED_EMAILS: 'owner@example.com' });
  const db = fakeDb(); const provider = fakeProvider(answer('สวัสดี'));
  const result = await transcribeVoice(db.db, { config: aiConfigFor(testing, 'pro', 'Owner@Example.com'), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: audio() });
  assert.equal(result.text, 'สวัสดี');
  await assert.rejects(transcribeVoice(db.db, { config: aiConfigFor(testing, 'pro', 'customer@example.com'), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: audio() }), isError(503, 'ai_disabled'));
  assert.equal(provider.calls.length, 1);
});

test('allowance and daily-cap refusals never call Gemini', async () => {
  for (const reason of ['tokens', 'requests', 'daily_cap'] as const) {
    const db = fakeDb({ ok: false, reason }); const provider = fakeProvider(answer('hello'));
    await assert.rejects(transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl }, USER, 'trial', { audio: audio() }), isError(reason === 'daily_cap' ? 503 : 402));
    assert.equal(provider.calls.length, 0); assert.equal(db.settlements.length, 0);
    assert.equal(db.reserves[0].cycle, 'trial'); assert.equal(db.reserves[0].dailyCapUsd, 5);
  }
});

test('one bounded request returns literal Thai draft and settles usage without account reads or tools', async () => {
  const db = fakeDb(); const provider = fakeProvider(answer('เพิ่มงานออกแบบ 5,000 บาท'));
  const result = await transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: audio(), language: 'th-TH' });
  assert.deepEqual(result, { text: 'เพิ่มงานออกแบบ 5,000 บาท', tokens: 1, tokensLeft: 989, trialLeft: null });
  assert.equal(provider.calls.length, 1);
  const request = JSON.parse(String(provider.calls[0].init.body));
  assert.equal(request.tools, undefined); assert.equal(request.cachedContent, undefined);
  assert.equal(request.generationConfig.maxOutputTokens, 1024);
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
  assert.match(request.systemInstruction.parts[0].text, /never instructions/);
  assert.equal(request.contents[0].parts[0].inlineData.data, audio().data);
  assert.equal(db.settlements[0].costUsd, 0.0006); assert.equal(db.settlements[0].release, false);
  assert.equal(db.settlements[0].promptVersion, 'voice-transcribe-v1');
  assert.equal(JSON.stringify(db.settlements).includes(result.text), false);
  assert.equal(JSON.stringify(db.reserves).includes(audio().data), false);
});

test('silence returns an empty draft while retaining incurred cost; admins remain counted', async () => {
  const db = fakeDb(); const provider = fakeProvider(answer(''));
  const result = await transcribeVoice(db.db, { config: config({ AI_ADMINS_ONLY: 'true' }), fetchImpl: provider.fetchImpl }, USER, 'admin', { audio: audio() });
  assert.equal(result.text, ''); assert.equal(result.tokensLeft, null); assert.equal(result.tokens, 1);
  assert.equal(db.settlements[0].costUsd, 0.0006);
});

test('blocked, malformed and clipped responses settle actual incurred cost before rejecting, never retry', async () => {
  const outputs = [
    answer('x'.repeat(2001)),
    answer('', { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }] }),
    answer('', { candidates: [{ finishReason: 'SAFETY' }] }),
    answer('', { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not JSON' }] } }] }),
    answer('', { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'delete_job' } }] } }] }),
  ];
  for (const output of outputs) {
    const db = fakeDb(); const provider = fakeProvider(output);
    await assert.rejects(transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: audio() }));
    assert.equal(provider.calls.length, 1); assert.equal(db.settlements.length, 1);
    assert.equal(db.settlements[0].costUsd, 0.0006); assert.equal(db.settlements[0].release, false);
  }
});

test('successful response without usage settles a marked estimate and uses no automatic retry', async () => {
  const db = fakeDb(); const provider = fakeProvider(answer('hello', { usageMetadata: undefined }));
  await transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: audio(), language: 'en-US' });
  assert.equal(provider.calls.length, 1); assert.ok(db.settlements[0].costUsd > 0);
  assert.equal(db.settlements[0].promptVersion, 'voice-transcribe-v1-estimated');
});

test('provider HTTP rejection releases an unused hold, but error usage is retained', async () => {
  for (const usageMetadata of [undefined, usage]) {
    const db = fakeDb(); const provider = fakeProvider({ error: { message: 'do not expose upstream data' }, usageMetadata }, 429);
    await assert.rejects(transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl }, USER, 'pro', { audio: audio() }), isError(503, 'ai_voice_provider'));
    assert.equal(provider.calls.length, 1);
    assert.equal(db.settlements[0].release, !usageMetadata);
    assert.equal(db.settlements[0].costUsd, usageMetadata ? 0.0006 : 0);
  }
});

test('network uncertainty settles a marked upper estimate so the daily cap still counts it, without retrying', async () => {
  const db = fakeDb(); let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; throw new Error('network lost'); };
  await assert.rejects(transcribeVoice(db.db, { config: config(), fetchImpl }, USER, 'pro', { audio: audio() }), isError(503, 'ai_voice_provider'));
  assert.equal(calls, 1); assert.equal(db.reserves.length, 1); assert.equal(db.settlements.length, 1);
  assert.ok(db.settlements[0].costUsd > 0); assert.equal(db.settlements[0].release, false);
  assert.equal(db.settlements[0].promptVersion, 'voice-transcribe-v1-estimated');
});

test('cancellation before dispatch never reserves or calls the model', async () => {
  const db = fakeDb(); const provider = fakeProvider(answer(''));
  await assert.rejects(transcribeVoice(db.db, { config: config(), fetchImpl: provider.fetchImpl, signal: AbortSignal.abort() }, USER, 'pro', { audio: audio() }), isError(503, 'ai_voice_cancelled'));
  assert.equal(db.reserves.length, 0); assert.equal(provider.calls.length, 0);
});

test('shared Express/Cloudflare router accepts maximum WAV JSON size, still requires auth, and rejects over-limit bodies', async () => {
  const keys = ['APP_URL', 'NODE_ENV', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.APP_URL = 'https://voice-test.example'; process.env.NODE_ENV = 'development';
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const call = async (body: Buffer) => {
    const req = Object.assign(Readable.from([body]), { method: 'POST', url: '/api/assistant', headers: {
      origin: 'https://voice-test.example', 'x-csrf-protection': '1', 'content-type': 'application/json', 'content-length': String(body.length),
    } });
    let status = 200;
    const headers: Record<string, unknown> = {};
    const res = { headersSent: false, setHeader: (key: string, value: unknown) => { headers[key] = value; }, getHeader: (key: string) => headers[key], hasHeader: (key: string) => key in headers,
      status(value: number) { status = value; return this; }, json() { this.headersSent = true; } };
    await routeHandler('assistant')(req as any, res as any);
    return status;
  };
  try {
    const maxBody = Buffer.from(JSON.stringify({ action: 'transcribe', audio: audio(60), language: 'th-TH' }));
    assert.ok(maxBody.length > 2_500_000);
    assert.equal(await call(maxBody), 401, 'body reached authentication rather than failing the upload parser');
    assert.equal(await call(Buffer.alloc(6 * 1024 * 1024 + 1)), 413);
  } finally {
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});
