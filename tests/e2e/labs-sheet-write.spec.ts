import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// บันทึกลงชีตของคุณ (ฟีเจอร์ทดลอง sheetWrite; owner, 2026-11-12: "บันทึกผ่านเลขากระรอกแชท … ในแชทกระรอกในเว็บได้"): a
// confirmation card of a new expense shows the customer's sheet with the new row tinted ("จะกรอกตรงนี้", formula cells
// "คำนวณเอง"); after ยืนยัน it says where the row went and offers ย้อนกลับ. Without the feature the card is as before.
// The backend and Google are mocked; no AI is called.

test.use({ serviceWorkers: 'block' });

const user = { id: '55555555-5555-4555-8555-555555555555', email: 'writer@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const PROPOSAL = 'p_1b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const PREVIEW = {
  file: 'บัญชีร้าน 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit', tab: 'รายจ่าย', row: 5,
  columns: [{ index: 0, letter: 'A', header: 'วันที่', formula: false }, { index: 1, letter: 'B', header: 'รายการ', formula: false }, { index: 2, letter: 'C', header: 'หมวด', formula: false }, { index: 3, letter: 'D', header: 'ยอดเงิน', formula: false }, { index: 4, letter: 'E', header: 'สะสม', formula: true }],
  before: [{ row: 3, cells: ['1/11/2569', 'ค่าเน็ต', 'สาธารณูปโภค', '599.00', '599.00'] }, { row: 4, cells: ['5/11/2569', 'ค่าเดินทาง', 'เดินทาง', '300.00', '899.00'] }],
  cells: ['12/11/2569', 'ค่าเช่ากล้อง', 'ค่าอุปกรณ์/ซอฟต์แวร์', '1,200', null],
};

async function open(page: Page, size: { width: number; height: number }, labsOn: string[]) {
  const googlePosts: Record<string, unknown>[] = [];
  let undone = false;
  await page.addInitScript(id => {
    localStorage.setItem(`krarok.fileNotice.${id}`, '1');
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-5555555555', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: labsOn } } }));
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } });
    const body = request.postDataJSON();
    if (body.action === 'message') return route.fulfill({ json: {
      text: 'เตรียมบันทึกรายจ่าย **ค่าเช่ากล้อง** ไว้แล้วครับ', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null,
      cards: [{ kind: 'confirm', id: PROPOSAL, title: 'เพิ่มรายจ่าย 1 รายการ', changes: [{ label: 'รายการ', value: 'ค่าเช่ากล้อง' }, { label: 'ยอดเงิน', value: '฿1,200' }] }],
    } });
    if (body.action === 'confirm') return route.fulfill({ json: { status: 'applied', kind: 'add_expense', recordId: 'exp-1', sheet: { status: 'written', file: PREVIEW.file, url: PREVIEW.url, tab: 'รายจ่าย', row: 5 } } });
    return route.fulfill({ json: { cancelled: true } });
  });
  await page.route('**/api/google', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    googlePosts.push(body);
    if (body.action === 'preview') return route.fulfill({ json: { preview: PREVIEW } });
    const write = { status: undone ? 'undone' : 'written', file: PREVIEW.file, url: PREVIEW.url, tab: 'รายจ่าย', row: 5, canUndo: !undone };
    if (body.action === 'written') return route.fulfill({ json: { write } });
    if (body.action === 'undo') { undone = true; return route.fulfill({ json: { undone: true, write: { ...write, status: 'undone', canUndo: false } } }); }
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize(size);
  await page.goto('/assistant');
  await expect(page.locator('#asx-message')).toBeVisible();
  await loadLayoutFonts(page);
  return { googlePosts };
}

const ask = async (page: Page, text: string) => {
  await page.locator('#asx-message').fill(text);
  await page.locator('.asx-send').click();
};

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`a new expense card on the ${device.name} shows the row it writes into the sheet, then where it went and ย้อนกลับ`, async ({ page }) => {
    const { googlePosts } = await open(page, device, ['sheets', 'sheetMap', 'sheetWrite']);
    await ask(page, 'ค่าเช่ากล้อง 1200 วันนี้');
    const preview = page.getByTestId('sheet-row-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('จะบันทึกลงชีต บัญชีร้าน 2569 › รายจ่าย ด้วย');
    await expect(preview).toContainText('จะกรอกตรงนี้ · แถว 5');
    await expect(preview).toContainText('คำนวณเอง');
    await expect(preview).toContainText('ค่าเดินทาง');
    expect(googlePosts[0]).toEqual({ action: 'preview', proposalId: PROPOSAL });
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/labs-sheet-write-${device.name}.png` });

    await page.locator('.asx-rcard.is-confirm .asx-pill-btn.is-primary').click();
    const done = page.getByTestId('sheet-row-done');
    await expect(done).toContainText('ลงชีต บัญชีร้าน 2569 › รายจ่าย แถว 5 แล้ว');
    await expect(done.getByRole('link', { name: 'เปิดชีต' })).toHaveAttribute('href', PREVIEW.url);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-sheet-written-${device.name}.png` });
    await done.getByRole('button', { name: 'ย้อนกลับ' }).click();
    await expect(done).toContainText('ย้อนกลับแล้ว แถว 5 ในชีตว่างแล้ว รายการในแอปยังอยู่');
    expect(googlePosts.map(post => post.action)).toEqual(['preview', 'written', 'undo']);
  });
}

test('without the feature the card is as before and Google is never asked', async ({ page }) => {
  const { googlePosts } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap']);
  await ask(page, 'ค่าเช่ากล้อง 1200 วันนี้');
  await expect(page.locator('.asx-rcard.is-confirm')).toBeVisible();
  await page.locator('.asx-rcard.is-confirm .asx-pill-btn.is-primary').click();
  await expect(page.locator('.asx-rcard.is-confirm.is-done')).toBeVisible();
  await expect(page.getByTestId('sheet-row-preview')).toHaveCount(0);
  await expect(page.getByTestId('sheet-row-done')).toHaveCount(0);
  expect(googlePosts).toEqual([]);
});
