import { expect, test, type Page } from '@playwright/test';
import { summarizeActivity, type StoredActivity } from '../../shared/userActivity';
import { textOverlapIssues } from './textOverlap';

// Owner, 2026-11-03: the admin page shows who uses the app and when ("ดู user active ... คนมา on กี่ช่วงไหนบ้าง"), and the owner
// can send one message to everyone that shows on their screen and can be answered ("พิมพ์ไปหา user ทุกคน ... ให้เขาตอบกลับเราได้").

test.use({ serviceWorkers: 'block' });

const member = { id: '22222222-2222-4222-8222-222222222222', email: 'member@example.com', created_at: '2026-09-01T00:00:00Z', user_metadata: {} };
const owner = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', role: 'admin', canViewAdminAnalytics: true, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const notice = { id: '44444444-4444-4444-8444-444444444444', body: 'สวัสดีครับ วันนี้เป็นอย่างไรบ้างครับ\nแอปของเราใช้งานดีไหมครับ มีอะไรอยากให้ปรับ บอกทีมงานได้เลยครับ', askRating: true, createdAt: '2026-11-03T03:00:00Z' };

async function signIn(page: Page, who: typeof member | typeof owner, options: { mode?: 'light' | 'dark'; consent?: boolean } = {}) {
  const posts: Record<string, unknown>[] = [];
  await page.addInitScript(({ mode, consent }) => {
    localStorage.setItem('cashflow_language', 'th');
    localStorage.setItem('cashflow_theme_pref', JSON.stringify({ mode, asked: true }));
    if (!consent) localStorage.removeItem('krarok_cookie_consent');
  }, { mode: options.mode ?? 'light', consent: options.consent ?? true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user: who } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: who.id, publicId: 'SQ-2222222222', displayName: who === owner ? 'เจ้าของระบบ' : 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: who === owner ? 'admin' : 'member', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: who === owner ? { status: 'active', plan: 'admin_grant', current_period_end: null } : null } }));
  await page.route('**/api/admin-ai-credit', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/broadcast*', route => {
    if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, threadId: null, id: notice.id } }); }
    if (new URL(route.request().url()).searchParams.get('scope') === 'admin') return route.fulfill({ json: { results } });
    return route.fulfill({ json: { broadcast: who === owner ? null : notice } });
  });
  return posts;
}

const results = [{
  ...notice, endedAt: null, audience: 37, seen: 21, answered: 9, dismissed: 6, ratings: [0, 1, 1, 3, 4], average: 4.1,
  replies: [
    { userId: 'a', name: 'มินตรา ดีไซน์', publicId: 'SQ-0000000128', rating: 5, reply: 'ใช้ง่ายมากครับ ชอบหน้าปฏิทินที่สุด อยากให้มีแจ้งเตือนวันเกิดลูกค้าด้วย', at: '2026-11-03T05:10:00Z', threadId: '99999999-9999-4999-8999-999999999999' },
    { userId: 'b', name: 'Than Studio', publicId: 'SQ-0000000217', rating: 3, reply: null, at: '2026-11-03T04:40:00Z', threadId: null },
  ],
}, { id: '55555555-5555-4555-8555-555555555555', body: 'ขอบคุณที่ใช้กระรอกตุนเงินครับ', askRating: false, createdAt: '2026-10-20T03:00:00Z', endedAt: '2026-11-03T03:00:00Z', audience: 30, seen: 18, answered: 2, dismissed: 10, ratings: [0, 0, 0, 0, 0], average: null, replies: [] }];

const now = new Date('2026-11-03T13:00:00Z');
const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);
const names = ['มินตรา ดีไซน์', 'Than Studio', 'ร้านกาแฟริมทาง', 'สมชาย ฟรีแลนซ์', 'ปิยะ ช่างภาพ', 'นักศึกษาฝึกงาน'];
const activity = summarizeActivity({
  profiles: names.map((name, index) => ({ user_id: `u${index}`, public_id: `SQ-000000010${index}`, display_name: name, created_at: `2026-0${7 + (index % 3)}-1${index}T00:00:00Z` })),
  plans: new Map([['u0', 'pro'], ['u1', 'trial']]), range: 30, now,
  presence: new Map([['u0', '2026-11-03T12:59:40Z'], ['u1', '2026-11-03T05:00:00Z']]),
  usage: Array.from({ length: 40 }, (_, index) => ({ user_id: `u${index % 3}`, usage_date: `2026-10-${String(5 + (index % 25)).padStart(2, '0')}`, last_seen_at: `2026-10-${String(5 + (index % 25)).padStart(2, '0')}T${String((index * 5) % 24).padStart(2, '0')}:20:00Z` })),
  activity: new Map([['u0', { v: 1, visits: [[minute('2026-11-02T12:10:00Z'), 48], [minute('2026-11-03T01:30:00Z'), 22], [minute('2026-11-03T12:30:00Z'), 30]] } as StoredActivity]]),
  statsOff: new Set(['u5']), signIns: new Map([['u3', '2026-09-20T03:00:00Z']]),
});

for (const size of [{ name: 'computer', width: 1440, height: 900, mode: 'light' as const }, { name: 'iPad', width: 1024, height: 768, mode: 'dark' as const }, { name: 'phone', width: 390, height: 844, mode: 'dark' as const }]) {
  test(`the team's message shows on opening, takes a score and words, and says thank you (${size.name}, ${size.mode})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const posts = await signIn(page, member, { mode: size.mode });
    await page.goto('/dashboard');
    const dialog = page.getByRole('dialog', { name: 'ข้อความจากทีมกระรอก' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog).toContainText('แอปของเราใช้งานดีไหมครับ');
    await expect.poll(() => posts.map(post => post.action)).toContain('seen');
    const box = (await dialog.boundingBox())!;
    expect(box.x >= 0 && box.x + box.width <= size.width + 0.5 && box.y >= 0 && box.y + box.height <= size.height + 0.5).toBeTruthy();
    if (size.name === 'phone') expect(Math.abs(box.y + box.height - size.height)).toBeLessThan(2); // the phone's sheet sits on the bottom edge
    await expect(dialog.getByRole('button', { name: 'ส่งคำตอบ' })).toBeDisabled();
    await dialog.getByRole('radio', { name: '4 คะแนนจาก 5' }).click();
    await expect(dialog.getByText('ดี', { exact: true })).toBeVisible();
    await dialog.getByRole('textbox').fill('ใช้ง่ายดีครับ อยากให้มีสรุปรายสัปดาห์');
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`broadcast-${size.name}.png`) });
    await dialog.getByRole('button', { name: 'ส่งคำตอบ' }).click();
    await expect(dialog.getByRole('status')).toContainText('ขอบคุณสำหรับคำตอบ');
    expect(posts.find(post => post.action === 'answer')).toEqual({ action: 'answer', id: notice.id, reply: 'ใช้ง่ายดีครับ อยากให้มีสรุปรายสัปดาห์', rating: 4 });
    await dialog.getByRole('button', { name: 'ปิด' }).last().click();
    await expect(dialog).toHaveCount(0);
    expect(posts.some(post => post.action === 'dismiss')).toBe(false);
  });
}

test('closing the message tells the server, so it does not come back', async ({ page }) => {
  const posts = await signIn(page, member);
  await page.goto('/dashboard');
  const dialog = page.getByRole('dialog', { name: 'ข้อความจากทีมกระรอก' });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('button', { name: 'ปิด', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => posts.map(post => post.action)).toContain('dismiss');
});

// Round 2 (owner, 2026-11-03: "พิมพ์ส่งไปแล้วไม่เห็นว่ามันขึ้นสำหรับผู้ใช้เลย"): people who never tapped the cookie banner never saw
// the message, and an app left open never asked again.
for (const size of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`without a cookie choice the message still shows; the banner steps aside and comes back after (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await signIn(page, member, { consent: false });
    await page.goto('/dashboard');
    const message = page.getByRole('dialog', { name: 'ข้อความจากทีมกระรอก' });
    await expect(message).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ck-banner')).toBeHidden();
    // Its buttons are not under anything.
    const close = message.getByRole('button', { name: 'ปิด', exact: true }).last();
    const box = (await close.boundingBox())!;
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[role=dialog]'), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true);
    await close.click();
    await expect(page.getByRole('dialog', { name: 'เว็บไซต์นี้ใช้คุกกี้' })).toBeVisible();
  });
}

test('an app left open asks again when it comes back on screen', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T05:00:00Z') });
  await signIn(page, member);
  let showing = false;
  await page.route('**/api/broadcast*', route => (route.request().method() === 'POST' ? route.fulfill({ json: { ok: true } }) : route.fulfill({ json: { broadcast: showing ? notice : null } })));
  await page.goto('/dashboard');
  await page.waitForTimeout(2500);
  const message = page.getByRole('dialog', { name: 'ข้อความจากทีมกระรอก' });
  await expect(message).toHaveCount(0);
  showing = true; // the owner sends it while this app is open
  await page.clock.fastForward('11:00');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(message).toBeVisible({ timeout: 10000 });
});

async function openAdmin(page: Page, view: 'activity' | 'broadcast', size: { width: number; height: number }, mode: 'light' | 'dark' = 'light') {
  await page.setViewportSize(size);
  const posts = await signIn(page, owner, { mode });
  await page.route('**/api/admin-activity?*', route => route.fulfill({ json: activity }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: {
    range: 30, fromDate: '2026-10-05', toDate: '2026-11-03', generatedAt: now.toISOString(),
    totals: { accounts: 38, newAccounts: 12, activeUsers: 19, previousActiveUsers: 14, pageViews: 820, proAccounts: 3, paidProAccounts: 1, trialAccounts: 4, freeAccounts: 31, revenue: 17700, previousRevenue: 0, paymentCount: 1, conversionRate: 0.03, averageRevenuePerPayer: 17700 },
    daily: [], features: [], personas: [], accounts: [], payments: [], onboarding: null,
  } }));
  await page.goto(`/adminDashboard?view=${view}`);
  return posts;
}

for (const size of [{ name: 'computer', width: 1440, height: 900, mode: 'light' as const }, { name: 'iPad', width: 1024, height: 768, mode: 'dark' as const }]) {
  test(`admin ผู้ใช้งาน: who is on, who has gone quiet, when people use the app, and one account's visits (${size.name})`, async ({ page }, testInfo) => {
    await openAdmin(page, 'activity', size, size.mode);
    await expect(page.getByRole('heading', { name: 'ช่วงเวลาที่คนเข้าใช้' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'ช่วงเวลาที่คนเข้าใช้ ตามวันและชั่วโมง' })).toBeVisible();
    await expect(page.getByText(/คนเข้าใช้มากที่สุดช่วง/)).toBeVisible();
    await expect(page.getByRole('button', { name: /ออนไลน์ตอนนี้\s*1/ })).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText('มินตรา ดีไซน์');
    await expect(rows.first()).toContainText('ออนไลน์อยู่');
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`admin-activity-${size.name}.png`), fullPage: true });
    // Only the ones gone quiet.
    await page.getByRole('tab', { name: /หายไปเกิน 30 วัน/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('สมชาย ฟรีแลนซ์');
    await page.getByRole('tab', { name: /ทั้งหมด/ }).click();
    await rows.first().click();
    const panel = page.getByRole('dialog', { name: 'มินตรา ดีไซน์' });
    await expect(panel).toContainText('การเข้าใช้ล่าสุด');
    await expect(panel.locator('.aact-visits li')).toHaveCount(3);
    await expect(panel).toContainText('48 นาที');
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`admin-activity-panel-${size.name}.png`) });
  });

  test(`admin ส่งข้อความถึงผู้ใช้: write, preview, confirm, send; the scores and answers; stop it (${size.name})`, async ({ page }, testInfo) => {
    const posts = await openAdmin(page, 'broadcast', size, size.mode);
    await expect(page.getByRole('heading', { name: 'ส่งข้อความถึงผู้ใช้ทุกคน' })).toBeVisible();
    await expect(page.getByText('ใช้ง่ายมากครับ ชอบหน้าปฏิทินที่สุด')).toBeVisible();
    await expect(page.getByText('4.1', { exact: true })).toBeVisible();
    const send = page.getByRole('button', { name: 'ส่งถึงทุกคน' });
    await expect(send).toBeDisabled();
    await page.getByRole('textbox', { name: 'ข้อความ' }).fill('สวัสดีครับ ช่วงนี้ใช้แอปเป็นอย่างไรบ้างครับ');
    await expect(page.getByLabel('ตัวอย่างที่ผู้ใช้เห็น')).toContainText('ช่วงนี้ใช้แอปเป็นอย่างไรบ้างครับ');
    // The admin account is never shown its own message: the real window opens here instead, and sends nothing.
    await expect(page.getByText('บัญชีแอดมินจะไม่เห็นข้อความของตัวเองตอนเปิดแอป', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'ดูหน้าต่างจริง' }).first().click();
    const preview = page.getByRole('dialog', { name: 'ข้อความจากทีมกระรอก' });
    await expect(preview).toContainText('สวัสดีครับ ช่วงนี้ใช้แอปเป็นอย่างไรบ้างครับ');
    await preview.getByRole('radio', { name: '5 คะแนนจาก 5' }).click();
    await preview.getByRole('button', { name: 'ส่งคำตอบ' }).click();
    await expect(preview.getByRole('status')).toContainText('ขอบคุณสำหรับคำตอบ');
    await page.screenshot({ path: testInfo.outputPath(`admin-broadcast-preview-${size.name}.png`) });
    await preview.getByRole('button', { name: 'ปิด' }).last().click();
    await expect(preview).toHaveCount(0);
    expect(posts.filter(post => post.action !== 'send' && post.action !== 'end')).toEqual([]);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`admin-broadcast-${size.name}.png`), fullPage: true });
    await send.click();
    await page.getByRole('button', { name: /ยืนยัน|ตกลง/ }).last().click();
    await expect.poll(() => posts.find(post => post.action === 'send')).toEqual({ action: 'send', body: 'สวัสดีครับ ช่วงนี้ใช้แอปเป็นอย่างไรบ้างครับ', askRating: true });
    await expect(page.getByText('ส่งข้อความแล้ว ผู้ใช้จะเห็นเมื่อเปิดแอปครั้งถัดไป')).toBeVisible();
    await page.getByRole('button', { name: 'หยุดแสดงข้อความนี้' }).click();
    await page.getByRole('button', { name: /ยืนยัน|ตกลง/ }).last().click();
    await expect.poll(() => posts.find(post => post.action === 'end')).toEqual({ action: 'end', id: notice.id });
    // A written answer opens the conversation in ข้อความจากผู้ใช้.
    await page.getByRole('button', { name: 'ตอบกลับในข้อความจากผู้ใช้' }).click();
    await expect(page.getByRole('button', { name: /ข้อความจากผู้ใช้/ }).first()).toHaveAttribute('aria-current', 'page');
  });
}

test('phone admin: ผู้ใช้งาน and ส่งข้อความถึงผู้ใช้ open as their own pages in the phone design', async ({ page }, testInfo) => {
  await openAdmin(page, 'activity', { width: 390, height: 844 }, 'dark');
  await expect(page.getByRole('heading', { name: 'ผู้ใช้งาน' })).toBeVisible();
  await expect(page.getByText('ช่วงเวลาที่คนเข้าใช้')).toBeVisible();
  await expect(page.getByRole('button', { name: /มินตรา ดีไซน์/ })).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('admin-activity-phone.png'), fullPage: true });
  await page.getByRole('button', { name: /มินตรา ดีไซน์/ }).click();
  await expect(page.getByRole('dialog')).toContainText('การเข้าใช้ล่าสุด');
  await page.screenshot({ path: testInfo.outputPath('admin-activity-phone-sheet.png') });

  await page.goto('/adminDashboard?view=broadcast');
  await expect(page.getByRole('heading', { name: 'ส่งข้อความถึงผู้ใช้' })).toBeVisible();
  await expect(page.getByText('ใช้ง่ายมากครับ ชอบหน้าปฏิทินที่สุด')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('admin-broadcast-phone.png'), fullPage: true });
});
