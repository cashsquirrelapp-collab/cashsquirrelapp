import { withGuard, HttpError } from '../http/guard.js';
import { appOrigin, required, supabaseUrl } from '../config/env.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
export function reportMonth(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input)) throw new HttpError(400, 'เดือนรายงานไม่ถูกต้อง');
  return input;
}
export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (req.query.u !== undefined) throw new HttpError(400, 'กรุณาใช้ลิงก์รายงานใหม่ที่ต้องเข้าสู่ระบบ');
  const month = reportMonth(req.query.month);
  let user;
  try { user = await requireUser(req, res); }
  catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    const params = new URLSearchParams({ report: month });
    if (typeof req.query.account === 'string') params.set('account', req.query.account);
    res.status(302); res.setHeader('Location', `${appOrigin()}/app?${params}`); res.end(); return;
  }
  if (req.query.account !== undefined && req.query.account !== user.id) throw new HttpError(403, 'รายงานนี้เป็นของบัญชีอื่น กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของรายงาน');
  await rateLimit('report-download', user.id, 10, 60);
  // The target is constructed from the authenticated owner, never a caller URL.
  const path = `/storage/v1/object/authenticated/monthly-reports/${user.id}/${month}.xlsx`;
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const upstream = await fetch(new URL(path, supabaseUrl()), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  if (!upstream.ok) throw new HttpError(upstream.status === 404 ? 404 : 502, 'ไม่พบรายงานหรือบริการไม่พร้อมใช้งาน');
  const limit = 4 * 1024 * 1024;
  if (Number(upstream.headers.get('content-length')) > limit) throw new HttpError(502, 'File too large');
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const part of upstream.body as any) { size += part.length; if (size > limit) throw new HttpError(502, 'File too large'); chunks.push(part); }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cash-squirrel-${month}.xlsx"`);
  res.setHeader('Referrer-Policy', 'no-referrer'); res.send(Buffer.concat(chunks));
});
