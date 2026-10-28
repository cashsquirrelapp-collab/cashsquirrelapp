import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Computers and iPads (owner, 2026-10-27: "ลากยาวจนเลยแท็บไปเลย ... ให้มันคอนตินิวกัน แล้วก็ให้แท็บเนี่ยซ้อนกันเหมือนมี
// เลเยอร์", margins to the screen unchanged): one page card from 12px off the left edge, the sidebar layered on it 8px
// inside the rim, the page in exactly the place and width it had. The full-page chat and phones keep their layouts.
test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'layer@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, width: number, height: number, path = '/dashboard', dark = false) {
  await page.addInitScript(isDark => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', String(isDark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, dark);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await expect(page.locator('#main-content')).toBeVisible();
}
const layout = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const main = document.querySelector('#main-content') as HTMLElement;
  const side = box('.app-sidebar');
  const hit = document.elementFromPoint(side.x + side.w - 6, side.y + side.h / 2);
  return { side, card: box('.asx-panel-host'), contentX: main.getBoundingClientRect().x + parseFloat(getComputedStyle(main).paddingLeft), sidebarOnTop: Boolean(hit?.closest('.app-sidebar')), view: innerWidth, noSideScroll: document.documentElement.scrollWidth <= innerWidth };
});

for (const [width, height, contentX] of [[1440, 900, 292], [1180, 820, 284], [1024, 768, 284]] as const) for (const dark of [false, true]) {
  test(`${width}${dark ? ' dark' : ''}: one card under the sidebar, the sidebar on top, the page where it was`, async ({ page }) => {
    await open(page, width, height, '/dashboard', dark);
    const l = await layout(page);
    expect(l.card.x).toBe(12);
    expect(l.card.y).toBe(12);
    expect(Math.round(l.card.x + l.card.w)).toBe(width - 12); // the margins to the screen are unchanged
    expect(l.side.x - l.card.x).toBe(8);
    expect(l.side.y - l.card.y).toBe(8);
    expect(Math.round(l.card.y + l.card.h - (l.side.y + l.side.h))).toBe(8);
    expect(l.sidebarOnTop).toBe(true);
    expect(Math.round(l.contentX)).toBe(contentX); // the page keeps its place and width
    expect(l.noSideScroll).toBe(true);
    expect(await page.locator('.app-sidebar').evaluate(el => getComputedStyle(el).borderTopRightRadius)).toBe('20px');
    expect(await textOverlapIssues(page)).toEqual([]);
  });
}

test('the full-page chat keeps its own layout: the sidebar folds away and the chat is the card', async ({ page }) => {
  await open(page, 1440, 900, '/assistant');
  await expect(page.locator('.asx-panel-host.is-chat-focus')).toBeVisible();
  await expect.poll(() => page.locator('.app-sidebar').evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
  const card = await page.locator('.asx-panel-host').boundingBox();
  expect(card!.x).toBe(0);
});

// The full chat on computers and iPads (owner, 2026-10-28: "แท็บตรงหน้าจอกระรอกยาวไปเลย ... เอาแท็บด้านข้างแทรกขึ้นมา"):
// one chat card across the width, the history layered on it 8px inside the rim with 20px corners, the composer and the
// squirrel centred in what is visible; folding the history gives the whole card to the chat.
for (const [width, height, dark] of [[1440, 900, false], [1024, 768, false], [1280, 820, true]] as const) {
  test(`${width}px${dark ? ' dark' : ''}: the chat card runs under the layered history panel`, async ({ page }) => {
    await open(page, width, height, '/assistant', dark);
    const chat = page.locator('section.asx');
    await expect(chat.locator('.asx-side.is-open')).toBeVisible();
    const measure = () => page.evaluate(() => {
      const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const side = box('.asx-side'), card = box('.asx-chat'), root = box('section.asx'), composer = box('.asx-composer'), perch = box('.asx-perch-box');
      const top = document.elementFromPoint(side.x + side.w / 2, side.y + side.h - 40);
      return { side, card, root, composer, perch, sideOnTop: Boolean(top?.closest('.asx-side')), opacity: Number(getComputedStyle(document.querySelector('.asx-side')!).opacity),
        radius: getComputedStyle(document.querySelector('.asx-side')!).borderTopLeftRadius, noSideScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    });
    const open1 = await measure();
    expect(open1.card.x).toBe(open1.root.x); // the card starts at the root's edge, under the panel
    expect(Math.round(open1.card.w)).toBe(Math.round(open1.root.w));
    expect(Math.round(open1.side.x - open1.card.x)).toBe(8);
    expect(Math.round(open1.side.y - open1.card.y)).toBe(8);
    expect(Math.round(open1.card.y + open1.card.h - (open1.side.y + open1.side.h))).toBe(8);
    expect(open1.radius).toBe('20px');
    expect(open1.sideOnTop).toBe(true);
    expect(open1.noSideScroll).toBe(true);
    const visible = { left: open1.side.x + open1.side.w, right: open1.card.x + open1.card.w };
    expect(open1.composer.x).toBeGreaterThan(visible.left + 8);
    const middle = visible.left + 16 + (visible.right - visible.left - 16) / 2;
    expect(Math.abs(open1.composer.x + open1.composer.w / 2 - middle)).toBeLessThan(4);
    expect(Math.abs(open1.perch.x + open1.perch.w / 2 - middle)).toBeLessThan(4);
    expect(await textOverlapIssues(page)).toEqual([]);

    await chat.getByRole('button', { name: 'ย่อแถบประวัติแชต' }).click();
    await expect(chat.locator('.asx-side.is-open')).toHaveCount(0);
    const folded = await measure();
    expect(folded.opacity).toBe(0);
    expect(Math.round(folded.card.w)).toBe(Math.round(open1.card.w)); // the card does not move or change size
    const cardMiddle = folded.card.x + folded.card.w / 2;
    expect(Math.abs(folded.composer.x + folded.composer.w / 2 - cardMiddle)).toBeLessThan(4);
    expect(Math.abs(folded.perch.x + folded.perch.w / 2 - cardMiddle)).toBeLessThan(4);
    expect(await textOverlapIssues(page)).toEqual([]);
  });
}

test('iPad portrait: the history still slides over the chat with a scrim', async ({ page }) => {
  await open(page, 820, 1180, '/assistant');
  const chat = page.locator('section.asx');
  await expect(chat).toBeVisible();
  await expect(page.locator('section.asx.is-wide')).toHaveCount(0);
  expect(await chat.locator('.asx-chat').evaluate(el => getComputedStyle(el).paddingLeft)).toBe('0px');
});

test('phones: no sidebar, the page card is not moved', async ({ page }) => {
  await open(page, 390, 844);
  await expect(page.locator('.app-sidebar')).toBeHidden();
  const card = await page.locator('.asx-panel-host').boundingBox();
  expect(card!.x).toBe(0);
  expect(card!.width).toBe(390);
});
