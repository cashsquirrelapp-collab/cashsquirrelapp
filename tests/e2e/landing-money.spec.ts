import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Two free features on the landing (owner, 2026-10-29): the calendar section in both of the app's views, the calendar
// and the timeline that lists the jobs down the months, and a section for spending. Both use the page's one set of
// example numbers and say they are free; nothing covers any text in them, at any size, in Thai or English.

async function open(page: Page, { width = 1440, height = 900, motion = false, lang = 'th' } = {}) {
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' });
  if (lang !== 'th') await page.addInitScript(l => { try { localStorage.setItem('cashflow_language', l); } catch { /* private window */ } }, lang);
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('.cl-feat.is-expense .gl-exp')).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

/** Brings a part of the page to just under the top bar, scrolling the way a visitor does so the reveals play. */
async function scrollTo(page: Page, selector: string) {
  await page.evaluate(async sel => {
    const target = () => document.querySelector(sel)!.getBoundingClientRect().top + scrollY - 110;
    for (let y = scrollY; y < target(); y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
    scrollTo(0, target());
  }, selector);
  await page.waitForTimeout(400);
}

test('the calendar section shows both views: the calendar, then the timeline with the jobs listed down; a press keeps one', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, { motion: true });
  const views = page.locator('.cl-views');
  await scrollTo(page, '.cl-views');
  const calendar = page.getByRole('button', { name: 'ปฏิทิน' });
  const timeline = page.getByRole('button', { name: 'ไทม์ไลน์' });
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: /ปฏิทินเดือนตุลาคม/ })).toBeVisible();
  const before = await page.locator('.cl-feat.is-calendar').boundingBox();
  // after the calendar's paydays have landed, the timeline takes its turn, in the same space
  await expect(timeline).toHaveAttribute('aria-pressed', 'true', { timeout: 12_000 });
  await expect(page.getByRole('img', { name: /ไทม์ไลน์ที่เรียงงานลงมา/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /ปฏิทินเดือนตุลาคม/ })).toHaveCount(0); // hidden, not left behind it
  expect((await page.locator('.cl-feat.is-calendar').boundingBox())?.height).toBe(before?.height);
  // the jobs in the app's order: due soon, then still to come, then received; November below October
  const rows = page.locator('.gl-tl-month.is-1 .gl-tl-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.locator('.gl-tl-end em')).toHaveText(['ครบกำหนดชำระอีก 3 วัน', 'ครบกำหนดชำระอีก 9 วัน', 'ครบกำหนดชำระอีก 17 วัน', 'รับแล้ว ✓ 3 ต.ค.', 'รับแล้ว ✓ 10 ต.ค.']);
  await expect(page.locator('.gl-tl-month.is-1 .gl-tl-sum')).toContainText('฿38,500'); // the calendar's month total
  await expect(page.locator('.gl-tl-month.is-2 h4')).toHaveText('พฤศจิกายน 2569');
  // the list moves up to November and stops on a row's edge
  await page.waitForTimeout(5600);
  const cut = await page.evaluate(() => {
    const frame = document.querySelector('.gl-tl-window')!.getBoundingClientRect();
    return [...document.querySelectorAll('.gl-tl-row, .gl-tl-month > h4')].map(el => el.getBoundingClientRect()).filter(r => r.top < frame.top && r.bottom > frame.top).length;
  });
  expect(cut).toBe(0);
  await expect(page.locator('.gl-tl-month.is-2 .gl-tl-row').first()).toBeInViewport();
  // a visitor's press keeps that view: no more turns
  await calendar.click();
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(10_500);
  await expect(calendar).toHaveAttribute('aria-pressed', 'true');
  await expect(views).toHaveAttribute('data-view', 'calendar');
});

test('spending is a free feature: three costs, the month’s total, and the net profit from the page’s own numbers', async ({ page }) => {
  await open(page);
  const section = page.locator('.cl-feat.is-expense');
  await expect(section.getByRole('heading', { name: 'จดรายจ่ายรู้กำไรจริง' })).toBeVisible();
  await expect(section.locator('.cl-tier')).toHaveText('ใช้ฟรี');
  await expect(section.getByRole('img', { name: /จดรายจ่ายเดือนตุลาคม 3 รายการ รวม ฿1,200/ })).toBeVisible();
  await expect(section.locator('.gl-exp-rows li strong')).toHaveText(['฿590', '฿360', '฿250']);
  await expect(section.locator('.gl-exp-sum i.is-4')).toBeVisible();
  await expect(section.locator('.gl-exp-sum i.is-4')).toHaveText('฿1,200');
  await expect(section.locator('.gl-exp-profit')).toContainText('฿13,000');
  await expect(section.locator('.gl-exp-profit .is-profit')).toContainText('฿11,800');
  // after the calendar, before the questions; nothing here belongs to Pro
  const order = await page.evaluate(() => [...document.querySelectorAll('.cl-feat')].map(el => el.classList[1]));
  expect(order).toEqual(['is-chat', 'is-remind', 'is-docs', 'is-calendar', 'is-expense']);
  await expect(section.locator('.cl-tier.is-pro')).toHaveCount(0);
});

for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [430, 932], [390, 844], [320, 568]] as const) {
  test(`at ${width}×${height} nothing covers any text in either view or in the spending card`, async ({ page }) => {
    await open(page, { width, height });
    await scrollTo(page, '.cl-views');
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.getByRole('button', { name: 'ไทม์ไลน์' }).click();
    await expect(page.getByRole('img', { name: /ไทม์ไลน์ที่เรียงงานลงมา/ })).toBeVisible();
    expect(await textOverlapIssues(page)).toEqual([]);
    await scrollTo(page, '.cl-feat.is-expense .gl-exp');
    await expect(page.locator('.gl-exp')).toBeInViewport();
    expect(await textOverlapIssues(page)).toEqual([]);
    await scrollTo(page, '.cl-feat.is-expense .cl-feat-text');
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('in English both sections read in English, with nothing covered', async ({ page }) => {
  await open(page, { width: 390, height: 844, lang: 'en' });
  await scrollTo(page, '.cl-views');
  await page.getByRole('button', { name: 'Timeline' }).click();
  await expect(page.locator('.gl-tl-month.is-1 .gl-tl-row').first()).toContainText('Video editing');
  await expect(page.locator('.gl-tl-month.is-1 .gl-tl-row em').first()).toHaveText('Due in 3 days');
  expect(await textOverlapIssues(page)).toEqual([]);
  await scrollTo(page, '.cl-feat.is-expense .gl-exp');
  await expect(page.locator('.gl-exp-head')).toContainText('Add expense');
  await expect(page.locator('.gl-exp-profit .is-profit')).toContainText('Net profit');
  expect(await textOverlapIssues(page)).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Track your spending, know your real profit' })).toBeVisible();
});
