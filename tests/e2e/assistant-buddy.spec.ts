import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// (setup shared with assistant-chat.spec.ts) เลขากระรอก chat workspace (owner's brief "KRAROK — AI SECRETARY CHAT UI BRIEF", 2026-10-23): ChatGPT/Dot-style
// chat with a history sidebar, a slim glass header, a floating glass composer, Markdown answers, sample
// result cards, a token indicator and every UI state of §11. Screen only and admins only for now: nothing
// calls an AI, billing or the backend, and every sample is labelled.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'assistant@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, width: number, height: number, options: { role?: 'admin' | 'user'; dark?: boolean; path?: string; free?: boolean; billing?: unknown; snapshot?: Record<string, unknown>; versions?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  await page.addInitScript(isDark => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', String(isDark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, Boolean(options.dark));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    calls.push(url.hostname + url.pathname);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: options.role ?? 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot: { ...snapshot, ...options.snapshot }, versions: { ...versions, ...options.versions }, subscription: options.free ? null : { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  if (options.billing) await page.route('**/api/billing', route => route.fulfill({ json: options.billing }));
  await page.setViewportSize({ width, height });
  await page.goto(options.path ?? '/assistant');
  return calls;
}

const snap = async (page: Page, name: string) => { await page.waitForTimeout(420); await page.screenshot({ path: test.info().outputPath(name) }); };

// เลขากระรอกติดตัว (owner, 2026-10-23: "ให้น้องตามไปทุกที่ทุกฟีเจอร์สำหรับคนที่ใช้โปร ... คล้าย Cowork"): the squirrel
// at the corner of every page for Pro accounts, with a small chat that knows the page. Screen only.
const buddy = (page: Page) => page.locator('.asx-buddy');
const panel = (page: Page) => page.getByRole('dialog', { name: /^เลขากระรอก · หน้า/ });

test('Pro: the squirrel stands at the corner of each page and its chat knows the page', async ({ page }) => {
  const calls = await open(page, 1280, 820, { path: '/jobs' });
  const button = page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้างาน' });
  await expect(button).toBeVisible();
  // No headset on the corner squirrel any more (owner, 2026-10-27: "เหมือนคอลเซ็นเตอร์เกิน"); the sidebar icon keeps it.
  await expect(button.locator('.mpg-headset')).toHaveCount(0);
  await expect(page.locator('aside.app-sidebar').getByRole('button', { name: 'เลขากระรอก', exact: true }).locator('.mpg-headset')).toHaveCount(1);
  const box = (await button.boundingBox())!;
  expect(1280 - (box.x + box.width)).toBeLessThan(40);
  expect(820 - (box.y + box.height)).toBeLessThan(40);
  // The page leaves room at its foot, and nothing reads from under the squirrel.
  expect(await page.locator('#main-content').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeGreaterThanOrEqual(100);
  expect(await textOverlapIssues(page)).toEqual([]);
  const mainWidth = Math.round((await page.locator('#main-content').boundingBox())!.width);
  await button.click();
  const chat = panel(page);
  await expect(chat).toBeVisible();
  await expect(chat).toContainText('กำลังดูหน้างาน');
  // No "เปิดหน้าที่เกี่ยวข้อง" choice any more (owner, 2026-10-26).
  await expect(chat.getByText('เปิดหน้าที่เกี่ยวข้อง')).toHaveCount(0);
  await expect(chat.getByRole('combobox')).toHaveCount(0);
  await expect(chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button')).toHaveText(['ช่วยเพิ่มงานใหม่ให้หน่อย', 'ตรวจงานที่ยังไม่ได้รับเงิน', 'หน้านี้ใช้ทำอะไร', 'สรุปเดือนนี้', 'รอรับเงิน', 'กำลังดำเนินการ']);
  // Computers and iPads (owner's brief "FLOATING TOP MASCOT CHAT UI V2", 2026-10-26): a floating window over the page,
  // which keeps its width and is not dimmed; the window stays inside the screen.
  const panelBox = (await chat.boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(12); expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(1280 - 12);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(820 - 12);
  await expect(chat).toHaveAttribute('aria-modal', 'false');
  await expect(page.locator('.asx-buddy-scrim')).toHaveCount(0);
  expect(Math.round((await page.locator('#main-content').boundingBox())!.width)).toBe(mainWidth);
  // A solid warm surface (owner's reference mood, 2026-10-27): the page behind never reads through the words.
  expect(await chat.locator('.kfw-shell').evaluate(el => { const s = getComputedStyle(el); return s.backgroundImage.includes('rgb(252, 251, 250)') && s.backdropFilter === 'none'; })).toBe(true);
  await expect(chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' })).toBeFocused();
  expect(await textOverlapIssues(page)).toEqual([]);
  // It prepares an action to confirm, like a coworker; confirming changes nothing (sample).
  await chat.getByRole('button', { name: 'ช่วยเพิ่มงานใหม่ให้หน่อย' }).click();
  const card = chat.locator('.asx-rcard').filter({ hasText: 'เพิ่มงานใหม่ 1 งาน' });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect(card).toContainText('ยืนยันแล้ว (ตัวอย่าง) · ยังไม่มีการเปลี่ยนแปลงข้อมูลจริง');
  await expect(chat.locator('.asx-meta').last()).toContainText('คำตอบตัวอย่าง', { timeout: 6000 });
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'buddy-1280-jobs.png');
  // "หน้านี้ใช้ทำอะไร" answers with what the page is for.
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('หน้านี้ใช้ทำอะไร');
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).press('Enter');
  await expect(chat.locator('.asx-md').last()).toContainText('งานทั้งหมด สถานะ และการรับเงินของแต่ละงาน', { timeout: 10000 });
  // Escape closes it and gives focus back to the squirrel.
  await page.keyboard.press('Escape');
  await expect(chat).toHaveCount(0);
  await expect(button).toBeFocused();
  // On another page it knows that page; the full chat (from the sidebar) has the squirrel step aside.
  await page.locator('aside.app-sidebar').getByRole('button', { name: 'ภาพรวม' }).click();
  await page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' }).click();
  await expect(panel(page)).toContainText('กำลังดูหน้าภาพรวม');
  await page.locator('aside.app-sidebar').getByRole('button', { name: 'เลขากระรอก', exact: true }).click();
  await expect(page).toHaveURL(/\/assistant/);
  await expect(buddy(page)).toHaveCount(0);
  await expect(page.locator('.kfw')).toHaveCount(0);
  expect(calls.filter(call => /openai|anthropic|gemini|line\.me|\/api\/(ai|assistant|chat)/i.test(call))).toEqual([]);
});

// Formal เลขากระรอก on computers (owner, 2026-10-26: the climbing squirrel and its comic bubble read as a toy, "ไม่ได้
// เหมือนพวกนักบัญชีใช้"; it had replaced the 2026-10-26 climbing squirrel): a plain glass pill with the squirrel in a
// round avatar (headset only), its face showing what is happening, and a small status card above the pill for real
// events only: a send in progress after the chat is closed, a card waiting for a yes, an answer that arrived unseen.
// An answer is never shown as a job done, and it is said in the squirrel's own words, typed out (owner: "น้องพิมพ์ออก
// มาเลยเป็นประโยค"). No hello on hover, no rainbow ring.
const say = (page: Page) => page.locator('.asx-climb-say');
const typed = (page: Page) => page.locator('.asx-climb-say .asx-climb-typed');
test('computers: a status card above the plain glass pill says what is happening while the chat is closed', async ({ page }) => {
  await open(page, 1280, 820, { path: '/jobs' });
  const button = page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้างาน' });
  await expect(button).toBeVisible();
  await expect(say(page)).toHaveCount(0);
  await expect(page.locator('.mascot-climb')).toHaveCount(0);
  // The pill: plain, no turning rainbow ring; the squirrel stays in its round avatar, no headset.
  expect(await button.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  const face = button.locator('.asx-buddy-face.is-pill');
  await expect(face.locator('.mpg-headset')).toHaveCount(0); // no headset (owner, 2026-10-27)
  await expect(face.locator('.mpg-back')).toHaveCount(0);
  const pill = (await button.boundingBox())!;
  const faceBox = (await face.boundingBox())!;
  expect(Math.round(pill.height)).toBe(48);
  expect(faceBox.y).toBeGreaterThanOrEqual(pill.y);
  expect(faceBox.y + faceBox.height).toBeLessThanOrEqual(pill.y + pill.height);
  // Hovering says nothing.
  await button.hover();
  await page.waitForTimeout(700);
  await expect(say(page)).toHaveCount(0);
  await expect(page.locator('.mascot-climb')).toHaveCount(0);
  // Ask for something to confirm, then close the chat while it thinks: the card tells the steps outside.
  await button.click();
  const chat = panel(page);
  await chat.getByRole('button', { name: 'ช่วยเพิ่มงานใหม่ให้หน่อย' }).click();
  await page.keyboard.press('Escape');
  await expect(chat).toHaveCount(0);
  await page.mouse.move(400, 300);
  await expect(typed(page)).toHaveText('กำลังคิด');
  await expect(face).toHaveAttribute('data-mood', 'thinking');
  await expect(face.locator('.mpg-headset')).toHaveCount(0);
  // The squirrel types the answer itself; it stays while the card waits for a yes, with a checking face.
  await expect(typed(page)).toHaveText('นี่คือรายละเอียดที่จะบันทึกครับ ตรวจสอบก่อนกดยืนยันได้เลย', { timeout: 10000 });
  await expect(say(page)).toHaveAttribute('data-kind', 'awaiting');
  await expect(say(page)).toHaveClass(/is-said/);
  await expect(say(page)).toHaveAttribute('role', 'status');
  await expect(face).toHaveAttribute('data-mood', 'checking');
  await page.waitForTimeout(700);
  // The card sits just above the pill, lined up with its right edge, with no tail.
  const card = (await say(page).boundingBox())!;
  expect(Math.abs(card.x + card.width - (pill.x + pill.width))).toBeLessThanOrEqual(1);
  expect(card.y + card.height).toBeLessThanOrEqual(pill.y - 6);
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(await say(page).evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'buddy-status-awaiting.png');
  // Tapping the card opens the chat with the draft; once confirmed nothing is left to tell.
  await say(page).click();
  await expect(chat).toBeVisible();
  const draft = chat.locator('.asx-rcard').filter({ hasText: 'เพิ่มงานใหม่ 1 งาน' });
  await draft.getByRole('button', { name: 'บันทึกงาน' }).click();
  await expect(draft).toContainText('ยืนยันแล้ว (ตัวอย่าง)');
  await page.keyboard.press('Escape');
  await page.mouse.move(400, 300);
  await page.waitForTimeout(500);
  await expect(say(page)).toHaveCount(0);
  // An answer that arrives while the chat is closed waits on the pill until the chat is opened.
  await button.click();
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('หน้านี้ใช้ทำอะไร');
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).press('Enter');
  await page.keyboard.press('Escape');
  await page.mouse.move(400, 300);
  // A long answer: its first words as one plain sentence (no ** marks), cut at a word with "…"; the chat has the rest.
  await expect(typed(page)).toHaveText(/^หน้างานใช้ดูงานทั้งหมด สถานะ และการรับเงินของแต่ละงานครับ .+…$/, { timeout: 10000 });
  await expect(say(page)).toHaveAttribute('data-kind', 'answered');
  const lines = await typed(page).evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBeLessThanOrEqual(3);
  await page.waitForTimeout(300);
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'buddy-status-answer.png');
  await button.click();
  await expect(chat.locator('.asx-md').last()).toContainText('งานทั้งหมด สถานะ และการรับเงินของแต่ละงาน');
  // The panel's questions are one grouped list with chevrons; its greeting has the small avatar, no glow.
  await page.keyboard.press('Escape');
  await page.mouse.move(400, 300);
  await page.waitForTimeout(500);
  await expect(say(page)).toHaveCount(0);
});

// Owner's brief "FLOATING TOP MASCOT CHAT UI V2" (2026-10-26): the official squirrel perches on the middle of the
// window's top edge, paws on the edge, its name on a dark capsule under it; the header has only minimise, maximise and
// close; the window moves, resizes and remembers; minimising folds it into the squirrel; it keeps clear of documents.
const win = (page: Page) => page.locator('.kfw');
const rectOf = (page: Page, selector: string) => page.locator(selector).first().evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Waits out the window's short open animation, so measurements are of where it really is. */
const settle = (page: Page) => expect.poll(() => win(page).evaluate(el => getComputedStyle(el).transform)).toBe('none');
async function openWindow(page: Page, path = '/jobs', width = 1280, height = 820, dark = false) {
  await open(page, width, height, { path, dark });
  await page.locator('.asx-buddy-btn').click();
  await expect(win(page)).toBeVisible();
  await settle(page);
}

for (const dark of [false, true]) {
  test(`computers${dark ? ', dark' : ''}: the squirrel perches on the middle of the window's top edge, its name under it, never clipped`, async ({ page }) => {
    await openWindow(page, '/dashboard', 1280, 820, dark);
    const w = await rectOf(page, '.kfw');
    const perch = await rectOf(page, '.kfw-perch');
    const name = await rectOf(page, '.kfw-name');
    // In the middle, rising above the edge, its paws on the edge (to the pixel), fully on screen.
    expect(Math.abs(perch.x + perch.w / 2 - (w.x + w.w / 2))).toBeLessThanOrEqual(1);
    expect(perch.y).toBeLessThan(w.y - 40);
    expect(Math.abs(perch.y + perch.h - (w.y + 1))).toBeLessThanOrEqual(1.5);
    expect(perch.y).toBeGreaterThanOrEqual(0);
    // Outside the clipped glass, so nothing cuts it off; the official drawing with no headset or outfit, no glow.
    expect(await page.locator('.kfw-perch').evaluate(el => el.closest('.kfw-shell') === null && getComputedStyle(el.closest('.kfw')!).overflow === 'visible')).toBe(true);
    await expect(win(page).locator('.mpg-headset, .mpg-back, .mpg-spark')).toHaveCount(0);
    await expect(page.locator('.kfw-perch [data-holo]')).toHaveCount(0);
    expect(await page.locator('.kfw-perch').evaluate(el => getComputedStyle(el).filter)).toBe('none');
    // The dark capsule under it, centred, inside the window.
    await expect(page.locator('.kfw-name')).toHaveText('เลขากระรอก');
    expect(Math.abs(name.x + name.w / 2 - (w.x + w.w / 2))).toBeLessThanOrEqual(1);
    expect(name.y).toBeGreaterThanOrEqual(w.y);
    // Only minimise, maximise and close, in the top right, clear of the squirrel and its name.
    const controls = win(page).locator('.kfw-controls button');
    await expect(controls).toHaveCount(3);
    expect(await controls.evaluateAll(list => list.map(el => el.getAttribute('aria-label')))).toEqual(['ย่อหน้าต่าง', 'ขยายหน้าต่าง', 'ปิด']);
    const ctrl = await rectOf(page, '.kfw-controls');
    expect(overlaps(ctrl, perch) || overlaps(ctrl, name)).toBe(false);
    expect(ctrl.x + ctrl.w).toBeGreaterThan(w.x + w.w - 24);
    // The CI typeface throughout the window, and the greeting on one liquid gradient card in the CI orange.
    expect(await win(page).evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"?Prompt/);
    await expect(win(page).locator('.kfw-hero h3')).toHaveText('สวัสดีครับ คุณผู้ใช้ตัวอย่าง');
    expect(await win(page).locator('.kfw-hero').evaluate(el => getComputedStyle(el).backgroundImage)).toMatch(/rgb\(230, 95, 43\)|rgb\(194, 74, 22\)/); // #E65F2B, or #C24A16 in dark
    // The name is said once (the capsule). One mic in the composer (owner, 2026-10-27), as in the full chat.
    await expect(win(page).getByText('เลขากระรอก', { exact: true })).toHaveCount(1);
    await expect(win(page).locator('.asx-buddy-composer .asx-mic')).toHaveCount(1);
    // The questions as one grouped list with chevrons.
    const rows = win(page).getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button');
    await expect(rows.first().locator('.asx-buddy-go')).toHaveCount(1);
    const [a, b] = await rows.evaluateAll(list => list.slice(0, 2).map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; }));
    expect(Math.round(a.x)).toBe(Math.round(b.x));
    expect(b.y).toBeGreaterThan(a.y + a.h - 1);
    expect(await textOverlapIssues(page)).toEqual([]);
    await snap(page, `float-perch${dark ? '-dark' : ''}.png`);
  });
}

test('computers: the window moves and resizes inside the screen, remembers its place, and the squirrel stays in the middle', async ({ page }) => {
  await openWindow(page);
  const start = await rectOf(page, '.kfw');
  const head = await rectOf(page, '.kfw-head');
  // Drag by the header's empty part.
  await page.mouse.move(head.x + 70, head.y + 26); await page.mouse.down();
  await page.mouse.move(head.x - 330, head.y - 80, { steps: 10 }); await page.mouse.up();
  const moved = await rectOf(page, '.kfw');
  const room = 12 + Math.round(Math.min(136, Math.max(96, start.w * 0.34)) * 0.64); // the squirrel's room above the window
  expect(Math.round(moved.x)).toBe(Math.round(start.x - 400)); expect(Math.round(moved.y)).toBe(Math.max(Math.round(start.y - 106), room));
  let perch = await rectOf(page, '.kfw-perch');
  expect(Math.abs(perch.x + perch.w / 2 - (moved.x + moved.w / 2))).toBeLessThanOrEqual(1);
  // Dragging the squirrel moves the window too, and a drag never presses a button.
  await page.mouse.move(perch.x + perch.w / 2, perch.y + 20); await page.mouse.down();
  await page.mouse.move(perch.x + perch.w / 2 + 60, perch.y + 50, { steps: 6 }); await page.mouse.up();
  const byPerch = await rectOf(page, '.kfw');
  expect(Math.round(byPerch.x - moved.x)).toBe(60); expect(Math.round(byPerch.y - moved.y)).toBe(30);
  await expect(win(page)).toBeVisible();
  // Resize from the bottom-right corner and from the left edge.
  const se = await rectOf(page, '.kfw-rz.is-se');
  await page.mouse.move(se.x + se.w / 2, se.y + se.h / 2); await page.mouse.down(); await page.mouse.move(se.x + se.w / 2 + 80, se.y + se.h / 2 + 40, { steps: 6 }); await page.mouse.up();
  const grown = await rectOf(page, '.kfw');
  expect(Math.round(grown.w - byPerch.w)).toBe(80); expect(Math.round(grown.h - byPerch.h)).toBe(40);
  const west = await rectOf(page, '.kfw-rz.is-w');
  await page.mouse.move(west.x + 3, west.y + 40); await page.mouse.down(); await page.mouse.move(west.x + 400, west.y + 40, { steps: 6 }); await page.mouse.up();
  const narrow = await rectOf(page, '.kfw');
  expect(Math.round(narrow.w)).toBe(320); // never narrower than the chat reads well in
  expect(Math.round(narrow.x + narrow.w)).toBe(Math.round(grown.x + grown.w)); // the right edge stayed put
  perch = await rectOf(page, '.kfw-perch');
  expect(Math.abs(perch.x + perch.w / 2 - (narrow.x + narrow.w / 2))).toBeLessThanOrEqual(1);
  // Never off the screen, the squirrel included.
  const head2 = await rectOf(page, '.kfw-head');
  await page.mouse.move(head2.x + 40, head2.y + 26); await page.mouse.down(); await page.mouse.move(-500, -500, { steps: 8 }); await page.mouse.up();
  const corner = await rectOf(page, '.kfw');
  perch = await rectOf(page, '.kfw-perch');
  expect(corner.x).toBeGreaterThanOrEqual(12); expect(perch.y).toBeGreaterThanOrEqual(12);
  // The composer stays whole and reachable at the smallest size.
  const composer = await rectOf(page, '.kfw .asx-buddy-composer');
  expect(composer.y + composer.h).toBeLessThanOrEqual(corner.y + corner.h);
  // Remembered after a reload.
  await page.reload();
  await page.locator('.asx-buddy-btn').click();
  await expect(win(page)).toBeVisible();
  await settle(page);
  const again = await rectOf(page, '.kfw');
  expect([Math.round(again.x), Math.round(again.y), Math.round(again.w)]).toEqual([Math.round(corner.x), Math.round(corner.y), Math.round(corner.w)]);
  // The keyboard moves it too (arrows on the grip), and a double-click on the header puts it back where it started.
  await win(page).getByRole('button', { name: /^ย้ายหน้าต่าง/ }).focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  const keyed = await rectOf(page, '.kfw');
  expect(Math.round(keyed.x - again.x)).toBe(32); expect(Math.round(keyed.y - again.y)).toBe(16);
  const head3 = await rectOf(page, '.kfw-head');
  await page.mouse.dblclick(head3.x + 60, head3.y + 26);
  const reset = await rectOf(page, '.kfw');
  expect([Math.round(reset.x), Math.round(reset.y), Math.round(reset.w), Math.round(reset.h)]).toEqual([Math.round(start.x), Math.round(start.y), Math.round(start.w), Math.round(start.h)]);
});

test('computers: while เลขา works, a hologram screen rises in front of the squirrel and its paws tap on it', async ({ page }) => {
  await openWindow(page);
  await expect(page.locator('.kfw-perch [data-holo]')).toHaveCount(0);
  await win(page).getByRole('button', { name: 'ช่วยเพิ่มงานใหม่ให้หน่อย' }).click();
  await expect(page.locator('.kfw-perch [data-holo]')).toHaveCount(1);
  await expect(page.locator('.kfw-perch .mascot-tap')).toHaveCount(2);
  await snap(page, 'float-hologram.png');
  // Done: the screen goes and the paws rest on the edge again.
  await expect(win(page).locator('.asx-rcard').filter({ hasText: 'เพิ่มงานใหม่ 1 งาน' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.kfw-perch [data-holo]')).toHaveCount(0, { timeout: 6000 });
  await expect(page.locator('.kfw-perch .mascot-tap')).toHaveCount(0);
});

test('computers: minimise folds the chat into the squirrel, which keeps the conversation and its work and opens it again', async ({ page }) => {
  await openWindow(page);
  await win(page).getByRole('button', { name: 'ช่วยเพิ่มงานใหม่ให้หน่อย' }).click();
  const card = win(page).locator('.asx-rcard').filter({ hasText: 'เพิ่มงานใหม่ 1 งาน' });
  await expect(card).toBeVisible({ timeout: 10000 });
  await win(page).getByRole('button', { name: 'ย่อหน้าต่าง' }).click();
  await expect(win(page)).toBeHidden();
  await expect(page.locator('.asx-buddy-btn')).toBeHidden();
  const mini = page.getByRole('button', { name: 'เปิดแชตเลขากระรอกอีกครั้ง' });
  await expect(mini).toBeVisible(); await expect(mini).toBeFocused();
  // Its words come from what really happened: the draft waits for a yes.
  const say = page.locator('.kfw-mini-say');
  await expect(say).toContainText('นี่คือรายละเอียดที่จะบันทึกครับ', { timeout: 6000 });
  await expect(say).toHaveAttribute('role', 'status');
  const m = await rectOf(page, '.kfw-mini');
  const words = await rectOf(page, '.kfw-mini-say');
  expect(overlaps(m, words)).toBe(false);
  expect(m.x + m.w).toBeLessThanOrEqual(1280 - 12); expect(m.y + m.h).toBeLessThanOrEqual(820 - 12);
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'float-folded.png');
  // It can be dragged; a drag is not a tap.
  await page.mouse.move(m.x + m.w / 2, m.y + m.h / 2); await page.mouse.down(); await page.mouse.move(m.x + m.w / 2 - 300, m.y + m.h / 2 - 200, { steps: 8 }); await page.mouse.up();
  await expect(win(page)).toBeHidden();
  const dragged = await rectOf(page, '.kfw-mini');
  expect([Math.round(m.x - dragged.x), Math.round(m.y - dragged.y)]).toEqual([300, 200]);
  // A tap opens the window again with everything as it was.
  await mini.click();
  await expect(win(page)).toBeVisible();
  await settle(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'บันทึกงาน' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'เปิดแชตเลขากระรอกอีกครั้ง' })).toHaveCount(0);
  // Maximise and back.
  const before = await rectOf(page, '.kfw');
  await win(page).getByRole('button', { name: 'ขยายหน้าต่าง' }).click();
  const big = await rectOf(page, '.kfw');
  expect(big.w).toBeGreaterThan(before.w + 300);
  const perch = await rectOf(page, '.kfw-perch');
  expect(perch.y).toBeGreaterThanOrEqual(12);
  await win(page).getByRole('button', { name: 'คืนขนาด' }).click();
  const back = await rectOf(page, '.kfw');
  expect([Math.round(back.x), Math.round(back.y), Math.round(back.w), Math.round(back.h)]).toEqual([Math.round(before.x), Math.round(before.y), Math.round(before.w), Math.round(before.h)]);
  // Close returns to the pill; Escape closes only from inside the window.
  await page.locator('#main-content').click({ position: { x: 40, y: 400 } });
  await page.keyboard.press('Escape');
  await expect(win(page)).toBeVisible();
  await win(page).getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).focus();
  await page.keyboard.press('Escape');
  await expect(win(page)).toHaveCount(0);
  await expect(page.locator('.asx-buddy-btn')).toBeFocused();
});

test('computers: the chat keeps clear of a document preview, folds when there is no room, and goes back when it closes', async ({ page }) => {
  await openWindow(page, '/jobs', 1365, 860);
  const home = await rectOf(page, '.kfw');
  const footprint = async () => { const w = await rectOf(page, '.kfw'); const p = await rectOf(page, '.kfw-perch'); return { x: w.x, y: p.y, w: w.w, h: w.y + w.h - p.y }; };
  const preview = (box: { left: number; top: number; width: number; height: number }) => page.evaluate(b => {
    const el = document.createElement('div');
    el.id = 'fake-preview'; el.dataset.krarokAvoid = 'document';
    Object.assign(el.style, { position: 'fixed', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, background: 'rgba(0,0,0,0.05)' });
    document.body.appendChild(el);
  }, box);
  const close = () => page.evaluate(() => document.getElementById('fake-preview')?.remove());
  // A preview on the right half: the window moves to the left of it, its squirrel included.
  await preview({ left: 700, top: 0, width: 665, height: 860 });
  await expect.poll(async () => (await footprint()).x + (await footprint()).w <= 700 - 12).toBe(true);
  const zone = await rectOf(page, '#fake-preview');
  expect(overlaps(await footprint(), zone)).toBe(false);
  await snap(page, 'float-avoid.png');
  // Closed: back where it was.
  await close();
  await expect.poll(async () => Math.round((await rectOf(page, '.kfw')).x)).toBe(Math.round(home.x));
  // A preview that leaves no room: the chat folds into the squirrel, which sits clear of it, and opens again afterwards.
  await preview({ left: 60, top: 60, width: 1150, height: 740 });
  await expect(win(page)).toBeHidden({ timeout: 3000 });
  const mini = await rectOf(page, '.kfw-mini');
  expect(overlaps(mini, await rectOf(page, '#fake-preview'))).toBe(false);
  await close();
  await expect(win(page)).toBeVisible({ timeout: 3000 });
  await settle(page);
  expect(Math.round((await rectOf(page, '.kfw')).x)).toBe(Math.round(home.x));
  // Moved by the user during a preview: it stays where they put it, during the preview and after it.
  await preview({ left: 700, top: 0, width: 665, height: 860 });
  await expect.poll(async () => (await footprint()).x + (await footprint()).w <= 700 - 12).toBe(true);
  const head = await rectOf(page, '.kfw-head');
  await page.mouse.move(head.x + 60, head.y + 26); await page.mouse.down(); await page.mouse.move(head.x + 160, head.y + 26, { steps: 5 }); await page.mouse.up();
  const placed = await rectOf(page, '.kfw');
  await page.waitForTimeout(700);
  expect(Math.round((await rectOf(page, '.kfw')).x)).toBe(Math.round(placed.x));
  await close(); await page.waitForTimeout(700);
  expect(Math.round((await rectOf(page, '.kfw')).x)).toBe(Math.round(placed.x));
});

test('computers: on the real documents page the chat opens clear of the document and its buttons', async ({ page }) => {
  const profile = { name: 'สตูดิโอกระรอกน้อย', address: 'กรุงเทพฯ', phone: '', email: 'a@example.com', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
  const quote = { id: 'qt-1', documentType: 'quotation', documentNo: 'QT-2569-001', createdDate: '2026-10-20', issuer: profile, client: { name: 'บริษัท ตัวอย่าง จำกัด', address: '', phone: '', email: '', taxId: '' }, items: [{ id: 'i1', description: 'ตัดต่อวิดีโอ', quantity: 1, price: 15000 }], vatRate: 0, whtRate: 0 };
  await open(page, 1440, 900, { path: '/dashboard', snapshot: { invoices: [quote], issuer_profile: profile }, versions: { cashflow_invoices: { 'qt-1': 1 } } });
  await page.locator('aside.app-sidebar').getByRole('button', { name: 'เอกสาร', exact: true }).click();
  await page.getByText('QT-2569-001').first().click();
  const pane = page.locator('[data-krarok-avoid="document"]').first();
  await expect(pane).toBeVisible();
  await page.locator('.asx-buddy-btn').click();
  await expect(win(page)).toBeVisible();
  await expect.poll(async () => { const w = await rectOf(page, '.kfw'); const p = await rectOf(page, '.kfw-perch'); const d = await pane.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }); return overlaps({ x: w.x, y: p.y, w: w.w, h: w.y + w.h - p.y }, d); }).toBe(false);
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด PDF' })).toBeVisible();
  const paper = new Set(await page.locator('[data-testid="document-preview"]').first().evaluate(el => [...el.querySelectorAll('*')].map(n => (n.textContent || '').trim().slice(0, 40)).filter(Boolean)));
  expect((await textOverlapIssues(page)).filter(issue => !(paper.has(issue.a) && (!issue.b || paper.has(issue.b))))).toEqual([]);
  await snap(page, 'float-documents.png');
});

test('dark mode and reduced motion: the status card and its words', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 1280, 820, { path: '/dashboard', dark: true });
  const button = page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' });
  await button.click();
  await panel(page).getByRole('button', { name: 'สรุปเดือนนี้' }).click();
  await page.keyboard.press('Escape');
  await page.mouse.move(400, 300);
  // Reduced motion: the answer's words are there at once, not typed.
  await expect(say(page)).toHaveAttribute('data-kind', 'answered', { timeout: 10000 });
  // An answer that is only a LINE card is said from the card (its one-line banner text), never "คำตอบพร้อมแล้ว".
  await expect(say(page)).toHaveClass(/is-said/);
  await expect(typed(page)).not.toHaveText('คำตอบพร้อมแล้ว');
  const words = await say(page).locator('.asx-climb-ghost').textContent();
  expect(words?.length).toBeGreaterThan(10);
  await expect(typed(page)).toHaveText(words!);
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'buddy-status-dark.png');
});

test('phones keep their round squirrel: no status card above it', async ({ page }) => {
  await open(page, 390, 844, { path: '/dashboard' });
  const button = page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' });
  await button.click();
  const sheet = panel(page);
  await sheet.getByRole('button', { name: 'หน้านี้ใช้ทำอะไร' }).click();
  await sheet.getByRole('button', { name: 'ปิด', exact: true }).click();
  await page.waitForTimeout(2500);
  await expect(say(page)).toHaveCount(0);
  await expect(page.locator('.mascot-climb')).toHaveCount(0);
});

test('very wide screens: the window floats over the page, which keeps its full width', async ({ page }) => {
  await open(page, 1800, 900, { path: '/jobs' });
  const before = (await page.locator('#main-content').boundingBox())!.width;
  await page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้างาน' }).click();
  const chat = panel(page);
  await expect(chat).toBeVisible();
  await expect(chat).toHaveAttribute('aria-modal', 'false');
  await expect(page.locator('.asx-buddy-scrim')).toHaveCount(0);
  expect((await page.locator('#main-content').boundingBox())!.width).toBe(before);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('phones: the squirrel waits above the bottom bar, opens a sheet, and steps aside for เมนู', async ({ page }) => {
  await open(page, 390, 844, { path: '/dashboard' });
  const button = page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' });
  await expect(button).toBeVisible();
  const nav = (await page.getByRole('navigation', { name: 'เมนูหลัก' }).boundingBox())!;
  const box = (await button.boundingBox())!;
  expect(box.y + box.height).toBeLessThan(nav.y);
  expect(390 - (box.x + box.width)).toBeLessThan(24);
  expect(await textOverlapIssues(page)).toEqual([]);
  await button.click();
  const sheet = panel(page);
  await expect(sheet).toBeVisible();
  const sheetBox = (await sheet.boundingBox())!;
  expect(Math.round(sheetBox.width)).toBe(390);
  expect(Math.round(sheetBox.y + sheetBox.height)).toBeGreaterThanOrEqual(843);
  await sheet.getByRole('button', { name: 'หน้านี้ใช้ทำอะไร' }).click();
  await expect(sheet.locator('.asx-md').last()).toContainText('ภาพรวมรายรับ รายจ่าย', { timeout: 10000 });
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'buddy-390-sheet.png');
  await sheet.getByRole('button', { name: 'ปิด', exact: true }).click();
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'เมนู', exact: true }).click();
  await expect(buddy(page)).toHaveCount(0);
});

test('without Pro the squirrel does not follow you', async ({ page }) => {
  await open(page, 1280, 820, { role: 'user', free: true, path: '/jobs' });
  await expect(page.locator('aside.app-sidebar').getByRole('button', { name: 'งาน', exact: true })).toBeVisible();
  await expect(buddy(page)).toHaveCount(0);
  expect(await page.locator('#main-content').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom))).toBeLessThan(100);
});

// Owner, 2026-10-23: the squirrel's arrival plays only right after paying for Pro ("ขึ้นเฉพาะตอนที่เพิ่งเติมโปรเสร็จ
// ... ถ้าขึ้นทุกครั้งมันจะดูน่ารำคาญ"). It is formal, after OpenAI's launch for dots ("ไม่ใช่เกม ... เหมือนนักบัญชี
// หรือเลขาที่พร้อมเข้ามาช่วย"): a doorway of light over a horizon, soft orbs, the squirrel in its Pro outfit, and a
// greeting that types itself out.
const stageOf = (page: Page) => page.getByRole('dialog', { name: 'เลขากระรอกพร้อมช่วยงานคุณแล้ว' });

test('the arrival plays only after a confirmed payment, once its success message is closed; never on an ordinary visit', async ({ page }) => {
  await open(page, 1280, 820, { path: '/dashboard' });
  await expect(page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.kb-stage')).toHaveCount(0); // a Pro visit: nothing plays
  await page.reload();
  await expect(page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.locator('.kb-stage')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('krarok_born')))).toEqual([]);
});

test('paying: success message first, then the squirrel arrives on the same page and lands at its corner', async ({ page }) => {
  const paid = { checkout_ready: true, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z', cancel_at_period_end: false, stripe_status: 'active', has_subscription: true, intro_eligible: false, managed: false } };
  await open(page, 1280, 820, { free: true, billing: paid, path: '/plans?checkout=success&session_id=cs_test_arrival' });
  const success = page.getByRole('heading', { name: 'สมัครสมาชิกสำเร็จ!' });
  await expect(success).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.kb-stage')).toHaveCount(0); // never on top of the message
  await page.getByRole('button', { name: 'ตกลง', exact: true }).click();
  const stage = stageOf(page);
  await expect(stage).toBeVisible();
  await expect(stage.locator('.kb-door')).toHaveCount(1);
  await expect(stage.locator('.kb-figure .mpg-headset')).toHaveCount(1); // the Pro outfit (owner chose ก.)
  await expect(stage.getByText(/%/)).toHaveCount(0); // no loading counter: not a game
  await expect(stage.getByRole('heading', { name: 'สวัสดีครับ คุณผู้ใช้ตัวอย่าง' })).toBeVisible({ timeout: 5000 });
  await expect(stage.getByText('เลขากระรอกพร้อมช่วยดูแลงาน เอกสาร และการเงินของคุณแล้ว')).toBeVisible({ timeout: 4000 });
  await expect(stage.getByText('ผู้ช่วยส่วนตัว')).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'arrival-1280-hello.png');
  // Owner, 2026-10-24 ("ให้มันคอนติเนียกัน ... มูฟลงไปแล้วก็ค่อยขยายออก"): the corner pill waits folded round the
  // squirrel's picture while the scene plays, the squirrel lands on that picture, then the pill opens out.
  const more = page.locator('.asx-buddy-more');
  expect(await more.evaluate(el => el.getBoundingClientRect().width)).toBe(0);
  await expect(stage).toHaveCount(0, { timeout: 10000 });
  await expect.poll(() => more.evaluate(el => el.getBoundingClientRect().width), { timeout: 3000 }).toBeGreaterThan(100);
  await expect.poll(() => page.locator('.asx-buddy-more-in').evaluate(el => Number(getComputedStyle(el).opacity)), { timeout: 3000 }).toBe(1);
  await expect(page.getByRole('button', { name: /^ถามเลขากระรอกเรื่องหน้า/ })).toBeVisible();
  const tip = page.locator('.asx-buddy-tip');
  await expect(tip).toContainText('แตะผมได้ทุกหน้า');
  await expect(tip.locator('svg.lucide-mouse-pointer-click')).toHaveCount(1);
  await expect(tip.locator('svg.lucide-sparkles')).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('the greeting types itself out letter by letter, keeping Thai marks whole and the line still', async ({ page }) => {
  await open(page, 1280, 820, { path: '/dashboard?hello=krarok' });
  const stage = stageOf(page);
  await expect(stage).toBeVisible();
  await expect(page).not.toHaveURL(/hello=krarok/);
  // Watch it in the page, every frame, from the first letter until the last.
  const samples = await page.evaluate(() => new Promise<{ text: string; rest: string; left: number }[]>(resolve => {
    const seen: { text: string; rest: string; left: number }[] = [];
    const started = performance.now();
    const tick = () => {
      const el = document.querySelector('.kb-hello h2 > span[aria-hidden]');
      if (el) {
        const text = el.firstChild?.nodeType === 3 ? el.firstChild.textContent ?? '' : '';
        const rest = el.querySelector('.kb-untyped')?.textContent ?? '';
        if (text && (!seen.length || seen[seen.length - 1].text !== text)) seen.push({ text, rest, left: el.getBoundingClientRect().left });
        if (text && !rest) { resolve(seen); return; }
      }
      if (performance.now() - started > 8000) { resolve(seen); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  expect(samples.length).toBeGreaterThan(8); // it grows letter by letter
  // Each step ends on a whole Thai letter: what is still to come never starts with a vowel or tone mark.
  for (const sample of samples) expect(sample.rest).not.toMatch(/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/);
  const lefts = samples.map(sample => sample.left);
  expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThan(1.5); // the line never shifts (letter shaping may move it a fraction of a pixel)
  await expect(stage.getByRole('heading', { name: 'สวัสดีครับ คุณผู้ใช้ตัวอย่าง' })).toBeVisible();
});

test('the arrival can be skipped, and with reduced motion it is a calm hello', async ({ page }) => {
  await open(page, 390, 844, { path: '/dashboard?hello=krarok' });
  const stage = stageOf(page);
  await expect(stage).toBeVisible();
  await stage.getByRole('button', { name: 'ข้าม' }).click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' })).toBeVisible();
  await expect(page.locator('.asx-buddy-tip svg.lucide-pointer')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard?hello=krarok');
  await expect(stage).toBeVisible();
  await expect(page.locator('.kb-stage.is-calm')).toHaveCount(1);
  await expect(stage.getByRole('heading', { name: /^สวัสดีครับ/ })).toBeVisible();
  await expect(stage.getByText('เลขากระรอกพร้อมช่วยดูแลงาน เอกสาร และการเงินของคุณแล้ว')).toBeVisible();
  await expect(stage).toHaveCount(0, { timeout: 5000 });
});

test('removed for the redo: no automatic Pro promo for accounts without Pro', async ({ page }) => {
  await open(page, 1280, 820, { free: true, path: '/dashboard' });
  await expect(page.locator('#dashboard-top')).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('฿177')).toHaveCount(0);
});
