import { test, expect, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// KRAROK — Fullscreen Holographic Credit Radar (owner's brief, 2026-10-30): computers only. The once-a-day overdue check
// opens it over the whole window; iPads keep the report dialog (overdue-report.spec.ts) and phones their alert.

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };
const statuses = [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }];

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const owed = (id: string, name: string, client: string, pending: number, late: number) => ({
  id, name, client, value: pending, received: 0, pending, type: 'Sponsored Post', status: 'pending', paymentStatus: 'unpaid', creditTerm: 30, note: '',
  isPosted: true, postDate: daysAgo(late + 30), payDate: daysAgo(late), dueDate: daysAgo(late),
});
const paid = (id: string, name: string, client: string, amount: number, daysBack: number) => ({
  id, name, client, value: amount, received: amount, pending: 0, type: 'Sponsored Post', status: 'done', paymentStatus: 'paid', creditTerm: 30, note: '',
  isPosted: true, postDate: daysAgo(daysBack + 25), payDate: daysAgo(daysBack),
});
const sixLate = [
  owed('j1', 'รีวิวสกินแคร์ 3 คลิป', 'บริษัท ผิวใส จำกัด', 45000, 52),
  owed('j2', 'ไลฟ์ขายของ 2 ชั่วโมง', 'ร้านเสื้อผ้า Mint', 18500, 21),
  owed('j3', 'ถ่ายภาพสินค้า', 'Brew Days', 9200, 12),
  owed('j4', 'โพสต์ IG 1 โพสต์', 'Glow Lab', 6000, 5),
  owed('j5', 'คลิป TikTok', 'IzaBelle', 12500, 1),
  owed('j6', 'ออกแบบโลโก้', 'สตูดิโอเล็ก', 3500, 3),
];
const mixed = [
  owed('m1', 'รีวิวสกินแคร์ 3 คลิป', 'บริษัท ผิวใส จำกัด', 45000, 52),
  owed('m2', 'คลิป TikTok', 'IzaBelle', 12500, 2),
  owed('m3', 'ออกแบบเมนู', 'ร้านกาแฟ Good Day', 18500, -3),
  paid('m4', 'งานถ่ายภาพสินค้า', 'คุณเบย์', 8600, 2),
  owed('m5', 'โฆษณา IG & Reels', 'Give Lab', 6000, -20),
];

async function open(page: Page, list: unknown[], mode: 'light' | 'dark' = 'light', path = '/', expectRadar = true) {
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  const snapshot = {
    jobs: list, expenses: [], goals: [], invoices: [], statuses, job_types: ['Sponsored Post'],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode, darkFrom: '18:00', lightFrom: '06:00', asked: true } },
    notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
    avatar_data_url: null, issuer_profile: null,
  };
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.goto(path);
  const radar = page.getByTestId('credit-radar');
  if (expectRadar) await expect(radar).toBeVisible({ timeout: 10_000 });
  return radar;
}

/** Cards inside the window, apart from each other; each line ends at its card's inner edge. */
async function layoutCheck(page: Page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="radar-card"]')].map(el => ({ el, r: el.getBoundingClientRect() }));
    const stage = document.querySelector('.cr-stage')!.getBoundingClientRect();
    const problems: string[] = [];
    for (const { r } of cards) if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) problems.push(`off screen ${JSON.stringify(r)}`);
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i].r, b = cards[j].r;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) problems.push(`overlap ${i}/${j}`);
    }
    const ends = [...document.querySelectorAll('.crl-line')].map(g => {
      const d = g.querySelector('path')!.getAttribute('d')!.trim().split(/[ ,]+/);
      return { id: g.getAttribute('data-line'), x: +d[d.length - 2] + stage.left, y: +d[d.length - 1] + stage.top };
    });
    return { problems, cards: cards.length, lines: ends.length, scrollX: document.documentElement.scrollWidth > innerWidth, ends, slots: [...document.querySelectorAll<HTMLElement>('.cr-slot')].map(el => el.getBoundingClientRect().toJSON()) };
  });
}

const endsAtCards = (layout: Awaited<ReturnType<typeof layoutCheck>>) => layout.ends.every(end => layout.slots.some(slot =>
  (Math.abs(end.y - (slot.top + slot.height / 2)) < 2 && (Math.abs(end.x - slot.right) < 2 || Math.abs(end.x - slot.left) < 2))
  || (Math.abs(end.y - slot.top) < 2 && Math.abs(end.x - (slot.left + slot.width / 2)) < 2)));

test('computers: the overdue check opens the fullscreen radar with real figures, the squirrel and a card per job', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, [...sixLate, owed('j7', 'งานใกล้ครบกำหนด', 'ลูกค้าใหม่', 7000, -5), paid('j8', 'งานรับเงินแล้ว', 'คุณเบย์', 8600, 2)]);
  await expect(page.getByTestId('overdue-report')).toHaveCount(0);
  const box = await radar.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
  // The squirrel (the app's own Mascot, headset, typing) with a blue screen in front of it, typing the real jobs; no laptop.
  await expect(radar.locator('.crh-mascot svg')).toBeVisible();
  await expect(radar.locator('img[src*="mascot-v6-working"]')).toHaveCount(0);
  await expect(radar.locator('.crh-console .crv')).toContainText('กำลังตรวจเครดิตเทอม');
  await expect(radar.locator('.cr-eyebrow')).toHaveCount(0);
  await expect(radar.locator('.crv')).toContainText('เกินกำหนด 6');
  await expect(radar.locator('.crv-line').first()).toContainText('บริษัท ผิวใส จำกัด');
  await expect(radar.getByRole('heading', { name: 'ต้องติดตาม 7 รายการ' })).toBeVisible();
  // The figures: everything owed (never what came in), how many to follow up, overdue, due soon.
  await expect(radar.getByTestId('radar-outstanding')).toHaveText('฿101,700', { timeout: 4000 });
  await expect(radar.getByTestId('radar-followup')).toHaveText('7 รายการ');
  await expect(radar.getByTestId('radar-overdue')).toHaveText('฿94,700');
  await expect(radar.getByTestId('radar-soon')).toHaveText('฿7,000');
  // Overdue first: six red cards fill both sides at this height.
  const cards = radar.getByTestId('radar-card');
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toHaveAttribute('data-status', 'overdue');
  await expect(cards.first()).toContainText('บริษัท ผิวใส จำกัด');
  await expect(cards.first()).toContainText('เลย 52 วัน');
  await expect(radar.getByTestId('radar-show-all')).toHaveText('ดูทั้งหมด 8 รายการ');
  await page.waitForTimeout(2200);
  const layout = await layoutCheck(page);
  expect(layout.problems).toEqual([]);
  expect(layout.scrollX).toBe(false);
  expect(layout.lines).toBe(6);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('credit-radar-1440.png') });
});

// Owner, 2026-10-30: one status at a time — "เกินกำหนด 9 รายการ ก็ขึ้นแค่ 9 รายการที่เกินกำหนด" — picked by the tabs; no
// status circles around the squirrel.
test('statuses: the tabs show one status at a time, its cards and lines only (red, amber, green, neutral)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, mixed);
  const cards = radar.getByTestId('radar-card');
  await expect(radar.locator('.crh-chip')).toHaveCount(0);
  // Overdue first: only the two overdue jobs, each with its line.
  await expect(radar.getByTestId('radar-tab-overdue')).toHaveAttribute('aria-selected', 'true');
  await expect(radar.getByTestId('radar-tab-overdue')).toContainText('2');
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll(list => list.map(el => el.getAttribute('data-status')))).toEqual(['overdue', 'overdue']);
  await page.waitForTimeout(1800);
  expect((await layoutCheck(page)).lines).toBe(2);
  const showStatus = async (key: string, client: string, text: string) => {
    await radar.getByTestId(`radar-tab-${key}`).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('data-status', key);
    await expect(cards.first()).toContainText(client);
    await expect(cards.first()).toContainText(text);
    await expect(radar.locator('.crv-line').first()).toContainText(client);
  };
  await showStatus('soon', 'ร้านกาแฟ Good Day', 'อีก 3 วัน');
  await showStatus('received', 'คุณเบย์', 'รับเงินแล้ว');
  await showStatus('later', 'Give Lab', 'อีก 20 วัน');
  await radar.getByTestId('radar-tab-overdue').click();
  await expect(cards).toHaveCount(2);
  // What came in is not owed.
  await expect(radar.getByTestId('radar-outstanding')).toHaveText('฿82,000', { timeout: 4000 });
  await page.waitForTimeout(2200);
  const check = async () => {
    const layout = await layoutCheck(page);
    expect(layout.problems).toEqual([]);
    // Each line's end sits on the inner edge of a card's slot.
    for (const end of layout.ends) {
      const hit = layout.slots.some(slot => Math.abs(end.y - (slot.top + slot.height / 2)) < 2 && (Math.abs(end.x - slot.right) < 2 || Math.abs(end.x - slot.left) < 2));
      expect(hit, `line ${end.id} ends at its card`).toBe(true);
    }
  };
  await check();
  // The window changes size: the lines follow the cards.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  await check();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('credit-radar-mixed.png') });
});

test('hover lights the card\'s line and steps the rest back; a click blinks the card and shows the job blinking on the jobs page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, mixed);
  await page.waitForTimeout(2000);
  const card = radar.getByTestId('radar-card').filter({ hasText: 'IzaBelle' });
  // The cards float; the pointer is placed without waiting for one to hold still (it stops once the pointer is on it).
  await card.hover({ force: true });
  await expect(radar.locator('.crl-line[data-line="m2"]')).toHaveClass(/is-active/);
  await expect(radar.locator('.crl-line[data-line="m1"]')).toHaveClass(/is-dim/);
  await expect(radar.getByTestId('radar-card').filter({ hasText: 'บริษัท ผิวใส จำกัด' })).toHaveClass(/is-dim/);
  await card.click();
  // The card blinks, then the job shows on the jobs page, blinking slowly (owner, 2026-10-30).
  await expect(radar.getByTestId('radar-card').filter({ hasText: 'IzaBelle' })).toHaveClass(/is-flash/);
  await expect(radar).toHaveCount(0, { timeout: 3000 });
  await expect(page).toHaveURL(/\/jobs/);
  await expect(page.locator('[data-job-id="m2"].job-spotlight').first()).toBeVisible({ timeout: 5000 });
});

test('Esc closes back to the page underneath; the close button too', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, mixed);
  await expect(page.getByTestId('radar-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(radar).toBeHidden();
  await expect(page.locator('#dashboard-top')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('many jobs: the cards that fit, and the full list grouped; Esc closes the list first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const many = Array.from({ length: 24 }, (_, i) => owed(`k${i}`, `งานที่ ${i + 1}`, `ลูกค้า ${i + 1}`, 1000 + i * 250, 2 + i));
  const radar = await open(page, many);
  const cards = radar.getByTestId('radar-card');
  await page.waitForTimeout(2000);
  const shown = await cards.count();
  expect(shown).toBeGreaterThanOrEqual(2);
  expect(shown).toBeLessThan(24);
  expect((await layoutCheck(page)).problems).toEqual([]);
  // The pages turn: the next cards are the next overdue jobs, then back.
  const pager = radar.getByTestId('radar-pager');
  await expect(pager).toContainText(`1–${shown} จาก 24`);
  const firstOnPage = await cards.first().textContent();
  await pager.getByRole('button', { name: 'หน้าถัดไป' }).click();
  await expect(pager).toContainText(`${shown + 1}–${shown * 2} จาก 24`);
  await expect(cards.first()).not.toHaveText(firstOnPage || '');
  await page.waitForTimeout(1200);
  // Page two: its own cards only, inside the window, apart, and every line at its card.
  const second = await layoutCheck(page);
  expect(second.problems).toEqual([]);
  expect(second.cards).toBe(shown);
  expect(endsAtCards(second)).toBe(true);
  await pager.getByRole('button', { name: 'หน้าก่อน' }).click();
  await expect(pager).toContainText(`1–${shown} จาก 24`);
  await radar.getByTestId('radar-show-all').click();
  const list = radar.getByTestId('radar-all');
  await expect(list).toBeVisible();
  await expect(list.locator('.cra-row')).toHaveCount(24);
  await expect(list).toContainText('24 รายการ');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(radar).toBeVisible();
  await page.keyboard.press('Escape');
  // Gone from the page, not just faded: nothing invisible is left over it.
  await expect(radar).toHaveCount(0, { timeout: 2000 });
  await page.locator('#dashboard-top').click({ trial: true });
});

test('one job: one card, nothing overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const radar = await open(page, [owed('o1', 'ออกแบบโลโก้', 'สตูดิโอเล็ก', 3500, 3)]);
  await expect(radar.getByTestId('radar-card')).toHaveCount(1);
  await page.waitForTimeout(2000);
  expect((await layoutCheck(page)).problems).toEqual([]);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('reduced motion: everything still, no running lights', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, mixed);
  await expect(radar).toHaveClass(/is-still/);
  await expect(radar.locator('.crl-dot')).toHaveCount(0);
  await expect(radar.getByTestId('radar-outstanding')).toHaveText('฿82,000');
});

async function openTouch(page: Page, width: number, height: number, list: unknown[] = sixLate) {
  await page.setViewportSize({ width, height });
  return open(page, list);
}
test.describe('iPads get the same fullscreen radar (owner, 2026-10-30: "เต็มหน้าจอเลยของบนคอมแล้วก็ iPad")', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('iPad landscape: cards beside the radar and the screen, nothing overlapping', async ({ page }) => {
    const radar = await openTouch(page, 1180, 820, [...sixLate, owed('j7', 'งานใกล้ครบกำหนด', 'ลูกค้าใหม่', 7000, -5)]);
    expect(await radar.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1180, height: 820 });
    await expect(radar).not.toHaveClass(/is-tall/);
    await expect(radar.locator('.crv')).toBeVisible();
    await page.waitForTimeout(2200);
    const layout = await layoutCheck(page);
    expect(layout.problems).toEqual([]);
    expect(layout.scrollX).toBe(false);
    expect(endsAtCards(layout)).toBe(true);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('credit-radar-ipad-landscape.png') });
  });
  test('iPad portrait: the radar on top, cards two by two under it, each line ends at its card', async ({ page }) => {
    const radar = await openTouch(page, 768, 1024, sixLate);
    await expect(radar).toHaveClass(/is-tall/);
    await page.waitForTimeout(2200);
    await expect(radar.getByTestId('radar-card')).toHaveCount(4);
    await expect(radar.locator('.crv')).toBeVisible();
    const layout = await layoutCheck(page);
    expect(layout.problems).toEqual([]);
    expect(layout.scrollX).toBe(false);
    expect(endsAtCards(layout)).toBe(true);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('credit-radar-ipad-portrait.png') });
    // A tap opens the job.
    await expect(radar.getByTestId('radar-pager')).toContainText('1–4 จาก 6');
    await radar.getByTestId('radar-card').filter({ hasText: 'Brew Days' }).click({ force: true });
    await expect(page.locator('[data-job-id="j3"].job-spotlight').first()).toBeVisible({ timeout: 6000 });
  });
  test('iPad mini portrait and the large iPad in portrait fit too', async ({ page }) => {
    for (const [w, h] of [[744, 1133], [1024, 1366], [1024, 768]] as const) {
      const radar = await openTouch(page, w, h, mixed);
      await page.waitForTimeout(2000);
      const layout = await layoutCheck(page);
      expect(layout.problems, `${w}x${h}`).toEqual([]);
      expect(layout.scrollX, `${w}x${h}`).toBe(false);
      expect(endsAtCards(layout), `${w}x${h} lines`).toBe(true);
      expect(await textOverlapIssues(page), `${w}x${h} text`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(radar).toHaveCount(0, { timeout: 2000 });
      await page.evaluate(() => sessionStorage.clear());
    }
  });
  test('phones keep the old alert', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
    await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
    await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
    await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
    await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
    await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
    await page.route('**/api/data*', route => route.fulfill({ json: { snapshot: {
      jobs: sixLate, expenses: [], goals: [], invoices: [], statuses, job_types: ['Sponsored Post'],
      settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode: 'light', darkFrom: '18:00', lightFrom: '06:00', asked: true } },
      notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
      avatar_data_url: null, issuer_profile: null,
    }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
    await page.goto('/');
    await expect(page.getByText('ตรวจพบดีลค้างชำระเลยกำหนด!')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('credit-radar')).toHaveCount(0);
  });
});

test('light and dark: the radar follows the app theme (cream glass by day, obsidian at night), nothing overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, mixed, 'dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  expect(await radar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 5, 4)');
  await page.waitForTimeout(2200);
  expect((await layoutCheck(page)).problems).toEqual([]);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('credit-radar-dark.png') });
});

test('light mode: cream background, white glass cards, the colour logo on the stand', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const radar = await open(page, mixed, 'light');
  expect(await radar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 249, 244)');
  await expect(radar.locator('.crh-logo.is-on-light')).toBeVisible();
  await expect(radar.locator('.crh-logo.is-on-dark')).toBeHidden();
  expect(await radar.getByTestId('radar-card').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(28, 25, 23)');
  await page.waitForTimeout(2200);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('credit-radar-light.png') });
});

// Owner, 2026-10-30: "ดูในคอมยังไง ต้องกดตรงไหน" — the radar also opens by hand, from the receivables page, any time.
test('the receivables page has a เรดาร์เครดิตเทอม button that opens the radar any time', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The once-a-day check already ran today: the radar does not open by itself.
  await page.addInitScript(email => { const d = new Date().toISOString().split('T')[0]; sessionStorage.setItem(`cashflow_queue_checked_${email}_${d}`, '1'); }, user.email);
  const radar = await open(page, mixed, 'light', '/receivables', false);
  await page.waitForTimeout(2000);
  await expect(radar).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('receivables-radar-button.png') });
  await page.getByTestId('open-credit-radar').click();
  await expect(radar).toBeVisible();
  await expect(radar.getByTestId('radar-card')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(radar).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByTestId('open-credit-radar')).toBeVisible();
});

test('?radar=1 opens the radar once the jobs are in', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(email => { const d = new Date().toISOString().split('T')[0]; sessionStorage.setItem(`cashflow_queue_checked_${email}_${d}`, '1'); }, user.email);
  const radar = await open(page, mixed, 'light', '/?radar=1');
  await expect(radar.getByTestId('radar-card')).toHaveCount(2);
  expect(new URL(page.url()).searchParams.has('radar')).toBe(false);
});

test.describe('phones: no radar button', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('the phone receivables page stays as it was', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(email => { const d = new Date().toISOString().split('T')[0]; sessionStorage.setItem(`cashflow_queue_checked_${email}_${d}`, '1'); }, user.email);
    await open(page, mixed, 'light', '/receivables', false);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('open-credit-radar')).toHaveCount(0);
  });
});

test('more overdue jobs than fit: page two shows the rest, laid out and joined like page one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const nine = [...sixLate, owed('n7', 'คลิปรีวิวแคมเปญ 2', 'Mellow Living', 7920, 15), owed('n8', 'วิดีโอโปรโมต', 'Urban Motion', 5148, 9), owed('n9', 'แบนเนอร์ 5 ชิ้น', 'Sora Home', 4950, 7)];
  const radar = await open(page, nine);
  const pager = radar.getByTestId('radar-pager');
  await expect(pager).toContainText('1–6 จาก 9');
  await pager.getByRole('button', { name: 'หน้าถัดไป' }).click();
  await expect(pager).toContainText('7–9 จาก 9');
  await page.waitForTimeout(1200);
  const layout = await layoutCheck(page);
  expect(layout.cards).toBe(3);
  expect(layout.problems).toEqual([]);
  expect(layout.lines).toBe(3);
  expect(endsAtCards(layout)).toBe(true);
  expect(await radar.evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual([0, 0]);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('credit-radar-page2.png') });
});

test('moving through the radar with Tab never slides it out of place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const nine = [...sixLate, owed('n7', 'คลิปรีวิวแคมเปญ 2', 'Mellow Living', 7920, 15), owed('n8', 'วิดีโอโปรโมต', 'Urban Motion', 5148, 9), owed('n9', 'แบนเนอร์ 5 ชิ้น', 'Sora Home', 4950, 7)];
  const radar = await open(page, nine);
  await page.waitForTimeout(1600);
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  expect(await radar.evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual([0, 0]);
  expect((await layoutCheck(page)).problems).toEqual([]);
});

// Owner, 2026-10-30: left alone a few seconds, the squirrel swipes and the radar turns to what is not on screen yet.
test('left alone, the squirrel swipes to the next page by itself; it blinks and glances about', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const nine = [...sixLate, owed('n7', 'คลิปรีวิวแคมเปญ 2', 'Mellow Living', 7920, 15), owed('n8', 'วิดีโอโปรโมต', 'Urban Motion', 5148, 9), owed('n9', 'แบนเนอร์ 5 ชิ้น', 'Sora Home', 4950, 7)];
  const radar = await open(page, nine);
  await expect(radar.locator('.crh-mascot .squirrel-glance')).toHaveCount(1);
  await expect(radar.locator('.crh-mascot .squirrel-blink').first()).toBeAttached();
  const pager = radar.getByTestId('radar-pager');
  await expect(pager).toContainText('1–6 จาก 9');
  await expect(radar.locator('.crh.is-swiping')).toHaveCount(1, { timeout: 15_000 });
  await expect(pager.getByRole('button', { name: 'หน้าถัดไป' })).toHaveClass(/is-nudge/);
  await expect(pager).toContainText('7–9 จาก 9', { timeout: 3000 });
  await page.waitForTimeout(1500);
  expect((await layoutCheck(page)).problems).toEqual([]);
});
