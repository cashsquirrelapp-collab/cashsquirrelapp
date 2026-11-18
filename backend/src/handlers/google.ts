import { z } from 'zod';
import { googleStatus, sheetMapSchema, type GoogleRecord } from '../../../shared/googleSheets.js';
import { labState, type LabFeatureId } from '../../../shared/labs.js';
import { HttpError, withGuard } from '../http/guard.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { loadGoogle, removeGoogle, saveGoogle } from '../repositories/google.js';
import { loadLabs } from '../repositories/labs.js';
import { isOwnerAccount } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import {
  GoogleError, accessToken, authUrl, createSpreadsheet, decryptToken, driveFile, googleConfigured, readSpreadsheet, readState,
  encryptToken, exchangeCode, revokeToken, stateBack } from '../services/googleSheets.js';
import { appOrigin } from '../config/env.js';
import { supabaseAssistantDb } from '../ai/supabaseDb.js';
import { deleteExampleRows, deleteSheetRows, fillSheetIncomeTypes, planRow, previewOf, recentRowsOf, saveAppRecord, saveAppRecords, sheetContext, undoWrite, writeFor, type TabRead } from '../services/sheetWrite.js';
import { chooseTab } from '../../../shared/sheetRow.js';

// ฟีเจอร์ทดลอง, phase 2 (shared/googleSheets.ts, services/googleSheets.ts). GET: this account's connection (never the
// token). POST {action}: start (Google's sign-in address), token (an hour's access token for Google's file picker),
// pick (keep the file chosen in the picker), read (the picked sheet's tabs), saveMap (the confirmed sheet map),
// createTemplate (a bookkeeping workbook made into a new Google Sheet in the person's Drive, then picked), forget (drop
// the picked file) and disconnect (take the permission back at Google and delete the record). Everything but forget and
// disconnect needs the account's ฟีเจอร์ทดลอง switch; leaving is always possible.

const fileId = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/);
const deletedRow = z.object({
  kind: z.enum(['job', 'expense']), fileId, tab: z.string().min(1).max(200), row: z.number().int().min(1).max(100000),
  name: z.string().max(500), amount: z.number().finite().min(-1e12).max(1e12),
}).strict();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), back: z.enum(['connect', 'connect_new']).optional() }).strict(),
  z.object({ action: z.literal('token') }).strict(),
  z.object({ action: z.literal('pick'), fileId }).strict(),
  z.object({ action: z.literal('read') }).strict(),
  z.object({ action: z.literal('saveMap'), map: sheetMapSchema }).strict(),
  z.object({ action: z.literal('createTemplate'), name: z.string().trim().min(1).max(150), xlsx: z.string().min(8).max(2_400_000) }).strict(),
  // บันทึกลงชีตของคุณ (phase 3): the row a waiting card will write, what became of it after ยืนยัน, and ย้อนกลับ.
  z.object({ action: z.literal('preview'), proposalId: z.string().regex(/^p_[0-9a-f-]{36}$/) }).strict(),
  z.object({ action: z.literal('written'), proposalId: z.string().regex(/^p_[0-9a-f-]{36}$/) }).strict(),
  z.object({ action: z.literal('undo'), proposalId: z.string().regex(/^p_[0-9a-f-]{36}$/) }).strict(),
  // Several cards of one answer (a paste of many records): their rows one after another, and what became of each.
  z.object({ action: z.literal('previewMany'), proposalIds: z.array(z.string().regex(/^p_[0-9a-f-]{36}$/)).min(1).max(40) }).strict(),
  z.object({ action: z.literal('writtenMany'), proposalIds: z.array(z.string().regex(/^p_[0-9a-f-]{36}$/)).min(1).max(40) }).strict(),
  // หน้างานและรายจ่ายจากชีต: records deleted in the app, whose rows go from the sheet too (services/sheetWrite.ts).
  z.object({ action: z.literal('deleteRows'), rows: z.array(deletedRow).min(1).max(50) }).strict(),
  // A job or an expense added or changed in the app's own forms, written into the sheet too (before: where its row was).
  z.object({ action: z.literal('saveRow'), kind: z.enum(['job', 'expense']), record: z.record(z.string(), z.unknown())
    .refine(value => JSON.stringify(value).length <= 40_000, 'too large'), before: deletedRow.nullable().optional() }).strict(),
  // Older records copied into the sheet, or an Excel import's, in one go (the app sends at most 100 at a time).
  z.object({ action: z.literal('saveRows'), kind: z.enum(['job', 'expense']), records: z.array(z.record(z.string(), z.unknown())).min(1).max(100)
    .refine(value => JSON.stringify(value).length <= 600_000, 'too large') }).strict(),
  // The template's example rows out of the connected sheet (the person confirms first in the app).
  z.object({ action: z.literal('deleteExamples') }).strict(),
  // ประเภทเงินได้ for the job rows written without one (the sheet's reports add income up by it).
  z.object({ action: z.literal('fillIncomeTypes') }).strict(),
  z.object({ action: z.literal('forget') }).strict(),
  z.object({ action: z.literal('disconnect') }).strict(),
]);

/** Google's errors as the person reads them (formal Thai). reconnect also drops the dead record. */
const MESSAGES: Record<GoogleError['code'], [number, string]> = {
  reconnect: [409, 'การเชื่อม Google หมดอายุหรือถูกยกเลิก กรุณาเชื่อมใหม่'],
  scope: [400, 'ยังไม่ได้อนุญาตให้เข้าถึงไฟล์ใน Google Drive กรุณาเชื่อมใหม่และติ๊กช่องอนุญาต'],
  notFound: [404, 'ไม่พบไฟล์นี้ใน Google Drive อาจถูกลบหรือย้าย กรุณาเลือกไฟล์ใหม่'],
  denied: [403, 'ไฟล์นี้ยังไม่ได้เลือกผ่านกระรอกตุนเงิน กรุณาเลือกไฟล์อีกครั้ง'],
  notSheet: [400, 'ไฟล์นี้ไม่ใช่ Google Sheets กรุณาเลือกไฟล์ Google Sheets'],
  failed: [502, 'Google ไม่ตอบกลับ กรุณาลองอีกครั้ง'],
};

async function access(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  const labs = labState(await loadLabs(user.id), isOwnerAccount(user));
  const need = (feature: LabFeatureId) => { if (!labs.on.includes(feature)) throw new HttpError(403, 'ฟีเจอร์นี้ยังไม่เปิดให้บัญชีของคุณ'); };
  return { user, need };
}

function refreshTokenOf(record: GoogleRecord | null): string {
  if (!record) throw new HttpError(409, 'ยังไม่ได้เชื่อม Google');
  const token = decryptToken(record.enc);
  if (!token) throw new HttpError(409, 'การเชื่อม Google หมดอายุหรือถูกยกเลิก กรุณาเชื่อมใหม่');
  return token;
}

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const { user, need } = await access(req, res);
  res.setHeader('Cache-Control', 'no-store');
  const configured = googleConfigured();
  if (req.method === 'GET') {
    await rateLimit('google-status', user.id, 60, 60);
    res.json({ google: googleStatus(await loadGoogle(user.id), configured) });
    return;
  }
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
  const body = parsed.data;
  const record = await loadGoogle(user.id);
  const reply = (next: GoogleRecord | null, extra: Record<string, unknown> = {}) => res.json({ google: googleStatus(next, configured), ...extra });

  if (body.action === 'disconnect') {
    await rateLimit('google-write', user.id, 20, 60);
    const token = record ? decryptToken(record.enc) : null;
    if (token) await revokeToken(token);
    if (record) await removeGoogle(user.id);
    reply(null);
    return;
  }
  if (body.action === 'forget') {
    await rateLimit('google-write', user.id, 20, 60);
    if (!record) { reply(null); return; }
    const next = { ...record, file: null, map: null };
    await saveGoogle(user.id, next);
    reply(next);
    return;
  }

  if (body.action === 'previewMany' || body.action === 'writtenMany') {
    need('sheetWrite');
    await rateLimit('google-row', user.id, 60, 60);
    if (body.action === 'writtenMany') { res.json({ writes: body.proposalIds.map(id => ({ proposalId: id, write: writeFor(record, id) })) }); return; }
    if (!record?.file || !record.map || record.map.fileId !== record.file.id) {
      res.json({ preview: null, reason: record?.file ? 'noMap' : 'none' });
      return;
    }
    // The cards still waiting, read once; each new row goes under the ones before it in the same tab.
    const waiting = await supabaseAssistantDb.pendingProposals?.(user.id, new Date(Date.now() - 2 * 3600_000).toISOString()).catch(() => []) ?? [];
    const byId = new Map(waiting.map(proposal => [proposal.id, proposal]));
    try {
      const context = await sheetContext(user.id, record);
      if (!context) { res.json({ preview: null, reason: 'none' }); return; }
      const reads = new Map<string, TabRead>();
      const taken = new Map<string, number>();
      const tabs = new Map<string, { tab: string; gid: number | null; span: number; columns: unknown; before: unknown; rows: { proposalId: string; row: number; cells: unknown; computed: unknown }[] }>();
      for (const id of body.proposalIds) {
        const proposal = byId.get(id);
        const kind = proposal?.kind === 'add_job' ? 'job' as const : proposal?.kind === 'add_expense' ? 'expense' as const : null;
        if (!proposal || !kind || !proposal.record) continue;
        const name = chooseTab(record.map, kind)?.name;
        if (!name) continue;
        const plan = await planRow(context.ops, record.map, kind, proposal.record, { offset: taken.get(name) ?? 0, reads });
        if (!plan) continue;
        taken.set(name, (taken.get(name) ?? 0) + 1);
        const shown = previewOf(plan, record.file);
        if (!tabs.has(name)) {
          const gid = await context.ops.tabId(name).catch(() => undefined);
          tabs.set(name, { tab: name, gid: gid ?? null, span: Math.max(0, ...plan.cells.map(cell => cell.index)), columns: shown.columns, before: shown.before, rows: [] });
        }
        tabs.get(name)!.rows.push({ proposalId: id, row: shown.row, cells: shown.cells, computed: shown.computed });
      }
      res.json({ preview: tabs.size ? { file: record.file.name, url: record.file.url, fileId: record.file.id, tabs: [...tabs.values()] } : null, reason: tabs.size ? undefined : 'noTab' });
    } catch (error) {
      if (error instanceof GoogleError) throw new HttpError(...MESSAGES[error.code]);
      throw error;
    }
    return;
  }

  if (body.action === 'saveRow') {
    need('sheetWrite');
    await rateLimit('google-row', user.id, 60, 60);
    res.json({ result: await saveAppRecord(user.id, { kind: body.kind, record: body.record, before: body.before ?? null }) });
    return;
  }

  if (body.action === 'saveRows') {
    need('sheetWrite');
    await rateLimit('google-rows', user.id, 20, 60);
    res.json({ result: await saveAppRecords(user.id, body.kind, body.records) });
    return;
  }

  if (body.action === 'fillIncomeTypes') {
    need('sheetWrite');
    await rateLimit('google-rows', user.id, 20, 60);
    res.json({ result: await fillSheetIncomeTypes(user.id) });
    return;
  }

  if (body.action === 'deleteExamples') {
    need('sheetWrite');
    await rateLimit('google-rows', user.id, 20, 60);
    res.json({ result: await deleteExampleRows(user.id) });
    return;
  }

  if (body.action === 'deleteRows') {
    need('sheetJobs');
    await rateLimit('google-row', user.id, 60, 60);
    res.json({ result: await deleteSheetRows(user.id, body.rows) });
    return;
  }

  if (body.action === 'preview' || body.action === 'written' || body.action === 'undo') {
    need('sheetWrite');
    await rateLimit('google-row', user.id, 60, 60);
    if (body.action === 'written') { res.json({ write: writeFor(record, body.proposalId) }); return; }
    if (body.action === 'undo') {
      try { res.json({ undone: await undoWrite(user.id, body.proposalId), write: writeFor(await loadGoogle(user.id), body.proposalId) }); }
      catch (error) { if (error instanceof GoogleError) throw new HttpError(...MESSAGES[error.code]); throw error; }
      return;
    }
    // Only a waiting card that adds a job or an expense, for an account with a sheet ready, has a row to show.
    const proposal = await supabaseAssistantDb.getProposal?.(user.id, body.proposalId);
    const kind = proposal?.kind === 'add_job' ? 'job' as const : proposal?.kind === 'add_expense' ? 'expense' as const : null;
    if (!proposal || !kind || !proposal.record || !record?.file || !record.map || record.map.fileId !== record.file.id) {
      res.json({ preview: null, reason: record?.file && (!record.map || record.map.fileId !== record.file.id) ? 'noMap' : 'none' });
      return;
    }
    try {
      const context = await sheetContext(user.id, record);
      const plan = context ? await planRow(context.ops, record.map, kind, proposal.record) : null;
      res.json({ preview: plan ? previewOf(plan, record.file) : null, reason: plan ? undefined : 'noTab' });
    } catch (error) {
      if (error instanceof GoogleError) throw new HttpError(...MESSAGES[error.code]);
      throw error;
    }
    return;
  }

  need('sheets');
  if (!configured) throw new HttpError(503, 'ระบบเชื่อม Google ยังไม่พร้อม กรุณาลองใหม่ภายหลัง');

  try {
    if (body.action === 'start') {
      await rateLimit('google-start', user.id, 10, 600);
      reply(record, { url: authUrl(user.id, body.back) });
      return;
    }
    const refresh = refreshTokenOf(record);
    if (body.action === 'token') {
      await rateLimit('google-token', user.id, 30, 600);
      const apiKey = process.env.GOOGLE_PICKER_API_KEY?.trim();
      const appId = process.env.GOOGLE_PICKER_APP_ID?.trim();
      if (!apiKey || !appId) throw new HttpError(503, 'ระบบเลือกไฟล์ยังไม่พร้อม กรุณาลองใหม่ภายหลัง');
      const { token, expiresIn } = await accessToken(refresh);
      res.json({ token, expiresIn, apiKey, appId });
      return;
    }
    if (body.action === 'pick') {
      await rateLimit('google-write', user.id, 20, 60);
      const { token } = await accessToken(refresh);
      const file = await driveFile(token, body.fileId);
      const next: GoogleRecord = { ...record!, file, map: record!.map?.fileId === file.id ? record!.map : null };
      await saveGoogle(user.id, next);
      reply(next);
      return;
    }
    if (body.action === 'read') {
      await rateLimit('google-read', user.id, 30, 600);
      if (!record!.file) throw new HttpError(409, 'ยังไม่ได้เลือกไฟล์ชีต');
      const { token } = await accessToken(refresh);
      const tabs = await readSpreadsheet(token, record!.file.id);
      // Rows the app wrote lately: the app links them to the records they were written for, never adds them anew.
      reply(record, { tabs, readAt: new Date().toISOString(), recentRows: recentRowsOf(record) });
      return;
    }
    if (body.action === 'saveMap') {
      need('sheetMap');
      await rateLimit('google-write', user.id, 20, 60);
      if (!record!.file || body.map.fileId !== record!.file.id) throw new HttpError(409, 'ไฟล์ชีตเปลี่ยนไปแล้ว กรุณาโหลดใหม่');
      const next: GoogleRecord = { ...record!, map: { ...body.map, at: new Date().toISOString() } };
      await saveGoogle(user.id, next);
      // The first map of this file (connected from LINE or not): the done card in the account's LINE chat, if any.
      if (!record!.map || record!.map.fileId !== body.map.fileId) {
        try { await (await import('../services/lineSheetCards.js')).tellLineSheetConnected(user.id, record!.file!, next.map!); }
        catch { console.error('google: the LINE card for a connected sheet was not sent'); }
      }
      reply(next);
      return;
    }
    if (body.action === 'createTemplate') {
      need('templates');
      await rateLimit('google-create', user.id, 6, 600);
      const bytes = Buffer.from(body.xlsx, 'base64');
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new HttpError(400, 'ไฟล์ชีตไม่ถูกต้อง');
      const { token } = await accessToken(refresh);
      const file = await createSpreadsheet(token, body.name, bytes);
      const next: GoogleRecord = { ...record!, file, map: null };
      await saveGoogle(user.id, next);
      reply(next, { created: true });
      return;
    }
  } catch (error) {
    if (!(error instanceof GoogleError)) throw error;
    if (error.code === 'reconnect' && record) await removeGoogle(user.id).catch(() => undefined);
    const [status, message] = MESSAGES[error.code];
    throw new HttpError(status, message);
  }
}, { csrf: true });

/** GET /api/google/callback: Google sends the person back here (a top-level visit, so the sign-in cookie comes along).
 *  The state must be one this server signed for the same account in the last ten minutes. Then back to Settings, which
 *  opens the Google Sheets panel with the result. */
export const googleCallback = withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const { code, state, error } = req.query as Record<string, unknown>;
  // Opened from LINE (/connect-sheets) goes back there; otherwise Settings. The page is read only from a signed state.
  const asked = typeof state === 'string' && readState(state) ? stateBack(state) : null;
  const page = asked === 'connect_new' ? '/connect-sheets?new=1&' : asked === 'connect' ? '/connect-sheets?' : '/settings?';
  const back = (result: string) => { res.status(302); res.setHeader('Location', `${appOrigin()}${page}google=${result}`); res.end(); };
  if (typeof error === 'string') { back('cancelled'); return; }
  if (!googleConfigured() || typeof code !== 'string' || typeof state !== 'string' || code.length > 2000) { back('failed'); return; }
  const stateUser = readState(state);
  if (!stateUser) { back('failed'); return; }
  let user;
  try { user = await requireUser(req, res); } catch { back('signin'); return; }
  if (user.id !== stateUser) { back('failed'); return; }
  if (!labState(await loadLabs(user.id), isOwnerAccount(user)).on.includes('sheets')) { back('failed'); return; }
  try { await rateLimit('google-connect', user.id, 10, 600); } catch { back('failed'); return; }
  try {
    const previous = await loadGoogle(user.id);
    const result = await exchangeCode(code);
    // A different Google account than before: the old file and map belong to the other account.
    const same = previous && previous.email && previous.email === result.email;
    const oldToken = previous ? decryptToken(previous.enc) : null;
    await saveGoogle(user.id, { email: result.email, enc: encryptToken(result.refreshToken), at: new Date().toISOString(), file: same ? previous!.file ?? null : null, map: same ? previous!.map ?? null : null });
    if (oldToken && oldToken !== result.refreshToken && !same) await revokeToken(oldToken);
    back('connected');
  } catch (caught) {
    back(caught instanceof GoogleError && caught.code === 'scope' ? 'scope' : 'failed');
  }
});
