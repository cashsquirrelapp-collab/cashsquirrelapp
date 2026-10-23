import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Owner, 2026-10-21: one account downloaded 1.4 MB of goal pictures on every visit. With the owner's
// approval, a goal picture over 100 kB is re-encoded to 256px once the account's own data loads and is
// saved through the normal sync; small pictures are left as they are.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'goal-images@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const big = `data:image/webp;base64,${readFileSync('frontend/public/landing/narrow-jobs.webp').toString('base64')}`; // ~180 kB as text
const small = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'; // a 1px picture
const goal = (id: string, imageUrl: string) => ({ id, name: `เป้าหมาย ${id}`, type: 'save', target: 10000, current: 0, deadline: '2027-01-01', emoji: '🎯', icon: 'target', bg: '#ECFDF5', acc: '#059669', imageUrl, history: [] });
const snapshot = { jobs: [], expenses: [], invoices: [], goals: [goal('big', big), goal('small', small)], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: { big: 1, small: 1 }, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

test('an oversized goal picture is saved back at 256px, and a small one is not touched', async ({ page }) => {
  const saves: string[] = [];
  await page.addInitScript(() => localStorage.setItem('cashflow_language', 'th'));
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { saves.push(route.request().postData() || ''); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect.poll(() => saves.some(body => body.includes('"big"')), { timeout: 15_000 }).toBe(true);
  const body = JSON.parse(saves.find(text => text.includes('"big"'))!);
  const saved = JSON.stringify(body);
  const picture = saved.match(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g)!.find(url => url !== small)!;
  expect(picture.length).toBeLessThan(100 * 1024);
  expect(picture.length).toBeLessThan(big.length / 3);
  const dimensions = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, picture);
  expect(Math.max(...dimensions)).toBeLessThanOrEqual(256);
  expect(saves.every(text => !text.includes('"small"'))).toBe(true);
});
