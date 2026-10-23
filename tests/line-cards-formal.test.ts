import { test } from 'node:test';
import assert from 'node:assert/strict';

// LINE cards are formal statements (owner, 2026-10-22: "clean ... ทางการ ... ไม่เอาน่ารักแล้ว", then
// "เพิ่มลิควิดการ์ด ... เกรเดียนต์ ... สีสันแบบทางการ"): the brand symbol and name on a CI gradient band,
// a category chip with its icon, the official mascot standing on the band (no frame), and palette/theme colours.
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
const themeStarts = new Set(Object.values(LINE_CARD_THEMES).map(t => t.start));

for (const [name, card] of Object.entries(cards)) {
  test(`${name}: CI gradient header with brand, icon and mascot, palette colours only`, () => {
    const json = JSON.stringify(card);
    assert.ok(json.includes('/brand/logo01-v1/symbol-white.png'), 'white brand symbol in the header');
    assert.ok(json.includes('"กระรอกตุนเงิน"'), 'brand name in the header');
    // The mascot appears once, standing on the header band (no frame).
    assert.equal(json.match(/mascot-v6-/g)?.length, 1, 'one mascot');
    assert.ok(JSON.stringify((card as any).contents.header).includes('mascot-v6-'), 'the mascot is in the header');
    assert.ok(/\/line\/icons\/[a-z]+\.png/.test(json), 'the category chip has its icon');
    const header = (card as any).contents.header;
    assert.ok(themeStarts.has(header.background.startColor), 'the header band uses one of the CI themes');
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

test('money out is red, money in is green', () => {
  const expense = JSON.stringify((cards.expense as any).contents.header.background);
  const job = JSON.stringify((cards.jobSaved as any).contents.header.background);
  assert.ok(expense.includes(LINE_CARD_THEMES.expense.center));
  assert.ok(job.includes(LINE_CARD_THEMES.positive.center));
});
