import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The landing's signup total (owner, 2026-10-29/30): "มีผู้สมัครแล้ว {จำนวน} คน · มาเริ่มจัดการเรื่องเงินไปด้วยกัน" beside
// the start button on the first screen (under it on phones). Only the total comes from /api/public-stats; asked again every 60 seconds; a new total
// rolls from the old one; while loading the room is kept; with no real total there is no number (never 0).

// Measured without the page's opening motion (it scales the button row in).
async function open(page: Page, reply: () => { status?: number; json: unknown }, width = 1440) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.clock.resume();
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.route('**/api/public-stats', route => { const answer = reply(); return route.fulfill({ status: answer.status ?? 200, json: answer.json }); });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  const row = page.locator('.cl-hero .cl-signups');
  await expect(row).toBeVisible();
  return row;
}

test('the real total, read out once; asked again a minute later, the digits roll to the new total', async ({ page }) => {
  let total = 128;
  const calls: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/public-stats') calls.push(request.method()); });
  const row = await open(page, () => ({ json: { signups: total, countedAt: '2026-10-30T00:00:00.000Z' } }));
  await expect(row).toContainText('มีผู้สมัครแล้ว 128 คน');
  await expect(row).toContainText('มาเริ่มจัดการเรื่องเงินไปด้วยกัน');
  await expect(row.locator('.cl-odo-wheel')).toHaveCount(3);
  // never called live or real time; no faces, no reviews
  await expect(row).not.toContainText(/เรียลไทม์|ออนไลน์|กำลังใช้งาน|real.?time|online/i);
  await expect(row.locator('img')).toHaveCount(1); // the Krarok coin only
  await expect(page.locator('.cl-signups')).toHaveCount(1); // once on the page, on the first screen
  expect((await row.boundingBox())!.y + 66).toBeLessThan(900);
  const height = (await row.boundingBox())!.height;
  expect(await textOverlapIssues(page)).toEqual([]);
  // a minute later: one more ask, and the wheels move from where they were (the same wheels, not drawn again)
  const wheel = await row.locator('.cl-odo-wheel').last().elementHandle();
  total = 131;
  await page.clock.fastForward(61_000);
  await expect(row).toContainText('มีผู้สมัครแล้ว 131 คน');
  expect(await wheel!.evaluate(node => node.isConnected)).toBe(true);
  expect(calls.filter(method => method === 'GET').length).toBe(2);
  expect((await row.boundingBox())!.height).toBe(height);
});

test('while the total is on its way the room is kept; with no real total there is no number at all, never 0', async ({ page }) => {
  let release: () => void = () => {};
  const waited = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/public-stats', async route => { await waited; await route.fulfill({ status: 503, json: { error: 'ยังนับจำนวนผู้สมัครไม่ได้' } }); });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const row = page.locator('.cl-hero .cl-signups');
  await expect(row).toHaveClass(/is-waiting/);
  await page.evaluate(() => document.fonts.ready); // measured in the page's own type
  const waiting = (await row.boundingBox())!;
  const button = (await page.locator('.cl-hero .cl-btn.is-big').boundingBox())!;
  release();
  await expect(row).toHaveText('มาเริ่มจัดการเรื่องเงินไปด้วยกัน');
  await expect(row).not.toContainText(/\d/);
  // nothing moves: the capsule keeps its size and the start button its place
  const after = (await row.boundingBox())!;
  expect(Math.abs(after.height - waiting.height)).toBeLessThan(1);
  expect(Math.abs(after.width - waiting.width)).toBeLessThan(1);
  expect(Math.abs((await page.locator('.cl-hero .cl-btn.is-big').boundingBox())!.x - button.x)).toBeLessThan(1);
});

test('a total of 0 or a broken answer shows no number either; a later failure keeps the last real total', async ({ page }) => {
  let answer: { status?: number; json: unknown } = { json: { signups: 0 } };
  const row = await open(page, () => answer);
  await expect(row).toHaveText('มาเริ่มจัดการเรื่องเงินไปด้วยกัน');
  answer = { json: { signups: 57 } };
  await page.clock.fastForward(61_000);
  await expect(row).toContainText('มีผู้สมัครแล้ว 57 คน');
  answer = { status: 503, json: { error: 'ยังนับจำนวนผู้สมัครไม่ได้' } };
  await page.clock.fastForward(61_000);
  await page.waitForTimeout(300);
  await expect(row).toContainText('มีผู้สมัครแล้ว 57 คน');
});

test('on a phone the total sits inside the screen, nothing overlapping; English reads naturally', async ({ page }) => {
  const row = await open(page, () => ({ json: { signups: 1284 } }), 390);
  await expect(row).toContainText('มีผู้สมัครแล้ว 1,284 คน');
  const box = (await row.boundingBox())!;
  expect(box.x >= 0 && box.x + box.width <= 390).toBe(true);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.evaluate(() => localStorage.setItem('cashflow_language', 'en'));
  await page.reload();
  await expect(page.locator('.cl-hero .cl-signups')).toContainText('1,284 people have signed up');
});
