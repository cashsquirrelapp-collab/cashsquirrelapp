import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_JOB_EXAMPLES } from '../backend/src/services/lineEntryRouting.js';
import { parseLineQuickDraft } from '../backend/src/services/lineQuickDraft.js';

// The welcome card and greeting text teach by example, so each example must really become a job draft
// (owner, 2026-10-22: the app records jobs and their income, not coffee).
test('every LINE job example becomes a job draft', () => {
  for (const example of LINE_JOB_EXAMPLES) {
    const draft = parseLineQuickDraft(example);
    assert.equal(draft?.intent, 'add_job', example);
    assert.ok((draft?.jobValue || 0) > 0, `${example} has an amount`);
    assert.ok(!/กาแฟ|ค่าเดินทาง/.test(example), 'no personal expense examples');
  }
});

test('the welcome after linking promises only what the plan includes', async () => {
  process.env.APP_URL = 'https://cards.example.com';
  const { buildLineWelcome, buildLineDisconnected } = await import('../backend/src/services/lineLinkCards.js');
  const quickReply = { items: [{ type: 'action' as const, action: { type: 'message' as const, label: 'รอรับเงิน', text: 'รอรับเงิน' } }] };
  const pro = buildLineWelcome({ pro: true, quickReply }) as any;
  const free = buildLineWelcome({ pro: false, quickReply }) as any;
  assert.ok(JSON.stringify(pro).includes('ยินดีต้อนรับครับ'));
  assert.deepEqual(pro.quickReply, quickReply);
  assert.ok(pro.contents.footer && JSON.stringify(pro.contents.footer).includes('openAddJob'));
  assert.equal(free.quickReply, undefined);
  assert.ok(JSON.stringify(free).includes('เป็นสิทธิ์ของสมาชิก Pro'));
  assert.ok(JSON.stringify(free.contents.footer).includes('/plans'));
  assert.equal(parseLineQuickDraft(LINE_JOB_EXAMPLES[0])?.intent, 'add_job');
  const bye = JSON.stringify(buildLineDisconnected());
  assert.ok(bye.includes('ยกเลิกการเชื่อมต่อแล้ว') && bye.includes('อยู่ครบ ไม่มีการลบ'));
});

test('after linking, the webhook welcomes with the version for the account plan', async () => {
  process.env.APP_URL = 'https://cards.example.com';
  const { welcomeAfterLink } = await import('../backend/src/handlers/line-webhook.js');
  const quick = () => ({ items: [] });
  const user = { user_id: '11111111-1111-4111-8111-111111111111' } as any;
  const pro = await welcomeAfterLink('U1', { findUserByLineId: async () => user, isProUser: async () => true, getQuickReply: quick }) as any;
  assert.ok(pro.quickReply && JSON.stringify(pro).includes('openAddJob'));
  const free = await welcomeAfterLink('U1', { findUserByLineId: async () => user, isProUser: async () => false, getQuickReply: quick }) as any;
  assert.ok(!free.quickReply && JSON.stringify(free).includes('/plans'));
  const broken = await welcomeAfterLink('U1', { findUserByLineId: async () => { throw new Error('db down'); }, isProUser: async () => true, getQuickReply: quick }) as any;
  assert.ok(JSON.stringify(broken).includes('ยินดีต้อนรับครับ') && !broken.quickReply, 'a failed lookup still welcomes, promising nothing extra');
});
