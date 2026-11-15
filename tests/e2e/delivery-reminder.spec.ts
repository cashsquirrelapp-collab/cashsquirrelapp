import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// แจ้งเตือนวันส่งงาน (owner, 2026-11-15: "แจ้งเตือนเดดไลน์ในการส่งงาน"): its own switch in ตั้งค่า › การแจ้งเตือน, under
// แจ้งเตือนเครดิตเทอม. Until the account sets it, it shows what the payment reminder shows; turning it off saves
// deliveryReminderEnabled: false and leaves the payment reminder alone. Computer and phone, no overlapping text.

test.use({ serviceWorkers: 'block' });

const user = { id: '99999999-9999-4999-8999-999999999999', email: 'deliver@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, size: { width: number; height: number }) {
  const posts: string[] = [];
  await page.clock.setFixedTime(new Date('2026-11-16T10:00:00+07:00'));
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-9999999999', displayName: 'ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { posts.push(route.request().postData() ?? ''); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: {
      snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings, statuses: [], job_types: [], notif_settings: { enabled: true, dailyDigestEnabled: true, alertEmail: '', pendingQueue: [] }, avatar_data_url: null, issuer_profile: null },
      versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' },
    } });
  });
  await page.setViewportSize(size);
  await page.goto('/settings');
  await loadLayoutFonts(page);
  await page.getByRole('region', { name: 'LINE · การแจ้งเตือน' }).getByRole('button', { name: 'การแจ้งเตือน', exact: true }).click();
  return { posts };
}

for (const size of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`${size.name}: แจ้งเตือนวันส่งงาน sits under the payment reminder, follows it until set, and turns off alone`, async ({ page }) => {
    const { posts } = await open(page, size);
    const delivery = page.getByRole('switch', { name: 'แจ้งเตือนวันส่งงาน' });
    const payment = page.getByRole('switch', { name: 'แจ้งเตือนเครดิตเทอม' });
    await expect(delivery).toBeVisible();
    await expect(page.getByText('เตือนงานที่ยังไม่ได้ส่งลูกค้า ก่อนถึงวันส่ง 1–2 วัน วันนี้ และเลยกำหนด', { exact: false })).toBeVisible();
    // Never set: it shows what the payment reminder shows (on here).
    await expect(delivery).toHaveAttribute('aria-checked', 'true');
    await expect(payment).toHaveAttribute('aria-checked', 'true');
    await page.addStyleTag({ content: '.asx-hello-say, .asx-buddy-tip, .asx-brief-tip { display: none !important; }' });
    await page.waitForTimeout(500);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/delivery-reminder-${size.name}.png` });
    await delivery.click();
    await expect(delivery).toHaveAttribute('aria-checked', 'false');
    await expect(payment).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => posts.some(body => body.includes('"deliveryReminderEnabled":false'))).toBe(true);
    expect(posts.some(body => body.includes('"dailyDigestEnabled":false'))).toBe(false);
  });
}
