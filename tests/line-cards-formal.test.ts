import { test } from 'node:test';
import assert from 'node:assert/strict';

// LINE cards are formal statements (owner, 2026-10-22: "clean ... ทางการ"), livelier since 2026-11-14 after the competitor's cards:
// the brand symbol and name, the kind of card as a picture in the CI typeface, a status pill, the official mascot standing
// large on the right, all in the warm CI family (deep headers for documents and notices, pastel for money in and out),
// flat (no gradients), every main button CI orange (lineTone.ts).
process.env.APP_URL = 'https://cards.example.com';
const { lineCard, lineValueRow, LINE_CARD_COLORS, LINE_CARD_THEMES } = await import('../backend/src/services/lineCards.js');
const { buildDigestFlexMessage, findJobsNeedingAttention } = await import('../backend/src/services/lineReminders.js');
const A = await import('../backend/src/services/lineAssistant.js');

const now = new Date('2026-10-22T01:00:00Z');
const cards = {
  digest: buildDigestFlexMessage(findJobsNeedingAttention([
    { id: 'a', name: 'งาน A', client: 'ลูกค้า A', status: 'pending', pending: 4500, payDate: '2026-10-19' },
    { id: 'b', name: 'งาน B', client: 'ลูกค้า B', status: 'pending', pending: 9700, payDate: '2026-10-22' },
  ], now), { now }),
  jobSaved: A.buildJobSavedMessage({ id: 'j', name: 'งาน', client: 'ลูกค้า', value: 10000, received: 9700, status: 'done', whtRate: 3, whtAmount: 300 }, 1000),
  jobEdited: A.buildJobEditedMessage({ id: 'j', name: 'งาน', client: 'ลูกค้า', value: 10000, status: 'pending', pending: 10000 }),
  goal: A.buildGoalCreatedMessage({ name: 'เงินสำรอง', target: 60000 }),
  expense: A.buildExpenseSavedMessage({ id: 'e', name: 'ค่าโฮสติ้ง', category: 'ค่าบริการ', amount: 850, date: '2026-10-22', note: '' }, 900),
};
const palette = new Set(Object.values(LINE_CARD_COLORS).map(c => c.toUpperCase()));
palette.add('#D6D3D1'); // the outline of secondary reminder buttons
for (const theme of Object.values(LINE_CARD_THEMES)) for (const c of Object.values(theme)) palette.add(c.toUpperCase());
const themeColours = new Set<string>(Object.values(LINE_CARD_THEMES).map(t => t.center));

for (const [name, card] of Object.entries(cards)) {
  test(`${name}: flat CI header with brand, CI-typeface title picture and mascot, palette colours only, no gradient`, () => {
    const json = JSON.stringify(card);
    const header = (card as any).contents.header;
    const pastel = header.backgroundColor === LINE_CARD_THEMES.expense.center || header.backgroundColor === LINE_CARD_THEMES.positive.center;
    assert.ok(json.includes(pastel ? '/brand/logo01-v1/symbol-ci.png' : '/brand/logo01-v1/symbol-white.png'), 'brand symbol in the header');
    assert.ok(json.includes('"กระรอกตุนเงิน"'), 'brand name in the header');
    // The mascot appears once, standing in the header (no frame).
    assert.equal(json.match(/mascot-v6-/g)?.length, 1, 'one mascot');
    assert.ok(JSON.stringify(header).includes('mascot-v6-'), 'the mascot is in the header');
    assert.ok(/\/line\/titles-v1\/[a-z-]+\.png/.test(JSON.stringify(header)), 'the kind of card as a CI-typeface picture');
    assert.ok(themeColours.has(header.backgroundColor), 'the header uses one of the CI themes');
    assert.ok(!json.includes('linearGradient'), 'no gradient anywhere on the card');
    // Plain colours must come from the palette; translucent white/black (8-digit) only lights the band.
    const colours = [...json.matchAll(/"(?:color|backgroundColor|borderColor|separatorColor|startColor|centerColor|endColor)":"(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]);
    assert.ok(colours.length > 0);
    for (const colour of colours) assert.ok(palette.has(colour.toUpperCase()), `${colour} is outside the palette`);
  });
}

test('statement rows keep label and value on one line unless the text is very long', () => {
  assert.equal(lineValueRow('ลูกค้า', 'ลูกค้าตัวอย่าง B', { bold: false }).layout, 'horizontal');
  assert.equal(lineValueRow('ยอด', '฿ 9,700').layout, 'horizontal');
  assert.equal(lineValueRow('หมายเหตุ', 'ข้อความยาวมากสำหรับอธิบายรายละเอียดของงานนี้ที่เกินสี่สิบตัวอักษร').layout, 'vertical');
});

test('an unknown category colour falls back to the text colour', () => {
  const card = lineCard({ title: 'ทดสอบ', altText: 'ทดสอบ', body: [], metric: { label: 'ยอด', value: '฿ 1', color: '#7C3AED' } });
  assert.ok(!JSON.stringify(card).includes('#7C3AED'));
});

test('money out is a pastel red card, money in a pastel green one; the amount and pill carry the colour', () => {
  const expense = (cards.expense as any).contents;
  const job = (cards.jobSaved as any).contents;
  assert.equal(expense.header.backgroundColor, LINE_CARD_THEMES.expense.center);
  assert.equal(job.header.backgroundColor, LINE_CARD_THEMES.positive.center);
  assert.equal(expense.body.contents[0].contents[1].color, LINE_CARD_COLORS.negative, 'the amount keeps the app red');
  assert.equal(job.body.contents[0].contents[1].color, LINE_CARD_COLORS.positive, 'the amount keeps the app green');
  assert.match(JSON.stringify(expense.header), /"text":"บันทึกแล้ว"/, 'a status title becomes the pill');
});

test('each document reads apart: quotation CI orange, invoice rust, receipt espresso, each with its own title picture', async () => {
  const D = await import('../backend/src/services/lineDocumentDraft.js');
  const card = (text: string) => (D.buildDocumentDraftCard(D.newDocumentDraft(D.parseLineDocumentCreate(text)!), { name: 'สตูดิโอ' }) as any).contents;
  const quote = card('ขอใบเสนอราคา คุณบี ตัดต่อ 5000');
  const invoice = card('ออกใบแจ้งหนี้ คุณบี ตัดต่อ 5000');
  const receipt = card('ออกใบเสร็จ คุณบี ตัดต่อ 5000 โอนแล้ว');
  assert.deepEqual([quote, invoice, receipt].map(c => c.header.backgroundColor),
    [LINE_CARD_THEMES.brand.center, LINE_CARD_THEMES.alert.center, LINE_CARD_THEMES.espresso.center]);
  for (const [c, key] of [[quote, 'quotation'], [invoice, 'invoice'], [receipt, 'receipt']] as const) {
    assert.match(JSON.stringify(c.header), new RegExp(`/line/titles-v1/${key}\\.png`));
    assert.match(JSON.stringify(c.header), /"text":"แบบร่าง"/);
  }
});

test('without picture addresses the kind is written in words instead', async () => {
  const saved = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const card = lineCard({ title: 'บันทึกรายจ่ายแล้ว', altText: 'x', character: 'spent', body: [] }) as any;
    assert.match(JSON.stringify(card.contents.header), /"text":"รายจ่าย"/);
  } finally { process.env.APP_URL = saved; }
});
