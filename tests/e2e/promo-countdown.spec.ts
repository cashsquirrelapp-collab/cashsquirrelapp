import { expect, test } from '@playwright/test';
import { PRO_MONTH_REGULAR_FROM } from '../../shared/proPricing';

// The landing since 2026-10-29 (features/marketing/v5): the countdown sits in the closing card as four glass tiles,
// the price in #pricing (the Pro card). When the offer ends the countdown goes and the price steps to the regular one.
for (const language of ['th', 'en'] as const) {
  test(`landing countdown is readable in ${language} on phones and changes price when the offer ends`, async ({ page }) => {
    await page.clock.setFixedTime(PRO_MONTH_REGULAR_FROM - 90061000);
    await page.addInitScript(lang => localStorage.setItem('cashflow_language', lang), language);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/auth', route => route.fulfill({ json: { session: null } }));
    await page.goto('/');
    const close = page.locator('.cl-final');
    const pricing = page.locator('#pricing');
    const timer = close.getByRole('timer');
    await expect(timer).toHaveAttribute('data-seconds-left', '90061');
    await expect(close.getByText(language === 'en' ? 'Pro at ฿159 ends in' : 'ดีลพิเศษ Pro ฿159 หมดใน', { exact: true })).toBeVisible();
    await expect(timer).toHaveAccessibleName(language === 'en' ? 'Time remaining: 1 day, 1 hr, 1 min, 1 sec' : 'เวลาที่เหลือ 1 วัน 1 ชั่วโมง 1 นาที 1 วินาที');
    await expect(pricing.locator('.cl-price strong')).toHaveText('฿159');
    await expect(pricing.locator('.cl-price-was')).toContainText('฿249');
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await timer.scrollIntoViewIfNeeded();
      expect(await timer.evaluate(node => {
        const box = node.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && node.scrollWidth <= node.clientWidth;
      })).toBe(true);
      const cells = await timer.locator(':scope > span').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, fits: node.scrollWidth <= node.clientWidth };
      }));
      expect(cells).toHaveLength(4);
      expect(cells.every(cell => cell.fits && Math.abs(cell.top - cells[0].top) < 1)).toBe(true);
      for (let i = 1; i < cells.length; i++) expect(cells[i].left).toBeGreaterThan(cells[i - 1].right);
    }
    await page.clock.setFixedTime(PRO_MONTH_REGULAR_FROM);
    await expect(timer).toHaveCount(0);
    await expect(pricing.locator('.cl-price strong')).toHaveText('฿249');
    await expect(pricing.locator('.cl-price-fee')).toHaveText(/฿22.*฿271/);
    await expect(pricing.locator('.cl-price-was')).toHaveCount(0);
    await page.reload();
    await expect(timer).toHaveCount(0);
    await expect(pricing.locator('.cl-price strong')).toHaveText('฿249');
  });
}
