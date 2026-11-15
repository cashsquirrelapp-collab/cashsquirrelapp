import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// Many records pasted at once in the app's chat (owner, 2026-11-16): the questions first, all on one card; then the summary,
// the cards grouped รายรับ · รายจ่าย · งานรอรับเงิน with a total and their own ยืนยัน, ยืนยันทั้งหมด, and the sheet last,
// shown only when asked, its new rows one after another (6, 7, 8 …). Every confirmation goes one at a time: ten at once all
// found the same empty row in the sheet. The backend and Google are mocked; no AI is called.

test.use({ serviceWorkers: 'block' });

const user = { id: '33333333-3333-4333-8333-333333333333', email: 'batch@example.test', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const P = (n: number) => `p_0b9d3c1e-4f5a-4b6c-8d7e-${String(n).padStart(12, '0')}`;
const LINES: [string, 'income' | 'expense' | 'job', string, number, string][] = [
  ['ค่าตัดต่อคลิป', 'income', 'เพิ่มงานใหม่ 1 งาน', 3500, '16 พ.ย. 2569'],
  ['ค่าอาหาร', 'expense', 'เพิ่มรายจ่าย', 120, '2026-11-15'],
  ['กาแฟ', 'expense', 'เพิ่มรายจ่าย', 85, '2026-11-14'],
  ['งานตัดต่อ', 'income', 'เพิ่มงานใหม่ 1 งาน', 2000, '14 พ.ย. 2569'],
  ['ค่าเดินทาง', 'expense', 'เพิ่มรายจ่าย', 60, '2026-11-13'],
  ['อุปกรณ์ถ่ายคลิป', 'expense', 'เพิ่มรายจ่าย', 890, '2026-11-13'],
  ['งานรีวิว TikTok', 'income', 'เพิ่มงานใหม่ 1 งาน', 4500, '12 พ.ย. 2569'],
  ['ค่าอินเทอร์เน็ต', 'expense', 'เพิ่มรายจ่าย', 599, '2026-11-12'],
  ['ตัดต่อ 5 คลิป', 'job', 'เพิ่มงานใหม่ 1 งาน', 3500, '11 พ.ย. 2569'],
  ['ค่าฟิตเนส', 'expense', 'เพิ่มรายจ่าย', 1200, '2026-11-10'],
];
const CARDS = LINES.map(([name, kind, title, amount, date], at) => ({
  kind: 'confirm', id: P(at + 1), title, entry: { line: at + 1, kind },
  changes: kind === 'expense'
    ? [{ label: 'รายการ', value: name }, { label: 'จำนวนเงิน', value: `฿${amount.toLocaleString('en-US')}` }, { label: 'หมวดหมู่', value: 'อื่นๆ' }, { label: 'วันที่', value: date }]
    : [{ label: 'งาน', value: name }, { label: 'ลูกค้า', value: 'ไม่ระบุ' }, { label: 'มูลค่า', value: `฿${amount.toLocaleString('en-US')}` }, { label: 'การชำระ', value: kind === 'job' ? 'ยังไม่จ่าย' : `จ่ายครบแล้ว ${date}` }],
}));
const SUMMARY = 'อ่านครบ 10 จาก 10 รายการครับ\n• รายรับ 3 รายการ รวม ฿10,000\n• รายจ่าย 6 รายการ รวม ฿2,954\n• งานรอรับเงิน 1 รายการ รวม ฿3,500\nยังไม่ได้บันทึกนะครับ ตรวจในการ์ดด้านล่าง แล้วกดยืนยันทีละกลุ่มหรือยืนยันทั้งหมด';
const QUESTIONS = { kind: 'questions', id: 'entries-b1', questions: [
  { id: 'q1', text: 'ข้อ 4 งานตัดต่อ ฿2,000 · มัดจำนี้ของงานมูลค่าเต็มเท่าไร', options: ['บันทึกเป็นรายรับอย่างเดียว', 'ไม่บันทึกรายการนี้'], allowText: true, placeholder: 'ตัวเลข เช่น 10000' },
  { id: 'q2', text: 'ข้อ 9 ตัดต่อ 5 คลิป ฿3,500 · ส่งงานแล้วหรือยัง', options: ['ส่งแล้ว 11 พ.ย. 2569', 'ยังทำอยู่', 'ไม่บันทึกรายการนี้'], allowText: true, calendar: true, placeholder: 'เช่น 14 พ.ย.' },
  { id: 'q3', text: 'ข้อ 10 ค่าฟิตเนส ฿1,200 · อยู่หมวดไหน', options: ['ค่าอุปกรณ์/ซอฟต์แวร์', 'อาหาร/รับรองลูกค้า', 'อื่นๆ'], allowText: false },
] };

async function open(page: Page, size: { width: number; height: number }, sheet: boolean) {
  const posts: any[] = [];
  const google: any[] = [];
  let inFlight = 0;
  let overlapped = false;
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-3333333333', displayName: 'มายด์' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: false, on: sheet ? ['sheets', 'sheetMap', 'sheetWrite'] : [] } } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  const written: string[] = [];
  await page.route('**/api/google', async route => {
    const body = route.request().postDataJSON();
    google.push(body);
    if (body.action === 'previewMany') return route.fulfill({ json: { preview: { file: 'บัญชีร้าน', url: 'https://docs.google.com/spreadsheets/d/f/edit', fileId: 'f', tabs: [
      { tab: 'รายรับ', gid: 0, span: 2, columns: [{ index: 0, letter: 'A', header: 'วันที่', formula: false }, { index: 1, letter: 'B', header: 'รายการ', formula: false }, { index: 2, letter: 'C', header: 'ยอด', formula: false }],
        before: [{ row: 5, cells: ['10/11/2569', 'งานเก่า', '1,000'] }],
        rows: body.proposalIds.filter((id: string) => ['income', 'job'].includes(CARDS.find(card => card.id === id)!.entry.kind)).map((id: string, at: number) => {
          const card = CARDS.find(item => item.id === id)!;
          return { proposalId: id, row: 6 + at, cells: ['16/11/2569', card.changes[0].value, card.changes[2].value.replace('฿', '')] };
        }) },
    ] } } });
    // Each tab fills its own next rows, in the order the cards were saved.
    const tabOf = (id: string) => (CARDS.find(card => card.id === id)!.entry.kind === 'expense' ? 'รายจ่าย' : 'รายรับ');
    if (body.action === 'writtenMany') return route.fulfill({ json: { writes: body.proposalIds.map((id: string) => {
      const at = written.filter(item => tabOf(item) === tabOf(id)).indexOf(id);
      return { proposalId: id, write: at < 0 ? null : { status: 'written', file: 'บัญชีร้าน', tab: tabOf(id),
        row: 6 + at, canUndo: true, url: `https://docs.google.com/spreadsheets/d/f/edit#gid=0&range=A${6 + at}:C${6 + at}` } };
    }) } });
    return route.fulfill({ json: { preview: null } });
  });
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-12-01T00:00:00.000Z', tokenLimit: 1650, requestLimit: null } });
    const body = request.postDataJSON();
    posts.push(body);
    if (body.action === 'confirm') {
      // One at a time: a second confirmation while one is still saving would have taken the same sheet row.
      if (inFlight > 0) overlapped = true;
      inFlight += 1;
      await new Promise(resolve => setTimeout(resolve, 120));
      inFlight -= 1;
      written.push(body.proposalId);
      return route.fulfill({ json: { status: 'applied', kind: 'add_job', path: '/jobs' } });
    }
    if (body.action === 'message' && /^ข้อ 4/.test(body.text)) return route.fulfill({ json: { text: SUMMARY, route: 'chat', tokens: 0, tokensLeft: 994, trialLeft: null, cards: CARDS } });
    if (body.action === 'message') return route.fulfill({ json: { text: 'อ่านได้ 10 รายการครับ ก่อนเตรียมการ์ดขอถาม 3 ข้อ ตอบแล้วกดส่งได้เลย', route: 'chat', tokens: 0, tokensLeft: 994, trialLeft: null, cards: [QUESTIONS] } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize(size);
  await page.goto('/assistant');
  await expect(page.locator('#asx-message')).toBeVisible();
  await loadLayoutFonts(page);
  return { posts, google, overlapped: () => overlapped };
}

const PASTE = `วันนี้รับเงินค่าตัดต่อคลิปจากลูกค้า 3500 บาท
เมื่อวานจ่ายค่าอาหาร 120 บาท
วันที่ 14 พฤศจิกายน ซื้อกาแฟ 85 บาท`;

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`a paste of many records on the ${device.name}: questions on one card, then the summary, the cards by kind, ยืนยันทั้งหมด and the sheet last`, async ({ page }, info) => {
    const mock = await open(page, device, true);
    await page.locator('#asx-message').fill(PASTE);
    await page.locator('.asx-send').click();
    // The three questions together, one answer each (a typed total, a tap, a tap).
    const card = page.locator('.asx-rcard.is-questions');
    await expect(card).toContainText('ขอข้อมูลเพิ่ม 3 ข้อ');
    await card.getByRole('textbox', { name: 'ข้อ 4 งานตัดต่อ ฿2,000 · มัดจำนี้ของงานมูลค่าเต็มเท่าไร' }).fill('10000');
    await card.getByRole('radio', { name: 'ยังทำอยู่' }).click();
    await card.getByRole('radio', { name: 'อื่นๆ' }).click();
    await expect(card.getByLabel('เลือกวัน')).toBeVisible();
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`batch-questions-${device.name}.png`), fullPage: false });
    await card.getByRole('button', { name: /ส่งคำตอบ/ }).click();
    await expect.poll(() => mock.posts.filter(post => post.action === 'message').length).toBe(2);
    expect(mock.posts.filter(post => post.action === 'message')[1].text).toBe([
      'ข้อ 4 งานตัดต่อ ฿2,000 · มัดจำนี้ของงานมูลค่าเต็มเท่าไร: 10000',
      'ข้อ 9 ตัดต่อ 5 คลิป ฿3,500 · ส่งงานแล้วหรือยัง: ยังทำอยู่',
      'ข้อ 10 ค่าฟิตเนส ฿1,200 · อยู่หมวดไหน: อื่นๆ',
    ].join('\n'));

    // The summary first, then the groups in order, each with its count and total.
    await expect(page.getByText('อ่านครบ 10 จาก 10 รายการครับ')).toBeVisible();
    const groups = page.locator('.asx-entry-group');
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(0).locator('.asx-entry-head')).toHaveText(/รายรับ 3 รายการ\s*รวม ฿10,000/);
    await expect(groups.nth(1).locator('.asx-entry-head')).toHaveText(/รายจ่าย 6 รายการ\s*รวม ฿2,954/);
    await expect(groups.nth(2).locator('.asx-entry-head')).toHaveText(/งานรอรับเงิน 1 รายการ\s*รวม ฿3,500/);
    // Short lines first (owner: "ลูกค้ามาเลื่อนดูสุดท้ายตาลายเอง"): the line's number, name, details and amount.
    await expect(groups.nth(1).locator('.asx-entry-rows li')).toHaveCount(6);
    await expect(groups.nth(0).locator('.asx-entry-rows li').first()).toHaveText(/^1\s*ค่าตัดต่อคลิป\s*ไม่ระบุลูกค้า · จ่ายครบแล้ว 16 พ.ย. 2569\s*฿3,500/);
    await expect(groups.nth(1).locator('.asx-entry-rows li').first()).toContainText('15 พ.ย. 2569');
    await expect(page.locator('.asx-rcard.is-confirm')).toHaveCount(0);
    // ดูและแก้ทีละใบ opens a group's full cards, to check or change one.
    await groups.nth(1).getByRole('button', { name: 'ดูและแก้ทีละใบ' }).click();
    await expect(groups.nth(1).locator('.asx-rcard.is-confirm')).toHaveCount(6);
    await groups.nth(1).getByRole('button', { name: 'ย่อเป็นรายการ' }).click();
    await expect(groups.nth(1).locator('.asx-rcard.is-confirm')).toHaveCount(0);
    // The cards stay cards (no sheet per card); the sheet is one panel, last, closed until asked.
    await expect(page.getByTestId('sheet-view-toggle')).toHaveCount(0);
    const panel = page.getByTestId('sheet-batch');
    const all = page.getByRole('button', { name: 'ยืนยันทั้งหมด 10 รายการ' });
    await expect(all).toBeVisible();
    const order = await page.evaluate(() => {
      const at = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
      return [at('.asx-entry-group.is-income'), at('.asx-entry-group.is-expense'), at('.asx-entry-group.is-job'), at('.asx-confirm-all'), at('[data-testid="sheet-batch"]')];
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mock.google.filter(post => post.action === 'preview' || post.action === 'previewMany')).toEqual([]);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`batch-cards-${device.name}.png`) });

    // The sheet, when asked: the new rows one after another.
    await panel.getByRole('button', { name: 'ดูตัวอย่างในชีต (10 แถว)' }).click();
    const tab = page.getByTestId('sheet-batch-tab');
    await expect(tab).toContainText('เพิ่ม 4 แถว · บัญชีร้าน › รายรับ');
    await expect(tab.locator('tr.is-new th')).toHaveText(['6', '7', '8', '9']);
    await tab.scrollIntoViewIfNeeded();
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`batch-sheet-preview-${device.name}.png`) });

    // ยืนยันรายรับ: that group only, one at a time.
    await groups.nth(0).getByRole('button', { name: 'ยืนยันรายรับ 3 รายการ' }).click();
    await expect(groups.nth(0).locator('.asx-entry-rows li.is-done')).toHaveCount(3);
    await expect(groups.nth(0).locator('.asx-entry-rows li.is-done').first()).toContainText('บันทึกแล้ว');
    expect(mock.posts.filter(post => post.action === 'confirm').map(post => post.proposalId)).toEqual([P(1), P(4), P(7)]);
    // Then the rest with ยืนยันทั้งหมด, still one at a time.
    await page.getByRole('button', { name: 'ยืนยันทั้งหมด 7 รายการ' }).click();
    await expect(page.locator('.asx-entry-rows li.is-done')).toHaveCount(10);
    expect(mock.overlapped()).toBe(false);
    // Where the rows went, and ดูในชีต with them selected.
    const done = page.getByTestId('sheet-batch-done');
    await expect(done).toContainText('ลงชีต บัญชีร้าน › รายรับ แถว 6–9 แล้ว (4 แถว)');
    await expect(done).toContainText('ลงชีต บัญชีร้าน › รายจ่าย แถว 6–11 แล้ว (6 แถว)');
    await expect(done.getByRole('link', { name: 'ดูในชีต' }).first()).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/f/edit#gid=0&range=A6:C9');
    await done.scrollIntoViewIfNeeded();
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`batch-saved-${device.name}.png`) });
  });
}

test('without บันทึกลงชีต there is no sheet panel and Google is never asked', async ({ page }) => {
  const mock = await open(page, { width: 1440, height: 900 }, false);
  await page.locator('#asx-message').fill(PASTE);
  await page.locator('.asx-send').click();
  const card = page.locator('.asx-rcard.is-questions');
  await card.getByRole('radio', { name: 'บันทึกเป็นรายรับอย่างเดียว' }).click();
  await card.getByRole('radio', { name: 'ยังทำอยู่' }).click();
  await card.getByRole('radio', { name: 'อื่นๆ' }).click();
  await card.getByRole('button', { name: /ส่งคำตอบ/ }).click();
  await expect(page.locator('.asx-entry-group')).toHaveCount(3);
  await expect(page.getByTestId('sheet-batch')).toHaveCount(0);
  expect(mock.google).toEqual([]);
});
