import { expect, test, type Page } from '@playwright/test';

// Goals page on computers and iPads, "Liquid Amber" (owner, 2026-10-21): the redesign changed only the
// look, so every figure and action must still work: the vault's amount and plan, allocation,
// manual deposit, the ratio editor, opening a goal from the plan or the list, and sorting.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'goals-desktop@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const today = new Date();
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const goal = (id: string, name: string, type: string, target: number, current: number, pct: number, icon: string) =>
  ({ id, name, type, target, current, deadline: '2027-12-31', emoji: '🎯', icon, bg: '#ECFDF5', acc: '#059669', allocatedPercentage: pct, history: [] });
const snapshot = {
  jobs: [{ id: 'j1', name: 'งานตัวอย่าง', client: 'ลูกค้าตัวอย่าง', type: 'Sponsored Post', creditTerm: 0, note: '', value: 18000, received: 18000, pending: 0, status: 'done', paymentStatus: 'paid', isPosted: true, postDate: day(0), payDate: day(0) }],
  expenses: [{ id: 'e1', name: 'ค่าใช้จ่ายตัวอย่าง', category: 'Other', amount: 6899, date: day(0) }],
  goals: [goal('g1', 'ทริปญี่ปุ่น', 'save', 60000, 38500, 40, 'plane'), goal('g2', 'เงินสำรองฉุกเฉิน', 'emergency', 90000, 72000, 35, 'shield'), goal('g3', 'กล้องตัวใหม่', 'buy', 45000, 9000, 25, 'camera')],
  invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};
const versions = { cashflow_jobs: { j1: 1 }, cashflow_expenses: { e1: 1 }, cashflow_goals: { g1: 1, g2: 1, g3: 1 }, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };

async function open(page: Page, width: number, height: number, systemRole: 'admin' | 'user' = 'admin') {
  const saves: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th');
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole, groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { saves.push(route.request().postData() || ''); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.setViewportSize({ width, height });
  await page.goto('/split');
  if (systemRole === 'admin') await expect(page.getByRole('heading', { name: 'เป้าหมาย', exact: true })).toBeVisible();
  return saves;
}

for (const [width, height] of [[1440, 900], [1280, 800], [768, 1024]]) {
  test(`${width}px: the vault shows the money and the plan, and every action still opens what it did`, async ({ page }) => {
    const saves = await open(page, width, height);
    const vault = page.getByRole('region', { name: 'คลังเงินพร้อมจัดสรร' });
    await expect(vault).toBeVisible();
    await expect(vault).toContainText('฿11,101');
    await expect(vault).toContainText('จากเงินรับจริง ฿18,000');
    await expect(vault).toContainText('หักรายจ่าย ฿6,899');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    // The plan: every goal with its share; a row opens that goal.
    for (const [name, pct] of [['ทริปญี่ปุ่น', 40], ['เงินสำรองฉุกเฉิน', 35], ['กล้องตัวใหม่', 25]] as const) {
      await expect(vault.getByRole('button', { name: `${name} สัดส่วน ${pct}%` })).toBeVisible();
    }
    await vault.getByRole('button', { name: 'ทริปญี่ปุ่น สัดส่วน 40%' }).click();
    await expect(page.getByRole('dialog', { name: 'เป้าหมาย' })).toContainText('ทริปญี่ปุ่น');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'เป้าหมาย' })).toHaveCount(0);

    await vault.getByRole('button', { name: 'ฝากเงินเข้าเป้าหมายเอง' }).click();
    await expect(page.getByRole('dialog', { name: 'ฝากเงินเข้าเป้าหมายเอง' })).toBeVisible();
    await page.keyboard.press('Escape');
    await vault.getByRole('button', { name: 'ปรับสัดส่วน' }).click();
    await expect(page.getByRole('dialog', { name: 'ปรับสัดส่วน' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Allocation asks first, then saves the split into the goals.
    await expect(page.getByRole('region', { name: 'สถานะการจัดสรรเดือนนี้' })).toContainText('พร้อมแบ่ง ฿11,101');
    await vault.getByRole('button', { name: 'จัดสรร ฿11,101' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'คุณกำลังจะจัดสรร' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect.poll(() => saves.some(body => body.includes('cashflow_goals')), { timeout: 10_000 }).toBe(true);

    // The list: a row opens its goal; sorting by name reorders.
    const list = page.getByRole('region', { name: 'เป้าหมายของคุณ' });
    await list.getByRole('button', { name: /^เงินสำรองฉุกเฉิน/ }).click();
    await expect(page.getByRole('dialog', { name: 'เป้าหมาย' })).toContainText('เงินสำรองฉุกเฉิน');
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'เรียงเป้าหมาย' }).selectOption('name');
    await expect(list.getByRole('listitem').first()).toContainText('กล้องตัวใหม่');
  });
}

test('1440px: with nothing left this month, the status card says why and allocation is not offered', async ({ page }) => {
  snapshot.expenses[0].amount = 20000;
  try {
    await open(page, 1440, 900);
    const vault = page.getByRole('region', { name: 'คลังเงินพร้อมจัดสรร' });
    await expect(vault).toContainText('฿0');
    await expect(vault.getByRole('button', { name: /^จัดสรร ฿/ })).toHaveCount(0);
    const status = page.getByRole('region', { name: 'สถานะการจัดสรรเดือนนี้' });
    await expect(status).toContainText('เดือนนี้ยังไม่มีเงินเหลือสำหรับจัดสรร');
    await expect(status).toContainText('รายจ่ายสูงกว่าเงินรับจริง ฿2,000');
  } finally { snapshot.expenses[0].amount = 6899; }
});

test('390px phone: the goals page is the phone design as before, and its actions still work', async ({ page }) => {
  await open(page, 390, 844).catch(() => {});
  await expect(page.locator('.ga-vault')).toHaveCount(0); // the computer/iPad design never reaches phones
  await expect(page.getByRole('button', { name: /แบ่งเงินตามสัดส่วน ฿11,101/ })).toBeVisible();
  await page.getByRole('button', { name: /^จัดการ$/ }).click();
  const manage = page.getByRole('dialog', { name: 'จัดการเป้าหมาย' });
  await expect(manage.getByRole('button', { name: /ปรับสัดส่วน/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /แบ่งเงินตามสัดส่วน ฿11,101/ }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'คุณกำลังจะจัดสรร' })).toBeVisible();
});

// Goals are not released yet (owner, 2026-10-21): only accounts with the admin role see them, a Pro
// subscription is not enough, and the page opens for everyone only when the owner launches it.
test('1440px: a regular Pro account sees no goals page and no goals link', async ({ page }) => {
  await open(page, 1440, 900, 'user');
  await expect(page.getByRole('heading', { name: 'ภาพรวม', exact: true })).toBeVisible();
  await expect(page.locator('.ga-vault')).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('button', { name: 'เป้าหมาย', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'เป้าหมาย', exact: true })).toHaveCount(0);
});
