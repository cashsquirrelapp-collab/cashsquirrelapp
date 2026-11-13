import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Job and expense drafts from the chat in design B (owner, 2026-11-13: "เปลี่ยนเป็นแบบ B ... ดูง่ายกว่า", after design D):
// the amount large on a brick band with the mascot, white cards, choices to tap for the type, หัก ณ ที่จ่าย, credit days
// and category, the payment state as large options, no รายรับ / รายจ่าย switch and no steps. LINE's SDK and the server's
// answers are stood in; the server side is tested in tests/line-*.test.ts.

const drafts: Record<string, { kind: 'job' | 'expense'; draft: Record<string, unknown> }> = {
  job: { kind: 'job', draft: { name: 'งานตัดต่อ', client: 'นาย A', value: 5000, whtRate: 3, paymentStatus: 'pending', creditTerm: 30, type: 'Video Production', note: '' } },
  bare: { kind: 'job', draft: { name: 'งานตัดต่อ', value: 5000 } },
  oddRate: { kind: 'job', draft: { name: 'ออกแบบโลโก้', client: 'บริษัท แบรนด์เอ จำกัด', value: 12000, whtRate: 2, paymentStatus: 'paid', creditTerm: 20, type: 'งานพิเศษ' } },
  expense: { kind: 'expense', draft: { name: 'ค่ากาแฟลูกค้า', amount: 120, category: 'อาหาร/รับรองลูกค้า', note: '' } },
  installments: { kind: 'job', draft: { name: 'เว็บไซต์บริษัทเอ', client: 'บริษัท เอ จำกัด', value: 30000, whtRate: 3, paymentStatus: 'installment', installmentCount: 3, installmentFirstPaid: true, installmentFirstDue: '2026-11-14', workStatus: 'delivered' } },
};

async function open(page: Page, scenario: keyof typeof drafts) {
  const sent: any[] = [];
  const closed: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.exposeFunction('__closed', () => closed.push('closed'));
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",closeWindow(){window.__closed()},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff' } }));
  const { kind, draft } = drafts[scenario];
  await page.route('**/api/liff-submit', route => {
    const body = route.request().postDataJSON(); sent.push(body);
    if (body.action === 'load-draft') return route.fulfill({ json: { ok: true, kind, draft } });
    return route.fulfill({ json: { ok: true, notificationSent: true } });
  });
  await page.goto(`/liff-add.html?draftKind=${kind}&draftKey=0123456789abcdef`);
  await expect(page.locator(`#${kind}-card`)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { sent, closed };
}

test('a job draft opens in design B, filled in, with no switch and no steps', async ({ page }) => {
  await open(page, 'job');
  await expect(page.locator('#expense-card')).toBeHidden();
  await expect(page.locator('.kind-tabs')).toHaveCount(0);
  await expect(page.locator('#job-title')).toHaveText('บันทึกงาน');
  await expect(page.locator('#job-band-amount')).toHaveText('฿5,000.00');
  await expect(page.locator('#job-band-who')).toHaveText('งานตัดต่อ · นาย A');
  await expect(page.locator('#job-type-pick [aria-checked="true"]')).toHaveText('Video Production');
  await expect(page.locator('#job-name')).toHaveValue('งานตัดต่อ');
  await expect(page.locator('#job-client')).toHaveValue('นาย A');
  await expect(page.locator('#job-type')).toHaveValue('Video Production');
  await expect(page.locator('#job-creditTerm')).toHaveValue('30');
  await expect(page.locator('#job-wht-pick [aria-checked="true"]')).toHaveText('3%');
  await expect(page.locator('#job-status-pick [aria-checked="true"]')).toHaveText('ยังไม่ได้รับเงิน');
  await expect(page.locator('#job-credit-pick [aria-checked="true"]')).toHaveText('30 วัน');
  await expect(page.locator('#received-amount-field')).toBeHidden();
  await expect(page.locator('#receipt-value')).toHaveText('฿5,000.00');
  await expect(page.locator('#receipt-wht-row')).toContainText('หัก ณ ที่จ่าย 3%');
  await expect(page.locator('#receipt-wht')).toHaveText('−฿150.00');
  await expect(page.locator('#receipt-net')).toHaveText('฿4,850.00');
  await expect(page.locator('#receipt-pending')).toHaveText('฿4,850.00');
  // No green anywhere on the slip (owner: green is not the brand's colour).
  const green = await page.locator('#job-card').evaluate(card => [...card.querySelectorAll('*')].some(el => {
    const style = getComputedStyle(el);
    return [style.color, style.backgroundColor, style.borderBottomColor].some(c => { const m = c.match(/\d+/g); return !!m && Number(m[1]) > Number(m[0]) + 30 && Number(m[1]) > Number(m[2]) + 30; });
  }));
  expect(green).toBe(false);
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/liff-b-job.png', fullPage: true });
});

test('choosing มัดจำแล้ว asks how much came in and the total follows; ยืนยันบันทึก sends what the slip shows', async ({ page }) => {
  const { sent } = await open(page, 'job');
  await page.locator('#job-status-pick').getByRole('radio', { name: 'รับมัดจำบางส่วนแล้ว' }).click();
  await expect(page.locator('#received-amount-field')).toBeVisible();
  await page.locator('#job-wht-pick').getByRole('radio', { name: 'ไม่มี' }).click();
  await expect(page.locator('#receipt-wht-row')).toBeHidden();
  await page.locator('#job-next-btn').click();
  await expect(page.locator('#job-error-box')).toContainText('ยอดรับบางส่วน');
  await page.locator('#job-receivedAmount').fill('2000');
  await expect(page.locator('#receipt-received')).toHaveText('฿2,000.00');
  await expect(page.locator('#receipt-pending')).toHaveText('฿3,000.00');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'artifacts/liff-b-job-partial.png', fullPage: true });
  // Leave the amount field first: a full-page screenshot moves the page when it loses focus during the tap.
  await page.locator('#job-receivedAmount').blur();
  await page.locator('#job-next-btn').click();
  await expect(page.locator('#status-view')).toContainText('บันทึกสำเร็จ');
  const saved = sent.find(body => body.action === 'confirm-draft');
  expect(saved).toMatchObject({ kind: 'job', draftKind: 'job', name: 'งานตัดต่อ', client: 'นาย A', value: '5000', whtRate: '0', paymentStatus: 'partial', receivedAmount: '2000', creditTerm: '30' });
});

test('a draft without a payment state asks for one before saving; a rate the row lacks is kept as its own choice', async ({ page, context }) => {
  const { sent } = await open(page, 'bare');
  await expect(page.locator('#job-status-pick [aria-checked="true"]')).toHaveCount(0);
  await expect(page.locator('#receipt-pending')).toHaveText('ยังไม่เลือก');
  await page.locator('#job-next-btn').click();
  await expect(page.locator('#job-error-box')).toContainText('กรุณาเลือกสถานะการรับเงิน');
  await expect(page.locator('#job-status-pick')).toBeFocused();
  expect(sent.some(body => body.action === 'confirm-draft')).toBe(false);
  const second = await context.newPage();
  const other = await open(second, 'oddRate');
  await expect(second.locator('#job-wht-pick [aria-checked="true"]')).toHaveText('2%');
  await expect(second.locator('#job-wht-pick button')).toHaveText(['ไม่มี', '1%', '2%', '3%', '5%']);
  await expect(second.locator('#job-credit-pick button')).toHaveText(['ไม่มี', '15 วัน', '20 วัน', '30 วัน', '45 วัน', '60 วัน', '90 วัน']);
  await expect(second.locator('#job-type-pick [aria-checked="true"]')).toHaveText('งานพิเศษ');
  // The chosen type tapped again is left unchosen.
  await second.locator('#job-type-pick').getByRole('radio', { name: 'งานพิเศษ' }).click();
  await expect(second.locator('#job-type')).toHaveValue('ยังไม่ระบุ');
  await second.locator('#job-next-btn').click();
  await expect(second.locator('#status-view')).toContainText('บันทึกสำเร็จ');
  expect(other.sent.find(body => body.action === 'confirm-draft')).toMatchObject({ whtRate: '2', paymentStatus: 'paid', receivedAmount: 0, creditTerm: '20', type: 'ยังไม่ระบุ' });
});

test('an expense draft opens in design B; กลับไปแชท closes the window without saving', async ({ page }) => {
  const { sent, closed } = await open(page, 'expense');
  await expect(page.locator('#job-card')).toBeHidden();
  await expect(page.locator('#expense-title')).toHaveText('บันทึกรายจ่าย');
  await expect(page.locator('#expense-name')).toHaveValue('ค่ากาแฟลูกค้า');
  await expect(page.locator('#expense-category')).toHaveValue('อาหาร/รับรองลูกค้า');
  await expect(page.locator('#expense-category-pick [aria-checked="true"]')).toHaveText('อาหาร/รับรองลูกค้า');
  await expect(page.locator('#expense-summary-amount')).toHaveText('฿120.00');
  await expect(page.locator('#expense-summary-name')).toHaveText('ค่ากาแฟลูกค้า · อาหาร/รับรองลูกค้า');
  await page.locator('#expense-category-pick').getByRole('radio', { name: 'ค่าเดินทาง/น้ำมัน' }).click();
  await expect(page.locator('#expense-category')).toHaveValue('ค่าเดินทาง/น้ำมัน');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'artifacts/liff-b-expense.png', fullPage: true });
  await page.locator('#expense-card').getByRole('button', { name: 'กลับไปแชท' }).click();
  expect(closed).toEqual(['closed']);
  expect(sent.some(body => body.action === 'confirm-draft')).toBe(false);
});

// LINE's browser on an iPhone dropped the draft request on the way (owner, 2026-11-13: "กดเข้าไปแก้ไขรายละเอียดไม่ได้ ...
// เปิดรายการร่างไม่ได้"; the server log showed the request cut off within a second). A dropped request is sent again; if it
// keeps dropping, the error screen offers ลองอีกครั้ง. An expired draft is final: no button that cannot work.
async function openWith(page: Page, answer: (attempt: number) => 'drop' | 'ok' | 'gone') {
  let attempts = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://static.line-scdn.net/**', route => route.fulfill({ contentType: 'text/javascript',
    body: 'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"token",closeWindow(){},login(){}};' }));
  await page.route('**/api/liff-config', route => route.fulfill({ json: { liffId: 'test-liff' } }));
  await page.route('**/api/liff-submit', route => {
    const body = route.request().postDataJSON();
    if (body.action !== 'load-draft') return route.fulfill({ json: { ok: true } });
    attempts += 1;
    const what = answer(attempts);
    if (what === 'drop') return route.abort('connectionreset');
    if (what === 'gone') return route.fulfill({ status: 409, json: { error: 'รายการนี้หมดอายุ บันทึกแล้ว หรือมีร่างใหม่ กรุณาเปิดจากการ์ดล่าสุด' } });
    return route.fulfill({ json: { ok: true, kind: 'job', draft: { name: 'A', paymentStatus: 'pending' } } });
  });
  await page.goto('/liff-add.html?draftKind=job&draftKey=0123456789abcdef');
  return () => attempts;
}

test('a dropped draft request is sent again and the form opens', async ({ page }) => {
  const attempts = await openWith(page, n => (n === 1 ? 'drop' : 'ok'));
  await expect(page.locator('#job-card')).toBeVisible();
  await expect(page.locator('#job-name')).toHaveValue('A');
  expect(attempts()).toBe(2);
});

test('a request that keeps dropping shows ลองอีกครั้ง, which opens the form once the line is back', async ({ page }) => {
  let online = false;
  const attempts = await openWith(page, () => (online ? 'ok' : 'drop'));
  await expect(page.locator('#status-view')).toContainText('เปิดรายการร่างไม่ได้');
  expect(attempts()).toBe(3);
  online = true;
  await page.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
  await expect(page.locator('#job-card')).toBeVisible();
  await expect(page.locator('#job-name')).toHaveValue('A');
});

test('an expired draft says so with no ลองอีกครั้ง', async ({ page }) => {
  await openWith(page, () => 'gone');
  await expect(page.locator('#status-view')).toContainText('รายการนี้หมดอายุ');
  await expect(page.getByRole('button', { name: 'ลองอีกครั้ง' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'กลับไปแชท' })).toBeVisible();
});

// Instalments from the chat (owner, 2026-11-14: "รับเป็นงวด ... cover ตัวแอปทั้งหมด"): the form shows them and keeps them.
test('a draft paid in instalments opens on แบ่งงวด with its count, and saves them; 2% is a choice of its own', async ({ page }) => {
  const { sent } = await open(page, 'installments');
  await expect(page.locator('#job-status-pick [aria-checked="true"]')).toHaveText('แบ่งงวด');
  await expect(page.locator('#installment-field')).toBeVisible();
  await expect(page.locator('#job-installment-pick [aria-checked="true"]')).toHaveText('3 งวด');
  await expect(page.locator('#job-installmentFirstPaid')).toBeChecked();
  await expect(page.locator('#receipt-received')).toHaveText('฿9,700.00');
  await expect(page.locator('#job-wht-pick button')).toHaveText(['ไม่มี', '1%', '2%', '3%', '5%']);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.locator('#job-installment-pick button', { hasText: '4 งวด' }).click();
  await page.locator('#job-next-btn').click();
  await expect(page.locator('#status-view')).toBeVisible();
  const saved = sent.find(body => body.action === 'confirm-draft');
  expect([saved.paymentStatus, saved.installmentCount, saved.installmentFirstPaid, saved.installmentFirstDue]).toEqual(['installment', '4', true, null]);
});
