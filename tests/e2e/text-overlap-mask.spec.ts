import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

async function fixture(page: Page, mask: string, positions: number[]) {
  await page.setContent(`<style>
    body { margin: 0; font-family: 'IBM Plex Sans Thai', sans-serif; }
    .stage { position: relative; width: 400px; height: 300px; margin: 20px; }
    .masked { position: absolute; inset: 0; mask-image: ${mask}; }
    span { position: absolute; left: 20px; font-size: 20px; line-height: 28px; }
  </style><div class="stage"><div class="masked">${positions.map((top, index) => `<span style="top:${top}px">masked ${index}</span>`).join('')}</div>
    ${positions.map((top, index) => `<span style="top:${top}px">visible ${index}</span>`).join('')}
  </div>`);
}

test('fully transparent vertical mask edges are excluded with px, percent and calc stops', async ({ page }) => {
  for (const mask of [
    'linear-gradient(to bottom, transparent 0px, transparent 60px, black 90px, black 180px, transparent 220px)',
    'linear-gradient(180deg, transparent 0%, transparent 20%, black 30%, black 60%, transparent 75%)',
    'linear-gradient(to bottom, transparent 0px, transparent calc(0% + 60px), black 90px, black calc(100% - 120px), transparent calc(100% - 80px))',
  ]) {
    await fixture(page, mask, [0, 260]);
    expect(await textOverlapIssues(page), mask).toEqual([]);
  }
});

test('visible and partially faded text still fails the original overlap check', async ({ page }) => {
  await fixture(page, 'linear-gradient(to bottom, transparent 0px, transparent 60px, black 110px, black 180px, transparent 220px)', [70, 135]);
  const issues = await textOverlapIssues(page);
  for (const index of [0, 1]) {
    expect(issues.some(issue => issue.kind === 'TOUCH' && issue.a === `masked ${index}` && issue.b === `visible ${index}`)).toBe(true);
  }
});

test('nonzero alpha and unsupported mask directions remain conservatively checked', async ({ page }) => {
  for (const mask of [
    'linear-gradient(to bottom, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 100%)',
    'linear-gradient(to right, transparent 0px, transparent 100%)',
    'radial-gradient(transparent 0px, transparent 100%)',
  ]) {
    await fixture(page, mask, [135]);
    expect((await textOverlapIssues(page)).some(issue => issue.kind === 'TOUCH' && issue.a === 'masked 0' && issue.b === 'visible 0'), mask).toBe(true);
  }
});
