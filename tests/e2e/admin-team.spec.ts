import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { summarizeActivity } from '../../shared/userActivity';
import { withoutMoney, type AdminAnalyticsSummary } from '../../shared/adminAnalytics';
import type { AdminLookup } from '../../shared/adminTeam';

// Owner, 2026-11-04: ผู้ดูแล (the owner) and แอดมิน (the team). The team opens activity, features, accounts, new users,
// messages and the message to everyone; never revenue, profit and cost, or the overview. The owner gives admin rights and
// tokens by UID from ทีมงานและโทเคน.

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FRIEND_ID = '22222222-2222-4222-8222-222222222222';
const owner = { id: OWNER_ID, email: 'heidnsko1234@gmail.com', role: 'admin', canViewAdminAnalytics: true, adminLevel: 'owner', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const teamAdmin = { ...owner, email: 'team@example.com', canViewAdminAnalytics: false, adminLevel: 'admin' };

const snapshot = {
  jobs: [], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

const analytics: AdminAnalyticsSummary = {
  range: 30, fromDate: '2026-10-06', toDate: '2026-11-04', generatedAt: '2026-11-04T04:00:00Z', liveSignature: 'pulse-1',
  totals: { accounts: 48, newAccounts: 9, activeUsers: 21, previousActiveUsers: 17, pageViews: 940, proAccounts: 6, paidProAccounts: 4, trialAccounts: 2,
    freeAccounts: 40, revenue: 70800, previousRevenue: 35400, paymentCount: 4, conversionRate: 0.08, averageRevenuePerPayer: 17700 },
  daily: Array.from({ length: 30 }, (_, index) => ({ date: `2026-${index < 26 ? '10' : '11'}-${String(index < 26 ? index + 6 : index - 25).padStart(2, '0')}`, activeUsers: 4 + index % 9, pageViews: 20 + index, revenue: index % 7 ? 0 : 17700, payments: index % 7 ? 0 : 1 })),
  features: [
    { key: 'dashboard', activeUsers: 20, pageViews: 400, freeUsers: 15, proUsers: 5, freeViews: 300, proViews: 100 },
    { key: 'jobs', activeUsers: 14, pageViews: 300, freeUsers: 10, proUsers: 4, freeViews: 200, proViews: 100 },
  ],
  personas: [{ key: 'freelance', accounts: 30, activeUsers: 15, proAccounts: 5, revenue: 70800 }, { key: 'unknown', accounts: 18, activeUsers: 6, proAccounts: 1, revenue: 0 }],
  accounts: [
    { userId: FRIEND_ID, publicId: 'SQ-6735AB827F', displayName: 'มินตรา ดีไซน์', createdAt: '2026-08-11T09:00:00Z', persona: 'freelance', jobTypes: ['Graphic Design'], planStatus: 'pro', plan: 'pro_prepaid',
      currentPeriodEnd: '2026-12-01T00:00:00Z', totalSpent: 44700, paymentCount: 3, lastPaymentAt: '2026-11-01T03:00:00Z', activeDays: 12, pageViews: 210, lastSeenAt: '2026-11-04T02:00:00Z', topFeatures: [{ key: 'jobs', pageViews: 120 }] },
  ],
  payments: [{ id: 'pi_team_test', userId: FRIEND_ID, publicId: 'SQ-6735AB827F', displayName: 'มินตรา ดีไซน์', amount: 17700, currency: 'thb', paidAt: '2026-11-01T03:00:00Z', refunded: false }],
};

const activity = summarizeActivity({
  profiles: [{ user_id: FRIEND_ID, public_id: 'SQ-6735AB827F', display_name: 'มินตรา ดีไซน์', created_at: '2026-08-11T09:00:00Z' }],
  plans: new Map([[FRIEND_ID, 'pro']]), range: 30, now: new Date('2026-11-04T05:00:00Z'),
  presence: new Map([[FRIEND_ID, '2026-11-04T04:59:00Z']]), usage: [], activity: new Map(), statsOff: new Set(), signIns: new Map(),
});

const friend = (granted: number, role: 'admin' | 'user' = 'user'): AdminLookup => ({
  userId: FRIEND_ID, publicId: 'SQ-6735AB827F', displayName: 'มินตรา ดีไซน์', createdAt: '2026-08-11T09:00:00Z', role, isOwner: false, granted,
  grants: granted ? [{ id: 'grant-1', tokens: granted, at: '2026-11-04T05:00:00Z', note: 'รางวัลกิจกรรม' }] : [],
  tokens: { plan: 'pro', left: 1200 + granted, limit: 1650 + granted, resetsAt: '2026-12-01T00:00:00+07:00' },
  labsTester: false,
});

// Owner's rule (2026-10-23): no overlapping text. Where the owner's checker is on this machine, it runs on these pages.
const checker = path.resolve(process.cwd(), '../../text-overlap-check/appcheck.js');
const overlapScript = fs.existsSync(checker) ? fs.readFileSync(checker, 'utf8') : null;
const PAGE_WORDS = /โทเคน|UID|แอดมิน|ผู้ดูแล|SQ-|มินตรา|ทีม|แจก|สิทธิ์|เลขากระรอก|บัญชี|ผู้ใช้|ใช้ได้|Pro|\d/;
async function noOverlap(page: Page, label: string) {
  if (!overlapScript) return;
  const result = await page.evaluate(overlapScript) as { issues: { kind: string; a: string; b?: string }[] };
  expect(result.issues.filter(issue => issue.kind !== 'CLOSE' && (PAGE_WORDS.test(issue.a) || PAGE_WORDS.test(issue.b ?? ''))), label).toEqual([]);
}

/** Requests for money a team admin's page must never make. */
const MONEY = /\/api\/(admin-stripe-finance|admin-profit-live|admin-ai-credit|admin-payment-readiness)|\/api\/admin-analytics\?.*pulse=1|\/api\/notify/;

async function open(page: Page, user: typeof owner, posts: unknown[] = [], moneyRequests: string[] = []) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('request', request => { if (MONEY.test(request.url())) moneyRequests.push(request.url()); });
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Krarok team' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/admin-activity?*', route => route.fulfill({ json: activity }));
  await page.route('**/api/broadcast?scope=admin', route => route.fulfill({ json: { results: [] } }));
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ status: 403, json: { error: 'owner only' } }));
  await page.route('**/api/admin-ai-credit*', route => route.fulfill({ status: 403, json: { error: 'owner only' } }));
  await page.route('**/api/admin-payment-readiness*', route => route.fulfill({ status: 403, json: { error: 'owner only' } }));
  // The server strips money for a team admin (admin-analytics.ts); the page draws what it gets.
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: user.adminLevel === 'owner' ? analytics : withoutMoney(analytics) }));
  let lookups = 0;
  let granted = 0;
  let role: 'admin' | 'user' = 'user';
  let tester = false;
  await page.route('**/api/admin-users?*', route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    if (action === 'lookup') { lookups++; return route.fulfill({ json: { ...friend(granted, role), labsTester: tester } }); }
    if (action === 'token-grants') return route.fulfill({ json: { grants: granted ? [{ ...friend(granted).grants[0], userId: FRIEND_ID, publicId: 'SQ-6735AB827F', displayName: 'มินตรา ดีไซน์' }] : [] } });
    if (action === 'dashboard-details') return route.fulfill({ json: { section: 'admins', total: 1, page: 0, pageSize: 25, accounts: [{ userId: OWNER_ID, publicId: 'SQ-0000000001', displayName: 'Krarok team', role: 'admin', createdAt: '2026-01-01T00:00:00Z', isOnline: true, lastSeenAt: null }] } });
    return route.fulfill({ json: { users: [], total: 0, page: 0 } });
  });
  await page.route('**/api/admin-users', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    if (body.action === 'grant-tokens') { granted += Number(body.tokens); return route.fulfill({ json: { ok: true, added: true, account: friend(granted, role) } }); }
    if (body.role) { role = body.role as 'admin' | 'user'; return route.fulfill({ json: { ok: true } }); }
    if (body.action === 'set-tester') { tester = body.on === true; return route.fulfill({ json: { ok: true, account: { ...friend(granted, role), labsTester: tester } } }); }
    return route.fulfill({ status: 400, json: { error: 'unexpected' } });
  });
  await page.goto('/adminDashboard/team');
  return { lookups: () => lookups };
}

for (const size of [{ name: 'computer', width: 1440, height: 900 }, { name: 'iPad', width: 1024, height: 768 }]) {
  test(`a team admin opens the team's sections only, with no money anywhere (${size.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const money: string[] = [];
    await open(page, teamAdmin, [], money);
    const nav = page.getByRole('navigation', { name: 'หมวดการวิเคราะห์' });
    await expect(nav).toBeVisible();
    for (const name of ['ผู้ใช้งาน', 'การใช้ฟีเจอร์', 'รายบัญชี', 'ผู้ใช้ใหม่', 'ข้อความจากผู้ใช้', 'ส่งข้อความถึงผู้ใช้']) await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
    for (const name of ['ภาพรวม', 'รายได้ / Pro', 'กำไรและต้นทุน AI', 'จัดการระบบ', 'ทีมงานและโทเคน']) await expect(nav.getByRole('button', { name, exact: true })).toHaveCount(0);
    // Opens on ผู้ใช้งาน; the owner's buttons are not there.
    await expect(nav.getByRole('button', { name: 'ผู้ใช้งาน', exact: true })).toHaveAttribute('aria-current', 'page');
    // Back office only (owner, 2026-11-04): the admin page is in the menu, unreleased pages are not.
    await expect(page.getByRole('button', { name: 'แดชบอร์ดแอดมิน', exact: true })).toBeVisible();
    for (const name of ['เป้าหมาย', 'รายงาน', 'ภาษี', 'ทีม']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByTestId('admin-line-samples')).toHaveCount(0);
    await nav.getByRole('button', { name: 'รายบัญชี', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'พฤติกรรมรายบัญชี' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'ยอดเติมสะสม' })).toHaveCount(0);
    await page.getByText('มินตรา ดีไซน์').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toContainText('วันที่ใช้งาน');
    await expect(drawer).not.toContainText('ยอดเติมสะสม');
    await expect(drawer).not.toContainText('ประวัติการเติม Pro');
    await expect(drawer).not.toContainText('฿');
    await noOverlap(page, `team drawer ${size.name}`);
    await page.screenshot({ path: testInfo.outputPath(`team-admin-${size.name}.png`) });
    await page.keyboard.press('Escape');
    await nav.getByRole('button', { name: 'ส่งข้อความถึงผู้ใช้', exact: true }).click();
    await expect(page.getByRole('button', { name: 'ส่งถึงทุกคน' })).toBeVisible();
    expect(money).toEqual([]);
  });

  test(`the owner gives tokens and admin rights by UID (${size.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const posts: Record<string, unknown>[] = [];
    await open(page, owner, posts);
    const nav = page.getByRole('navigation', { name: 'หมวดการวิเคราะห์' });
    for (const name of ['ภาพรวม', 'รายได้ / Pro', 'กำไรและต้นทุน AI', 'จัดการระบบ']) await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
    // The owner keeps the unreleased pages.
    await expect(page.getByRole('button', { name: 'เป้าหมาย', exact: true })).toHaveCount(1);
    await nav.getByRole('button', { name: 'ทีมงานและโทเคน', exact: true }).click();
    await expect(page.getByTestId('team-admins')).toContainText('Krarok team');
    await expect(page.getByText('ยังไม่ได้แจกโทเคนให้บัญชีใด')).toBeVisible();
    await page.getByTestId('team-lookup-input').fill('sq-6735ab827f');
    await page.getByTestId('team-lookup').click();
    const card = page.getByTestId('team-account');
    await expect(card).toContainText('มินตรา ดีไซน์');
    await expect(card).toContainText('SQ-6735AB827F');
    await expect(card).toContainText('ผู้ใช้ทั่วไป');
    await expect(card).toContainText('1,200 / 1,650');
    await noOverlap(page, `owner card ${size.name}`);
    await card.getByRole('button', { name: '500', exact: true }).click();
    await expect(page.getByTestId('team-give')).toHaveText(/แจก 500 โทเคน/);
    await page.getByTestId('team-note').fill('รางวัลกิจกรรม');
    await page.getByTestId('team-give').click();
    await expect(page.getByRole('dialog')).toContainText('แจก 500 โทเคนให้ มินตรา ดีไซน์ (SQ-6735AB827F)');
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(page.getByTestId('team-notice')).toContainText('แจก 500 โทเคนให้ มินตรา ดีไซน์ แล้ว · ตอนนี้ใช้ได้ 1,700 โทเคน');
    const grant = posts.find(body => body.action === 'grant-tokens')!;
    expect(grant).toMatchObject({ userId: FRIEND_ID, tokens: 500, note: 'รางวัลกิจกรรม' });
    expect(String(grant.requestId)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await expect(card).toContainText('500');
    await expect(page.getByTestId('team-log')).toContainText('+500');
    // Admin rights from the same card.
    await page.getByTestId('team-role').click();
    await expect(page.getByRole('dialog')).toContainText('จะไม่เห็นรายได้');
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(page.getByTestId('team-notice')).toContainText('ให้สิทธิ์แอดมินแก่ มินตรา ดีไซน์ แล้ว');
    expect(posts.at(-1)).toEqual({ userId: FRIEND_ID, role: 'admin' });
    await expect(page.getByTestId('team-role')).toHaveText(/ถอดสิทธิ์แอดมิน/);
    // ฟีเจอร์ทดลอง (owner, 2026-11-12): the owner makes the account a tester from the same card.
    await expect(card).toContainText('บัญชีทดสอบ (ฟีเจอร์ทดลอง)');
    await page.getByTestId('team-tester').click();
    await expect(page.getByRole('dialog')).toContainText('จะเห็นส่วนฟีเจอร์ทดลองในหน้าตั้งค่า');
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(page.getByTestId('team-notice')).toContainText('ตั้ง มินตรา ดีไซน์ เป็นบัญชีทดสอบแล้ว');
    expect(posts.at(-1)).toEqual({ action: 'set-tester', userId: FRIEND_ID, on: true });
    await expect(page.getByTestId('team-tester')).toHaveText(/เลิกเป็นบัญชีทดสอบ/);
    await noOverlap(page, `owner after grant ${size.name}`);
    await page.screenshot({ path: testInfo.outputPath(`owner-team-${size.name}.png`), fullPage: true });
  });
}

test('phones: a team admin\'s dashboard carries the accounts, not the revenue; the owner has ทีมงานและโทเคน', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const money: string[] = [];
  await open(page, teamAdmin, [], money);
  await expect(page.getByRole('region', { name: 'สรุปผู้ใช้งาน' })).toContainText('21');
  await expect(page.getByRole('region', { name: 'สรุปรายได้' })).toHaveCount(0);
  for (const name of ['รายได้และการชำระเงิน', 'จัดการผู้ใช้', 'จัดการทีม', 'ทีมงานและโทเคน', 'ส่งการ์ด LINE ตัวอย่าง']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  for (const name of ['รายบัญชี', 'การใช้ฟีเจอร์', 'ผู้ใช้ใหม่', 'ผู้ใช้งาน', 'ส่งข้อความถึงผู้ใช้', 'ข้อความจากผู้ใช้']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByText('ชำระเงินล่าสุด')).toHaveCount(0);
  await noOverlap(page, 'team phone dashboard');
  await page.screenshot({ path: testInfo.outputPath('team-admin-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'รายบัญชี', exact: true }).click();
  await page.getByRole('button', { name: 'เปิดรายละเอียดบัญชี มินตรา ดีไซน์' }).click();
  await expect(page.getByRole('dialog')).not.toContainText('ยอดเติมสะสม');
  await expect(page.getByRole('dialog')).not.toContainText('฿');
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  expect(money).toEqual([]);
});

test('phones: the owner opens ทีมงานและโทเคน and finds an account by UID', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, owner);
  await expect(page.getByRole('region', { name: 'สรุปรายได้' })).toBeVisible();
  await page.getByRole('button', { name: 'ทีมงานและโทเคน', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ทีมงานและโทเคน' })).toBeVisible();
  await page.getByTestId('team-lookup-input').fill('SQ-6735AB827F');
  await page.getByTestId('team-lookup').click();
  await expect(page.getByTestId('team-account')).toContainText('มินตรา ดีไซน์');
  await noOverlap(page, 'owner phone card');
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ path: testInfo.outputPath('owner-team-phone.png'), fullPage: true });
});
