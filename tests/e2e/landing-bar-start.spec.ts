import { expect, test, type Page } from '@playwright/test';

// The bar's start button (owner, 2026-10-30): no เข้าสู่ระบบ in the bar at all, and on computers and iPads no start button
// in it while the page shows its own: not on the first screen, sliding in once the page moves on to the phone, stepping
// aside under the price and at the closing card, and back between them. Phones keep theirs as it was.

test.use({ serviceWorkers: 'block' });

async function open(page: Page, width: number, height: number) {
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.route('**/api/public-stats', route => route.fulfill({ json: { signups: 18 } }));
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('.cl-hero .cl-btn.is-big')).toBeVisible();
}
const barStart = (page: Page) => page.evaluate(() => {
  const slot = document.querySelector<HTMLElement>('.cl-bar-cta')!;
  return { shown: document.querySelector('.cl-bar')!.classList.contains('has-start'), inert: slot.inert, width: Math.round(slot.getBoundingClientRect().width) };
});
const away = { shown: false, inert: true, width: 0 };
async function centre(page: Page, selector: string) {
  await page.evaluate(sel => { const el = document.querySelector(sel)!; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2); }, selector);
}

for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024]] as const) {
  test(`${width}×${height}: away on the first screen, in once the page moves on, away again wherever the page has its own`, async ({ page }) => {
    await open(page, width, height);
    await expect(page.locator('.cl-bar').getByRole('link', { name: /เข้าสู่ระบบ|Sign in/ })).toHaveCount(0);
    await page.waitForTimeout(1200); // the hero's opening motion
    expect(await barStart(page)).toEqual(away);
    // on to the phone (pinned on computers: the words lift away while the page holds still)
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => barStart(page).then(state => state.shown && !state.inert && state.width > 60), { timeout: 4000 }).toBe(true);
    await expect(page.locator('.cl-bar .cl-btn.is-small')).toHaveAttribute('href', '/login');
    // the price card's own start button on screen: the bar's steps aside
    await centre(page, '.cl-center .cl-btn');
    await expect.poll(() => barStart(page), { timeout: 4000 }).toEqual(away);
    await page.evaluate(() => window.scrollBy(0, 700));
    await expect.poll(() => barStart(page).then(state => state.shown), { timeout: 4000 }).toBe(true);
    await centre(page, '.cl-final-cta .cl-btn');
    await expect.poll(() => barStart(page), { timeout: 4000 }).toEqual(away);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => barStart(page), { timeout: 4000 }).toEqual(away);
  });
}

test('phones keep the bar as it was: the start button always there, beside the language switch', async ({ page }) => {
  await open(page, 390, 844);
  await page.waitForTimeout(1200);
  const state = await barStart(page);
  expect(state.shown && !state.inert && state.width > 60).toBe(true);
  await expect(page.locator('.cl-bar .cl-btn.is-small')).toBeVisible();
  await centre(page, '.cl-center .cl-btn');
  await page.waitForTimeout(1000);
  expect((await barStart(page)).shown).toBe(true);
});

test('with reduced motion the same rule holds, without the slide', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 1440, 900);
  expect(await barStart(page)).toEqual(away);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect.poll(() => barStart(page).then(state => state.shown), { timeout: 3000 }).toBe(true);
});
