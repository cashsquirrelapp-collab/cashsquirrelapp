import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { lineAssistantReply, markdownToLineText, decodeAssistantAction, parseAssistantCommand, assistantCommand } from '../backend/src/ai/lineFormat';
import { lineEventCommand } from '../backend/src/handlers/line-webhook';
import { handleAssistantMessage, type LineAssistantDependencies, type UserRow } from '../backend/src/services/lineAssistant';

// LINE talks to เลขากระรอก, the same Gemini assistant as the app (owner, 2026-10-24). Quick entries stay
// deterministic; everything else goes to the assistant; its cards become LINE cards with ยืนยัน / ยกเลิก.

const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = 'https://preview.example.test';
after(() => { if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl; });

const PROPOSAL = 'p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const userId = '11111111-1111-4111-8111-111111111111';
const linkedUser = (): UserRow => ({ user_id: userId, jobs: [], goals: [], settings: {}, expenses: [], statuses: [], notif_settings: { userName: 'ตัวอย่าง', nameAskedAt: '2026-10-01T00:00:00Z' } as any });

function deps(calls: string[], over: Partial<LineAssistantDependencies> = {}): LineAssistantDependencies {
  return {
    async findUserByLineId() { return linkedUser(); },
    async checkLinkedAccountWriteAccess() { return { allowed: true as const }; },
    async isProUser() { return true; },
    async saveJobDraft(user, draft) { calls.push(`draft:${draft.name}`); user.notif_settings = { ...(user.notif_settings || {}), pendingJobDraft: { draft, createdAt: new Date().toISOString(), operationKey: 'k' } } as any; },
    async assistantAnswer(_user, text, history) { calls.push(`ai:${text}:${history.length}`); return { messages: [{ type: 'text', text: `ตอบ: ${text}` }], text: `ตอบ: ${text}` }; },
    async assistantCommand(_user, command) { calls.push(`cmd:${command.action}:${command.proposalId}`); return [{ type: 'text', text: 'บันทึกแล้ว' }]; },
    ...over,
  };
}
const texts = (messages: Awaited<ReturnType<typeof handleAssistantMessage>>) => (messages || []).map(message => (message as { text?: string }).text ?? (message as { altText?: string }).altText);

test('LINE: any message the bot does not know goes to เลขา, with or without "ถาม AI"', async () => {
  const calls: string[] = [];
  assert.deepEqual(texts(await handleAssistantMessage('Uline', 'ใครค้างจ่ายบ้าง', 'op-1', deps(calls))), ['ตอบ: ใครค้างจ่ายบ้าง']);
  assert.deepEqual(texts(await handleAssistantMessage('Uline', 'ถาม AI เดือนนี้ได้เงินเท่าไหร่', 'op-2', deps(calls))), ['ตอบ: เดือนนี้ได้เงินเท่าไหร่']);
  assert.deepEqual(calls, ['ai:ใครค้างจ่ายบ้าง:0', 'ai:เดือนนี้ได้เงินเท่าไหร่:0']);
});

test('LINE: quick entries stay on the free deterministic path (no AI call)', async () => {
  const calls: string[] = [];
  await handleAssistantMessage('Uline', 'เพิ่มงาน ออกแบบโลโก้ 5000', 'op-3', deps(calls));
  assert.ok(calls.some(call => call.startsWith('draft:')));
  assert.ok(!calls.some(call => call.startsWith('ai:')));
});

test('LINE: when the real เลขา is not on for the account, unknown messages still get no reply, as before', async () => {
  const calls: string[] = [];
  const reply = await handleAssistantMessage('Uline', 'ใครค้างจ่ายบ้าง', 'op-4', deps(calls, { async assistantAnswer() { return null; } }));
  assert.deepEqual(reply, []);
});

test('LINE: a failed AI answer says to try again instead of staying silent', async () => {
  const reply = await handleAssistantMessage('Uline', 'สรุปให้หน่อย', 'op-5', deps([], { async assistantAnswer() { throw new Error('timeout'); } }));
  assert.match(texts(reply)[0] ?? '', /ลองพิมพ์ใหม่/);
});

test('LINE: ยืนยัน / ยกเลิก buttons on a เลขา card come back as postbacks and reach the confirm step', async () => {
  const command = lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: `ai:confirm:${PROPOSAL}` } } as any);
  assert.equal(command, `ยืนยันรายการเลขา ${PROPOSAL}`);
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: `ai:cancel:${PROPOSAL}` } } as any), `ยกเลิกรายการเลขา ${PROPOSAL}`);
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'ai:confirm:not-an-id' } } as any), null);
  const calls: string[] = [];
  await handleAssistantMessage('Uline', command!, 'op-6', deps(calls));
  assert.deepEqual(calls, [`cmd:confirm:${PROPOSAL}`]);
  assert.deepEqual(parseAssistantCommand(assistantCommand('cancel', PROPOSAL)), { action: 'cancel', proposalId: PROPOSAL });
  assert.deepEqual(decodeAssistantAction(`ai:confirm:${PROPOSAL}`), { action: 'confirm', proposalId: PROPOSAL });
});

test('LINE text: a table row becomes an item, its name alone and the amount and details indented below; Markdown marks are removed', () => {
  const text = markdownToLineText([
    'มีค้างรับ **5 งาน** รวม **฿47,100** ครับ', '',
    '| งาน | ลูกค้า | ยอดค้าง | ครบกำหนด |', '|---|---|---|---|',
    '| ออกแบบโลโก้ | ร้านกาแฟตัวอย่าง | ฿12,000 | เลยกำหนด 15 วัน |',
    '| แบนเนอร์ | ร้านกาแฟตัวอย่าง | ฿3,500 | วันนี้ |', '',
    'ดูทั้งหมดได้ที่ [หน้างาน](/jobs)',
  ].join('\n'));
  assert.equal(text, 'มีค้างรับ 5 งาน รวม ฿47,100 ครับ\n\n• ออกแบบโลโก้\n   ฿12,000 · ร้านกาแฟตัวอย่าง\n   เลยกำหนด 15 วัน\n\n• แบนเนอร์\n   ฿3,500 · ร้านกาแฟตัวอย่าง\n   วันนี้\n\nดูทั้งหมดได้ที่ หน้างาน');
});

// Owner, 2026-11-06: "ฝากเรียงคำพูดในไลน์หน่อย ข้อความแต่ละอันบางทีแอบอ่านยากมาก" ("• ตัดคลิปคุณหมอ คลิป 2 · ฿1,000 · 7 พ.ย.
// 2569" wrapped in the middle of its date on a phone).
test('LINE lists: the name on its own line, the amount and date indented below, this year left off, a blank line between items', () => {
  const now = new Date('2026-11-06T07:00:00Z');
  const answer = ['มีงานที่ยังไม่จ่ายทั้งหมด 5 งาน ยอดค้างรวม 9,000 บาทครับ', '',
    '- ตัดคลิปคุณหมอ คลิป 2 · ฿1,000 · 7 พ.ย. 2569', '- แม่ · ฿1,000 · 30 พ.ย. 2569', '- งานของ กยศ · ฿3,000 · 3 ม.ค. 2570', '',
    'ดูทั้งหมดได้ที่เมนู งาน ครับ'].join('\n');
  assert.equal(markdownToLineText(answer, now), [
    'มีงานที่ยังไม่จ่ายทั้งหมด 5 งาน ยอดค้างรวม 9,000 บาทครับ', '',
    '• ตัดคลิปคุณหมอ คลิป 2', '   ฿1,000 · 7 พ.ย.', '',
    // The short one takes the same shape as the rest of its list.
    '• แม่', '   ฿1,000 · 30 พ.ย.', '',
    // Next year keeps its year.
    '• งานของ กยศ', '   ฿3,000 · 3 ม.ค. 2570', '',
    'ดูทั้งหมดได้ที่เมนู งาน ครับ'].join('\n'));
  // In LINE the sentence comes first, the list as a CI card, then the closing line (owner, 2026-11-06: "ถ้าเป็นข้อมูลอ่ะส่ง
  // เป็นการ์ด").
  const reply = lineAssistantReply(answer, [], now) as any[];
  assert.deepEqual(reply.map(message => message.type), ['text', 'flex', 'text']);
  assert.equal(reply[0].text, 'มีงานที่ยังไม่จ่ายทั้งหมด 5 งาน ยอดค้างรวม 9,000 บาทครับ');
  assert.equal(reply[2].text, 'ดูทั้งหมดได้ที่เมนู งาน ครับ');
  // A list of short items stays one item a line.
  assert.equal(markdownToLineText(['- งาน 1 · ฿1,000', '- งาน 2 · ฿2,000'].join('\n'), now), '• งาน 1 · ฿1,000\n• งาน 2 · ฿2,000');
});

// Owner, 2026-10-24: "ข้อความแบบยังยาวเหยียด แล้วก็แบบตัวหนังสือติดกัน ทำให้อ่านยาก".
test('LINE text is shaped for a phone: one question per line, one sentence per line, at most five items', () => {
  assert.equal(markdownToLineText('ขอรายละเอียดเพิ่มอีกนิดครับ 1. ลูกค้าคือใคร  2. ส่งงานแล้วหรือยัง  3. เครดิตกี่วัน (เช่น 0, 15, 30)  4. หัก ณ ที่จ่ายไหม'),
    'ขอรายละเอียดเพิ่มอีกนิดครับ\n1. ลูกค้าคือใคร\n2. ส่งงานแล้วหรือยัง\n3. เครดิตกี่วัน (เช่น 0, 15, 30)\n4. หัก ณ ที่จ่ายไหม');
  assert.equal(markdownToLineText('เดือนนี้รับเงินจริงแล้ว ฿19,000 ครับ ส่วนรายจ่ายที่บันทึกไว้อยู่ที่ ฿13,850 ทำให้กำไรสุทธิเหลือ ฿5,150 ครับ ยังมีเงินค้างรับอีก ฿16,000 จาก 2 งานครับ'),
    'เดือนนี้รับเงินจริงแล้ว ฿19,000 ครับ\nส่วนรายจ่ายที่บันทึกไว้อยู่ที่ ฿13,850 ทำให้กำไรสุทธิเหลือ ฿5,150 ครับ\nยังมีเงินค้างรับอีก ฿16,000 จาก 2 งานครับ');
  const long = markdownToLineText(['ค้างรับ 8 งาน', ...Array.from({ length: 8 }, (_, i) => `- งาน ${i + 1} · ฿${i + 1},000`)].join('\n'));
  assert.equal(long.split('\n').filter(line => line.startsWith('• งาน')).length, 5);
  assert.match(long, /• …และอีก 3 รายการ ดูต่อในแอป$/);
  assert.match(long, /^ค้างรับ 8 งาน\n\n• งาน 1/, 'a blank line before the list');
  // Dates and amounts are not split as if they were list numbers or sentence ends.
  assert.equal(markdownToLineText('ครบกำหนด 9 ต.ค. 2569 ยอด ฿1,500.50'), 'ครบกำหนด 9 ต.ค. 2569 ยอด ฿1,500.50');
});

test('LINE prompt: short-beats-complete rules apply in LINE only', async () => {
  const { buildSystemPrompt } = await import('../backend/src/ai/prompt');
  const base = { route: 'chat' as const, plan: 'pro' as const, nowLocal: '24 ต.ค. 2569 10:00', knowledge: '-', accountContext: '{}' };
  const line = buildSystemPrompt({ ...base, channel: 'line' });
  assert.match(line, /LINE rules win over VOICE and FORMAT/);
  assert.match(line, /at most 5 items/);
  assert.match(line, /one sentence per line/);
  assert.doesNotMatch(buildSystemPrompt(base), /CHANNEL: LINE/);
});

// LINE offers what the account's website shows: the document vault and 50 ทวิ are not open to ordinary accounts yet.
test('LINE: vault and 50 ทวิ shortcuts answer "not open yet" unless the area is open to the account', async () => {
  const closed = deps([], { lineAreaOpen: async () => false });
  for (const command of ['คลังเอกสาร', '50 ทวิ', 'ส่งเอกสาร']) {
    assert.deepEqual(texts(await handleAssistantMessage('Uline', command, `op-${command}`, closed)), ['ส่วนนี้ยังไม่เปิดให้ใช้งานในตอนนี้ครับ'], command);
  }
  const extras = JSON.stringify(await handleAssistantMessage('Uline', 'เมนูเพิ่มเติม', 'op-extras', closed));
  assert.ok(!extras.includes('line-documents') && !extras.includes('50 ทวิ'), 'the extras card leaves the vault out');
  const open = deps([], { lineAreaOpen: async () => true, listVaultFiles: async () => [] });
  assert.match(JSON.stringify(await handleAssistantMessage('Uline', 'คลังเอกสาร', 'op-open', open)), /line-documents/, 'admins keep it, as on the website');
});

test('LINE cards: confirmation has ยืนยัน / ยกเลิก postbacks; documents and summaries become formal cards; at most five messages', () => {
  const reply = lineAssistantReply('เตรียมไว้แล้วครับ', [
    { kind: 'confirm', id: PROPOSAL, title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'แปลเอกสาร' }, { label: 'มูลค่า', value: '฿4,000' }] },
    { kind: 'document', docType: 'ใบเสนอราคา', number: 'QT-2569-008', client: 'บริษัท ตัวอย่าง จำกัด', amount: '฿12,000', path: '/invoice?type=quotation&document=doc-2' },
    { kind: 'summary', period: 'ต.ค. 2569', income: '฿18,000', expense: '฿2,430', balance: '฿15,570' },
  ]);
  assert.equal(reply.length, 2, 'the answer, then one carousel with the three cards');
  assert.equal(reply[0].type, 'text');
  assert.equal(((reply[1] as any).contents.type), 'carousel');
  assert.equal(((reply[1] as any).contents.contents.length), 3);
  const json = JSON.stringify(reply);
  assert.ok(json.includes(`"data":"ai:confirm:${PROPOSAL}"`) && json.includes(`"data":"ai:cancel:${PROPOSAL}"`));
  assert.ok(json.includes('QT-2569-008') && json.includes('document%3Ddoc-2') === false && json.includes('from=line'));
  assert.ok(json.includes('฿15,570'));
  const many = lineAssistantReply('ก\n\nข\n\nค\n\nง', Array.from({ length: 5 }, () => ({ kind: 'summary', period: 'ต.ค. 2569', income: '฿1', expense: '฿1', balance: '฿0' }) as const));
  assert.ok(many.length <= 5);
  assert.equal(many.filter(message => message.type === 'text').length, 2);
});

test('LINE launch gate: an area opens with the launch policy; until then only system admins, and a failed role read keeps it closed', async () => {
  const { lineAreaOpen } = await import('../backend/src/services/lineLaunch');
  const { isPhaseOneFeatureAvailable } = await import('../shared/featureAvailability');
  for (const area of ['vault', 'wht50'] as const) {
    const everyone = isPhaseOneFeatureAvailable(area, false);
    assert.equal(await lineAreaOpen(area, userId, async () => false), everyone, `${area}: ordinary account`);
    assert.equal(await lineAreaOpen(area, userId, async () => true), true, `${area}: system admin`);
    assert.equal(await lineAreaOpen(area, userId, async () => { throw new Error('role read failed'); }), everyone, `${area}: unknown role`);
  }
});

// Owner, 2026-10-24: complex requests make one card per job; LINE must show every one of them.
test('LINE: many confirmation cards arrive in carousels, each with its own buttons; only past what LINE can carry is the rest in the app', () => {
  const card = (n: number) => ({ kind: 'confirm' as const, id: `p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d${String(n).padStart(2, '0')}`, title: `บันทึกรับเงินครบ ${n}`, changes: [{ label: 'งาน', value: `งาน ${n}` }] });
  const five = lineAssistantReply('เตรียมการ์ดไว้ 5 งานครับ', Array.from({ length: 5 }, (_, i) => card(i + 1)));
  assert.equal(five.length, 2);
  const carousel = (five[1] as any);
  assert.equal(carousel.contents.type, 'carousel');
  assert.equal(carousel.contents.contents.length, 5);
  assert.match(carousel.altText, /^5 รายการ/);
  for (let n = 1; n <= 5; n += 1) assert.ok(JSON.stringify(carousel).includes(`"data":"ai:confirm:${card(n).id}"`), `card ${n} keeps its button`);
  // 14 cards: two carousels (at most 12 bubbles and 50 KB each), nothing left out.
  const fourteen = lineAssistantReply('เตรียมไว้แล้วครับ', Array.from({ length: 14 }, (_, i) => card(i + 1)));
  const carousels = fourteen.filter(message => message.type === 'flex').map(message => (message as any).contents.contents.length as number);
  assert.equal(carousels.length, 2);
  assert.equal(carousels.reduce((sum, count) => sum + count, 0), 14);
  assert.ok(carousels.every(count => count <= 12));
  assert.ok(!fourteen.some(message => /มีอีก/.test((message as any).text || '')));
  // 40 cards: three full carousels fit in one reply; the other 4 are opened in the app.
  const forty = lineAssistantReply('เตรียมไว้แล้วครับ', Array.from({ length: 40 }, (_, i) => card((i % 99) + 1)));
  assert.ok(forty.length <= 5);
  const shown = forty.filter(message => message.type === 'flex').reduce((sum, message) => sum + (message as any).contents.contents.length, 0);
  assert.ok(forty.some(message => (message as any).text === `มีอีก ${40 - shown} รายการ เปิดดูในเลขาในแอปได้ครับ`), 'the rest is counted exactly');
  for (const message of forty) assert.ok(new TextEncoder().encode(JSON.stringify(message)).length < 50_000, 'every message within LINE\'s size limit');
});

// Owner, 2026-11-06: "ถ้าเป็นคำถามธรรมดา ... ส่งทีละประโยค ... เพื่อความเป็นธรรมชาติ ... ถ้าเป็นข้อมูลอ่ะส่งเป็นการ์ดเป็นอะไรก็ได้
// ที่มันสามารถดูง่ายกว่านี้ ไม่ส่งเป็นข้อมูลแบบเยอะๆพูดๆไป".
test('LINE replies: everyday talk one sentence to a bubble; steps and questions stay whole; at most five messages', () => {
  const now = new Date('2026-11-06T07:00:00Z');
  const texts = (reply: any[]) => reply.map(message => message.type === 'text' ? message.text : `[${message.type}]`);
  assert.deepEqual(texts(lineAssistantReply('ดีครับปาร์ค หายไปตั้ง 5 วันแน่ะ\n\nวันนี้มีงานใหม่มาบ้างไหมครับ\n\nถ้ามีบอกได้เลย', [], now)),
    ['ดีครับปาร์ค หายไปตั้ง 5 วันแน่ะ', 'วันนี้มีงานใหม่มาบ้างไหมครับ', 'ถ้ามีบอกได้เลย']);
  // A long paragraph is split at its sentences.
  assert.equal(lineAssistantReply('เดือนนี้รับเงินจริงแล้ว ฿19,000 ครับ ส่วนรายจ่ายที่บันทึกไว้อยู่ที่ ฿13,850 ทำให้กำไรสุทธิเหลือ ฿5,150 ครับ ยังมีเงินค้างรับอีก ฿16,000 จาก 2 งานครับ', [], now).length, 3);
  // Steps keep their lead-in and stay one message.
  assert.deepEqual(texts(lineAssistantReply('ทำได้แบบนี้ครับ\n\n1. กดเมนู งาน\n2. กด เพิ่มงาน\n3. กรอกชื่อและยอดเงิน\n\nลองดูนะครับ', [], now)),
    ['ทำได้แบบนี้ครับ\n1. กดเมนู งาน\n2. กด เพิ่มงาน\n3. กรอกชื่อและยอดเงิน', 'ลองดูนะครับ']);
  // Many sentences: the first three alone, the rest together in the fourth.
  const many = lineAssistantReply(['หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก'].join('\n\n'), [], now) as any[];
  assert.equal(many.length, 4);
  assert.equal(many[3].text, 'สี่\nห้า\nหก');
});

test('LINE replies: a list of records becomes one CI card with its title, count, total, rows and a way into the app', () => {
  process.env.APP_URL = process.env.APP_URL || 'https://krarok.example';
  const now = new Date('2026-11-06T07:00:00Z');
  const reply = lineAssistantReply(['มีงานค้างรับ 8 งาน รวม ฿36,000 ครับ', '', ...Array.from({ length: 8 }, (_, i) => `- งาน ${i + 1} · ฿${i + 1},000 · ${i + 1} ธ.ค. 2569`)].join('\n'), [], now) as any[];
  assert.deepEqual(reply.map(message => message.type), ['text', 'flex']);
  const card = JSON.stringify(reply[1]);
  for (const text of ['รอรับเงิน', '8 รายการ', 'ยอดค้างรับรวม', '฿36,000', 'งาน 1', '฿1,000', '1 ธ.ค.', 'และอีก 3 รายการ ดูต่อในแอป', 'ดูเงินรอรับในแอป']) assert.ok(card.includes(text), text);
  assert.ok(!card.includes('ธ.ค. 2569'), 'this year left off');
  assert.equal(reply[1].altText, 'มีงานค้างรับ 8 งาน รวม ฿36,000 ครับ');
  // Expenses get the expense card.
  assert.ok(JSON.stringify(lineAssistantReply('รายจ่ายเดือนนี้ 2 รายการครับ\n\n- ค่าเน็ต · ฿599\n- ค่าไฟ · ฿1,200', [], now)).includes('/line/titles-v1/expense.png'));
});

test('LINE prompt: LINE TALK keeps the tone of VOICE and the user\'s profile in LINE, and only in LINE', async () => {
  const { buildSystemPrompt } = await import('../backend/src/ai/prompt');
  const base = { route: 'chat' as const, plan: 'pro' as const, nowLocal: '6 พ.ย. 2569 10:00', knowledge: '-', accountContext: '{}' };
  const line = buildSystemPrompt({ ...base, channel: 'line' });
  assert.match(line, /LINE TALK: the LINE rules above decide layout and length only\. Tone comes from VOICE, COMMUNICATION PROFILE and\nMEMORY exactly as in the app/);
  assert.match(line, /1 to 4 short messages of one sentence each/);
  assert.ok(line.indexOf('LINE TALK') > line.indexOf('CHANNEL: LINE'), 'after the LINE rules, which stay as they were');
  assert.doesNotMatch(buildSystemPrompt(base), /LINE TALK/);
});
