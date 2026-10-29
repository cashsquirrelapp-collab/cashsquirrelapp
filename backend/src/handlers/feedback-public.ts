import { z } from 'zod';
import {
  PUBLIC_FEEDBACK_CATEGORY, PUBLIC_FEEDBACK_IMAGE_MAX_BYTES, PUBLIC_FEEDBACK_KIND_LABEL, imageMatchesType, publicFeedbackBody,
  publicFeedbackSchema, type PublicFeedbackInput,
} from '../../../shared/feedbackPublic.js';
import { appOrigin } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { clientIp } from '../security/ingress.js';
import { rateLimit } from '../security/rateLimit.js';
import { alertFeedback } from '../services/feedbackAlert.js';
import { sendGmailEmail } from '../services/gmail.js';
import { ownerDeliveryDeps } from '../services/ownerAlerts.js';
import { feedbackDbError } from './feedback.js';

// Reports from the public landing page (owner, 2026-10-29: "ให้ผู้ที่ยังไม่ได้เข้าสู่ระบบส่งเรื่องจากหน้าสาธารณะได้ด้วย"),
// through the existing แจ้งปัญหา system, not a second one: the report becomes a conversation in the admin inbox and the
// admins get the usual LINE alert. That system keeps every conversation under an account, so reports from people who
// have not signed in are kept under one account the owner sets aside for them (FEEDBACK_PUBLIC_ACCOUNT_ID); without it
// this answers 503 and the page says so. A picture, which that system cannot hold, is sent to the team's email.

const accountId = z.uuid();

/** Where the team reads pictures: the owner's report addresses, else the app's own mailbox. */
function teamEmails(): string[] {
  const listed = (process.env.ADMIN_REPORT_EMAILS || '').split(/[,\s]+/).map(email => email.trim()).filter(email => email.includes('@'));
  if (listed.length) return listed.slice(0, 5);
  const own = process.env.GMAIL_USER?.trim();
  return own && own.includes('@') ? [own] : [];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

async function sendPicture(threadId: string, input: PublicFeedbackInput, image: { name: string; type: string; data: string }): Promise<boolean> {
  const to = teamEmails();
  if (!to.length) return false;
  const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg';
  const subject = `ภาพประกอบเรื่องจากหน้าเว็บ · ${PUBLIC_FEEDBACK_KIND_LABEL[input.kind]} · ${threadId.slice(0, 8)}`;
  const html = `<p>ภาพประกอบของเรื่องที่ส่งจากหน้าเว็บ (ผู้ส่งยังไม่ได้เข้าสู่ระบบ)</p>
<p><b>หัวข้อ:</b> ${escapeHtml(input.subject)}<br><b>อีเมลติดต่อกลับ:</b> ${escapeHtml(input.email || 'ไม่ได้ให้ไว้')}</p>
<p>อ่านเรื่องทั้งหมดได้ที่ แอดมิน › ข้อความจากผู้ใช้: ${escapeHtml(`${appOrigin()}/adminDashboard?view=feedback`)}</p>`;
  const outcomes = await Promise.all(to.map(address => sendGmailEmail(address, subject, html, [{ filename: `report-${threadId.slice(0, 8)}.${extension}`, content: image.data }]).catch(() => false)));
  return outcomes.some(Boolean);
}

export default withGuard(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const parsed = publicFeedbackSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'กรุณากรอกหัวข้อและรายละเอียดให้ครบ แล้วลองส่งอีกครั้ง');
  const input = parsed.data;
  const ip = clientIp(req);
  await rateLimit('feedback-public-ip', ip, 5, 600);
  await rateLimit('feedback-public-ip-day', ip, 20, 86400);
  await rateLimit('feedback-public-all', 'all', 60, 3600);
  // Only bots fill the hidden field: they are answered as if received, and nothing is kept.
  if (input.website) { res.status(201).json({ ok: true }); return; }

  const owner = accountId.safeParse(process.env.FEEDBACK_PUBLIC_ACCOUNT_ID?.trim());
  if (!owner.success) throw new HttpError(503, 'ตอนนี้ยังรับเรื่องจากหน้าเว็บไม่ได้ กรุณาลองใหม่ภายหลัง หรืออีเมลหาเรา');

  let image: { name: string; type: string; data: string } | null = null;
  if (input.image) {
    const bytes = Buffer.from(input.image.data, 'base64');
    if (!bytes.length || bytes.length > PUBLIC_FEEDBACK_IMAGE_MAX_BYTES) throw new HttpError(413, 'ภาพใหญ่เกิน 2 MB กรุณาเลือกภาพที่เล็กลง');
    if (!imageMatchesType(bytes, input.image.type)) throw new HttpError(400, 'ไฟล์นี้ไม่ใช่ภาพ PNG, JPG หรือ WebP');
    image = input.image;
  }

  const body = publicFeedbackBody(input, Boolean(image));
  const category = PUBLIC_FEEDBACK_CATEGORY[input.kind];
  const result = await getSupabaseAdmin().rpc('cashflow_feedback_mutate', { p_actor: owner.data, p_action: 'create', p_input: { body, category } });
  if (result.error) feedbackDbError(result.error);
  const threadId = (result.data as { threadId?: string } | null)?.threadId ?? '';

  // The admins hear about it as about any new conversation; waited for briefly, and never fails the report.
  if (threadId) {
    const alert = alertFeedback({ threadId, action: 'create', body, category, fromAdmin: false }, ownerDeliveryDeps());
    await Promise.race([alert, new Promise(resolve => setTimeout(resolve, 2500))]);
  }
  const imageDelivered = image && threadId ? await sendPicture(threadId, input, image).catch(() => false) : undefined;
  res.status(201).json({ ok: true, ...(image ? { imageDelivered: Boolean(imageDelivered) } : {}) });
}, { csrf: true });
