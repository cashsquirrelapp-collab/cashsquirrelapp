import { expect, test, type Page } from '@playwright/test';

// Computer and iPad checks for the owner's rule of 2026-10-21: every phone fix gets its own
// computer/iPad version, designed for the wide layout (sidebar, page header, tables), not copied.
// - receive money from the jobs table through its การชำระ column or ⋯ menu (2026-10-28: no separate button);
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

test('computer: the การชำระ column takes the money (no separate receive button), and the client column stays whole', async ({ page }) => {
  await open(page, 1280, 800, '/jobs');
  await expect(page.locator('table tbody tr')).toHaveCount(3);
  // Owner, 2026-10-28: the receive button repeated the การชำระ column's menu, so it is gone where that column shows.
  await expect(page.locator('table tbody').getByRole('button', { name: /^รับ/ })).toHaveCount(0);
  const cut = await page.locator('table tbody td').filter({ hasText: /^ลูกค้าตัวอย่าง$/ }).evaluateAll(cells => cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).length);
  expect(cut).toBe(0);

  await row(page, 'ออกแบบโลโก้').getByRole('button', { name: 'เปลี่ยนการชำระของงาน ออกแบบโลโก้' }).click();
  await page.getByRole('menuitem', { name: 'รับเงินครบ' }).click();
  const pay = page.getByRole('dialog').filter({ hasText: 'ออกแบบโลโก้' });
  await expect(pay.getByRole('radio', { name: 'รับเงินครบ' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(pay).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'แก้ไขงาน' })).toHaveCount(0); // the menu does not open the job
});

for (const [width, height] of [[1024, 768], [768, 1024]]) {
  test(`iPad ${width}px: no receive button, the ⋯ menu takes the money, and the client sits under the job name`, async ({ page }) => {
    await open(page, width, height, '/jobs');
    await expect(page.locator('.ksm-pagehero')).toHaveCount(0); // the computer layout, not the phone one
    // Owner, 2026-10-28: only phones keep the receive button.
    await expect(page.locator('table tbody').getByRole('button', { name: /^รับ/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'ตัวเลือกของงาน ออกแบบโลโก้' }).click();
    await expect(page.getByRole('menuitem', { name: 'รับเงินครบ' })).toBeVisible();
    await page.keyboard.press('Escape');
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

// Owner, 2026-10-26: beside the rounded glass sidebar the page is a rounded card too, not a flat area with a straight
// edge. Dialogs still dim the whole screen, the sidebar included, and phones keep the full page.
test('computer: the page is a rounded card under the layered sidebar, and a dialog still covers the whole screen', async ({ page }) => {
  await open(page, 1280, 800, '/jobs');
  const card = page.locator('.asx-panel-host');
  const look = await card.evaluate(el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { radius: s.borderTopLeftRadius, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom }; });
  expect(look).toEqual({ radius: '28px', top: 12, right: 12, bottom: 12 });
  // Owner, 2026-10-27: the card runs on under the sidebar, which is layered on it 8px inside the rim.
  const sidebar = await page.locator('.app-sidebar').boundingBox();
  const box = await card.boundingBox();
  expect(Math.round(box!.x)).toBe(12);
  expect(Math.round(sidebar!.x - box!.x)).toBe(8);

  await page.getByRole('button', { name: 'เพิ่มงาน' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'เพิ่มงาน' });
  await expect(dialog).toBeVisible();
  const dim = await dialog.evaluate(el => { let node: HTMLElement | null = el as HTMLElement; while (node && !(node.classList.contains('fixed') && node.classList.contains('inset-0'))) node = node.parentElement; const r = node?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });
  expect(dim).toEqual({ x: 0, y: 0, w: 1280, h: 800 });
  // The sidebar is a layer above the page card, but never above a dialog's dim.
  const onSidebar = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('.app-sidebar')), [sidebar!.x + 40, sidebar!.y + 200]);
  expect(onSidebar).toBe(false);
});

test('phone: the page keeps its full-screen layout, no card', async ({ page }) => {
  await open(page, 390, 844, '/');
  const look = await page.locator('.asx-panel-host').evaluate(el => { const s = getComputedStyle(el); return { radius: s.borderTopLeftRadius, margin: s.marginTop }; });
  expect(look).toEqual({ radius: '0px', margin: '0px' });
});

// Owner, 2026-10-28: "ส่งงานวันไหน" read as a payment question. On computers the payment section asks
// "รับเงินวันไหน?" with its own calendar; the delivery date moves under รายละเอียดเพิ่มเติม. Phones are unchanged.
test('computer: the job form asks when the money comes in, and saves the date picked', async ({ page }) => {
  await open(page, 1280, 800, '/jobs');
  const sent: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/data')) sent.push(request.postData() ?? ''); });
  await row(page, 'ออกแบบโลโก้').click();
  const edit = page.getByRole('button', { name: 'แก้ไขงาน' }).first();
  if (await edit.isVisible().catch(() => false)) await edit.click();
  const drawer = page.getByRole('dialog', { name: 'แก้ไขงาน' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('ส่งงานวันไหน?')).toHaveCount(0);
  await expect(drawer.locator('#job-form-postDate')).toHaveCount(0); // delivered work: no delivery calendar on computers
  const due = drawer.getByLabel('รับเงินวันไหน?');
  await expect(due).toHaveValue(day(0));
  await drawer.getByRole('button', { name: '30', exact: true }).click();
  await expect(due).toHaveValue(day(30));
  await due.fill(day(10));
  await expect(drawer.getByText(/คาดว่าจะได้รับเงิน/)).toBeVisible();
  await drawer.getByRole('button', { name: 'รายละเอียดเพิ่มเติม' }).click();
  await expect(drawer.locator('#job-form-postDate')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect(drawer).toHaveCount(0);
  await expect.poll(() => sent.join('')).toContain(`"payDate":"${day(10)}"`);
  const saved = JSON.parse(sent.find(body => body.includes(`"payDate":"${day(10)}"`))!).changes.find((change: { table: string }) => change.table === 'cashflow_jobs').data;
  expect({ payDate: saved.payDate, creditTerm: saved.creditTerm, postDate: saved.postDate }).toEqual({ payDate: day(10), creditTerm: 10, postDate: day(0) });
});

// Owner, 2026-10-30: "ติ๊กกำลังทำ จะมีปฏิทินขึ้นมาให้เลือกว่าจะส่งวันไหน ย้ายมาไว้ด้านบน ถ้าติ๊กว่าส่งแล้วไม่ต้องขึ้นปฏิทิน".
test('computer: กำลังทำ shows the delivery calendar right under the choice; ส่งงานแล้ว hides it and counts as today', async ({ page }) => {
  await open(page, 1280, 800, '/jobs');
  const sent: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/data')) sent.push(request.postData() ?? ''); });
  await page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).first().click();
  const drawer = page.getByRole('dialog', { name: 'เพิ่มงาน' });
  await expect(drawer).toBeVisible();
  const status = drawer.getByRole('region', { name: 'สถานะงาน' }).or(drawer.locator('section[aria-label="สถานะงาน"]')).first();
  await expect(status.getByRole('radio', { name: /กำลังทำ/ })).toHaveAttribute('aria-checked', 'true');
  const field = status.locator('#job-form-postDate');
  await expect(field).toBeVisible();
  await expect(field).toContainText('วันที่จะส่งงาน');
  // right under the choice: above the payment section
  const [fieldTop, paymentTop] = await Promise.all([field.boundingBox(), drawer.locator('section[aria-label="การรับเงิน"]').boundingBox()]);
  expect(fieldTop!.y).toBeLessThan(paymentTop!.y);
  await drawer.getByLabel(/^วันที่จะส่งงาน/).fill(day(5));
  await status.getByRole('radio', { name: /ส่งงานแล้ว/ }).click();
  await expect(drawer.locator('#job-form-postDate')).toHaveCount(0);
  await status.getByRole('radio', { name: /กำลังทำ/ }).click();
  await expect(drawer.getByLabel(/^วันที่จะส่งงาน/)).toHaveValue(day(5)); // the planned date comes back
  await status.getByRole('radio', { name: /ส่งงานแล้ว/ }).click();
  await drawer.getByLabel(/ชื่องาน/).first().fill('ทดสอบส่งแล้ว');
  await drawer.getByLabel(/มูลค่างาน/).first().fill('3000');
  await drawer.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect(drawer).toHaveCount(0);
  await expect.poll(() => sent.join('')).toContain('ทดสอบส่งแล้ว');
  const saved = JSON.parse(sent.find(body => body.includes('ทดสอบส่งแล้ว'))!).changes.find((change: { table: string }) => change.table === 'cashflow_jobs').data;
  expect({ isPosted: saved.isPosted, postDate: saved.postDate }).toEqual({ isPosted: true, postDate: day(0) });
});

test('phone: the job sheet still asks the delivery date in its status tab', async ({ page }) => {
  await open(page, 390, 844, '/jobs');
  await page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'เพิ่มงาน' });
  await sheet.locator('summary').click();
  await sheet.getByRole('radio', { name: /ส่งงานแล้ว/ }).click();
  await expect(sheet.getByText('ส่งงานวันไหน?')).toBeVisible();
  await sheet.getByRole('tab', { name: 'สถานะรับเงิน' }).click();
  await expect(sheet.getByText('รับเงินวันไหน?')).toHaveCount(0);
  await expect(sheet.getByText('ระยะเวลารับเงิน', { exact: true })).toBeVisible();
});
