import { expect, test } from '@playwright/test';
import { PRO_MONTH_REGULAR_FROM } from '../../shared/proPricing';

for (const language of ['th', 'en'] as const) {
  test(`landing countdown is readable in ${language} on phones and changes price when the offer ends`, async ({ page }) => {
    await page.clock.setFixedTime(PRO_MONTH_REGULAR_FROM - 90061000);
    await page.addInitScript(lang => localStorage.setItem('cashflow_language', lang), language);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/auth', route => route.fulfill({ json: { session: null } }));
    await page.goto('/');
    const card = page.locator('.sl-plan.is-pro');
    const timer = card.getByRole('timer');
    await expect(timer).toHaveAttribute('data-seconds-left', '90061');
    await expect(card.getByText(language === 'en' ? 'Offer ends in' : 'โปรโมชันสิ้นสุดใน', { exact: true })).toBeVisible();
    await expect(timer).toHaveAccessibleName(language === 'en' ? 'Time remaining: 1 day, 1 hr, 1 min, 1 sec' : 'เวลาที่เหลือ 1 วัน 1 ชั่วโมง 1 นาที 1 วินาที');
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
    await expect(card.locator('.sl-plan-price strong')).toHaveText('฿249');
    await expect(card.locator('.sl-plan-fee')).toHaveText(/฿22.*฿271/);
    await expect(card.locator('.sl-plan-was')).toHaveCount(0);
    await page.reload();
    await expect(timer).toHaveCount(0);
    await expect(card.locator('.sl-plan-price strong')).toHaveText('฿249');
  });
}
