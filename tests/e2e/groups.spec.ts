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
  await page.route('**/api/data', (route) =>
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
  await page
    .locator('aside')
    .getByRole('button', { name: 'กลุ่ม & สมาชิก' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'กลุ่มของเรา' }),
  ).toBeVisible();
}

test('create, invite, promote and transfer leadership; membership controls update after transfer on mobile', async ({
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
        group = {
          ...initialGroup(),
          id: action.groupId,
          name: action.name,
          description: action.description,
        };
      if (action.action === 'invite')
        group!.invitations = [
          {
            id,
            groupId: group!.id,
            groupName: group!.name,
            publicId: member.publicId,
            displayName: member.displayName,
            expiresAt: '2027-01-01T00:00:00Z',
          },
        ];
      if (action.action === 'member-role') {
        group!.members.find((m) => m.userId === action.userId)!.role =
          action.role;
        group!.leaderCount = group!.members.filter(
          (m) => m.role === 'leader',
        ).length;
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
    if (new URL(route.request().url()).searchParams.has('memberSearch'))
      return route.fulfill({json:{users:[member]}});
    if (new URL(route.request().url()).searchParams.has('groupId'))
      return route.fulfill({ json: group });
    return route.fulfill({
      json: {
        systemRole: 'user',
        groups: group ? [group] : [],
        invitations: [],
        total: group ? 1 : 0,
        page: 0,
      },
    });
  });
  await openGroups(page);
  await page.getByRole('button', { name: 'สร้างกลุ่ม', exact: true }).click();
  await page.getByLabel('ชื่อกลุ่ม', { exact: true }).fill('Design team');
  await page.getByLabel('รายละเอียด', { exact: true }).fill('Work together');
  await page.getByRole('button', { name: 'ยืนยันสร้างกลุ่ม' }).click();
  await expect(
    page.getByRole('heading', { name: 'สมาชิกในกลุ่ม (1)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'ออกจากกลุ่ม', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('ค้นหาสมาชิกด้วยชื่อหรือ User ID').fill(member.publicId);
  await page.getByRole('button', { name: 'ค้นหา' }).click();
  await page.getByRole('button', { name: 'เชิญ', exact:true }).click();
  await expect(
    page.getByRole('heading', { name: 'คำเชิญที่รออยู่' }),
  ).toBeVisible();
  group!.members.push({ ...member });
  group!.memberCount = 2;
  await page.getByRole('button', { name: 'รีเฟรชกลุ่ม' }).click();
  await expect(
    page.getByRole('heading', { name: 'สมาชิกในกลุ่ม (2)' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มเป็นหัวหน้า' }).click();
  await page.getByRole('button', { name: 'ตกลง', exact: true }).click();
  await expect.poll(() => group!.leaderCount).toBe(2);
  await expect(page.getByRole('button', { name: 'ลดเป็นลูกน้อง' })).toHaveCount(
    2,
  );
  await page.getByRole('button', { name: 'โอนหัวหน้า' }).click();
  await expect(
    page.getByText(/คุณจะกลับเป็นลูกน้องและเสียสิทธิ์/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ตกลง', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'แก้ไขกลุ่ม', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'นำออก', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'ออกจากกลุ่ม', exact: true }),
  ).toBeEnabled();
  expect(actions.map((a) => a.action)).toEqual([
    'create',
    'invite',
    'member-role',
    'transfer',
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/groups-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('admin can browse outside groups and manage roles; self demotion removes admin views', async ({
  page,
}) => {
  let role: SystemRole = 'admin',
    memberRole: SystemRole = 'user';
  const group = initialGroup();
  group.myRole = null;
  group.members[0] = { ...group.members[0], userId: '33333333-3333-4333-8333-333333333333', publicId: 'SQ-3333333333', displayName: 'Group creator' };
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { session: { user: { ...user, role } } } }),
  );
  await finance(page);
  await page.route('**/api/groups**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has('groupId')) return route.fulfill({ json: group });
    return route.fulfill({
      json: {
        systemRole: role,
        groups: query.get('scope') === 'all' ? [group] : [],
        invitations: [],
        total: query.get('scope') === 'all' ? 1 : 0,
        page: 0,
      },
    });
  });
  await page.route('**/api/admin-users**', (route) => {
    expect(route.request().headers()['x-account-id']).toBe(user.id);
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON();
      if (action.userId === user.id) role = action.role;
      else memberRole = action.role;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: {
        users: [
          {
            userId: user.id,
            publicId: 'SQ-1111111111',
            displayName: 'Leader',
            role,
            createdAt: user.created_at,
          },
          {
            userId: member.userId,
            publicId: member.publicId,
            displayName: member.displayName,
            role: memberRole,
            createdAt: user.created_at,
          },
        ],
        total: 2,
        page: 0,
      },
    });
  });
  await openGroups(page);
  await page.getByRole('button', { name: 'ทุกกลุ่ม', exact: true }).click();
  await page.getByRole('button', { name: /Design team/ }).click();
  await expect(
    page.getByRole('button', { name: 'แก้ไขกลุ่ม', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'โอนหัวหน้า' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/groups-admin.png', fullPage: true });
  await page.getByRole('button', { name: 'จัดการผู้ใช้', exact: true }).click();
  await page.getByRole('button', { name: 'ให้สิทธิ์ admin' }).click();
  await page.getByRole('button', { name: 'ตกลง', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'เปลี่ยนเป็น user' }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'เปลี่ยนเป็น user' }).first().click();
  await page.getByRole('button', { name: 'ตกลง', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'จัดการผู้ใช้', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'สิทธิ์ผู้ใช้ทั้งระบบ' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'ทุกกลุ่ม', exact: true }),
  ).toHaveCount(0);
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
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { session: { user: switched ? second : user } } }),
  );
  await finance(page);
  await page.route('**/api/groups**', (route) => {
    if (route.request().method() === 'POST') {
      mutations++;
      return route.fulfill({ json: { ok: true, groupId: group.id } });
    }
    if (new URL(route.request().url()).searchParams.has('groupId'))
      return route.fulfill({ json: group });
    return route.fulfill({
      json: {
        systemRole: 'user',
        groups: switched ? [] : [group],
        invitations: [],
        total: switched ? 0 : 1,
        page: 0,
      },
    });
  });
  await openGroups(page);
  await page.getByRole('button', { name: /Design team/ }).click();
  await page.getByRole('button', { name: 'โอนหัวหน้า' }).click();
  switched = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(second.email).first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'สมาชิกในกลุ่ม (2)' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ตกลง', exact: true })).toHaveCount(0);
  await expect(page.getByText(member.displayName, { exact: true })).toHaveCount(0);
  expect(mutations).toBe(0);
  await expect(page.getByRole('button', { name: /Design team/ })).toHaveCount(
    0,
  );
});
