import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The LINE form for a quotation or invoice draft (owner, 2026-10-30): opened from the draft card, everything on one page,
// what the card already knew filled in, and one button that creates the document. LINE's SDK and the server's answers
// are stood in; the server side is tested in tests/line-document-draft.test.ts.

const drafts: Record<string, Record<string, unknown>> = {
  receipt: { type: 'receipt', client: { name: 'คุณบี' }, items: [{ description: 'ตัดต่อวิดีโอ', quantity: 1, price: 5000 }], vatRate: 0, whtRate: 0, paymentMethod: 'โอนเงิน' },
  tax: { type: 'taxInvoice', client: { name: 'บริษัท เอ จำกัด' }, items: [{ description: 'ออกแบบโลโก้', quantity: 1, price: 10000 }], vatRate: 7, whtRate: 0 },
  full: { type: 'quotation', client: { name: 'บริษัท แบรนด์เอ' }, items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }], vatRate: 0, whtRate: 0, heard: 'ให้ บริษัท แบรนด์เอ ถ่ายรูปสินค้า 20 รูป รูปละ 300' },
  empty: { type: 'invoice', client: {}, items: [], vatRate: 0, whtRate: 0 },
};

// The user's own business as saved (owner, 2026-10-30: name, address, 13-digit tax ID and phone are needed).
const FULL = { name: 'สตูดิโอตัวอย่าง', address: '99 ถนนสุขุมวิท แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110', taxId: '0105561234567', phone: '089-999-9999',
  email: 'hello@example.test', bankName: 'กสิกรไทย', bankAccount: '123-4-56789-0', bankAccountName: 'สตูดิโอตัวอย่าง' };
type Issuer = Partial<typeof FULL>;

async function open(page: Page, scenario: keyof typeof drafts, issuer: Issuer = FULL, size = { width: 390, height: 844 }, query = '') {
  const sent: any[] = [];
  await page.setViewportSize(size);
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",closeWindow(){},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff' } }));
  await page.route('**/api/liff-submit', route => {
    const body = route.request().postDataJSON(); sent.push(body);
    if (body.action === 'load-draft') return route.fulfill({ json: { ok: true, kind: 'document', draft: drafts[scenario], createdAt: new Date().toISOString(),
      issuer: { name: '', address: '', taxId: '', phone: '', email: '', bankName: '', bankAccount: '', bankAccountName: '', ...issuer } } });
    if (body.action === 'document-image') return route.fulfill({ json: { ok: true, imageSent: true } });
    const record = { id: 'd1', assistantDraft: true, documentType: body.document.type, documentNo: 'QT-2569-4F2A91C0', createdDate: '2026-10-30',
      issuer: { name: '', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '', ...issuer, ...body.document.issuer },
      client: { email: '', ...body.document.client }, items: body.document.items.map((item: any, at: number) => ({ id: `i${at}`, ...item })), vatRate: body.document.vatRate, whtRate: body.document.whtRate,
      ...(body.document.paidDate ? { paidDate: body.document.paidDate, paymentMethod: body.document.paymentMethod } : {}) };
    return route.fulfill({ json: { ok: true, documentNo: 'QT-2569-4F2A91C0', notificationSent: true, document: record } });
  });
  await page.goto(`/liff-add.html?draftKind=document&draftKey=0123456789abcdef${query}`);
  if (!query) await expect(page.locator('#document-card')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return sent;
}

test('a filled draft opens with what the card knew, and creating it sends the checked fields', async ({ page }) => {
  const sent = await open(page, 'full');
  await expect(page.locator('#document-title')).toHaveText('ใบเสนอราคา');
  await expect(page.locator('#document-issuer-known')).toContainText('สตูดิโอตัวอย่าง');
  // the saved business in full, as on the document: address, tax ID, phone, email and the account to pay
  for (const text of [FULL.address, 'เลขผู้เสียภาษี 0105561234567 · โทร 089-999-9999', FULL.email, 'รับเงิน กสิกรไทย 123-4-56789-0']) await expect(page.locator('#document-issuer-details')).toContainText(text);
  await expect(page.locator('#document-issuer-fields')).toBeHidden();
  await expect(page.locator('#doc-client-name')).toHaveValue('บริษัท แบรนด์เอ');
  await expect(page.locator('#doc-item-qty-0')).toHaveValue('20');
  await expect(page.locator('#document-summary-amount')).toHaveText('฿6,000.00');
  await expect(page.locator('.kind-tabs')).toBeHidden(); // no job / expense tabs on a document
  await page.getByRole('button', { name: '30 วัน' }).click();
  await page.locator('#doc-vat').selectOption('7');
  await expect(page.locator('#doc-payable')).toHaveText('฿6,420.00');
  await page.getByRole('button', { name: 'สร้างใบเสนอราคา' }).click();
  await expect(page.getByRole('heading', { name: 'สร้างใบเสนอราคาแล้ว' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#status-view')).toContainText('ส่งการ์ดและรูปเอกสารเข้าแชทแล้ว');
  // the page drawn as a picture by the app's own A4 sheet: a real JPEG, under LINE's 1 MB
  const picture = sent.find(body => body.action === 'document-image');
  expect(picture.draftKey).toBe('0123456789abcdef');
  expect(picture.image.startsWith('/9j/')).toBe(true);
  expect(Buffer.from(picture.image, 'base64').length).toBeLessThan(1_000_000);
  const submit = sent.find(body => body.action === 'confirm-draft');
  expect(submit).toMatchObject({ draftKind: 'document', draftKey: '0123456789abcdef', document: { type: 'quotation', vatRate: 7, creditTerm: 30,
    client: { name: 'บริษัท แบรนด์เอ' }, items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }] } });
  expect(submit.document.issuer).toBeUndefined(); // the saved business stays as it is
});

test('an empty draft asks for the business in full, the client and a priced line before it creates anything', async ({ page }) => {
  const sent = await open(page, 'empty', {});
  await expect(page.locator('#document-title')).toHaveText('ใบแจ้งหนี้');
  await expect(page.locator('#document-issuer-fields')).toBeVisible();
  await expect(page.locator('#document-issuer-help')).toContainText('ยังไม่มีข้อมูลธุรกิจของคุณ');
  const create = () => page.getByRole('button', { name: 'สร้างใบแจ้งหนี้' }).click();
  await create();
  await expect(page.locator('#document-error-box')).toContainText('ชื่อธุรกิจ');
  await page.locator('#doc-issuer-name').fill('สตูดิโอใหม่');
  await create();
  await expect(page.locator('#document-error-box')).toContainText('ที่อยู่ของผู้ออกเอกสาร');
  await page.locator('#doc-issuer-address').fill('12 ถนนนิมมานเหมินท์ เชียงใหม่ 50200');
  await page.locator('#doc-issuer-taxId').fill('12345');
  await create();
  await expect(page.locator('#document-error-box')).toContainText('เลขประจำตัวผู้เสียภาษี 13 หลัก');
  await page.locator('#doc-issuer-taxId').fill('1-2345-67890-12-3');
  await create();
  await expect(page.locator('#document-error-box')).toContainText('เบอร์โทรศัพท์');
  await page.locator('#doc-issuer-phone').fill('081 234 5678');
  await create();
  await expect(page.locator('#document-error-box')).toContainText('ชื่อลูกค้า');
  await page.locator('#doc-client-name').fill('ร้านบี');
  await page.getByRole('button', { name: 'สร้างใบแจ้งหนี้' }).click();
  await expect(page.locator('#document-error-box')).toContainText('รายละเอียดรายการ 1');
  await page.locator('#doc-item-desc-0').fill('ออกแบบโลโก้');
  await page.locator('#doc-item-price-0').fill('7500');
  await page.getByRole('button', { name: '+ เพิ่มรายการ' }).click();
  await page.locator('#doc-item-desc-1').fill('แก้ไขเพิ่ม');
  await page.locator('#doc-item-price-1').fill('500');
  await expect(page.locator('#doc-payable')).toHaveText('฿8,000.00');
  expect(sent.filter(body => body.action === 'confirm-draft')).toHaveLength(0);
  await page.getByRole('button', { name: 'สร้างใบแจ้งหนี้' }).click();
  await expect(page.getByRole('heading', { name: 'สร้างใบแจ้งหนี้แล้ว' })).toBeVisible();
  expect(sent.find(body => body.action === 'confirm-draft').document).toMatchObject({ type: 'invoice', items: [{ price: 7500 }, { price: 500 }],
    issuer: { name: 'สตูดิโอใหม่', address: '12 ถนนนิมมานเหมินท์ เชียงใหม่ 50200', taxId: '1-2345-67890-12-3', phone: '081 234 5678', email: '', bankName: '' } });
});

test('a saved business without its address, tax ID or phone opens its fields, filled with what is saved', async ({ page }) => {
  await open(page, 'full', { name: 'สตูดิโอตัวอย่าง', phone: '089-999-9999' }, { width: 390, height: 844 }, '&create=1');
  await expect(page.locator('#document-card')).toBeVisible(); // not created at once: the business is not complete
  await expect(page.locator('#document-issuer-help')).toContainText('ยังไม่ครบ');
  await expect(page.locator('#doc-issuer-name')).toHaveValue('สตูดิโอตัวอย่าง');
  await expect(page.locator('#doc-issuer-phone')).toHaveValue('089-999-9999');
  await expect(page.locator('#document-issuer-known')).toBeHidden();
});

test('แก้ไข opens the saved business to change; the change is sent to be kept for the next document', async ({ page }) => {
  const sent = await open(page, 'full');
  await page.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await expect(page.locator('#document-issuer-fields')).toBeVisible();
  await expect(page.locator('#document-issuer-help')).toContainText('ใช้กับเอกสารใบต่อไป');
  await expect(page.locator('#doc-issuer-taxId')).toHaveValue(FULL.taxId);
  await page.locator('#doc-issuer-phone').fill('02-111-2222');
  await page.getByRole('button', { name: 'สร้างใบเสนอราคา' }).click();
  await expect(page.getByRole('heading', { name: 'สร้างใบเสนอราคาแล้ว' })).toBeVisible({ timeout: 20_000 });
  expect(sent.find(body => body.action === 'confirm-draft').document.issuer).toEqual({ ...FULL, phone: '02-111-2222' });
  expect(sent.find(body => body.action === 'document-image').image.startsWith('/9j/')).toBe(true);
});

for (const [size, issuer] of [[{ width: 390, height: 844 }, FULL], [{ width: 320, height: 568 }, FULL], [{ width: 390, height: 844 }, {}], [{ width: 320, height: 568 }, {}]] as const) {
  test(`at ${size.width}px nothing covers any text in the form (${issuer.name ? 'saved business' : 'business fields'})`, async ({ page }) => {
    await open(page, 'full', issuer, size);
    for (const at of [0, 0.3, 0.6, 1]) {
      await page.evaluate(share => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * share), at);
      expect(await textOverlapIssues(page)).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('สร้างเอกสาร on the card opens straight into creating it, sends the picture, and goes back to the chat', async ({ page }) => {
  const sent = await open(page, 'full', FULL, { width: 390, height: 844 }, '&create=1');
  await expect(page.getByRole('heading', { name: 'สร้างใบเสนอราคาแล้ว' })).toBeVisible({ timeout: 20_000 });
  expect(sent.map(body => body.action)).toEqual(['load-draft', 'confirm-draft', 'document-image']);
  await expect(page.locator('#document-card')).toBeHidden(); // no form to press again
});

test('an incomplete draft opened to create shows its form instead', async ({ page }) => {
  const sent = await open(page, 'empty', FULL, { width: 390, height: 844 }, '&create=1');
  await expect(page.locator('#document-card')).toBeVisible();
  await expect(page.locator('#document-error-box')).toContainText('ชื่อลูกค้า');
  expect(sent.filter(body => body.action === 'confirm-draft')).toHaveLength(0);
});

// Receipts and tax invoices (owner, 2026-10-30: "ใบแจ้งหนี้กับใบเสร็จ ... ต้องเพิ่มการ์ดมา ... ส่งรูปภาพมาเหมือนใบเสนอราคา").
test('a receipt asks when and how the money came in instead of credit days, and its picture goes to the chat', async ({ page }) => {
  const sent = await open(page, 'receipt');
  await expect(page.locator('#document-title')).toHaveText('ใบเสร็จรับเงิน');
  await expect(page.locator('#doc-paid-wrap')).toBeVisible();
  await expect(page.locator('#doc-credit-wrap')).toBeHidden();
  const today = await page.evaluate(() => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
  await expect(page.locator('#doc-paid-date')).toHaveValue(today);
  await expect(page.locator('#doc-paid-method')).toHaveValue('โอนเงิน');
  await expect(page.getByRole('button', { name: 'โอนเงิน', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'เงินสด', exact: true }).click();
  await page.locator('#doc-paid-date').fill('2026-10-29');
  await page.getByRole('button', { name: 'สร้างใบเสร็จรับเงิน' }).click();
  await expect(page.getByRole('heading', { name: 'สร้างใบเสร็จรับเงินแล้ว' })).toBeVisible({ timeout: 20_000 });
  expect(sent.find(body => body.action === 'confirm-draft').document).toMatchObject({ type: 'receipt', paidDate: '2026-10-29', paymentMethod: 'เงินสด', creditTerm: 0 });
  expect(sent.find(body => body.action === 'document-image').image.startsWith('/9j/')).toBe(true);
});

test('a tax invoice keeps VAT at 7% and sends its picture too', async ({ page }) => {
  const sent = await open(page, 'tax', FULL, { width: 390, height: 844 }, '&create=1');
  await expect(page.getByRole('heading', { name: 'สร้างใบกำกับภาษีแล้ว' })).toBeVisible({ timeout: 20_000 });
  expect(sent.find(body => body.action === 'confirm-draft').document).toMatchObject({ type: 'taxInvoice', vatRate: 7 });
  expect(sent.find(body => body.action === 'document-image').image.startsWith('/9j/')).toBe(true);
});

test('on a tax invoice the VAT choice is fixed at 7%', async ({ page }) => {
  await open(page, 'tax');
  await expect(page.locator('#doc-vat')).toBeDisabled();
  await expect(page.locator('#doc-vat')).toHaveValue('7');
  await expect(page.locator('#doc-vat-fixed')).toBeVisible();
  await expect(page.locator('#doc-payable')).toHaveText('฿10,700.00');
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`at ${size.width}px nothing covers any text in the receipt form`, async ({ page }) => {
    await open(page, 'receipt', FULL, size);
    for (const at of [0, 0.5, 0.8, 1]) {
      await page.evaluate(share => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * share), at);
      expect(await textOverlapIssues(page)).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
