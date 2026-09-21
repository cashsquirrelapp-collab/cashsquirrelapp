import { withGuard, HttpError } from "../http/guard.js";
import { requireUser } from "../security/session.js";
import { publicSnapshot } from "../repositories/accounts.js";
import { validateChanges } from "../../../shared/validation.js";
import { getSupabaseAdmin } from "../config/supabase.js";
import { rateLimit } from "../security/rateLimit.js";
import { z } from "zod";
export default withGuard(
  async (req, res) => {
    const user = await requireUser(req, res);
    if (req.headers["x-account-id"] !== user.id)
      throw new HttpError(401, "Account mismatch");
    const admin = getSupabaseAdmin();
    const groupId = req.headers["x-finance-group"];
    if (groupId !== undefined && !z.uuid().safeParse(groupId).success)
      throw new HttpError(400, "กลุ่มไม่ถูกต้อง");
    const financeError = (error: any) => {
      if (error?.code === "42501")
        throw new HttpError(
          403,
          "คุณไม่ได้เป็นสมาชิกกลุ่มนี้แล้ว กรุณาเลือกบัญชีการเงินใหม่",
        );
      if (error?.code === "40001")
        throw new HttpError(
          409,
          "รายการนี้ถูกแก้ไขจากอีกช่องทาง กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง",
        );
      if (error?.code === "54000")
        throw new HttpError(
          413,
          "ข้อมูลการเงินกลุ่มเกินขนาดที่รองรับ กรุณาลดไฟล์แนบ",
        );
      if (error) throw error;
    };
    if (req.method === "GET") {
      await rateLimit("data-read", user.id, 120, 60);
      const subscription = await admin
        .from("subscriptions")
        .select("status,plan,current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (subscription.error) throw subscription.error;
      let finance;
      if (groupId) {
        const r = await admin.rpc("cashflow_group_finance_snapshot", {
          p_actor: user.id,
          p_group_id: groupId,
        });
        financeError(r.error);
        finance = r.data;
      } else finance = await publicSnapshot(user.id);
      const result = { ...finance, subscription: subscription.data };
      if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024)
        throw new HttpError(
          413,
          "ข้อมูลบัญชีมีขนาดใหญ่เกินไป กรุณาติดต่อผู้ดูแลเพื่อแยกไฟล์แนบ",
        );
      res.json(result);
      return;
    }
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    await rateLimit("data-write", user.id, 60, 60);
    let changes;
    try {
      changes = validateChanges(req.body?.changes);
    } catch {
      const isAvatarChange = Array.isArray(req.body?.changes) && req.body.changes.some(
        (change: any) => change?.table === 'cashflow_documents' && change?.id === 'avatar_data_url',
      );
      throw new HttpError(
        400,
        isAvatarChange
          ? 'รูปภาพไม่ถูกต้องหรือมีขนาดใหญ่เกินไป กรุณาเลือก PNG, JPG หรือ WEBP'
          : "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบรายการและจำนวนเงิน",
      );
    }
    if (
      groupId &&
      changes.some(
        (c) => c.table === "cashflow_documents" && c.id === "avatar_data_url",
      )
    )
      throw new HttpError(400, "รูปบัญชีเป็นข้อมูลส่วนตัว");
    const { error } = groupId
      ? await admin.rpc("cashflow_group_finance_apply", {
          p_actor: user.id,
          p_group_id: groupId,
          p_changes: changes,
        })
      : await admin.rpc("cashflow_apply_changes", {
          p_user_id: user.id,
          p_changes: changes,
        });
    financeError(error);
    res.json({ ok: true });
  },
  { csrf: true },
);
