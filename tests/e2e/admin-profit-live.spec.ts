import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { textOverlapIssues } from './textOverlap';

// กำไรและต้นทุน AI on the admin page (owner, 2026-10-25: "คำนวณต้นทุน AI ... แบบเรียลไทม์ ... เหมือนของ Stripe"): this
// month so far from the server's report engine, refreshed every minute while the page is open, unknown figures said so.
// Sample data only; the clock is installed so the minute can be run on.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'heidnsko1234@gmail.com', role: 'admin', canViewAdminAnalytics: true, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const member = '22222222-2222-4222-8222-222222222222';
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const analytics = {
  range: 30, fromDate: '2026-09-23', toDate: '2026-10-22', generatedAt: '2026-10-22T03:00:00Z', liveSignature: 'one',
  totals: { accounts: 12, newAccounts: 5, activeUsers: 6, previousActiveUsers: 4, pageViews: 300, proAccounts: 2, paidProAccounts: 1, trialAccounts: 3, freeAccounts: 7, revenue: 17700, previousRevenue: 0, payments: 1 },
  daily: [], features: [], personas: [], payments: [],
  accounts: [
    { userId: member, publicId: 'SQ-0000000002', displayName: 'ลูกค้าตัวอย่าง', createdAt: '2026-09-01T00:00:00Z', persona: 'freelance', jobTypes: [], planStatus: 'pro', plan: 'pro_monthly', currentPeriodEnd: null, totalSpent: 17700, paymentCount: 1, lastPaymentAt: null, activeDays: 12, pageViews: 240, lastSeenAt: '2026-10-21T03:00:00Z', topFeatures: [] },
    { userId: '44444444-4444-4444-8444-444444444444', publicId: 'SQ-0000000004', displayName: 'สตูดิโอเงียบ', createdAt: '2026-09-02T00:00:00Z', persona: 'freelance', jobTypes: [], planStatus: 'pro', plan: 'pro_monthly', currentPeriodEnd: null, totalSpent: 17700, paymentCount: 1, lastPaymentAt: null, activeDays: 1, pageViews: 3, lastSeenAt: '2026-10-02T03:00:00Z', topFeatures: [] },
  ],
};
const change = (current: number | null, previous: number | null, percentBp: number | null, kind = 'compare') => ({ current, previous, change: current !== null && previous !== null ? current - previous : null, percentBp, kind });
function profit(aiTotal: number) {
  return {
    month: '2026-10', live: true, generatedAt: new Date().toISOString(),
    settings: { items: [{ key: 'coding_tool', label: 'เครื่องมือเขียนโค้ด', kind: 'fixed_monthly', monthlySatang: 75_000 }, { key: 'domain', label: 'โดเมน', kind: 'fixed_yearly', monthlySatang: 2_917 }], rate4: 335_000, fixedMonthlySatang: 77_917 },
    today: { usdMicro: 1_250_000, capUsd: 5, requests: 38 },
    metrics: {
      month: '2026-10', generatedAt: new Date().toISOString(), status: 'PARTIAL',
      sections: { revenue: { status: 'COMPLETE', notes: [] }, ai: { status: 'COMPLETE', notes: [] }, profit: { status: 'PARTIAL', notes: ['กำไรยังไม่รวมค่าใช้จ่ายที่ยังไม่ทราบ: Cloudflare, Supabase, LINE OA, พื้นที่เก็บไฟล์'] }, comparison: { status: 'PARTIAL', notes: ['ยังไม่มีรายงานเดือนก่อนให้เทียบ'] } },
      members: { paidAtEnd: 1, newPaying: 1, ended: 0, cancelling: 0, trials: 3, granted: 0, payingThisMonth: 1, total: 12, signedUp: 5 },
      revenue: { gross: 17_700, refunds: 0, net: 17_700, fees: 1_761, feesSource: 'stripe', payments: 1, appGross: 17_700, stripeGross: 17_700, difference: 0, earned: 17_700, failedPayments: 0, failedAmount: 0 },
      ai: { requests: 140, failedRequests: 1, activeAccounts: 2, usd: { total: 400_000, gemini: 150_000, claude: 230_000, other: 0, platform: 20_000, cacheShared: 15_000, failedAttempts: 5_000, reportNotes: 0, direct: 380_000, quotaOverrun: 0, cacheSaved: 90_000 },
        thb: { total: aiTotal, gemini: 503, claude: 771, platform: 67, direct: 1_273 }, perMessage: 10, perPaidMember: 900, perActiveAccount: 670, accountMax: 900, accountMedian: 670, accountP90: 900,
        usedUpAccounts: 0, paidMembersWithoutAi: 0, daysNearCap: 0, daysAtCap: 0, coverage: null },
      quality: { prepared: 12, confirmed: 10, confirmRateBp: 8_333, corrections: 2, costPerConfirmed: 134 },
      feedback: { by_kind: {}, top_questions: [], requested_features: [], unanswered: 0, requests: 0, wrongAnswers: 0 },
      reliability: { timeouts: 0, errors: 0, held_for_claude: 0, gemini_took_over: 0, escalations: 1, provider_retries: 0, geminiFailures: 0, claudeFailures: 0, confidentialBlocked: 0 },
      profit: { revenue: 17_700, fees: 1_761, ai: aiTotal, platform: 67, fixed: 77_917, contribution: 17_700 - 1_761 - aiTotal, operating: 17_700 - 1_761 - aiTotal - 77_917, marginBp: -3_563, breakEvenMembers: 5, positiveMembers: 1, negativeMembers: 0, unknownCosts: ['Cloudflare', 'Supabase', 'LINE OA', 'พื้นที่เก็บไฟล์'] },
      comparison: { gross: change(17_700, null, null, 'none'), net: change(17_700, null, null, 'none'), aiThb: change(aiTotal, null, null, 'none'), contribution: change(null, null, null, 'none'), operating: change(null, null, null, 'none'), paidAtEnd: change(1, null, null, 'none'), requests: change(140, null, null, 'none') },
    },
    accounts: [{ userId: member, plan: 'paid', cashRevenue: 17_700, refunds: 0, fee: 1_761, feeSource: 'stripe', earnedRevenue: 17_700, messages: 90, geminiMessages: 80, claudeMessages: 10, failedRequests: 0,
      inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, krarokTokens: 900, krarokTokensLeft: 1_600, tokensUsedUp: false, aiUsd: 268_000, directUsd: 260_000, ownPlatformUsd: 8_000,
      retryUsd: 0, escalatedUsd: 0, billableUsd: 260_000, ai: 900, directAi: 871, allocatedPlatform: 67, contribution: 15_039, allocatedContribution: 14_972, earnedContribution: 14_972, cardsPrepared: 8, cardsConfirmed: 7, costPerConfirmed: 128 }],
  };
}

const creditStatus = (provider: 'anthropic' | 'google', over: Record<string, unknown>) => ({ provider, recorded: null, spentSinceMicro: null, remainingMicro: null, dailyMicro: 1_000_000, todayMicro: 200_000,
  spend7Micro: 7_000_000, spend30Micro: 26_000_000, requests30: 900, runwayDays: null, runOutOn: null, reserve30Micro: 39_000_000, topUpMicro: null, status: 'unknown', issues: [], ...over });
const credit = (balance: number | null) => ({
  generatedAt: new Date().toISOString(), rate4: 335_000, dailyCapUsd: 5, issuesRead: true, allowance: { proTokens: 2500, tokenUsd: 0.001 },
  ceiling: { payingMembers: null, worstMonthlyMicro: null, capMonthlyMicro: 150_000_000 },
  providers: [
    balance === null
      ? creditStatus('anthropic', { recorded: { balanceMicro: 20_000_000, at: '2026-10-20T03:00:00Z', note: null }, spentSinceMicro: 15_000_000, remainingMicro: 5_000_000, runwayDays: 5, runOutOn: '2026-10-27', topUpMicro: 34_000_000, status: 'low' })
      : creditStatus('anthropic', { recorded: { balanceMicro: balance * 1_000_000, at: new Date().toISOString(), note: 'เติม $35' }, spentSinceMicro: 0, remainingMicro: balance * 1_000_000, runwayDays: balance, runOutOn: '2026-12-01', topUpMicro: 0, status: 'ok' }),
    creditStatus('google', { dailyMicro: 300_000, reserve30Micro: 11_700_000 }),
  ],
});

async function open(page: Page, width: number) {
  const server = { calls: 0, ai: 1_340, saved: [] as unknown[], balance: null as number | null };
  await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') });
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Owner' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('pulse') === '1' ? { signature: 'one', checkedAt: new Date().toISOString() } : analytics }));
  await page.route('**/api/admin-profit-live?*', route => { server.calls++; return route.fulfill({ json: profit(server.ai) }); });
  // Registered last: Playwright asks the newest route first.
  await page.route('**/api/admin-ai-credit', route => {
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); server.saved.push(body); server.balance = body.balanceUsd; }
    return route.fulfill({ json: credit(server.balance) });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/adminDashboard/owner');
  // Claude running low: a strip above the tabs on every tab, which opens the credit part.
  await expect(page.getByRole('alert').filter({ hasText: 'Claude (Anthropic) เหลือใช้ได้อีกราว 5 วัน' })).toBeVisible();
  await page.getByRole('button', { name: 'ดูและบันทึกยอด' }).click();
  return server;
}

test('computer: profit and AI cost this month, by account, refreshed every minute; unknown costs are named', async ({ page }) => {
  const server = await open(page, 1440);
  const panel = page.getByRole('region', { name: 'กำไรและต้นทุน AI' });
  await expect(panel.getByText('ข้อมูลยังไม่ครบบางส่วน')).toBeVisible();
  await expect(panel.getByText('฿13.40', { exact: true }).first()).toBeVisible();
  await expect(panel).toContainText('$0.4000 · 140 ข้อความ');
  await expect(panel).toContainText('$1.25');
  await expect(panel).toContainText('จากเพดาน $5.00 ต่อวัน · 38 ข้อความ');
  await expect(panel.getByRole('meter')).toHaveAttribute('aria-valuenow', '25');
  await expect(panel).toContainText('Cloudflare');
  await expect(panel).toContainText('คุ้มทุนที่สมาชิก 5 คน');
  const table = panel.getByRole('table');
  await expect(table).toContainText('ลูกค้าตัวอย่าง');
  await expect(table).toContainText('SQ-0000000002');
  await expect(table).toContainText('90 (80 / 10)');
  // Every account: the one who pays but never used เลขา is there too, with its app use, and counted.
  await expect(table).toContainText('สตูดิโอเงียบ');
  await expect(table).toContainText('12 วัน · 240 หน้า');
  await expect(table).toContainText('36%');
  await expect(panel).toContainText('ใช้ AI 1 จาก 2 บัญชี');
  await expect(panel).toContainText('Pro ที่จ่ายแต่ไม่ได้ใช้ AI 1 คน');
  await panel.getByRole('radio', { name: /^Pro ที่ไม่ได้ใช้ AI/ }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('สตูดิโอเงียบ');
  await panel.getByRole('radio', { name: /^ทุกบัญชี/ }).click();
  await table.scrollIntoViewIfNeeded();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('usage-table.png') });
  const [csv] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'ดาวน์โหลด CSV' }).click()]);
  expect(csv.suggestedFilename()).toBe('krarok-usage-2026-10.csv');
  const text = readFileSync(await csv.path(), 'utf8');
  expect(text.split('\r\n')[0]).toContain('public_id,display_name,plan,app_active_days_30d');
  expect(text).toContain('SQ-0000000004,สตูดิโอเงียบ');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('profit-live-1440.png'), fullPage: true });
  const before = server.calls;
  server.ai = 2_010;
  await page.clock.runFor(61_000);
  await expect(panel.getByText('฿20.10', { exact: true }).first()).toBeVisible();
  expect(server.calls).toBeGreaterThan(before);
});

test('iPad width: the tab fits without sideways scrolling, and a past month is the whole month', async ({ page }) => {
  await open(page, 834);
  const panel = page.getByRole('region', { name: 'กำไรและต้นทุน AI' });
  await expect(panel.getByText('ข้อมูลยังไม่ครบบางส่วน')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  const requested: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/admin-profit-live')) requested.push(new URL(request.url()).searchParams.get('month') || ''); });
  await panel.getByRole('combobox', { name: 'เลือกเดือน' }).selectOption('2026-09');
  await expect.poll(() => requested).toContain('2026-09');
});

test('AI credit: days left and what to top up per provider; a recorded balance clears the warning', async ({ page }) => {
  const server = await open(page, 1440);
  const creditPart = page.getByRole('region', { name: 'เครดิต AI และเงินสำรอง' });
  const claude = creditPart.getByRole('region', { name: 'Claude (Anthropic)' });
  await expect(claude).toContainText('ใกล้หมด');
  await expect(claude).toContainText('$5.00 (฿168)');
  await expect(claude).toContainText('5 วัน');
  await expect(claude).toContainText('$34.00 (฿1,139)');
  await expect(creditPart.getByRole('region', { name: 'Gemini (Google)' })).toContainText('ยังไม่ได้บันทึกยอด');
  await expect(creditPart).toContainText('ควรเตรียมเงินสำหรับ AI ใน 30 วันข้างหน้า รวม $50.70 (฿1,698)');
  await expect(creditPart).toContainText('ถ้าสมาชิกที่จ่ายเงินทั้ง 1 คนใช้เต็มโควตา: $2.50 (฿84)');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('ai-credit.png') });
  await claude.getByLabel('บันทึกยอดคงเหลือจากหน้า console (ดอลลาร์)').fill('40');
  await claude.getByLabel('หมายเหตุ').fill('เติม $35');
  await claude.getByRole('button', { name: 'บันทึก' }).click();
  await expect(claude).toContainText('พอใช้');
  expect(server.saved).toEqual([{ provider: 'anthropic', balanceUsd: 40, note: 'เติม $35' }]);
  await expect(page.getByRole('alert').filter({ hasText: 'เหลือใช้ได้อีกราว' })).toHaveCount(1, { timeout: 1000 }).catch(() => undefined);
});
