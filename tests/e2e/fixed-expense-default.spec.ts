import { test, expect, type Page } from '@playwright/test';

// Owner, 2026-10-31: "ค่าใช้จ่ายที่ตั้งให้อัตโนมัติทุกบัญชี 12,000 ลบออกเลย ให้เหลือ 0 ... ผู้ใช้อยากเซตเองก็ให้เขาไปเซตเอง".
// Accounts that still carry the old automatic 12,000 (no items of their own) see no fixed cost; a person's own items stay.

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };
const statuses = [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }];
const month = new Date().toISOString().slice(0, 7);
const expenses = [{ id: 'e1', name: 'อุปกรณ์สำนักงาน', amount: 335, category: 'อื่นๆ', date: `${month}-01`, note: '' }];

async function open(page: Page, settings: Record<string, unknown>) {
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot: {
    jobs: [], expenses, goals: [], invoices: [], statuses, job_types: ['Sponsored Post'],
    settings: { monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode: 'light', darkFrom: '18:00', lightFrom: '06:00', asked: true }, ...settings },
    notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
  }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/incomeExpense');
}

test('the old automatic 12,000 is gone from รายจ่าย: no ค่าใช้จ่ายเดิม line, the month only counts what was recorded', async ({ page }) => {
  await open(page, { monthlyExpense: 12000 });
  await expect(page.getByText('อุปกรณ์สำนักงาน').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)')).toHaveCount(0);
  await expect(page.getByText('฿12,000')).toHaveCount(0);
  await expect(page.getByText('฿335').first()).toBeVisible();
});

test('a fixed cost the person set stays', async ({ page }) => {
  await open(page, { monthlyExpense: 12000, fixedExpenseItems: [{ id: 'rent', name: 'ค่าห้อง', amount: 12000 }] });
  await expect(page.getByText('ค่าห้อง').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('฿12,000').first()).toBeVisible();
});
