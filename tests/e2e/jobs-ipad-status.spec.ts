import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { textOverlapIssues } from './textOverlap';

// Owner, 2026-11-02 ("ฝากดู UI สถานะ ... ของไอแพดหน่อยมันแปลกๆ ช่องสถานะอ่ะ ไม่ควรเป็นงี้นะ"): below 1280px the jobs table put
// the work-stage chip and the payment chip in one narrow cell, so some rows stacked them and others did not, and the rows
// came out at different heights. iPads now get the computer's columns minus the client one: สถานะงาน and การชำระ each
// hold their own chip, and every row keeps one line. Computers (1280px and up) are unchanged.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'jobs@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const today = new Date('2026-10-28T05:00:00Z');
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() - offset); return d.toISOString().slice(0, 10); };
const base = { client: 'บริษัท ตัวอย่าง จำกัด', type: 'Design', creditTerm: 30, note: '', whtRate: 0, whtAmount: 0 };
const jobs = [
  { ...base, id: 'working', name: 'ออกแบบโลโก้', value: 5000, received: 0, pending: 5000, status: 'pending', paymentStatus: 'unpaid', isPosted: false, postDate: day(1), payDate: day(-30) },
  { ...base, id: 'awaiting', name: 'ถ่ายภาพสินค้า', value: 8000, received: 0, pending: 8000, status: 'pending', paymentStatus: 'unpaid', isPosted: true, postDate: day(10), payDate: day(-3) },
  { ...base, id: 'partial', name: 'ตัดต่อวิดีโอ', value: 12000, received: 4000, pending: 8000, status: 'partial', paymentStatus: 'partial', isPosted: true, postDate: day(12), payDate: day(2) },
  { ...base, id: 'closed', name: 'งานเขียนบทความ', value: 3000, received: 3000, pending: 0, status: 'done', paymentStatus: 'paid', isPosted: true, postDate: day(3), payDate: day(3) },
  { ...base, id: 'wht', name: 'ที่ปรึกษาการตลาด', value: 20000, received: 19400, pending: 0, status: 'done', paymentStatus: 'paid', isPosted: true, postDate: day(4), payDate: day(4), whtRate: 3, whtAmount: 600 },
  { ...base, id: 'late', name: 'งานค้างจ่ายนาน', value: 1250000, received: 0, pending: 1250000, status: 'pending', paymentStatus: 'unpaid', isPosted: true, postDate: day(40), payDate: day(20) },
];
const snapshot = { jobs, expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, width: number, height: number, mode: 'light' | 'dark') {
  await page.clock.install({ time: today });
  await page.addInitScript(m => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_theme_pref', JSON.stringify({ mode: m, asked: true })); }, mode);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: null } }));
  await page.setViewportSize({ width, height });
  await page.goto(noRadar('/jobs'));
  await expect(page.locator('table tbody tr')).toHaveCount(jobs.length);
}

const header = (page: Page, name: string) => page.locator('table thead th').filter({ hasText: name });

// iPad mini, iPad and iPad Air/Pro 11, upright and lying down (the sidebar shows from 1024px).
const ipads = [
  { width: 744, height: 1133, mode: 'dark' }, { width: 820, height: 1180, mode: 'light' }, { width: 1024, height: 768, mode: 'light' },
  { width: 1133, height: 744, mode: 'dark' }, { width: 1180, height: 820, mode: 'dark' }, { width: 1194, height: 834, mode: 'light' },
] as const;

for (const size of ipads) {
  test(`iPad ${size.width}x${size.height} (${size.mode}): สถานะงาน and การชำระ have a column each, every row one line`, async ({ page }, testInfo) => {
    await open(page, size.width, size.height, size.mode);
    await expect(header(page, 'สถานะงาน')).toBeVisible();
    await expect(header(page, 'การชำระ')).toBeVisible();
    await expect(header(page, 'ลูกค้า / ผู้จ่าย')).toBeHidden(); // the client stays under the job name

    const rows = await page.locator('table tbody tr').evaluateAll(trs => trs.map(tr => {
      const cells = [...tr.children] as HTMLElement[];
      const shown = cells.filter(c => getComputedStyle(c).display !== 'none');
      const [, , stage, payment] = shown;
      return {
        id: tr.getAttribute('data-job-id') || '',
        height: Math.round(tr.getBoundingClientRect().height),
        stageChips: stage.querySelectorAll('span.rounded-md').length,
        stageText: stage.textContent,
        paymentText: payment.textContent,
        // Truncated text (the job name, the due date) may hide its end; nothing else may spill out of its cell.
        spills: shown.slice(2).filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent),
      };
    }));
    for (const row of rows) {
      expect(row.stageChips, `${row.id}: one chip in สถานะงาน`).toBe(1);
      expect(row.stageText, row.id).not.toMatch(/ยังไม่จ่าย|รับบางส่วน|รับครบแล้ว/);
      expect(row.paymentText, row.id).toMatch(/ยังไม่จ่าย|รับบางส่วน|รับครบแล้ว/);
      expect(row.spills, row.id).toEqual([]);
    }
    // Every row is the same height, except the one carrying the 50 ทวิ chip under its payment (as on a computer).
    const plain = rows.filter(row => row.id !== 'wht').map(row => row.height);
    expect(Math.max(...plain) - Math.min(...plain)).toBeLessThanOrEqual(1);

    // The chips still open their menus.
    await page.locator('[data-job-id="awaiting"]').getByRole('button', { name: 'เปลี่ยนการชำระของงาน ถ่ายภาพสินค้า' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');

    expect(await textOverlapIssues(page)).toEqual([]);
    await page.locator('table').screenshot({ path: testInfo.outputPath(`jobs-ipad-${size.width}-${size.mode}.png`) });
  });
}

test('computer (1280px and up): the table keeps its columns and widths', async ({ page }) => {
  await open(page, 1366, 1024, 'light');
  await expect(header(page, 'ลูกค้า / ผู้จ่าย')).toBeVisible();
  const widths = await page.locator('table thead th').evaluateAll(ths => ths.map(th => Math.round(th.getBoundingClientRect().width)));
  // งาน 23% · ลูกค้า (rest) · กำหนด 136 · สถานะงาน 104 · การชำระ 108 · จำนวนเงิน 112 · ⋯ 150, as before this change.
  expect(widths.slice(2)).toEqual([136, 104, 108, 112, 150]);
});
