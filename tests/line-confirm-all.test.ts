import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { AssistantCard } from '../backend/src/ai/types';
import type { UserRow } from '../backend/src/services/lineAssistant';

// LINE, owner 2026-11-15:
// 1. "แก้ไขเดดไลน์ของวันชำระของลูกค้าใน 3 โปรเจกต์ ... ต้องมากดยืนยัน 3 รอบ ... อยากให้มีปุ่มยืนยันทั้งหมด ปุ่มเดียว": several
//    cards LINE shows in full get one ยืนยันทั้งหมด card, each still confirmed on its own.
// 2. "แก้ไขงานแล้ว บันทึกในแอปเรียบร้อย กูไม่รู้ว่ามันเป็นงานคลิปไหน มึงเขียนกำกับด้วย": the cards that answer name the records.
// 3. "ถามเดดไลน์ชำระเงิน เดดไลน์ต้องเด่น ... เดดไลน์ส่งงาน ... ยอดเงินก็ต้องเด่น": what the question is about stands out in a list.

const saved = { APP_URL: process.env.APP_URL, LIFF_ID: process.env.LIFF_ID };
process.env.APP_URL = 'https://krarok.example';
process.env.LIFF_ID = '2012039027-test';
after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

const USER = '11111111-1111-4111-8111-111111111111';
const edit = (n: number, name: string, from: string, to: string): AssistantCard => ({ kind: 'confirm', id: `p_${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`, title: 'แก้ไขงาน',
  changes: [{ label: 'งาน', value: name }, { label: 'กำหนดรับเงิน', value: `${from} → ${to}` }] });
const CARDS = [edit(1, 'ตัดต่อคลิปรีวิว EP.1', '20 พ.ย. 2569', '25 พ.ย. 2569'), edit(2, 'ตัดต่อคลิปรีวิว EP.2', '21 พ.ย. 2569', '26 พ.ย. 2569'), edit(3, 'ถ่ายภาพสินค้า', '22 พ.ย. 2569', '27 พ.ย. 2569')];
const flat = (value: unknown) => JSON.stringify(value);

function answerDeps(cards: AssistantCard[], text = 'เปลี่ยนวันรับเงินให้แล้ว 3 งานครับ ตรวจแล้วกดยืนยันได้เลย') {
  const groups: { id: string; group: { cards: unknown[]; files: number } }[] = [];
  return { groups, deps: {
    env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'test-gemini' },
    db: {} as never,
    plan: async () => ({ plan: 'pro' as const, email: null }),
    rateLimit: async () => undefined,
    consented: async () => true,
    run: (async () => ({ text, cards, route: 'action', tokens: 20, tokensLeft: 900, trialLeft: null })) as never,
    keepForApp: async () => 'Abcdefghijklmnopqrstuv',
    saveGroup: async (_user: string, id: string, group: { cards: unknown[]; files: number }) => { groups.push({ id, group }); },
  } };
}

test('several cards in LINE end with one ยืนยันทั้งหมด card that names each record; the cards stay above as they are', async () => {
  const { lineAssistantAnswer } = await import('../backend/src/ai/lineBridge');
  const { groups, deps } = answerDeps(CARDS);
  const answer = (await lineAssistantAnswer({ user_id: USER } as UserRow, 'แก้วันชำระของ 3 โปรเจกต์นี้เป็นอีก 5 วัน', [], deps))!;
  assert.ok(answer.messages.length <= 5);
  assert.equal(groups.length, 1);
  assert.match(groups[0].id, /^g[0-9a-f]{24}$/);
  assert.deepEqual(groups[0].group, { cards: CARDS, files: 0 });
  const last = flat(answer.messages.at(-1));
  assert.match(last, /ยืนยันทั้งหมด 3 รายการ/);
  for (const name of ['ตัดต่อคลิปรีวิว EP.1', 'ตัดต่อคลิปรีวิว EP.2', 'ถ่ายภาพสินค้า']) assert.ok(last.includes(name), name);
  assert.match(last, /กำหนดรับเงิน 20 พ.ย. 2569 → 25 พ.ย. 2569/);
  assert.ok(last.includes(`"data":"ai:confirmall:${groups[0].id}"`), 'one button confirms them all');
  assert.ok(last.includes(`"data":"ai:cancelall:${groups[0].id}"`));
  // The three cards are still there, each with its own ยืนยัน.
  for (const card of CARDS) assert.ok(flat(answer.messages).includes(`ai:confirm:${(card as { id: string }).id}`));
  // The webhook turns the button into the group command the chat already answers.
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../backend/src/handlers/line-webhook.ts', import.meta.url), 'utf8'), /ai:\(confirmall\|cancelall\|showall\):\(g\[A-Za-z0-9\]\{6,40\}\)/);
});

test('one card, a card too long for LINE, or a question in LINE: no ยืนยันทั้งหมด', async () => {
  const { lineAssistantAnswer } = await import('../backend/src/ai/lineBridge');
  const one = answerDeps([CARDS[0]]);
  const single = (await lineAssistantAnswer({ user_id: USER } as UserRow, 'แก้วันชำระงาน EP.1', [], one.deps))!;
  assert.equal(one.groups.length, 0);
  assert.doesNotMatch(flat(single.messages), /ยืนยันทั้งหมด/);

  const long: AssistantCard = { ...CARDS[1], changes: Array.from({ length: 40 }, (_, at) => ({ label: at ? `ช่อง ${at}` : 'งาน', value: 'x' })) } as AssistantCard;
  const tooLong = answerDeps([CARDS[0], long]);
  await lineAssistantAnswer({ user_id: USER } as UserRow, 'แก้สองงานนี้', [], tooLong.deps);
  assert.equal(tooLong.groups.length, 0, 'a card LINE cannot confirm goes on in the app instead');

  const asking = answerDeps([...CARDS, { kind: 'questions', id: 'q1', questions: [{ id: 'a', text: 'วันไหนครับ', options: ['พรุ่งนี้', 'สัปดาห์หน้า'], allowText: true }] } as unknown as AssistantCard]);
  await lineAssistantAnswer({ user_id: USER } as UserRow, 'แก้ให้หน่อย', [], asking.deps);
  assert.equal(asking.groups.length, 0);
});

test('ยืนยันทั้งหมด confirms each card and the answer names every record with what became of it', async () => {
  const { lineGroupCommand } = await import('../backend/src/ai/lineBridge');
  const { HttpError } = await import('../backend/src/http/guard');
  const groupId = 'gabcdef0123456789abcdef01';
  const user = { user_id: USER, notif_settings: { [`lineCardGroup:${groupId}`]: { cards: CARDS, files: 0, at: new Date().toISOString() } } } as unknown as UserRow;
  const confirmed: string[] = [];
  const reply = await lineGroupCommand(user, { action: 'confirm', groupId }, {
    confirm: async (_user, id) => {
      confirmed.push(id);
      if (id === (CARDS[1] as { id: string }).id) throw new HttpError(409, 'gone');
      return { kind: 'edit_job', jobId: `job-${id}`, path: '/jobs' };
    },
    drop: async () => undefined,
  });
  assert.deepEqual(confirmed, CARDS.map(card => (card as { id: string }).id), 'each card on its own');
  const json = flat(reply);
  assert.match(json, /แก้ไขแล้ว 3 รายการ/);
  assert.match(json, /บันทึกแล้ว · กำหนดรับเงิน 20 พ.ย. 2569 → 25 พ.ย. 2569/);
  assert.match(json, /ยืนยันไว้ก่อนแล้ว · กำหนดรับเงิน 21 พ.ย. 2569 → 26 พ.ย. 2569/);
  for (const name of ['ตัดต่อคลิปรีวิว EP.1', 'ตัดต่อคลิปรีวิว EP.2', 'ถ่ายภาพสินค้า']) assert.ok(json.includes(name), name);

  // A card that fails is named too, in red, and the title says how many of all were saved.
  const failing = await lineGroupCommand(user, { action: 'confirm', groupId }, {
    confirm: async (_user, id) => { if (id === (CARDS[2] as { id: string }).id) throw new Error('db down'); return { kind: 'edit_job', path: '/jobs' }; },
    drop: async () => undefined,
  });
  assert.match(flat(failing), /บันทึกแล้ว 2 จาก 3 รายการ/);
  assert.match(flat(failing), /ยังไม่สำเร็จ · กำหนดรับเงิน 22 พ.ย. 2569 → 27 พ.ย. 2569/);

  // ยกเลิกทั้งหมด on cards from words (not pictures) says nothing about pictures.
  const cancelled = await lineGroupCommand(user, { action: 'cancel', groupId }, { cancel: async () => true, drop: async () => undefined });
  assert.match(flat(cancelled), /พิมพ์บอกเลขาใหม่ได้เลย/);
  assert.doesNotMatch(flat(cancelled), /รูปยังอยู่ในคลังเอกสาร/);
});

test('one card confirmed in LINE names its record ("แก้ไขงานแล้ว" says which job)', async () => {
  const fs = await import('node:fs');
  const bridge = fs.readFileSync(new URL('../backend/src/ai/lineBridge.ts', import.meta.url), 'utf8');
  assert.match(bridge, /rows: \[\{ name: name \? \(client \? `\$\{name\} · \$\{client\}` : name\) : label\.title/);
  const service = fs.readFileSync(new URL('../backend/src/ai/service.ts', import.meta.url), 'utf8');
  assert.match(service, /name: proposal\.record\.name\.trim\(\)\.slice\(0, 120\)/);
  assert.match(service, /client: proposal\.record\.client\.trim\(\)\.slice\(0, 120\)/);
});

test('what the question is about stands out: the delivery date, the payment date, or the amount', async () => {
  const { listFocus, shapeLineReply } = await import('../backend/src/ai/lineFormat');
  assert.equal(listFocus('เดดไลน์ส่งงานมีอะไรบ้าง'), 'delivery');
  assert.equal(listFocus('งานไหนต้องส่งบ้าง'), 'delivery');
  assert.equal(listFocus('เดดไลน์ชำระเงินของลูกค้า'), 'payment');
  assert.equal(listFocus('ลูกค้าจะโอนเงินวันไหน'), 'payment');
  assert.equal(listFocus('ยอดค้างรับเท่าไหร่'), 'amount');
  assert.equal(listFocus('สวัสดีครับ'), undefined);

  const now = new Date('2026-11-15T03:00:00Z');
  const delivery = shapeLineReply('งานที่ต้องส่งมี 2 งานครับ\n• ตัดต่อคลิปรีวิว EP.3 · ฿3,000 · ส่ง 17 พ.ย.\n• ถ่ายภาพสินค้า · ฿8,000 · ส่ง 18 พ.ย.', [], now, { focus: 'delivery' });
  const card = flat(delivery.messages.find(message => message.type === 'flex'));
  // The date on the right, large and in the CI colour, its words above it; the amount joins the line under the name.
  assert.match(card, /\{"type":"text","text":"ส่ง","size":"xxs"[^}]*\},\{"type":"text","text":"17 พ.ย.","size":"lg","weight":"bold","color":"#C24A16"/);
  assert.match(card, /"text":"฿3,000","size":"xs"/);
  // Each row says which project: the full name, and the client before the amount on the line under it.
  const named = shapeLineReply('งานที่ต้องส่งมี 2 งานครับ\n• รีวิวคาเฟ่ลูมิน คลิปที่ 1 · คุณยอร์ช · ฿3,000 · ส่ง 17 พ.ย.\n• รีวิวคาเฟ่ลูมิน คลิปที่ 2 · คุณยอร์ช · ฿3,000 · ส่ง 19 พ.ย.', [], now, { focus: 'delivery' });
  assert.match(flat(named.messages), /"text":"รีวิวคาเฟ่ลูมิน คลิปที่ 1"/);
  assert.match(flat(named.messages), /"text":"คุณยอร์ช · ฿3,000","size":"xs"/);

  const payment = shapeLineReply('ครบกำหนดรับเงิน 2 งานครับ\n• ตัดต่อคลิปรีวิว EP.3 · ฿3,000 · ครบกำหนด 20 พ.ย.\n• ถ่ายภาพสินค้า · ฿8,000 · ครบกำหนด 22 พ.ย.', [], now, { focus: 'payment' });
  assert.match(flat(payment.messages), /"text":"ครบกำหนด","size":"xxs"[^}]*\},\{"type":"text","text":"20 พ.ย.","size":"lg"/);

  const amount = shapeLineReply('ค้างรับ 2 งานครับ\n• ตัดต่อคลิปรีวิว EP.3 · ฿3,000 · ครบกำหนด 20 พ.ย.\n• ถ่ายภาพสินค้า · ฿8,000 · ครบกำหนด 22 พ.ย.', [], now, { focus: 'amount' });
  assert.match(flat(amount.messages), /"text":"฿3,000","size":"lg","weight":"bold","color":"#C24A16"/);

  // Without a focus the list is laid out as before (the amount on the right, regular size).
  const plain = shapeLineReply('งาน 2 งานครับ\n• ตัดต่อคลิปรีวิว EP.3 · ฿3,000 · ส่ง 17 พ.ย.\n• ถ่ายภาพสินค้า · ฿8,000 · ส่ง 18 พ.ย.', [], now);
  assert.match(flat(plain.messages), /"text":"฿3,000","size":"sm","weight":"bold","color":"#1C1917"/);
});

test('a job named only "คลิปที่ 1" still says which project: its client joins its name in the rows, and edit cards show the client', async () => {
  const { cardLine } = await import('../backend/src/ai/lineFormat');
  const card = { kind: 'confirm' as const, id: 'p_x', title: 'แก้ไขงาน', changes: [{ label: 'งาน', value: 'คลิปที่ 1' }, { label: 'ลูกค้า', value: 'รีวิวคาเฟ่ลูมิน' }, { label: 'วันที่ส่งงาน / แผนส่ง', value: '17 พ.ย. 2569 → 20 พ.ย. 2569' }] };
  assert.deepEqual(cardLine(card), { name: 'คลิปที่ 1 · รีวิวคาเฟ่ลูมิน', detail: 'วันที่ส่งงาน / แผนส่ง 17 พ.ย. 2569 → 20 พ.ย. 2569' });
  assert.deepEqual(cardLine({ ...card, changes: [card.changes[0], card.changes[2]] }).name, 'คลิปที่ 1');
  const fs = await import('node:fs');
  const tools = fs.readFileSync(new URL('../backend/src/ai/tools.ts', import.meta.url), 'utf8');
  assert.match(tools, /const head: Proposal\['changes'\] = \[\{ label: 'งาน', value: job\.name \}, \.\.\.\(job\.client && typeof args\.client !== 'string' \? \[\{ label: 'ลูกค้า', value: job\.client \}\] : \[\]\)\];/);
  assert.match(tools, /if \(changes\.length === head\.length\) return fail\('ไม่มีอะไรให้เปลี่ยน'\);/);
});
