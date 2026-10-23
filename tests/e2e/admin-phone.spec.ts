import { expect, test, type Page } from '@playwright/test';

// The admin dashboard on phones in the phone app's own design (owner, 2026-10-22): revenue in the
// terracotta header, a period switch, metric cards, latest payments, and every other part as its own
// page opened from a list (payments, accounts with a detail sheet, feature usage, inbox, users, teams).
// The computer/iPad layout is unchanged. Sample data only.

test.use({ serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'heidnsko1234@gmail.com', role: 'admin', canViewAdminAnalytics: true, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const names = ['มินตรา ดีไซน์', 'Than Studio', 'ลูกค้าตัวอย่าง', 'สตูดิโอตัวอย่าง', 'ฟรีแลนซ์ตัวอย่าง', 'ร้านตัวอย่าง'];
const plans = ['pro', 'trial', 'pro', 'admin', 'free', 'expired'];
const personas = ['freelance', 'employee', 'freelance', 'university', 'school', 'unknown'];
const accounts = names.map((name: string, i: number) => ({ userId: `2222222${i}-2222-4222-8222-222222222222`, publicId: `SQ-000000012${i}`, displayName: name, createdAt: `2026-0${7 + (i % 3)}-1${i}T09:00:00Z`, persona: personas[i], jobTypes: i % 2 ? ['Video'] : ['Graphic Design', 'Content'], planStatus: plans[i], plan: null, currentPeriodEnd: plans[i] === 'pro' ? '2026-11-21T03:00:00Z' : null, totalSpent: [44700, 0, 15900, 0, 0, 15900][i], paymentCount: [3, 0, 1, 0, 0, 1][i], lastPaymentAt: null, activeDays: 12 - i, pageViews: 180 - i * 20, lastSeenAt: i === 4 ? null : `2026-10-2${i % 2}T09:00:00Z`, topFeatures: [{ key: 'dashboard', pageViews: 80 }, { key: 'jobs', pageViews: 42 }, { key: 'invoice', pageViews: 19 }] }));
const payments = [
  { id: 'pi_a', userId: accounts[2].userId, publicId: accounts[2].publicId, displayName: accounts[2].displayName, amount: 15900, currency: 'thb', paidAt: '2026-10-21T03:00:00Z', refunded: false },
  { id: 'pi_b', userId: accounts[0].userId, publicId: accounts[0].publicId, displayName: accounts[0].displayName, amount: 84900, currency: 'thb', paidAt: '2026-10-18T03:00:00Z', refunded: false },
  { id: 'pi_c', userId: accounts[5].userId, publicId: accounts[5].publicId, displayName: accounts[5].displayName, amount: 15900, currency: 'thb', paidAt: '2026-10-11T03:00:00Z', refunded: true },
  { id: 'pi_d', userId: accounts[0].userId, publicId: accounts[0].publicId, displayName: accounts[0].displayName, amount: 15900, currency: 'thb', paidAt: '2026-10-02T03:00:00Z', refunded: false },
  { id: 'pi_e', userId: accounts[0].userId, publicId: accounts[0].publicId, displayName: accounts[0].displayName, amount: 15900, currency: 'thb', paidAt: '2026-09-25T03:00:00Z', refunded: false },
];
const analytics = {
  range: 30, fromDate: '2026-09-23', toDate: '2026-10-22', generatedAt: '2026-10-22T03:00:00Z', liveSignature: 'one',
  totals: { accounts: 248, newAccounts: 34, activeUsers: 126, previousActiveUsers: 104, pageViews: 3842, proAccounts: 48, paidProAccounts: 42, trialAccounts: 21, freeAccounts: 179, revenue: 132600, previousRevenue: 95400, paymentCount: 4, conversionRate: 42 / 248, averageRevenuePerPayer: 44200 },
  daily: Array.from({ length: 30 }, (_: unknown, i: number) => ({ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, activeUsers: 12 + ((i * 7) % 17), pageViews: 80 + i * 3, revenue: [3, 9, 18, 25].includes(i) ? 15900 + (i === 25 ? 69000 : 0) : 0, payments: [3, 9, 18, 25].includes(i) ? 1 : 0 })),
  features: [
    { key: 'dashboard', activeUsers: 118, pageViews: 1280, freeUsers: 81, proUsers: 37, freeViews: 830, proViews: 450 },
    { key: 'jobs', activeUsers: 96, pageViews: 940, freeUsers: 66, proUsers: 30, freeViews: 610, proViews: 330 },
    { key: 'invoice', activeUsers: 74, pageViews: 721, freeUsers: 58, proUsers: 16, freeViews: 520, proViews: 201 },
    { key: 'plans', activeUsers: 33, pageViews: 91, freeUsers: 33, proUsers: 0, freeViews: 91, proViews: 0 },
  ],
  personas: [
    { key: 'freelance', accounts: 142, activeUsers: 92, proAccounts: 38, revenue: 506600 },
    { key: 'employee', accounts: 58, activeUsers: 22, proAccounts: 7, revenue: 89400 },
    { key: 'university', accounts: 25, activeUsers: 8, proAccounts: 2, revenue: 14900 },
    { key: 'school', accounts: 8, activeUsers: 2, proAccounts: 0, revenue: 0 },
    { key: 'unknown', accounts: 15, activeUsers: 2, proAccounts: 1, revenue: 14900 },
  ],
  accounts, payments,
};

async function open(page: Page) {
  const seen = { ranges: [] as string[], pulses: 0 };
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Owner' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/admin-analytics?*', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('pulse') === '1') { seen.pulses++; return route.fulfill({ json: { signature: 'one', checkedAt: new Date().toISOString() } }); }
    seen.ranges.push(url.searchParams.get('range') || '');
    return route.fulfill({ json: { ...analytics, range: Number(url.searchParams.get('range') || 30) } });
  });
  await page.goto('/adminDashboard/owner');
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดแอดมิน' })).toBeVisible();
  return seen;
}

test('phone dashboard: revenue in the header, cards below it (never under it), period switch', async ({ page }) => {
  const seen = await open(page);
  const header = page.getByRole('region', { name: 'สรุปรายได้' });
  await expect(header).toContainText('รายได้ Pro · 30 วันล่าสุด');
  await expect(header).toContainText('฿1,326');
  await expect(header).toContainText('4 รายการชำระเงิน · +39% จากช่วงก่อน');
  await expect(page.getByText('สด', { exact: true })).toBeVisible();
  // The header keeps room for its box: the period switch and the cards start below it.
  const box = await header.boundingBox();
  const tabs = await page.getByRole('tablist', { name: 'ช่วงเวลา' }).boundingBox();
  expect(tabs!.y).toBeGreaterThanOrEqual(box!.y + box!.height);
  const cards = page.getByRole('region', { name: 'ภาพรวมบัญชี' });
  await expect(cards).toContainText('บัญชีที่สมัครทั้งหมด248ใหม่ 34 ใน 30 วัน');
  await expect(cards).toContainText('สมาชิก Pro48จ่ายเอง 42 · แอดมินให้ 6');
  await page.getByRole('tab', { name: '90 วัน' }).click();
  await expect.poll(() => seen.ranges.at(-1)).toBe('90');
  await expect(page.getByRole('tab', { name: '90 วัน' })).toHaveAttribute('aria-selected', 'true');
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
});

test('phone: latest payments open the payer; the payments page lists all, refunds marked', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'มินตรา ดีไซน์ ฿849' }).click();
  await expect(page.getByRole('dialog', { name: 'มินตรา ดีไซน์' })).toContainText('จำนวนครั้งที่เติม3');
  await page.getByRole('button', { name: 'ปิดหน้าต่าง' }).click();
  await page.getByRole('region', { name: 'สรุปรายได้' }).getByRole('button', { name: 'ดูรายได้และการชำระเงิน' }).click();
  await expect(page.getByRole('heading', { name: 'รายได้', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ร้านตัวอย่าง ฿159 คืนเงินแล้ว$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(ลูกค้าตัวอย่าง|มินตรา ดีไซน์|ร้านตัวอย่าง) ฿/ })).toHaveCount(5);
  await page.getByRole('button', { name: 'กลับไปที่แดชบอร์ด' }).click();
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดแอดมิน' })).toBeVisible();
});

test('phone: accounts search, plan and persona filters, and the detail sheet', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'รายบัญชี', exact: true }).click();
  await expect(page.getByText('พบ 6 บัญชี')).toBeVisible();
  await page.getByRole('tab', { name: 'Pro แบบชำระเงิน' }).click();
  await expect(page.getByText('พบ 2 บัญชี')).toBeVisible();
  await page.getByRole('tab', { name: 'ทุกแพ็กเกจ' }).click();
  await page.getByLabel('ค้นหาบัญชี').fill('studio');
  await expect(page.getByText('พบ 1 บัญชี')).toBeVisible();
  await page.getByLabel('ล้างคำค้น').click();
  await page.getByLabel('กรองตามกลุ่มผู้ใช้').selectOption('employee');
  await expect(page.getByText('พบ 1 บัญชี')).toBeVisible();
  await page.getByRole('button', { name: 'เปิดรายละเอียดบัญชี Than Studio' }).click();
  const sheet = page.getByRole('dialog', { name: 'Than Studio' });
  await expect(sheet).toContainText('กำลังทดลอง');
  await expect(sheet).toContainText('ฟีเจอร์ที่ใช้บ่อย');
  await expect(sheet).toContainText('ยังไม่มีประวัติการชำระเงิน');
});

test('phone: personas open the filtered accounts; feature usage; every admin tool has its page', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'นักศึกษา 25 บัญชี' }).click();
  await expect(page.getByRole('heading', { name: 'รายบัญชี' })).toBeVisible();
  await expect(page.getByLabel('กรองตามกลุ่มผู้ใช้')).toHaveValue('university');
  await page.getByRole('button', { name: 'กลับไปที่แดชบอร์ด' }).click();
  await page.getByRole('button', { name: 'การใช้ฟีเจอร์', exact: true }).click();
  await expect(page.getByRole('region', { name: 'สรุปการใช้ฟีเจอร์' })).toContainText('3,842');
  await expect(page.getByText('โอกาสวางจุดอัปเกรด').first()).toBeVisible();
  for (const [tool, heading] of [['ข้อความจากผู้ใช้', 'ข้อความจากผู้ใช้'], ['จัดการผู้ใช้', 'จัดการผู้ใช้'], ['จัดการทีม', 'จัดการทีม']]) {
    await page.getByRole('button', { name: 'กลับไปที่แดชบอร์ด' }).click();
    await page.getByRole('button', { name: tool, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
});

test('phone: when the figures fail, the error shows and the admin tools still open', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Owner' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ status: 503, json: { error: 'สถิติยังไม่พร้อม' } }));
  await page.goto('/adminDashboard/owner');
  await expect(page.getByRole('alert').filter({ hasText: 'สถิติยังไม่พร้อม' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'สรุปรายได้' })).toContainText('—');
  await expect(page.getByRole('button', { name: 'รายบัญชี', exact: true })).toHaveCount(0); // needs the figures
  await page.getByRole('button', { name: 'จัดการทีม', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'จัดการทีม', exact: true }).first()).toBeVisible();
});
