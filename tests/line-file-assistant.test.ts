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
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      const body = JSON.parse(String(init?.body));
      Object.assign(stored, body.p_patch);
      for (const key of body.p_remove ?? []) delete stored[key];
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith('/cashflow_private_state')) return json(url.searchParams.get('select') === 'data' ? { data: stored } : { links: stored.lineFileProposals ?? null });
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

// Several pictures sent at once (owner, 2026-11-06: "ส่งหลายรูปพร้อมกันให้รวมเป็นการ์ดเดียว", then "การ์ดเดียว + บันทึกทั้งหมด").
const { handleLineImageSetPart, lineFilesRequest } = await import('../backend/src/services/lineVaultChat');
const { cardGroupMessage } = await import('../backend/src/ai/lineFormat');
const { lineGroupCommand } = await import('../backend/src/ai/lineBridge');
const card = (n: number, title = 'เพิ่มรายจ่าย') => ({ kind: 'confirm', id: `p_aaaaaaaa-bbbb-4ccc-8ddd-00000000000${n}`, title,
  changes: [{ label: 'รายการ', value: `ใบเสร็จ ${n}` }, { label: 'จำนวนเงิน', value: `฿${n}00.00` }, { label: 'วันที่', value: '2026-11-05' }] });

function setDeps(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const parts = new Map<number, unknown>();
  let claimed = false;
  const base = deps({
    store: async (_s: unknown, _a: unknown, _b: Buffer, meta: { fileName: string }) => ({ id: FILE, fileName: meta.fileName }),
    answer: async (_u: unknown, text: string, _h: unknown, files: unknown[]) => {
      calls.push(`answer:${text}:${files.length}`);
      const cards = [card(1), card(2), card(3)];
      return { messages: [], text: 'อ่านครบ 3 ใบ', proposalIds: cards.map(c => c.id), reply: { text: 'อ่านครบ 3 ใบครับ', cards } };
    },
    ...over,
  }).deps;
  return {
    calls,
    deps: {
      ...base,
      note: async (_user: string, group: string, index: number, part: unknown) => { calls.push(`note:${group}:${index}`); parts.set(index, part); return new Map(parts); },
      claim: async () => { const first = !claimed; claimed = true; calls.push(`claim:${first}`); return first; },
      finish: async (key: string) => { calls.push(`finish:${key}`); },
      drop: async (_u: string, _g: string, indexes: number[]) => { calls.push(`drop:${indexes.join(',')}`); },
      saveGroup: async (_u: string, group: string, saved: { cards: unknown[]; files: number }) => { calls.push(`group:${group}:${saved.cards.length}:${saved.files}`); },
    } as any,
  };
}
const setEvent = (index: number, total = 3) => ({ id: String(100 + index), type: 'image', imageSet: { id: 'E005D41A7288F41B6559', index, total } });

test('a picture set: nothing said until it is complete, then one read of every picture and one card with บันทึกทั้งหมด', async () => {
  const { deps: d, calls } = setDeps();
  assert.deepEqual(await handleLineImageSetPart('U', setEvent(2), 't', d), []);
  assert.deepEqual(await handleLineImageSetPart('U', setEvent(1), 't', d), []);
  const reply = await handleLineImageSetPart('U', setEvent(3), 't', d) as any[];
  assert.deepEqual(reply.map(message => message.type), ['text', 'flex', 'text']);
  assert.equal(reply[0].text, 'อ่านครบ 3 ใบครับ');
  const json = JSON.stringify(reply[1]);
  for (const text of ['บันทึก 3 รายการ', 'จากรูปที่ส่งมา 3 รูป', 'ใบเสร็จ 1', '฿100.00', '5 พ.ย.', 'ยอดรวม', 'บันทึกทั้งหมด', 'ดูทีละใบ', 'ยกเลิกทั้งหมด',
    'ai:confirmall:gE005D41A7288F41B6559', 'ai:showall:gE005D41A7288F41B6559', 'ai:cancelall:gE005D41A7288F41B6559']) assert.ok(json.includes(text), text);
  assert.match(reply[2].text, /เก็บรูปไว้ในคลังเอกสารแล้ว 3 รูป/);
  assert.ok(calls.includes(`answer:${lineFilesRequest(3)}:3`));
  assert.ok(calls.includes('group:gE005D41A7288F41B6559:3:3'));
  assert.ok(calls.includes('drop:1,2,3') && calls.includes('finish:imageset:gE005D41A7288F41B6559'));
  // A late duplicate of the last picture finds the set already read.
  assert.deepEqual(await handleLineImageSetPart('U', setEvent(3), 't', d), []);
});

test('a picture set: an account LINE cannot keep files for hears it once, not once a picture', async () => {
  const { deps: d } = setDeps({ owner: async () => ({ type: 'text', text: 'ใช้ได้ในแพ็กเกจ Pro ครับ' }) });
  assert.equal((await handleLineImageSetPart('U', setEvent(1), 't', d)).length, 1);
  assert.equal((await handleLineImageSetPart('U', setEvent(2), 't', d)).length, 0);
});

test('a picture set with one card or none: เลขา\'s answer as it is, with the line that the pictures are kept', async () => {
  const { deps: d } = setDeps({ answer: async () => ({ messages: [{ type: 'text', text: 'เป็นสัญญา 2 ฉบับครับ' }], text: 'สัญญา', reply: { text: 'เป็นสัญญา 2 ฉบับครับ', cards: [] } }) });
  await handleLineImageSetPart('U', setEvent(1, 2), 't', d);
  const reply = await handleLineImageSetPart('U', setEvent(2, 2), 't', d) as any[];
  assert.deepEqual(reply.map(message => message.text), ['เป็นสัญญา 2 ฉบับครับ', 'เก็บรูปไว้ในคลังเอกสารแล้ว 2 รูปครับ']);
});

test('the group card: no total when the cards are of different kinds', () => {
  const mixed = JSON.stringify(cardGroupMessage('gabcdef12', [card(1), card(2, 'บันทึกรับเงิน')] as any, 2));
  assert.ok(!mixed.includes('ยอดรวม'));
  assert.ok(mixed.includes('บันทึกรับเงิน · 5 พ.ย.'));
});

test('บันทึกทั้งหมด confirms every card on its own; one confirmed before is counted, not saved twice; ดูทีละใบ and ยกเลิกทั้งหมด', async () => {
  const group = { cards: [card(1), card(2), card(3)], files: 3, at: new Date().toISOString() };
  const user = { user_id: USER, notif_settings: { 'lineCardGroup:gabcdef12': group } } as any;
  const confirmed: string[] = [];
  let dropped = 0;
  const reply = await lineGroupCommand(user, { action: 'confirm', groupId: 'gabcdef12' }, {
    confirm: async (_u, id) => { if (id.endsWith('2')) throw new HttpError(409, 'ยืนยันไปแล้ว'); confirmed.push(id); return { kind: 'add_expense', path: '/incomeExpense' }; },
    drop: async () => { dropped += 1; },
  });
  assert.equal(confirmed.length, 2);
  assert.equal(dropped, 1);
  const json = JSON.stringify(reply);
  assert.ok(json.includes('บันทึกแล้ว 3 รายการ') && json.includes('ยืนยันไว้ก่อนแล้ว'));
  const shown = await lineGroupCommand(user, { action: 'show', groupId: 'gabcdef12' }) as any[];
  assert.ok(JSON.stringify(shown).includes('ai:confirm:p_aaaaaaaa-bbbb-4ccc-8ddd-000000000001'), 'the separate cards with their own buttons');
  const cancelled: string[] = [];
  const gone = await lineGroupCommand(user, { action: 'cancel', groupId: 'gabcdef12' }, { cancel: async (_u, id) => { cancelled.push(id); return true; }, drop: async () => undefined });
  assert.equal(cancelled.length, 3);
  assert.ok(JSON.stringify(gone).includes('ยกเลิกทั้งหมดแล้ว'));
  assert.match(JSON.stringify(await lineGroupCommand({ user_id: USER, notif_settings: {} } as any, { action: 'confirm', groupId: 'gabcdef12' })), /หมดเวลา/);
});

test('picture parts: each picture under its own key, so two at once never overwrite each other; stale ones dropped', async () => {
  const now = new Date('2026-11-06T08:00:00Z');
  stored['lineImagePart:gold000000:1'] = { messageId: '9', at: '2026-11-06T07:00:00Z' };
  const [first, second] = await Promise.all([
    links.noteImagePart(USER, 'gabcdef12', 1, { messageId: '1', fileId: FILE, at: now.toISOString() }, now),
    links.noteImagePart(USER, 'gabcdef12', 2, { messageId: '2', fileId: FILE, at: now.toISOString() }, now),
  ]);
  assert.equal(Math.max(first.size, second.size), 2);
  assert.ok(!('lineImagePart:gold000000:1' in stored), 'a stale picture is dropped');
  await links.dropImageParts(USER, 'gabcdef12', [1, 2]);
  assert.deepEqual(Object.keys(stored).filter(key => key.startsWith('lineImagePart:')), []);
  assert.equal(links.groupIdFor('E005D41A-7288'), 'gE005D41A7288');
  assert.equal(links.groupIdFor('../x'), null);
});
