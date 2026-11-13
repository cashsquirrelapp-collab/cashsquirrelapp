import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_CARD_COLORS, LINE_CARD_THEMES, lineCard } from '../backend/src/services/lineCards.js';
import { toneLineMessage, toneLineMessages } from '../backend/src/services/lineTone.js';

// Every main LINE card button is CI orange with white words, whatever the header (owner, 2026-11-14: "ปุ่มกดอ่ะเขาเป็นปุ่มแบบ CI";
// before, 2026-11-13, buttons took their header's colour).

const all = (node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] => {
  if (Array.isArray(node)) node.forEach(item => all(item, out));
  else if (node && typeof node === 'object') {
    out.push(node as Record<string, unknown>);
    Object.values(node as Record<string, unknown>).forEach(value => all(value, out));
  }
  return out;
};
const footerButton = (message: unknown) => (message as any).contents.footer.contents[0];

test('a pastel รายจ่าย card gets a CI-orange button with white words', () => {
  const card = lineCard({ title: 'บันทึกรายจ่ายแล้ว', altText: 'บันทึกรายจ่ายแล้ว', character: 'spent', body: [], footer: { label: 'เปิดรายการในแอป', uri: 'https://krarok.com/expense' } });
  const button = footerButton(toneLineMessage(card));
  assert.equal(button.type, 'box');
  assert.equal(button.backgroundColor, LINE_CARD_COLORS.accent);
  assert.deepEqual(button.action, { type: 'uri', label: 'เปิดรายการในแอป', uri: 'https://krarok.com/expense' });
  assert.equal(button.contents[0].text, 'เปิดรายการในแอป');
  assert.equal(button.contents[0].color, LINE_CARD_COLORS.white);
  assert.equal(all(toneLineMessage(card)).some(node => node.type === 'button'), false);
});

test('every kind of card, deep or pastel, has the same CI button', () => {
  for (const character of ['received', 'report', 'urgent', 'invoice', 'receipt', 'cancelled'] as const) {
    const card = lineCard({ title: 'x', altText: 'x', character, body: [], footer: { label: 'ดู', uri: 'https://krarok.com/' } });
    assert.equal(footerButton(toneLineMessage(card)).backgroundColor, LINE_CARD_COLORS.accent, character);
  }
});

test('grey buttons stay grey and the same height; orange pills and links stay CI orange', () => {
  const card = lineCard({ title: 'แจ้งเตือน', altText: 'แจ้งเตือน', character: 'urgent', body: [
    { type: 'box', layout: 'horizontal', contents: [
      { type: 'button', style: 'secondary', color: LINE_CARD_COLORS.subtle, height: 'sm', flex: 1, action: { type: 'postback', label: 'ยกเลิก', data: 'x' } },
      { type: 'box', layout: 'vertical', backgroundColor: LINE_CARD_COLORS.accent, borderColor: LINE_CARD_COLORS.accent, contents: [{ type: 'text', text: 'แนบใบ', color: LINE_CARD_COLORS.white }] },
    ] },
    { type: 'text', text: 'ดูรายการ ›', color: LINE_CARD_COLORS.accent },
  ] });
  const toned = toneLineMessage(card) as any;
  const [grey, pill] = toned.contents.body.contents[0].contents;
  assert.equal(grey.type, 'box');
  assert.equal(grey.backgroundColor, LINE_CARD_COLORS.subtle);
  assert.equal(grey.contents[0].color, LINE_CARD_COLORS.text);
  assert.equal(grey.flex, 1);
  assert.equal(pill.backgroundColor, LINE_CARD_COLORS.accent);
  assert.equal(toned.contents.body.contents[1].color, LINE_CARD_COLORS.accent);
  assert.ok(LINE_CARD_THEMES.alert.center !== LINE_CARD_COLORS.accent, 'the header is rust, the buttons stay CI');
});

test('cards in a carousel all get CI buttons; text messages and the original card are untouched', () => {
  const spent = lineCard({ title: 'a', altText: 'a', character: 'spent', body: [], footer: { label: 'ดู', uri: 'https://krarok.com/' } });
  const received = lineCard({ title: 'b', altText: 'b', character: 'received', body: [], footer: { label: 'ดู', uri: 'https://krarok.com/' } });
  const carousel = { type: 'flex', altText: 'x', contents: { type: 'carousel', contents: [(spent as any).contents, (received as any).contents] } } as any;
  const [first, second] = (toneLineMessage(carousel) as any).contents.contents;
  assert.equal(first.footer.contents[0].backgroundColor, LINE_CARD_COLORS.accent);
  assert.equal(second.footer.contents[0].backgroundColor, LINE_CARD_COLORS.accent);
  assert.equal((spent as any).contents.footer.contents[0].type, 'button');
  const text = { type: 'text', text: 'สวัสดีครับ' } as any;
  assert.deepEqual(toneLineMessages([text]), [text]);
});

test('a plain bubble with no coloured header keeps the brand colour for its button', () => {
  const plain = { type: 'flex', altText: 'x', contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
    { type: 'button', style: 'primary', color: LINE_CARD_COLORS.accent, action: { type: 'uri', label: 'เปิด', uri: 'https://krarok.com/' } },
  ] } } } as any;
  assert.equal((toneLineMessage(plain) as any).contents.body.contents[0].backgroundColor, LINE_CARD_COLORS.accent);
});
