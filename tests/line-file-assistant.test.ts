import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

// A picture or PDF sent in LINE (owner, 2026-11-06: "ในไลน์สามารถทำให้อ่านไฟล์ PDF อ่านรูปภาพได้ไหม แล้วก็แกะออกมาเพื่อบันทึก
// รายจ่ายหรือรายรับ ... เหมือนแบบในเลขากระรอกเลยในแอป", then "อ่านทันที แล้วเสนอการ์ดบันทึก"): kept in คลังเอกสาร first, read
// by เลขา into confirmation cards that remember the file; the earlier "what is this file" card when nothing is prepared.

Object.assign(process.env, { SUPABASE_URL: 'https://linefile.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' });
const { handleLineFileMessage, LINE_FILE_REQUEST } = await import('../backend/src/services/lineVaultChat');
const { lineAssistantAnswer } = await import('../backend/src/ai/lineBridge');
const links = await import('../backend/src/services/lineFileLinks');
const { HttpError } = await import('../backend/src/http/guard');

const USER = '00000000-0000-4000-8000-000000000042';
const FILE = '11111111-2222-4333-8444-555555555555';
const PROPOSAL = 'p_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const jpeg = (size = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]);
const isKeepCard = (message: any) => message.type === 'flex' && JSON.stringify(message).includes('เก็บไฟล์ไว้แล้ว');

function deps(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const base = {
    owner: async () => ({ user: { user_id: USER, notif_settings: {} }, auth: { id: USER } }),
    read: async () => jpeg(),
    store: async (_scope: unknown, _auth: unknown, _bytes: Buffer, meta: { fileName: string }) => { calls.push(`store:${meta.fileName}`); return { id: FILE, fileName: 'ใบเสร็จ.jpg' }; },
    answer: async (_user: unknown, text: string, _history: unknown, files: { mimeType: string; name: string }[]) => {
      calls.push(`answer:${text}:${files.map(file => `${file.name}|${file.mimeType}`).join(',')}`);
      return { messages: [{ type: 'text', text: 'ใบเสร็จค่าเน็ต ฿599 ครับ' }, { type: 'flex', altText: 'บันทึกรายจ่าย', contents: {} }], text: 'ใบเสร็จค่าเน็ต ฿599', proposalIds: [PROPOSAL] };
    },
    remember: async (userId: string, fileId: string, ids: string[]) => { calls.push(`remember:${userId}:${fileId}:${ids.join(',')}`); },
    saveHistory: async (_user: unknown, said: string) => { calls.push(`history:${said}`); },
    rateLimit: async (scope: string) => { calls.push(`limit:${scope}`); },
    ...over,
  };
  return { deps: base as any, calls };
}

test('a receipt photo: kept in the vault, read by เลขา with the same words a person would type, its card remembers the file', async () => {
  const { deps: d, calls } = deps();
  const reply = await handleLineFileMessage('Uline', { id: '123456', type: 'image' }, 'token', d) as any[];
  assert.deepEqual(reply.map(message => message.type), ['text', 'flex', 'text']);
  assert.match(reply[2].text, /เก็บไฟล์ไว้ในคลังเอกสารแล้ว กดยืนยันแล้วผมแนบไฟล์กับรายการให้/);
  assert.deepEqual(calls, ['store:รูปจาก LINE', 'limit:assistant-file', `answer:${LINE_FILE_REQUEST}:ใบเสร็จ.jpg|image/jpeg`,
    'history:[ส่งไฟล์] ใบเสร็จ.jpg', `remember:${USER}:${FILE}:${PROPOSAL}`]);
});

test('nothing prepared (a contract, a ใบ 50 ทวิ): เลขา\'s words, then the card asking what the file is', async () => {
  const { deps: d } = deps({ answer: async () => ({ messages: [{ type: 'text', text: 'ไฟล์นี้เป็นสัญญาจ้างครับ' }], text: 'สัญญา' }) });
  const reply = await handleLineFileMessage('Uline', { id: '1', type: 'file', fileName: 'contract.pdf' }, 'token', d) as any[];
  assert.equal(reply[0].text, 'ไฟล์นี้เป็นสัญญาจ้างครับ');
  assert.ok(isKeepCard(reply[1]));
});

test('เลขา not on for the account, a file it cannot read, or one over 4 MB: kept, and the earlier card', async () => {
  const off = deps({ answer: async () => null });
  assert.ok(isKeepCard((await handleLineFileMessage('U', { id: '1', type: 'image' }, 't', off.deps))[0]));
  const odd = deps({ read: async () => Buffer.from('not a picture at all') });
  const oddReply = await handleLineFileMessage('U', { id: '1', type: 'file' }, 't', odd.deps);
  assert.equal(oddReply.length, 1);
  assert.ok(!odd.calls.some(call => call.startsWith('answer')));
  const big = deps({ read: async () => jpeg(4 * 1024 * 1024 + 10) });
  const bigReply = await handleLineFileMessage('U', { id: '1', type: 'image' }, 't', big.deps) as any[];
  assert.match(bigReply[0].text, /ไฟล์ใหญ่เกิน 4 MB/);
  assert.ok(isKeepCard(bigReply[1]));
  assert.ok(!big.calls.some(call => call.startsWith('answer')));
});

test('out of tokens or too many files: said as it is, and the file is still kept', async () => {
  const { deps: d } = deps({ answer: async () => { throw new HttpError(402, 'โทเคนเลขารอบนี้หมดแล้ว'); } });
  const reply = await handleLineFileMessage('U', { id: '1', type: 'image' }, 't', d) as any[];
  assert.equal(reply[0].text, 'โทเคนเลขารอบนี้หมดแล้ว เก็บไฟล์ไว้ในคลังเอกสารแล้วครับ');
  assert.ok(isKeepCard(reply[1]));
});

test('an account LINE cannot keep files for gets the reason, and nothing is read', async () => {
  const { deps: d, calls } = deps({ owner: async () => ({ type: 'text', text: 'เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน' }) });
  assert.deepEqual(await handleLineFileMessage('U', { id: '1', type: 'image' }, 't', d), [{ type: 'text', text: 'เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน' }]);
  assert.deepEqual(calls, []);
});

test('lineAssistantAnswer: the file goes to เลขา as in the app, and the confirmation cards come back by id', async () => {
  let input: any;
  const answer = await lineAssistantAnswer({ user_id: USER } as any, LINE_FILE_REQUEST, [], {
    env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'test-gemini' },
    plan: async () => ({ plan: 'pro' as const, email: null }), consented: async () => true, rateLimit: async () => undefined,
    run: (async (_db: unknown, _deps: unknown, _user: unknown, _plan: unknown, given: unknown) => {
      input = given;
      return { text: 'ใบเสร็จค่าเน็ต ฿599 ครับ', cards: [{ kind: 'confirm', id: PROPOSAL, title: 'บันทึกรายจ่าย', changes: [] }], tokensLeft: 900 };
    }) as any,
  }, [{ name: 'ใบเสร็จ.jpg', mimeType: 'image/jpeg', data: jpeg().toString('base64') }]);
  assert.equal(input.channel, 'line');
  assert.deepEqual(input.attachments.map((file: { name: string }) => file.name), ['ใบเสร็จ.jpg']);
  assert.deepEqual(answer?.proposalIds, [PROPOSAL]);
});

// The links between a file and its cards, against a stand-in private state.
const realFetch = globalThis.fetch;
let stored: Record<string, unknown> = {};
beforeEach(() => {
  stored = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) { Object.assign(stored, JSON.parse(String(init?.body)).p_patch); return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith('/cashflow_private_state')) return json({ links: stored.lineFileProposals ?? null });
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

test('file links: every card of a file finds it once; the first confirmed takes it off them all; a day at most', async () => {
  const second = 'p_aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff';
  const now = new Date('2026-11-06T08:00:00Z');
  await links.rememberFileProposals(USER, FILE, [PROPOSAL, second, 'not-a-card'], now);
  assert.deepEqual(Object.keys(stored.lineFileProposals as object).sort(), [PROPOSAL, second].sort());
  assert.equal(await links.takeFileForProposal(USER, second, now), FILE);
  assert.equal(await links.takeFileForProposal(USER, PROPOSAL, now), null, 'attached once');
  await links.rememberFileProposals(USER, FILE, [PROPOSAL], now);
  assert.equal(await links.takeFileForProposal(USER, PROPOSAL, new Date(now.getTime() + 25 * 3600_000)), null, 'gone after a day');
});
