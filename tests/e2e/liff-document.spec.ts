import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The LINE form for a quotation or invoice draft (owner, 2026-10-30): opened from the draft card, everything on one page,
// what the card already knew filled in, and one button that creates the document. LINE's SDK and the server's answers
// are stood in; the server side is tested in tests/line-document-draft.test.ts.

const drafts = {
  full: { type: 'quotation', client: { name: 'บริษัท แบรนด์เอ' }, items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }], vatRate: 0, whtRate: 0, heard: 'ให้ บริษัท แบรนด์เอ ถ่ายรูปสินค้า 20 รูป รูปละ 300' },
  empty: { type: 'invoice', client: {}, items: [], vatRate: 0, whtRate: 0 },
};

async function open(page: Page, scenario: keyof typeof drafts, issuer = 'สตูดิโอตัวอย่าง', size = { width: 390, height: 844 }) {
  const sent: any[] = [];
  await page.setViewportSize(size);
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",closeWindow(){},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff' } }));
  await page.route('**/api/liff-submit', route => {
    const body = route.request().postDataJSON(); sent.push(body);
    if (body.action === 'load-draft') return route.fulfill({ json: { ok: true, kind: 'document', draft: drafts[scenario], createdAt: new Date().toISOString(), issuer: { name: issuer } } });
    return route.fulfill({ json: { ok: true, documentNo: 'QT-2569-4F2A91C0', notificationSent: true } });
  });
  await page.goto('/liff-add.html?draftKind=document&draftKey=0123456789abcdef');
  await expect(page.locator('#document-card')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return sent;
}

test('a filled draft opens with what the card knew, and creating it sends the checked fields', async ({ page }) => {
  const sent = await open(page, 'full');
  await expect(page.locator('#document-title')).toHaveText('ใบเสนอราคา');
  await expect(page.locator('#document-issuer-known')).toContainText('สตูดิโอตัวอย่าง');
  await expect(page.locator('#doc-client-name')).toHaveValue('บริษัท แบรนด์เอ');
  await expect(page.locator('#doc-item-qty-0')).toHaveValue('20');
  await expect(page.locator('#document-summary-amount')).toHaveText('฿6,000.00');
  await expect(page.locator('.kind-tabs')).toBeHidden(); // no job / expense tabs on a document
  await page.getByRole('button', { name: '30 วัน' }).click();
  await page.locator('#doc-vat').selectOption('7');
  await expect(page.locator('#doc-payable')).toHaveText('฿6,420.00');
  await page.getByRole('button', { name: 'สร้างใบเสนอราคา' }).click();
  await expect(page.getByRole('heading', { name: 'สร้างใบเสนอราคาแล้ว' })).toBeVisible();
  const submit = sent.find(body => body.action === 'confirm-draft');
  expect(submit).toMatchObject({ draftKind: 'document', draftKey: '0123456789abcdef', document: { type: 'quotation', vatRate: 7, creditTerm: 30,
    client: { name: 'บริษัท แบรนด์เอ' }, items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }] } });
  expect(submit.document.issuer).toBeUndefined(); // the saved business stays as it is
});

test('an empty draft asks for the client and a priced line before it creates anything, and a new business is named here', async ({ page }) => {
  const sent = await open(page, 'empty', '');
  await expect(page.locator('#document-title')).toHaveText('ใบแจ้งหนี้');
  await expect(page.locator('#document-issuer-fields')).toBeVisible();
  await page.getByRole('button', { name: 'สร้างใบแจ้งหนี้' }).click();
  await expect(page.locator('#document-error-box')).toContainText('ชื่อธุรกิจ');
  await page.locator('#doc-issuer-name').fill('สตูดิโอใหม่');
  await page.getByRole('button', { name: 'สร้างใบแจ้งหนี้' }).click();
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
  expect(sent.find(body => body.action === 'confirm-draft').document).toMatchObject({ type: 'invoice', issuer: { name: 'สตูดิโอใหม่' }, items: [{ price: 7500 }, { price: 500 }] });
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`at ${size.width}px nothing covers any text in the form`, async ({ page }) => {
    await open(page, 'full', 'สตูดิโอตัวอย่าง', size);
    for (const at of [0, 0.3, 0.6, 1]) {
      await page.evaluate(share => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * share), at);
      expect(await textOverlapIssues(page)).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
