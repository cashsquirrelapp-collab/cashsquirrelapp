import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The post-payment guide (owner, 2026-10-29: "การ์ดทีละขั้น พาไปกด"): after the arrival, a card beside the corner
// squirrel lists four first steps; "ไปทำเลย" opens the page and rings the button to press; steps tick themselves from
// the account's data. Computers and iPads; phones too since 2026-10-29 ("ทำบนมือถือด้วยเลย"), the card as a bottom sheet.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'guide@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [],
  notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null, dailyDigestEnabled: false }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, notif_settings: 1 } };

async function open(page: Page, width: number, height: number, path: string, dark = false) {
  await page.addInitScript(isDark => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', String(isDark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, dark);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot: snapshotFor ?? snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
}

const card = (page: Page) => page.getByTestId('pro-guide');
const coach = (page: Page) => page.getByTestId('pro-guide-coach');
const ring = (page: Page) => page.getByTestId('pro-guide-ring');
const shot = async (page: Page, name: string) => { if (process.env.SHOT_DIR) { await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }); } };

async function ringsOn(page: Page, target: string) {
  await expect(coach(page)).toHaveAttribute('data-target', target);
  const goal = (await page.locator(`[data-guide-target="${target}"]`).first().boundingBox())!;
  await expect.poll(async () => { const box = await ring(page).boundingBox(); return box ? Math.abs(box.x + 6 - goal.x) + Math.abs(box.width - 12 - goal.width) : 99; }).toBeLessThan(3);
}

test('the guide card lists four steps beside the corner squirrel and walks each one to its button', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 1280, 820, '/dashboard?guide=pro');
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('heading', { name: 'เริ่มใช้ Pro ใน 4 ขั้น' })).toBeVisible();
  await expect(card(page).locator('.pg-count')).toHaveText('0/4');
  await expect(card(page).locator('.pg-step b')).toHaveText(['เชื่อม LINE', 'เปิดแจ้งเตือนอีเมล', 'ลองคุยกับเลขา', 'ตั้งข้อมูลผู้ออกเอกสาร']);
  await expect(card(page).locator('.pg-step[data-step="email"] [aria-label="Gmail"]')).toHaveCount(1);
  // The current step is the only one with the pulsing button.
  await expect(card(page).locator('.pg-go')).toHaveCount(1);
  await expect(card(page).locator('.pg-step.is-current')).toHaveAttribute('data-step', 'line');
  // Beside the squirrel, never over it, and inside the screen.
  const squirrel = (await page.locator('.asx-buddy-btn').boundingBox())!;
  const box = (await card(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(squirrel.x + 4);
  expect(box.y).toBeGreaterThanOrEqual(12);
  expect(box.y + box.height).toBeLessThanOrEqual(820);
  await expect(page.locator('.asx-hello-say')).toBeHidden();
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'guide-card');

  // Step 1: settings, the LINE row rings; pressing it moves the ring to "เชื่อมต่อ LINE".
  await card(page).getByRole('button', { name: 'ไปทำเลย: เชื่อม LINE' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(card(page)).toHaveCount(0);
  await ringsOn(page, 'line');
  await expect(coach(page)).toContainText('ขั้นที่ 1 จาก 4');
  await expect(coach(page).getByRole('heading', { name: 'กดตรงนี้เพื่อเชื่อม LINE' })).toBeVisible();
  await expect(page.getByTestId('pro-guide-pill')).toContainText('1/4เชื่อม LINE');
  await page.waitForTimeout(3800); // the dim has gone, so the page reads again
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'guide-step-line');
  await page.locator('[data-guide-target="line"]').click();
  await ringsOn(page, 'line-connect');
  await expect(coach(page).getByRole('heading', { name: 'กดเชื่อมต่อ LINE เพื่อรับรหัส' })).toBeVisible();
  await shot(page, 'guide-step-line-connect');
  // ‹ › in the bubble (owner, 2026-11-03): › goes straight on to step 2, ‹ back to step 1 to look again; no ดูทุกขั้น.
  await expect(coach(page).getByRole('button', { name: 'ขั้นก่อนหน้า' })).toBeDisabled();
  await expect(coach(page).getByRole('button', { name: 'ดูทุกขั้น' })).toHaveCount(0);
  await coach(page).getByRole('button', { name: 'ขั้นถัดไป' }).click();
  await ringsOn(page, 'notif');
  await expect(coach(page)).toContainText('ขั้นที่ 2 จาก 4');
  await coach(page).getByRole('button', { name: 'ขั้นก่อนหน้า' }).click();
  await ringsOn(page, 'line');
  await expect(coach(page)).toContainText('ขั้นที่ 1 จาก 4');
  await coach(page).getByRole('button', { name: 'ขั้นถัดไป' }).click();
  await ringsOn(page, 'notif');
  await page.locator('[data-guide-target="notif"]').click();
  await ringsOn(page, 'notif-digest');
  await shot(page, 'guide-step-email');
  // Turning the reminder on ticks the step by itself, and the card comes back with the next one.
  await page.locator('[data-guide-target="notif-digest"]').getByRole('switch').click();
  await expect(page.getByTestId('pro-guide-pill')).toContainText('เปิดแจ้งเตือนอีเมล เรียบร้อย');
  await expect(card(page)).toBeVisible({ timeout: 4000 });
  await expect(card(page).locator('.pg-count')).toHaveText('1/4');
  await expect(card(page).locator('.pg-step[data-step="email"]')).toContainText('เรียบร้อย');
  await expect(card(page).locator('.pg-step[data-step="line"]')).toContainText('ข้ามไว้');
  await expect(card(page).locator('.pg-step.is-current')).toHaveAttribute('data-step', 'chat');

  // "ไว้ทีหลัง" leaves a small pill by the squirrel, which reopens the card, also after a reload.
  await card(page).getByRole('button', { name: 'ไว้ทีหลัง' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByTestId('pro-guide-pill')).toContainText('เริ่มใช้ Pro1/4');
  await page.reload();
  await expect(page.getByTestId('pro-guide-pill')).toBeVisible();
  await shot(page, 'guide-pill');
  await page.getByTestId('pro-guide-pill').click();
  await expect(card(page)).toBeVisible();

  // Step 3: the full chat; the first message sent ticks it.
  await card(page).getByRole('button', { name: 'ไปทำเลย: ลองคุยกับเลขา' }).click();
  await expect(page).toHaveURL(/\/assistant/);
  await ringsOn(page, 'chat-composer');
  await shot(page, 'guide-step-chat');
  await page.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('สรุปเดือนนี้');
  await page.getByRole('button', { name: 'ส่งข้อความ' }).click();
  await expect(card(page)).toBeVisible({ timeout: 6000 });
  // (This test's server keeps nothing across the reload above, so only the chat step, kept on this device, counts here.)
  await expect(card(page).locator('.pg-step[data-step="chat"]')).toContainText('เรียบร้อย');
  await expect(card(page).locator('.pg-step.is-current')).not.toHaveAttribute('data-step', 'chat');

  // Step 4: the business profile. The bubble asks for the details first (owner, 2026-10-31: "บอกให้มากรอกตรงนี้ด้วย"),
  // then for บันทึกโปรไฟล์ธุรกิจ; saving ends the guide there and then ("พอกดบันทึกโปรไฟล์ปุ๊บก็เลิกสอนทันที").
  await card(page).getByRole('button', { name: 'ไปทำเลย: ตั้งข้อมูลผู้ออกเอกสาร' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await ringsOn(page, 'business');
  await expect(coach(page).locator('.pg-coach-steps li')).toHaveText(['กด โปรไฟล์ธุรกิจ', 'กรอกชื่อธุรกิจ เลขผู้เสียภาษี ที่อยู่ เบอร์โทร และอีเมล', 'กรอกเสร็จแล้วกด บันทึกโปรไฟล์ธุรกิจ ด้านล่างขวา']);
  await page.locator('[data-guide-target="business"]').click();
  await ringsOn(page, 'business-form');
  await expect(coach(page).getByRole('heading', { name: 'กรอกข้อมูลธุรกิจตรงนี้' })).toBeVisible();
  await expect(coach(page).locator('.pg-coach-steps li')).toHaveText(['กรอกชื่อธุรกิจ เลขผู้เสียภาษี และที่อยู่ออกใบเสร็จ', 'ใส่เบอร์โทรและอีเมลติดต่อ (ถ้ามี)', 'แล้วกด › น้องจะพาไปที่ปุ่มบันทึก']);
  // The ring holds the name and tax ID fields; the bubble sits above them, off the fields.
  const fields = (await page.locator('[data-guide-target="business-form"]').boundingBox())!;
  const bubble = (await coach(page).boundingBox())!;
  expect(fields.width).toBeGreaterThan(500);
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(fields.y);
  await expect(page.locator('#biz-name')).toBeInViewport();
  await expect(page.locator('#biz-tax')).toBeInViewport();
  // The ring runs from the name down to the address (owner, 2026-11-03).
  const ringed = (await page.locator('[data-guide-target="business-form"]').boundingBox())!;
  const address = (await page.locator('#biz-address').boundingBox())!;
  expect(address.y + address.height).toBeLessThanOrEqual(ringed.y + ringed.height + 1);
  await expect(page.locator('#biz-address')).toBeInViewport();
  await page.waitForTimeout(3800); // the dim has gone, so the page reads again
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'guide-step-business');
  // Filling the fields keeps the guide on this step.
  await page.locator('#biz-name').fill('สตูดิโอตัวอย่าง');
  await page.locator('#biz-tax').fill('0105555555555');
  await page.locator('#biz-address').fill('99 ถนนสุขุมวิท กรุงเทพมหานคร 10110');
  await expect(coach(page)).toHaveAttribute('data-target', 'business-form');
  // Opening the card and going to this step again keeps what was typed (it used to send ตั้งค่า back to its first
  // screen and empty the fields: owner, 2026-11-03).
  await page.getByTestId('pro-guide-pill').click();
  await card(page).getByRole('button', { name: 'ไปทำเลย: ตั้งข้อมูลผู้ออกเอกสาร' }).click();
  await ringsOn(page, 'business-form');
  await expect(page.locator('#biz-name')).toHaveValue('สตูดิโอตัวอย่าง');
  await expect(page.locator('#biz-address')).toHaveValue('99 ถนนสุขุมวิท กรุงเทพมหานคร 10110');
  // Step 4's › leads to บันทึกโปรไฟล์ธุรกิจ (owner, 2026-11-03: "ลูกศรขั้นตอนสุดท้าย ... ให้มากดตรงนี้"); ‹ goes back to
  // the fields, and at the save button there is no › and no จบคู่มือ: saving ends the guide.
  await coach(page).getByRole('button', { name: 'ไปที่ปุ่มบันทึก' }).click();
  await ringsOn(page, 'business-save');
  await expect(coach(page).getByRole('heading', { name: 'กดตรงนี้เพื่อบันทึก' })).toBeVisible();
  await expect(coach(page).getByRole('button', { name: /ไปที่ปุ่มบันทึก|จบคู่มือ/ })).toHaveCount(0);
  await coach(page).getByRole('button', { name: 'ขั้นก่อนหน้า' }).click();
  await ringsOn(page, 'business-form');
  await expect(page.locator('#biz-name')).toHaveValue('สตูดิโอตัวอย่าง');
  await coach(page).getByRole('button', { name: 'ไปที่ปุ่มบันทึก' }).click();
  await ringsOn(page, 'business-save');
  await shot(page, 'guide-step-business-save');
  await page.locator('[data-guide-target="business-save"]').click();
  const saved = page.locator('.ksm-modal');
  await expect(saved).toBeVisible();
  await expect(coach(page)).toHaveCount(0);
  await saved.getByRole('button').last().click();
  // The guide has ended: no card, no bubble, no ring, no pill; it stays ended after a reload.
  await page.waitForTimeout(2000);
  await expect(card(page)).toHaveCount(0);
  await expect(coach(page)).toHaveCount(0);
  await expect(ring(page)).toHaveCount(0);
  await expect(page.getByTestId('pro-guide-pill')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.asx-buddy-btn')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByTestId('pro-guide-pill')).toHaveCount(0);
});

test('the guide opens after the Pro arrival', async ({ page }) => {
  test.setTimeout(45_000);
  await open(page, 1280, 820, '/dashboard?hello=krarok');
  await expect(page.locator('.kb-stage').first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
});

test('phones: the card rises as a sheet over the tab bar, and "ไปทำเลย" rings the LINE row', async ({ page }) => {
  test.setTimeout(45_000);
  await open(page, 390, 844, '/dashboard?guide=pro');
  await expect(card(page)).toBeVisible();
  await expect.poll(async () => { const b = (await card(page).boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(844); // risen
  const box = (await card(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(6);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 6);
  expect(box.y).toBeGreaterThanOrEqual(12);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await expect(card(page).locator('.pg-step b')).toHaveText(['เชื่อม LINE', 'เปิดแจ้งเตือนอีเมล', 'ลองคุยกับเลขา', 'ตั้งข้อมูลผู้ออกเอกสาร']);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'guide-card-phone');
  await card(page).getByRole('button', { name: 'ไปทำเลย: เชื่อม LINE' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await ringsOn(page, 'line');
  const coachBox = (await coach(page).boundingBox())!;
  expect(coachBox.x).toBeGreaterThanOrEqual(12 - 0.5);
  expect(coachBox.x + coachBox.width).toBeLessThanOrEqual(390 - 12 + 0.5);
  // The pill sits beside the phone's squirrel; the squirrel's hello waits meanwhile.
  await expect(page.getByTestId('pro-guide-pill')).toContainText('1/4เชื่อม LINE');
  await expect(page.locator('.asx-hello-say')).toBeHidden();
  await page.waitForTimeout(3800);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'guide-step-phone');
  await page.locator('[data-guide-target="line"]').click();
  await ringsOn(page, 'line-connect');
  // Step 3 on a phone: the full chat's composer rings (› twice: step 2, then step 3).
  await coach(page).getByRole('button', { name: 'ขั้นถัดไป' }).click();
  await expect(coach(page)).toContainText('ขั้นที่ 2 จาก 4');
  await coach(page).getByRole('button', { name: 'ขั้นถัดไป' }).click();
  await expect(page).toHaveURL(/\/assistant/);
  await ringsOn(page, 'chat-composer');
});

test('the guide reads in dark mode and on an iPad', async ({ page }) => {
  await open(page, 820, 1180, '/dashboard?guide=pro', true);
  await expect(card(page)).toBeVisible();
  const box = (await card(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'guide-card-ipad-dark');
  await card(page).getByRole('button', { name: 'ไปทำเลย: เชื่อม LINE' }).click();
  await ringsOn(page, 'line');
  await shot(page, 'guide-step-ipad-dark');
});

// Step 4 on phones (owner, 2026-11-03: customers "ทำไม่ได้สักที"): with the keyboard up, the bubble, the ring and the pill
// sat on the very fields being filled in. They step aside while a field is typed into, the bubble never covers the
// fields, and saving still ends the guide.
async function openAt(page: Page, width: number, height: number, path: string, extra: { admin?: boolean; done?: boolean } = {}) {
  // LINE, the e-mail switch and the first chat are done already; `done` saves the business profile too.
  await page.addInitScript(() => {
    localStorage.setItem('krarok.proGuide.11111111-1111-4111-8111-111111111111', JSON.stringify({ state: 'off', skipped: [], chat: true }));
  });
  if (extra.done) {
    snapshotFor = { ...snapshot, notif_settings: { ...snapshot.notif_settings, lineUserId: 'U-line', dailyDigestEnabled: true },
      issuer_profile: { name: 'สตูดิโอเดิม', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' } };
  } else snapshotFor = { ...snapshot, notif_settings: { ...snapshot.notif_settings, lineUserId: 'U-line', dailyDigestEnabled: true } };
  await open(page, width, height, path);
  if (extra.admin) await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
}
let snapshotFor: Record<string, unknown> | null = null;
test.beforeEach(() => { snapshotFor = null; });

/** The middle of this element is the element itself, not a piece of the guide. */
async function reachable(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(node => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(box.height / 2, 20));
    return Boolean(hit && (hit === node || node.contains(hit)));
  });
}
/** No piece of the guide sits on this element (the phone's own tab bar is not the guide's). */
async function clearOfGuide(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(node => {
    const box = node.getBoundingClientRect();
    return !Array.from(document.querySelectorAll('.pg-coach, .pg-pill-wrap')).some(item => {
      const style = getComputedStyle(item);
      if (style.visibility === 'hidden') return false;
      const other = item.getBoundingClientRect();
      return other.left < box.right && other.right > box.left && other.top < box.bottom && other.bottom > box.top;
    });
  });
}

for (const [label, width, height] of [['a phone', 390, 844], ['a short phone', 375, 667]] as const) {
  test(`phones: step 4 on ${label} can be filled in, the guide steps aside while typing, and saving ends it`, async ({ page }) => {
    test.setTimeout(60_000);
    await openAt(page, width, height, '/dashboard?guide=pro');
    await expect(card(page).locator('.pg-count')).toHaveText('3/4');
    await card(page).getByRole('button', { name: 'ไปทำเลย: ตั้งข้อมูลผู้ออกเอกสาร' }).click();
    await ringsOn(page, 'business');
    await page.locator('[data-guide-target="business"]').click();
    await ringsOn(page, 'business-form');
    // The bubble sits above the fields, inside the screen, and both fields can be pressed.
    const fields = (await page.locator('[data-guide-target="business-form"]').boundingBox())!;
    const bubble = (await coach(page).boundingBox())!;
    expect(bubble.y).toBeGreaterThanOrEqual(12);
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(fields.y);
    await expect(page.locator('#biz-name')).toBeInViewport();
    expect(await reachable(page, '#biz-name')).toBe(true);
    expect(await reachable(page, '#biz-tax')).toBe(true);
    await shot(page, `guide-business-${width}x${height}`);
    // › leads to บันทึกโปรไฟล์ธุรกิจ on phones too; ‹ comes back to the fields.
    await coach(page).getByRole('button', { name: 'ไปที่ปุ่มบันทึก' }).click();
    await ringsOn(page, 'business-save');
    const saveBubble = (await coach(page).boundingBox())!;
    expect(saveBubble.y).toBeGreaterThanOrEqual(0);
    expect(saveBubble.y + saveBubble.height).toBeLessThanOrEqual(height);
    await shot(page, `guide-business-save-${width}x${height}`);
    await coach(page).getByRole('button', { name: 'ขั้นก่อนหน้า' }).click();
    await ringsOn(page, 'business-form');

    // Typing: the keyboard comes up over the bottom of the screen; the bubble, the ring and the pill step aside.
    await page.locator('#biz-name').focus();
    await expect(coach(page)).toBeHidden();
    await expect(ring(page)).toBeHidden();
    await expect(page.getByTestId('pro-guide-pill')).toBeHidden();
    for (const field of ['#biz-name', '#biz-tax', '#biz-address', '#biz-phone']) {
      await page.locator(field).focus();
      await page.locator(field).evaluate(node => node.scrollIntoView({ block: 'start' })); // as the phone does, above the keyboard
      expect(await clearOfGuide(page, field), field).toBe(true);
    }
    await shot(page, `guide-business-typing-${width}`);
    await page.locator('#biz-name').fill('สตูดิโอตัวอย่าง');
    await page.locator('#biz-address').fill('99 ถนนสุขุมวิท กรุงเทพมหานคร 10110');
    // Moving from field to field keeps them aside; closing the keyboard brings them back, and with the fields scrolled
    // up to the top the bubble does not drop onto the address below them (it used to: 2026-11-03).
    await page.locator('#biz-tax').focus();
    await page.waitForTimeout(900);
    await expect(ring(page)).toBeHidden();
    await page.locator('#biz-address').focus();
    await page.locator('#biz-address').blur();
    await expect(ring(page)).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('pro-guide-pill')).toBeVisible();
    await page.waitForTimeout(600);
    expect(await clearOfGuide(page, '#biz-address')).toBe(true);
    expect(await clearOfGuide(page, '#biz-phone')).toBe(true);
    const ringBox = (await ring(page).boundingBox())!;
    if (await coach(page).count()) expect((await coach(page).boundingBox())!.y + (await coach(page).boundingBox())!.height).toBeLessThanOrEqual(ringBox.y);
    // Saving ends the guide.
    await page.locator('[data-guide-target="business-save"]').click();
    await expect(page.locator('.ksm-modal')).toBeVisible();
    await page.locator('.ksm-modal').getByRole('button').last().click();
    await page.waitForTimeout(2000);
    await expect(card(page)).toHaveCount(0);
    await expect(coach(page)).toHaveCount(0);
    await expect(page.getByTestId('pro-guide-pill')).toHaveCount(0);
  });
}

test('iPads: step 4 steps aside while typing too, and the bubble stays off the fields', async ({ page }) => {
  test.setTimeout(45_000);
  // A touch screen: `(pointer: coarse)` matches.
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => (query.includes('pointer: coarse')
      ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as unknown as MediaQueryList
      : original(query));
  });
  await openAt(page, 820, 1180, '/dashboard?guide=pro');
  await card(page).getByRole('button', { name: 'ไปทำเลย: ตั้งข้อมูลผู้ออกเอกสาร' }).click();
  await page.locator('[data-guide-target="business"]').click();
  await ringsOn(page, 'business-form');
  const fields = (await page.locator('[data-guide-target="business-form"]').boundingBox())!;
  expect((await coach(page).boundingBox())!.y + (await coach(page).boundingBox())!.height).toBeLessThanOrEqual(fields.y);
  await page.locator('#biz-name').focus();
  await expect(coach(page)).toBeHidden();
  await expect(ring(page)).toBeHidden();
  await page.locator('#biz-name').blur();
  await expect(ring(page)).toBeVisible({ timeout: 3000 });
});

test('admins can replay the guide from step 1 as often as they like; the account’s own progress stays', async ({ page }) => {
  test.setTimeout(60_000);
  await openAt(page, 1280, 820, '/assistant', { admin: true, done: true });
  const openPractice = async () => {
    await page.getByRole('button', { name: 'จัดการแชต' }).click();
    await page.getByRole('menuitem', { name: 'ดูคู่มือเริ่มใช้ Pro อีกครั้ง' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(card(page)).toBeVisible();
  };
  await openPractice();
  await expect(card(page)).toHaveAttribute('data-practice', '');
  await expect(card(page).locator('.pg-count')).toHaveText('2/4');
  // LINE is linked and the e-mail summary is on already, so the run starts at the next step
  // (owner, 2026-11-03: "ถ้าเชื่อมแล้วก็พาข้ามอันถัดไปเลย").
  await expect(card(page).locator('.pg-step[data-step="line"]')).toContainText('เรียบร้อย');
  await expect(card(page).locator('.pg-step[data-step="email"]')).toContainText('เรียบร้อย');
  await expect(card(page).locator('.pg-step.is-current')).toHaveAttribute('data-step', 'chat');
  await expect(card(page)).toContainText('โหมดทดลองสำหรับแอดมิน');
  await shot(page, 'guide-practice');
  // Straight to step 4: the account's profile is already saved, yet the step waits for this run's save.
  await card(page).getByRole('button', { name: 'ไปทำเลย: ตั้งข้อมูลผู้ออกเอกสาร' }).click();
  await ringsOn(page, 'business');
  await page.locator('[data-guide-target="business"]').click();
  await ringsOn(page, 'business-form');
  await page.waitForTimeout(2500);
  await expect(coach(page)).toHaveAttribute('data-target', 'business-form');
  await page.locator('[data-guide-target="business-save"]').click();
  await page.locator('.ksm-modal').getByRole('button').last().click();
  await page.waitForTimeout(1500);
  await expect(coach(page)).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
  // The account's own guide is untouched, and the run can start again.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('krarok.proGuide.11111111-1111-4111-8111-111111111111') || '{}').state)).toBe('off');
  await page.goto('/assistant');
  await openPractice();
  await expect(card(page).locator('.pg-count')).toHaveText('2/4');
  await card(page).getByRole('button', { name: 'ไว้ทีหลัง' }).click();
  await page.getByTestId('pro-guide-pill').locator('..').getByRole('button', { name: 'ปิดคำแนะนำเริ่มใช้ Pro' }).click();
  await expect(page.getByTestId('pro-guide-pill')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('krarok.proGuide.11111111-1111-4111-8111-111111111111') || '{}').state)).toBe('off');
});

test('the replay is for admins only', async ({ page }) => {
  await openAt(page, 1280, 820, '/assistant', { done: true });
  await page.getByRole('button', { name: 'จัดการแชต' }).click();
  await expect(page.getByRole('menuitem', { name: 'ตั้งค่าการแจ้งเตือน' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'ดูคู่มือเริ่มใช้ Pro อีกครั้ง' })).toHaveCount(0);
});

// ตั้งค่า › สำหรับแอดมิน › ตัวอย่างหลังชำระ Pro (owner, 2026-11-03): the paid arrival, then the guide as a practice run.
for (const [label, width, height] of [['a computer', 1280, 820], ['a phone', 390, 844]] as const) {
  test(`admins on ${label}: ตัวอย่างหลังชำระ Pro in ตั้งค่า plays the arrival, then the guide from step 1 as a practice run`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, width, height, '/settings', { admin: true, done: true });
    const row = page.getByRole('button', { name: /ตัวอย่างหลังชำระ Pro/ });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('.kb-stage').first()).toBeVisible({ timeout: 8000 });
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toHaveAttribute('data-practice', '');
    await expect(card(page).locator('.pg-count')).toHaveText('2/4');
    // The account's own guide stays as it was.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('krarok.proGuide.11111111-1111-4111-8111-111111111111') || '{}').state)).toBe('off');
  });
}

test('the after-payment preview in ตั้งค่า is for admins only', async ({ page }) => {
  await openAt(page, 1280, 820, '/settings', { done: true });
  await expect(page.getByRole('heading', { name: /ตั้งค่า/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /บัญชี & ความปลอดภัย/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /ตัวอย่างหลังชำระ Pro/ })).toHaveCount(0);
});

// Forward only (owner, 2026-11-03: "พอถึงขั้นตอนที่4แล้วก็จบ ไม่ต้องพาวนใหม่"): ‹ goes back to step 3 to look again; step 4
// ends at the save button, and saving ends the guide without starting over.
test('step 4 ends at บันทึกโปรไฟล์ธุรกิจ, and ‹ goes back a step without starting over', async ({ page }) => {
  test.setTimeout(60_000);
  await openAt(page, 1280, 820, '/dashboard?guide=pro');
  await expect(card(page).locator('.pg-step.is-current')).toHaveAttribute('data-step', 'business');
  await card(page).getByRole('button', { name: 'ไปทำเลย: ตั้งข้อมูลผู้ออกเอกสาร' }).click();
  await ringsOn(page, 'business');
  await coach(page).getByRole('button', { name: 'ขั้นก่อนหน้า' }).click();
  await expect(page).toHaveURL(/\/assistant/);
  await ringsOn(page, 'chat-composer');
  await expect(coach(page)).toContainText('ขั้นที่ 3 จาก 4');
  await coach(page).getByRole('button', { name: 'ขั้นถัดไป' }).click();
  await expect(page).toHaveURL(/\/settings/);
  await ringsOn(page, 'business');
  await page.locator('[data-guide-target="business"]').click();
  await ringsOn(page, 'business-form');
  await page.locator('#biz-name').fill('สตูดิโอตัวอย่าง');
  await coach(page).getByRole('button', { name: 'ไปที่ปุ่มบันทึก' }).click();
  await ringsOn(page, 'business-save');
  await page.locator('[data-guide-target="business-save"]').click();
  await page.locator('.ksm-modal').getByRole('button').last().click();
  await page.waitForTimeout(1500);
  await expect(card(page)).toHaveCount(0);
  await expect(coach(page)).toHaveCount(0);
  await expect(page.getByTestId('pro-guide-pill')).toHaveCount(0);
});
