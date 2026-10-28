import test from 'node:test';
import assert from 'node:assert/strict';
import { alertFeedback, feedbackAlertText } from '../backend/src/services/feedbackAlert';
import type { DeliveryDeps } from '../backend/src/services/adminProfitReportRun';

// บอกเรา (owner, 2026-10-27): a message used to go only into the database; now the admins who linked LINE are told,
// once an hour per conversation at most, and a failure never stops the message.

process.env.APP_URL ??= 'https://cash-squirrel.test';
const THREAD = '66666666-6666-4666-8666-666666666666';

function deps(over: { admins?: string[]; links?: { user_id: string; line_user_id: string }[]; token?: string; failRoles?: boolean } = {}) {
  const claimed = new Set<string>();
  const pushes: { to: string; text: string; key: string }[] = [];
  const table = (name: string) => ({
    select: () => ({
      eq: async () => (over.failRoles ? { data: null, error: new Error('down') } : { data: (over.admins ?? ['admin-1']).map(user_id => ({ user_id })), error: null }),
      in: async () => ({ data: over.links ?? [{ user_id: 'admin-1', line_user_id: 'U-admin' }], error: null }),
    }),
    name,
  });
  const value: DeliveryDeps = {
    db: { from: table } as unknown as DeliveryDeps['db'],
    token: 'token' in over ? over.token : 'line-token',
    now: new Date('2026-10-27T13:20:00Z'),
    claim: async key => { if (claimed.has(key)) return false; claimed.add(key); return true; },
    push: async (to, message, key) => { pushes.push({ to, text: (message as { text: string }).text, key }); return 'accepted'; },
  };
  return { value, pushes, claimed };
}

test('the alert says what came in, a short preview, and where to answer it', () => {
  const text = feedbackAlertText({ threadId: THREAD, action: 'create', category: 'bug', body: 'กดปุ่ม  บันทึกแล้ว\nไม่เกิดอะไรขึ้น', fromAdmin: false }, 'https://app.test');
  assert.equal(text, 'แจ้งปัญหา · เรื่องใหม่ (แจ้งปัญหา)\n“กดปุ่ม บันทึกแล้ว ไม่เกิดอะไรขึ้น”\nอ่านและตอบได้ที่ แอดมิน › ข้อความจากผู้ใช้ › รอตอบ\nhttps://app.test/adminDashboard?view=feedback');
  const long = feedbackAlertText({ threadId: THREAD, action: 'reply', body: 'ก'.repeat(300), fromAdmin: false }, 'https://app.test');
  assert.match(long, /^แจ้งปัญหา · ผู้ใช้ตอบกลับในเรื่องเดิม\n“ก{120}…”/);
  // Written from an admin account (the owner trying it): the database files it under ตอบแล้ว, and the alert says so.
  assert.match(feedbackAlertText({ threadId: THREAD, action: 'create', body: 'ทดสอบ', fromAdmin: true }, 'https://app.test'), /ส่งจากบัญชีแอดมิน จึงอยู่ในกล่อง ตอบแล้ว/);
});

test('every admin with LINE gets it once; more messages in the same hour do not send it again', async () => {
  const fake = deps({ admins: ['admin-1', 'admin-2'], links: [{ user_id: 'admin-1', line_user_id: 'U-1' }, { user_id: 'admin-2', line_user_id: 'U-2' }] });
  assert.equal(await alertFeedback({ threadId: THREAD, action: 'create', body: 'สวัสดีครับ', fromAdmin: false }, fake.value), 'sent');
  assert.deepEqual(fake.pushes.map(push => push.to), ['U-1', 'U-2']);
  assert.notEqual(fake.pushes[0].key, fake.pushes[1].key);
  assert.equal(await alertFeedback({ threadId: THREAD, action: 'reply', body: 'อีกข้อความ', fromAdmin: false }, fake.value), 'skipped');
  assert.equal(fake.pushes.length, 2);
  // An hour later, or another conversation, is told again.
  assert.equal(await alertFeedback({ threadId: THREAD, action: 'reply', body: 'ชั่วโมงถัดไป', fromAdmin: false, now: new Date('2026-10-27T14:05:00Z') }, fake.value), 'sent');
  assert.equal(await alertFeedback({ threadId: '77777777-7777-4777-8777-777777777777', action: 'create', body: 'เรื่องใหม่', fromAdmin: false }, fake.value), 'sent');
});

test('nobody to tell, no LINE token, or the database down: nothing is sent and nothing throws', async () => {
  assert.equal(await alertFeedback({ threadId: THREAD, action: 'create', body: 'x', fromAdmin: false }, deps({ links: [] }).value), 'skipped');
  const noToken = deps({ token: undefined });
  assert.equal(await alertFeedback({ threadId: THREAD, action: 'create', body: 'x', fromAdmin: false }, noToken.value), 'skipped');
  assert.equal(noToken.claimed.size, 0);
  assert.equal(await alertFeedback({ threadId: THREAD, action: 'create', body: 'x', fromAdmin: false }, deps({ failRoles: true }).value), 'failed');
});
