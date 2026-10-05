import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { systemRoleActionSchema, type AdminAccount } from '../../../shared/groups.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { appOrigin } from '../config/env.js';
import { HttpError, withGuard } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { seal, unseal } from '../security/cookies.js';
import { systemRole } from '../repositories/roles.js';
import { challengeHash, rateLimit } from '../security/rateLimit.js';
import { groupDbError } from './groups.js';
import { loadPresenceByUserId, ONLINE_WINDOW_MS } from '../repositories/presence.js';

const RECOVERY_LINK_TTL_MS = 60 * 60 * 1000;
const FREE_TRIAL_DAYS = 14;
const createRecoveryLinkSchema = z.object({ action: z.literal('create-recovery-link') }).strict();
const setProAccessSchema = z.object({
  action: z.literal('set-pro-access'),
  userId: z.uuid(),
  enabled: z.boolean(),
}).strict();
const dashboardDetailsQuerySchema = z.object({
  action: z.literal('dashboard-details'),
  section: z.enum(['accounts', 'admins', 'groups', 'pro', 'invitations', 'paused', 'deletions']),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});

async function listDeletionRequests(db: ReturnType<typeof getSupabaseAdmin>) {
  const now = new Date().toISOString();
  const pending = await db.from('cashflow_account_pauses')
    .select('user_id,paused_at,delete_after')
    .eq('closure_kind', 'deletion').eq('state', 'paused').gt('delete_after', now)
    .order('paused_at', { ascending: false }).limit(100);
  if (pending.error) throw pending.error;
  const requests = await Promise.all((pending.data || []).map(async row => {
    const account = await db.auth.admin.getUserById(row.user_id);
    if (account.error) throw account.error;
    if (!account.data.user?.email) return null;
    return {
      userId: row.user_id,
      email: account.data.user.email,
      requestedAt: row.paused_at,
      expiresAt: row.delete_after,
    };
  }));
  return { requests: requests.filter(request => request !== null) };
}

export default withGuard(
  async (req, res) => {
    if (!['GET', 'POST'].includes(req.method || ''))
      throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req, res);
    if (req.headers['x-account-id'] !== user.id)
      throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
    if ((await systemRole(user.id)) !== 'admin')
      throw new HttpError(403, 'เฉพาะ admin เท่านั้น');
    await rateLimit('admin-users', user.id, 30, 60);
    const db = getSupabaseAdmin();
    if (req.method === 'GET') {
      if (req.query.action === 'dashboard') {
        const now = new Date().toISOString();
        const [accounts, admins, groups, proAccounts, invitations, pauses, deletions] = await Promise.all([
          db.from('cashflow_user_roles').select('user_id', { count: 'exact', head: true }),
          db.from('cashflow_user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin'),
          db.from('cashflow_groups').select('id', { count: 'exact', head: true }),
          db.from('subscriptions').select('user_id', { count: 'exact', head: true }).eq('status', 'active').or(`plan.eq.admin_grant,current_period_end.gt.${now}`),
          db.from('cashflow_group_invitations').select('id', { count: 'exact', head: true }).eq('status', 'pending').gt('expires_at', now),
          db.from('cashflow_account_pauses').select('user_id', { count: 'exact', head: true }).eq('closure_kind', 'pause').eq('state', 'paused').gt('delete_after', now),
          db.from('cashflow_account_pauses').select('user_id', { count: 'exact', head: true }).eq('closure_kind', 'deletion').eq('state', 'paused').gt('delete_after', now),
        ]);
        for (const result of [accounts, admins, groups, proAccounts, invitations, pauses, deletions]) {
          if (result.error) throw result.error;
        }
        res.json({
          totalAccounts: accounts.count || 0,
          adminAccounts: admins.count || 0,
          totalGroups: groups.count || 0,
          proAccounts: proAccounts.count || 0,
          pendingInvitations: invitations.count || 0,
          pausedAccounts: pauses.count || 0,
          pendingDeletions: deletions.count || 0,
        });
        return;
      }
      if (req.query.action === 'dashboard-details') {
        const parsed = dashboardDetailsQuerySchema.safeParse(req.query);
        if (!parsed.success) throw new HttpError(400, 'ตัวกรองข้อมูลแดชบอร์ดไม่ถูกต้อง');
        const { section, page } = parsed.data;
        const now = new Date().toISOString();

        if (section === 'groups') {
          const result = await db.rpc('cashflow_groups_snapshot', {
            p_actor: user.id,
            p_scope: 'all',
            p_page: page,
          });
          if (result.error) groupDbError(result.error);
          const snapshot = result.data as { groups?: unknown[]; total?: number };
          res.json({
            section,
            total: snapshot.total || 0,
            page,
            pageSize: 20,
            groups: snapshot.groups || [],
          });
          return;
        }

        if (section === 'invitations') {
          const pageSize = 25;
          const result = await db.from('cashflow_group_invitations')
            .select('id,group_id,email,created_at,expires_at', { count: 'exact' })
            .eq('status', 'pending').gt('expires_at', now)
            .order('created_at', { ascending: false }).order('id', { ascending: false })
            .range(page * pageSize, page * pageSize + pageSize - 1);
          if (result.error) throw result.error;
          const rows = result.data || [];
          const groupIds = [...new Set(rows.map(row => row.group_id))];
          const groups = groupIds.length
            ? await db.from('cashflow_groups').select('id,name').in('id', groupIds)
            : { data: [], error: null };
          if (groups.error) throw groups.error;
          const groupNames = new Map((groups.data || []).map(group => [group.id, group.name] as const));
          res.json({
            section,
            total: result.count || 0,
            page,
            pageSize,
            invitations: rows.map(row => ({
              id: row.id,
              groupId: row.group_id,
              groupName: groupNames.get(row.group_id) || 'กลุ่มที่ถูกลบ',
              email: row.email,
              createdAt: row.created_at,
              expiresAt: row.expires_at,
            })),
          });
          return;
        }

        const pageSize = 25;
        const from = page * pageSize;
        const to = from + pageSize - 1;
        let sourceRows: {
          user_id: string;
          role?: string;
          status?: string;
          plan?: string | null;
          current_period_end?: string | null;
          closure_kind?: 'pause' | 'deletion';
          paused_at?: string | null;
          delete_after?: string | null;
        }[] = [];
        let total = 0;

        if (section === 'accounts' || section === 'admins') {
          let query = db.from('cashflow_user_roles')
            .select('user_id,role,updated_at', { count: 'exact' });
          if (section === 'admins') query = query.eq('role', 'admin');
          const result = await query.order('updated_at', { ascending: false })
            .order('user_id', { ascending: true }).range(from, to);
          if (result.error) throw result.error;
          sourceRows = result.data || [];
          total = result.count || 0;
        } else if (section === 'pro') {
          const result = await db.from('subscriptions')
            .select('user_id,status,plan,current_period_end', { count: 'exact' })
            .eq('status', 'active').or(`plan.eq.admin_grant,current_period_end.gt.${now}`)
            .order('current_period_end', { ascending: true }).order('user_id', { ascending: true })
            .range(from, to);
          if (result.error) throw result.error;
          sourceRows = result.data || [];
          total = result.count || 0;
        } else {
          const closureKind = section === 'paused' ? 'pause' : 'deletion';
          const result = await db.from('cashflow_account_pauses')
            .select('user_id,closure_kind,paused_at,delete_after', { count: 'exact' })
            .eq('closure_kind', closureKind).eq('state', 'paused').gt('delete_after', now)
            .order('paused_at', { ascending: false }).order('user_id', { ascending: true })
            .range(from, to);
          if (result.error) throw result.error;
          sourceRows = result.data || [];
          total = result.count || 0;
        }

        const userIds = sourceRows.map(row => row.user_id);
        if (userIds.length === 0) {
          res.json({ section, total, page, pageSize, accounts: [] });
          return;
        }
        const [profiles, roles, presenceById] = await Promise.all([
          db.from('cashflow_profiles').select('user_id,public_id,display_name,created_at').in('user_id', userIds),
          db.from('cashflow_user_roles').select('user_id,role').in('user_id', userIds),
          loadPresenceByUserId(db, userIds),
        ]);
        if (profiles.error) throw profiles.error;
        if (roles.error) throw roles.error;
        const subscriptionsResult = section === 'accounts'
          ? await db.from('subscriptions').select('user_id,status,plan,current_period_end').in('user_id', userIds)
          : { data: [], error: null };
        if (subscriptionsResult.error) throw subscriptionsResult.error;
        const profilesById = new Map((profiles.data || []).map(profile => [profile.user_id, profile] as const));
        const rolesById = new Map((roles.data || []).map(role => [role.user_id, role.role] as const));
        const subscriptionsById = new Map((subscriptionsResult.data || []).map(subscription => [subscription.user_id, subscription] as const));
        const accounts = sourceRows.map(row => {
          const profile = profilesById.get(row.user_id);
          const subscription = section === 'pro' ? row : subscriptionsById.get(row.user_id);
          const lastSeenAt = presenceById.get(row.user_id) || null;
          let proStatus: 'admin' | 'paid' | 'trial' | 'revoked' | 'none' = 'none';
          if (subscription?.plan === 'admin_revoked') proStatus = 'revoked';
          else if (subscription?.status === 'active' && subscription.plan === 'admin_grant') proStatus = 'admin';
          else if (subscription?.status === 'active' && subscription.current_period_end && new Date(subscription.current_period_end).getTime() > Date.now()) proStatus = 'paid';
          else if (profile?.created_at && new Date(profile.created_at).getTime() + FREE_TRIAL_DAYS * 86400000 > Date.now()) proStatus = 'trial';
          return {
            userId: row.user_id,
            publicId: profile?.public_id || '—',
            displayName: profile?.display_name || 'Unknown account',
            role: (row.role || rolesById.get(row.user_id) || 'user') as 'admin' | 'user',
            createdAt: profile?.created_at || '',
            isOnline: !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
            lastSeenAt,
            ...(section === 'accounts' || section === 'pro' ? {
              proStatus,
              proExpiresAt: proStatus === 'paid'
                ? subscription?.current_period_end || null
                : proStatus === 'trial' && profile?.created_at
                  ? new Date(new Date(profile.created_at).getTime() + FREE_TRIAL_DAYS * 86400000).toISOString()
                  : null,
              plan: subscription?.plan,
              currentPeriodEnd: subscription?.current_period_end,
            } : {}),
            ...(section === 'paused' || section === 'deletions' ? {
              closureKind: row.closure_kind,
              pausedAt: row.paused_at,
              deleteAfter: row.delete_after,
            } : {}),
          };
        });
        res.json({ section, total, page, pageSize, accounts });
        return;
      }
      if (req.query.action === 'deletion-requests') {
        res.json(await listDeletionRequests(db));
        return;
      }
      if (req.query.action === 'recovery-links') {
        const now = new Date().toISOString();
        const firstPage = await db.from('cashflow_account_recovery_links')
          .select('id,token_ciphertext,created_at,expires_at,consumed_at,revoked_at,recovered_user_id,recovered_email')
          .gt('expires_at', now)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(0, 499);
        if (firstPage.error) throw firstPage.error;
        const rows = [...(firstPage.data || [])];
        for (let offset = 500; (firstPage.data || []).length === 500; offset += 500) {
          const nextPage = await db.from('cashflow_account_recovery_links')
            .select('id,token_ciphertext,created_at,expires_at,consumed_at,revoked_at,recovered_user_id,recovered_email')
            .gt('expires_at', now)
            .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
          if (nextPage.error) throw nextPage.error;
          rows.push(...(nextPage.data || []));
          if ((nextPage.data || []).length < 500) break;
        }
        const recoveredUserIds = [...new Set(rows.map(row => row.recovered_user_id).filter((id): id is string => !!id))];
        const profiles = recoveredUserIds.length
          ? await db.from('cashflow_profiles').select('user_id,public_id,display_name').in('user_id', recoveredUserIds)
          : { data: [], error: null };
        if (profiles.error) throw profiles.error;
        const profilesById = new Map((profiles.data || []).map(profile => [profile.user_id, profile] as const));
        const includeUrls = req.query.includeUrls === '1';
        res.json({ links: rows.map(row => {
          const token = includeUrls && row.token_ciphertext ? unseal<string>(row.token_ciphertext) : null;
          let url: string | null = null;
          if (token) {
            const recoveryUrl = new URL('/login', appOrigin());
            recoveryUrl.searchParams.set('r', token);
            url = recoveryUrl.toString();
          }
          const profile = row.recovered_user_id ? profilesById.get(row.recovered_user_id) : undefined;
          return {
            id: row.id,
            url,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            consumedAt: row.consumed_at,
            revokedAt: row.revoked_at,
            recoveredUserId: row.recovered_user_id,
            recoveredEmail: row.recovered_email,
            recoveredPublicId: profile?.public_id || null,
            recoveredDisplayName: profile?.display_name || null,
          };
        }) });
        return;
      }
      const query = z
        .object({
          search: z.string().trim().max(254).default(''),
          page: z.coerce.number().int().min(0).max(10000).default(0),
        })
        .safeParse(req.query);
      if (!query.success) throw new HttpError(400, 'ตัวกรองผู้ใช้ไม่ถูกต้อง');
      const result = await db.rpc('cashflow_admin_accounts', {
        p_actor: user.id,
        p_search: query.data.search,
        p_page: query.data.page,
      });
      if (result.error) groupDbError(result.error);
      const accounts = result.data as { users: AdminAccount[]; total: number; page: number };
      const userIds = (accounts.users || []).map(account => account.userId);
      const [subscriptionResult, presenceById] = await Promise.all([
        userIds.length
          ? db.from('subscriptions')
            .select('user_id,status,plan,current_period_end').in('user_id', userIds)
          : Promise.resolve({ data: [], error: null }),
        loadPresenceByUserId(db, userIds),
      ]);
      if (subscriptionResult.error) throw subscriptionResult.error;
      const subscriptions = new Map((subscriptionResult.data || []).map(subscription => [subscription.user_id, subscription] as const));
      const now = Date.now();
      res.json({
        ...accounts,
        users: (accounts.users || []).map(account => {
          const subscription = subscriptions.get(account.userId);
          const lastSeenAt = presenceById.get(account.userId) || null;
          let proStatus: 'admin' | 'paid' | 'trial' | 'revoked' | 'none' = 'none';
          if (subscription?.plan === 'admin_revoked') proStatus = 'revoked';
          else if (subscription?.status === 'active' && subscription.plan === 'admin_grant') proStatus = 'admin';
          else if (subscription?.status === 'active' && subscription.current_period_end && new Date(subscription.current_period_end).getTime() > now) proStatus = 'paid';
          else if (new Date(account.createdAt).getTime() + FREE_TRIAL_DAYS * 86400000 > now) proStatus = 'trial';
          const proExpiresAt = proStatus === 'paid'
            ? subscription?.current_period_end || null
            : proStatus === 'trial'
              ? new Date(new Date(account.createdAt).getTime() + FREE_TRIAL_DAYS * 86400000).toISOString()
              : null;
          return {
            ...account,
            proStatus,
            proExpiresAt,
            isOnline: !!lastSeenAt && now - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
            lastSeenAt,
          };
        }),
      });
      return;
    }
    if (req.body?.action === 'set-pro-access') {
      const parsed = setProAccessSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'ข้อมูลแพ็กเกจ Pro ไม่ถูกต้อง');
      const { userId, enabled } = parsed.data;
      const [target, existing] = await Promise.all([
        db.auth.admin.getUserById(userId),
        db.from('subscriptions')
          .select('stripe_customer_id,stripe_subscription_id,current_period_end')
          .eq('user_id', userId).maybeSingle(),
      ]);
      if (target.error) throw target.error;
      if (!target.data.user) throw new HttpError(404, 'ไม่พบบัญชีผู้ใช้');
      if (existing.error) throw existing.error;
      const saved = await db.from('subscriptions').upsert({
        user_id: userId,
        status: enabled ? 'active' : 'canceled',
        plan: enabled ? 'admin_grant' : 'admin_revoked',
        current_period_end: existing.data?.current_period_end || null,
        stripe_customer_id: existing.data?.stripe_customer_id || null,
        stripe_subscription_id: existing.data?.stripe_subscription_id || null,
        updated_at: new Date().toISOString(),
      });
      if (saved.error) throw saved.error;
      res.json({ ok: true });
      return;
    }
    if (req.body?.action === 'create-recovery-link') {
      const parsed = createRecoveryLinkSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'ข้อมูลสร้างลิงก์กู้คืนไม่ถูกต้อง');
      const issuedAt = Date.now();
      const expiresAt = new Date(issuedAt + RECOVERY_LINK_TTL_MS).toISOString();
      // 144 bits of entropy keeps the bearer link compact while remaining
      // infeasible to guess; store a keyed hash for validation and ciphertext
      // so this admin can restore the active URL in the dashboard.
      const token = randomBytes(18).toString('base64url');
      const tokenHash = challengeHash(`account-recovery-link:${token}`);
      const expired = await db.from('cashflow_account_recovery_links')
        .delete().lte('expires_at', new Date(issuedAt).toISOString());
      if (expired.error) throw expired.error;
      const saved = await db.from('cashflow_account_recovery_links').insert({
        token_hash: tokenHash, token_ciphertext: seal(token), created_by: user.id, expires_at: expiresAt,
      }).select('id,created_at').single();
      if (saved.error) throw saved.error;
      const url = new URL('/login', appOrigin());
      url.searchParams.set('r', token);
      res.json({ id: saved.data.id, url: url.toString(), createdAt: saved.data.created_at, expiresAt, consumedAt: null, revokedAt: null,
        recoveredUserId: null, recoveredEmail: null, recoveredPublicId: null, recoveredDisplayName: null });
      return;
    }
    const action = systemRoleActionSchema.safeParse(req.body);
    if (!action.success) throw new HttpError(400, 'ข้อมูลสิทธิ์ไม่ถูกต้อง');
    if (action.data.role !== 'user')
      throw new HttpError(403, 'ไม่สามารถเพิ่มสิทธิ์ Admin ผ่านหน้านี้ได้');
    const result = await db.rpc('cashflow_set_system_role', {
      p_actor: user.id,
      p_target: action.data.userId,
      p_role: action.data.role,
    });
    if (result.error) groupDbError(result.error);
    res.json({ ok: true });
  },
  { csrf: true },
);
