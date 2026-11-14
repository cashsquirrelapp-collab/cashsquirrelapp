import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// ยอดสุทธิ → ยอดก่อนหัก on the sheet card (owner's plan: "ลูกค้าพิมพ์ในแชทว่า ได้โอนมา 9,700 แต่ชีตเขากรอกค่าจ้างก่อนหัก →
// เลขาคิดย้อนให้ว่าค่าจ้างคือ 10,000 แล้วถามก่อน"; built 2026-11-15): the card asks whether 9,700 came in after withholding
// and offers 10,000 with one button, which changes the card itself (value and rate) the way แก้ไข does; nothing is written
// until ยืนยันเขียนลงชีต. The figure is the server's (tests/sheet-gross.test.ts); here the backend and Google are mocked.

test.use({ serviceWorkers: 'block' });

const user = { id: '55555555-5555-4555-8555-555555555556', email: 'gross@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const FIRST = 'p_1b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d40';
const REVISED = 'p_1b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d41';
const columns = [
  { index: 0, letter: 'A', header: 'วันที่โอน', formula: false }, { index: 1, letter: 'B', header: 'ลูกค้า', formula: false }, { index: 2, letter: 'C', header: 'งาน', formula: false },
  { index: 3, letter: 'D', header: 'ค่าจ้าง', formula: false }, { index: 4, letter: 'E', header: 'หัก 3%', formula: true }, { index: 5, letter: 'F', header: 'โอนจริง', formula: true },
];
const before = [{ row: 2, cells: ['2/11/2569', 'บริษัท ก', 'ถ่ายภาพสินค้า', '20,000.00', '600.00', '19,400.00'] }];
const PREVIEW_NET = { file: 'งานลูกค้า 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit', tab: 'รายรับ', row: 3, columns, before,
  cells: ['14/11/2569', 'บริษัท ข', 'ตัดต่อคลิปรีวิว', '9,700', null, null], computed: [null, null, null, null, '291.00', '9,409.00'],
  differs: [{ header: 'หัก 3%', sheet: '291.00', app: '0.00' }],
  gross: { value: 10000, rate: 3, valueText: '10,000.00', netText: '9,700.00', whtText: '300.00', valueHeader: 'ค่าจ้าง', netHeader: 'โอนจริง', sheetNet: '9,700.00' } };
const PREVIEW_GROSS = { ...PREVIEW_NET, cells: ['14/11/2569', 'บริษัท ข', 'ตัดต่อคลิปรีวิว', '10,000', null, null], computed: [null, null, null, null, '300.00', '9,700.00'], differs: [], gross: undefined };
const edit = (value: string, rate: string) => [
  { field: 'name', label: 'ชื่องาน', type: 'text', value: 'ตัดต่อคลิปรีวิว' }, { field: 'client', label: 'ลูกค้า', type: 'text', value: 'บริษัท ข' },
  { field: 'value', label: 'มูลค่า (บาท)', type: 'money', value }, { field: 'wht_rate', label: 'หัก ณ ที่จ่าย (%)', type: 'choice', value: rate, options: ['0', '1', '2', '3', '5'] },
];
const card = (id: string, value: string, rate: string) => ({ kind: 'confirm', id, title: 'เพิ่มงานใหม่ 1 งาน', edit: edit(value, rate),
  changes: [{ label: 'งาน', value: 'ตัดต่อคลิปรีวิว' }, { label: 'มูลค่า', value: `฿${Number(value).toLocaleString('en-US')}` }, { label: 'หัก ณ ที่จ่าย', value: rate === '0' ? 'ไม่หัก' : `${rate}%` }] });

async function open(page: Page, size: { width: number; height: number }) {
  const posts: Record<string, unknown>[] = [];
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
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-5555555556', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: ['sheets', 'sheetMap', 'sheetWrite'] } } }));
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-30T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } });
    const body = request.postDataJSON();
    posts.push(body);
    if (body.action === 'message') return route.fulfill({ json: { text: 'เตรียมเพิ่มงาน **ตัดต่อคลิปรีวิว** ไว้แล้วครับ', route: 'action', tokens: 4, tokensLeft: 990, trialLeft: null, cards: [card(FIRST, '9700', '0')] } });
    if (body.action === 'revise') return route.fulfill({ json: { card: card(REVISED, body.edits.value, body.edits.wht_rate) } });
    return route.fulfill({ json: { cancelled: true } });
  });
  await page.route('**/api/google', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'preview') return route.fulfill({ json: { preview: body.proposalId === FIRST ? PREVIEW_NET : PREVIEW_GROSS } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize(size);
  await page.goto('/assistant');
  await expect(page.locator('#asx-message')).toBeVisible();
  await loadLayoutFonts(page);
  return posts;
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`the sheet card asks whether 9,700 came in after withholding and switches to 10,000 with one button (${device.name})`, async ({ page }) => {
    const posts = await open(page, device);
    await page.locator('#asx-message').fill('ได้โอนมา 9,700 งานตัดต่อคลิปรีวิว บริษัท ข');
    await page.locator('.asx-send').click();
    const gross = page.getByTestId('sheet-gross');
    await expect(gross).toContainText('ยอด 9,700.00 เป็นยอดที่ได้รับหลังหัก ณ ที่จ่ายหรือไม่');
    await expect(gross).toContainText('ถ้าใช่ ให้ใส่ ค่าจ้าง เป็น 10,000.00 แทน สูตรของคุณจะได้ โอนจริง 9,700.00 ตรงกับยอดที่ได้รับ');
    await expect(gross).toContainText('ในแอปจะบันทึกมูลค่า 10,000.00 หัก ณ ที่จ่าย 3% เป็นเงิน 300.00');
    await page.waitForTimeout(500);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await gross.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/labs-sheet-gross-${device.name}.png` });

    await gross.getByRole('button', { name: 'ใช้ยอดก่อนหัก 10,000.00' }).click();
    // The card itself changes, as แก้ไข would: the value and the rate, nothing written yet.
    await expect.poll(() => posts.filter(body => body.action === 'revise')).toEqual([{ action: 'revise', proposalId: FIRST, edits: { value: '10000', wht_rate: '3' } }]);
    await expect(page.getByTestId('sheet-gross')).toHaveCount(0);
    await expect(page.getByTestId('sheet-row-preview')).toContainText('10,000');
    await expect(page.getByTestId('sheet-row-preview')).toContainText('9,700.00');
    expect(posts.some(body => body.action === 'confirm')).toBe(false);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/labs-sheet-gross-after-${device.name}.png` });
  });
}
