import test from 'node:test';
import assert from 'node:assert/strict';
import { usageCsv, usageLevel, usageRows } from '../shared/adminUsage';
import type { AdminAnalyticsAccount } from '../shared/adminAnalytics';
import type { AccountFigures } from '../shared/adminProfit';

// Usage by account (owner, 2026-10-25): every account, its app use beside its AI use and money, a usage level from
// the share of tokens used, and a CSV a spreadsheet opens safely. Synthetic accounts only.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const who = (n: number, over: Partial<AdminAnalyticsAccount> = {}): AdminAnalyticsAccount => ({ userId: id(n), publicId: `SQ-000000000${n}`, displayName: `บัญชี ${n}`, createdAt: '2026-09-01T00:00:00Z',
  persona: 'freelance', jobTypes: [], planStatus: 'pro', plan: 'pro_monthly', currentPeriodEnd: null, totalSpent: 0, paymentCount: 0, lastPaymentAt: null, activeDays: 4, pageViews: 30,
  lastSeenAt: '2026-10-20T03:00:00Z', topFeatures: [], ...over } as AdminAnalyticsAccount);
const fig = (n: number, used: number, left: number | null, over: Partial<AccountFigures> = {}): AccountFigures => ({ userId: id(n), plan: 'paid', cashRevenue: 17_700, refunds: 0, fee: 1_761,
  feeSource: 'stripe', earnedRevenue: 17_700, messages: used ? 10 : 0, geminiMessages: used ? 9 : 0, claudeMessages: used ? 1 : 0, failedRequests: 0, inputTokens: 0, outputTokens: 0,
  cacheReadTokens: 0, cacheWriteTokens: 0, krarokTokens: used, krarokTokensLeft: left, tokensUsedUp: false, aiUsd: used * 100, directUsd: used * 100, ownPlatformUsd: 0, retryUsd: 0,
  escalatedUsd: 0, billableUsd: used * 100, ai: used, directAi: used, allocatedPlatform: 0, contribution: 15_000, allocatedContribution: 15_000 - used, earnedContribution: 15_000,
  cardsPrepared: 0, cardsConfirmed: 0, costPerConfirmed: null, ...over });

test('levels: heavy from 80% of the allowance, medium from 30%, light below, none without a request; no allowance goes by requests', () => {
  assert.deepEqual(usageLevel(fig(1, 2000, 500)), { quota: 80, level: 'heavy' });
  assert.deepEqual(usageLevel(fig(1, 750, 1750)), { quota: 30, level: 'medium' });
  assert.deepEqual(usageLevel(fig(1, 100, 2400)), { quota: 4, level: 'light' });
  assert.deepEqual(usageLevel(fig(1, 0, 2500)), { quota: 0, level: 'none' });
  assert.deepEqual(usageLevel(undefined), { quota: null, level: 'none' });
  assert.deepEqual(usageLevel(fig(1, 5000, null, { plan: 'admin', messages: 120 })), { quota: null, level: 'heavy' });
  assert.deepEqual(usageLevel(fig(1, 50, null, { plan: 'admin', messages: 5 })), { quota: null, level: 'light' });
});

test('rows: every account from the dashboard list joined with its figures; accounts only in the report still appear', () => {
  const rows = usageRows([who(1), who(2, { planStatus: 'free' })], [fig(1, 2000, 500), fig(3, 100, 2400)]);
  assert.deepEqual(rows.map(row => [row.userId.slice(-1), row.who?.publicId ?? null, row.level]), [['1', 'SQ-0000000001', 'heavy'], ['2', 'SQ-0000000002', 'none'], ['3', null, 'light']]);
});

test('CSV: a header, one line per account, Thai kept for Excel, names that look like formulas are neutralised, numbers stay numbers', () => {
  const rows = usageRows([who(1, { displayName: '=HYPERLINK("http://x")' }), who(2)], [fig(1, 2000, 500, { allocatedContribution: -1_234 })]);
  const csv = usageCsv(rows, '2026-10', 30);
  assert.ok(csv.startsWith('﻿month,public_id,display_name,plan,app_active_days_30d'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^2026-10,SQ-0000000001,"'=HYPERLINK\(""http:\/\/x""\)",paid,4,30,2026-10-20T03:00:00Z,heavy,10,9,1,2000,500,80,20\.00,0\.200000,177\.00,17\.61,-12\.34,0,0,$/);
  assert.match(lines[2], /^2026-10,SQ-0000000002,บัญชี 2,pro,4,30,/);
});
