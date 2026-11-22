import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError, withGuard } from '../http/guard.js';
import { clientIp } from '../security/ingress.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { makeQuoteToken, readQuoteToken } from '../services/quoteLink.js';
import { quoteAcceptSchema, quoteRevision, type QuoteApproval, type QuoteView } from '../../../shared/quoteApproval.js';
import { validateChanges } from '../../../shared/validation.js';
import type { Invoice } from '../../../shared/types.js';

// ลิงก์ให้ลูกค้ายืนยันใบเสนอราคา (shared/quoteApproval.ts).
//   POST {action:'link', documentId}  signed in: a link for one of the account's own quotations
//   GET  ?t=<token>                   anyone with the link: the quotation and whether it is confirmed
//   POST {action:'accept', token, name, signature, agree}  anyone with the link: confirm it, once
// Personal accounts only for now; a group's documents are not linked.

const linkSchema = z.object({ action: z.literal('link'), documentId: z.string().min(1).max(128) });
const GONE = 'ลิงก์นี้ใช้ไม่ได้แล้ว อาจหมดอายุหรือใบเสนอราคาถูกแก้ไข กรุณาขอลิงก์ใหม่จากผู้ออกเอกสาร';

async function loadQuotation(owner: string, document: string): Promise<{ invoice: Invoice; version: number } | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_invoices').select('data,version').eq('user_id', owner).eq('id', document).maybeSingle();
  if (error) throw error;
  const invoice = data?.data as Invoice | undefined;
  if (!invoice || invoice.documentType !== 'quotation' || typeof data?.version !== 'number') return null;
  return { invoice, version: data.version };
}

/** The document as the client may see it: nothing the account keeps for itself. */
function publicInvoice(invoice: Invoice): Invoice {
  const { approval: _approval, approvalRequestedAt: _requested, ...rest } = invoice;
  return rest as Invoice;
}

async function view(token: string): Promise<{ link: NonNullable<ReturnType<typeof readQuoteToken>>; found: { invoice: Invoice; version: number } }> {
  const link = readQuoteToken(token, sessionSecret());
  if (!link) throw new HttpError(410, GONE);
  const found = await loadQuotation(link.owner, link.document);
  if (!found) throw new HttpError(410, GONE);
  // Confirmed already: the page shows what was confirmed even if the link's version is the confirmed one.
  if (found.invoice.approval?.revision === link.revision) return { link, found };
  if (quoteRevision(found.invoice) !== link.revision) throw new HttpError(410, GONE);
  return { link, found };
}

export default withGuard(async (req, res) => {
  if (req.method === 'GET') {
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    await rateLimit('quote-view-ip', clientIp(req), 60, 600);
    const { found } = await view(token);
    const body: QuoteView = { invoice: publicInvoice(found.invoice), approval: found.invoice.approval ?? null };
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(body);
    return;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const action = (req.body as { action?: unknown } | undefined)?.action;

  if (action === 'link') {
    const user = await requireUser(req, res);
    if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'Account mismatch');
    if (req.headers['x-finance-group'] !== undefined) throw new HttpError(400, 'ลิงก์ให้ลูกค้ายืนยันยังใช้กับบัญชีกลุ่มไม่ได้');
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ไม่พบใบเสนอราคานี้');
    await rateLimit('quote-link', user.id, 60, 3600);
    const found = await loadQuotation(user.id, parsed.data.documentId);
    if (!found) throw new HttpError(404, 'ไม่พบใบเสนอราคานี้ กรุณาบันทึกเอกสารก่อนส่งลิงก์');
    const revision = quoteRevision(found.invoice);
    const token = makeQuoteToken({ owner: user.id, document: parsed.data.documentId, revision }, sessionSecret());
    res.status(200).json({ token, revision, accepted: found.invoice.approval?.revision === revision });
    return;
  }

  if (action === 'accept') {
    const ip = clientIp(req);
    await rateLimit('quote-accept-ip', ip, 10, 600);
    const parsed = quoteAcceptSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'กรุณาพิมพ์ชื่อ เซ็นชื่อ และติ๊กยอมรับก่อนกดยืนยัน');
    const { link, found } = await view(parsed.data.token);
    if (found.invoice.approval) { res.status(200).json({ ok: true, approval: found.invoice.approval, already: true }); return; }
    const approval: QuoteApproval = { status: 'accepted', name: parsed.data.name, signatureUrl: parsed.data.signature, at: new Date().toISOString(), revision: link.revision };
    const changes = validateChanges([{ table: 'cashflow_invoices', id: link.document, op: 'set', version: found.version, data: { ...found.invoice, approval } }]);
    const { data, error } = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: link.owner, p_changes: changes });
    if (error?.code === '40001' || data === false) throw new HttpError(409, 'ใบเสนอราคานี้เพิ่งถูกแก้ไข กรุณาเปิดลิงก์อีกครั้ง');
    if (error) throw error;
    res.status(200).json({ ok: true, approval });
    return;
  }
  throw new HttpError(400, 'Unknown action');
}, { csrf: true });
