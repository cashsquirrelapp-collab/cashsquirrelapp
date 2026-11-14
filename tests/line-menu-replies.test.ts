import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LIFF_ID = '2011172706-TestLiff';
process.env.APP_URL = 'https://staging.krarok.com';
const { buildLineFeatureShortcut, isLineFeatureShortcut, lineShortcutArea } = await import('../backend/src/services/lineFeatureShortcuts');
const { parseLineDocumentCreate } = await import('../backend/src/services/lineDocumentDraft');
const { parseLineQuickDraft } = await import('../backend/src/services/lineQuickDraft');

// The LINE menu's new tiles answer in the chat (owner, 2026-11-14: "ทำข้อ 2 เมนู LINE ต่อเลย"): บันทึก asks what to record,
// ส่งสลิป opens the camera or the album, ออกเอกสาร asks which document. Every tap leads into a flow that already exists:
// no model, no write, no tokens.

type Reply = { type: string; text?: string; altText?: string; quickReply?: { items: { action: Record<string, string> }[] } };
const reply = (text: string) => buildLineFeatureShortcut(text, [], new Date('2026-11-14T03:00:00Z')) as Reply | null;
const chips = (message: Reply | null) => message?.quickReply?.items.map(item => item.action) ?? [];

test('บันทึก: what to record, as taps that start the one-question-at-a-time flow', () => {
  const message = reply('บันทึก');
  assert.equal(message?.type, 'text');
  assert.match(message!.text!, /^จะบันทึกอะไรครับ/);
  assert.deepEqual(chips(message), [
    { type: 'message', label: 'งาน / รายรับ', text: 'บันทึกงาน' },
    { type: 'message', label: 'รายจ่าย', text: 'เพิ่มรายจ่าย' },
  ]);
  // The taps are the bare requests the chat already answers with the empty card and the first question.
  assert.equal(parseLineQuickDraft('บันทึกงาน')?.intent, 'add_job');
  assert.equal(parseLineQuickDraft('เพิ่มรายจ่าย')?.intent, 'add_expense');
});

test('ส่งสลิป: the camera or the photo album, straight from the chat', () => {
  const message = reply('ส่งสลิป');
  assert.match(message!.text!, /สลิปหรือใบเสร็จ/);
  assert.deepEqual(chips(message), [{ type: 'camera', label: 'ถ่ายรูป' }, { type: 'cameraRoll', label: 'เลือกรูป' }]);
  assert.equal(lineShortcutArea('ส่งสลิป'), null, 'not a vault feature: open to every linked account');
});

test('ออกเอกสาร: which document, as taps that start a draft; the page in the app stays one tap away', () => {
  const message = reply('ออกเอกสาร');
  assert.equal(message?.type, 'flex');
  assert.match(JSON.stringify(message), /เปิดหน้าเอกสาร|\/invoice/);
  assert.deepEqual(chips(message).map(action => action.text), ['ออกใบเสนอราคา', 'ออกใบแจ้งหนี้', 'ออกใบเสร็จ']);
  assert.deepEqual(chips(message).map(action => parseLineDocumentCreate(action.text)?.type), ['quotation', 'invoice', 'receipt']);
});

test('LINE limits: at most 13 quick replies, labels of 20 characters or fewer; the words typed by hand still work', () => {
  for (const text of ['บันทึก', 'ส่งสลิป', 'ออกเอกสาร']) {
    const items = chips(reply(text));
    assert.ok(items.length > 0 && items.length <= 13, text);
    assert.ok(items.every(action => action.label.length <= 20), text);
  }
  for (const text of ['บันทึก', ' บันทึก ', 'ส่งสลิป / ใบเสร็จ', 'ส่งใบเสร็จ', 'ออกเอกสาร']) assert.ok(isLineFeatureShortcut(text), text);
  assert.equal(isLineFeatureShortcut('บันทึกงาน'), false, 'บันทึกงาน stays with the record flow');
});
