import { expect, test, type Page } from '@playwright/test';

// Owner, 2026-10-21: on refresh the Facebook button showed faded and then popped in, unlike the
// others. The page now starts from the last answer it saw, and a real change fades instead of jumping.

test.use({ serviceWorkers: 'block' });

async function openLogin(page: Page, facebook: boolean, delayMs: number) {
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', async route => {
    if (new URL(route.request().url()).searchParams.get('providers') === '1') {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return route.fulfill({ json: { providers: { google: true, facebook } } });
    }
    return route.fulfill({ json: { session: null } });
  });
  await page.goto('/login');
}
const facebookButton = (page: Page) => page.getByRole('button', { name: 'ดำเนินการต่อด้วย Facebook' });

test('Facebook switched on: the button is ready at once, even while the server answers slowly, and after a refresh', async ({ page }) => {
  await openLogin(page, true, 1500);
  await expect(facebookButton(page)).toBeEnabled({ timeout: 500 }); // never drawn faded first
  await page.waitForTimeout(1700);
  await page.reload();
  await expect(facebookButton(page)).toBeEnabled({ timeout: 500 });
});

test('Facebook switched off: the button fades once, and a refresh starts faded instead of popping', async ({ page }) => {
  await openLogin(page, false, 300);
  await expect(facebookButton(page)).toBeDisabled();
  await expect.poll(() => facebookButton(page).evaluate(el => getComputedStyle(el).transitionProperty)).toContain('opacity');
  await page.reload();
  await expect(facebookButton(page)).toBeDisabled({ timeout: 200 });
});
