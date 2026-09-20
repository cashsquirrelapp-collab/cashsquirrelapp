import { z } from 'zod';
import { systemRoleActionSchema } from '../../../shared/groups.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';
import { groupDbError } from './groups.js';

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
      res.json(result.data);
      return;
    }
    const action = systemRoleActionSchema.safeParse(req.body);
    if (!action.success) throw new HttpError(400, 'ข้อมูลสิทธิ์ไม่ถูกต้อง');
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
