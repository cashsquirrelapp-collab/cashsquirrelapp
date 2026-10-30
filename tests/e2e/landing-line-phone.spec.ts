import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The landing's 08:00 reminder phone shows LINE as LINE draws it (owner, 2026-10-30, from a screenshot of the real chat:
// the cards were "ซูมเกินไป ... ใหญ่เกินไป"): the account's bar, the bot's picture beside each card at LINE's own size, the
// card's time, the green message LINE sends when ได้รับแล้ว is pressed, the reply card, and the menu bar's name. The cards
// never slide over the bar, and no text is covered, at any size.

async function open(page: Page, width: number, height: number, motion = false) {
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' });
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.cl-feat.is-remind .gl-device').scrollIntoViewIfNeeded();
  await expect(page.locator('.lp-card').first()).toBeVisible();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.lp-card')].every(img => img.complete && img.naturalWidth > 0));
}

for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568]] as const) {
  test(`at ${width}×${height} the LINE chat reads like LINE: cards at LINE's size, the bar never covered, no text covered`, async ({ page }) => {
    await open(page, width, height);
    const chat = page.locator('.lp-chat');
    await expect(chat.locator('.lp-bar')).toContainText('กระรอกตุนเงิน');
    await expect(chat.locator('.lp-menu')).toContainText('เลขาการเงิน');
    await expect(chat.locator('.lp-bubble')).toHaveText('ได้รับเงินแล้ว · รีวิวสินค้า'); // the button's own displayText
    await expect(chat.locator('.lp-avatar')).toHaveCount(2);
    await expect(chat.locator('.lp-time')).toHaveText(['08:00', '08:01', '08:01']);
    const fit = await page.evaluate(() => {
      const screen = document.querySelector('.lp-chat')!.getBoundingClientRect();
      const bar = document.querySelector('.lp-bar')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.lp-card')].map(card => card.getBoundingClientRect().width / screen.width);
      const top = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height - 8);
      return { cards: cards.map(share => share > 0.6 && share < 0.8), barOnTop: !!top?.closest('.lp-bar'), left: getComputedStyle(document.querySelector('.lp-bar b')!).textAlign };
    });
    expect(fit).toEqual({ cards: [true, true], barOnTop: true, left: 'left' });
    expect(await textOverlapIssues(page)).toEqual([]);
  });
}

test('with motion, the finger presses ได้รับแล้ว on the card, then the green message and the reply come in', async ({ page }) => {
  await open(page, 1440, 900, true);
  const where = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.lp-card')!, tap = document.querySelector<HTMLElement>('.lp-tap')!;
    const chat = document.querySelector<HTMLElement>('.lp-chat')!;
    const offset = (el: HTMLElement) => { let x = 0, y = 0; for (let e: HTMLElement | null = el; e && e !== chat; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
    const c = offset(card), t = offset(tap);
    return { x: (t.x + 23 - c.x) / card.offsetWidth, y: (t.y + 23 - c.y) / card.offsetHeight };
  });
  expect(Math.abs(where.x - 0.2)).toBeLessThan(0.02);
  expect(Math.abs(where.y - 0.599)).toBeLessThan(0.02);
  const shifts = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.lp-track')!); return [parseFloat(s.getPropertyValue('--lp-a')), parseFloat(s.getPropertyValue('--lp-b'))]; });
  expect(shifts[1]).toBeGreaterThan(shifts[0]); // the reply moves the chat up further than the message did
});
