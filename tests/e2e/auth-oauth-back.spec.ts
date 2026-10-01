import { test, expect } from '@playwright/test';

// Google sign-in turns the login page's shared loading state on and leaves for Google. When the
// user comes back with Back (or cancels on Google), real browsers restore that page from the
// back/forward cache -- state included -- and fire `pageshow` with persisted=true. That restore
// used to leave every button disabled with "กำลังดำเนินการ..." spinning forever.
test('a login page restored after leaving for Google sign-in is usable again', async ({ page }) => {
  await page.route('**/api/auth', async route => {
    const body = route.request().postData() || '';
    // No redirect URL: the page stays put in the same state it had when the browser left it.
    if (route.request().method() === 'POST' && body.includes('"oauth"')) return route.fulfill({ json: {} });
    return route.fulfill({ json: { session: null } });
  });

  await page.goto('/login');
  const google = page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  await google.click();
  await expect(google).toBeDisabled();
  await expect(page.getByText('กำลังดำเนินการ...')).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

  await expect(google).toBeEnabled();
  await expect(page.getByText('กำลังดำเนินการ...')).toHaveCount(0);
});
