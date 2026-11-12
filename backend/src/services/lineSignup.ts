import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { CONSENT_KEYS, type ConsentKey } from '../../../shared/consents.js';
import { ONBOARDING_VERSION, OTHER_TEXT_MAX, WORK_TYPES, type OnboardingRecord, type WorkTypeId } from '../../../shared/onboarding.js';
import type { AppSettings } from '../../../shared/types.js';
import { validateChanges } from '../../../shared/validation.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError } from '../http/guard.js';
import { saveConsent } from '../repositories/consents.js';
import { lineOnlyEmail } from './lineFirst.js';
import { linkedLineAccount } from './lineSession.js';

// Signing up inside LINE (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย" with "ชื่อ + ประเภทงาน"): the LIFF page sends a
// LINE-verified identity, a name and a work type with the terms ticked; this makes the account, links that LINE chat to
// it, keeps the three agreements (terms, เลขา, LINE) and the answers the web's welcome would have asked, so the website
// never asks again. No email, no password the person knows: they come back through LINE.

const workTypeIds = WORK_TYPES.map(item => item.id) as [WorkTypeId, ...WorkTypeId[]];
export const lineSignupSchema = z.object({
  idToken: z.string().min(1).max(8192),
  name: z.string().trim().min(2).max(60).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'name'),
  workType: z.enum(workTypeIds),
  workTypeOther: z.string().trim().max(OTHER_TEXT_MAX).optional(),
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
  key(): string;
  now(): Date;
}

/** The web's own persona for the work type, so the app opens with the right menu (ProfileSetupWizard). */
const PERSONA: Record<WorkTypeId, NonNullable<AppSettings['userPersona']>> = {
  freelance: 'freelance', employee: 'employee', student: 'university', business_owner: 'freelance', other: 'freelance',
};

export function settingsFor(input: Pick<LineSignupInput, 'workType' | 'workTypeOther'>, now: Date): AppSettings {
  const at = now.toISOString();
  const onboarding: OnboardingRecord = {
    version: ONBOARDING_VERSION, status: 'COMPLETED',
    work_type: input.workType, work_type_other: input.workType === 'other' && input.workTypeOther ? input.workTypeOther : null,
    occupations: [], occupation_other: null, goals: [], updated_at: at, completed_at: at,
  };
  // The app's defaults for a new account (frontend/src/sampleData.ts defaultSettings), no fixed monthly cost.
  return { monthlyExpense: 0, monthlyRevenueGoal: 35000, savingsPercentage: 40, accumulatedRemainder: 0, profileSetupCompleted: true, userPersona: PERSONA[input.workType], onboarding };
}

export async function signUpFromLine(lineUserId: string, input: Pick<LineSignupInput, 'name' | 'workType' | 'workTypeOther'>, deps: LineSignupDeps): Promise<{ userId: string; created: boolean }> {
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
  key: sessionSecret,
  now: () => new Date(),
};
