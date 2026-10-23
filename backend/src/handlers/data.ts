import { withGuard, HttpError } from "../http/guard.js";
import { requireUser } from "../security/session.js";
import { publicSnapshot } from "../repositories/accounts.js";
import { validateChanges } from "../../../shared/validation.js";
import { getSupabaseAdmin } from "../config/supabase.js";
import { rateLimit } from "../security/rateLimit.js";
import { hasProAccess } from "../services/vault.js";
import {
  claimDocumentSlots,
  documentQuota,
  FREE_DOCUMENT_LIMIT,
  releaseDocumentSlots,
} from "../services/documentQuota.js";
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
      const includeInvoices = req.query.includeInvoices !== "0";
      // These are independent database reads. Run them together so the dashboard
      // does not pay for two cross-region round trips during initial loading.
      const subscriptionRequest = admin
        .from("subscriptions")
        .select("status,plan,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_intro_paid_cycles")
        .eq("user_id", user.id)
        .maybeSingle();
      const groupFinanceRequest = groupId
        ? admin.rpc("cashflow_group_finance_snapshot", {
            p_actor: user.id,
            p_group_id: groupId,
          })
        : Promise.resolve(null);
      const personalFinanceRequest = groupId
        ? Promise.resolve(null)
        : publicSnapshot(user.id);
      // The documents page shows a Free account how many of this month's new documents are left.
      // A failed lookup only hides the counter; saving still checks the quota.
      const quotaRequest = includeInvoices
        ? hasProAccess(user)
            .then((pro) => (pro ? null : documentQuota(user.id)))
            .catch(() => null)
        : Promise.resolve(undefined);
      const [subscription, groupFinance, personalFinance, quota] = await Promise.all([
        subscriptionRequest,
        groupFinanceRequest,
        personalFinanceRequest,
        quotaRequest,
      ]);
      if (subscription.error) throw subscription.error;
      let finance;
      if (groupId) {
        financeError(groupFinance!.error);
        finance = groupFinance!.data;
      } else finance = personalFinance!;
      // Invoices can contain many line items and are only needed by InvoiceTab.
      // Keep the initial dashboard response small; that tab requests the full
      // snapshot when the user opens it.
      if (!includeInvoices) {
        delete finance.snapshot.invoices;
        delete finance.snapshot.issuer_profile;
        delete finance.versions.cashflow_invoices;
        delete finance.versions.cashflow_documents?.issuer_profile;
      }
      const row = subscription.data;
      const publicSubscription = row ? {
        status: row.status,
        plan: row.plan,
        current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end,
        stripe_status: row.stripe_subscription_status,
        has_subscription: Boolean(row.stripe_subscription_id),
        intro_eligible: row.stripe_intro_paid_cycles < 3,
        intro_paid_cycles: row.stripe_intro_paid_cycles,
        managed: Boolean(row.stripe_customer_id && row.stripe_subscription_id),
      } : null;
      const result = {
        ...finance,
        subscription: publicSubscription,
        ...(quota !== undefined ? { document_quota: quota } : {}),
      };
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
    // A Free account may create FREE_DOCUMENT_LIMIT new documents a month (a document row
    // inserted, whatever its type). Slots are taken before the write and given back only if
    // the write does not happen; edits and deletions never touch the count.
    const createdDocuments = changes.filter(
      (c) => c.table === "cashflow_invoices" && c.op === "set" && c.version === null,
    ).length;
    let quotaSlots: string[] | null = null;
    if (createdDocuments > 0 && !(await hasProAccess(user))) {
      quotaSlots = await claimDocumentSlots(user.id, createdDocuments);
      if (!quotaSlots)
        throw new HttpError(
          402,
          `ใช้โควตาออกเอกสารฟรีของเดือนนี้ครบ ${FREE_DOCUMENT_LIMIT} ฉบับแล้ว อัปเกรดเป็น Pro เพื่อออกเอกสารได้ไม่จำกัด`,
          "document_quota_exceeded",
        );
    }
    let data, error;
    try {
      ({ data, error } = groupId
        ? await admin.rpc("cashflow_group_finance_apply", {
            p_actor: user.id,
            p_group_id: groupId,
            p_changes: changes,
          })
        : await admin.rpc("cashflow_apply_changes", {
            p_user_id: user.id,
            p_changes: changes,
          }));
    } catch (failure) {
      if (quotaSlots) await releaseDocumentSlots(quotaSlots);
      throw failure;
    }
    // The personal finance RPC returns false for a stale client baseline after
    // rolling back the batch. Keep the existing conflict response for clients.
    // `null` remains accepted while older deployed SQL still returns void.
    const conflict = !groupId && data === false;
    if (quotaSlots && (error || conflict)) await releaseDocumentSlots(quotaSlots);
    financeError(error);
    if (conflict) {
      res.status(409).json({
        error: "รายการนี้ถูกแก้ไขจากอีกช่องทาง กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง",
      });
      return;
    }
    // The save has happened: a failed recount must not turn it into an error.
    const quotaAfter = quotaSlots ? await documentQuota(user.id).catch(() => null) : null;
    res.json(quotaAfter ? { ok: true, document_quota: quotaAfter } : { ok: true });
  },
  { csrf: true },
);
