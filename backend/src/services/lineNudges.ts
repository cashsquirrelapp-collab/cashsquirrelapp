import { GOALS, OCCUPATIONS, RECORD_PLACES, UNRELEASED_GOALS, WORK_TYPES, onboardingRecordSchema, personaForWorkType, type OnboardingRecord, type WorkTypeId } from '../../../shared/onboarding.js';
import { validateChanges } from '../../../shared/validation.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from '../repositories/accounts.js';
import { loadGoogle } from '../repositories/google.js';
import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineCard } from './lineCards.js';
import { sheetsBadge, sheetsOpenFor } from './lineSheetCards.js';
import { USE_LABELS, USE_TYPES } from './lineTry.js';

// เลขาเสนอตอนที่ใช่ (owner, 2026-11-13: "ทำขั้นต่อไปเลย"; unlike the competitor's checklist): after a record is saved in
// LINE, at most one thing a day — the next welcome question nobody answered yet (one tap, skippable), or, once five
// records are in, the offer to put them in the person's own sheet. Only for accounts made in LINE (they skipped the
// web's questions); nothing is asked twice, and ข้าม / ไว้ก่อน are kept.

export type AskKey = 'use' | 'work' | 'occupation' | 'goal' | 'records';
const ASK_ORDER: AskKey[] = ['use', 'work', 'occupation', 'goal', 'records'];
export const ASK_POSTBACK = /^ask:(use|work|occupation|goal|records):([a-z_]{2,24})$/;
export const SHEET_LATER = 'nudge:sheet:later';
const DAY = 86_400_000;
const GAP_MS = 20 * 3_600_000;
const SHEET_RECORDS = 5;

// Quick-reply labels are at most 20 characters in LINE: short words for the same stable ids.
const SHORT: Record<AskKey, Record<string, string>> = {
  use: { ...USE_LABELS },
  work: { freelance: 'ฟรีแลนซ์', business_owner: 'ธุรกิจ / เอเจนซี', accounting_office: 'สำนักงานบัญชี', employee: 'พนักงานประจำ', student: 'นักเรียน / นักศึกษา', other: 'อื่น ๆ' },
  occupation: { content_creator: 'ครีเอเตอร์', video_graphic: 'ตัดต่อ / กราฟิก', developer_digital: 'งานดิจิทัล / โค้ด', marketing: 'การตลาด / โฆษณา', photo_video: 'ช่างภาพ / วิดีโอ',
    teacher_coach: 'ครู / โค้ช', trade_owner: 'ค้าขาย', accounting: 'บัญชี / การเงิน', other: 'อื่น ๆ' },
  goal: { record_chat: 'จดผ่าน LINE', receipts: 'เก็บใบเสร็จ', receivables: 'ตามเงินลูกค้า', documents: 'ออกเอกสาร', cashflow_overview: 'รู้กำไรแต่ละเดือน',
    tax: 'ภาษี / หัก ณ ที่จ่าย', my_sheet: 'ลงชีตที่ใช้อยู่', accountant: 'ส่งงานนักบัญชี', exploring: 'ยังไม่แน่ใจ' },
  records: { google_sheets: 'Google Sheets', excel: 'Excel', notebook: 'สมุด / โน้ตมือถือ', other_app: 'แอปบัญชีอื่น', by_accountant: 'มีนักบัญชีทำให้', none: 'ยังไม่ได้จด' },
};
const QUESTION: Record<AskKey, string> = {
  use: 'ขอถามนิดนึงครับ ใช้กระรอกแบบไหน?',
  work: 'ตอนนี้ทำงานแบบไหนครับ?',
  occupation: 'งานหลักของคุณด้านไหนครับ?',
  goal: 'อยากให้เลขาช่วยเรื่องไหนที่สุดครับ?',
  records: 'ก่อนหน้านี้จดรายรับรายจ่ายไว้ที่ไหนครับ?',
};
const OPTIONS: Record<AskKey, readonly { id: string }[]> = { use: USE_TYPES.map(id => ({ id })), work: WORK_TYPES, occupation: OCCUPATIONS, goal: GOALS, records: RECORD_PLACES };
export const shortLabel = (key: AskKey, id: string) => SHORT[key][id] ?? id;

export interface NudgeState { at?: string; skipped?: AskKey[]; sheetOfferedAt?: string; sheetLaterAt?: string }
export function readNudgeState(value: unknown): NudgeState {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const date = (item: unknown) => (typeof item === 'string' && Number.isFinite(Date.parse(item)) ? item : undefined);
  return {
    at: date(raw.at), sheetOfferedAt: date(raw.sheetOfferedAt), sheetLaterAt: date(raw.sheetLaterAt),
    skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((key): key is AskKey => ASK_ORDER.includes(key as AskKey)) : [],
  };
}

/** The next welcome question this account has not answered or skipped; null when there is none. */
export function nextQuestion(record: OnboardingRecord | null, state: NudgeState): AskKey | null {
  if (!record || (record.channel !== 'line' && !record.use)) return null;
  const empty: Record<AskKey, boolean> = {
    use: !record.use, work: !record.work_type, occupation: !record.occupations.length, goal: !record.goals.length, records: !record.records_in,
  };
  return ASK_ORDER.find(key => empty[key] && !(state.skipped ?? []).includes(key)) ?? null;
}

export function buildQuestion(key: AskKey, sheetsOpen: boolean): LineMessage {
  const options = OPTIONS[key].filter(option => sheetsOpen || key !== 'goal' || !UNRELEASED_GOALS.includes(option.id));
  return { type: 'text', text: QUESTION[key], quickReply: { items: [
    ...options.map(option => ({ type: 'action' as const, action: { type: 'postback' as const, label: shortLabel(key, option.id), data: `ask:${key}:${option.id}`, displayText: shortLabel(key, option.id) } })),
    { type: 'action' as const, action: { type: 'postback' as const, label: 'ข้ามไปก่อน', data: `ask:${key}:skip`, displayText: 'ข้ามไปก่อน' } },
  ] } };
}

/** Five records in and no sheet yet: put them in the person's own sheet, or make one, or later. The same card look as
 *  เชื่อมชีตของคุณ (header band, the Sheets badge), with three buttons instead of one. */
export function buildSheetOffer(liffId: string | undefined, count: number): LineMessage {
  const liff = (query: string) => (liffId ? `https://liff.line.me/${liffId}?${query}` : undefined);
  const connect = liff('connect=sheets');
  const create = liff('connect=sheets&new=1');
  const card = lineCard({
    title: `จดมา ${count} รายการแล้ว`, subtitle: 'อยากให้ลงชีตของคุณด้วยไหมครับ', character: 'document', compact: true,
    altText: `จดมา ${count} รายการแล้ว อยากให้ลงชีตของคุณด้วยไหม`,
    body: [
      sheetsBadge(),
      { type: 'text', text: 'ทุกครั้งที่บันทึก เลขาเพิ่มแถวในไฟล์ของคุณให้ ข้อมูลในแอปก็ยังอยู่ครบ', size: 'sm', color: C.muted, wrap: true, margin: 'lg' },
    ],
  }) as Extract<LineMessage, { type: 'flex' }> & { contents: Record<string, unknown> };
  card.contents.footer = { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '20px', paddingTop: '0px', contents: [
    ...(connect ? [{ type: 'button', style: 'primary', height: 'sm', color: C.accent, action: { type: 'uri', label: 'เชื่อมชีตที่มีอยู่', uri: connect } }] : []),
    ...(create ? [{ type: 'button', style: 'primary', height: 'sm', color: C.accent, action: { type: 'uri', label: 'สร้างชีตใหม่ให้', uri: create } }] : []),
    { type: 'button', style: 'secondary', height: 'sm', color: C.subtle, action: { type: 'postback', label: 'ไว้ก่อน', data: SHEET_LATER, displayText: 'ไว้ก่อน' } },
  ] };
  return card;
}

export interface NudgeDeps {
  userOf(lineUserId: string): Promise<string | null>;
  state(userId: string): Promise<{ record: OnboardingRecord | null; nudges: NudgeState }>;
  saveNudges(userId: string, nudges: NudgeState): Promise<void>;
  sheetsOpen(userId: string): Promise<boolean>;
  hasSheet(userId: string): Promise<boolean>;
  records(userId: string): Promise<number>;
  now(): Date;
}

/**
 * The reads for "one well-timed thing after a save", started while the save itself runs (the reply stays quick). The
 * returned step runs once the save is known to have worked: it counts the records (now including the new one), keeps
 * the date, and gives the one message — or null. Never fails the answer it follows.
 */
export async function prepareNudge(lineUserId: string, deps: NudgeDeps = nudgeDeps): Promise<() => Promise<LineMessage | null>> {
  const none = async () => null;
  try {
    const userId = await deps.userOf(lineUserId);
    if (!userId) return none;
    const [{ record, nudges }, sheetsOpen] = await Promise.all([deps.state(userId), deps.sheetsOpen(userId)]);
    const now = deps.now().getTime();
    if (nudges.at && now - Date.parse(nudges.at) < GAP_MS) return none;
    const sheetDue = sheetsOpen && (!nudges.sheetLaterAt || now - Date.parse(nudges.sheetLaterAt) > 14 * DAY)
      && (!nudges.sheetOfferedAt || now - Date.parse(nudges.sheetOfferedAt) > 3 * DAY) && !(await deps.hasSheet(userId));
    const key = nextQuestion(record, nudges);
    if (!sheetDue && !key) return none;
    return async () => {
      try {
        const stamp = deps.now().toISOString();
        // The sheet offer first, once enough is recorded: it is what Krarok is for (เราไปหาเขา).
        if (sheetDue) {
          const count = await deps.records(userId);
          if (count >= SHEET_RECORDS) {
            await deps.saveNudges(userId, { ...nudges, at: stamp, sheetOfferedAt: stamp });
            return buildSheetOffer(process.env.LIFF_ID, count);
          }
        }
        if (!key) return null;
        await deps.saveNudges(userId, { ...nudges, at: stamp });
        return buildQuestion(key, sheetsOpen);
      } catch {
        console.error('line-nudges: nothing offered after a save');
        return null;
      }
    };
  } catch {
    console.error('line-nudges: nothing offered after a save');
    return none;
  }
}

/** After a record is saved in LINE: one well-timed thing, or nothing. */
export async function nudgeAfterSave(lineUserId: string, deps: NudgeDeps = nudgeDeps): Promise<LineMessage | null> {
  return (await prepareNudge(lineUserId, deps))();
}

/** Whether a LINE command saved something (ยืนยัน on one card, บันทึกทั้งหมด on a set) and its answer says it worked. */
export function savedByCommand(command: string, reply: readonly LineMessage[]): boolean {
  return /^(ยืนยันรายการเลขา p_|บันทึกทั้งหมดเลขา g)/.test(command.trim()) && reply.some(message => message.type === 'flex');
}

export interface AnswerDeps {
  userOf(lineUserId: string): Promise<string | null>;
  answer(userId: string, key: AskKey, id: string): Promise<void>;
  skip(userId: string, key: AskKey): Promise<void>;
  later(userId: string): Promise<void>;
}

/** A tap on one of those buttons: kept, and a short thank-you. Null when the tap is not one of them. */
export async function handleNudgeTap(lineUserId: string, data: string, deps: AnswerDeps = answerDeps): Promise<LineMessage | null> {
  const ask = ASK_POSTBACK.exec(data);
  if (!ask && data !== SHEET_LATER) return null;
  const userId = await deps.userOf(lineUserId);
  if (!userId) return null;
  if (!ask) { await deps.later(userId); return { type: 'text', text: 'ได้ครับ ไว้พร้อมเมื่อไหร่ พิมพ์ "เชื่อมชีต" ได้เลย' }; }
  const key = ask[1] as AskKey;
  if (ask[2] === 'skip') { await deps.skip(userId, key); return { type: 'text', text: 'ได้ครับ ไม่เป็นไร' }; }
  if (!OPTIONS[key].some(option => option.id === ask[2])) return { type: 'text', text: 'ตัวเลือกนี้ใช้ไม่ได้แล้วครับ' };
  await deps.answer(userId, key, ask[2]);
  return { type: 'text', text: 'ขอบคุณครับ เลขาจะช่วยให้ตรงกับงานของคุณมากขึ้น' };
}

// ---- The database side (no SQL: the settings document and the account's private state, as everywhere else) ----

async function userOf(lineUserId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_line_links').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (error) throw error;
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

async function settingsOf(userId: string): Promise<{ data: Record<string, unknown> | null; version: number | null }> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_documents').select('data,version').eq('user_id', userId).eq('id', 'settings').maybeSingle();
  if (error) throw error;
  const row = data as { data?: Record<string, unknown>; version?: number } | null;
  return { data: row?.data ?? null, version: row ? Number(row.version) : null };
}

async function nudgesOf(userId: string): Promise<NudgeState> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('nudges:data->lineNudges').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return readNudgeState((data as { nudges?: unknown } | null)?.nudges);
}

/** The answer into settings.onboarding (and the menu persona from a work type); COMPLETED once all four are in. */
export function withAnswer(record: OnboardingRecord, key: AskKey, id: string, now: Date): OnboardingRecord {
  const next: OnboardingRecord = { ...record, updated_at: now.toISOString() };
  if (key === 'use') next.use = id as NonNullable<OnboardingRecord['use']>;
  if (key === 'work') next.work_type = id as OnboardingRecord['work_type'];
  if (key === 'occupation') next.occupations = [id as OnboardingRecord['occupations'][number]];
  if (key === 'goal') next.goals = [id as OnboardingRecord['goals'][number]];
  if (key === 'records') next.records_in = id as NonNullable<OnboardingRecord['records_in']>;
  if (next.work_type && next.occupations.length && next.goals.length && next.records_in) {
    next.status = 'COMPLETED';
    next.completed_at = next.completed_at ?? now.toISOString();
    delete next.skipped_at_step;
  }
  return next;
}

export const nudgeDeps: NudgeDeps = {
  userOf,
  async state(userId) {
    const [settings, nudges] = await Promise.all([settingsOf(userId), nudgesOf(userId)]);
    const parsed = onboardingRecordSchema.safeParse(settings.data?.onboarding);
    return { record: parsed.success ? parsed.data : null, nudges };
  },
  saveNudges: (userId, nudges) => patchPrivate(userId, { lineNudges: nudges }),
  sheetsOpen: sheetsOpenFor,
  async hasSheet(userId) { return Boolean((await loadGoogle(userId).catch(() => null))?.file); },
  async records(userId) {
    const db = getSupabaseAdmin();
    const [jobs, expenses] = await Promise.all([
      db.from('cashflow_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      db.from('cashflow_expenses').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    return (jobs.count ?? 0) + (expenses.count ?? 0);
  },
  now: () => new Date(),
};

export const answerDeps: AnswerDeps = {
  userOf,
  async answer(userId, key, id) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const settings = await settingsOf(userId);
      const parsed = onboardingRecordSchema.safeParse(settings.data?.onboarding);
      if (!settings.data || settings.version === null || !parsed.success) return;
      const onboarding = withAnswer(parsed.data, key, id, new Date());
      // The menu follows the work type; with none yet, the use (ส่วนตัว reads like an employee's, the rest a freelancer's).
      const persona = key === 'work' ? personaForWorkType(id as WorkTypeId)
        : key === 'use' && !onboarding.work_type ? (id === 'personal' ? 'employee' : 'freelance') : undefined;
      const changes = validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: settings.version,
        data: { ...settings.data, onboarding, ...(persona ? { userPersona: persona } : {}) } }]);
      const { error } = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: userId, p_changes: changes });
      if (!error) return;
      if (error.code !== '40001') throw error;
    }
  },
  async skip(userId, key) {
    const nudges = await nudgesOf(userId);
    await patchPrivate(userId, { lineNudges: { ...nudges, skipped: [...new Set([...(nudges.skipped ?? []), key])] } });
  },
  async later(userId) {
    const nudges = await nudgesOf(userId);
    await patchPrivate(userId, { lineNudges: { ...nudges, sheetLaterAt: new Date().toISOString() } });
  },
};
