import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASK_POSTBACK, SHEET_LATER, buildQuestion, buildSheetOffer, handleNudgeTap, nextQuestion, nudgeAfterSave, readNudgeState, savedByCommand,
  withAnswer, type AnswerDeps, type AskKey, type NudgeDeps, type NudgeState,
} from '../backend/src/services/lineNudges.js';
import { lineEventCommand } from '../backend/src/handlers/line-webhook.js';
import { settingsFor } from '../backend/src/services/lineSignup.js';
import { onboardingRecordSchema, type OnboardingRecord } from '../shared/onboarding.js';

// เลขาเสนอตอนที่ใช่ (owner, 2026-11-13): after a save in LINE, at most one thing a day — the next welcome question
// (one tap, skippable) or, once five records are in, the offer to use the person's own sheet. Nothing asked twice.

const NOW = new Date('2026-11-13T05:00:00.000Z');
const lineRecord = (extra: Partial<OnboardingRecord> = {}): OnboardingRecord =>
  onboardingRecordSchema.parse({ ...settingsFor({ name: 'ปาร์ค', skippedAtStep: 2, agreed: true, idToken: 'x' } as never, NOW).onboarding, ...extra });

function deps(over: Partial<NudgeDeps> & { record?: OnboardingRecord | null; nudges?: NudgeState } = {}) {
  const saved: NudgeState[] = [];
  const value: NudgeDeps = {
    userOf: async () => 'u1',
    state: async () => ({ record: over.record === undefined ? lineRecord() : over.record, nudges: over.nudges ?? {} }),
    saveNudges: async (_user, nudges) => { saved.push(nudges); },
    sheetsOpen: async () => false, hasSheet: async () => false, records: async () => 1,
    now: () => NOW,
    ...over,
  };
  return { value, saved };
}

test('a LINE sign-up is marked, so its unanswered questions can be asked later; the web flow is unchanged', () => {
  const record = lineRecord();
  assert.equal(record.channel, 'line');
  assert.equal(record.status, 'SKIPPED');
  assert.equal(nextQuestion(record, {}), 'use');
  assert.equal(nextQuestion(lineRecord({ use: 'business' }), {}), 'work');
  assert.equal(nextQuestion(lineRecord({ use: 'business' }), { skipped: ['work'] }), 'occupation');
  // A web account (no channel, no use) is never asked in the chat.
  const { channel: _channel, ...web } = record;
  assert.equal(nextQuestion(web as OnboardingRecord, {}), null);
  assert.equal(nextQuestion(null, {}), null);
});

test('every question is one tap: short labels that fit LINE (20 characters), ids the server checks, and ข้ามไปก่อน', () => {
  for (const key of ['use', 'work', 'occupation', 'goal', 'records'] as AskKey[]) {
    const message = buildQuestion(key, true) as any;
    assert.match(message.text, /\?$/);
    const items = message.quickReply.items as any[];
    assert.ok(items.length <= 13, `${key}: LINE allows 13 quick replies`);
    for (const item of items) {
      assert.ok(item.action.label.length <= 20, `${key}: ${item.action.label}`);
      assert.ok(ASK_POSTBACK.test(item.action.data), item.action.data);
      assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: item.action.data } }), item.action.data);
    }
    assert.equal(items.at(-1).action.data, `ask:${key}:skip`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(message.text));
  }
  // ลงชีตที่ใช้อยู่ only where the sheet feature is open to the account.
  const goals = (open: boolean) => (buildQuestion('goal', open) as any).quickReply.items.map((item: any) => item.action.data);
  assert.ok(goals(true).includes('ask:goal:my_sheet'));
  assert.ok(!goals(false).includes('ask:goal:my_sheet'));
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: SHEET_LATER } }), SHEET_LATER);
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'ask:work:../../x' } }), null);
});

test('after a save: one question, then nothing for 20 hours', async () => {
  const first = deps();
  const message = await nudgeAfterSave('U1', first.value) as any;
  assert.equal(message.text, 'ขอถามนิดนึงครับ ใช้กระรอกแบบไหน?');
  assert.equal(first.saved[0].at, NOW.toISOString());
  const soon = deps({ nudges: { at: new Date(NOW.getTime() - 3 * 3_600_000).toISOString() } });
  assert.equal(await nudgeAfterSave('U1', soon.value), null);
  assert.equal(soon.saved.length, 0);
  const nextDay = deps({ nudges: { at: new Date(NOW.getTime() - 21 * 3_600_000).toISOString() } });
  assert.ok(await nudgeAfterSave('U1', nextDay.value));
  // All answered or skipped, or not linked: nothing.
  const done = lineRecord({ use: 'personal', work_type: 'employee', occupations: ['marketing'], goals: ['record_chat'], records_in: 'notebook' });
  assert.equal(await nudgeAfterSave('U1', deps({ record: done }).value), null);
  assert.equal(await nudgeAfterSave('U1', deps({ userOf: async () => null }).value), null);
  // A failing read never fails the answer it follows.
  assert.equal(await nudgeAfterSave('U1', deps({ state: async () => { throw new Error('db down'); } }).value), null);
});

test('five records and no sheet yet: the sheet offer comes first, with ไว้ก่อน kept for 14 days', async () => {
  const offer = deps({ sheetsOpen: async () => true, records: async () => 5 });
  const card = await nudgeAfterSave('U1', offer.value) as any;
  assert.equal(card.type, 'flex');
  assert.equal(card.altText, 'จดมา 5 รายการแล้ว อยากให้ลงชีตของคุณด้วยไหม');
  assert.equal(offer.saved[0].sheetOfferedAt, NOW.toISOString());
  // Fewer than five, a sheet already connected, the feature closed, ไว้ก่อน lately or offered lately: a question instead.
  const variants: Partial<NudgeDeps & { nudges: NudgeState }>[] = [
    { sheetsOpen: async () => true, records: async () => 4 },
    { sheetsOpen: async () => true, records: async () => 9, hasSheet: async () => true },
    { sheetsOpen: async () => false, records: async () => 9 },
    { sheetsOpen: async () => true, records: async () => 9, nudges: { sheetLaterAt: new Date(NOW.getTime() - 5 * 86_400_000).toISOString() } },
    { sheetsOpen: async () => true, records: async () => 9, nudges: { sheetOfferedAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString() } },
  ];
  for (const variant of variants) assert.equal(((await nudgeAfterSave('U1', deps(variant).value)) as any)?.type, 'text');
  // The buttons: connect the sheet they have, make a new one, or later (a postback, no page).
  const buttons = (buildSheetOffer('2012039027-abc', 5) as any).contents.footer.contents.map((button: any) => button.action);
  assert.deepEqual(buttons.map((action: any) => action.label), ['เชื่อมชีตที่มีอยู่', 'สร้างชีตใหม่ให้', 'ไว้ก่อน']);
  assert.equal(buttons[0].uri, 'https://liff.line.me/2012039027-abc?connect=sheets');
  assert.equal(buttons[1].uri, 'https://liff.line.me/2012039027-abc?connect=sheets&new=1');
  assert.equal(buttons[2].data, SHEET_LATER);
});

test('a tap is kept: the answer goes into the welcome record, ข้าม and ไว้ก่อน are remembered, a made-up id is refused', async () => {
  const calls: string[] = [];
  const tapDeps: AnswerDeps = {
    userOf: async lineId => (lineId === 'U1' ? 'u1' : null),
    answer: async (_user, key, id) => { calls.push(`answer ${key} ${id}`); },
    skip: async (_user, key) => { calls.push(`skip ${key}`); },
    later: async () => { calls.push('later'); },
  };
  assert.match(((await handleNudgeTap('U1', 'ask:work:freelance', tapDeps)) as any).text, /^ขอบคุณครับ/);
  assert.match(((await handleNudgeTap('U1', 'ask:goal:skip', tapDeps)) as any).text, /ไม่เป็นไร/);
  assert.match(((await handleNudgeTap('U1', SHEET_LATER, tapDeps)) as any).text, /เชื่อมชีต/);
  assert.match(((await handleNudgeTap('U1', 'ask:work:astronaut', tapDeps)) as any).text, /ใช้ไม่ได้แล้ว/);
  assert.equal(await handleNudgeTap('U2', 'ask:work:freelance', tapDeps), null);
  assert.equal(await handleNudgeTap('U1', 'something else', tapDeps), null);
  assert.deepEqual(calls, ['answer work freelance', 'skip goal', 'later']);
});

test('answers fill the record; with all four in it is COMPLETED, and it still passes the app\'s own check', () => {
  let record = lineRecord();
  record = withAnswer(record, 'use', 'business', NOW);
  record = withAnswer(record, 'work', 'freelance', NOW);
  record = withAnswer(record, 'occupation', 'photo_video', NOW);
  record = withAnswer(record, 'goal', 'receivables', NOW);
  assert.equal(record.status, 'SKIPPED');
  record = withAnswer(record, 'records', 'google_sheets', NOW);
  assert.equal(record.status, 'COMPLETED');
  assert.equal(record.completed_at, NOW.toISOString());
  assert.equal(record.skipped_at_step, undefined);
  assert.deepEqual([record.use, record.work_type, record.occupations, record.goals, record.records_in], ['business', 'freelance', ['photo_video'], ['receivables'], 'google_sheets']);
  assert.ok(onboardingRecordSchema.safeParse(record).success);
});

test('only a save that worked is followed by a nudge; the kept dates are read back safely', () => {
  const flex = { type: 'flex' as const, altText: 'บันทึกแล้ว', contents: {} };
  assert.equal(savedByCommand('ยืนยันรายการเลขา p_0b5c6a1e-3c1f-4c8e-9f1a-1a2b3c4d5e6f', [flex]), true);
  assert.equal(savedByCommand('บันทึกทั้งหมดเลขา gAbc12345', [flex]), true);
  assert.equal(savedByCommand('ยืนยันรายการเลขา p_0b5c6a1e-3c1f-4c8e-9f1a-1a2b3c4d5e6f', [{ type: 'text', text: 'รายการนี้ยืนยันไปแล้วหรือหมดเวลาแล้วครับ' }]), false);
  assert.equal(savedByCommand('ยกเลิกรายการเลขา p_0b5c6a1e-3c1f-4c8e-9f1a-1a2b3c4d5e6f', [flex]), false);
  assert.equal(savedByCommand('สรุปเดือนนี้', [flex]), false);
  assert.deepEqual(readNudgeState({ at: 'nope', skipped: ['work', 'hack'], sheetLaterAt: NOW.toISOString() }), { at: undefined, sheetOfferedAt: undefined, sheetLaterAt: NOW.toISOString(), skipped: ['work'] });
  assert.deepEqual(readNudgeState(null), {});
});

test('สร้างชีตใหม่ให้ picks the workbook from the welcome answers when the six business questions are not answered', async () => {
  const { profileFromWelcome, templateFor, businessProfileSchema } = await import('../shared/businessProfile.js');
  const pick = (welcome: Parameters<typeof profileFromWelcome>[0]) => templateFor(profileFromWelcome(welcome, NOW));
  assert.equal(pick(null), 'freelance');
  assert.equal(pick({ use: 'personal' }), 'freelance');
  assert.equal(pick({ use: 'business', occupations: ['photo_video'] }), 'freelance');
  assert.equal(pick({ use: 'company', occupations: ['photo_video'] }), 'production');
  assert.equal(pick({ use: 'company', occupations: ['marketing'] }), 'agency');
  assert.equal(pick({ use: 'company' }), 'agency');
  assert.equal(pick({ use: 'business', work_type: 'accounting_office' }), 'office');
  for (const welcome of [null, { use: 'company', occupations: ['photo_video'] }, { use: 'business', occupations: ['trade_owner'] }]) {
    assert.ok(businessProfileSchema.safeParse(profileFromWelcome(welcome, NOW)).success);
  }
});
