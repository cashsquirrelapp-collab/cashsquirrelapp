import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { FeedbackAction, FeedbackMessage, FeedbackThread } from '../../shared/feedback';

test.use({ serviceWorkers: 'block' });

const ownerId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const closedId = '44444444-4444-4444-8444-444444444444';
const quoteId = '55555555-5555-4555-8555-555555555555';
const createdAt = '2026-10-18T08:00:00Z';

function makeThread(id: string, preview: string, status: FeedbackThread['status'] = 'open'): FeedbackThread {
  return { id, ownerId, ownerName: 'Feedback user', ownerPublicId: 'SQ-1111111111', category: 'bug', status, preview, createdAt, updatedAt: createdAt, lastMessageAt: createdAt, lastSenderRole: 'user', messageCount: 1 };
}

const ideaId = '66666666-6666-4666-8666-666666666666';
const repliedId = '77777777-7777-4777-8777-777777777777';
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** An admin inbox with something in every box: a 2-day-old problem, a 3-hour-old idea, one answered, one closed. */
function inboxThreads(): FeedbackThread[] {
  return [
    { ...makeThread(threadId, 'ปัญหาหน้าจอเล็ก'), createdAt: ago(49), updatedAt: ago(49), lastMessageAt: ago(49) },
    { ...makeThread(ideaId, 'อยากให้ส่งใบแจ้งหนี้ทาง LINE ได้'), category: 'idea', ownerName: 'สตูดิโอตัวอย่าง', ownerPublicId: 'SQ-6666666666', ownerId: ideaId, createdAt: ago(3), updatedAt: ago(3), lastMessageAt: ago(3) },
    { ...makeThread(repliedId, 'ทีมงานกำลังตรวจสอบ', 'in_progress'), category: null, createdAt: ago(30), updatedAt: ago(20), lastMessageAt: ago(20), lastSenderRole: 'admin', messageCount: 2 },
    { ...makeThread(closedId, 'เรื่องที่ปิดแล้ว', 'resolved'), createdAt: ago(80), updatedAt: ago(70), lastMessageAt: ago(70) },
  ];
}

async function setup(page: Page, options: { admin?: boolean; guest?: boolean; seeded?: boolean; inbox?: boolean; pauseCreate?: Promise<void> } = {}) {
  const accountId = options.admin ? adminId : ownerId;
  const user = { id: accountId, email: options.admin ? 'feedback-admin@example.test' : 'feedback-user@example.test', role: options.admin ? 'admin' : 'user', canViewAdminAnalytics: !!options.admin, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
  const threads: FeedbackThread[] = options.inbox ? inboxThreads() : options.seeded ? [makeThread(threadId, 'ปัญหาหน้าจอเล็ก'), makeThread(closedId, 'เรื่องที่ปิดแล้ว', 'resolved')] : [];
  const messages = new Map<string, FeedbackMessage[]>(threads.map(thread => [thread.id, [{ id: `${thread.id}-first`, threadId: thread.id, senderId: thread.ownerId, senderRole: 'user', body: thread.preview, createdAt: thread.createdAt }]]));
  if (options.inbox) {
    messages.set(repliedId, [
      { id: 'replied-1', threadId: repliedId, senderId: ownerId, senderRole: 'user', body: 'กดบันทึกแล้วไม่ขึ้น', createdAt: ago(30) },
      { id: 'replied-2', threadId: repliedId, senderId: adminId, senderRole: 'admin', body: 'ทีมงานกำลังตรวจสอบ', createdAt: ago(20) },
    ]);
  }
  const mutations: FeedbackAction[] = [];
  const requestHeaders: Array<Record<string, string>> = [];
  const reads: URL[] = [];
  const unhandledApi: string[] = [];
  let failNextReply = false;
  const snapshot = {
    jobs: [], expenses: [], goals: [],
    invoices: [{ id: quoteId, documentType: 'quotation', documentNo: 'QT-HIDDEN-KEEP', createdDate: '2026-10-18', issuer: { name: 'Feedback user', address: '', phone: '', email: 'feedback-user@example.test', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' }, client: { name: 'Hidden quote customer', address: '', phone: '', email: '', taxId: '' }, items: [], vatRate: 0, whtRate: 0 }],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
    statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
  };
  await page.addInitScript(({ guest }) => {
    localStorage.setItem('cashflow_language', 'th');
    if (guest) localStorage.setItem('cashflow_guest_session', JSON.stringify({ user: { id: 'guest-feedback-test', email: 'guest@example.test' }, isGuest: true }));
  }, { guest: !!options.guest });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Never use live accounts, services, fonts, or third-party network requests.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.route('**/api/**', route => {
    unhandledApi.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } });
  });
  await page.route('**/api/auth', route => route.fulfill({ json: { session: options.guest ? null : { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: accountId, publicId: options.admin ? 'SQ-2222222222' : 'SQ-1111111111', displayName: options.admin ? 'Feedback admin' : 'Feedback user' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: user.role, groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : { snapshot, versions: { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: { [quoteId]: 1 }, cashflow_documents: { settings: 1 } }, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ status: 503, json: { error: 'Analytics is temporarily unavailable' } }));
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ status: 503, json: { error: 'Stripe is temporarily unavailable' } }));
  await page.route('**/api/feedback*', async route => {
    requestHeaders.push(route.request().headers());
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      reads.push(url);
      const id = url.searchParams.get('threadId');
      const pageNumber = Number(url.searchParams.get('page') || 0);
      if (id) {
        const thread = threads.find(item => item.id === id);
        if (!thread) return route.fulfill({ status: 404, json: { error: 'ไม่พบข้อความนี้' } });
        const allMessages = messages.get(id) || [];
        return route.fulfill({ json: { thread, messages: allMessages.slice(pageNumber * 50, (pageNumber + 1) * 50), hasMore: (pageNumber + 1) * 50 < allMessages.length, page: pageNumber, pageSize: 50 } });
      }
      const box = url.searchParams.get('box');
      if (box) {
        // Mirrors cashflow_feedback_admin_list: the box comes from who wrote last.
        const boxOf = (t: FeedbackThread) => t.status === 'resolved' ? 'resolved' : t.lastSenderRole === 'user' ? 'waiting' : 'replied';
        const kindOf = (t: FeedbackThread) => t.category === 'bug' || t.category === 'idea' ? t.category : 'general';
        const since = (t: FeedbackThread) => {
          const history = messages.get(t.id) || [];
          const lastTeam = history.filter(m => m.senderRole === 'admin').at(-1)?.createdAt || '';
          return history.find(m => m.senderRole === 'user' && m.createdAt > lastTeam)?.createdAt || t.lastMessageAt;
        };
        const inBox = threads.filter(t => boxOf(t) === box);
        const category = url.searchParams.get('category');
        const rows = inBox.filter(t => !category || kindOf(t) === category)
          .map(t => ({ ...t, waitingSince: box === 'waiting' ? since(t) : null, ownerThreadCount: threads.filter(o => o.ownerId === t.ownerId).length, ownerPlan: 'none' as const }))
          .sort((a, b) => box === 'resolved' ? b.lastMessageAt.localeCompare(a.lastMessageAt) : (a.waitingSince || a.lastMessageAt).localeCompare(b.waitingSince || b.lastMessageAt));
        const inBoxCount = (key: string) => threads.filter(t => boxOf(t) === key).length;
        const kindCount = (key: string) => inBox.filter(t => kindOf(t) === key).length;
        return route.fulfill({ json: {
          threads: rows.slice(pageNumber * 20, (pageNumber + 1) * 20), hasMore: (pageNumber + 1) * 20 < rows.length, page: pageNumber, pageSize: 20,
          counts: { waiting: inBoxCount('waiting'), replied: inBoxCount('replied'), resolved: inBoxCount('resolved') },
          kinds: { bug: kindCount('bug'), idea: kindCount('idea'), general: kindCount('general') },
        } });
      }
      const status = url.searchParams.get('status');
      const matching = threads.filter(thread => (!status || thread.status === status) && (url.searchParams.get('scope') === 'admin' || thread.ownerId === accountId));
      return route.fulfill({ json: { threads: matching.slice(pageNumber * 20, (pageNumber + 1) * 20), hasMore: (pageNumber + 1) * 20 < matching.length, page: pageNumber, pageSize: 20 } });
    }
    const action = route.request().postDataJSON() as FeedbackAction;
    mutations.push(action);
    if (action.action === 'create') {
      await options.pauseCreate;
      const now = new Date().toISOString();
      const thread = { ...makeThread(threadId, action.body), category: action.category || null, createdAt: now, updatedAt: now, lastMessageAt: now };
      threads.unshift(thread);
      messages.set(thread.id, [{ id: `${thread.id}-first`, threadId: thread.id, senderId: accountId, senderRole: 'user', body: action.body, createdAt: now }]);
      return route.fulfill({ json: { threadId: thread.id } });
    }
    const thread = threads.find(item => item.id === action.threadId)!;
    if (action.action === 'status') thread.status = action.status;
    else {
      if (failNextReply) { failNextReply = false; return route.fulfill({ status: 503, json: { error: 'Temporary test outage' } }); }
      const senderRole = options.admin ? 'admin' : 'user';
      const history = messages.get(thread.id)!;
      const now = new Date().toISOString();
      history.push({ id: `${thread.id}-${history.length + 1}`, threadId: thread.id, senderId: accountId, senderRole, body: action.body, createdAt: now });
      thread.lastMessageAt = now;
      thread.preview = action.body.slice(0, 180);
      thread.messageCount = history.length;
      thread.lastSenderRole = senderRole;
      thread.status = options.admin ? 'in_progress' : thread.status === 'resolved' ? 'open' : thread.status;
    }
    return route.fulfill({ json: { threadId: thread.id } });
  });
  return { threads, messages, mutations, reads, requestHeaders, unhandledApi, failNextReply: () => { failNextReply = true; } };
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('บอกเรา chat: sends once, thanks only after the save, shows team replies, keeps a failed message and retries without duplicates', async ({ page }, testInfo) => {
  let releaseCreate!: () => void;
  const pauseCreate = new Promise<void>(resolve => { releaseCreate = resolve; });
  const mock = await setup(page, { pauseCreate });
  await page.goto('/feedback/feedback-user');
  await expect(page.getByRole('heading', { name: 'บอกเรา', exact: true })).toBeVisible();
  // first visit: one welcome bubble, no fake history
  await expect(page.getByText('สวัสดีครับ 👋 มีอะไรอยากบอกเราไหม? แจ้งปัญหาหรือเสนอไอเดียได้เลยนะครับ', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'ทั่วไป', exact: true })).toHaveAttribute('aria-checked', 'true');
  const body = 'อยากเพิ่มตัวกรอง <img src=x onerror=alert(1)>';
  await page.getByRole('radio', { name: 'เสนอไอเดีย', exact: true }).click();
  const editor = page.getByLabel('ข้อความถึงทีม', { exact: true });
  // Shift+Enter is a new line, not a send
  await editor.fill('บรรทัดแรก');
  await editor.press('Shift+Enter');
  await expect(editor).toHaveValue('บรรทัดแรก\n');
  await expect.poll(() => mock.mutations.length).toBe(0);
  await editor.fill(body);
  await editor.press('Enter');
  await editor.press('Enter');
  await expect(page.getByRole('button', { name: 'กำลังส่ง', exact: true })).toBeDisabled();
  await expect(page.getByText('กำลังส่ง…', { exact: true })).toBeVisible();
  // no thank-you before the server answers
  await expect(page.getByText('รับไอเดียแล้วครับ! 🧡')).toHaveCount(0);
  await expect.poll(() => mock.mutations.length).toBe(1);
  releaseCreate();
  await expect(page.getByText('รับไอเดียแล้วครับ! 🧡')).toBeVisible();
  await expect(page.getByText('ตอบรับอัตโนมัติ', { exact: true })).toBeVisible();
  await expect(page.getByText('ส่งแล้ว', { exact: true })).toBeVisible();
  expect(mock.mutations[0]).toEqual({ action: 'create', body, category: 'idea' });
  await expect(editor).toHaveValue('');
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);

  // a real team reply shows as the team, without the automatic label
  const thread = mock.threads[0];
  mock.messages.get(threadId)!.push({ id: 'team-reply', threadId, senderId: adminId, senderRole: 'admin', body: 'ขอบคุณสำหรับไอเดีย ทีมงานรับเรื่องแล้ว', createdAt: new Date().toISOString() });
  Object.assign(thread, { messageCount: 2, status: 'in_progress', lastSenderRole: 'admin', lastMessageAt: new Date().toISOString() });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('ขอบคุณสำหรับไอเดีย ทีมงานรับเรื่องแล้ว', { exact: true })).toBeVisible();
  await expect(page.getByText('กำลังดำเนินการ', { exact: true })).toBeVisible();
  await screenshot(page, testInfo, 'feedback-chat-desktop.png');

  // a follow-up continues the same thread; a failed one stays with a retry, and the retry saves it once
  mock.failNextReply();
  await editor.fill('ขอเพิ่มรายละเอียดอีกนิด');
  await editor.press('Enter');
  await expect(page.getByText('ส่งไม่สำเร็จ', { exact: true })).toBeVisible();
  await expect(page.getByText('ขอเพิ่มรายละเอียดอีกนิด', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
  await expect.poll(() => mock.messages.get(threadId)!.filter(m => m.body === 'ขอเพิ่มรายละเอียดอีกนิด').length).toBe(1);
  await expect(page.getByText('กำลังส่ง…', { exact: true })).toHaveCount(0);
  await expect(page.getByText('ส่งไม่สำเร็จ', { exact: true })).toHaveCount(0);
  await expect(page.getByText('ขอเพิ่มรายละเอียดอีกนิด', { exact: true })).toHaveCount(1);
  expect(mock.mutations.filter(m => m.action === 'create')).toHaveLength(1);
  expect(mock.messages.get(threadId)!.filter(m => m.body === 'ขอเพิ่มรายละเอียดอีกนิด')).toHaveLength(1);
  expect(mock.mutations.at(-1)).toEqual({ action: 'reply', threadId, body: 'ขอเพิ่มรายละเอียดอีกนิด' });
  // the thank-you is not stored: a refresh shows only the real conversation
  await page.reload();
  await expect(page.getByText('ขอบคุณสำหรับไอเดีย ทีมงานรับเรื่องแล้ว', { exact: true })).toBeVisible();
  await expect(page.getByText('รับไอเดียแล้วครับ! 🧡')).toHaveCount(0);
  expect(mock.requestHeaders.every(headers => headers['x-account-id'] === ownerId && headers['x-csrf-protection'] === '1')).toBe(true);
  expect(mock.unhandledApi).toEqual([]);
});

test('บอกเรา on a 390px phone: own header, composer clear of the bottom bar, no sideways scroll', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setup(page, { seeded: true });
  await page.goto('/feedback/feedback-user');
  await expect(page.getByRole('heading', { name: 'บอกเรา', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'กลับไปเมนู', exact: true })).toBeVisible();
  await expect(page.getByText('ปัญหาหน้าจอเล็ก', { exact: true })).toBeVisible();
  const composer = await page.getByLabel('ข้อความถึงทีม', { exact: true }).boundingBox();
  const nav = await page.getByRole('navigation', { name: 'เมนูหลัก' }).boundingBox();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, testInfo, 'feedback-chat-mobile.png');
  await page.getByRole('button', { name: 'กลับไปเมนู', exact: true }).click();
  await expect(page.getByRole('region', { name: 'เครื่องมือทั้งหมด' })).toBeVisible();
  expect(mock.unhandledApi).toEqual([]);
});

test('admin inbox: longest wait first, type filter, quick reply, send and close, the next in line', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const mock = await setup(page, { admin: true, inbox: true });
  await page.goto('/adminDashboard/feedback-admin');
  await expect(page.getByRole('alert').filter({ hasText: 'Analytics is temporarily unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'ข้อความจากผู้ใช้', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'กล่องข้อความจากผู้ใช้' })).toBeVisible();
  await expect(page.getByText('Analytics is temporarily unavailable')).toHaveCount(0);
  const boxes = page.getByRole('group', { name: 'แท็บกล่องข้อความ' });
  await expect(boxes.getByRole('button', { name: 'รอตอบ 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(boxes.getByRole('button', { name: 'กำลังทำ 1' })).toBeVisible();
  await expect(boxes.getByRole('button', { name: 'ปิดแล้ว 1' })).toBeVisible();
  const rows = page.getByRole('list', { name: 'รายการเรื่อง' }).getByRole('button', { name: /^เปิดบทสนทนา/ });
  // the two-day-old problem leads, marked overdue; the idea follows
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('ปัญหาหน้าจอเล็ก');
  await expect(rows.first()).toContainText('รอ 2 วัน');
  await expect(rows.first().locator('.fai-age')).toHaveClass(/is-overdue/);
  await expect(rows.nth(1)).toContainText('รอ 3 ชม.');
  await expect(rows.nth(1)).toContainText('Free');
  // a wide screen opens the first one by itself
  const conversation = page.getByRole('region', { name: 'บทสนทนา' });
  await expect(conversation.getByRole('heading', { name: 'Feedback user' })).toBeVisible();
  await expect(conversation.getByText('ปัญหาหน้าจอเล็ก', { exact: true })).toBeVisible();
  await expect(conversation).toContainText('แจ้งมาทั้งหมด 3 เรื่อง');

  const kinds = page.getByRole('radiogroup', { name: 'ประเภทข้อความ' });
  await kinds.getByRole('radio', { name: 'ไอเดีย 1' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('สตูดิโอตัวอย่าง');
  expect(mock.reads.some(url => url.searchParams.get('box') === 'waiting' && url.searchParams.get('category') === 'idea')).toBe(true);
  await kinds.getByRole('radio', { name: 'ทั้งหมด 2' }).click();
  await expect(rows).toHaveCount(2);
  await rows.first().click();

  // a quick reply only fills the box; the admin sends it and closes in one go
  const reply = conversation.getByLabel('ตอบกลับ', { exact: true });
  await conversation.getByRole('button', { name: 'รับเรื่อง', exact: true }).click();
  await expect(reply).toHaveValue('ขอบคุณที่แจ้งเข้ามา ทีมงานได้รับเรื่องแล้วและกำลังตรวจสอบ จะแจ้งความคืบหน้าในแชตนี้');
  expect(mock.mutations).toEqual([]);
  await reply.fill('ทีมงานแก้ไขแล้ว <b>ลองใหม่</b>');
  await conversation.getByLabel('ส่งแล้วปิดเรื่อง').check();
  await conversation.getByRole('button', { name: 'ส่ง', exact: true }).click();
  await expect(conversation.getByRole('status').filter({ hasText: 'ส่งแล้วและปิดเรื่องแล้ว' })).toBeVisible();
  expect(mock.mutations).toEqual([
    { action: 'reply', threadId, body: 'ทีมงานแก้ไขแล้ว <b>ลองใหม่</b>' },
    { action: 'status', threadId, status: 'resolved' },
  ]);
  await expect(conversation.getByText('ทีมงานแก้ไขแล้ว <b>ลองใหม่</b>', { exact: true })).toBeVisible();
  await expect(conversation.locator('b', { hasText: 'ลองใหม่' })).toHaveCount(0);
  await expect(conversation.getByLabel('สถานะเรื่องนี้')).toHaveValue('resolved');
  await expect(reply).toHaveValue('');
  // it left the waiting box; the idea is now next in line
  await expect(boxes.getByRole('button', { name: 'รอตอบ 1' })).toBeVisible();
  await expect(rows).toHaveCount(1);
  await screenshot(page, testInfo, 'feedback-admin-desktop.png');
  await conversation.getByRole('button', { name: 'เรื่องถัดไป' }).click();
  await expect(conversation.getByRole('heading', { name: 'สตูดิโอตัวอย่าง' })).toBeVisible();
  await expect(rows.first()).toHaveAttribute('aria-current', 'true');
  await boxes.getByRole('button', { name: 'ปิดแล้ว 2' }).click();
  // newest first, and the preview shows the team's closing reply
  await expect(rows.first()).toContainText('Feedback user');
  await expect(rows.first()).toContainText('ทีมงาน: ทีมงานแก้ไขแล้ว');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mock.requestHeaders.every(headers => headers['x-account-id'] === adminId)).toBe(true);
  expect(mock.unhandledApi).toEqual([]);
});

test('390px admin inbox: one pane at a time, reply and status from the phone, back to the list', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await setup(page, { admin: true, inbox: true });
  await page.goto('/adminDashboard/feedback-admin');
  await page.getByRole('button', { name: 'ข้อความจากผู้ใช้', exact: true }).click();
  const rows = page.getByRole('list', { name: 'รายการเรื่อง' }).getByRole('button', { name: /^เปิดบทสนทนา/ });
  await expect(rows).toHaveCount(2);
  // nothing opens by itself on a phone
  await expect(page.getByText('เลือกเรื่องทางซ้ายเพื่ออ่านและตอบ')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, testInfo, 'feedback-admin-mobile.png');
  await rows.nth(1).click();
  const conversation = page.getByRole('region', { name: 'บทสนทนา' });
  await expect(conversation.getByRole('heading', { name: 'สตูดิโอตัวอย่าง' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'กล่องข้อความจากผู้ใช้' })).toBeHidden();
  await conversation.getByLabel('ตอบกลับ', { exact: true }).fill('ขอบคุณสำหรับไอเดีย');
  await conversation.getByLabel('ตอบกลับ', { exact: true }).press('Control+Enter');
  await expect(conversation.getByRole('status').filter({ hasText: 'ส่งแล้ว' })).toBeVisible();
  await expect(conversation.getByLabel('สถานะเรื่องนี้')).toHaveValue('in_progress');
  await conversation.getByLabel('สถานะเรื่องนี้').selectOption('resolved');
  await expect(conversation.getByRole('status').filter({ hasText: 'บันทึกสถานะแล้ว' })).toBeVisible();
  expect(mock.mutations).toEqual([
    { action: 'reply', threadId: ideaId, body: 'ขอบคุณสำหรับไอเดีย' },
    { action: 'status', threadId: ideaId, status: 'resolved' },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, testInfo, 'feedback-conversation-mobile.png');
  await conversation.getByRole('button', { name: 'กลับไปรายการ' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toBeVisible();
  expect(mock.unhandledApi).toEqual([]);
});

test('phase one hides advanced navigation for normal accounts; the feedback entry is called บอกเรา', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/feedback/feedback-user');
  const sidebar = page.locator('aside').first();
  await expect(sidebar.getByRole('button', { name: 'บอกเรา', exact: true })).toBeVisible();
  for (const name of ['ภาษี', 'รายงาน', 'วิเคราะห์รายได้', 'คลังเอกสาร', 'ทีม']) await expect(sidebar.getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.goto('/tax/feedback-user');
  await expect(page).toHaveURL(/\/dashboard\/feedback-user$/);
  await expect(page.getByRole('heading', { name: 'ภาษี', exact: true })).toHaveCount(0);
  // quotations were released to every account on 2026-10-20
  await page.goto('/invoice/feedback-user?type=quotation');
  await expect(page.getByRole('tablist', { name: 'ประเภทเอกสาร' }).getByRole('tab', { name: /^ใบเสนอราคา/ })).toBeVisible();
  expect(mock.unhandledApi).toEqual([]);
});

test('guest feedback asks for an account and never calls the feedback API', async ({ page }) => {
  const mock = await setup(page, { guest: true });
  await page.goto('/feedback/demo');
  await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบเพื่อคุยกับทีมงาน' })).toBeVisible();
  await expect(page.getByLabel('ข้อความ', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ / สมัครสมาชิก', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('cashflow_guest_session'))).toBeNull();
  expect(mock.reads).toEqual([]);
  expect(mock.mutations).toEqual([]);
});
