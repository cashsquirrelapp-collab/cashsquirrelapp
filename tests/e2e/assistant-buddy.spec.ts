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

async function open(page: Page, width: number, height: number, options: { role?: 'admin' | 'user'; dark?: boolean; path?: string; free?: boolean; billing?: unknown } = {}) {
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
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: options.free ? null : { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
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
  // The Pro squirrel (owner chose ก. Pro เลขา): the headset on the corner squirrel and the sidebar icon.
  await expect(button.locator('.mpg-headset')).toHaveCount(1);
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
  await expect(chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button')).toHaveText(['ช่วยเพิ่มงานใหม่ให้หน่อย', 'ตรวจงานที่ยังไม่ได้รับเงิน', 'หน้านี้ใช้ทำอะไร', 'สรุปเดือนนี้', 'รอรับเงิน', 'กำลังดำเนินการ']);
  // Ordinary computers: the panel docks at the right as a side sheet over a dimmed, blurred page, which keeps its own
  // width (a narrower page broke tables that size themselves by the screen; a clear page left text peeking out).
  const panelBox = (await chat.boundingBox())!;
  expect(Math.round(1280 - (panelBox.x + panelBox.width))).toBeLessThanOrEqual(14);
  expect(Math.round(panelBox.height)).toBeGreaterThan(780);
  await expect(chat).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.asx-buddy-scrim.is-side')).toBeVisible();
  expect(Math.round((await page.locator('#main-content').boundingBox())!.width)).toBe(mainWidth);
  expect(await chat.evaluate(el => parseFloat(getComputedStyle(el).backgroundColor.match(/[\d.]+(?=\)$)/)?.[0] ?? '1'))).toBeGreaterThan(0.9);
  await expect(chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' })).toBeFocused();
  expect(await textOverlapIssues(page)).toEqual([]);
  // It prepares an action to confirm, like a coworker; confirming changes nothing (sample).
  await chat.getByRole('button', { name: 'ช่วยเพิ่มงานใหม่ให้หน่อย' }).click();
  const card = chat.locator('.asx-rcard').filter({ hasText: 'เพิ่มงานใหม่ 1 งาน' });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole('button', { name: 'ยืนยัน' }).click();
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
  // On another page it knows that page; "เปิดแชตเต็ม" opens the chat, where it steps aside.
  await page.locator('aside.app-sidebar').getByRole('button', { name: 'ภาพรวม' }).click();
  await page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้าภาพรวม' }).click();
  await expect(panel(page)).toContainText('กำลังดูหน้าภาพรวม');
  await panel(page).getByRole('button', { name: 'เปิดแชตเต็ม' }).click();
  await expect(page).toHaveURL(/\/assistant/);
  await expect(buddy(page)).toHaveCount(0);
  expect(calls.filter(call => /openai|anthropic|gemini|line\.me|\/api\/(ai|assistant|chat)/i.test(call))).toEqual([]);
});

test('very wide screens: the page makes room beside the docked panel and stays wide enough for its tables', async ({ page }) => {
  await open(page, 1800, 900, { path: '/jobs' });
  await page.getByRole('button', { name: 'ถามเลขากระรอกเรื่องหน้างาน' }).click();
  const chat = panel(page);
  await expect(chat).toBeVisible();
  await expect(chat).toHaveAttribute('aria-modal', 'false');
  await expect(page.locator('.asx-buddy-scrim')).toHaveCount(0);
  const panelBox = (await chat.boundingBox())!;
  await expect.poll(async () => { const box = (await page.locator('#main-content').boundingBox())!; return box.x + box.width <= panelBox.x + 1; }).toBe(true);
  expect((await page.locator('#main-content').boundingBox())!.width).toBeGreaterThanOrEqual(1000);
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
  await expect(stage).toHaveCount(0, { timeout: 10000 });
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
  await expect(page.getByText('฿159')).toHaveCount(0);
});
