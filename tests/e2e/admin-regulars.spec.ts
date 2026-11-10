import { expect, test, type Page } from '@playwright/test';
import type { AdminAnalyticsSummary } from '../../shared/adminAnalytics';
import { withoutMoney } from '../../shared/adminAnalytics';
import type { RegularExtra } from '../../shared/adminRegulars';
import { textOverlapIssues } from './textOverlap';

// ผู้ใช้ประจำ (owner, 2026-11-10: "ดูได้หน่อยว่าใครแม่งกลับมาใช้ซ้ำบ่อยเป็นอีเมลอะไรชื่ออะไร ... จะได้เห็นตัวตนด้วยว่าเขาใช้
// เขาเป็นคนประเภทไหนใช้อะไรมากที่สุด"): the owner sees who came back, most days first, with email, sign-up answers, the pages
// they open most, เลขา requests and LINE; copies one email or all of them. A team admin never sees it. The backend is
// mocked; every person here is made up (example.com).

test.use({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const owner = { id: OWNER_ID, email: 'owner@example.com', role: 'admin', canViewAdminAnalytics: true, adminLevel: 'owner', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const teamAdmin = { ...owner, email: 'team@example.com', canViewAdminAnalytics: false, adminLevel: 'admin' };
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const snapshot = {
  jobs: [], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode: 'light', darkFrom: '18:00', lightFrom: '06:00', asked: true } },
  statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const account = (n: number, name: string, planStatus: 'pro' | 'free' | 'trial', activeDays: number, pageViews: number, topFeatures: { key: 'jobs' | 'invoice' | 'dashboard' | 'incomeExpense'; pageViews: number }[]) => ({
  userId: id(n), publicId: `SQ-000000000${n}`, displayName: name, createdAt: '2026-10-01T09:00:00Z', persona: 'freelance' as const, jobTypes: [], planStatus,
  plan: null, currentPeriodEnd: null, totalSpent: 0, paymentCount: 0, lastPaymentAt: null, activeDays, pageViews, lastSeenAt: `2026-11-0${n}T02:00:00Z`, topFeatures,
});
const analytics: AdminAnalyticsSummary = {
  range: 30, fromDate: '2026-10-11', toDate: '2026-11-09', generatedAt: '2026-11-09T04:00:00Z', liveSignature: 'pulse-1',
  totals: { accounts: 4, newAccounts: 4, activeUsers: 4, previousActiveUsers: 0, pageViews: 300, proAccounts: 1, paidProAccounts: 1, trialAccounts: 1,
    freeAccounts: 2, revenue: 0, previousRevenue: 0, paymentCount: 0, conversionRate: 0, averageRevenuePerPayer: 0 },
  daily: [], features: [], personas: [],
  accounts: [
    account(1, 'ภูมิ ตัดต่อ', 'free', 6, 80, [{ key: 'invoice', pageViews: 40 }, { key: 'jobs', pageViews: 30 }]),
    account(2, 'มินตรา ดีไซน์', 'pro', 12, 210, [{ key: 'jobs', pageViews: 120 }, { key: 'dashboard', pageViews: 60 }, { key: 'incomeExpense', pageViews: 20 }]),
    account(3, 'ฟ้า ช่างภาพ', 'trial', 2, 9, [{ key: 'dashboard', pageViews: 9 }]),
    account(4, 'มาครั้งเดียว', 'free', 1, 3, [{ key: 'dashboard', pageViews: 3 }]),
  ],
  payments: [],
};
const extra = (n: number, email: string | null, over: Partial<RegularExtra> = {}): RegularExtra => ({
  userId: id(n), email, lastSignInAt: '2026-11-09T01:00:00Z', workType: null, workTypeOther: '', occupations: [], occupationOther: '', goals: [], aiRequests: 0, lineLinked: false, ...over,
});
const extras: RegularExtra[] = [
  extra(1, 'phum.edit@example.com', { workType: 'freelance', occupations: ['video_graphic'] }),
  extra(2, 'mintra.design@example.com', { workType: 'business_owner', occupations: ['content_creator', 'marketing'], aiRequests: 14, lineLinked: true }),
  extra(3, 'fah.photo@example.com', { workType: 'other', workTypeOther: 'ช่างภาพงานแต่ง' }),
  extra(4, 'once@example.com'),
];

async function open(page: Page, user: typeof owner, { width = 1440, height = 900 } = {}) {
  const asked: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000000', displayName: 'Krarok team' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  // The owner's money panels answer as they do for a team admin: refused, so they show their own notice.
  for (const panel of ['admin-stripe-finance?*', 'admin-ai-credit*', 'admin-payment-readiness*', 'admin-profit-live*']) await page.route(`**/api/${panel}`, route => route.fulfill({ status: 403, json: { error: 'owner only' } }));
  await page.route('**/api/broadcast?scope=admin', route => route.fulfill({ json: { results: [] } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: user.adminLevel === 'owner' ? analytics : withoutMoney(analytics) }));
  await page.route('**/api/admin-activity?*', route => route.fulfill({ json: { range: 30, fromDate: '2026-10-11', toDate: '2026-11-09', generatedAt: '2026-11-09T04:00:00Z', trackingSince: null, totals: { accounts: 0, online: 0, today: 0, week: 0, month: 0, away: 0, none: 0, off: 0 }, heatmap: [], accounts: [] } }));
  await page.route('**/api/admin-users?*', route => {
    const url = new URL(route.request().url());
    asked.push(String(url.searchParams.get('action')));
    if (url.searchParams.get('action') === 'regulars') return user.adminLevel === 'owner' ? route.fulfill({ json: { range: 30, accounts: extras } }) : route.fulfill({ status: 403, json: { error: 'เฉพาะผู้ดูแลระบบเท่านั้น' } });
    return route.fulfill({ json: { users: [], total: 0, page: 0 } });
  });
  await page.setViewportSize({ width, height });
  await page.goto('/adminDashboard/team');
  return { asked };
}

for (const size of [{ name: 'computer', width: 1440, height: 900 }, { name: 'iPad', width: 1024, height: 768 }]) {
  test(`the owner sees who comes back, with email, who they are and what they use (${size.name})`, async ({ page }, testInfo) => {
    await open(page, owner, size);
    const nav = page.getByRole('navigation', { name: 'หมวดการวิเคราะห์' });
    await nav.getByRole('button', { name: 'ผู้ใช้ประจำ', exact: true }).click();
    const rows = page.getByTestId('regular-row');
    await expect(rows).toHaveCount(3);
    // Most days first; the account that came once is left out.
    await expect(rows.nth(0)).toContainText('มินตรา ดีไซน์');
    await expect(rows.nth(1)).toContainText('ภูมิ ตัดต่อ');
    await expect(rows.nth(2)).toContainText('ฟ้า ช่างภาพ');
    await expect(page.getByText('มาครั้งเดียว')).toHaveCount(0);
    await expect(rows.nth(0)).toContainText('mintra.design@example.com');
    await expect(rows.nth(0)).toContainText('12/30');
    await expect(rows.nth(0)).toContainText('เจ้าของธุรกิจ / เอเจนซี · คอนเทนต์ครีเอเตอร์, การตลาด / โฆษณา');
    await expect(rows.nth(0)).toContainText('งานและโปรเจกต์');
    await expect(rows.nth(0)).toContainText('เลขา 14 ครั้ง');
    await expect(rows.nth(0)).toContainText('LINE');
    await expect(rows.nth(2)).toContainText('ช่างภาพงานแต่ง');
    await expect(rows.nth(0).getByRole('link', { name: 'mintra.design@example.com' })).toHaveAttribute('href', 'mailto:mintra.design@example.com');
    // The table under it is what this checks, not เลขา's corner greeting floating over the page (assistant-buddy.spec.ts).
    await page.addStyleTag({ content: '.asx-hello-say, .asx-buddy-tip, .asx-brief-tip { display: none !important; }' });
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`regulars-${size.name}.png`), fullPage: true });
    // Every email of the list, for an email's BCC; then one email.
    await page.getByTestId('regular-copy-all').click();
    await expect(page.getByTestId('regular-copy-all')).toContainText('คัดลอก 3 อีเมลแล้ว');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('mintra.design@example.com, phum.edit@example.com, fah.photo@example.com');
    await rows.nth(1).getByTestId('regular-copy-email').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('phum.edit@example.com');
    // Filters: more days, then Pro only, then a search.
    await page.getByTestId('regular-min-5').click();
    await expect(rows).toHaveCount(2);
    await page.getByRole('button', { name: 'Pro', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'ทุกคน', exact: true }).click();
    await page.getByTestId('regular-search').fill('ตัดต่อ');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('ภูมิ ตัดต่อ');
  });
}

test('a team admin never sees ผู้ใช้ประจำ, and the page never asks for emails', async ({ page }) => {
  const mock = await open(page, teamAdmin);
  const nav = page.getByRole('navigation', { name: 'หมวดการวิเคราะห์' });
  await expect(nav.getByRole('button', { name: 'ผู้ใช้งาน', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'ผู้ใช้ประจำ', exact: true })).toHaveCount(0);
  expect(mock.asked).not.toContain('regulars');
});

test('phones: the owner opens ผู้ใช้ประจำ as cards with nothing overlapping', async ({ page }, testInfo) => {
  await open(page, owner, { width: 390, height: 844 });
  await page.getByRole('button', { name: /ผู้ใช้ประจำ/ }).first().click();
  const rows = page.getByTestId('regular-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('mintra.design@example.com');
  await expect(rows.first()).toContainText('12 วัน');
  expect(await textOverlapIssues(page)).toEqual([]);
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ path: testInfo.outputPath('regulars-phone.png'), fullPage: true });
});
