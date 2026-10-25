import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { lineAssistantReply } from '../backend/src/ai/lineFormat.js';
import type { AssistantCard } from '../backend/src/ai/types.js';

const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = 'https://line-review.example.test';
after(() => { if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl; });
const id = 'p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
type Card = Extract<AssistantCard, { kind: 'confirm' }>;
const card = (changes: Card['changes'], title = 'เตรียมใบเสนอราคา'): Card => ({ kind: 'confirm', id, title, changes });
function nodes(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value as Record<string, any>, ...Object.values(value).flatMap(nodes)];
}
function render(value: Card) { return lineAssistantReply('เตรียมไว้แล้วครับ', [value]); }
const actions = (value: unknown) => nodes(value).filter(node => node.type === 'postback' || node.type === 'uri');

test('LINE displays every proposed row and long field before allowing document confirmation', () => {
  const description = `รายละเอียดครบ ${'บริการออกแบบ '.repeat(50)}ข้อความสุดท้าย`;
  const changes = [
    ...Array.from({ length: 10 }, (_, i) => ({ label: `รายการ ${i + 1}`, value: `งาน ${i + 1} · ฿100` })),
    { label: 'รายละเอียด', value: description },
    { label: 'VAT', value: '฿70.00' }, { label: 'ยอดชำระสุทธิ', value: '฿1,070.00' },
  ];
  const reply = render(card(changes));
  const textNodes = nodes(reply).filter(node => node.type === 'text');
  for (const row of changes) {
    const displayed = textNodes.find(node => node.text === row.value);
    assert.ok(displayed, `complete field missing: ${row.label}`);
    assert.equal(displayed.wrap, true);
    assert.equal(displayed.maxLines, undefined, 'confirmation text must not be visually clamped');
  }
  assert.ok(actions(reply).some(action => action.data === `ai:confirm:${id}`));
  assert.ok(actions(reply).some(action => action.data === `ai:cancel:${id}`));
});

test('LINE withholds confirmation for a document with more rows than can be reviewed and points to the app', () => {
  const changes = Array.from({ length: 30 }, (_, i) => ({ label: `รายการ ${i + 1}`, value: `งาน ${i + 1} ฿1,000` }));
  const reply = render(card([...changes, { label: 'ยอดสุทธิที่ท้ายรายการ', value: '฿30,000' }]));
  assert.equal(actions(reply).some(action => action.type === 'postback'), false);
  assert.ok(actions(reply).some(action => action.type === 'uri' && action.uri === 'https://line-review.example.test/assistant'));
  assert.ok(JSON.stringify(reply).includes('รายละเอียดแสดงไม่ครบ'));
  assert.ok(JSON.stringify(reply).includes('ขอให้เตรียมรายการใหม่'));
  assert.ok(!JSON.stringify(reply).includes(id), 'hidden details must not expose a confirmation command');
});

test('a long recurring-expense replacement cannot retain a confirm button after preview truncation', () => {
  const replacement = Array.from({ length: 100 }, (_, i) => `รายการค่าใช้จ่ายประจำลำดับ ${i + 1} ฿1,234.56`).join('\n');
  const reply = render(card([{ label: 'รายการค่าใช้จ่ายประจำทั้งหมดหลังแก้', value: replacement }, { label: 'รวมต่อเดือน', value: '฿123,456' }], 'แก้ไขการตั้งค่าการเงิน'));
  assert.equal(actions(reply).some(action => action.type === 'postback'), false);
  assert.ok(JSON.stringify(reply).includes('จึงไม่มีปุ่มยืนยัน'));
});

test('UTF-8 bubble size is checked independently of row and string counts', () => {
  const changes = Array.from({ length: 24 }, (_, i) => ({ label: `รายละเอียด ${i}`, value: 'ก'.repeat(1500) }));
  const reply = render(card(changes));
  assert.equal(actions(reply).some(action => action.type === 'postback'), false);
  for (const message of reply) if (message.type === 'flex') {
    assert.ok(new TextEncoder().encode(JSON.stringify(message.contents)).length < 30_000);
  }
});

test('legacy small job confirmations remain functional, while missing review data or app configuration never creates a fallback confirm', () => {
  const job = render(card([{ label: 'งาน', value: 'แปลเอกสาร' }, { label: 'ยอดรับ', value: '฿4,000' }], 'บันทึกรับเงินครบ'));
  assert.ok(actions(job).some(action => action.data === `ai:confirm:${id}`));
  const old = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const empty = render(card([]));
    assert.equal(actions(empty).length, 0);
    assert.ok(JSON.stringify(empty).includes('ยังไม่บันทึก'));
    assert.ok(JSON.stringify(empty).includes('เปิดเลขาในแอป'));
  } finally { process.env.APP_URL = old; }
});

test('LINE navigation renders a manual named button only for an exact server-catalog destination', () => {
  const input: AssistantCard = { kind: 'navigation', label: 'untrusted custom label', path: '/settings?view=line', autoOpen: true };
  const reply = lineAssistantReply('', [input]);
  assert.deepEqual(reply, lineAssistantReply('', [{ ...input, autoOpen: false }]), 'LINE never auto-navigates');
  assert.ok(actions(reply).some(action => action.type === 'uri' && action.uri === 'https://line-review.example.test/settings?view=line' && action.label === 'เปิดเชื่อมต่อ LINE'));
  assert.equal(actions(reply).some(action => action.type === 'postback'), false);
  assert.ok(!JSON.stringify(reply).includes(input.label), 'the server owns the visible destination name');
  for (const path of ['https://attacker.example', '//attacker.example', '/settings?view=line&accountId=other', '/invoice?document=foreign', '/jobs/another-account', '/adminDashboard', '/settings#redirect']) {
    const rejected = lineAssistantReply('', [{ ...input, path }]);
    assert.equal(actions(rejected).length, 0, path);
  }
});
