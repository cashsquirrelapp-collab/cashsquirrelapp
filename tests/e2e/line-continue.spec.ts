import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// ทำต่อในแอป (owner's plan, item 4, 2026-11-14): LINE's button opens /assistant?continue=<id>&from=line (the LINE page has
// already signed the person in). The chat asks the server for that conversation once and opens it as a chat of its own:
// what was said in LINE, เลขา's answer and the same cards, confirmed here. After analysis the box suggests the detailed
// version; a link that is gone says so. The server is stood in (tests/line-continue.test.ts covers it).

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'line-continue@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const ID = 'Abcdefghijklmnopqrstuv';
const CHAT = 'c_5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const card = (n: number, name: string, amount: string) => ({ kind: 'confirm', id: `p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4${n}`, title: 'เพิ่มรายจ่าย',
  changes: [{ label: 'รายการ', value: name }, { label: 'จำนวนเงิน', value: amount }, { label: 'วันที่', value: '2026-11-14' }] });
const AT = '2026-11-14T03:00:00.000Z';
const CARDS_CHAT = { conversationId: CHAT, title: 'ต่อจาก LINE · บันทึกตามบิลทั้งหมดนี้', why: 'cards', messages: [
  { id: 'm-1', role: 'user', text: 'สวัสดีครับ', at: AT },
  { id: 'm-2', role: 'assistant', text: 'สวัสดีครับ มีอะไรให้ช่วยครับ', at: AT },
  { id: 'm-3', role: 'user', text: 'บันทึกตามบิลทั้งหมดนี้', at: AT, attachment: { name: 'บิลเดือนนี้.pdf', kind: 'pdf' } },
  { id: 'm-4', role: 'assistant', text: 'เตรียมรายจ่ายจากบิลให้ 3 รายการครับ ตรวจแล้วกดบันทึกได้เลย', at: AT,
    cards: [card(1, 'ค่าเช่าอุปกรณ์ถ่ายทำ', '฿3,500'), card(2, 'ค่าเดินทาง', '฿420'), card(3, 'ค่าอาหารทีมงาน', '฿1,280')] },
] };
const DETAIL_CHAT = { conversationId: CHAT, title: 'ต่อจาก LINE · วางแผนภาษีปีนี้ให้หน่อย', why: 'detail', messages: [
  { id: 'm-1', role: 'user', text: 'วางแผนภาษีปีนี้ให้หน่อย', at: AT },
  { id: 'm-2', role: 'assistant', text: 'ปีนี้ภาษีโดยประมาณ 12,000 บาทครับ\n\nลดหย่อนเพิ่มได้จากกองทุนและประกันครับ', at: AT },
] };

async function open(page: Page, reply: { status: number; json: unknown }, width = 1440) {
  const posts: Record<string, unknown>[] = [];
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem(`krarok.fileNotice.${id}`, '1');
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  await page.route('**/api/assistant', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-30T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } });
    const body = request.postDataJSON();
    posts.push(body);
    if (body.action === 'continue-line') return route.fulfill(reply);
    if (body.action === 'confirm') return route.fulfill({ json: { status: 'applied', kind: 'add_expense', recordId: 'e-1' } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
  await page.goto(`/assistant?continue=${ID}&from=line`);
  await loadLayoutFonts(page);
  return posts;
}

for (const device of [{ name: 'computer', width: 1440 }, { name: 'phone', width: 390 }]) {
  test(`ทำต่อในแอป opens the LINE conversation as a chat with the same cards, confirmed here (${device.name})`, async ({ page }) => {
    const posts = await open(page, { status: 200, json: CARDS_CHAT }, device.width);
    await expect(page.getByTestId('from-line')).toHaveText('ต่อจากที่คุยใน LINE');
    const thread = page.locator('.asx-thread');
    await expect(thread).toContainText('บันทึกตามบิลทั้งหมดนี้');
    await expect(thread).toContainText('เตรียมรายจ่ายจากบิลให้ 3 รายการครับ');
    const cards = page.locator('.asx-rcard.is-confirm');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText('ค่าเช่าอุปกรณ์ถ่ายทำ');
    // Asked once, with the id from LINE, and the address no longer carries it (a reload opens the chat as usual).
    expect(posts.filter(body => body.action === 'continue-line')).toEqual([{ action: 'continue-line', id: ID }]);
    expect(new URL(page.url()).searchParams.get('continue')).toBeNull();
    expect(posts.some(body => body.action === 'message')).toBe(false);
    await page.waitForTimeout(600);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/line-continue-${device.name}.png` });
    // The top of the chat says where it comes from.
    await page.getByTestId('from-line').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/line-continue-${device.name}-top.png` });

    await cards.first().getByRole('button', { name: /บันทึก|ยืนยัน/ }).first().click();
    await expect(cards.first()).toContainText('บันทึกแล้ว');
    expect(posts.filter(body => body.action === 'confirm')).toEqual([{ action: 'confirm', proposalId: CARDS_CHAT.messages[3].cards![0].id }]);
  });
}

test('after analysis in LINE the chat opens with the detailed version ready to send (nothing sent by itself)', async ({ page }) => {
  const posts = await open(page, { status: 200, json: DETAIL_CHAT });
  await expect(page.getByTestId('from-line')).toBeVisible();
  await expect(page.locator('.asx-thread')).toContainText('ปีนี้ภาษีโดยประมาณ 12,000 บาทครับ');
  await expect(page.locator('#asx-message')).toHaveValue('ขอแบบละเอียด');
  expect(posts.some(body => body.action === 'message')).toBe(false);
  await page.waitForTimeout(900);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/line-continue-detail.png' });
});

test('a ทำต่อในแอป link that is gone says so under the box', async ({ page }) => {
  await open(page, { status: 404, json: { error: 'ลิงก์นี้หมดเวลาแล้ว พิมพ์บอกเลขาต่อในแอปได้เลย', code: 'line_continue_gone' } });
  await expect(page.getByTestId('line-continue-gone')).toHaveText('ลิงก์จาก LINE หมดเวลาแล้ว พิมพ์บอกเลขาต่อได้เลย');
  await expect(page.getByTestId('from-line')).toHaveCount(0);
});
