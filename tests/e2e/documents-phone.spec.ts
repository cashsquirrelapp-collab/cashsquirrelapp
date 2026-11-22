import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { textOverlapIssues } from './textOverlap';

// เอกสาร on phones (owner, 2026-11-03: "แก้ UI ของตัวฟีเจอร์เอกสารทั้งหมดที่อยู่ในมือถือ มันแอบเหมือนคอม", approved on the
// preview canvas: "โอเค ทำจริงทั้งชุดเลย"). The list with the issuer row and a four-part type switch, the tab bar's middle
// button as ออกเอกสาร, a document on its own page with one bar of actions, the form in three steps, the issuer details in
// เอกสาร, and คลังเอกสาร / ติดตามใบ 50 ทวิ in the same set. Computers and iPads keep their page.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const issuer = { name: 'สตูดิโอกระรอก', address: '99 ถนนสุขุมวิท กรุงเทพฯ 10110', phone: '089-999-9999', email: 'studio@example.com', taxId: '0105555555555', bankName: 'ธนาคารกสิกรไทย', bankAccount: '123-4-56789-0', bankAccountName: 'สตูดิโอกระรอก' };
const doc = (i: number, type: string, no: string, client: string, price: number, date: string, extra = {}) => ({
  id: `d000000${i}-0000-4000-8000-00000000000${i}`, documentType: type, documentNo: no, createdDate: date, dueDate: '2026-12-01', issuer,
  client: { name: client, address: '1 ถนนพระราม 9 กรุงเทพฯ', phone: '', email: '', taxId: '0105550000000' },
  items: [{ id: 'i1', description: 'ถ่ายรีวิวสินค้า 1 คลิป', quantity: 1, price }, { id: 'i2', description: 'โพสต์ลง Instagram', quantity: 2, price: 1500 }], vatRate: 7, whtRate: 3, ...extra,
});
const invoices = [
  doc(4, 'invoice', 'INV-2026-006', 'บริษัท สยามบิวตี้ จำกัด', 12000, '2026-11-02', { linkedFromId: 'd0000001-0000-4000-8000-000000000001' }),
  doc(1, 'quotation', 'QT-2026-011', 'บริษัท สยามบิวตี้ จำกัด', 12000, '2026-11-01'),
  doc(2, 'quotation', 'QT-2026-010', 'ร้านกาแฟดอยช้าง', 8000, '2026-10-28'),
  doc(3, 'quotation', 'QT-2026-009', 'แบรนด์ Lumi Skin', 25000, '2026-10-20'),
];
const job = (i: number, name: string, client: string, value: number) => ({ id: `job-${i}`, name, value, whtRate: 3, whtAmount: value * 0.03, received: value * 0.97, pending: 0, client, type: 'Sponsored Post', status: 'done', paymentStatus: 'paid', creditTerm: 0, note: '', postDate: '2026-10-10', payDate: `2026-10-${String(10 + i).padStart(2, '0')}`, isPosted: true });
const jobs = [job(1, 'รีวิวเซรั่ม', 'แบรนด์ Lumi Skin', 25000), job(2, 'โพสต์ IG ร้านกาแฟ', 'ร้านกาแฟดอยช้าง', 8000), job(3, 'คลิป TikTok', 'บริษัท สยามบิวตี้ จำกัด', 12000)];
const snapshot = {
  jobs, expenses: [], goals: [], invoices, settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }], job_types: ['Sponsored Post'],
  notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null }, avatar_data_url: null, issuer_profile: issuer,
};
const versions = { cashflow_jobs: Object.fromEntries(jobs.map(j => [j.id, 1])), cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: Object.fromEntries(invoices.map(d => [d.id, 1])), cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1, issuer_profile: 1 } };
const files = [
  { id: 'f0000000-0000-4000-8000-000000000001', kind: 'wht50', jobId: 'job-1', jobName: 'รีวิวเซรั่ม', client: 'แบรนด์ Lumi Skin', fileName: '50ทวิ_LumiSkin.pdf', mimeType: 'application/pdf', sizeBytes: 84_000, createdAt: '2026-10-20T00:00:00Z' },
  { id: 'f0000000-0000-4000-8000-000000000004', kind: 'contract', jobId: null, jobName: null, client: 'บริษัท สยามบิวตี้ จำกัด', fileName: 'สัญญาจ้าง_สยามบิวตี้.pdf', mimeType: 'application/pdf', sizeBytes: 230_000, createdAt: '2026-10-04T00:00:00Z' },
];

type Change = { table: string; id: string; op: string; data?: Record<string, unknown> };
async function open(page: Page, path: string, { width = 390, height = 844, dark = false } = {}) {
  const saved: Change[] = [];
  await page.addInitScript(isDark => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', String(isDark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, dark);
  await page.route('**/*', route => { const url = new URL(route.request().url()); return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort(); });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files } }));
  await page.route('**/api/broadcast*', route => route.fulfill({ json: { broadcast: null } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { saved.push(...((route.request().postDataJSON() as { changes: Change[] }).changes || [])); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.setViewportSize({ width, height });
  await page.goto(noRadar(path));
  return saved;
}
const shot = async (page: Page, name: string) => { if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }); } };
const dialog = (page: Page) => page.locator('.ksm-modal');
const screen = (page: Page) => page.locator('.dp').getAttribute('data-screen');
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of [390, 320]) {
  test(`${width}px phone: the list has the issuer row, a four-part type switch and documents by month; the middle button is ออกเอกสาร`, async ({ page }) => {
    await open(page, '/invoice?type=quotation', { width });
    await expect(page.getByRole('heading', { name: 'เอกสาร', level: 2 })).toBeVisible();
    await expect(page.getByTestId('issuer-row')).toContainText('ข้อมูลผู้ออกเอกสาร');
    await expect(page.getByTestId('issuer-row')).toContainText('สตูดิโอกระรอก');
    const tabs = page.getByRole('tablist', { name: 'ประเภทเอกสาร' }).getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    // Four equal parts on one row, inside the screen.
    const boxes = await tabs.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(box => ({ top: Math.round(box.top), right: box.right })));
    expect(new Set(boxes.map(box => box.top)).size).toBe(1);
    expect(Math.max(...boxes.map(box => box.right))).toBeLessThanOrEqual(width);
    await expect(page.locator('.dp-group-head')).toHaveText([/พฤศจิกายน 2569/, /ตุลาคม 2569/]);
    await expect(page.locator('.dp-docrow')).toHaveCount(3);
    await expect(page.locator('.dp-docrow').first()).toContainText('ออกใบแจ้งหนี้ต่อแล้ว');
    // No big orange button at the top any more: the tab bar's middle button issues documents here.
    const middle = page.locator('.ksm-nav-add');
    await expect(middle).toHaveAttribute('aria-label', 'ออกเอกสาร');
    await expect(middle).toHaveAttribute('data-add', 'document');
    expect(await noSideScroll(page)).toBe(true);
    await page.waitForTimeout(400);
    expect(await textOverlapIssues(page)).toEqual([]);
    await shot(page, `docs-list-${width}`);
    await middle.click();
    const sheet = page.getByRole('dialog', { name: 'ออกเอกสารใหม่' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveText([/ใบเสนอราคา/, /ใบแจ้งหนี้/, /ใบเสร็จรับเงิน/, /ใบกำกับภาษี/]);
    await expect(sheet.getByRole('button', { name: /จากงานที่บันทึกไว้/ })).toBeVisible();
    await shot(page, `docs-sheet-${width}`);
    await sheet.getByRole('button', { name: 'ปิดหน้าต่าง' }).click();
    // Elsewhere the middle button adds a job again.
    await page.locator('.ksm-nav').getByRole('button', { name: 'ภาพรวม' }).click();
    await expect(page.locator('.ksm-nav-add')).toHaveAttribute('aria-label', 'เพิ่มงาน');
  });
}

test('phones: a document opens on its own page, full screen on a tap, and the phone\'s back closes it', async ({ page }) => {
  await open(page, '/invoice?type=quotation');
  await page.getByRole('button', { name: /เปิด QT-2026-011/ }).click();
  expect(await screen(page)).toBe('document');
  await expect(page.getByRole('heading', { name: 'QT-2026-011', level: 2 })).toBeVisible();
  await expect(page.locator('.dp-summary')).toContainText('฿15,600');
  await expect(page.locator('.dp-summary')).toContainText('หัก ณ ที่จ่าย 3%');
  await expect(page.getByRole('region', { name: 'เอกสารที่ลิงก์กัน' }).or(page.locator('section[aria-label="เอกสารที่ลิงก์กัน"]'))).toContainText('INV-2026-006');
  // The tab bar and the corner squirrel step aside; one bar of actions instead.
  await expect(page.locator('.ksm-nav')).toBeHidden();
  const bar = page.locator('.dp-bar');
  await expect(bar.getByRole('button')).toHaveText(['แก้ไข', 'PDF', 'ออกต่อ', 'แชร์ให้ลูกค้า']);
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(844 + 1);
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-document');
  await page.getByTestId('document-view').click();
  await expect(page.getByTestId('document-fullscreen')).toBeVisible();
  await page.getByRole('button', { name: 'ขยายเอกสาร' }).click();
  await expect(page.getByRole('button', { name: 'ย่อให้พอดีจอ' })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดเต็มจอ' }).click();
  await expect(page.getByTestId('document-fullscreen')).toHaveCount(0);
  // The linked invoice opens in place; the phone's back gesture goes to the list.
  await page.locator('section[aria-label="เอกสารที่ลิงก์กัน"]').getByRole('button', { name: /INV-2026-006/ }).click();
  await expect(page.getByRole('heading', { name: 'INV-2026-006', level: 2 })).toBeVisible();
  await page.goBack();
  await expect.poll(() => screen(page)).toBe('list');
  await expect(page.locator('.ksm-nav')).toBeVisible();
});

test('phones: a new quotation in three steps, saved, then on its own page ready to share', async ({ page }) => {
  test.setTimeout(60_000);
  const saved = await open(page, '/invoice?type=quotation');
  await page.locator('.ksm-nav-add').click();
  await page.getByRole('dialog', { name: 'ออกเอกสารใหม่' }).getByRole('listitem').filter({ hasText: 'ใบเสนอราคา' }).click();
  expect(await screen(page)).toBe('form');
  await expect(page.getByRole('heading', { name: 'ใบเสนอราคาใหม่', level: 2 })).toBeVisible();
  await expect(page.getByText('ขั้นที่ 1 จาก 3 · ลูกค้า')).toBeVisible();
  // Step 1 asks for the customer first.
  await page.getByRole('button', { name: /ถัดไป: รายการ/ }).click();
  await expect(page.getByRole('alert')).toHaveText('กรุณาระบุชื่อลูกค้าก่อนไปขั้นถัดไป');
  await page.getByRole('radio', { name: /ร้านกาแฟดอยช้าง/ }).click();
  await expect(page.locator('#dp-client-name')).toHaveValue('ร้านกาแฟดอยช้าง');
  await expect(page.locator('#dp-client-tax')).toHaveValue('0105550000000');
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-form-1');
  await page.getByRole('button', { name: /ถัดไป: รายการ/ }).click();
  // Step 2: the items, VAT and withholding; the total follows.
  await expect(page.getByText('ขั้นที่ 2 จาก 3 · รายการและภาษี')).toBeVisible();
  await page.getByLabel('รายการที่ 1', { exact: true }).fill('ถ่ายรีวิวเมนูใหม่');
  await page.getByLabel('ราคาต่อหน่วยของรายการที่ 1').fill('10000');
  await page.getByRole('button', { name: 'เพิ่มจำนวน' }).click();
  await page.getByRole('radio', { name: '7%' }).click();
  await page.getByRole('radiogroup', { name: 'หัก ณ ที่จ่าย' }).getByRole('radio', { name: '3%' }).click();
  await expect(page.locator('.dp-bar-total b')).toHaveText('฿20,800'); // 20,000 + 1,400 − 600
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-form-2');
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  // Step 3: check, then save.
  await expect(page.getByText('ขั้นที่ 3 จาก 3 · ตรวจแล้วบันทึก')).toBeVisible();
  await expect(page.locator('#dp-doc-type')).toHaveValue('quotation');
  await expect(page.getByRole('button', { name: /ผู้ออกเอกสาร/ })).toContainText('สตูดิโอกระรอก');
  // A trip to ข้อมูลผู้ออกเอกสาร (the default details) and back keeps the step and what was filled in.
  await page.getByRole('button', { name: /ผู้ออกเอกสาร/ }).click();
  const issuerSheet = page.getByRole('dialog', { name: 'ผู้ออกเอกสาร' });
  await expect(issuerSheet).toContainText('ใบนี้ใช้ข้อมูลตั้งต้น: สตูดิโอกระรอก');
  await issuerSheet.getByRole('button', { name: /แก้ข้อมูลตั้งต้น/ }).click();
  await expect(page.getByRole('heading', { name: 'ข้อมูลผู้ออกเอกสาร', level: 2 })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('ขั้นที่ 3 จาก 3 · ตรวจแล้วบันทึก')).toBeVisible();
  // Someone else issues this one (owner, 2026-11-22): typed for this document alone.
  await page.getByRole('button', { name: /ผู้ออกเอกสาร/ }).click();
  await issuerSheet.getByRole('button', { name: 'แก้ไขสำหรับใบนี้' }).click();
  await expect(issuerSheet.locator('#dp-doc-issuer-name')).toHaveValue('สตูดิโอกระรอก');
  await issuerSheet.locator('#dp-doc-issuer-name').fill('คุณสมชาย ใจดี');
  await issuerSheet.locator('#dp-doc-issuer-tax').fill('3100500000001');
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-issuer-this-doc');
  await issuerSheet.getByRole('button', { name: 'เสร็จ' }).click();
  await expect(page.getByRole('button', { name: /ผู้ออกเอกสาร/ })).toContainText('คุณสมชาย ใจดี · เฉพาะใบนี้');
  await expect(page.getByText('ขั้นที่ 3 จาก 3 · ตรวจแล้วบันทึก')).toBeVisible();
  await expect(page.locator('.dp-review')).toContainText('฿20,800');
  await page.getByRole('button', { name: /ดูหน้า A4 ก่อนบันทึก/ }).click();
  await expect(page.getByTestId('document-fullscreen')).toBeVisible();
  await page.getByRole('button', { name: 'กลับไปแก้ไข' }).click();
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-form-3');
  await page.getByRole('button', { name: 'บันทึกใบเสนอราคา' }).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button').last().click();
  await expect.poll(() => saved.some(change => change.table === 'cashflow_invoices' && (change.data?.client as { name?: string } | undefined)?.name === 'ร้านกาแฟดอยช้าง')).toBe(true);
  const created = saved.find(change => change.table === 'cashflow_invoices' && (change.data?.client as { name?: string } | undefined)?.name === 'ร้านกาแฟดอยช้าง')!;
  expect(created.data).toMatchObject({ documentType: 'quotation', vatRate: 7, whtRate: 3, items: [expect.objectContaining({ description: 'ถ่ายรีวิวเมนูใหม่', quantity: 2, price: 10000 })] });
  expect(created.data).toMatchObject({ issuerCustom: true, issuer: { name: 'คุณสมชาย ใจดี', taxId: '3100500000001' } });
  expect((created.data?.issuer as { signatureUrl?: string }).signatureUrl).toBeUndefined();
  // The saved quotation opens on its own page; back lands on the list with it.
  expect(await screen(page)).toBe('document');
  await expect(page.locator('.dp-summary')).toContainText('฿20,800');
  await page.goBack();
  await expect.poll(() => screen(page)).toBe('list');
  await expect(page.locator('.dp-docrow')).toHaveCount(4);
});

test('phones: issue an invoice from a quotation, linked to it', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation');
  await page.getByRole('button', { name: /เปิด QT-2026-010/ }).click();
  await page.locator('.dp-bar').getByRole('button', { name: 'ออกต่อ' }).click();
  await page.getByRole('dialog', { name: 'ออกต่อจาก QT-2026-010' }).getByRole('button', { name: 'ออกต่อเป็นใบแจ้งหนี้' }).click();
  await expect(page.getByRole('heading', { name: 'ใบแจ้งหนี้ใหม่', level: 2 })).toBeVisible();
  await expect(page.locator('.dp-linkbox')).toContainText('QT-2026-010');
  await expect(page.locator('#dp-client-name')).toHaveValue('ร้านกาแฟดอยช้าง');
  await page.getByRole('button', { name: /ถัดไป: รายการ/ }).click();
  await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึกใบแจ้งหนี้' }).click();
  await dialog(page).getByRole('button').last().click();
  await expect.poll(() => saved.find(change => change.table === 'cashflow_invoices' && change.data?.documentType === 'invoice')?.data?.linkedFromId).toBe('d0000002-0000-4000-8000-000000000002');
  // The new invoice opens on its own page, linked back to the quotation; back goes to the list.
  expect(await screen(page)).toBe('document');
  await expect(page.getByRole('heading', { name: /INV-/, level: 2 })).toBeVisible();
  await expect(page.locator('section[aria-label="เอกสารที่ลิงก์กัน"]')).toContainText('QT-2026-010');
  await page.goBack();
  await expect.poll(() => screen(page)).toBe('list');
});

test('phones: ⋯ on a document duplicates or deletes it', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation');
  await page.getByRole('button', { name: /เปิด QT-2026-009/ }).click();
  await page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติมของ QT-2026-009' }).click();
  await page.getByRole('dialog', { name: 'QT-2026-009' }).getByRole('button', { name: /ลบเอกสาร/ }).click();
  await expect(dialog(page)).toContainText('ยืนยันการลบบิล');
  await dialog(page).getByRole('button').last().click();
  await expect.poll(() => screen(page)).toBe('list');
  await expect(page.locator('.dp-docrow')).toHaveCount(2);
  await expect.poll(() => saved.some(change => change.table === 'cashflow_invoices' && change.op === 'delete' && change.id === 'd0000003-0000-4000-8000-000000000003')).toBe(true);
});

test('phones: ข้อมูลผู้ออกเอกสาร is edited inside เอกสาร and saved as the business profile', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation');
  await page.getByTestId('issuer-row').click();
  expect(await screen(page)).toBe('issuer');
  await expect(page.getByRole('heading', { name: 'ข้อมูลผู้ออกเอกสาร', level: 2 })).toBeVisible();
  await expect(page.locator('.ksm-nav')).toBeHidden();
  await expect(page.locator('#dp-biz-name')).toHaveValue('สตูดิโอกระรอก');
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-issuer');
  await page.locator('#dp-biz-name').fill('สตูดิโอกระรอกน้อย');
  await page.locator('#dp-biz-account').fill('987-6-54321-0');
  // The bank opens as a sheet with the whole list to scroll (it was cut off by its card, 2026-11-03).
  await page.getByRole('button', { name: /^ธนาคาร:/ }).click();
  const banks = page.getByRole('dialog', { name: 'เลือกธนาคาร' });
  await expect(banks.getByRole('option')).not.toHaveCount(0);
  expect(await banks.getByRole('option').count()).toBeGreaterThan(8);
  await shot(page, 'docs-banks');
  await expect(banks.getByRole('option', { name: /ธนาคารกสิกรไทย/ })).toHaveAttribute('aria-selected', 'true');
  await banks.getByPlaceholder('ค้นหาธนาคาร').fill('กรุงเทพ');
  await banks.getByRole('option', { name: /ธนาคารกรุงเทพ/ }).click();
  await expect(banks).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^ธนาคาร:/ })).toContainText('ธนาคารกรุงเทพ');
  await page.getByRole('button', { name: /โลโก้ธุรกิจ/ }).click();
  await expect(page.getByRole('dialog', { name: 'โลโก้ธุรกิจ' })).toContainText('อัปโหลดโลโก้');
  await page.getByRole('dialog', { name: 'โลโก้ธุรกิจ' }).getByRole('button', { name: 'เสร็จ' }).click();
  // The colour is picked above a document's picture now, not here (owner, 2026-11-22).
  await expect(page.getByRole('button', { name: /สีเอกสาร/ })).toHaveCount(0);
  await page.locator('.dp-bar').getByRole('button', { name: 'บันทึก' }).click();
  await expect(dialog(page)).toContainText('บันทึกโปรไฟล์ธุรกิจแล้ว');
  await dialog(page).getByRole('button').last().click();
  await expect.poll(() => saved.find(change => change.table === 'cashflow_documents' && change.id === 'issuer_profile')?.data).toMatchObject({ name: 'สตูดิโอกระรอกน้อย', bankName: 'ธนาคารกรุงเทพ', bankAccount: '987-6-54321-0', taxId: '0105555555555' });
  await expect.poll(() => screen(page)).toBe('list');
  await expect(page.getByTestId('issuer-row')).toContainText('สตูดิโอกระรอกน้อย');
});

test('phones: คลังเอกสาร has one add button, four kind tiles that filter, and the year and ZIP behind ⋯', async ({ page }) => {
  await open(page, '/vault');
  await expect(page.getByRole('heading', { name: 'คลังเอกสาร', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เพิ่มไฟล์' })).toBeVisible();
  const tiles = page.getByRole('group', { name: 'ประเภทไฟล์ที่จัดเก็บ' }).getByRole('button');
  await expect(tiles).toHaveCount(4);
  await expect(page.locator('.dp-filerow')).toHaveCount(2);
  await tiles.filter({ hasText: 'สัญญา / PO' }).click();
  await expect(tiles.filter({ hasText: 'สัญญา / PO' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.dp-filerow')).toHaveCount(1);
  await expect(page.locator('.dp-filerow')).toContainText('สัญญาจ้าง_สยามบิวตี้.pdf');
  expect(await noSideScroll(page)).toBe(true);
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-vault');
  await page.getByRole('button', { name: 'เครื่องมือคลังเอกสาร' }).click();
  const tools = page.getByRole('dialog', { name: 'เครื่องมือคลังเอกสาร' });
  await expect(tools.getByRole('radio', { name: 'ทุกปีที่อัปโหลด' })).toHaveAttribute('aria-checked', 'true');
  await expect(tools.getByRole('button', { name: /ดาวน์โหลดไฟล์ที่แสดง \(1\)/ })).toBeVisible();
  await tools.getByRole('button', { name: /ติดตามใบ 50 ทวิ/ }).click();
  await expect(page).toHaveURL(/\/wht50/);
});

test('phones: ติดตามใบ 50 ทวิ shows one summary with a bar, a three-part switch and an attach button per job', async ({ page }) => {
  await open(page, '/wht50');
  await expect(page.getByRole('heading', { name: 'ติดตามใบ 50 ทวิ', level: 2 })).toBeVisible();
  await expect(page.getByTestId('wht-total')).toHaveText('฿1,350');
  await expect(page.getByTestId('wht-have')).toHaveText('฿750');
  await expect(page.getByTestId('wht-waiting')).toHaveText('฿600');
  await expect(page.locator('.dp-whtbar > span')).toHaveCount(2);
  await expect(page.getByRole('tablist', { name: 'สถานะใบ 50 ทวิ' }).getByRole('tab')).toHaveText([/ยังรอ\s*2/, /ได้รับแล้ว\s*1/, /ทั้งหมด\s*3/]);
  await expect(page.locator('.dp-whtrow')).toHaveCount(2);
  await expect(page.locator('.dp-whtrow').first().getByRole('button', { name: /แนบใบ 50 ทวิ/ })).toBeVisible();
  await page.getByRole('button', { name: 'ภาษีที่ถูกหักใช้ทำอะไร' }).click();
  await expect(page.getByRole('dialog', { name: 'ภาษีที่ถูกหักใช้ทำอะไร' })).toContainText('ใบ 50 ทวิ');
  await page.getByRole('dialog', { name: 'ภาษีที่ถูกหักใช้ทำอะไร' }).getByRole('button', { name: 'ปิดหน้าต่าง' }).click();
  expect(await noSideScroll(page)).toBe(true);
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-wht50');
});

test('phones in dark mode: the document page reads', async ({ page }) => {
  await open(page, '/invoice?type=quotation', { dark: true });
  await page.getByRole('button', { name: /เปิด QT-2026-011/ }).click();
  await expect(page.locator('.dp-summary')).toContainText('฿15,600');
  await page.waitForTimeout(400);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'docs-document-dark');
});

test('computers: the documents page keeps its layout and edits ข้อมูลผู้ออกเอกสาร in a dialog on the page', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation', { width: 1280, height: 820 });
  await expect(page.locator('.dp')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'เอกสาร', level: 1 })).toBeVisible();
  // Edited on the documents page itself (owner, 2026-11-22): a dialog, and saving stays on เอกสาร.
  await page.getByTestId('issuer-button').click();
  const dialog = page.getByTestId('issuer-dialog');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/invoice/);
  await expect(dialog.locator('#issuer-dialog-name')).toHaveValue('สตูดิโอกระรอก');
  await dialog.locator('#issuer-dialog-name').fill('สตูดิโอกระรอกน้อย');
  // The header preview follows: the name, then a logo placed on the right.
  const preview = dialog.getByTestId('issuer-dialog-preview');
  await expect(preview).toContainText('สตูดิโอกระรอกน้อย');
  await dialog.locator('input[type="file"]').first().setInputFiles('tests/e2e/fixtures/logo-two-colors.png');
  await expect(preview.locator('img.da4-logo')).toBeVisible();
  await dialog.getByRole('group', { name: 'ตำแหน่งโลโก้' }).getByRole('button', { name: 'ขวา' }).click();
  await expect(preview.locator('.da4-top')).toHaveClass(/pos-right/);
  await page.waitForTimeout(400);
  const dialogText = await dialog.innerText();
  const previewText = await preview.innerText();
  expect((await textOverlapIssues(page)).filter(issue => dialogText.includes(issue.a ?? '') && dialogText.includes(issue.b ?? '')
    && !previewText.includes(issue.a ?? '') && !previewText.includes(issue.b ?? ''))).toEqual([]);
  await shot(page, 'docs-issuer-dialog-computer');
  // The bank list with logos, as in Settings; no colour picker here (the row above the preview does that).
  await expect(dialog.getByRole('radiogroup', { name: 'สีเอกสาร' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'ธนาคาร', exact: true }).click();
  await page.waitForTimeout(500);
  await expect(dialog.getByRole('option', { name: /ธนาคารกสิกรไทย/ })).toBeInViewport();
  await shot(page, 'docs-issuer-dialog-banks');
  await dialog.getByRole('option', { name: /ธนาคารกรุงเทพ/ }).click();
  await expect(dialog.getByRole('button', { name: 'ธนาคาร', exact: true })).toContainText('ธนาคารกรุงเทพ');
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/invoice/);
  await expect.poll(() => saved.find(change => change.table === 'cashflow_documents' && change.id === 'issuer_profile')?.data).toMatchObject({ name: 'สตูดิโอกระรอกน้อย', bankName: 'ธนาคารกรุงเทพ' });
});

test('computers: the colour row above the preview recolours the document and saves the profile', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation', { width: 1440, height: 900 });
  await page.locator('[data-testid="document-view"]').first().waitFor();
  const row = page.getByTestId('document-view').getByRole('radiogroup', { name: 'สีเอกสาร' });
  await expect(row.getByRole('radio', { name: 'ส้ม' })).toHaveAttribute('aria-checked', 'true');
  await row.getByRole('radio', { name: 'น้ำเงิน' }).click();
  await expect(page.getByTestId('document-view').locator('.da4-titlebox h1').first()).toHaveCSS('color', 'rgb(31, 63, 115)');
  await expect.poll(() => saved.find(change => change.table === 'cashflow_documents' && change.id === 'issuer_profile')?.data).toMatchObject({ docColor: 'navy' });
  await page.waitForTimeout(400);
  // Only the new row is checked: the scaled A4 preview's own small labels sit close by design.
  const rowText = await row.innerText();
  expect((await textOverlapIssues(page)).filter(issue => rowText.includes(issue.a ?? '') || rowText.includes(issue.b ?? ''))).toEqual([]);
  await shot(page, 'docs-color-row-computer');
});

test('computers: แก้ไขสำหรับใบนี้ types another issuer for one document; the business profile stays', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation', { width: 1280, height: 820 });
  await page.getByRole('button', { name: 'ออกเอกสารใหม่' }).first().click();
  await page.getByRole('menuitem', { name: 'ใบเสนอราคา' }).click();
  const section = page.getByTestId('doc-issuer');
  await expect(section).toContainText('สตูดิโอกระรอก · ใช้ข้อมูลตั้งต้นจากโปรไฟล์ธุรกิจ');
  await section.getByRole('button', { name: 'แก้ไขสำหรับใบนี้' }).click();
  await page.locator('#doc-issuer-name').fill('คุณสมชาย ใจดี');
  await page.locator('#doc-issuer-account').fill('111-2-33333-4');
  await page.locator('#client-name').fill('ร้านกาแฟดอยช้าง');
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // Only the new section is checked: the long form scrolls under its sticky save bar, and the scaled A4 preview is tiny.
  const sectionText = await section.innerText();
  expect((await textOverlapIssues(page)).filter(issue => sectionText.includes(issue.a ?? '') && sectionText.includes(issue.b ?? ''))).toEqual([]);
  await shot(page, 'docs-issuer-this-doc-computer');
  await page.getByRole('button', { name: /บันทึกและสร้างเอกสาร/ }).click();
  await expect.poll(() => saved.some(change => change.table === 'cashflow_invoices' && (change.data?.client as { name?: string } | undefined)?.name === 'ร้านกาแฟดอยช้าง')).toBe(true);
  const created = saved.find(change => change.table === 'cashflow_invoices' && (change.data?.client as { name?: string } | undefined)?.name === 'ร้านกาแฟดอยช้าง')!;
  expect(created.data).toMatchObject({ issuerCustom: true, issuer: { name: 'คุณสมชาย ใจดี', bankAccount: '111-2-33333-4' } });
  expect(saved.some(change => change.table === 'cashflow_documents' && change.id === 'issuer_profile')).toBe(false);
});

// The 12-second refresh (owner, 2026-11-22: "แก้ไขในตั้งค่า ... บันทึกไม่สำเร็จ"): the light read has no documents and no
// issuer profile, and it used to wipe what the next save compares against, so every save sent them as new. Here the
// mock answers like the real server, the refresh runs, and the saves after it still carry each record's version.
test('phones: after the live refresh, deleting a document and saving the business profile send their versions', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-21T10:00:00+07:00') });
  await page.addInitScript(() => localStorage.setItem('krarok.liveRefresh', 'on'));
  await open(page, '/invoice?type=quotation');
  const sent: { table: string; id: string; op: string; version: number | null }[] = [];
  let lightReads = 0;
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { sent.push(...((route.request().postDataJSON() as { changes: typeof sent }).changes || [])); return route.fulfill({ json: { ok: true, versions } }); }
    if (!route.request().url().includes('includeInvoices=0')) return route.fallback();
    lightReads += 1;
    const { invoices: _invoices, issuer_profile: _issuer, ...light } = snapshot as Record<string, unknown>;
    const { cashflow_invoices: _versions, ...lightVersions } = versions as Record<string, any>;
    const { issuer_profile: _issuerVersion, ...documents } = lightVersions.cashflow_documents;
    return route.fulfill({ json: { snapshot: light, versions: { ...lightVersions, cashflow_documents: documents }, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await expect(page.locator('.dp-docrow')).toHaveCount(3);
  await page.clock.runFor(40_000);
  await expect.poll(() => lightReads).toBeGreaterThan(0);
  // A document: deleted with its version, and no other document is sent as new.
  await page.getByRole('button', { name: /เปิด QT-2026-009/ }).click();
  await page.getByRole('button', { name: 'ตัวเลือกเพิ่มเติมของ QT-2026-009' }).click();
  await page.getByRole('dialog', { name: 'QT-2026-009' }).getByRole('button', { name: /ลบเอกสาร/ }).click();
  await dialog(page).getByRole('button').last().click();
  await expect.poll(() => sent.find(change => change.op === 'delete' && change.id === 'd0000003-0000-4000-8000-000000000003')?.version).toBe(1);
  expect(sent.filter(change => change.table === 'cashflow_invoices' && change.op === 'set')).toEqual([]);
  // The business profile: saved over version 1, not as a new record.
  await expect.poll(() => screen(page)).toBe('list');
  await page.getByTestId('issuer-row').click();
  await page.locator('#dp-biz-name').fill('สตูดิโอกระรอกน้อย');
  await page.locator('.dp-bar').getByRole('button', { name: 'บันทึก' }).click();
  await expect.poll(() => sent.find(change => change.id === 'issuer_profile')?.version).toBe(1);
});

// Up and down only (owner, 2026-11-22): the job sheet's form never scrolls sideways, even with a row wider than it.
test('phones: the add-job sheet scrolls up and down only', async ({ page }) => {
  await open(page, '/');
  await page.locator('.ksm-nav-add').click();
  await page.locator('.ksm-jobmore summary').click();
  const form = page.locator('.ksm-jobform-scroll');
  await expect(form).toHaveCSS('overflow-x', 'hidden');
  // A row made too wide on purpose, as a wider font on an iPhone can make one: the form still cannot be moved sideways.
  await form.evaluate(node => { const wide = document.createElement('div'); wide.style.width = '700px'; wide.style.height = '4px'; node.append(wide); node.scrollLeft = 200; });
  expect(await form.evaluate(node => node.scrollLeft)).toBe(0);
  expect(await noSideScroll(page)).toBe(true);
});

// Owner, 2026-11-22: pushing the job form further up opens สถานะและรายละเอียดเพิ่มเติม without a tap; a tap still works.
test('phones: scrolling the add-job form up opens its status and details by itself', async ({ page }) => {
  await open(page, '/');
  await page.locator('.ksm-nav-add').click();
  const more = page.locator('.ksm-jobmore');
  await expect(more).not.toHaveAttribute('open', '');
  const form = page.locator('.ksm-jobform-scroll');
  const box = (await form.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect(more).toHaveAttribute('open', '');
  await expect(page.getByRole('tablist', { name: 'หมวดรายละเอียดของงาน' })).toBeInViewport();
  await page.waitForTimeout(500);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'job-form-scroll-opens-details');
  // Closing it by a tap keeps it closed until the form is pushed up again.
  await page.locator('.ksm-jobmore summary').click();
  await expect(more).not.toHaveAttribute('open', '');
});

// Owner, 2026-11-22 ("ทำในมือถือด้วย"): the colours above a document's picture on phones recolour it and save the profile.
test('phones: the colour row above the document picture recolours it and saves the profile', async ({ page }) => {
  const saved = await open(page, '/invoice?type=quotation');
  await page.getByRole('button', { name: /เปิด QT-2026-009/ }).click();
  const row = page.locator('.dp-colorrow').getByRole('radiogroup', { name: 'สีเอกสาร' });
  await expect(row.getByRole('radio', { name: 'ส้ม' })).toHaveAttribute('aria-checked', 'true');
  const size = await row.getByRole('radio', { name: 'เขียว', exact: true }).boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(30);
  await row.getByRole('radio', { name: 'เขียว', exact: true }).click();
  await expect(page.getByTestId('document-view').locator('.da4-titlebox h1').first()).toHaveCSS('color', 'rgb(47, 107, 59)');
  await expect.poll(() => saved.find(change => change.table === 'cashflow_documents' && change.id === 'issuer_profile')?.data).toMatchObject({ docColor: 'green' });
  expect(await noSideScroll(page)).toBe(true);
  await page.waitForTimeout(400);
  const rowText = await row.innerText();
  expect((await textOverlapIssues(page)).filter(issue => rowText.includes(issue.a ?? '') || rowText.includes(issue.b ?? ''))).toEqual([]);
  await shot(page, 'docs-color-row-phone');
});

// ลิงก์ให้ลูกค้ายืนยันใบเสนอราคา (owner, 2026-11-22). The owner makes the link on a quotation; the client opens it,
// types a name, signs, ticks and confirms; the quotation then shows who confirmed, and the signature sits on the paper.
for (const device of [{ name: 'computer', width: 1440, height: 900, path: '/invoice?type=quotation', open: async (_page: Page) => {} },
  { name: 'phone', width: 390, height: 844, path: '/invoice?type=quotation', open: async (page: Page) => { await page.getByRole('button', { name: /เปิด QT-2026-011/ }).click(); } }]) {
  test(`${device.name}: แชร์ให้ลูกค้า on a quotation offers the confirmation link and copies it and notes that it was sent`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const saved = await open(page, device.path, { width: device.width, height: device.height });
    await device.open(page);
    await expect(page.getByTestId('quote-approval-status')).toHaveCount(0);
    // Inside แชร์ให้ลูกค้า, first among the ways to share (owner, 2026-11-22).
    await page.getByRole('button', { name: 'แชร์ให้ลูกค้า' }).first().click();
    await shot(page, `quote-share-menu-${device.name}`);
    await page.getByRole(device.name === 'phone' ? 'button' : 'menuitem', { name: /ลิงก์ให้ลูกค้าเซ็นยืนยัน/ }).click();
    await expect(dialog(page)).toContainText('คัดลอกลิงก์แล้ว');
    // A short link (owner, 2026-11-22): krarok.com/q/ and twelve letters and digits, the code kept on the quotation.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/q\/[A-Za-z0-9]{12}$/);
    const change = saved.find(item => item.table === 'cashflow_invoices' && item.id === 'd0000001-0000-4000-8000-000000000001' && typeof item.data?.approvalRequestedAt === 'string');
    expect(change).toBeTruthy();
    expect((change!.data as { approvalLink?: { code?: string } }).approvalLink?.code).toBe(copied.split('/q/')[1]);
    await dialog(page).getByRole('button').last().click();
    await expect(page.getByTestId('quote-approval-status').first()).toContainText('รอลูกค้ายืนยัน');
    await page.waitForTimeout(400);
    await shot(page, `quote-link-${device.name}`);
  });
}

for (const device of [{ name: 'phone', width: 390, height: 844 }, { name: 'computer', width: 1280, height: 860 }]) {
  test(`the client confirms a quotation from its link (${device.name})`, async ({ page }) => {
    const quotation = invoices[1];
    let accepted: Record<string, unknown> | null = null;
    await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    await page.route('**/api/auth*', route => route.fulfill({ status: 401, json: { error: 'no session' } }));
    await page.route('**/api/quote-approval*', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { invoice: quotation, approval: null } });
      accepted = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, approval: { status: 'accepted', name: 'คุณมานี ใจดี บริษัท ตัวอย่างชื่อยาวมากเป็นพิเศษสำหรับทดสอบการขึ้นบรรทัดใหม่ จำกัด', signatureUrl: (accepted as { signature: string }).signature, at: '2026-11-22T05:30:00.000Z', revision: 'x' } } });
    });
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto('/q/tok_example_000000000000000000000000.sig');
    await expect(page.getByRole('heading', { name: 'QT-2026-011' })).toBeVisible();
    await expect(page.getByText('ใบเสนอราคาจาก สตูดิโอกระรอก')).toBeVisible();
    // Confirming without a name, a signature or the tick says what is missing.
    await page.getByRole('button', { name: 'ยืนยันใบเสนอราคา' }).click();
    await expect(page.getByRole('alert')).toContainText('กรุณาพิมพ์ชื่อผู้อนุมัติ');
    await page.getByLabel('ชื่อผู้อนุมัติ').fill('คุณมานี ใจดี');
    await expect(page.getByRole('alert')).toHaveCount(0);
    const pad = page.getByLabel('ช่องเซ็นชื่อ');
    await pad.scrollIntoViewIfNeeded();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 90); await page.mouse.down();
    for (const [dx, dy] of [[60, -30], [110, 20], [170, -25], [230, 15]]) await page.mouse.move(box.x + dx, box.y + 90 + dy, { steps: 6 });
    await page.mouse.up();
    await page.getByRole('checkbox').check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await shot(page, `quote-client-${device.name}`);
    await page.getByRole('button', { name: 'ยืนยันใบเสนอราคา' }).click();
    await expect(page.getByRole('status')).toContainText('ยืนยันแล้ว');
    await expect(page.getByRole('status')).toContainText('โดย คุณมานี ใจดี');
    // A long name wraps inside its box (2026-11-22: it ran past the edge).
    const fits = await page.getByRole('status').evaluate(node => node.scrollWidth <= node.clientWidth + 1);
    expect(fits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(accepted).toMatchObject({ action: 'accept', token: 'tok_example_000000000000000000000000.sig', name: 'คุณมานี ใจดี', agree: true });
    expect(String((accepted as unknown as { signature: string }).signature)).toMatch(/^data:image\/png;base64,/);
    await expect(page.getByRole('button', { name: 'ยืนยันใบเสนอราคา' })).toHaveCount(0);
    await shot(page, `quote-client-done-${device.name}`);
  });
}

test('the client page says plainly when a link no longer works', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/quote-approval*', route => route.fulfill({ status: 410, json: { error: 'ลิงก์นี้ใช้ไม่ได้แล้ว อาจหมดอายุหรือใบเสนอราคาถูกแก้ไข กรุณาขอลิงก์ใหม่จากผู้ออกเอกสาร' } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/q/old_link_000000000000000000000000.sig');
  await expect(page.getByRole('alert')).toContainText('ลิงก์นี้ใช้ไม่ได้แล้ว');
});

