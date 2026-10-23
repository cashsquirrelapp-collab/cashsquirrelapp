import { expect, test, type Page } from '@playwright/test';

// Phone checks from the owner's rounds of 2026-10-20:
// - the overview card with large amounts keeps its layout and every figure stays whole, only smaller,
//   from hundreds of thousands to hundreds of millions, on a 390px and a 320px phone;
// - the Pro package page can be reached from the phone menu, as from the desktop sidebar.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'large-amounts@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const today = new Date();
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function snapshot(scale: number) {
  const job = (id: string, name: string, value: number, received: number) => ({
    id, name, client: 'ลูกค้าตัวอย่าง', type: 'Sponsored Post', creditTerm: 0, note: '', value: value * scale, received: received * scale, pending: (value - received) * scale,
    status: received >= value ? 'done' : received ? 'partial' : 'pending', paymentStatus: received >= value ? 'paid' : received ? 'partial' : 'unpaid',
    isPosted: true, postDate: day(0), payDate: day(0),
  });
  return {
    jobs: [job('a', 'รีวิวสินค้า', 18_000, 18_000), job('b', 'ถ่ายภาพแคมเปญ', 12_000, 5_000), job('c', 'ออกแบบโลโก้', 9_500, 0)],
    expenses: [{ id: 'e1', name: 'ค่าอุปกรณ์', category: 'Other', amount: 1_899 * scale, date: day(0) }],
    goals: [], invoices: [],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
    statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
    job_types: ['Sponsored Post'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
  };
}

async function open(page: Page, scale: number, subscription: Record<string, unknown> = { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' }) {
  await page.addInitScript(() => localStorage.setItem('cashflow_language', 'th'));
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
    snapshot: snapshot(scale),
    versions: { cashflow_jobs: { a: 1, b: 1, c: 1 }, cashflow_expenses: { e1: 1 }, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } },
    subscription,
  } }));
  await page.goto('/dashboard/large-amounts');
  await expect(page.locator('[data-metric="work"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Every figure on the card whose text does not fit its box (shown with "…"). */
const cutFigures = (page: Page) => page.locator('.ksm-hero [data-metric]').evaluateAll(nodes =>
  nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));

for (const width of [390, 320]) {
  test(`${width}px phone: same card layout, every digit shown, from hundreds of thousands to hundreds of millions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const sizes: number[] = [];
    for (const scale of [10, 1_000, 10_000]) {
      await open(page, scale);
      // the work value is 39,500 × scale, every digit
      await expect(page.locator('[data-metric="work"]')).toHaveText(`฿${(39_500 * scale).toLocaleString('en-US')}`);
      await expect.poll(() => cutFigures(page)).toEqual([]);
      // the layout never changes: the pill beside the figure, the three figures in one row
      const figure = (await page.locator('.ksm-net').boundingBox())!;
      const pill = (await page.locator('.ksm-trend').boundingBox())!;
      expect(pill.x).toBeGreaterThan(figure.x + figure.width - 1);
      expect(Math.abs((pill.y + pill.height / 2) - (figure.y + figure.height / 2))).toBeLessThan(figure.height / 2);
      const tops = await page.locator('.ksm-hero-metrics > button').evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(1);
      // the three share one size
      const metricSizes = await page.locator('.ksm-hero-metrics b').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).fontSize));
      expect(new Set(metricSizes).size).toBe(1);
      sizes.push(parseFloat(metricSizes[0]));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // the bar it closes into shows the figure whole as well
      await page.evaluate(() => document.getElementById('main-content')!.scrollTo({ top: 400 }));
      await expect.poll(() => cutFigures(page)).toEqual([]);
      await expect.poll(async () => { const box = await page.locator('.ksm-net').boundingBox(); return box ? Math.round(box.x + box.width) : 9999; }).toBeLessThanOrEqual(width);
    }
    // only longer amounts get smaller
    expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
  });
}

test('390px phone: the menu\'s LINE AI Pro section leads to the Pro package page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // a Free account past its trial
  await open(page, 1, { status: 'inactive', plan: null, current_period_end: null });
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'เมนู', exact: true }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  // sections with several rows open in place
  await menu.getByText('LINE AI Pro', { exact: true }).click();
  const plans = menu.getByRole('button', { name: /แพ็กเกจ Pro/ });
  await expect(plans).toContainText('FREE');
  await expect(plans).toContainText('ดูราคาและอัปเกรดเป็น Pro');
  await expect(menu.getByRole('button', { name: /เชื่อมต่อ LINE/ })).toBeVisible();
  // the package page is no longer listed twice: section 05 has no package row of its own
  const account = menu.getByRole('group').filter({ hasText: 'บัญชีและการตั้งค่า' });
  await expect(account.locator('button', { hasText: 'แพ็กเกจ' })).toHaveCount(0);
  await expect(account.locator('button', { hasText: 'ตั้งค่าทั้งหมด' })).toHaveCount(1);
  await plans.click();
  await expect(page).toHaveURL(/\/plans\//);
  await expect(page.locator('.ksm-toolhero').getByRole('heading', { name: 'แพ็กเกจ Pro', exact: true })).toBeVisible();
});

// งาน layered like the overview (owner, 2026-10-20): the bar's terracotta runs on behind the title and
// half of a summary card. Each stage on the card adds up the jobs its tab lists, and tapping it opens that tab.
for (const width of [390, 320]) {
  test(`${width}px phone: งาน has the overview's terracotta header and a summary that follows its tabs`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, 1);
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'งาน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'งานของฉัน' })).toBeVisible();
    await expect(page.locator('header.ksm-header')).toHaveClass(/is-hero/);
    const summary = page.getByRole('group', { name: 'สรุปงาน' });
    // b ฿7,000 and c ฿9,500 still to receive; a ฿18,000 received; nothing in progress, nothing late
    await expect(summary.locator('[data-metric="work"]')).toHaveText('฿16,500');
    await expect(summary.getByRole('button', { name: /^กำลังทำ ฿0 / })).toBeVisible();
    await expect(summary.getByRole('button', { name: /^รอรับเงิน ฿16,500 / })).toBeVisible();
    await expect(summary.getByRole('button', { name: /^ปิดงานแล้ว ฿18,000 / })).toBeVisible();
    await expect(summary).toContainText('ไม่มีงานเลยกำหนด');

    // One layer with the bar: the terracotta starts right under it, and the card sits half on it.
    const bar = (await page.locator('header.ksm-header').boundingBox())!;
    const backdrop = page.locator('.ksm-pagehero .ksm-hero-backdrop');
    const clip = page.locator('.ksm-pagehero .ksm-hero-clip');
    expect(Math.abs((await backdrop.boundingBox())!.y - (bar.y + bar.height))).toBeLessThanOrEqual(1);
    const opened = (await clip.boundingBox())!;
    const backdropBottom = () => backdrop.boundingBox().then(box => box!.y + box!.height);
    expect(await backdropBottom()).toBeGreaterThan(opened.y + 40);
    expect(await backdropBottom()).toBeLessThan(opened.y + opened.height - 40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Scrolling the list closes the card into a bar under the top bar, as on the overview; back at the top it opens again.
    const main = page.locator('#main-content');
    await main.evaluate(el => el.scrollTo(0, 600));
    await expect.poll(async () => Math.round((await clip.boundingBox())!.height)).toBe(64);
    const closed = (await clip.boundingBox())!;
    expect(closed.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(closed.y).toBeLessThan(bar.y + bar.height + 16);
    expect(await backdropBottom()).toBeGreaterThan(closed.y + closed.height);
    await main.evaluate(el => el.scrollTo(0, 0));
    await expect.poll(async () => Math.round((await clip.boundingBox())!.height)).toBe(Math.round(opened.height));

    // A stage opens its tab; tapping it again shows every job.
    const cards = page.locator('.ksm-jobcard');
    await expect(cards).toHaveCount(3);
    // Money in from the card itself: the rest after a deposit (b), the full amount once delivered (c).
    await expect(cards.filter({ hasText: 'ถ่ายภาพแคมเปญ' }).getByRole('button', { name: 'รับส่วนที่เหลือ · ถ่ายภาพแคมเปญ' })).toBeVisible();
    await expect(cards.filter({ hasText: 'รีวิวสินค้า' }).locator('.ksm-receive')).toHaveCount(0);
    await cards.filter({ hasText: 'ออกแบบโลโก้' }).getByRole('button', { name: 'รับเงิน · ออกแบบโลโก้' }).click();
    const pay = page.getByRole('dialog').filter({ hasText: 'ออกแบบโลโก้' });
    await expect(pay.getByRole('radio', { name: 'รับเงินครบ' })).toHaveAttribute('aria-checked', 'true');
    await expect(pay.getByRole('radio', { name: 'รับมัดจำ / บางส่วน' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pay).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'แก้ไขงาน' })).toHaveCount(0); // the button does not open the job
    await summary.getByRole('button', { name: /^รอรับเงิน/ }).click();
    await expect(page.getByRole('tab', { name: /^รอรับ/ })).toHaveAttribute('aria-selected', 'true');
    await expect(summary.getByRole('button', { name: /^รอรับเงิน/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(2);
    await summary.getByRole('button', { name: /^รอรับเงิน/ }).click();
    await expect(page.getByRole('tab', { name: /^ทั้งหมด/ })).toHaveAttribute('aria-selected', 'true');
    await expect(cards).toHaveCount(3);

    // The period pill opens the month choice; the filter note only shows for a search or filters.
    await expect(page.locator('.ksm-filter-note')).toHaveCount(0);
    await summary.getByRole('button', { name: 'ช่วงเวลา: เดือนนี้' }).click();
    await page.getByRole('dialog', { name: 'เลือกช่วงเวลา' }).getByRole('button', { name: 'เดือนทั้งหมด', exact: true }).click();
    await expect(summary.getByRole('button', { name: 'ช่วงเวลา: เดือนทั้งหมด' })).toBeVisible();
    await page.getByRole('textbox', { name: 'ค้นหางาน' }).fill('ออกแบบ');
    await expect(summary.locator('[data-metric="work"]')).toHaveText('฿9,500');
    await expect(page.locator('.ksm-filter-note')).toBeVisible();
  });
}

test('320px phone: งาน summary keeps every digit of hundreds of millions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, 10_000);
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'งาน', exact: true }).click();
  const summary = page.getByRole('group', { name: 'สรุปงาน' });
  await expect(summary.locator('[data-metric="work"]')).toHaveText('฿165,000,000');
  await expect(summary.locator('[data-metric="closed"]')).toHaveText('฿180,000,000');
  await page.evaluate(() => document.fonts.ready);
  const cut = await summary.locator('[data-metric]').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
  expect(cut).toEqual([]);
});

test('iPad width: งาน keeps the computer layout, without the phone header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1); // on a phone first: open() waits for the phone overview's card
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: /^งาน/ }).first()).toBeVisible();
  await expect(page.locator('.ksm-pagehero')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'เพิ่มงาน', exact: true }).first()).toBeVisible();
});

test('390px phone: the bottom bar has ปฏิทิน instead of รอรับ, and เงินรอรับ is in the menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1);
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await expect(nav.getByRole('button', { name: 'รอรับ', exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'ปฏิทิน', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ปฏิทิน', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'ปฏิทิน', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: /เครื่องมือทั้งหมด/ })).toHaveCount(0); // a bottom-bar page, not a tool page
  await nav.getByRole('button', { name: 'เมนู', exact: true }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  await menu.getByRole('textbox').fill('รอรับ');
  await menu.getByRole('button', { name: /^เงินรอรับ/ }).click();
  await expect(page.getByRole('heading', { name: 'เงินรอรับ', exact: true })).toBeVisible();
});

// ปฏิทิน / ไทม์ไลน์ layered like the overview and งาน (owner, 2026-10-20): the same terracotta header with a
// view switch, one small box with the month's money still to receive, and every event as a card with its kind and amount.
for (const width of [390, 320]) {
  test(`${width}px phone: ปฏิทิน and ไทม์ไลน์ share the overview's header, month card and event cards`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, 1);
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'ปฏิทิน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'ปฏิทิน', exact: true })).toBeVisible();
    await expect(page.locator('header.ksm-header')).toHaveClass(/is-hero/);
    // One small box, nothing else on it: b ฿7,000 and c ฿9,500 are due this month, as on the เงินรอรับ page.
    const box = page.locator('.ksm-toolhero .ksm-hero');
    await expect(box.locator('[data-metric]')).toHaveCount(1);
    await expect(box.locator('[data-metric="work"]')).toHaveText('฿16,500');
    expect((await box.boundingBox())!.height).toBeLessThan(130);
    // wholly on the terracotta, which ends a little below it in one piece with the bar (no edge crossing the box)
    const backdrop = page.locator('.ksm-toolhero .ksm-hero-backdrop');
    const bandBottom = async () => { const b = (await backdrop.boundingBox())!; return b.y + b.height; };
    const boxRect = (await box.boundingBox())!;
    expect(await bandBottom()).toBeGreaterThan(boxRect.y + boxRect.height + 8);
    expect(await bandBottom()).toBeLessThan(boxRect.y + boxRect.height + 24);
    // scrolling fades the title and leaves only the box, closed to a bar, pinned under the top bar on the terracotta
    const bar = (await page.locator('header.ksm-header').boundingBox())!;
    await page.locator('#main-content').evaluate(el => el.scrollTo(0, 600));
    const clip = page.locator('.ksm-toolhero .ksm-hero-clip');
    await expect.poll(async () => Math.round((await clip.boundingBox())!.height)).toBe(64);
    await expect.poll(() => page.locator('.ksm-toolhero .ksm-pagehero-lead').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(0);
    const closed = (await clip.boundingBox())!;
    expect(closed.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(closed.y).toBeLessThan(bar.y + bar.height + 16);
    expect(await bandBottom()).toBeGreaterThan(closed.y + closed.height + 8);
    await page.locator('#main-content').evaluate(el => el.scrollTo(0, 0));
    await expect.poll(() => page.locator('.ksm-toolhero .ksm-pagehero-lead').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // today's events in the calendar view, then the timeline through the switch on the header
    await expect(page.locator('.ksm-daylist .ksm-tl-event')).not.toHaveCount(0);
    const views = page.getByRole('group', { name: 'มุมมอง' });
    await views.getByRole('button', { name: 'ไทม์ไลน์', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'ไทม์ไลน์', exact: true })).toBeVisible();
    await expect(views.getByRole('button', { name: 'ไทม์ไลน์', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const today = page.locator('.ksm-tl-day.is-today');
    await expect(today.locator('.ksm-tl-date')).toContainText('วันนี้');
    await expect(today.locator('.ksm-tl-event.is-paid .ksm-tl-amount').first()).toContainText('+฿');
    await expect(today.locator('.ksm-tl-event.is-post').first()).toContainText('ส่งงาน');

    // the month arrows sit under the box again
    await expect(page.locator('.ksm-screen > .ksm-month')).toBeVisible();

    // a timeline card still opens the job's peek card
    await today.locator('.ksm-tl-event').first().click();
    await expect(page.getByRole('button', { name: /แก้ไข/ }).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // the box opens เงินรอรับ
    await box.getByRole('button', { name: /^เงินรอรับ .* ฿16,500 · ดูรายการ$/ }).click();
    await expect(page.getByRole('heading', { name: 'เงินรอรับ', exact: true })).toBeVisible();
  });
}

test('320px phone: the calendar box keeps every digit of hundreds of millions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, 10_000);
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'ปฏิทิน', exact: true }).click();
  const figure = page.locator('.ksm-toolhero .ksm-hero [data-metric="work"]');
  await expect(figure).toHaveText('฿165,000,000');
  await page.evaluate(() => document.fonts.ready);
  expect(await figure.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const box = (await page.locator('.ksm-toolhero .ksm-hero').boundingBox())!;
  const fig = (await figure.boundingBox())!;
  expect(fig.x + fig.width).toBeLessThanOrEqual(box.x + box.width);
});

// เมนู in the same mood (owner, 2026-10-20): the bar's terracotta runs on behind the title and the profile box.
test('390px phone: เมนู has the terracotta header with the profile box on it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1);
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'เมนู', exact: true }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  await expect(menu.getByRole('heading', { name: 'เมนู', exact: true })).toBeVisible();
  await expect(page.locator('header.ksm-header')).toHaveClass(/is-hero/);
  const profile = menu.locator('.ksm-minisum .ksm-account');
  await expect(profile).toContainText('ผู้ใช้ตัวอย่าง');
  await expect(profile.locator('.ksm-plan-pill')).toHaveText('PRO');
  const box = (await menu.locator('.ksm-minisum').boundingBox())!;
  const band = await menu.locator('.ksm-toolhero .ksm-hero-backdrop').evaluate(el => el.getBoundingClientRect().bottom);
  expect(band).toBeGreaterThan(box.y + box.height + 8); // the box sits wholly on the terracotta
  const bar = (await page.locator('header.ksm-header').boundingBox())!;
  const top = await menu.locator('.ksm-toolhero .ksm-hero-backdrop').evaluate(el => el.getBoundingClientRect().top);
  expect(top).toBeLessThanOrEqual(bar.y + bar.height + 1); // no light gap under the bar
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Signed in, the box opens the account sheet (owner, 2026-10-23); its โปรไฟล์ row leads to the profile page.
  await profile.click();
  const sheet = page.getByRole('dialog', { name: 'บัญชีของฉัน' });
  await expect(sheet.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
  await sheet.getByRole('button', { name: 'โปรไฟล์' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(menu).toHaveCount(0);
});

// The menu's sections in their new order, without ปฏิทินและไทม์ไลน์ (on the bottom bar), and every page it
// opens on the same terracotta header with the way back (owner, 2026-10-20).
test('390px phone: the menu is reordered and every page it opens shares the terracotta header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1);
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await nav.getByRole('button', { name: 'เมนู', exact: true }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  const names = await menu.locator('.ksm-groups > .ksm-group').evaluateAll(nodes => nodes.map(node => node.querySelector('b')?.textContent));
  expect(names).toEqual(['เงินรอรับ', 'รายจ่าย', 'เอกสาร', 'LINE AI Pro', 'บัญชีและการตั้งค่า']);
  await expect(menu.getByText('ปฏิทินและไทม์ไลน์')).toHaveCount(0);

  for (const [entry, title] of [['เงินรอรับ', 'เงินรอรับ'], ['รายจ่าย', 'รายจ่าย'], ['เอกสาร', 'เอกสาร']] as const) {
    await nav.getByRole('button', { name: 'เมนู', exact: true }).click();
    await menu.getByRole('button', { name: new RegExp(`^${entry}`) }).first().click();
    const hero = page.locator('.ksm-toolhero');
    await expect(hero.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1); // no second title under it
    await expect(page.locator('header.ksm-header')).toHaveClass(/is-hero/);
    const bar = (await page.locator('header.ksm-header').boundingBox())!;
    expect(Math.abs((await hero.boundingBox())!.y - (bar.y + bar.height))).toBeLessThanOrEqual(1);
    await hero.getByRole('button', { name: 'กลับไปที่เมนู' }).click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('390px phone: every expense row says ประจำ or ทั่วไป, and the header closes into a bar on scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1);
  await page.goto('/incomeExpense');
  const rows = page.locator('.ksm-moneylist > button');
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  for (let i = 0; i < count; i++) await expect(rows.nth(i).locator('.ksm-typepill')).toHaveText(/^(ประจำ|ทั่วไป)$/);
  await expect(page.getByRole('region', { name: /สรุปรายจ่าย/ })).toContainText('รายจ่ายรวม');
  const bar = (await page.locator('header.ksm-header').boundingBox())!;
  const backdrop = page.locator('.ksm-toolhero .ksm-hero-backdrop');
  expect(Math.abs((await backdrop.boundingBox())!.y - (bar.y + bar.height))).toBeLessThanOrEqual(1);
  await page.locator('#main-content').evaluate(el => el.scrollTo(0, 800));
  const clip = page.locator('.ksm-toolhero .ksm-hero-clip');
  await expect.poll(async () => Math.round((await clip.boundingBox())!.height)).toBe(64);
  const b = (await backdrop.boundingBox())!;
  expect(b.y).toBeLessThanOrEqual(bar.y + bar.height); // still joined to the bar, no gap, no cut
  expect(b.y + b.height).toBeGreaterThan((await clip.boundingBox())!.y + 64);
});

// Inside the menu's pages (owner, 2026-10-21): the reminders sit with Pro, a settings page's own title
// is on the terracotta header (one way back, no second title under it), and orange buttons carry white type.
test('390px phone: settings pages use the terracotta header, reminders are in the Pro section, orange buttons read white', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1);
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await nav.getByRole('button', { name: 'เมนู', exact: true }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  await menu.getByText('LINE AI Pro', { exact: true }).click();
  const pro = menu.locator('details[open]');
  await expect(pro.getByRole('button', { name: /^การแจ้งเตือน/ })).toBeVisible();
  await menu.getByText('บัญชีและการตั้งค่า', { exact: true }).click();
  await expect(menu.locator('details[open]').getByRole('button', { name: /^การแจ้งเตือน/ })).toHaveCount(0);

  await page.goto('/settings');
  const hero = page.locator('.ksm-toolhero');
  await expect(hero.getByRole('heading', { name: 'ตั้งค่า', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ข้อมูลส่วนตัว', exact: true }).last().click();
  await expect(hero.getByRole('heading', { name: 'ข้อมูลส่วนตัว', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ข้อมูลส่วนตัว', exact: true })).toHaveCount(1);
  await hero.getByRole('button', { name: 'กลับไปที่ตั้งค่า' }).click();
  await expect(hero.getByRole('heading', { name: 'ตั้งค่า', exact: true })).toBeVisible();
  await hero.getByRole('button', { name: 'กลับไปที่เมนู' }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/incomeExpense');
  const add = page.getByRole('button', { name: 'เพิ่มรายจ่าย', exact: true });
  await expect(add).toBeVisible();
  expect(await add.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
});

// Phones (owner, 2026-10-21): confirming a deletion is a centred card with the mascot holding up a red
// "no" sign, and the LINE AI Pro section wears the LINE logo.
test('390px phone: deleting a job asks in a centred card with the mascot, and LINE AI Pro shows the LINE logo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 1);
  await page.goto('/jobs');
  await page.getByRole('button', { name: /^ตัวเลือกของงาน/ }).first().click();
  await page.getByRole('menuitem', { name: 'ลบงาน' }).click();
  const dialog = page.getByRole('dialog', { name: 'ยืนยันการลบงาน' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ksm-confirm-mascot.is-destructive svg')).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const middle = box.y + box.height / 2;
  expect(Math.abs(middle - 844 / 2)).toBeLessThan(60); // centred, not a bottom sheet
  await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.ksm-jobcard')).toHaveCount(3); // nothing was deleted

  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'เมนู', exact: true }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  await expect(menu.locator('.ksm-group-symbol.is-mark').getByRole('img', { name: 'LINE' })).toBeVisible();
});
