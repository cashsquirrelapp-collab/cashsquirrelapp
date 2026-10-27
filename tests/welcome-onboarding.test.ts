import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_ROLLOUT_AT, EMPTY_ANSWERS, jobTypesForOccupations, onboardingAnalytics, onboardingRecord, onboardingRecordSchema, personaForWorkType,
  shouldShowOnboarding, toggleGoal, type OnboardingBehavior,
} from '../shared/onboarding';
import { validateChanges } from '../shared/validation';

// Welcome Onboarding V1 (owner brief, 2026-10-28): four questions after the first sign-in, kept with stable IDs in the
// account's settings; skipped or completed, never asked again; the admin sees groups and what each group really does.

const NOW = new Date('2026-10-28T03:00:00.000Z');
const after = new Date(ONBOARDING_ROLLOUT_AT + 3600_000).toISOString();
const before = new Date(ONBOARDING_ROLLOUT_AT - 1).toISOString();

test('who is asked: accounts created since the rollout, once, never guests or a group workspace', () => {
  assert.equal(shouldShowOnboarding({ createdAt: after }), true);
  assert.equal(shouldShowOnboarding({ createdAt: before }), false);
  assert.equal(shouldShowOnboarding({ createdAt: 'not a date' }), false);
  assert.equal(shouldShowOnboarding({ createdAt: null }), false);
  assert.equal(shouldShowOnboarding({ createdAt: after, onboarding: { status: 'SKIPPED' } }), false);
  assert.equal(shouldShowOnboarding({ createdAt: after, onboarding: { status: 'COMPLETED' } }), false);
  assert.equal(shouldShowOnboarding({ createdAt: after, guest: true }), false);
  assert.equal(shouldShowOnboarding({ createdAt: after, groupWorkspace: true }), false);
});

test('"ยังไม่แน่ใจ อยากลองใช้ก่อน" stands alone: it clears the other goals, and another goal clears it', () => {
  assert.deepEqual(toggleGoal(['receivables', 'documents'], 'exploring'), ['exploring']);
  assert.deepEqual(toggleGoal(['exploring'], 'projects'), ['projects']);
  assert.deepEqual(toggleGoal(['projects'], 'documents'), ['projects', 'documents']);
  assert.deepEqual(toggleGoal(['projects', 'documents'], 'projects'), ['documents']);
});

test('the record: stable IDs in a fixed order, the "other" text only with อื่น ๆ, trimmed and capped', () => {
  const record = onboardingRecord({
    workType: 'other', workTypeOther: '  ช่างแต่งหน้า   อิสระ  ', occupations: ['other', 'content_creator', 'marketing'],
    occupationOther: 'x'.repeat(200), goals: ['documents', 'receivables'],
  }, 'COMPLETED', NOW);
  assert.deepEqual(record, {
    version: 'welcome-v1', status: 'COMPLETED', work_type: 'other', work_type_other: 'ช่างแต่งหน้า อิสระ',
    occupations: ['content_creator', 'marketing', 'other'], occupation_other: 'x'.repeat(80), goals: ['receivables', 'documents'],
    updated_at: NOW.toISOString(), completed_at: NOW.toISOString(),
  });
  assert.equal(onboardingRecordSchema.safeParse(record).success, true);
  // The typed text goes when อื่น ๆ is not picked.
  const plain = onboardingRecord({ ...EMPTY_ANSWERS, workType: 'freelance', workTypeOther: 'left over', occupationOther: 'left over' }, 'COMPLETED', NOW);
  assert.equal(plain.work_type_other, null);
  assert.equal(plain.occupation_other, null);
});

test('skipping keeps what was picked and the step; finishing later keeps the first completion time', () => {
  const skipped = onboardingRecord({ ...EMPTY_ANSWERS, workType: 'employee' }, 'SKIPPED', NOW, null, 2);
  assert.equal(skipped.status, 'SKIPPED');
  assert.equal(skipped.skipped_at_step, 2);
  assert.equal(skipped.work_type, 'employee');
  assert.equal(skipped.completed_at, undefined);
  const first = onboardingRecord({ ...EMPTY_ANSWERS, goals: ['projects'] }, 'COMPLETED', NOW);
  const later = onboardingRecord({ ...EMPTY_ANSWERS, goals: ['documents'] }, 'COMPLETED', new Date('2026-11-02T00:00:00Z'), first);
  assert.equal(later.completed_at, NOW.toISOString());
  assert.equal(later.updated_at, '2026-11-02T00:00:00.000Z');
});

test('the saved settings accept a good record and refuse an unknown ID, a mixed exclusive goal or long text', () => {
  const settings = (onboarding: unknown) => [{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1,
    data: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, onboarding } }];
  const good = onboardingRecord({ ...EMPTY_ANSWERS, workType: 'student', occupations: ['teacher_coach'], goals: ['exploring'] }, 'COMPLETED', NOW);
  assert.deepEqual((validateChanges(settings(good))[0].data as { onboarding: unknown }).onboarding, good);
  assert.throws(() => validateChanges(settings({ ...good, work_type: 'astronaut' })));
  assert.throws(() => validateChanges(settings({ ...good, goals: ['exploring', 'projects'] })));
  assert.throws(() => validateChanges(settings({ ...good, work_type_other: 'x'.repeat(81) })));
  assert.throws(() => validateChanges(settings({ ...good, extra: true })));
  // Settings without the questionnaire still save as before.
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40 } }]));
});

test('what the answers do in the app: the menu grouping and the job types (only those not there yet)', () => {
  assert.equal(personaForWorkType('freelance'), 'freelance');
  assert.equal(personaForWorkType('business_owner'), 'freelance');
  assert.equal(personaForWorkType('employee'), 'employee');
  assert.equal(personaForWorkType('student'), 'university');
  assert.equal(personaForWorkType('other'), undefined);
  assert.equal(personaForWorkType(null), undefined);
  assert.deepEqual(jobTypesForOccupations(['content_creator', 'marketing', 'photo_video', 'other'], ['Sponsored Post', 'Video Production']),
    ['การตลาด / โฆษณา', 'ถ่ายภาพ / วิดีโอ']);
  assert.deepEqual(jobTypesForOccupations(['video_graphic'], ['video production']), []);
});

test('admin: groups from the answers, and what each group did (made, asked, came back, bought Pro)', () => {
  const quiet: OnboardingBehavior = { project_created: 0, document_created: 0, expense_created: 0, ai_message_sent: 0, pro_subscription_activated: false, active_days: 1 };
  const busy: OnboardingBehavior = { project_created: 4, document_created: 2, expense_created: 0, ai_message_sent: 9, pro_subscription_activated: true, active_days: 5 };
  const record = (answers: Partial<typeof EMPTY_ANSWERS>, status: 'COMPLETED' | 'SKIPPED' = 'COMPLETED') => onboardingRecord({ ...EMPTY_ANSWERS, ...answers }, status, NOW);
  const result = onboardingAnalytics([
    { createdAt: after, onboarding: record({ workType: 'freelance', occupations: ['content_creator', 'video_graphic'], goals: ['receivables'] }), behavior: busy },
    { createdAt: after, onboarding: record({ workType: 'freelance', occupations: ['content_creator'], goals: ['exploring'] }), behavior: quiet },
    { createdAt: after, onboarding: record({ workType: 'other', workTypeOther: 'ช่างแต่งหน้า' }, 'SKIPPED'), behavior: quiet },
    { createdAt: after, onboarding: record({ workType: 'other', workTypeOther: 'ช่างแต่งหน้า' }), behavior: quiet },
    { createdAt: after, onboarding: null, behavior: quiet },
    { createdAt: before, onboarding: null, behavior: busy },
    { createdAt: after, onboarding: { status: 'COMPLETED', work_type: 'astronaut' }, behavior: busy },
  ]);
  assert.deepEqual([result.eligible, result.completed, result.skipped, result.pending], [6, 3, 1, 1]);
  const freelance = result.workTypes.find(row => row.id === 'freelance')!;
  assert.deepEqual(freelance, { id: 'freelance', accounts: 2, project_created: 1, document_created: 1, expense_created: 0, ai_message_sent: 1, pro_subscription_activated: 1, returned: 1 });
  assert.equal(result.occupations.find(row => row.id === 'content_creator')!.accounts, 2);
  assert.equal(result.occupations.find(row => row.id === 'video_graphic')!.accounts, 1);
  assert.equal(result.goals.find(row => row.id === 'exploring')!.accounts, 1);
  assert.deepEqual(result.otherWorkTypes, [{ text: 'ช่างแต่งหน้า', accounts: 2 }]);
  // Every stable ID has a row, even with nobody in it, so the admin sees the whole list.
  assert.deepEqual(result.workTypes.map(row => row.id), ['freelance', 'employee', 'student', 'business_owner', 'other']);
  assert.equal(result.occupations.length, 8);
  assert.equal(result.goals.length, 5);
});
