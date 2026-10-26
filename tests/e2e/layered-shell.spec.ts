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

test('phones: no sidebar, the page card is not moved', async ({ page }) => {
  await open(page, 390, 844);
  await expect(page.locator('.app-sidebar')).toBeHidden();
  const card = await page.locator('.asx-panel-host').boundingBox();
  expect(card!.x).toBe(0);
  expect(card!.width).toBe(390);
});
