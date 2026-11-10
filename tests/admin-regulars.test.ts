import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regularAccounts, regularEmails, regularExtras, regularType } from '../shared/adminRegulars.js';

// ผู้ใช้ประจำ (owner, 2026-11-10): who came back on more than one day, most days first, with email, the sign-up answers,
// เลขา requests and LINE. People here are made up.

const account = (userId: string, activeDays: number, pageViews: number, planStatus: 'pro' | 'free' | 'trial' | 'admin' | 'expired', lastSeenAt = '2026-11-09T00:00:00Z') => ({
  userId, publicId: `SQ-${userId}`, displayName: `ชื่อ ${userId}`, createdAt: '2026-10-01T00:00:00Z', persona: 'freelance' as const, jobTypes: [], planStatus,
  plan: null, currentPeriodEnd: null, totalSpent: 0, paymentCount: 0, lastPaymentAt: null, activeDays, pageViews, lastSeenAt, topFeatures: [],
});

test('extras from plain rows: email, known answers only, เลขา requests counted, LINE', () => {
  const extras = regularExtras({
    users: [{ id: 'a', email: 'a@example.com', last_sign_in_at: '2026-11-09T01:00:00Z' }, { id: 'b', email: null }],
    onboarding: [{ user_id: 'a', onboarding: { work_type: 'freelance', occupations: ['video_graphic', 'not-a-real-id'], goals: ['receivables'], work_type_other: '', occupation_other: '' } }],
    aiUsage: [{ user_id: 'a' }, { user_id: 'a' }, { user_id: 'b' }],
    lineLinks: [{ user_id: 'b' }],
  });
  assert.deepEqual(extras[0], {
    userId: 'a', email: 'a@example.com', lastSignInAt: '2026-11-09T01:00:00Z', workType: 'freelance', workTypeOther: '',
    occupations: ['video_graphic'], occupationOther: '', goals: ['receivables'], aiRequests: 2, lineLinked: false,
  });
  assert.equal(extras[1].email, null);
  assert.equal(extras[1].workType, null);
  assert.equal(extras[1].aiRequests, 1);
  assert.equal(extras[1].lineLinked, true);
});

test('who they are, in the words of the sign-up questions', () => {
  const [a] = regularExtras({ users: [{ id: 'a' }], onboarding: [{ user_id: 'a', onboarding: { work_type: 'other', work_type_other: 'ช่างภาพงานแต่ง', occupations: ['photo_video', 'other'], occupation_other: 'ไลฟ์ขายของ' } }], aiUsage: [], lineLinks: [] });
  assert.equal(regularType(a), 'ช่างภาพงานแต่ง · ช่างภาพ / วิดีโอ, ไลฟ์ขายของ');
  const [none] = regularExtras({ users: [{ id: 'n' }], onboarding: [], aiUsage: [], lineLinks: [] });
  assert.equal(regularType(none), null);
  assert.equal(regularType(null), null);
});

test('the list: back on 2 days or more, most days first, then pages, then the latest; plan and search filters; emails once', () => {
  const accounts = [account('1', 6, 80, 'free'), account('2', 12, 200, 'pro'), account('3', 6, 120, 'trial'), account('4', 1, 3, 'free'), account('5', 6, 120, 'admin', '2026-11-10T00:00:00Z')];
  const extras = regularExtras({ users: [{ id: '1', email: 'one@example.com' }, { id: '2', email: 'two@example.com' }, { id: '3', email: 'two@example.com' }, { id: '5' }], onboarding: [{ user_id: '1', onboarding: { work_type: 'student' } }], aiUsage: [], lineLinks: [] });
  const all = regularAccounts(accounts, extras, { minDays: 2, plan: 'all', query: '' });
  assert.deepEqual(all.map(item => item.userId), ['2', '5', '3', '1']);
  assert.deepEqual(regularAccounts(accounts, extras, { minDays: 7, plan: 'all', query: '' }).map(item => item.userId), ['2']);
  assert.deepEqual(regularAccounts(accounts, extras, { minDays: 2, plan: 'paying', query: '' }).map(item => item.userId), ['2'], 'only a paid Pro');
  assert.deepEqual(regularAccounts(accounts, extras, { minDays: 2, plan: 'free', query: '' }).map(item => item.userId), ['5', '3', '1']);
  assert.deepEqual(regularAccounts(accounts, extras, { minDays: 2, plan: 'all', query: 'นักเรียน' }).map(item => item.userId), ['1'], 'by sign-up answer');
  assert.deepEqual(regularAccounts(accounts, extras, { minDays: 2, plan: 'all', query: 'ONE@' }).map(item => item.userId), ['1'], 'by email');
  assert.deepEqual(regularEmails(all), ['two@example.com', 'one@example.com'], 'each email once, accounts without one left out');
});
