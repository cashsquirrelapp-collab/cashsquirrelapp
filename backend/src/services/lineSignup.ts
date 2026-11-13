import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CONSENT_KEYS, type ConsentKey } from '../../../shared/consents.js';
import { GOALS, OCCUPATIONS, ONBOARDING_STEPS, OTHER_TEXT_MAX, RECORD_PLACES, WORK_TYPES, jobTypesForOccupations, onboardingRecord, personaForWorkType, type GoalId, type OccupationId, type RecordPlaceId, type WorkTypeId } from '../../../shared/onboarding.js';
import { DEFAULT_JOB_TYPES } from '../../../shared/jobTypes.js';
import type { AppSettings } from '../../../shared/types.js';
import { validateChanges } from '../../../shared/validation.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError } from '../http/guard.js';
import { saveConsent } from '../repositories/consents.js';
import { lineOnlyEmail } from './lineFirst.js';
import { USE_TYPES, decodeTry, type TryDraft } from './lineTry.js';
import { linkedLineAccount } from './lineSession.js';

// Signing up inside LINE (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย" with "ชื่อ + ประเภทงาน"): the LIFF page sends a
// LINE-verified identity, a name and a work type with the terms ticked; this makes the account, links that LINE chat to
// it, keeps the three agreements (terms, เลขา, LINE) and the answers the web's welcome would have asked, so the website
// never asks again. No email, no password the person knows: they come back through LINE.

const ids = <T extends readonly { id: string }[]>(list: T) => list.map(item => item.id) as [T[number]['id'], ...T[number]['id'][]];
// The website's first-run answers exactly (owner, 2026-11-13: "แบบสอบถาม ... เหมือนใน .com"): each may be left empty
// when ข้ามก่อน was pressed; the agreements may not.
export const lineSignupSchema = z.object({
  idToken: z.string().min(1).max(8192),
  name: z.string().trim().min(2).max(60).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'name'),
  workType: z.enum(ids(WORK_TYPES)).nullable().optional(),
  workTypeOther: z.string().trim().max(OTHER_TEXT_MAX).optional(),
  occupations: z.array(z.enum(ids(OCCUPATIONS))).max(OCCUPATIONS.length).optional(),
  occupationOther: z.string().trim().max(OTHER_TEXT_MAX).optional(),
  goals: z.array(z.enum(ids(GOALS))).max(GOALS.length).optional(),
  skippedAtStep: z.number().int().min(2).max(ONBOARDING_STEPS).optional(),
  recordsIn: z.enum(ids(RECORD_PLACES)).nullable().optional(),
  /** ใช้แบบไหน, picked in LINE before anything else (services/lineTry.ts). */
  use: z.enum(USE_TYPES).optional(),
  /** A record tried in LINE before signing up, kept as the first one (encoded by lineTry.ts; checked again here). */
  keep: z.string().max(600).optional(),
  agreed: z.literal(true),
  destination: z.string().max(500).optional(),
}).strict();
export type LineSignupInput = z.infer<typeof lineSignupSchema>;

export interface LineSignupDeps {
  linked(lineUserId: string): Promise<string | null>;
  /** Makes the account; returns null when the address is already taken (a retry after a half-finished sign-up). */
  createUser(email: string): Promise<string | null>;
  /** The account already holding this address. */
  findUser(email: string): Promise<string | null>;
  link(userId: string, lineUserId: string): Promise<void>;
  consent(userId: string, key: ConsentKey): Promise<void>;
  profile(userId: string, name: string): Promise<void>;
  /** Writes the first settings; an account that already has them keeps its own. */
  settings(userId: string, settings: AppSettings): Promise<void>;
  /** The first job type list; an account that already has one keeps it. */
  jobTypes(userId: string, types: string[]): Promise<void>;
  /** The record tried before signing up, saved as the account's first. */
  firstRecord(userId: string, draft: TryDraft, today: string): Promise<void>;
  key(): string;
  now(): Date;
}

type Answers = Pick<LineSignupInput, 'workType' | 'workTypeOther' | 'occupations' | 'occupationOther' | 'goals' | 'recordsIn' | 'skippedAtStep'> & { use?: LineSignupInput['use'] };

/** What the website saves when its first run ends (App.tsx saveOnboarding), for an account with no settings yet. */
export function settingsFor(input: Answers, now: Date): AppSettings {
  const record = onboardingRecord({
    workType: input.workType ?? null, workTypeOther: input.workTypeOther ?? '',
    occupations: (input.occupations ?? []) as OccupationId[], occupationOther: input.occupationOther ?? '',
    goals: (input.goals ?? []) as GoalId[], recordsIn: (input.recordsIn ?? null) as RecordPlaceId | null,
  }, input.skippedAtStep ? 'SKIPPED' : 'COMPLETED', now, null, input.skippedAtStep);
  const onboarding = { ...record, ...(input.use ? { use: input.use } : {}), channel: 'line' as const };
  // With no work type yet, the use picked in LINE chooses the app's menu: ส่วนตัว reads like an employee's, the rest a freelancer's.
  const persona = personaForWorkType((input.workType ?? null) as WorkTypeId | null)
    ?? (input.use === 'personal' ? 'employee' : input.use ? 'freelance' : undefined);
  // The app's defaults for a new account (frontend/src/sampleData.ts defaultSettings), no fixed monthly cost.
  return { monthlyExpense: 0, monthlyRevenueGoal: 35000, savingsPercentage: 40, accumulatedRemainder: 0, profileSetupCompleted: true, ...(persona ? { userPersona: persona } : {}), onboarding };
}

/** The job types to start with: the built-in ones and those of the occupations picked; null when nothing is added. */
export function jobTypesFor(input: Pick<LineSignupInput, 'occupations'>): string[] | null {
  const extra = jobTypesForOccupations((input.occupations ?? []) as OccupationId[], DEFAULT_JOB_TYPES);
  return extra.length ? [...DEFAULT_JOB_TYPES, ...extra] : null;
}

export type FirstRecord = TryDraft;
export async function signUpFromLine(lineUserId: string, input: Answers & Pick<LineSignupInput, 'name' | 'keep'>, deps: LineSignupDeps): Promise<{ userId: string; created: boolean; first?: FirstRecord }> {
  // Already linked (an existing web account, or a sign-up that already went through): nothing new is made.
  const existing = await deps.linked(lineUserId);
  if (existing) return { userId: existing, created: false };
  const email = lineOnlyEmail(lineUserId, deps.key());
  const userId = (await deps.createUser(email)) ?? (await deps.findUser(email));
  if (!userId) throw new HttpError(503, 'สร้างบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง');
  await deps.link(userId, lineUserId);
  for (const key of CONSENT_KEYS) await deps.consent(userId, key);
  await deps.profile(userId, input.name);
  await deps.settings(userId, settingsFor(input, deps.now()));
  const jobTypes = jobTypesFor(input);
  if (jobTypes) await deps.jobTypes(userId, jobTypes);
  // The record tried in LINE before signing up becomes the first one (owner: "ลองก่อน แล้วเก็บไว้ในแตะเดียว").
  const first = decodeTry(input.keep);
  if (first) {
    const today = new Date(deps.now().getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    await deps.firstRecord(userId, first, today);
    return { userId, created: true, first };
  }
  return { userId, created: true };
}

const conflict = (error: { code?: string; status?: number; message?: string } | null) =>
  Boolean(error && (error.code === 'email_exists' || error.code === 'user_already_exists' || error.status === 422 || /already/i.test(error.message || '')));

export const lineSignupDeps: LineSignupDeps = {
  linked: linkedLineAccount,
  async createUser(email) {
    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email, email_confirm: true,
      // Never used or shown: the account is opened through LINE (lineSession.ts), which needs a confirmed address.
      password: randomBytes(32).toString('base64url'),
      app_metadata: { signup_channel: 'line' },
    });
    if (error) { if (conflict(error)) return null; throw error; }
    return data.user?.id ?? null;
  },
  async findUser(email) {
    // generateLink sends nothing; for an existing address it names that account.
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({ type: 'magiclink', email });
    if (error) throw error;
    return data.user?.id ?? null;
  },
  async link(userId, lineUserId) {
    const { error } = await getSupabaseAdmin().from('cashflow_line_links').insert({ user_id: userId, line_user_id: lineUserId });
    if (!error) return;
    if (error.code === '23505') {
      const holder = await linkedLineAccount(lineUserId);
      if (holder === userId) return;
      throw new HttpError(409, 'LINE นี้เชื่อมกับบัญชีอื่นอยู่แล้ว');
    }
    throw error;
  },
  async consent(userId, key) { await saveConsent(userId, key, true); },
  async profile(userId, name) {
    const { error } = await getSupabaseAdmin().rpc('cashflow_profile_update', { p_actor: userId, p_display_name: name });
    if (error) throw error;
  },
  async settings(userId, settings) {
    const changes = validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: null, data: settings }]);
    const { error } = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: userId, p_changes: changes });
    // A retry finds the settings already there (version conflict or duplicate): theirs stay.
    if (error && error.code !== '40001' && error.code !== '23505') throw error;
  },
  async jobTypes(userId, types) {
    const changes = validateChanges([{ table: 'cashflow_documents', id: 'job_types', op: 'set', version: null, data: types }]);
    const { error } = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: userId, p_changes: changes });
    if (error && error.code !== '40001' && error.code !== '23505') throw error;
  },
  async firstRecord(userId, draft, today) {
    const id = randomUUID();
    const change = draft.kind === 'income'
      ? { table: 'cashflow_jobs', id, op: 'set', version: null, data: { id, name: draft.name, value: draft.amount, received: draft.amount, pending: 0, client: '',
          type: 'งานทั่วไปอื่นๆ', status: 'done', paymentStatus: 'paid', creditTerm: 0, note: '', payDate: today } }
      : { table: 'cashflow_expenses', id, op: 'set', version: null, data: { id, name: draft.name, amount: draft.amount, category: draft.category ?? '', date: today, note: '' } };
    const changes = validateChanges([change]);
    const { error } = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: userId, p_changes: changes });
    if (error) throw error;
  },
  key: sessionSecret,
  now: () => new Date(),
};
