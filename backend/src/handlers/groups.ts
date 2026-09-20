import { z } from 'zod';
import { groupActionSchema } from '../../../shared/groups.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';

export function groupDbError(error: {
  code?: string;
  message?: string;
}): never {
  if (error.code === '42501')
    throw new HttpError(403, 'คุณไม่มีสิทธิ์ทำรายการนี้');
  if (error.code === 'P0002')
    throw new HttpError(404, 'ไม่พบกลุ่ม สมาชิก หรือคำเชิญที่เข้าถึงได้');
  const conflicts: Record<string, string> = {
    last_leader:
      'กลุ่มต้องมีหัวหน้าอย่างน้อย 1 คน กรุณาโอนหรือเพิ่มหัวหน้าก่อน',
    last_admin: 'ระบบต้องมี admin อย่างน้อย 1 คน',
    already_member: 'ผู้ใช้นี้เป็นสมาชิกแล้ว',
    invitation_unavailable: 'คำเชิญหมดอายุ ถูกยกเลิก หรือใช้งานไปแล้ว',
    verified_email_required: 'กรุณายืนยันอีเมลบัญชีก่อนรับคำเชิญ',
    group_limit: 'ถึงจำนวนกลุ่มสูงสุดแล้ว',
    member_limit: 'ถึงจำนวนสมาชิกหรือกลุ่มสูงสุดแล้ว',
    invitation_limit: 'คำเชิญที่รออยู่เต็มแล้ว',
    use_leave: 'กรุณาใช้ปุ่มออกจากกลุ่มสำหรับบัญชีตัวเอง',
    same_member: 'กรุณาเลือกสมาชิกคนอื่น',
    duplicate_group: 'ไม่สามารถใช้รหัสกลุ่มนี้ได้',
  };
  if (
    error.code === 'P0001' &&
    error.message &&
    Object.hasOwn(conflicts, error.message)
  )
    throw new HttpError(409, conflicts[error.message]);
  if (error.code === '23514')
    throw new HttpError(409, 'ข้อมูลไม่ตรงตามเงื่อนไขของกลุ่ม');
  throw error;
}

export default withGuard(
  async (req, res) => {
    if (!['GET', 'POST'].includes(req.method || ''))
      throw new HttpError(405, 'Method not allowed');
    const user = await requireUser(req, res);
    if (req.headers['x-account-id'] !== user.id)
      throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
    const db = getSupabaseAdmin();
    if (req.method === 'GET') {
      await rateLimit('groups-read', user.id, 90, 60);
      if (req.query.memberSearch !== undefined) {
        const query=z.object({groupId:z.uuid(),memberSearch:z.string().trim().min(2).max(60)}).safeParse(req.query);
        if (!query.success) throw new HttpError(400,'กรุณาค้นหาอย่างน้อย 2 ตัวอักษร');
        const result=await db.rpc('cashflow_group_user_search',{p_actor:user.id,p_group_id:query.data.groupId,p_query:query.data.memberSearch});
        if (result.error) groupDbError(result.error);
        res.json({users:result.data}); return;
      }
      if (req.query.groupId !== undefined) {
        const id = z.uuid().safeParse(req.query.groupId);
        if (!id.success) throw new HttpError(400, 'รหัสกลุ่มไม่ถูกต้อง');
        const result = await db.rpc('cashflow_group_detail', {
          p_actor: user.id,
          p_group_id: id.data,
        });
        if (result.error) groupDbError(result.error);
        res.json(result.data);
        return;
      }
      const query = z
        .object({
          scope: z.enum(['mine', 'all']).default('mine'),
          page: z.coerce.number().int().min(0).max(10000).default(0),
        })
        .safeParse(req.query);
      if (!query.success) throw new HttpError(400, 'ตัวกรองกลุ่มไม่ถูกต้อง');
      const result = await db.rpc('cashflow_groups_snapshot', {
        p_actor: user.id,
        p_scope: query.data.scope,
        p_page: query.data.page,
      });
      if (result.error) groupDbError(result.error);
      res.json(result.data);
      return;
    }
    const action = groupActionSchema.safeParse(req.body);
    if (!action.success) throw new HttpError(400, 'ข้อมูลกลุ่มไม่ถูกต้อง');
    await rateLimit('groups-write', user.id, 30, 60);
    if (action.data.action === 'create')
      await rateLimit('groups-create', user.id, 10, 3600);
    if (action.data.action === 'invite') {
      const invited=await db.rpc('cashflow_group_invite_account',{p_actor:user.id,p_group_id:action.data.groupId,p_target:action.data.userId});
      if (invited.error) groupDbError(invited.error);
      res.json({ok:true,groupId:action.data.groupId}); return;
    }
    if (action.data.action === 'accept' || action.data.action === 'decline') {
      const answered=await db.rpc('cashflow_group_invitation_respond',{p_actor:user.id,p_invitation_id:action.data.invitationId,p_accept:action.data.action==='accept'});
      if (answered.error) groupDbError(answered.error);
      res.json({ok:true,groupId:answered.data}); return;
    }
    const result = await db.rpc('cashflow_group_mutate', {
      p_actor: user.id,
      p_action: action.data.action,
      p_input: action.data,
    });
    if (result.error) groupDbError(result.error);
    res.json({ ok: true, groupId: result.data });
  },
  { csrf: true },
);
