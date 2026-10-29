import { expect, test } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The English switch beside เข้าสู่ระบบ (owner, 2026-10-30: "แปลงเป็นภาษาอังกฤษ เผื่อคนต่างชาติมาใช้ ... สำคัญมาก"): it names
// the language it switches to, in that language; the whole landing is drawn again in it; the choice stays (for the
// app and the sign-in page too); and it fits the bar on every phone.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.route('**/api/public-stats', route => route.fulfill({ json: { signups: 18 } }));
});

test('to English and back, kept after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const bar = page.locator('.cl-bar');
  const toEnglish = bar.getByRole('button', { name: 'Switch to English' });
  await expect(toEnglish).toHaveText('EN');
  // it sits beside เข้าสู่ระบบ
  const login = (await bar.getByRole('link', { name: 'เข้าสู่ระบบ' }).boundingBox())!;
  expect(login.x - ((await toEnglish.boundingBox())!.x + (await toEnglish.boundingBox())!.width)).toBeLessThan(30);
  await toEnglish.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('From job to payday, let Krarok Assistant handle it');
  await expect(bar.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const toThai = bar.getByRole('button', { name: 'Switch to Thai' });
  await expect(toThai).toHaveText('ไทย');
  expect(await page.evaluate(() => localStorage.getItem('cashflow_language'))).toBe('en');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('From job to payday, let Krarok Assistant handle it');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.locator('.cl-bar').getByRole('button', { name: 'Switch to Thai' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('ตั้งแต่รับงาน จนถึงรับเงิน ให้เลขากระรอกดูแล');
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
});

for (const width of [320, 390]) {
  for (const lang of ['th', 'en'] as const) {
    test(`${width}px phone (${lang}): the switch and the start button both inside the bar, nothing overlapping`, async ({ page }) => {
      await page.addInitScript(l => localStorage.setItem('cashflow_language', l), lang);
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      const bar = (await page.locator('.cl-bar-in').boundingBox())!;
      for (const item of [page.locator('.cl-bar .cl-lang'), page.locator('.cl-bar .cl-btn.is-small')]) {
        await expect(item).toBeVisible();
        const box = (await item.boundingBox())!;
        expect(box.x >= bar.x - 0.5 && box.x + box.width <= bar.x + bar.width + 0.5).toBe(true);
      }
      expect(await textOverlapIssues(page)).toEqual([]);
    });
  }
}
