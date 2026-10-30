import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The vault and ใบ 50 ทวิ on the landing (owner, 2026-10-31: "ไม่ต้องเอาหน้าจริงมา ทำเป็นไอคอน ... โมชั่นให้เห็นว่าเก็บไว้ในนี้
// สิ้นปีได้ไฟล์ zip แตกออกมาเป็นโปรเจกต์ต่าง ๆ ให้ไปยื่นภาษีได้เลย"): three steps, drawn, on a loop; the step buttons jump;
// nothing covers any text at any size, in Thai or English; with reduced motion it shows the last step, still.

async function open(page: Page, { width = 1440, height = 900, motion = false, lang = 'th' } = {}) {
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' });
  if (lang !== 'th') await page.addInitScript(l => { try { localStorage.setItem('cashflow_language', l); } catch { /* private window */ } }, lang);
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('.cl-feat.is-vault .gl-vault')).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
}

async function scrollToVault(page: Page) {
  await page.evaluate(async () => {
    const target = () => document.querySelector('.cl-feat.is-vault')!.getBoundingClientRect().top + scrollY - 90;
    for (let y = window.scrollY; y < target(); y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
    window.scrollTo(0, target());
  });
  await page.waitForTimeout(500);
}

const vault = (page: Page) => page.locator('.gl-vault');
const step = (page: Page, name: RegExp) => page.locator('.gl-vault-steps').getByRole('button', { name });

test('the vault section: title, the free and Pro limits, and the three steps running by themselves', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, { motion: true });
  await scrollToVault(page);
  const section = page.locator('.cl-feat.is-vault');
  await expect(section.getByRole('heading', { level: 2 })).toHaveAccessibleName('เก็บเอกสารทั้งปีไว้ที่เดียว');
  await expect(section).toContainText('ฟรี 5 ไฟล์ · Pro ไม่จำกัด');
  await expect(section).toContainText('ทุกไฟล์จัดเก็บเป็นระเบียบ ผูกกับงานอัตโนมัติ ค้นหาง่าย ดาวน์โหลดพร้อมใช้');
  await expect(page.getByRole('img', { name: /เก็บเข้าคลังเอกสาร สิ้นปีรวมเป็นไฟล์ ZIP เดียว/ })).toBeVisible();
  // 1: the papers drop in and the count goes up to 12
  await expect(step(page, /เก็บกับงาน/)).toHaveAttribute('aria-pressed', 'true');
  await expect(vault(page).locator('.gl-vault-count')).toHaveText('12 ไฟล์', { timeout: 8000 });
  // 2 and 3 follow on their own
  await expect(step(page, /รวมเป็น ZIP/)).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect(vault(page).locator('.gl-vault-zip')).toContainText('เอกสาร_2569.zip');
  await expect(step(page, /แยกตามงาน/)).toHaveAttribute('aria-pressed', 'true', { timeout: 8000 });
  await expect(vault(page).locator('.gl-vault-tree li')).toHaveCount(4);
  await expect(vault(page).locator('.gl-vault-tree li').first()).toBeVisible();
});

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`${width}px: every step, pressed by hand, has nothing over any text, inside the card`, async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, { motion: true, width, height });
    await scrollToVault(page);
    for (const name of [/รวมเป็น ZIP/, /แยกตามงาน/, /เก็บกับงาน/]) {
      await step(page, name).click();
      await expect(step(page, name)).toHaveAttribute('aria-pressed', 'true');
      // Step 1 is checked once the papers have all landed; 2 and 3 once they have moved into place.
      await page.waitForTimeout(name.source.includes('เก็บ') ? 5200 : 1900);
      expect(await textOverlapIssues(page), name.source).toEqual([]);
    }
    const card = (await vault(page).boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
    for (const box of await vault(page).locator('.gl-vault-tree li, .gl-vault-zip').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(card.x - 1);
      expect(box.right).toBeLessThanOrEqual(card.x + card.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('English: the same three steps, nothing overlapping', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, { motion: true, lang: 'en' });
  await scrollToVault(page);
  await expect(page.locator('.cl-feat.is-vault').getByRole('heading', { level: 2 })).toHaveAccessibleName(/Keep a whole year of documents in one place/);
  await step(page, /A folder per job/).click();
  await page.waitForTimeout(1900);
  await expect(vault(page).locator('.gl-vault-zip')).toContainText('documents_2026.zip');
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('reduced motion: the last step, still, and the buttons still change the step', async ({ page }) => {
  await open(page);
  await scrollToVault(page);
  await expect(step(page, /แยกตามงาน/)).toHaveAttribute('aria-pressed', 'true');
  await expect(vault(page).locator('.gl-vault-tree li').first()).toBeVisible();
  await page.waitForTimeout(7000);
  await expect(step(page, /แยกตามงาน/)).toHaveAttribute('aria-pressed', 'true');
  await step(page, /รวมเป็น ZIP/).click();
  await expect(step(page, /รวมเป็น ZIP/)).toHaveAttribute('aria-pressed', 'true');
  expect(await textOverlapIssues(page)).toEqual([]);
});
