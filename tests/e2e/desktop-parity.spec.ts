import { expect, test, type Page } from '@playwright/test';

// Computer and iPad checks for the owner's rule of 2026-10-21: every phone fix gets its own
// computer/iPad version, designed for the wide layout (sidebar, page header, tables), not copied.
// - receive money from the jobs table in one click, as from the phone's job card;
// - confirm dialogs show the official mascot beside the message;
// - a job opened from the timeline is a centred panel, not a sheet from the bottom;
// - orange buttons read white in dark mode too;
// - the notifications are in the LINE AI Pro section of settings.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'desktop-parity@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const today = new Date();
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const job = (id: string, name: string, value: number, received: number) => ({
  id, name, client: 'ลูกค้าตัวอย่าง', type: 'Sponsored Post', creditTerm: 0, note: '', value, received, pending: value - received,
  status: received >= value ? 'done' : received ? 'partial' : 'pending', paymentStatus: received >= value ? 'paid' : received ? 'partial' : 'unpaid',
  isPosted: true, postDate: day(0), payDate: day(0),
});
const snapshot = {
  jobs: [job('a', 'รีวิวสินค้า', 18_000, 18_000), job('b', 'ถ่ายภาพแคมเปญ', 12_000, 5_000), job('c', 'ออกแบบโลโก้', 9_500, 0)],
  expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};

async function open(page: Page, width: number, height: number, path: string, { dark = false } = {}) {
  await page.addInitScript(([isDark]) => {
    localStorage.setItem('cashflow_language', 'th');
    localStorage.setItem('cashflow_dark_mode', isDark ? 'true' : 'false');
    // The app switches theme on its own at 06:00 and 18:00; mark this half-day as done so it keeps the theme set here.
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('cashsquirrel_calendar_view', 'timeline');
  }, [dark]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : {
    snapshot,
    versions: { cashflow_jobs: { a: 1, b: 1, c: 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } },
    subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' },
  } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

const row = (page: Page, name: string) => page.locator('table tbody tr').filter({ hasText: name });

test('computer: every unpaid job can be paid from its table row, and the client column stays whole', async ({ page }) => {
  await open(page, 1280, 800, '/jobs');
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  // A delivered job takes the full amount; one with a deposit takes the rest; a paid one has no button.
  const full = row(page, 'ออกแบบโลโก้').getByRole('button', { name: 'รับเงิน · ออกแบบโลโก้' });
  await expect(full).toHaveText('รับเงิน');
  await expect(row(page, 'ถ่ายภาพแคมเปญ').getByRole('button', { name: 'รับส่วนที่เหลือ · ถ่ายภาพแคมเปญ' })).toBeVisible();
  await expect(row(page, 'รีวิวสินค้า').getByRole('button', { name: /^รับ/ })).toHaveCount(0);
  const cut = await page.locator('table tbody td').filter({ hasText: /^ลูกค้าตัวอย่าง$/ }).evaluateAll(cells => cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).length);
  expect(cut).toBe(0);

  await full.click();
  const pay = page.getByRole('dialog').filter({ hasText: 'ออกแบบโลโก้' });
  await expect(pay.getByRole('radio', { name: 'รับเงินครบ' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(pay).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'แก้ไขงาน' })).toHaveCount(0); // the button does not open the job
});

for (const [width, height] of [[1024, 768], [768, 1024]]) {
  test(`iPad ${width}px: the receive button keeps its label and the client sits under the job name`, async ({ page }) => {
    await open(page, width, height, '/jobs');
    await expect(page.locator('.ksm-pagehero')).toHaveCount(0); // the computer layout, not the phone one
    await expect(row(page, 'ออกแบบโลโก้').getByRole('button', { name: 'รับเงิน · ออกแบบโลโก้' })).toHaveText('รับเงิน');
    await expect(page.getByRole('columnheader', { name: 'ลูกค้า / ผู้จ่าย' })).toBeHidden();
    await expect(row(page, 'ออกแบบโลโก้').getByText('ลูกค้าตัวอย่าง ·')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}

test('computer: deleting a job asks beside the mascot, centred, and cancelling keeps the job', async ({ page }) => {
  await open(page, 1280, 800, '/jobs');
  await page.getByRole('button', { name: 'ตัวเลือกของงาน ออกแบบโลโก้' }).click();
  await page.getByRole('menuitem', { name: 'ลบงาน' }).click();
  const dialog = page.getByRole('dialog', { name: 'ยืนยันการลบงาน' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ksm-confirm-card')).toHaveCount(0); // not the phone card
  await expect(dialog.locator('svg').first()).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(60);
  expect(box.width).toBeLessThanOrEqual(460);
  await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('table tbody tr')).toHaveCount(3);
});

test('computer: a job opened from the timeline is a centred panel with its actions on the right', async ({ page }) => {
  await open(page, 1280, 800, '/calendar');
  await page.locator('section[aria-label] button').filter({ hasText: 'ถ่ายภาพแคมเปญ' }).first().click();
  const panel = page.getByRole('dialog', { name: 'ถ่ายภาพแคมเปญ' });
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(80); // centred, not at the bottom
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(4);
  await expect(panel.getByText('มูลค่างาน')).toBeVisible();
  await expect(panel.getByText('ค้างรับ')).toBeVisible();
  const edit = (await panel.getByRole('button', { name: 'แก้ไขงาน' }).boundingBox())!;
  const go = (await panel.getByRole('button', { name: /ดูในหน้างาน/ }).boundingBox())!;
  const remove = (await panel.getByRole('button', { name: 'ลบงาน' }).boundingBox())!;
  expect(remove.x).toBeLessThan(edit.x);
  expect(edit.x).toBeLessThan(go.x); // the main action last, on the right
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('computer, dark mode: orange buttons read white', async ({ page }) => {
  await open(page, 1280, 800, '/jobs', { dark: true });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'ตัวเลือกของงาน ออกแบบโลโก้' }).click();
  await page.getByRole('menuitem', { name: 'ลบงาน' }).click();
  const confirm = page.getByRole('dialog', { name: 'ยืนยันการลบงาน' }).getByRole('button', { name: 'ยืนยัน', exact: true });
  await expect(confirm).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(confirm).toHaveCSS('background-color', 'rgb(230, 95, 43)');
});

test('computer: notifications sit with LINE in the Pro section of settings', async ({ page }) => {
  await open(page, 1280, 800, '/settings');
  const pro = page.getByRole('region', { name: 'LINE AI Pro · การแจ้งเตือน' });
  await expect(pro.getByRole('button', { name: /^LINE/ })).toBeVisible();
  await expect(pro.getByRole('button', { name: /^การแจ้งเตือน/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'การใช้งาน' }).getByRole('button', { name: /^การแจ้งเตือน/ })).toHaveCount(0);
});
