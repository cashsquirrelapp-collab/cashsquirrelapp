import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// "Behind Krarok" (owner, 2026-10-31): the founder's story on a page of its own (/founder), open to everyone, and a short
// part of it on the landing that leads there. Until the owner's photos arrive, each photo has a marked space.

async function open(page: Page, path: string, { width = 1440, height = 900, lang = 'th' } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (lang !== 'th') await page.addInitScript(l => { try { localStorage.setItem('cashflow_language', l); } catch { /* private window */ } }, lang);
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`${width}px: the whole story, its seven parts, six photo spaces, the signature, nothing overlapping`, async ({ page }) => {
    await open(page, '/founder', { width, height });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('จากปัญหาที่ผมเคยเจอ สู่สิ่งที่อยากสร้างให้ทุกคน');
    await expect(page.getByText('BEHIND KRAROK · A STORY FROM THE FOUNDER')).toBeVisible();
    await expect(page.locator('.fs-section')).toHaveCount(7);
    await expect(page.locator('.fs-section-head h2')).toHaveText(['จุดเริ่มต้นของผม', 'ปัญหาที่ทำให้เกิด Krarok', '5 เดือนแห่งการลงมือสร้าง',
      'ทำไมผมถึงอยากสร้าง Krarok ให้ทุกคน', 'อนาคตที่ผมอยากสร้างให้ Krarok', 'ความไว้วางใจของคุณ คือความรับผิดชอบของเรา', 'ขอบคุณที่เป็นส่วนหนึ่งของการเริ่มต้น']);
    await expect(page.locator('[data-photo-slot]')).toHaveCount(6);
    await expect(page.getByRole('img', { name: 'พื้นที่สำหรับรูปที่ 2: ยายกับเครื่องกรองน้ำ' })).toBeAttached();
    await expect(page.locator('.fs-quote')).toHaveCount(4);
    await expect(page.locator('.fs-p strong').first()).toHaveText('สิ่งที่เคยเป็นเพียงความคิด สามารถกลายเป็นความจริงได้ หากเรากล้าลงมือทำ');
    await expect(page.locator('.fs-sign-name')).toHaveText('นพรัตน์ นาวะบุตร (Park)');
    await expect(page.getByText('Built from a real problem. Made for real people.')).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const at of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate(share => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * share), at);
      await page.waitForTimeout(150);
      expect(await textOverlapIssues(page), `at ${at}`).toEqual([]);
    }
    // The way on: start free, or send a thought to the team.
    await expect(page.getByRole('link', { name: 'เริ่มใช้ฟรี' }).last()).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'ส่งความคิดเห็นถึงเรา' })).toHaveAttribute('href', '/#cl-help');
  });
}

test('the landing has the story in short, and its button opens the whole story', async ({ page }) => {
  await open(page, '/');
  const teaser = page.locator('#cl-founder');
  await teaser.scrollIntoViewIfNeeded();
  await expect(teaser.getByRole('heading', { level: 2 })).toHaveText('จากปัญหาที่ผมเคยเจอ สู่สิ่งที่อยากสร้างให้ทุกคน');
  await expect(teaser).toContainText('ผมเริ่มสร้าง Krarok เพราะอยากแก้ปัญหาของตัวเอง');
  await expect(teaser.locator('[data-photo-slot="portrait"]')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await teaser.getByRole('link', { name: 'อ่านเรื่องราวจากผู้ก่อตั้ง' }).click();
  await expect(page).toHaveURL(/\/founder$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('English: the story in English, nothing overlapping', async ({ page }) => {
  await open(page, '/founder', { lang: 'en' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('From a problem I once had, to something I want to build for everyone');
  await expect(page.locator('.fs-section-head h2').first()).toHaveText('Where I started');
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
});

// Owner, 2026-10-31: "อย่าลืมปรับสี text โลโก้ด้วย มันกลืน". With the app in dark mode the page stays light, so the logo's
// words are dark on the white bar.
test('in the app\'s dark mode the page stays light and the logo reads', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cashflow_dark_mode', 'true'); } catch { /* private window */ } });
  await page.addInitScript(() => document.documentElement.classList.add('dark'));
  await open(page, '/founder');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
  const color = await page.locator('.fs-brand .krarok-brand-lockup').evaluate(el => {
    const words = [...el.querySelectorAll('*')].find(node => node.childElementCount === 0 && /กระรอก/.test(node.textContent || '')) as HTMLElement | undefined;
    return getComputedStyle(words || el).color;
  });
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  expect((r + g + b) / 3, color).toBeLessThan(140);
});
