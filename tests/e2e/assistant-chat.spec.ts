import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// เลขากระรอก chat workspace (owner's brief "KRAROK — AI SECRETARY CHAT UI BRIEF", 2026-10-23): ChatGPT/Dot-style
// chat with a history sidebar, a slim glass header, a floating glass composer, Markdown answers, sample
// result cards, a token indicator and every UI state of §11. Screen only and admins only for now: nothing
// calls an AI, billing or the backend, and every sample is labelled.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'assistant@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, width: number, height: number, options: { role?: 'admin' | 'user'; dark?: boolean; path?: string; free?: boolean } = {}) {
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
  await page.setViewportSize({ width, height });
  await page.goto(options.path ?? '/assistant');
  return calls;
}

const chatOf = (page: Page) => page.locator('section.asx');
const snap = async (page: Page, name: string) => { await page.waitForTimeout(420); await page.screenshot({ path: test.info().outputPath(name) }); };
const pickState = async (page: Page, label: string) => {
  await chatOf(page).getByRole('button', { name: 'จัดการแชต' }).click();
  await page.getByRole('menuitemradio', { name: label }).click();
  await expect(page.getByRole('menu', { name: 'จัดการแชต' })).toHaveCount(0);
};

for (const [label, width, height] of [['phone', 390, 844], ['iPad', 820, 1180], ['computer', 1280, 820], ['wide computer', 1440, 900]] as const) {
  test(`${label} ${width}px: welcome, a streamed Markdown answer with its card, history and tokens, no overlapping text`, async ({ page }) => {
    const calls = await open(page, width, height);
    const chat = chatOf(page);
    await expect(chat.getByRole('heading', { name: 'เลขากระรอก', exact: true })).toBeVisible();
    await expect(chat.getByRole('heading', { name: 'วันนี้อยากให้เลขากระรอกช่วยอะไร?' })).toBeVisible();
    await expect(chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button')).toHaveCount(4);
    // The header is slim (owner: the top took too much room).
    expect((await chat.locator('.asx-bar').boundingBox())!.height).toBeLessThan(66);
    // Attach and microphone are clearly not ready; send waits for text.
    await expect(chat.getByRole('button', { name: 'แนบไฟล์ · เร็ว ๆ นี้' })).toHaveAttribute('aria-disabled', 'true');
    await expect(chat.getByRole('button', { name: 'พูดแทนการพิมพ์ · เร็ว ๆ นี้' })).toHaveAttribute('aria-disabled', 'true');
    await expect(chat.getByRole('button', { name: 'ส่งข้อความ' })).toBeDisabled();
    await expect(chat.locator('.asx-bar-status')).toHaveText(/พร้อมช่วยแล้ว/, { timeout: 6000 });
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await snap(page, `assistant-${width}-welcome.png`);

    // A suggestion asks; the squirrel thinks, then the answer streams in as Markdown with a sample card.
    await chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'สรุปงานของวันนี้' }).click();
    await expect(chat.locator('.asx-msg.is-me .asx-bubble').last()).toHaveText('สรุปงานของวันนี้');
    await expect(chat.getByRole('img', { name: 'เลขากระรอกกำลังคิด' })).toBeVisible();
    await expect(chat.locator('.asx-md table')).toBeVisible({ timeout: 10000 });
    await expect(chat.locator('.asx-rcard').filter({ hasText: 'สรุปการเงิน' })).toBeVisible({ timeout: 10000 });
    await expect(chat.locator('.asx-msg.is-bot .asx-meta').last()).toContainText('คำตอบตัวอย่าง');
    await expect(chat.locator('.asx-msg.is-me .asx-meta').last()).toContainText('อ่านแล้ว');
    const left = Number((await chat.locator('.asx-token span').textContent())!.replace(/,/g, ''));
    expect(left).toBeLessThan(730);
    await expect(chat.locator('.asx-bar-status')).toHaveText(/พร้อมช่วยแล้ว/, { timeout: 6000 });
    expect(await textOverlapIssues(page)).toEqual([]);
    await snap(page, `assistant-${width}-answer.png`);

    // History: search, no results, and opening a sample conversation (skeleton first, then its banner).
    if (!(await chat.locator('.asx-side.is-open').count())) await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
    const side = chat.getByRole('complementary', { name: 'ประวัติแชต' });
    await expect(side.getByRole('button', { name: /^งานที่ยังไม่ได้รับเงิน/ })).toBeVisible();
    await side.getByPlaceholder('ค้นหาแชต').fill('zzz');
    await expect(side.getByText('ไม่พบแชตที่ตรงกับ “zzz”')).toBeVisible();
    await side.getByPlaceholder('ค้นหาแชต').fill('ใบเสนอ');
    await expect(side.locator('.asx-side-item')).toHaveCount(1);
    await side.getByPlaceholder('ค้นหาแชต').fill('');
    expect(await textOverlapIssues(page)).toEqual([]);
    await snap(page, `assistant-${width}-history.png`);
    await side.getByRole('button', { name: /^งานที่ยังไม่ได้รับเงิน/ }).click();
    await expect(chat.getByText('บทสนทนาตัวอย่าง · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ')).toBeVisible();
    await expect(chat.locator('.asx-md ol li')).toHaveCount(2);

    // Tokens: the compact indicator opens its (sample) details.
    await chat.locator('.asx-token').click();
    const pop = page.getByRole('dialog', { name: 'Krarok Tokens' });
    await expect(pop.getByText('จาก 1,000 โทเค็นต่อรอบ')).toBeVisible();
    await expect(pop.getByText(/^เติมรอบใหม่/)).toBeVisible();
    await expect(pop.getByText('ข้อมูลตัวอย่าง')).toBeVisible();
    expect(await textOverlapIssues(page)).toEqual([]);
    await snap(page, `assistant-${width}-tokens.png`);
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);

    expect(calls.filter(call => /openai|anthropic|gemini|googleapis\.com\/v1|\/api\/(ai|assistant|chat)/i.test(call))).toEqual([]);
  });
}

test('every UI state from the brief can be previewed and behaves', async ({ page }) => {
  await open(page, 1280, 820);
  const chat = chatOf(page);
  await pickState(page, 'โทเค็นใกล้หมด');
  await expect(chat.locator('.asx-notice.is-low')).toContainText('โทเค็นใกล้หมด');
  await expect(chat.locator('.asx-token span')).toHaveText('64');
  await snap(page, 'assistant-state-low.png');
  await pickState(page, 'โทเค็นหมด');
  await expect(chat.locator('.asx-notice.is-empty')).toContainText('โทเค็นรอบนี้หมดแล้ว');
  await expect(chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' })).toBeDisabled();
  // Without Pro it is a try mode (owner, 2026-10-23): the notice says so and the token counter steps aside.
  await pickState(page, 'ช่วงทดลองใช้หมดอายุ');
  await expect(chat.locator('.asx-notice.is-try')).toContainText('ช่วงทดลองใช้ Pro สิ้นสุดแล้ว · กดคำถามตัวอย่างได้');
  await expect(chat.locator('.asx-notice.is-try').getByRole('button', { name: 'ดูแพ็กเกจ Pro' })).toBeVisible();
  await expect(chat.locator('.asx-token')).toHaveCount(0);
  await snap(page, 'assistant-state-trial.png');
  await pickState(page, 'ต้องใช้ Pro');
  await expect(chat.locator('.asx-notice.is-try')).toContainText('โหมดทดลอง · กดคำถามตัวอย่างได้ พิมพ์ถามเองต้องใช้ Pro');
  expect(await textOverlapIssues(page)).toEqual([]);

  // Connection error, then retry. Shift+Enter is a new line; Enter sends.
  await pickState(page, 'การเชื่อมต่อล้มเหลว');
  const box = chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' });
  await box.fill('สวัสดี');
  await box.press('Shift+Enter');
  await expect(box).toHaveValue('สวัสดี\n');
  await box.press('Enter');
  await expect(chat.getByRole('alert')).toContainText('ส่งไม่สำเร็จ', { timeout: 8000 });
  await snap(page, 'assistant-state-offline.png');
  await pickState(page, 'ปกติ');
  await chat.getByRole('alert').getByRole('button', { name: 'ลองอีกครั้ง' }).click();
  await expect(chat.locator('.asx-msg.is-bot .asx-md').last()).toContainText('หน้าจอตัวอย่าง', { timeout: 10000 });

  // Confirmation: a failure, retried to success.
  await pickState(page, 'ทำรายการไม่สำเร็จ');
  if (!(await chat.locator('.asx-side.is-open').count())) await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
  await chat.getByRole('complementary', { name: 'ประวัติแชต' }).getByRole('button', { name: /^เพิ่มงานถ่ายภาพแคมเปญ/ }).click();
  const card = chat.locator('.asx-rcard').filter({ hasText: 'เพิ่มงานใหม่ 1 งาน' });
  await card.getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(card.getByText('ทำรายการไม่สำเร็จ')).toBeVisible({ timeout: 6000 });
  await pickState(page, 'ปกติ');
  await card.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
  await expect(card.getByText('ยืนยันแล้ว (ตัวอย่าง) · ยังไม่มีการเปลี่ยนแปลงข้อมูลจริง')).toBeVisible({ timeout: 6000 });
  await expect(chat.locator('.asx-rcard').filter({ hasText: 'โปรเจกต์' })).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-state-confirmed.png');

  // A link in an answer opens the page inside the app.
  await chat.locator('.asx-new').click();
  await chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'วิธีเพิ่มโปรเจกต์' }).click();
  await expect(chat.locator('.asx-msg.is-me .asx-bubble').last()).toHaveText('ช่วยอธิบายวิธีเพิ่มโปรเจกต์'); // the card asks the full question
  await chat.locator('.asx-md a', { hasText: 'หน้างาน' }).click({ timeout: 10000 });
  await expect(page).toHaveURL(/\/jobs/);
});

test('the squirrel naps after a while with nothing happening, and typing wakes it', async ({ page }) => {
  await page.clock.install();
  await open(page, 1280, 820);
  const status = chatOf(page).locator('.asx-bar-status');
  await page.clock.runFor(3000);
  await expect(status).toHaveText(/พร้อมช่วยแล้ว/);
  await page.clock.runFor(31_000);
  await expect(status).toHaveText(/งีบอยู่/);
  await expect(chatOf(page).locator('.asx-welcome .asx-figure.is-sleeping')).toBeVisible();
  await page.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('สวัสดี');
  await expect(status).toHaveText(/กำลังฟังอยู่/);
});

// Owner, 2026-10-23: "เปิดให้สมาชิกทั่วไปเห็นหน้าแชตด้วย". Members open the chat like admins; the team's preview
// tools (state previews, a simulated notification) stay with admins.
test('members see the chat in the sidebar and the phone menu, without the team preview tools', async ({ page }) => {
  await open(page, 1280, 820, { role: 'user', path: '/jobs' });
  const entry = page.locator('aside.app-sidebar').getByRole('button', { name: 'เลขากระรอก' });
  await expect(entry).toBeVisible();
  await entry.click();
  const chat = chatOf(page);
  await expect(page).toHaveURL(/\/assistant/);
  await expect(chat.getByRole('heading', { name: 'วันนี้อยากให้เลขากระรอกช่วยอะไร?' })).toBeVisible();
  await expect(chat.getByText('ตัวอย่างหน้าจอ · คำตอบเป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อ AI')).toBeVisible();
  await chat.getByRole('button', { name: 'จัดการแชต' }).click();
  const menu = page.getByRole('menu', { name: 'จัดการแชต' });
  await expect(menu.getByRole('menuitem', { name: 'แชตใหม่' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'จำลองแจ้งเตือนเข้า' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'สรุปงานของวันนี้' }).click();
  await expect(chat.locator('.asx-md table')).toBeVisible({ timeout: 10000 });
  expect(await textOverlapIssues(page)).toEqual([]);
  // Phones: the entry sits in the LINE AI Pro section of เมนู.
  await open(page, 390, 844, { role: 'user', path: '/dashboard' });
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'เมนู', exact: true }).click();
  const tools = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  await tools.locator('summary', { hasText: 'LINE AI Pro' }).click();
  await tools.getByRole('button', { name: /^เลขากระรอก/ }).click();
  await expect(chatOf(page).getByRole('heading', { name: 'วันนี้อยากให้เลขากระรอกช่วยอะไร?' })).toBeVisible();
});

test('dark mode, phone and computer: the chat reads clearly and no text overlaps', async ({ page }) => {
  for (const [width, height] of [[390, 844], [1280, 820]] as const) {
    await open(page, width, height, { dark: true });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await chatOf(page).getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'งานที่ยังไม่ได้รับเงิน' }).click();
    await expect(chatOf(page).locator('.asx-md ol li')).toHaveCount(2, { timeout: 10000 });
    expect(await textOverlapIssues(page)).toEqual([]);
    await snap(page, `assistant-dark-${width}.png`);
  }
});

test('phone: the chat takes the whole screen, history is a drawer, and the feature wears the squirrel', async ({ page }) => {
  await open(page, 390, 844);
  const chat = chatOf(page);
  await expect(chat.getByRole('heading', { name: 'เลขากระรอก', exact: true })).toBeVisible();
  const area = (await chat.boundingBox())!;
  expect(area.y).toBeLessThanOrEqual(1);
  expect(area.height).toBeGreaterThan(830);
  await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
  await expect(chat.locator('.asx-side.is-overlay.is-open')).toBeVisible();
  await snap(page, 'assistant-390-drawer.png');
  await chat.getByRole('button', { name: 'ปิดแถบประวัติแชต' }).click({ position: { x: 370, y: 420 } }); // outside the drawer
  await chat.getByRole('button', { name: 'กลับไปเมนู' }).click();
  const menu = page.getByRole('region', { name: 'เครื่องมือทั้งหมด' });
  await menu.locator('summary', { hasText: 'LINE AI Pro' }).click();
  await expect(menu.getByRole('button', { name: /^เลขากระรอก/ }).locator('.ksm-row-icon.is-mark svg')).toBeVisible();
});

// Owner, 2026-10-23 (option ข.): on computers the app's sidebar slides away while the chat is open, so only
// the chat's own history sidebar shows; "กลับ" (or the arrow in the header) returns to the page you came from.
test('computer: the sidebar entry wears the squirrel; the chat folds the app sidebar away and กลับ brings it back', async ({ page }) => {
  await open(page, 1280, 820, { path: '/jobs' });
  const appSidebar = page.locator('aside.app-sidebar');
  const entry = appSidebar.getByRole('button', { name: 'เลขากระรอก' });
  await expect(entry.locator('svg ellipse').first()).toBeVisible();
  const motion = page.evaluate(() => new Promise<number[]>(done => {
    const side = document.querySelector('aside.app-sidebar')!; const seen: number[] = []; const t0 = performance.now();
    const tick = () => { seen.push(parseFloat(getComputedStyle(side).marginLeft)); if (performance.now() - t0 < 600) requestAnimationFrame(tick); else done(seen); };
    tick();
  }));
  await entry.click();
  const chat = chatOf(page);
  await expect(chat.getByRole('heading', { name: 'เลขากระรอก', exact: true })).toBeVisible();
  // It slides (in-between positions were drawn), it does not jump.
  const margins = await motion;
  expect(margins.some(m => m < -20 && m > -220)).toBe(true);
  await expect(appSidebar).toHaveClass(/is-folded/);
  await expect(appSidebar).toHaveCSS('visibility', 'hidden');
  await expect(appSidebar).toHaveAttribute('inert', '');
  // Folded away, it is hidden from screen readers too, and still marks where you are for when it returns.
  await expect(appSidebar).toHaveAttribute('aria-hidden', 'true');
  await expect(appSidebar.getByRole('button', { name: 'เลขากระรอก', includeHidden: true })).toHaveAttribute('aria-current', 'page');
  // One sidebar only: the chat sits 12px from the window edges, its history sidebar on the left.
  const area = (await chat.boundingBox())!;
  expect(Math.round(area.x)).toBe(12);
  expect(Math.round(area.y)).toBe(12);
  expect(Math.round(1280 - area.x - area.width)).toBe(12);
  await expect(chat.locator('.asx-side.is-open .asx-back')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-1280-focus.png');
  // Hiding the history moves the way out into the header.
  await chat.getByRole('button', { name: 'ย่อแถบประวัติแชต' }).click();
  await expect(chat.locator('.asx-bar').getByRole('button', { name: 'กลับ', exact: true })).toBeVisible();
  await chat.locator('.asx-bar').getByRole('button', { name: 'กลับ', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect(appSidebar).not.toHaveClass(/is-folded/);
  await expect(appSidebar).toHaveCSS('visibility', 'visible');
  await expect(appSidebar.getByRole('button', { name: 'งาน', exact: true })).toHaveAttribute('aria-current', 'page');
  // Back in, then out through the history sidebar's own กลับ.
  await entry.click();
  await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
  await chat.locator('.asx-side.is-open .asx-back').click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect(appSidebar).toHaveCSS('visibility', 'visible');
});

test('the welcome questions are four equal cards in a 2 × 2 grid, on computers and phones', async ({ page }) => {
  for (const [width, height] of [[1280, 820], [390, 844]] as const) {
    await open(page, width, height);
    const cards = chatOf(page).getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button');
    await expect(cards).toHaveCount(4);
    const boxes = await cards.evaluateAll(list => list.map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
    expect(new Set(boxes.map(b => b[2])).size).toBe(1); // equal widths
    expect(boxes[0][1]).toBe(boxes[1][1]); expect(boxes[2][1]).toBe(boxes[3][1]); // two rows
    expect(boxes[0][0]).toBe(boxes[2][0]); expect(boxes[1][0]).toBe(boxes[3][0]); // two columns
    expect(boxes[2][1]).toBeGreaterThan(boxes[0][1]);
    expect(await textOverlapIssues(page)).toEqual([]);
  }
});

// Owner's typography brief (2026-10-23): light, natural Thai text with a clear hierarchy, chat page only.
test('typography: the app font with real weights only (400 reading, 500 emphasis, 600 titles), Thai line height, no tiny text', async ({ page }) => {
  for (const [width, height] of [[1280, 820], [390, 844]] as const) {
    await open(page, width, height);
    const chat = chatOf(page);
    await chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'สรุปงานของวันนี้' }).click();
    await expect(chat.locator('.asx-rcard').filter({ hasText: 'สรุปการเงิน' })).toBeVisible({ timeout: 10000 });
    if (!(await chat.locator('.asx-side.is-open').count())) await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
    await expect(chat.locator('.asx-side.is-open .asx-side-item').first()).toBeVisible();
    // The LINE cards follow the same type rules.
    await chat.locator('.asx-side.is-open .asx-side-item.is-line').click();
    await expect(chat.locator('.lnc')).toHaveCount(3);
    if (!(await chat.locator('.asx-side.is-open').count())) await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
    const report = await page.evaluate(() => {
      const bad: string[] = [];
      const roots = [document.querySelector('section.asx')!, ...document.querySelectorAll('.asx-pop')];
      for (const root of roots) {
        const style = getComputedStyle(root);
        if (style.fontSynthesisWeight !== 'none' && !String(style.fontSynthesis).startsWith('none')) bad.push('synthetic bold allowed');
      }
      for (const el of roots.flatMap(root => [root, ...root.querySelectorAll('*')])) {
        const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()) || el.matches('textarea, input');
        if (!hasText || el.closest('.asx-sr, svg')) continue;
        const c = getComputedStyle(el);
        const label = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} “${(el.textContent || '').trim().slice(0, 16)}”`;
        if (!c.fontFamily.startsWith('"IBM Plex Sans Thai"')) bad.push(`${label}: font ${c.fontFamily}`);
        if (!['400', '500', '600'].includes(c.fontWeight)) bad.push(`${label}: weight ${c.fontWeight}`);
        if (parseFloat(c.fontSize) < 11) bad.push(`${label}: ${c.fontSize}`);
        if (c.textShadow !== 'none' || parseFloat(c.webkitTextStrokeWidth) > 0) bad.push(`${label}: shadow/stroke`);
      }
      for (const el of document.querySelectorAll('.asx-md p, .asx-md li, .asx-bubble')) {
        const c = getComputedStyle(el);
        const ratio = parseFloat(c.lineHeight) / parseFloat(c.fontSize);
        if (c.fontWeight !== '400') bad.push(`reading text at ${c.fontWeight}`);
        if (ratio < 1.6 || ratio > 1.75) bad.push(`reading line height ${ratio.toFixed(2)}`);
      }
      return bad;
    });
    expect(report).toEqual([]);
    expect(await textOverlapIssues(page)).toEqual([]);
  }
});

// Owner, 2026-10-23: notifications "เหมือน LINE": the automatic notifications the app sends to LINE, with the
// same templates, buttons, quick replies and push banner, inside the chat. Sample data only, nothing is sent.
test('LINE: the pinned notifications thread shows the real LINE cards, and their buttons answer as LINE does', async ({ page }) => {
  const calls = await open(page, 1280, 820);
  const chat = chatOf(page);
  const bell = chat.locator('.asx-bar').getByRole('button', { name: 'แจ้งเตือนอัตโนมัติ · ยังไม่อ่าน 1' });
  await expect(bell).toBeVisible();
  await expect(chat.locator('.asx-side-item.is-line .asx-badge')).toHaveText('1');
  await bell.click();
  await expect(chat.locator('.asx-side-item.is-line')).toHaveAttribute('aria-current', 'page');
  await expect(chat.getByRole('button', { name: 'แจ้งเตือนอัตโนมัติ', exact: true })).toBeVisible(); // read now
  const cards = chat.locator('.lnc');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('สรุปการเงินประจำเดือน');
  await expect(cards.nth(1)).toContainText('บันทึกรับเงินแล้ว');
  await expect(cards.nth(2)).toContainText('เตือนรับเงิน');
  await expect(cards.nth(2)).toContainText('฿ 16,700');
  await expect(chat.locator('.asx-day')).toContainText(['เมื่อวาน', 'วันนี้']);
  await expect(chat.getByText('บทสนทนาตัวอย่าง · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ')).toBeVisible();
  // It opens at the latest card, as LINE does.
  await expect(cards.nth(2).getByRole('link', { name: 'ดูรายการรอรับเงิน' })).toBeInViewport();
  // The official mascot pose and the brand symbol come from the app's own files.
  await expect(cards.nth(2).locator('.lnc-figure img')).toHaveAttribute('src', '/line/mascot-v6-urgent.png');
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-line-thread.png');

  const overdue = cards.nth(2).getByRole('group', { name: 'บันทึกรับเงิน ถ่ายภาพสินค้า ร้านตัวอย่าง' });
  await overdue.getByRole('button', { name: 'ได้รับแล้ว' }).click();
  await expect(chat.locator('.asx-msg.is-me .asx-bubble').last()).toHaveText('ได้รับเงินแล้ว · ถ่ายภาพสินค้า ร้านตัวอย่าง');
  const receipt = chat.locator('.lnc').last();
  await expect(receipt).toContainText('บันทึกรับเงินแล้ว');
  await expect(receipt).toContainText('฿ 4,500');
  await expect(chat.locator('.asx-msg.is-bot').last().locator('.asx-meta')).toContainText('ไม่มีการบันทึกจริง');
  const today = cards.nth(2).getByRole('group', { name: 'บันทึกรับเงิน ออกแบบโลโก้ ร้านตัวอย่าง' });
  await today.getByRole('button', { name: 'ยังไม่ได้' }).click();
  await expect(chat.locator('.asx-bubble.is-bot').last()).toContainText('พรุ่งนี้ 08:00 กระรอกจะเตือนอีกครั้ง');
  await today.getByRole('button', { name: 'ได้ไม่ครบ' }).click();
  await expect(chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' })).toHaveValue(/^รับเงินบางส่วน #DUE-B ยอด $/);
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('');
  // Quick replies send the same messages as LINE's, and get LINE's own answer card.
  await chat.getByRole('group', { name: 'ตอบกลับด่วน' }).getByRole('button', { name: 'รอรับเงิน' }).click();
  await expect(chat.locator('.lnc').last()).toContainText('ยอดรอรับทั้งหมด', { timeout: 10000 });
  await expect(chat.locator('.asx-bar-status')).toHaveText(/พร้อมช่วยแล้ว/, { timeout: 6000 });
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-line-replies.png');
  // A card's button opens the page in the app.
  await chat.locator('.lnc').last().getByRole('link', { name: 'ดูงานรอรับเงินทั้งหมด' }).click();
  await expect(page).toHaveURL(/\/receivables/);
  expect(calls.filter(call => /line\.me|api\/line|openai|anthropic|gemini/i.test(call))).toEqual([]);
});

async function checkTopSquirrel(page: Page, minSize: number) {
  const chat = chatOf(page);
  const mascot = (await chat.locator('.asx-bar-mascot').boundingBox())!;
  const bar = (await chat.locator('.asx-bar').boundingBox())!;
  const scroll = chat.locator('.asx-scroll');
  const top = (await scroll.boundingBox())!.y;
  const fade = await scroll.evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--asx-top-fade')));
  expect(mascot.height).toBeGreaterThanOrEqual(minSize);
  expect(mascot.y + mascot.height).toBeGreaterThan(bar.y + bar.height);
  expect(mascot.y + mascot.height).toBeLessThanOrEqual(top + fade + 1);
  expect(await chat.locator('.asx-bar-mascot').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
}

test('LINE: a notification arriving shows the LINE banner; there is no rich menu and no glass bar across the top', async ({ page }) => {
  await open(page, 1280, 820);
  const chat = chatOf(page);
  // Owner, 2026-10-23: the rich menu is out, and the top is the squirrel alone between round buttons.
  await expect(chat.getByRole('button', { name: /เมนูลัด/ })).toHaveCount(0);
  await expect(chat.locator('img[src*="richmenu"]')).toHaveCount(0);
  const bar = chat.locator('.asx-bar');
  await expect(bar).not.toHaveClass(/lg-glass/);
  expect(await bar.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(chat.locator('.asx-bar-text')).toHaveClass(/asx-sr/);
  await chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'สรุปงานของวันนี้' }).click();
  await expect(chat.locator('.asx-bar-status')).toHaveText(/พร้อมช่วยแล้ว/, { timeout: 10000 });
  const mascot = (await chat.locator('.asx-bar-mascot').boundingBox())!;
  const column = (await chat.locator('.asx-chat').boundingBox())!;
  expect(Math.abs(mascot.x + mascot.width / 2 - (column.x + column.width / 2))).toBeLessThan(4);
  // Owner, 2026-10-23: the squirrel is the star of the top: bigger, hanging a little below the row, but never
  // over text: it only overlaps the strip where the conversation has already faded out, and lets clicks through.
  await checkTopSquirrel(page, 78);

  // The preview: a notification arrives while another chat is open.
  await chat.getByRole('button', { name: 'จัดการแชต' }).click();
  await page.getByRole('menuitem', { name: 'จำลองแจ้งเตือนเข้า' }).click();
  const banner = chat.locator('.asx-push');
  await expect(banner).toBeVisible({ timeout: 5000 });
  await expect(banner).toContainText('กระรอกตุนเงิน');
  await expect(banner).toContainText('เตือนรับเงิน: เลยกำหนด 1');
  await expect(bar.getByRole('button', { name: 'แจ้งเตือนอัตโนมัติ · ยังไม่อ่าน 2' })).toBeVisible();
  await snap(page, 'assistant-line-banner.png');
  await banner.click();
  await expect(chat.locator('.asx-side-item.is-line')).toHaveAttribute('aria-current', 'page');
  await expect(chat.locator('.lnc')).toHaveCount(4);
  await expect(banner).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('LINE on phones and in dark mode: the drawer shows the thread first, cards keep their width, and dark is the glam stage', async ({ page }) => {
  await open(page, 390, 844, { dark: true });
  const chat = chatOf(page);
  await expect(chat.locator('.asx-bar .asx-dot')).toBeVisible();
  // Dark: the aurora lights the stage and the headings carry a gradient.
  await expect(chat.locator('.asx-aurora')).toBeVisible();
  await expect(chat.locator('.asx-aurora i')).toHaveCount(2);
  expect(await chat.locator('.asx-welcome h2').evaluate(el => getComputedStyle(el).backgroundClip)).toBe('text');
  expect(await textOverlapIssues(page)).toEqual([]);
  await chat.getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
  const side = chat.getByRole('complementary', { name: 'ประวัติแชต' });
  await expect(side.locator('.asx-side-item').first()).toContainText('แจ้งเตือนอัตโนมัติ');
  await side.locator('.asx-side-item.is-line').click();
  await expect(chat.locator('.lnc')).toHaveCount(3);
  await expect(chat.locator('.asx-bar .asx-dot')).toHaveCount(0);
  for (const width of await chat.locator('.lnc').evaluateAll(list => list.map(el => el.getBoundingClientRect().width))) expect(width).toBeGreaterThanOrEqual(244);
  await checkTopSquirrel(page, 62);
  // Amounts stay on one line on a phone.
  for (const box of await chat.locator('.lnc-metric-value').evaluateAll(list => list.map(el => { const r = el.getBoundingClientRect(); return r.height / parseFloat(getComputedStyle(el).lineHeight); }))) expect(box).toBeLessThan(1.5);
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-390-line-dark.png');
  // Light mode keeps its look: no aurora.
  await open(page, 390, 844);
  await expect(chatOf(page).locator('.asx-aurora')).toBeHidden();
});

// Owner, 2026-10-23: without Pro you can try the chat with its sample questions and buttons; typing your own
// question asks you to get Pro first.
test('try mode without Pro: sample questions answer, a typed question shows the Pro card and is not sent', async ({ page }) => {
  for (const [width, height] of [[1280, 820], [390, 844]] as const) {
    await open(page, width, height, { role: 'user', free: true });
    const chat = chatOf(page);
    await expect(chat.locator('.asx-notice.is-try')).toContainText('โหมดทดลอง');
    await expect(chat.locator('.asx-token')).toHaveCount(0);
    await chat.getByRole('group', { name: 'คำถามแนะนำ' }).getByRole('button', { name: 'สรุปงานของวันนี้' }).click();
    await expect(chat.locator('.asx-md table')).toBeVisible({ timeout: 10000 });
    await expect(chat.locator('.asx-msg.is-bot').last().locator('.asx-meta')).toContainText('คำตอบตัวอย่าง', { timeout: 15000 });
    const box = chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' });
    await expect(box).toBeEnabled();
    await box.fill('ช่วยดูงานของลูกค้ารายนี้ให้หน่อย');
    await chat.getByRole('button', { name: 'ส่งข้อความ' }).click();
    const card = chat.getByRole('region', { name: 'พิมพ์ถามเองได้เมื่อเป็นสมาชิก Pro' });
    await expect(card).toBeVisible();
    await expect(chat.locator('.asx-msg.is-me .asx-bubble')).toHaveCount(1); // the typed one was not sent
    await expect(box).toHaveValue('ช่วยดูงานของลูกค้ารายนี้ให้หน่อย');
    await expect(chat.locator('.asx-msg.is-me .asx-bubble').last()).toHaveText('สรุปงานของวันนี้');
    expect(await textOverlapIssues(page)).toEqual([]);
    await snap(page, `assistant-${width}-try-upsell.png`);
    // A sample question from the card still answers.
    await card.getByRole('group', { name: 'ลองคำถามตัวอย่าง' }).getByRole('button', { name: 'งานที่ยังไม่ได้รับเงิน' }).click();
    await expect(card).toHaveCount(0);
    await expect(chat.locator('.asx-md ol li')).toHaveCount(2, { timeout: 10000 });
    await expect(chat.locator('.asx-msg.is-bot').last().locator('.asx-meta')).toContainText('คำตอบตัวอย่าง', { timeout: 15000 });
    if (width > 600) {
      await box.fill('อีกคำถาม');
      await box.press('Enter');
      await expect(card).toBeVisible();
      await card.getByRole('button', { name: 'ดูแพ็กเกจ Pro' }).click();
      await expect(page).toHaveURL(/\/plans/);
    }
  }
});

// Owner, 2026-10-23: history can be deleted (one chat or all of it, with a few seconds to undo), and each row
// has a ⋯ menu like ChatGPT's: rename, pin, share (soon), archive, delete.
const rowMenu = async (page: Page, title: string) => {
  const side = chatOf(page).getByRole('complementary', { name: 'ประวัติแชต' });
  await side.locator('.asx-side-row', { hasText: title }).hover();
  await side.getByRole('button', { name: `ตัวเลือกของ “${title}”` }).click();
  return page.getByRole('menu', { name: `ตัวเลือกของ “${title}”` });
};
test('chat history: delete one chat or all of it, and undo brings it back', async ({ page }) => {
  await open(page, 1280, 820);
  const chat = chatOf(page);
  const side = chat.getByRole('complementary', { name: 'ประวัติแชต' });
  const rows = side.locator('.asx-side-row');
  await expect(rows).toHaveCount(4);
  const menu = await rowMenu(page, 'เพิ่มงานถ่ายภาพแคมเปญ');
  for (const item of ['เปลี่ยนชื่อ', 'ปักหมุด', 'แชร์ · เร็ว ๆ นี้', 'เก็บถาวร', 'ลบ']) await expect(menu.getByRole('menuitem', { name: item, exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'แชร์ · เร็ว ๆ นี้' })).toHaveAttribute('aria-disabled', 'true');
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-history-menu.png');
  await menu.getByRole('menuitem', { name: 'ลบ', exact: true }).click();
  await expect(rows).toHaveCount(3);
  const toast = chat.locator('.asx-undo');
  await expect(toast).toContainText('ลบแชตแล้ว');
  await toast.getByRole('button', { name: 'เลิกทำ' }).click();
  await expect(rows).toHaveCount(4);
  await expect(side.getByRole('button', { name: /^เพิ่มงานถ่ายภาพแคมเปญ/ }).first()).toBeVisible();
  // Deleting the open chat returns to the welcome.
  await side.getByRole('button', { name: /^งานที่ยังไม่ได้รับเงิน/ }).click();
  await expect(chat.locator('.asx-md ol li')).toHaveCount(2);
  await chat.getByRole('button', { name: 'จัดการแชต' }).click();
  await page.getByRole('menuitem', { name: 'ลบแชตนี้' }).click();
  await expect(chat.getByRole('heading', { name: 'วันนี้อยากให้เลขากระรอกช่วยอะไร?' })).toBeVisible();
  await expect(rows).toHaveCount(3);
  // Delete all: only the pinned notifications thread stays.
  await chat.getByRole('button', { name: 'จัดการแชต' }).click();
  await page.getByRole('menuitem', { name: 'ลบประวัติแชตทั้งหมด' }).click();
  await expect(rows).toHaveCount(0);
  await expect(side.locator('.asx-side-item.is-line')).toBeVisible();
  await expect(toast).toContainText('ลบประวัติแชต 3 รายการแล้ว');
  await toast.getByRole('button', { name: 'เลิกทำ' }).click();
  await expect(rows).toHaveCount(3);
  // The undo note leaves on its own.
  await chat.getByRole('button', { name: 'จัดการแชต' }).click();
  await page.getByRole('menuitem', { name: 'ลบประวัติแชตทั้งหมด' }).click();
  await expect(toast).toHaveCount(0, { timeout: 9000 });
  await expect(rows).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('chat history: rename, pin to the top and archive from the row menu', async ({ page }) => {
  await open(page, 1280, 820);
  const chat = chatOf(page);
  const side = chat.getByRole('complementary', { name: 'ประวัติแชต' });
  // Rename: Enter saves, Escape cancels.
  await (await rowMenu(page, 'สรุปงานของวันนี้')).getByRole('menuitem', { name: 'เปลี่ยนชื่อ' }).click();
  const field = side.getByRole('textbox', { name: 'ชื่อแชต' });
  await expect(field).toBeFocused();
  await field.fill('งานวันพฤหัส');
  await field.press('Enter');
  await expect(side.getByRole('button', { name: /^งานวันพฤหัส/ })).toBeVisible();
  await (await rowMenu(page, 'งานวันพฤหัส')).getByRole('menuitem', { name: 'เปลี่ยนชื่อ' }).click();
  await side.getByRole('textbox', { name: 'ชื่อแชต' }).fill('ไม่เอาชื่อนี้');
  await side.getByRole('textbox', { name: 'ชื่อแชต' }).press('Escape');
  await expect(side.getByRole('button', { name: /^งานวันพฤหัส/ })).toBeVisible();
  // Pin: the chat moves up under แชตที่ปักหมุด, after the notifications thread; the hover pin unpins it.
  await (await rowMenu(page, 'งานที่ยังไม่ได้รับเงิน')).getByRole('menuitem', { name: 'ปักหมุด', exact: true }).click();
  const pinned = side.getByRole('region', { name: 'แชตที่ปักหมุด' });
  await expect(pinned.getByRole('heading', { name: 'แชตที่ปักหมุด' })).toBeVisible();
  await expect(pinned.locator('.asx-side-row')).toHaveText([/งานที่ยังไม่ได้รับเงิน/]);
  await expect(side.getByRole('region', { name: '7 วันที่ผ่านมา' })).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await snap(page, 'assistant-history-pinned.png');
  await side.locator('.asx-side-row', { hasText: 'งานที่ยังไม่ได้รับเงิน' }).hover();
  await side.getByRole('button', { name: 'เลิกปักหมุด “งานที่ยังไม่ได้รับเงิน”' }).click();
  await expect(pinned.locator('.asx-side-row')).toHaveCount(0);
  await expect(side.getByRole('region', { name: '7 วันที่ผ่านมา' })).toBeVisible();
  // Archive: the chat goes to a folded เก็บถาวร section and can come back.
  await (await rowMenu(page, 'เพิ่มงานถ่ายภาพแคมเปญ')).getByRole('menuitem', { name: 'เก็บถาวร' }).click();
  const shelf = side.getByRole('region', { name: 'เก็บถาวร' });
  await expect(shelf.getByRole('button', { name: 'เก็บถาวร · 1' })).toHaveAttribute('aria-expanded', 'false');
  await expect(side.getByRole('button', { name: /^เพิ่มงานถ่ายภาพแคมเปญ/ })).toHaveCount(0);
  await shelf.getByRole('button', { name: 'เก็บถาวร · 1' }).click();
  await expect(shelf.getByRole('button', { name: /^เพิ่มงานถ่ายภาพแคมเปญ/ })).toBeVisible();
  await (await rowMenu(page, 'เพิ่มงานถ่ายภาพแคมเปญ')).getByRole('menuitem', { name: 'นำออกจากที่เก็บถาวร' }).click();
  await expect(shelf).toHaveCount(0);
  await expect(side.getByRole('region', { name: 'เมื่อวาน' }).getByRole('button', { name: /^เพิ่มงานถ่ายภาพแคมเปญ/ })).toBeVisible();
  // Phones: the ⋯ is always there.
  await open(page, 390, 844);
  await chatOf(page).getByRole('button', { name: 'ประวัติและค้นหาแชต' }).click();
  await expect(chatOf(page).getByRole('button', { name: 'ตัวเลือกของ “สรุปงานของวันนี้”' })).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
});
