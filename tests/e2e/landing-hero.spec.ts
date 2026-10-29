import { expect, test, type Page } from '@playwright/test';
import { FULL_LAUNCH_AT } from '../../frontend/src/features/marketing/v5/launch';
import { textOverlapIssues } from './textOverlap';

// The landing's hero after the owner's review of 2026-10-29 night: the headline "ตั้งแต่รับงาน จนถึงรับเงิน / ให้เลขากระรอกดูแล"
// (two lines on phones too), no line of copy under it (typing or speaking to เลขา is Pro only), เริ่มใช้ฟรี, and a
// countdown to the full launch on 1 December 2569 that goes on the day. LINE, Gmail, the document and the squirrel float
// with no glass around them; the menu's links have no pill; phones have no help button in the bar.

async function open(page: Page, size: { width: number; height: number }, at = FULL_LAUNCH_AT - 90061000) {
  await page.clock.setFixedTime(at);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize(size);
  await page.goto('/');
}

test('the hero: the new headline, no copy line under it, and the launch countdown', async ({ page }) => {
  await open(page, { width: 1440, height: 900 });
  const hero = page.locator('.cl-hero');
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('ตั้งแต่รับงาน จนถึงรับเงิน ให้เลขากระรอกดูแล');
  await expect(hero.locator('p')).toHaveText(['พร้อมให้ใช้งานเต็มรูปแบบ 1 ธันวาคม 2569']); // the only line of copy is the countdown's
  await expect(hero.getByText('แค่พิมพ์หรือพูดภาษาปกติ')).toHaveCount(0);
  const timer = hero.getByRole('timer');
  await expect(timer).toHaveAttribute('data-seconds-left', '90061');
  await expect(timer).toHaveAccessibleName('เวลาที่เหลือ 1 วัน 1 ชั่วโมง 1 นาที 1 วินาที');
  await expect(timer.locator(':scope > span b')).toHaveText(['01', '01', '01', '01']);
  // เลขากระรอก keeps running its colours (stopped only with reduced motion, as here)
  await expect(hero.locator('.cl-grad.is-flow')).toHaveText('เลขากระรอก');
  // LINE, Gmail, the document and the squirrel float with no glass around them
  for (const n of [1, 4, 5, 6]) await expect(page.locator(`.cl-tile.is-${n} .cl-tile-card`)).not.toHaveClass(/cl-glass/);
  await expect(page.locator('.cl-links')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(await textOverlapIssues(page)).toEqual([]);
  // on the day it goes
  await page.clock.setFixedTime(FULL_LAUNCH_AT);
  await expect(hero.getByRole('timer')).toHaveCount(0);
  await expect(hero.getByText('พร้อมให้ใช้งานเต็มรูปแบบ 1 ธันวาคม 2569')).toHaveCount(0);
});

for (const width of [320, 360, 390, 430]) {
  test(`${width}px phone: the headline on two lines, the countdown inside the screen, no help button in the bar`, async ({ page }) => {
    await open(page, { width, height: 844 });
    const h1 = page.getByRole('heading', { level: 1 });
    const lines = await h1.evaluate(node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)));
    expect(lines).toBe(2);
    const ticks = await page.locator('.cl-hero [role="timer"] > span').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, fits: node.scrollWidth <= node.clientWidth };
    }));
    expect(ticks).toHaveLength(4);
    expect(ticks.every(tick => tick.left >= 0 && tick.right <= width && tick.fits && Math.abs(tick.top - ticks[0].top) < 1)).toBe(true);
    await expect(page.locator('.cl-bar').getByRole('link', { name: 'ช่วยเหลือ' })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await textOverlapIssues(page)).toEqual([]);
  });
}

test('the problems: เคยเป็นแบบนี้ไหม? and the owner\'s five notes, each on its own two lines on a computer', async ({ page }) => {
  await open(page, { width: 1280, height: 800 });
  const problem = page.locator('.cl-problem');
  await expect(problem.getByText('เคยเป็นแบบนี้ไหม?')).toBeVisible();
  await expect(problem.getByRole('heading', { level: 2 })).toHaveAccessibleName('แค่รับงานก็เหนื่อยพอแล้ว…');
  const notes = problem.locator('.cl-note');
  await expect(notes).toHaveText([
    /โอ๊ย จ่ายอะไรไปบ้างเนี่ย\s*ไม่ได้จดอีกแล้ว/,
    /แค่ทำใบเสนอราคา\s*ทำไมมันยุ่งยากจัง/,
    /อันไหนเงินงาน อันไหนเงินตัวเอง\s*ปนกันไปหมดแล้ว/,
    /ลูกค้าคนไหนยังไม่จ่ายบ้างนะ\s*ต้องไล่เช็กใหม่อีกแล้ว/,
    /ทำงานมาตั้งเยอะ\s*ตกลงเหลือกำไรเท่าไรกันแน่/,
  ]);
  await problem.scrollIntoViewIfNeeded();
  const lines = await problem.locator('.cl-note .gl-hand').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))));
  expect(lines).toEqual([2, 2, 2, 2, 2]);
  expect(await textOverlapIssues(page)).toEqual([]);
});
