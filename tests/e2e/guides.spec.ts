import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Guides (owner, 2026-10-31): /guides lists three guides, each guide is a page of its own, readable at every size, light,
// with nothing overlapping, and the landing's footer leads there.

async function open(page: Page, path: string, { width = 1440, height = 900, lang = 'th' } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (lang !== 'th') await page.addInitScript(l => { try { localStorage.setItem('cashflow_language', l); } catch { /* private window */ } }, lang);
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

async function noOverlapWhileScrolling(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const at of [0, 0.33, 0.66, 1]) {
    await page.evaluate(share => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * share), at);
    await page.waitForTimeout(120);
    expect(await textOverlapIssues(page), `at ${at}`).toEqual([]);
  }
}

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`${width}px: the guide list shows three guides and opens each one`, async ({ page }) => {
    await open(page, '/guides', { width, height });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ความรู้เรื่องงานและเงิน สำหรับฟรีแลนซ์และธุรกิจเล็ก');
    await expect(page.locator('.gd-cards .gd-card')).toHaveCount(3);
    await expect(page).toHaveTitle('ความรู้เรื่องงานและเงิน สำหรับฟรีแลนซ์ | กระรอกตุนเงิน');
    await noOverlapWhileScrolling(page);
    await page.locator('.gd-card', { hasText: '50 ทวิ' }).click();
    await expect(page).toHaveURL(/\/guides\/wht-50-tawi$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('50 ทวิ คืออะไร ฟรีแลนซ์ต้องเก็บไว้ทำอะไร');
  });

  for (const [path, heading] of [['/guides/quotation', 'วิธีออกใบเสนอราคาให้ลูกค้าตัดสินใจง่าย'], ['/guides/wht-50-tawi', '50 ทวิ คืออะไร ฟรีแลนซ์ต้องเก็บไว้ทำอะไร'],
    ['/guides/receivables', 'ติดตามเงินค้างรับอย่างไร ไม่ให้ลืมและไม่เสียลูกค้า']] as const) {
    test(`${width}px ${path}: the whole guide, the box of what Krarok does, the next guides, nothing overlapping`, async ({ page }) => {
      await open(page, path, { width, height });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.getByRole('link', { name: 'ความรู้เรื่องงานและเงิน' }).first()).toHaveAttribute('href', '/guides');
      await expect(page.locator('.gd-krarok').first()).toBeVisible();
      await expect(page.locator('.gd-related .gd-card')).toHaveCount(2);
      await expect(page.getByRole('link', { name: 'เริ่มใช้ฟรี' }).last()).toHaveAttribute('href', '/login');
      await noOverlapWhileScrolling(page);
    });
  }
}

test('the 50 ทวิ guide shows the rate table with its note', async ({ page }) => {
  await open(page, '/guides/wht-50-tawi');
  const table = page.locator('.gd-table');
  await expect(table.locator('tbody tr')).toHaveCount(7);
  await expect(table.locator('tbody tr').first()).toContainText('ค่าบริการ');
  await expect(table.locator('tbody tr').first()).toContainText('3%');
  await expect(page.locator('.gd-note')).toContainText('e-Withholding Tax');
  await expect(page.locator('.gd-disclaimer')).toContainText('1161');
});

test('a guide that does not exist shows the list', async ({ page }) => {
  await open(page, '/guides/nothing-here');
  await expect(page.locator('.gd-cards .gd-card')).toHaveCount(3);
});

test('English: a note says the guides are in Thai, nothing overlapping', async ({ page }) => {
  await open(page, '/guides/quotation', { lang: 'en' });
  await expect(page.locator('.gd-en')).toHaveText('These guides are written for Thailand, so they are in Thai.');
  await noOverlapWhileScrolling(page);
});

test('the landing footer leads to the guides', async ({ page }) => {
  await open(page, '/');
  const link = page.locator('#cl-help').getByRole('link', { name: 'ความรู้เรื่องงานและเงิน' });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toHaveAttribute('href', '/guides');
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('in the app\'s dark mode the guides stay light', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cashflow_dark_mode', 'true'); } catch { /* private window */ } });
  await page.addInitScript(() => document.documentElement.classList.add('dark'));
  await open(page, '/guides');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
});
