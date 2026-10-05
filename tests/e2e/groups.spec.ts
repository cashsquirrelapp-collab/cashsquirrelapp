import { test, expect, type Page } from '@playwright/test';
import type { GroupDetail, SystemRole } from '../../shared/groups';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'leader@example.com',
  role: 'user' as SystemRole,
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};
const member = {
  userId: '22222222-2222-4222-8222-222222222222',
  publicId: 'SQ-2222222222',
  displayName: 'Team member',
  role: 'member' as const,
  joinedAt: '2026-09-17T00:00:00Z',
};
const id = '55555555-5555-4555-8555-555555555555';
const initialGroup = (): GroupDetail => ({
  id,
  name: 'Design team',
  description: 'Our team',
  myRole: 'leader',
  memberCount: 1,
  leaderCount: 1,
  createdAt: '2026-09-17T00:00:00Z',
  members: [
    {
      userId: user.id,
      publicId: 'SQ-1111111111',
      displayName: 'Leader',
      role: 'leader',
      joinedAt: '2026-09-17T00:00:00Z',
    },
  ],
  invitations: [],
  activity: [],
});
const snapshot = {
  jobs: [],
  expenses: [],
  goals: [],
  invoices: [],
  settings: {
    monthlyExpense: 0,
    monthlyRevenueGoal: 20000,
    savingsPercentage: 40,
    profileSetupCompleted: true,
    userPersona: 'freelance',
  },
  statuses: [],
  job_types: [],
  notif_settings: {},
  avatar_data_url: null,
  issuer_profile: null,
};
async function finance(page: Page) {
  await page.route('**/api/data*', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'POST'
          ? { ok: true }
          : {
              snapshot,
              versions: {
                cashflow_jobs: {},
                cashflow_expenses: {},
                cashflow_goals: {},
                cashflow_invoices: {},
                cashflow_documents: { settings: 1 },
              },
              subscription: {
                status: 'active',
                plan: 'pro_monthly',
                current_period_end: '2027-01-01T00:00:00Z',
              },
            },
    }),
  );
}
async function openGroups(page: Page) {
  await page.goto('/');
  const sidebar = page.locator('aside');
  await sidebar.getByRole('button', { name: 'เครื่องมือเพิ่มเติม' }).click();
  await sidebar.getByRole('button', { name: 'ทีม', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ทีม', exact: true })).toBeVisible();
}
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const confirmDialog = (page: Page) => page.locator('[role=presentation]').getByRole('button', { name: 'ยืนยัน', exact: true }).click();

test('create, invite, promote and transfer leadership; presence and controls update after transfer on mobile', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let group: GroupDetail | null = null;
  const actions: any[] = [];
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { session: { user } } }),
  );
  await finance(page);
  await page.route('**/api/groups**', (route) => {
    expect(route.request().headers()['x-account-id']).toBe(user.id);
    if (route.request().method() === 'POST') {
      expect(route.request().headers()['x-csrf-protection']).toBe('1');
      const action = route.request().postDataJSON();
      actions.push(action);
      if (action.action === 'create')
        group = { ...initialGroup(), id: action.groupId, name: action.name, description: action.description };
      if (action.action === 'invite')
        group!.invitations = [{ id, groupId: group!.id, groupName: group!.name, publicId: member.publicId, displayName: member.displayName, expiresAt: new Date(Date.now() + 6.5 * 86400000).toISOString() }];
      if (action.action === 'member-role') {
        group!.members.find((m) => m.userId === action.userId)!.role = action.role;
        group!.leaderCount = group!.members.filter((m) => m.role === 'leader').length;
      }
      if (action.action === 'transfer') {
        group!.myRole = 'member';
        group!.members[0].role = 'member';
        group!.members[1].role = 'leader';
        group!.leaderCount = 1;
        group!.invitations = [];
        group!.activity = [];
      }
      return route.fulfill({ json: { ok: true, groupId: group!.id } });
    }
    const url = new URL(route.request().url());
    if (url.searchParams.has('memberSearch')) return route.fulfill({ json: { users: [member] } });
    if (url.searchParams.has('groupId')) return route.fulfill({ json: { ...group, presenceAt: new Date().toISOString() } });
    return route.fulfill({ json: { systemRole: 'user', groups: group ? [group] : [], invitations: [], total: group ? 1 : 0, page: 0 } });
  });
  await openGroups(page);
  await page.getByRole('button', { name: 'สร้างทีม', exact: true }).first().click();
  await page.getByLabel('ชื่อทีม', { exact: true }).fill('Design team');
  await page.getByLabel('รายละเอียด', { exact: true }).fill('Work together');
  await page.getByRole('button', { name: 'ยืนยันสร้างทีม' }).click();
  await expect(page.getByRole('tab', { name: 'สมาชิก (1)' })).toBeVisible();
  await expect(page.getByText('ตอนนี้มีคุณอยู่ในทีมคนเดียว')).toBeVisible();
  // the only leader cannot leave
  await page.getByRole('button', { name: 'ตั้งค่าทีม' }).click();
  await expect(page.getByRole('button', { name: 'ออกจากทีม', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  // invite by public ID
  await page.getByRole('button', { name: 'เชิญสมาชิก' }).first().click();
  await page.getByLabel('ค้นหาด้วยชื่อหรือ User ID').fill(member.publicId);
  await page.getByRole('button', { name: 'ค้นหา' }).click();
  await page.getByRole('button', { name: 'เชิญ', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'คำเชิญ (1)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('หมดอายุอีก 7 วัน')).toBeVisible();
  // the member accepts; presence: leader online, member last seen 18 minutes ago
  group!.members[0] = { ...group!.members[0], isOnline: true, lastSeenAt: minutesAgo(0) };
  group!.members.push({ ...member, isOnline: false, lastSeenAt: minutesAgo(18) });
  group!.memberCount = 2;
  group!.invitations = [];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('tab', { name: 'สมาชิก (2)' }).click();
  await expect(page.getByText('ใช้งานล่าสุด 18 นาทีที่แล้ว')).toBeVisible();
  await expect(page.getByText('ออนไลน์', { exact: true }).first()).toBeVisible();
  // promote, then transfer leadership through the member's ⋯ menu
  await page.getByRole('button', { name: `ตัวเลือกของ ${member.displayName}` }).click();
  await page.getByRole('menuitem', { name: 'เพิ่มเป็นผู้ดูแลทีม' }).click();
  await confirmDialog(page);
  await expect.poll(() => group!.leaderCount).toBe(2);
  await page.getByRole('button', { name: `ตัวเลือกของ ${member.displayName}` }).click();
  await page.getByRole('menuitem', { name: 'โอนตำแหน่งผู้ดูแลทีม' }).click();
  await expect(page.getByText(/คุณจะกลับเป็นสมาชิกและเสียสิทธิ์/)).toBeVisible();
  await confirmDialog(page);
  await expect(page.getByRole('button', { name: 'เชิญสมาชิก' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^ตัวเลือกของ/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^คำเชิญ/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'ตั้งค่าทีม' }).click();
  await expect(page.getByRole('button', { name: 'ออกจากทีม', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'ลบทีม' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(actions.map((a) => a.action)).toEqual(['create', 'invite', 'member-role', 'transfer']);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // on phones a member opens as a full-screen sheet
  await page.getByRole('button', { name: /^Team member/ }).click();
  await expect(page.getByRole('dialog', { name: 'ข้อมูลสมาชิก' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/groups-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('presence is never shown as online once it stops refreshing', async ({ page }) => {
  const group = initialGroup();
  group.members[0] = { ...group.members[0], isOnline: true, lastSeenAt: minutesAgo(0) };
  group.members.push({ ...member, isOnline: true, lastSeenAt: minutesAgo(0) });
  group.memberCount = 2;
  let fail = false;
  await page.clock.install();
  await page.route('**/api/auth', (route) => route.fulfill({ json: { session: { user } } }));
  await finance(page);
  await page.route('**/api/groups**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('groupId')) return fail ? route.abort() : route.fulfill({ json: { ...group, presenceAt: new Date().toISOString() } });
    return route.fulfill({ json: { systemRole: 'user', groups: [group], invitations: [], total: 1, page: 0 } });
  });
  await openGroups(page);
  await expect(page.getByText('2 ออนไลน์')).toBeVisible();
  fail = true;
  await page.clock.fastForward(120_000);
  await expect(page.getByText('2 ออนไลน์')).toHaveCount(0);
  await expect(page.getByText('ออนไลน์', { exact: true })).toHaveCount(0);
});

test('admin can browse outside groups and manage roles; self demotion removes admin views', async ({
  page,
}) => {
  let role: SystemRole = 'admin',
    memberRole: SystemRole = 'user';
  const group = initialGroup();
  group.myRole = null;
  group.members[0] = { ...group.members[0], userId: '33333333-3333-4333-8333-333333333333', publicId: 'SQ-3333333333', displayName: 'Group creator' };
  await page.route('**/api/auth', (route) => route.fulfill({ json: { session: { user: { ...user, role } } } }));
  await finance(page);
  await page.route('**/api/groups**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has('groupId')) return route.fulfill({ json: group });
    return route.fulfill({ json: { systemRole: role, groups: query.get('scope') === 'all' ? [group] : [], invitations: [], total: query.get('scope') === 'all' ? 1 : 0, page: 0 } });
  });
  await page.route('**/api/admin-users**', (route) => {
    expect(route.request().headers()['x-account-id']).toBe(user.id);
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON();
      if (action.userId === user.id) role = action.role;
      else memberRole = action.role;
      return route.fulfill({ json: { ok: true } });
    }
    const adminQuery = new URL(route.request().url()).searchParams;
    if (adminQuery.get('action') === 'recovery-links') return route.fulfill({ json: { links: [] } });
    if (adminQuery.get('action') === 'deletion-requests') return route.fulfill({ json: { requests: [] } });
    return route.fulfill({ json: { users: [
      { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Leader', role, createdAt: user.created_at },
      { userId: member.userId, publicId: member.publicId, displayName: member.displayName, role: memberRole, createdAt: user.created_at },
    ], total: 2, page: 0 } });
  });
  const pageErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await openGroups(page);
  await page.getByRole('tab', { name: 'ทุกทีม', exact: true }).click();
  await expect(page.getByRole('button', { name: /Design team/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ตั้งค่าทีม' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เชิญสมาชิก' }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Group creator/ }).click();
  await expect(page.getByRole('menuitem', { name: 'โอนตำแหน่งผู้ดูแลทีม' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/groups-admin.png', fullPage: true });
  await page.getByRole('tab', { name: 'จัดการผู้ใช้', exact: true }).click();
  // Promoting to admin was removed from this panel; an admin can still step down.
  await expect(page.getByRole('button', { name: 'ถอดสิทธิ์ Admin' })).toHaveCount(1);
  await page.getByRole('button', { name: 'ถอดสิทธิ์ Admin' }).click();
  await confirmDialog(page);
  await expect(page.getByRole('tab', { name: 'จัดการผู้ใช้', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'สิทธิ์ผู้ใช้ทั้งระบบ' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'ทุกทีม', exact: true })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('pending confirmation and group state cannot carry across accounts', async ({
  page,
}) => {
  let switched = false,
    mutations = 0;
  const group = initialGroup();
  group.members.push({ ...member });
  group.memberCount = 2;
  const second = { ...user, id: member.userId, email: 'other@example.com' };
  await page.route('**/api/auth', (route) => route.fulfill({ json: { session: { user: switched ? second : user } } }));
  await finance(page);
  await page.route('**/api/groups**', (route) => {
    if (route.request().method() === 'POST') {
      mutations++;
      return route.fulfill({ json: { ok: true, groupId: group.id } });
    }
    if (new URL(route.request().url()).searchParams.has('groupId')) return route.fulfill({ json: group });
    return route.fulfill({ json: { systemRole: 'user', groups: switched ? [] : [group], invitations: [], total: switched ? 0 : 1, page: 0 } });
  });
  await openGroups(page);
  await page.getByRole('button', { name: `ตัวเลือกของ ${member.displayName}` }).click();
  await page.getByRole('menuitem', { name: 'โอนตำแหน่งผู้ดูแลทีม' }).click();
  switched = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('tab', { name: 'สมาชิก (2)' })).toHaveCount(0);
  await expect(page.locator('[role=presentation]').getByRole('button', { name: 'ยืนยัน', exact: true })).toHaveCount(0);
  await expect(page.getByText(member.displayName, { exact: true })).toHaveCount(0);
  expect(mutations).toBe(0);
  await expect(page.getByRole('button', { name: /Design team/ })).toHaveCount(0);
});
