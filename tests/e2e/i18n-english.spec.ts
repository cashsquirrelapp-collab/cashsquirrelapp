import { expect, test, type Page } from '@playwright/test';

// English mode shows no Thai (owner, 2026-10-22: "อย่าให้มันหลุดภาษาไทยออกมา"). Every page and the main
// forms are opened in English on a computer and a phone with English sample data, and the visible
// text must have no Thai letters. Text that is Thai on purpose is listed in ALLOWED.

test.use({ serviceWorkers: 'block' });

// Thai letters, vowels, tone marks and digits; the baht sign (U+0E3F) is in the same block and is fine.
const THAI = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;
// Thai on purpose in English mode: the language switch names Thai in Thai, and the bilingual A4
// title keeps the Thai document name that Thai tax documents need beside the English one.
const ALLOWED = [/^ไทย$/, /^ใบเสนอราคา$|^ใบแจ้งหนี้$|^ใบเสร็จรับเงิน$|^ใบกำกับภาษี$|^ใบเสร็จรับเงิน\/ใบกำกับภาษี$/];

const user = { id: '33333333-3333-4333-8333-333333333333', email: 'english-mode@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const today = new Date();
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const job = (id: string, name: string, value: number, received: number, extra: Record<string, unknown> = {}) => ({
  id, name, client: 'Example Studio', type: 'Sponsored Post', creditTerm: 30, note: '', value, received, pending: value - received,
  status: received >= value ? 'done' : received ? 'partial' : 'pending', paymentStatus: received >= value ? 'paid' : received ? 'partial' : 'unpaid',
  isPosted: true, postDate: day(-20), payDate: day(10), whtRate: 3, whtAmount: Math.round(value * 0.03), ...extra,
});
// Saved data as the app saves it: default statuses and categories stay Thai and must show in English.
const snapshot = {
  jobs: [
    job('a', 'Product review', 18_000, 18_000, { paidAt: day(-2) }),
    job('b', 'Campaign photos', 12_000, 5_000, { payDate: day(-3) }),
    job('c', 'Logo design', 9_500, 0, { isPosted: false, postDate: day(5) }),
    job('d', 'Video edit', 30_000, 10_000, {
      status: 'installment', installments: [
        { id: 'i1', label: 'งวดที่ 1', amount: 10_000, dueDate: day(-10), paidAt: day(-10), status: 'paid' },
        { id: 'i2', label: 'งวดที่ 2', amount: 19_100, dueDate: day(12), paidAt: null, status: 'pending' },
      ],
    }),
  ],
  expenses: [
    { id: 'e1', name: 'Editing software', amount: 1_200, date: day(-1), category: 'ค่าอุปกรณ์/ซอฟต์แวร์', note: '' },
    { id: 'e2', name: 'Taxi', amount: 300, date: day(-4), category: 'ค่าเดินทาง/น้ำมัน', note: '' },
  ],
  goals: [{ id: 'g1', name: 'New camera', target: 50_000, current: 12_000, allocatedPercentage: 30, type: 'buy', history: [{ id: 'h1', amount: 2_000, date: day(-2), reason: 'จัดสรรกำไรสุทธิประจำเดือน' }] }],
  invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 60_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', fixedExpenseItems: [{ id: 'f1', name: 'Studio rent', amount: 5_000 }] },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'installment', label: 'แบ่งชำระเป็นงวด', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post', 'Video Production'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null,
  issuer_profile: { name: 'Example Studio', address: '1 Example Road, Bangkok 10110', taxId: '0105555555555', phone: '02-000-0000', email: 'hello@example.com', bankName: 'ธนาคารกสิกรไทย', bankAccount: '123-4-56789-0', bankAccountName: 'Example Studio' },
};

async function open(page: Page, width: number, height: number, path: string) {
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'en');
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-3333333333', displayName: 'Alex Example' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/billing*', route => route.fulfill({ json: { plans: [], subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : {
    snapshot,
    versions: { cashflow_jobs: { a: 1, b: 1, c: 1, d: 1 }, cashflow_expenses: { e1: 1, e2: 1 }, cashflow_goals: { g1: 1 }, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1, issuer_profile: 1 } },
    subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' },
  } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Visible lines with Thai letters, minus the allowed ones. */
async function thaiLines(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  const labels = await page.evaluate(() => [...document.querySelectorAll('[aria-label],[placeholder],[title]')]
    .filter(el => (el as HTMLElement).offsetParent !== null || el === document.activeElement)
    .flatMap(el => ['aria-label', 'placeholder', 'title'].map(name => el.getAttribute(name) || '')));
  return [...new Set([...text.split('\n'), ...labels].map(line => line.trim()).filter(line => line && THAI.test(line)))]
    .filter(line => !ALLOWED.some(rule => rule.test(line)));
}

const PAGES = ['/dashboard', '/jobs', '/receivables', '/incomeExpense', '/calendar?view=calendar', '/calendar?view=timeline', '/invoice?type=invoice', '/invoice?type=quotation', '/report', '/tax', '/wht50', '/vault', '/split', '/settings', '/plans', '/feedback'];

for (const [label, width, height] of [['computer', 1280, 900], ['phone', 390, 844]] as const) {
  for (const path of PAGES) {
    test(`English ${label}: ${path} shows no Thai`, async ({ page }) => {
      await open(page, width, height, path);
      const found = await thaiLines(page);
      expect(found, `Thai text on ${path}`).toEqual([]);
    });
  }
}

test('English computer: the job form, expense form and new document show no Thai', async ({ page }) => {
  await open(page, 1280, 900, '/jobs?openAddJob=1');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await thaiLines(page), 'job form').toEqual([]);
  await open(page, 1280, 900, '/incomeExpense?openAddExpense=1');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await thaiLines(page), 'expense form').toEqual([]);
});

/** Clicks each control matching the name, collects Thai after each one, and closes what opened. */
async function sweep(page: Page, where: string, names: RegExp[], found: Set<string>) {
  for (const name of names) {
    const control = page.getByRole('button', { name }).or(page.getByRole('tab', { name })).or(page.getByRole('link', { name })).first();
    if (!(await control.isVisible().catch(() => false))) continue;
    // A control under an open sheet cannot be clicked; move on instead of waiting for the test to time out.
    await control.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    for (const line of await thaiLines(page)) found.add(`${where} > ${name.source}: ${line}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(120);
  }
}

test('English computer: drawers, menus and dialogs show no Thai', async ({ page }) => {
  test.setTimeout(120_000);
  const found = new Set<string>();
  await open(page, 1280, 900, '/jobs');
  await page.locator('table tbody tr').first().click().catch(() => {});
  await page.waitForTimeout(300);
  for (const line of await thaiLines(page)) found.add(`jobs > edit drawer: ${line}`);
  await page.keyboard.press('Escape');
  await sweep(page, 'jobs', [/^Filter/, /^Sort/, /^Export/, /More options/, /^Receive payment/, /^Receive the rest/], found);
  await open(page, 1280, 900, '/invoice?type=invoice');
  await sweep(page, 'documents', [/New document/, /^Issue/], found);
  await open(page, 1280, 900, '/dashboard');
  await sweep(page, 'overview', [/see breakdown/i, /What is/], found);
  await open(page, 1280, 900, '/settings');
  await sweep(page, 'settings', [/Business profile/, /LINE/, /Notifications/, /Back up/, /Display/, /Account/, /Language/, /Fixed expenses/, /Financial goals/], found);
  await open(page, 1280, 900, '/split');
  await sweep(page, 'goals', [/Create goal/, /Add money/, /Adjust shares/, /Withdraw/, /Edit goal/], found);
  await open(page, 1280, 900, '/incomeExpense');
  await sweep(page, 'expenses', [/Add expense/, /Export/, /Manage recurring/], found);
  await open(page, 1280, 900, '/tax');
  await sweep(page, 'tax', [/^Expenses$/, /^Allowances$/, /^Tax estimate$/, /Next/], found);
  await open(page, 1280, 900, '/calendar?view=calendar');
  await sweep(page, 'calendar', [/Timeline/, /Product review/, /Campaign photos/], found);
  expect([...found]).toEqual([]);
});

test('English phone: the tools menu, quick actions and sheets show no Thai', async ({ page }) => {
  test.setTimeout(120_000);
  const found = new Set<string>();
  await open(page, 390, 844, '/dashboard');
  await sweep(page, 'phone overview', [/^Menu$/, /^More$/, /Quick payment/, /Add income/, /Add expense/], found);
  await open(page, 390, 844, '/jobs');
  await sweep(page, 'phone jobs', [/Filter/, /Add job/, /Logo design/, /Campaign photos/], found);
  await open(page, 390, 844, '/settings');
  await sweep(page, 'phone settings', [/Business profile/, /LINE/, /Notifications/, /Display/, /Account/], found);
  expect([...found]).toEqual([]);
});

test('English: the sign-in page and the landing page show no Thai', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cashflow_language', 'en'));
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/auth*', route => route.fulfill({ status: 401, json: { error: 'กรุณาเข้าสู่ระบบ' } }));
  for (const path of ['/', '/login']) {
    await page.goto(path);
    await page.waitForTimeout(500);
    expect(await thaiLines(page), `Thai text on ${path}`).toEqual([]);
  }
});

test('English: the privacy and terms pages follow the app language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cashflow_language', 'en'));
  // Production serves these at /privacy and /terms; the local test server needs the file names.
  for (const path of ['/privacy.html', '/terms.html']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await thaiLines(page), `Thai text on ${path}`).toEqual([]);
  }
});
