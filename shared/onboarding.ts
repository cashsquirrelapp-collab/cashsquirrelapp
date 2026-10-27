import { z } from 'zod';

// Welcome Onboarding V1 (owner brief, 2026-10-28): four questions after a person's first sign-in, kept in the account's
// settings document (settings.onboarding) with stable IDs, so the admin can see who signs up, what they want, what
// each group really uses, who comes back and who buys Pro. The labels can change; the IDs never do.
// What เลขา calls the person (step 1) is the account's name (cashflow_profiles.display_name, the name เลขา uses on the
// web and in LINE), saved through the profile API; it never reaches documents, which use the issuer profile.

export const ONBOARDING_VERSION = 'welcome-v1';
/** Accounts created from this moment are asked (00:00 28 Oct 2569, Bangkok); older accounts never are. */
export const ONBOARDING_ROLLOUT_AT = Date.parse('2026-10-27T17:00:00.000Z');
export const ONBOARDING_STEPS = 4;
export const OTHER_TEXT_MAX = 80;

export const WORK_TYPES = [
  { id: 'freelance', label: 'ฟรีแลนซ์ / อาชีพอิสระ' },
  { id: 'employee', label: 'พนักงานประจำ' },
  { id: 'student', label: 'นักเรียน / นักศึกษา' },
  { id: 'business_owner', label: 'เจ้าของธุรกิจ / เอเจนซี' },
  { id: 'other', label: 'อื่น ๆ (โปรดระบุ)' },
] as const;
export const OCCUPATIONS = [
  { id: 'content_creator', label: 'คอนเทนต์ครีเอเตอร์' },
  { id: 'video_graphic', label: 'ตัดต่อวิดีโอ / กราฟิก' },
  { id: 'developer_digital', label: 'โปรแกรมเมอร์ / งานดิจิทัล' },
  { id: 'marketing', label: 'การตลาด / โฆษณา' },
  { id: 'photo_video', label: 'ช่างภาพ / วิดีโอ' },
  { id: 'teacher_coach', label: 'ครู / ติวเตอร์ / โค้ช' },
  { id: 'trade_owner', label: 'ค้าขาย / เจ้าของกิจการ' },
  { id: 'other', label: 'อื่น ๆ (โปรดระบุ)' },
] as const;
export const GOALS = [
  { id: 'cashflow_overview', label: 'ดูภาพรวมรายรับรายจ่ายและกระแสเงินสด' },
  { id: 'receivables', label: 'ติดตามเงินค้างรับจากลูกค้า' },
  { id: 'projects', label: 'จัดการงานและโปรเจกต์' },
  { id: 'documents', label: 'ทำใบเสนอราคาและเอกสาร' },
  { id: 'exploring', label: 'ยังไม่แน่ใจ อยากลองใช้ก่อน' },
] as const;
/** "ยังไม่แน่ใจ อยากลองใช้ก่อน" stands alone: it cannot be picked with another goal. */
export const EXCLUSIVE_GOAL = 'exploring';

export type WorkTypeId = (typeof WORK_TYPES)[number]['id'];
export type OccupationId = (typeof OCCUPATIONS)[number]['id'];
export type GoalId = (typeof GOALS)[number]['id'];
export type OnboardingStatus = 'COMPLETED' | 'SKIPPED';

const ids = <T extends readonly { id: string }[]>(list: T) => list.map(item => item.id) as [T[number]['id'], ...T[number]['id'][]];
const otherText = z.string().trim().max(OTHER_TEXT_MAX).nullable();

export const onboardingRecordSchema = z.object({
  version: z.literal(ONBOARDING_VERSION),
  status: z.enum(['COMPLETED', 'SKIPPED']),
  work_type: z.enum(ids(WORK_TYPES)).nullable(),
  work_type_other: otherText,
  occupations: z.array(z.enum(ids(OCCUPATIONS))).max(OCCUPATIONS.length),
  occupation_other: otherText,
  goals: z.array(z.enum(ids(GOALS))).max(GOALS.length),
  /** The step the person left on when they pressed ข้ามก่อน (1–4). */
  skipped_at_step: z.number().int().min(1).max(ONBOARDING_STEPS).optional(),
  updated_at: z.string().max(40),
  completed_at: z.string().max(40).optional(),
}).strict()
  .refine(record => !(record.goals.includes(EXCLUSIVE_GOAL) && record.goals.length > 1), 'exploring is exclusive')
  .refine(record => new Set(record.occupations).size === record.occupations.length && new Set(record.goals).size === record.goals.length, 'no repeats');
export type OnboardingRecord = z.infer<typeof onboardingRecordSchema>;

export interface OnboardingAnswers {
  workType: WorkTypeId | null;
  workTypeOther: string;
  occupations: OccupationId[];
  occupationOther: string;
  goals: GoalId[];
}
export const EMPTY_ANSWERS: OnboardingAnswers = { workType: null, workTypeOther: '', occupations: [], occupationOther: '', goals: [] };

/** Picking a goal: "ยังไม่แน่ใจ" clears the others, and any other goal clears it. */
export function toggleGoal(goals: GoalId[], id: GoalId): GoalId[] {
  if (goals.includes(id)) return goals.filter(goal => goal !== id);
  if (id === EXCLUSIVE_GOAL) return [EXCLUSIVE_GOAL];
  return [...goals.filter(goal => goal !== EXCLUSIVE_GOAL), id];
}
export function toggleOccupation(occupations: OccupationId[], id: OccupationId): OccupationId[] {
  return occupations.includes(id) ? occupations.filter(item => item !== id) : [...occupations, id];
}

/** The answers as they are kept: in a fixed order, the "other" text only with "อื่น ๆ", trimmed and capped. */
export function onboardingRecord(answers: OnboardingAnswers, status: OnboardingStatus, now: Date, previous?: OnboardingRecord | null, skippedAtStep?: number): OnboardingRecord {
  const text = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, OTHER_TEXT_MAX) || null;
  const order = <T extends string>(list: readonly { id: string }[], picked: T[]) => list.map(item => item.id as T).filter(id => picked.includes(id));
  const goals = order(GOALS, answers.goals);
  const stamp = now.toISOString();
  return {
    version: ONBOARDING_VERSION,
    status,
    work_type: answers.workType,
    work_type_other: answers.workType === 'other' ? text(answers.workTypeOther) : null,
    occupations: order(OCCUPATIONS, answers.occupations),
    occupation_other: answers.occupations.includes('other') ? text(answers.occupationOther) : null,
    goals: goals.includes(EXCLUSIVE_GOAL) ? [EXCLUSIVE_GOAL] : goals,
    ...(status === 'SKIPPED' && skippedAtStep ? { skipped_at_step: skippedAtStep } : {}),
    updated_at: stamp,
    ...(status === 'COMPLETED' ? { completed_at: previous?.completed_at ?? stamp } : {}),
  };
}
export function answersOf(record?: OnboardingRecord | null): OnboardingAnswers {
  if (!record) return { ...EMPTY_ANSWERS };
  return { workType: record.work_type, workTypeOther: record.work_type_other ?? '', occupations: [...record.occupations],
    occupationOther: record.occupation_other ?? '', goals: [...record.goals] };
}

/** Asked once, after the first sign-in of an account created since the rollout; answered or skipped, never again. */
export function shouldShowOnboarding(input: { createdAt?: string | null; onboarding?: unknown; guest?: boolean; groupWorkspace?: boolean }): boolean {
  if (input.guest || input.groupWorkspace || input.onboarding) return false;
  const created = input.createdAt ? Date.parse(input.createdAt) : NaN;
  return Number.isFinite(created) && created >= ONBOARDING_ROLLOUT_AT;
}

// What the answers already do in the app (as the old setup wizard did): the work type picks the menu's default
// grouping (userPersona), and the occupations add their kinds of work to the job type picker.
export function personaForWorkType(workType: WorkTypeId | null): 'school' | 'university' | 'freelance' | 'employee' | undefined {
  switch (workType) {
    case 'freelance': case 'business_owner': return 'freelance';
    case 'employee': return 'employee';
    case 'student': return 'university';
    default: return undefined;
  }
}
const JOB_TYPE_FOR: Record<Exclude<OccupationId, 'other'>, string> = {
  content_creator: 'Sponsored Post', video_graphic: 'Video Production', developer_digital: 'Digital Product',
  marketing: 'การตลาด / โฆษณา', photo_video: 'ถ่ายภาพ / วิดีโอ', teacher_coach: 'สอน / โค้ช', trade_owner: 'ขายสินค้า / บริการ',
};
/** The job types to add for these occupations, those not in the list already. */
export function jobTypesForOccupations(occupations: OccupationId[], existing: string[]): string[] {
  const have = new Set(existing.map(type => type.trim().toLowerCase()));
  return Array.from(new Set(occupations.filter((id): id is Exclude<OccupationId, 'other'> => id !== 'other').map(id => JOB_TYPE_FOR[id])))
    .filter(type => !have.has(type.toLowerCase()));
}

// ---- Admin analytics: segments from the answers, and what each segment really does ----

/** What every account did, counted from its own records (never their contents): automatic, nothing asked. */
export interface OnboardingBehavior {
  project_created: number;
  document_created: number;
  expense_created: number;
  ai_message_sent: number;
  pro_subscription_activated: boolean;
  /** Days with any page opened in the report's period, and whether that is more than one (came back). */
  active_days: number;
}
export const BEHAVIOR_KEYS = ['project_created', 'document_created', 'expense_created', 'ai_message_sent'] as const;

export interface OnboardingSegment {
  id: string;
  accounts: number;
  /** Accounts with at least one of each, out of `accounts`. */
  project_created: number;
  document_created: number;
  expense_created: number;
  ai_message_sent: number;
  pro_subscription_activated: number;
  /** Used the app on two or more days in the period. */
  returned: number;
}
export interface OnboardingAnalytics {
  /** Accounts that could be asked (created since the rollout). */
  eligible: number;
  completed: number;
  skipped: number;
  /** Eligible, not answered yet (has not signed in since, or closed the page). */
  pending: number;
  workTypes: OnboardingSegment[];
  occupations: OnboardingSegment[];
  goals: OnboardingSegment[];
  /** The typed "อื่น ๆ" answers, most common first (for new options), at most 20. */
  otherWorkTypes: { text: string; accounts: number }[];
  otherOccupations: { text: string; accounts: number }[];
}

export function onboardingAnalytics(accounts: { createdAt: string | null; onboarding: unknown; behavior: OnboardingBehavior }[]): OnboardingAnalytics {
  const segment = (id: string, rows: typeof accounts): OnboardingSegment => ({
    id, accounts: rows.length,
    project_created: rows.filter(row => row.behavior.project_created > 0).length,
    document_created: rows.filter(row => row.behavior.document_created > 0).length,
    expense_created: rows.filter(row => row.behavior.expense_created > 0).length,
    ai_message_sent: rows.filter(row => row.behavior.ai_message_sent > 0).length,
    pro_subscription_activated: rows.filter(row => row.behavior.pro_subscription_activated).length,
    returned: rows.filter(row => row.behavior.active_days >= 2).length,
  });
  const eligible = accounts.filter(row => row.createdAt && Date.parse(row.createdAt) >= ONBOARDING_ROLLOUT_AT);
  const answered = accounts.flatMap(row => {
    const parsed = onboardingRecordSchema.safeParse(row.onboarding);
    return parsed.success ? [{ ...row, record: parsed.data }] : [];
  });
  const others = (pick: (record: OnboardingRecord) => string | null) => {
    const counts = new Map<string, number>();
    for (const row of answered) { const text = pick(row.record)?.toLowerCase(); if (text) counts.set(text, (counts.get(text) ?? 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([text, count]) => ({ text, accounts: count }));
  };
  return {
    eligible: eligible.length,
    completed: answered.filter(row => row.record.status === 'COMPLETED').length,
    skipped: answered.filter(row => row.record.status === 'SKIPPED').length,
    pending: eligible.filter(row => !row.onboarding).length,
    workTypes: WORK_TYPES.map(type => segment(type.id, answered.filter(row => row.record.work_type === type.id))),
    occupations: OCCUPATIONS.map(item => segment(item.id, answered.filter(row => row.record.occupations.includes(item.id)))),
    goals: GOALS.map(goal => segment(goal.id, answered.filter(row => row.record.goals.includes(goal.id)))),
    otherWorkTypes: others(record => record.work_type_other),
    otherOccupations: others(record => record.occupation_other),
  };
}
