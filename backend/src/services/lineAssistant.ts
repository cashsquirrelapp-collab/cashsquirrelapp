import { randomUUID, createHash } from 'node:crypto';
import { insertRecord, patchPrivate } from '../repositories/accounts.js';
import { validateChanges } from '../../../shared/validation.js';
import { whtAmountFor, roundMoney } from '../../../shared/wht.js';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import { calculatePayDate, getRelativeDaysText, formatMonthKey, DEFAULT_JOB_TYPES } from '../../../shared/calendar.js';
import type { Expense, Goal } from '../../../shared/types.js';
import type { LineMessage } from './line.js';
import { appOrigin } from '../config/env.js';
import { parseLineQuickDraft } from './lineQuickDraft.js';
import { getLineAiPolicy, compactLineAiContext } from './lineAiPolicy.js';
import { listVaultFiles } from './vault.js';
import { lineDraftKey, lineDraftOperationId, buildLineDraftReview } from './lineDraftReview.js';
import { explicitLineAiText, LINE_JOB_EXAMPLES } from './lineEntryRouting.js';
import { isActiveLineDraft, lineDraftResolution } from './lineDraftState.js';
import { buildLineFeatureShortcut, isLineWhtShortcut } from './lineFeatureShortcuts.js';
import { parseLineDocumentRequest, findLineDocuments, buildLineDocumentMessages } from './lineDocuments.js';
import { buildLineCashSummary, lineCashPosition, type LineCashPosition } from './lineCashSummary.js';
import { monthlyProfitSummary } from '../../../shared/monthlySummary.js';
import type { CashOpening } from '../../../shared/cashBalance.js';
import { type LineCardCharacter, lineCard, lineJobItem, lineValueRow, lineSection, lineDivider, lineAppLink, LINE_CARD_COLORS as C, MAX_LINE_ITEMS } from './lineCards.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';
import { decodeDueAction, handleDueAction, handleDuePartialText } from './lineDuePayments.js';
import {
  JobRow,
  ExpenseRow,
  SettingsRow,
  currentMonthKey,
  previousMonthKey,
  computeMonthlySummary,
  jobsInMonth,
  dateKeyInMonth,
  formatCurrency,
} from './monthlySummary.js';

// No open-ended multi-turn chat wizard for adding a job/expense -- that flow was removed for
// leaving people stuck mid-conversation answering the wrong follow-up question, with no way out.
// What replaced it: the LIFF form (api/liff-submit.ts) for a proper multi-field UI, and --
// natural-language add-job/add-expense (classifyMessage extracts a draft, then the user confirms
// it before any financial write). A bounded "pending job draft" (see
// lineDraftState / saveJobDraft / clearJobDraft below): if a message is missing a
// required field, what was captured is saved and the reply asks specifically for what's left, so
// a short follow-up (just a number, just a name) completes the draft instead of making the user retype
// the whole thing -- but it expires on its own after 15 minutes and is never
// surfaced as "still waiting", so there's still no state a user can get permanently stuck in.
// Ordinary text uses fixed commands and draft forms (zero AI calls). Only "ถาม AI ..." is a Claude-answered
// question grounded in the user's real data -- with a static fallback (HELP_TEXT) if Claude is
// unconfigured or errors (e.g. rate limited), so a Claude outage degrades to "here are the
// buttons" instead of a raw error or a stuck conversation.

interface StatusRow {
  id: string;
  label: string;
  behavior: 'done' | 'partial' | 'pending';
}

interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  text: string;
}

interface NotifSettingsRow {
  lineUserId?: string;
  lineLinkCode?: string;
  lineLinkCodeExpiresAt?: string;
  pendingJobDraft?: { draft: JobDraft; createdAt: string; operationKey?: string };
  pendingExpenseDraft?: { draft: ExpenseDraft; createdAt: string; operationKey?: string };
  userName?: string;
  nameAskedAt?: string;
  chatHistory?: ChatHistoryEntry[];
  chatHistoryUpdatedAt?: string;
  [key: string]: unknown;
}

// Short-term memory for follow-up questions ("แล้วเดือนที่แล้วล่ะ", "อันนั้นด้วย") within one
// sitting -- NOT a permanent chat log. Capped at a few turns and expires after a gap of
// inactivity, same TTL philosophy as the job draft above: it should feel like the bot remembers
// what you *just* said, never like it's recalling something from an unrelated conversation days
// ago. Only conversational text replies get saved here (question/other answers, "still missing a
// field" prompts) -- quick-reply button taps and job/expense-saved receipt cards are deterministic
// lookups/confirmations, not something a follow-up question would need to reference.
const CHAT_HISTORY_TTL_MS = 20 * 60 * 1000;
const CHAT_HISTORY_MAX_TURNS = 3;

// Same trial length and Pro-check shape as api/send-overdue-digest.ts's isPro -- LINE chat is a
// Pro-only feature (per PlansTab's feature list), so once neither the free trial nor a paid
// period covers this user anymore, handleAssistantMessageInner short-circuits to a renewal
// prompt instead of processing the message. Duplicated rather than shared: this codebase already
// keeps FREE_TRIAL_DAYS as an independent constant per file (App.tsx, send-overdue-digest.ts,
// send-monthly-report.ts) since there's no server/client-shared config module.
const FREE_TRIAL_DAYS = 14;

export async function isProUser(userId: string): Promise<boolean> {
  const [{ data: authUser, error: authErr }, { data: sub, error: subErr }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('subscriptions').select('status, plan, current_period_end').eq('user_id', userId).maybeSingle(),
  ]);
  // Fail closed when the subscription or auth lookup fails; do not grant Pro on an unknown state.
  if (authErr || subErr) {
    console.error('isProUser: lookup failed, denying access:', { authErr, subErr });
    return false;
  }

  const createdAt = authUser?.user?.created_at;
  const isAdminRevoked = ['admin_revoked', 'admin_removed'].includes(sub?.plan || '');
  const isInFreeTrial = !isAdminRevoked && !!createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000 > Date.now();

  const isPaidActive = sub?.status === 'active' && (
    sub.plan === 'admin_grant' ||
    (!!sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now())
  );

  return !isAdminRevoked && (isInFreeTrial || isPaidActive);
}

// Shown instead of processing anything once a user's trial/paid period has lapsed -- polite,
// in-character, and points to the authenticated app. Checkout must be created by the backend so
// the account/workspace mapping cannot be supplied by an untrusted link parameter.
function buildRenewalMessage(user: UserRow): LineMessage {
  // `/plans` is the app's authenticated upgrade route. When the LINE in-app browser is not
  // signed in yet, App keeps this pathname while rendering Login, then canonicalizes it to the
  // user's `/plans/<workspace>` route once the session and workspace profile are available.
  const url = new URL('/plans', appOrigin());
  return {
    type: 'text',
    text: `แพ็กเกจ Pro ของคุณหมดอายุแล้วครับ 🥲 การคุยกับผมผ่าน LINE เป็นสิทธิ์ของสมาชิก Pro น่ะครับ\n\nต่ออายุง่ายๆ กดลิงก์นี้ได้เลย พอจ่ายเสร็จกลับมาคุยกับผมต่อได้ทันที: ${url.toString()}`,
  };
}

export interface UserRow {
  user_id: string;
  operationId?: string;
  lastWriteWasDuplicate?: boolean;
  email?: string;
  jobs?: JobRow[];
  goals?: Goal[];
  settings?: SettingsRow & { cashOpening?: CashOpening };
  expenses?: ExpenseRow[];
  statuses?: StatusRow[];
  notif_settings?: NotifSettingsRow;
}

export interface JobDraft {
  name?: string;
  client?: string;
  type?: string;
  value?: number;
  creditTerm?: number;
  paymentStatus?: string; // 'paid' | 'partial' | 'pending'
  receivedAmount?: number;
  whtRate?: number; // หัก ณ ที่จ่าย % -- 0 unless the caller (e.g. the LIFF form) sets it
  note?: string;
}

export interface ExpenseDraft {
  name?: string;
  category?: string;
  amount?: number;
  note?: string;
}

// Throws on a genuine Supabase/query error (caller must not treat that the same as "not
// linked" -- doing so once told an already-linked user their account wasn't found, which reads
// as the bot lying). Only a real empty result means "not linked", so the caller can fall back
// to the link-code flow.
export async function findUserByLineId(lineUserId: string): Promise<UserRow | null> {
  const linked = await supabaseAdmin.from('cashflow_line_links').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (linked.error) throw linked.error;
  if (!linked.data) return null;
  const { data, error } = await supabaseAdmin.from('cashflow_account_snapshot').select('user_id, email, jobs, goals, settings, expenses, statuses, notif_settings').eq('user_id', linked.data.user_id).single();
  if (error) {
    console.error('findUserByLineId error:', error);
    throw new Error(`findUserByLineId: ${error.message}`);
  }
  return (data as UserRow) || null;
}

function getClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey, timeout: 30000, maxRetries: 1 });
}

// A burst of messages can trip the API's rate limit (HTTP 429) -- one short retry smooths that
// over without adding much latency to a chat reply.
async function callWithRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : String(err);
    const isRateLimited = status === 429 || message.includes('rate_limit') || message.includes('RESOURCE_EXHAUSTED');
    if (isRateLimited && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      return callWithRetry(fn, attempt + 1);
    }
    throw err;
  }
}

interface DataSnapshot {
  cash: LineCashPosition;
  wip: { name: string; client: string; value: number }[];
  unpaid: { name: string; client: string; pending: number; dueDate: string | null; dueText: string }[];
  overdue: { name: string; client: string; pending: number; overdueText: string }[];
  dueToday: { name: string; client: string; pending: number }[];
  dueSoon: { name: string; client: string; pending: number; dueText: string; daysCount: number }[];
  thisMonth: ReturnType<typeof computeMonthlySummary> & { monthKey: string };
  lastMonth: ReturnType<typeof computeMonthlySummary> & { monthKey: string };
  thisMonthJobs: { name: string; client: string; value: number; pending: number; status: string; isPosted?: boolean; isUnpaid: boolean }[];
  upcomingForecast: { monthKey: string; expectedIncome: number }[];
  goals: { name: string; type: string; target: number; current: number; deadline: string; allocatedPercentage?: number }[];
  totalPendingAllTime: number;
}

type MonthlySummaryWithMonth = DataSnapshot['thisMonth'];

/**
 * Keep the assistant's structured financial context faithful to the source calculation.
 * A negative net flow is a real shortfall, not zero available cash, and must reach the model
 * unchanged so it cannot give a falsely reassuring answer.
 */
export function formatAssistantMonthlySummary(summary: MonthlySummaryWithMonth) {
  const profit = monthlyProfitSummary(summary);
  return {
    เดือน: summary.monthKey,
    รับแล้วจริง: formatCurrency(summary.received),
    รายจ่ายรวมตามแอป_รวมประจำและทั่วไป: formatCurrency(profit.totalExpense),
    กำไรสุทธิเดือนนี้_ก่อนแบ่งออม: formatCurrency(profit.netProfit),
    เงินรับหักเฉพาะรายจ่ายที่จ่ายแล้ว_ไม่ใช่กำไร: formatCurrency(summary.received - summary.variableExpense),
    รายจ่ายที่บันทึกจริง: formatCurrency(summary.variableExpense),
    เงินย้ายเข้ากระปุก: formatCurrency(summary.cashGoalDeductions),
    งบประจำที่ตั้งไว้_ยังไม่ใช่รายการจ่ายจริง: formatCurrency(summary.fixedExpenseCalculated),
    กระแสเงินสดสุทธิหลังเผื่องบประจำ: formatCurrency(summary.netFlow),
  };
}

function addMonthsToKey(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// All the deterministic math lives here in plain JS -- matches the app's own formulas exactly
// (via computeMonthlySummary), so answers can't drift from what the app itself shows.
function buildDataSnapshot(user: UserRow): DataSnapshot {
  const jobs = user.jobs || [];
  const statuses = user.statuses || [];
  const isUnpaidBehavior = (statusId: string) => statusBehavior(statuses, statusId) !== 'done';

  const wip = jobs
    .filter((j) => j.isPosted === false)
    .map((j) => ({ name: j.name, client: j.client || '', value: j.value || 0 }));

  const unpaidJobs = jobs.filter((j) => (j.pending || 0) > 0 && isUnpaidBehavior(j.status || ''));
  const unpaid = unpaidJobs.map((j) => {
    const dateStr = j.dueDate || j.payDate;
    return { name: j.name, client: j.client || '', pending: j.pending || 0, dueDate: dateStr || null, dueText: dateStr ? getRelativeDaysText(dateStr).text : 'ไม่ระบุวันครบกำหนด' };
  });

  const overdue = unpaidJobs
    .filter((j) => {
      const dateStr = j.dueDate || j.payDate;
      return dateStr ? getRelativeDaysText(dateStr).isOverdue : false;
    })
    .map((j) => {
      const rel = getRelativeDaysText(j.dueDate || j.payDate);
      return { name: j.name, client: j.client || '', pending: j.pending || 0, overdueText: rel.text };
    });

  const dueToday = unpaidJobs
    .filter((j) => {
      const dateStr = j.dueDate || j.payDate;
      return dateStr ? getRelativeDaysText(dateStr).text === 'วันนี้' : false;
    })
    .map((j) => ({ name: j.name, client: j.client || '', pending: j.pending || 0 }));

  // "เร็วๆ นี้" / "ใกล้ครบกำหนด" in conversation means within about 10 days (confirmed with the
  // user) -- a separate, tighter bucket than the full unpaid list so free-form Q&A about what's
  // due soon doesn't dump every unpaid job regardless of how far out it is. Sorted nearest-first;
  // jobs with no due date at all are excluded since they can't be "soon" by definition.
  const dueSoon = unpaidJobs
    .map((j) => {
      const dateStr = j.dueDate || j.payDate;
      if (!dateStr) return null;
      const rel = getRelativeDaysText(dateStr);
      if (rel.daysCount > 10) return null;
      return { name: j.name, client: j.client || '', pending: j.pending || 0, dueText: rel.text, daysCount: rel.daysCount };
    })
    .filter((j): j is { name: string; client: string; pending: number; dueText: string; daysCount: number } => j !== null)
    .sort((a, b) => a.daysCount - b.daysCount);

  const thisMonthKey = currentMonthKey();
  const lastMonthKey = previousMonthKey();
  const thisMonth = { ...computeMonthlySummary(jobs, user.expenses || [], user.goals || [], user.settings || {}, thisMonthKey), monthKey: thisMonthKey };
  const lastMonth = { ...computeMonthlySummary(jobs, user.expenses || [], user.goals || [], user.settings || {}, lastMonthKey), monthKey: lastMonthKey };

  // Use the same dated payments and scheduled balances as the dashboard, including WIP.
  const thisMonthJobs = jobsInMonth(jobs, thisMonthKey).map((j) => ({
    name: j.name,
    client: j.client || '',
    value: j.value || 0,
    pending: j.pending || 0,
    status: j.status || '',
    isPosted: j.isPosted,
    isUnpaid: (j.pending || 0) > 0 && isUnpaidBehavior(j.status || ''),
  }));

  const totalPendingAllTime = unpaidJobs.reduce((sum, j) => sum + (j.pending || 0), 0);

  // Same idea as the Dashboard's 4-month "เรดาร์เสบียง" forecast: for each of the next 3 months,
  // sum already-confirmed received amounts plus pending amounts for jobs that have actually been
  // posted (skips WIP jobs with no real due date yet) whose payDate/postDate falls in that month.
  const upcomingForecast = [1, 2, 3].map((n) => {
    const monthKey = addMonthsToKey(thisMonthKey, n);
    const expectedIncome = jobs.reduce((sum, j) => {
      const dateKey = j.payDate || j.postDate;
      if (!dateKeyInMonth(dateKey, monthKey)) return sum;
      if ((j.received || 0) > 0) return sum + (j.received || 0);
      if ((j.pending || 0) > 0 && j.isPosted !== false) return sum + (j.pending || 0);
      return sum;
    }, 0);
    return { monthKey, expectedIncome };
  });

  const goals = (user.goals || []).map((g) => ({
    name: g.name,
    type: g.type,
    target: g.target,
    current: g.current,
    deadline: g.deadline,
    allocatedPercentage: g.allocatedPercentage,
  }));

  return { cash: lineCashPosition(user), wip, unpaid, overdue, dueToday, dueSoon, thisMonth, lastMonth, thisMonthJobs, upcomingForecast, goals, totalPendingAllTime };
}

// LINE's chat UI renders plain text only -- markdown shows up as literal asterisks/hashes, which
// reads as an obviously-AI-generated wall of symbols. The prompt already says not to use it, but
// that's not 100% reliable, so strip the common cases as a backstop.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[*-]\s+/gm, '');
}

const EXPENSE_CATEGORIES = ['ค่าอุปกรณ์/ซอฟต์แวร์', 'ค่าโฆษณา/ยิงแอด', 'ค่าเดินทาง/น้ำมัน', 'อาหาร/รับรองลูกค้า', 'จ้างงานต่อ (Outsource)', 'ภาษี/ธรรมเนียม', 'ค่าบริการ/สาธารณูปโภค', 'อื่นๆ'];

export interface ClassifyResult {
  intent: 'add_job' | 'add_expense' | 'question' | 'other';
  jobName?: string;
  jobClient?: string;
  jobType?: string;
  jobValue?: number;
  jobCreditTerm?: number;
  jobPaymentStatus?: 'paid' | 'partial' | 'pending';
  jobReceivedAmount?: number;
  jobWhtRate?: number;
  expenseName?: string;
  expenseCategory?: string;
  expenseAmount?: number;
  answer?: string;
  userName?: string;
}

// Single Claude call handles three things at once (question answering, add-job extraction,
// add-expense extraction) -- merging call sites is what fixed the free-tier 429 rate limit
// before (see git history), so this stays one call rather than three. `pendingJobDraft`, when
// present, is folded into the prompt so a short follow-up ("1500", just a client name) gets
// interpreted as completing that draft rather than as an unrelated message with no job context
// at all -- the caller (handleAssistantMessageInner) does its own field-level merge on top as a
// safety net regardless of how well the model followed that instruction.
async function classifyMessage(
  text: string,
  snapshot: DataSnapshot,
  pendingJobDraft?: JobDraft,
  knownUserName?: string,
  recentHistory?: ChatHistoryEntry[],
  pendingExpenseDraft?: ExpenseDraft
): Promise<ClassifyResult | null> {
  const policy = getLineAiPolicy();
  if (!policy.enabled) return null;
  const ai = getClaudeClient();
  if (!ai) return null;

  const formatted = {
    เงินสะสมตามรายการในแอป: { ยอดทั้งหมดรวมกระปุก: formatCurrency(snapshot.cash.balance), พร้อมใช้หลังแยกกระปุก: formatCurrency(snapshot.cash.readyToSpend), ในกระปุก: formatCurrency(snapshot.cash.inGoals), มีเงินตั้งต้น: snapshot.cash.hasOpening },
    งานที่ยังไม่โพสต์_สต็อกงาน: snapshot.wip.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)}`),
    งานที่ยังไม่จ่ายเงิน: snapshot.unpaid.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} กำหนดชำระ ${j.dueText}${j.dueDate ? ` (วันที่ ${j.dueDate}, เดือน ${j.dueDate.slice(0, 7)})` : ''}`),
    งานที่เลยกำหนดชำระแล้ว: snapshot.overdue.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} (${j.overdueText})`),
    งานที่ครบกำหนดชำระวันนี้: snapshot.dueToday.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ${formatCurrency(j.pending)}`),
    งานที่ใกล้ครบกำหนด_ภายใน10วัน_เรียงใกล้สุดก่อน: snapshot.dueSoon.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} (${j.dueText})`),
    งานที่เข้าเดือนนี้: snapshot.thisMonthJobs.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)} ${j.isUnpaid ? `(ค้าง ${formatCurrency(j.pending)})` : j.isPosted === false ? '(ในสต็อก)' : '(จ่ายแล้ว)'}`),
    ยอดค้างรับทั้งหมดรวมทุกงาน: formatCurrency(snapshot.totalPendingAllTime),
    สรุปเดือนนี้: formatAssistantMonthlySummary(snapshot.thisMonth),
    สรุปเดือนที่แล้ว: formatAssistantMonthlySummary(snapshot.lastMonth),
    พยากรณ์รายรับเดือนถัดไป_3เดือน: snapshot.upcomingForecast.map((f) => `${formatMonthKey(f.monthKey)} (เดือน ${f.monthKey}): คาดว่าจะได้รับ ${formatCurrency(f.expectedIncome)} (รวมยอดที่รับแล้ว+ยอดค้างรับของงานที่ส่งมอบแล้วซึ่งมีกำหนดชำระในเดือนนี้ ไม่รวมงานสต็อกที่ยังไม่ส่งมอบเพราะยังไม่รู้วันชำระแน่นอน)`),
    เป้าหมายออม: snapshot.goals.map((g) => `${g.name} เป้าหมาย ${formatCurrency(g.target)} สะสมแล้ว ${formatCurrency(g.current)} (${g.target > 0 ? Math.round((g.current / g.target) * 100) : 0}%) กำหนดเสร็จ ${g.deadline}${g.allocatedPercentage ? ` แบ่งจากกำไรอัตโนมัติ ${g.allocatedPercentage}%` : ''}`),
  };

  try {
    const response = await callWithRetry(() =>
      ai.messages.create({
        model: policy.model,
        // Was 1024 -- too tight once the tool call's "answer" field carries a real Thai
        // explanation (e.g. "what's included in this number") alongside the JSON scaffolding;
        // hitting the cap mid-answer truncates the tool_use JSON, which then fails to parse
        // and silently returns null below with nothing logged. 4096 gives real headroom.
        max_tokens: policy.maxOutputTokens,
        tool_choice: { type: 'tool', name: 'extract_result' },
        tools: [
          {
            name: 'extract_result',
            description: 'บันทึกผลการตีความข้อความของผู้ใช้',
            input_schema: {
              type: 'object',
              properties: {
                intent: { type: 'string', enum: ['add_job', 'add_expense', 'question', 'other'] },
                jobName: { type: 'string' },
                jobClient: { type: 'string' },
                jobType: { type: 'string' },
                jobValue: { type: 'number' },
                jobCreditTerm: { type: 'number' },
                jobPaymentStatus: { type: 'string', enum: ['paid', 'partial', 'pending'] },
                jobReceivedAmount: { type: 'number' },
                jobWhtRate: { type: 'number' },
                expenseName: { type: 'string' },
                expenseCategory: { type: 'string' },
                expenseAmount: { type: 'number' },
                answer: { type: 'string' },
                userName: { type: 'string' },
              },
              required: ['intent'],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `คุณคือ "พี่กระรอก" มาสคอตของแอปกระรอกตุนเงิน (แอปบันทึกรายรับ-รายจ่ายสำหรับฟรีแลนซ์) ตอบคำถามผู้ใช้ในแชท LINE

บุคลิก:
- สวมบทบาทเป็น "พี่กระรอก" ตัวละครกระรอกจริงๆ ไม่ใช่ AI ผู้ช่วย -- เป็นเพื่อนสนิทที่คอยช่วยดูแลเรื่องเงินให้ พูดจาน่ารัก อ่อนโยน เป็นมิตร เหมือนแชทคุยกับเพื่อนที่ห่วงใยกัน
- ห้ามพูดจาแบบทางการหรือแบบหุ่นยนต์/AI เด็ดขาด -- ห้ามใช้คำศัพท์ทางการ/ราชาศัพท์แบบเอกสารราชการ เช่น "ดำเนินการ", "จัดสรร", "ตามที่ท่านได้แจ้ง", "รบกวนสอบถาม", "โปรดทราบ" ให้ใช้คำง่ายๆ แบบพูดคุยจริงแทน (เช่น "ทำให้แล้ว" ไม่ใช่ "ดำเนินการให้แล้ว", "เดี๋ยวเช็คให้" ไม่ใช่ "จะดำเนินการตรวจสอบให้")
- ใช้คำลงท้าย/คำเติมแบบคนไทยคุยกันจริงๆ ปนไปได้เป็นธรรมชาติ เช่น "นะ" "อ่ะ" "เนอะ" "เลย" "ล่ะ" "ป่ะ" ไม่ต้องเติม "ครับ" ทุกประโยคจนดูเป็นแพทเทิร์นตายตัว -- อ่านแล้วต้องรู้สึกเหมือนเพื่อนพิมพ์มา ไม่ใช่ระบบตอบอัตโนมัติ
- ห้ามใช้คำหยาบ คำไม่สุภาพ หรือคำแสลงหยาบคายเด็ดขาดไม่ว่ากรณีใด แม้ผู้ใช้จะพิมพ์คำหยาบมาก่อนก็ตาม ให้พูดจาสุภาพน่ารักเสมอ (สุภาพได้โดยไม่ต้องเป็นทางการ)
- แซวหรือเปรียบเทียบธีมกระรอก/เก็บเสบียง/โพรงไม้ได้บ้างเป็นครั้งคราวให้ดูมีคาแรคเตอร์ แต่อย่าใส่ทุกประโยคจนดูฝืน
- ถ้าข่าวไม่ดี (เช่น มีงานค้างจ่าย เกินกำหนด) ให้บอกตรงไปตรงมาด้วยความเข้าใจและให้กำลังใจ ไม่ตำหนิหรือทำให้รู้สึกแย่
- ความเป็นกันเองต้องไม่ทำให้คำตอบยืดยาวหรือคลุมเครือ -- ยังต้องตอบสั้น กระชับ ตรงประเด็นตามกฎด้านล่างเสมอ
- ${knownUserName ? `รู้จักผู้ใช้คนนี้แล้ว ชื่อ "${knownUserName}" ให้เรียกชื่อนี้เป็นบางครั้งอย่างเป็นธรรมชาติเวลาทักทายหรือตอบ (ไม่ต้องเรียกทุกประโยคจนดูเยิ่นเย้อ)` : 'ยังไม่รู้ชื่อผู้ใช้คนนี้ -- ห้ามถามชื่อเองในคำตอบ (ระบบจะถามให้แยกต่างหากถ้าจำเป็น) แค่ตอบคำถามตามปกติไปก่อน'}
- ถ้าข้อความนี้ผู้ใช้บอกชื่อตัวเอง (เช่น "ผมชื่อปาร์ค", "หนูชื่อฝนนะ", "เรียกว่าต้นก็ได้", "ชื่อเบียร์ครับ") ให้ทักทายตอบรับชื่อนั้นอย่างอบอุ่นน่ารักในคำตอบด้วย
${recentHistory && recentHistory.length > 0 ? `
บทสนทนาล่าสุด (เรียงจากเก่าไปใหม่ นี่คือสิ่งที่คุยกันไปแล้วเมื่อครู่ในแชทเดียวกันนี้):
${recentHistory.map((h) => `${h.role === 'user' ? 'ผู้ใช้' : 'คุณ'}: ${h.text}`).join('\n')}

ใช้บทสนทนานี้ช่วยตีความข้อความใหม่ด้านล่าง โดยเฉพาะถ้ามีคำแทนหรือคำถามต่อเนื่อง (เช่น "อันนั้นล่ะ", "เดือนที่แล้วบ้าง", "แล้วอันนี้", "ทำไมล่ะ") ให้เข้าใจว่ากำลังพูดถึงเรื่องอะไรจากบทสนทนาข้างบน อย่าทักทายซ้ำหรือถามซ้ำสิ่งที่เพิ่งคุยไปแล้ว ให้ตอบต่อเนื่องเหมือนคุยกันมาตลอด` : ''}

กฎสำคัญ:
- ห้ามใช้สัญลักษณ์จัดรูปแบบแบบ markdown เด็ดขาด (ห้ามใช้ ** ทำตัวหนา, ห้ามใช้ # หัวข้อ, ห้ามใช้ * หรือ - นำหน้าเป็น bullet) เพราะแชท LINE ไม่รองรับ markdown จะเห็นเป็นสัญลักษณ์ดิบๆ แทน ให้เขียนเป็นข้อความธรรมดาล้วนๆ ใช้การขึ้นบรรทัดใหม่แทนถ้าต้องแยกรายการ
- ตอบจาก "ข้อมูลบัญชีจริง" ด้านล่างเท่านั้น ห้ามเดาหรือสร้างตัวเลข/รายการที่ไม่มีในข้อมูลนี้ขึ้นมาเองเด็ดขาด ห้ามให้ข้อมูลเท็จหรือคาดเดาแทนการบอกว่าไม่รู้
- ถ้าคำถามต้องการข้อมูลที่ไม่มีอยู่ในนี้เลย ให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนั้น อย่าแต่งคำตอบขึ้นมา
- ตอบสั้น กระชับ ตรงประเด็นกับสิ่งที่ถาม อย่าตอบกำกวมหรือคลุมเครือ เป็นธรรมชาติแบบคุยกันในแชท ภาษาไทย ไม่ต้องทักทายซ้ำ
- ตอบเฉพาะสิ่งที่ถูกถามเท่านั้น ห้ามพ่วงข้อมูลอื่นที่ไม่ได้ถามเข้ามาเองแม้จะมีข้อมูลนั้นอยู่ในมือก็ตาม เช่น ถ้าถามแค่ "เพิ่มสต็อกได้ไหม" (คำถามใช่/ไม่ใช่ง่ายๆ) ให้ตอบแค่ว่าได้ครับ พร้อมวิธีทำถ้าจำเป็น ห้ามพ่วงรายการสต็อกที่มีอยู่ตอนนี้ทั้งหมดเข้ามาด้วยทั้งที่ไม่มีใครถามถึง ยิ่งข้อมูลเยอะยิ่งต้องเลือกเฉพาะส่วนที่ตอบคำถามจริงๆ ไม่ใช่โชว์ทุกอย่างที่มีอยู่ในมือ
- ห้ามเขียนคำตอบเป็นพารากราฟยาวๆ ก้อนเดียวเหมือนบทความเด็ดขาด ให้เขียนสั้นๆ แบบคนจริงพิมพ์แชทหากัน (1-2 ประโยคสั้นๆ ต่อช่วง) ถ้ามีหลายเรื่องที่จะพูดจริงๆ ให้แยกแต่ละเรื่องด้วยการเว้นบรรทัดว่าง (เคาะ Enter สองครั้ง) แต่ละช่วงจะกลายเป็นข้อความแยกกันเหมือนพิมพ์ทีละข้อความจริงๆ (ระบบจะแยกส่งให้เองสูงสุด 3 ข้อความ) แต่ถ้าคำตอบสั้นพอเรื่องเดียวจบ ก็ไม่ต้องเว้นบรรทัดเลย
- ถ้ารายการว่างเปล่า (ไม่มีงานในหมวดที่ถาม) ให้ตอบว่าไม่มีอย่างชัดเจน เป็นข่าวดีไม่ใช่ข้อผิดพลาด
- ถ้าถามยอดเงินคงเหลือตอนนี้ ให้ใช้ "เงินสะสมตามรายการในแอป": ยอดทั้งหมดรวมเงินในกระปุก และพร้อมใช้คือยอดหลังแยกกระปุกแล้ว ยอดนี้มาจากเงินตั้งต้นและรายการทั้งหมด ไม่ใช่ยอดธนาคารที่เชื่อมแบบเรียลไทม์ หากยังไม่มีเงินตั้งต้นให้บอกว่าคิดจากรายการที่บันทึกเท่านั้น
- รายจ่ายรวมหมายถึงรายจ่ายที่บันทึกว่าจ่ายจริงเท่านั้น เงินย้ายเข้ากระปุกยังเป็นเงินของผู้ใช้ ไม่ใช่รายจ่าย ส่วนงบประจำที่ตั้งไว้เป็นแผน ห้ามรวมเป็นรายจ่ายจริงหรือหักจากยอดเงินสะสม หากถามกำไรให้ใช้รายรับหักรายจ่ายของช่วงเวลาที่ถาม พร้อมระบุว่าเป็นรายการที่บันทึก ไม่ใช่กำไรทางบัญชีที่ตรวจครบแล้ว
- "กระแสเงินสดสุทธิหลังเผื่องบประจำ" ใช้เฉพาะคำถามเรื่องแผนงบประมาณ ไม่ใช่เงินคงเหลือหรือกำไร ยอดติดลบให้เรียกว่าเงินที่ยังขาดตามแผน ห้ามตอบว่ายอดเงินที่มีติดลบเพราะการกันงบ ถ้ารายจ่ายจริงเกินรายรับให้ระบุว่า "จ่ายมากกว่ารับ" พร้อมจำนวนที่เกิน ไม่ปิดบังส่วนขาด
- ถ้าถามว่าตัวเลขรวมอะไรบ้าง ให้อธิบายช่วงเวลาและรายการที่ใช้คำนวณ รายการที่ยังไม่ได้บันทึกจะไม่รวมในยอด
- ถ้าคำถามเกี่ยวกับการเพิ่ม/แก้ไข/ลบข้อมูล ให้แนะนำให้กดปุ่ม "สั่งงานเลขา" แทน เพราะที่นี่ตอบได้แค่คำถาม แก้ไขข้อมูลไม่ได้
- ปุ่มลัดที่มีอยู่จริงในแชทมีแค่นี้เท่านั้น: "สั่งงานเลขา", "รอรับเงิน", "สรุปเดือนนี้", "งานเดือนนี้", "กำลังดำเนินงาน" ห้ามอ้างถึงหรือแนะนำปุ่มชื่ออื่นที่ไม่มีอยู่ในรายการนี้เด็ดขาด (เช่นห้ามพูดถึงปุ่ม "สรุปรายรับ" เพราะไม่มีจริง)
- ถ้าคำถามถามถึงอนาคต (เดือนหน้า เดือนถัดไป หรือเดือนที่ระบุชื่อ) ให้เช็คจาก "พยากรณ์รายรับเดือนถัดไป_3เดือน" และ "งานที่ยังไม่จ่ายเงิน" (ที่มีระบุเดือนกำกับไว้) ก่อนเสมอ ห้ามบอกว่าไม่มีข้อมูลทั้งที่จริงมีอยู่ในสองส่วนนี้
- ถ้าคำถามใช้คำว่า "เร็วๆ นี้"/"ใกล้ครบกำหนด"/"อีกไม่นาน" หรือถามแบบไม่ระบุช่วงเวลาชัดเจนว่างานไหนใกล้ถึงกำหนดชำระ ให้ตอบจาก "งานที่ใกล้ครบกำหนด_ภายใน10วัน_เรียงใกล้สุดก่อน" เท่านั้น (ที่คัดมาแล้วว่าใกล้จริงๆ ภายใน 10 วัน) ห้ามเอารายการทั้งหมดจาก "งานที่ยังไม่จ่ายเงิน" มาตอบเพราะจะเยอะเกินไปจนไม่เห็นภาพว่าอันไหนด่วนจริง ถ้ารายการนี้ว่างเปล่าให้บอกว่าไม่มีงานไหนใกล้ครบกำหนดในเร็วๆ นี้

วิธีตัดสินใจ intent ของข้อความ:
- ถ้าข้อความบรรยายว่าเพิ่งรับงาน/ดีลใหม่เข้ามา (บอกว่าทำงานอะไร ได้ค่าจ้างเท่าไหร่ ขอให้บันทึกเป็นรายรับ) ให้ intent = "add_job" แล้วแยกข้อมูลใส่ฟิลด์ job* ทั้งหมดเท่าที่จับใจความได้:
  - jobName (บังคับ): ชื่องานสั้นๆ
  - jobValue (บังคับ): มูลค่างานเต็มเป็นตัวเลขล้วน ไม่ใส่หน่วย ห้ามเดาถ้าข้อความไม่ได้ระบุจำนวนเงินชัดเจน
  - jobClient (ไม่บังคับ): ชื่อ "ลูกค้าที่เป็นคนจ่ายเงิน" จริงๆ เท่านั้น -- ชื่อสถานที่/องค์กรที่พูดถึงในข้อความอาจเป็นแค่ "สถานที่ทำงาน" ไม่ใช่ตัวลูกค้าเสมอไป (เช่น "ไปถ่ายงานที่มหาวิทยาลัยกรุงเทพ" มหาวิทยาลัยอาจเป็นแค่สถานที่ ส่วนคนจ้างจริงอาจเป็นเอเจนซี่หรือคนอื่น) ห้ามเดาว่าชื่อสถานที่คือลูกค้าโดยอัตโนมัติ ใส่ฟิลด์นี้มาก็ต่อเมื่อข้อความระบุชัดเจนว่าใครเป็นคนจ่าย/ว่าจ้าง ไม่มีก็ไม่ต้องถาม ปล่อยว่างไว้ได้เลย (เติมทีหลังในแอปได้)
  - jobType: เลือกจากนี้เท่านั้น "${DEFAULT_JOB_TYPES.join('", "')}" ถ้าไม่แน่ใจใช้ "${DEFAULT_JOB_TYPES[DEFAULT_JOB_TYPES.length - 1]}"
  - jobPaymentStatus (บังคับ): "paid" ถ้าข้อความบอกว่าได้รับเงินครบแล้ว/ลูกค้าจ่ายแล้ว เช่น "ได้เงินมาแล้ว", "จ่ายเรียบร้อยแล้ว", "จ่ายครบแล้ว", "โอนมาแล้ว", "รับเงินแล้ว" -- วลีเหล่านี้หมายถึงลูกค้าจ่ายเงินให้ผู้ใช้แล้วเสมอ ไม่ใช่ผู้ใช้จ่ายเงินออกไป อย่าตีความผิดทาง; "partial" ถ้าพูดถึง "มัดจำ"/"วางมัดจำ"/"ได้มัดจำ"/"เก็บมัดจำ" พร้อมจำนวนเงิน (ให้ใส่จำนวนนั้นใน jobReceivedAmount ด้วยเสมอ) -- คำว่ามัดจำแปลว่าได้รับเงินบางส่วนแล้วเสมอ ต้องจับ intent นี้ให้ได้ทุกครั้งที่เห็นคำนี้; "pending" เฉพาะตอนที่ข้อความบอกชัดเจนว่ายังไม่ได้รับเงินเลยสักบาท -- ถ้าข้อความไม่ได้พูดถึงสถานะการจ่ายเงินเลยแม้แต่นิดเดียว (ไม่มีทั้งคำว่าได้เงิน/จ่ายแล้ว/มัดจำ/ยังไม่ได้) ห้ามเดาเป็น pending เด็ดขาด ให้ปล่อยว่างไว้ไม่ต้องมีคีย์นี้เลย (ต้องถามผู้ใช้ก่อนเสมอ ห้ามสันนิษฐานเอง)
  - jobCreditTerm (ไม่บังคับ): จำนวนวันนับจากวันนี้ที่ลูกค้าจะโอนเงินส่วนที่เหลือมาให้ ใส่เฉพาะตอนที่ข้อความระบุมาชัดเจน (เช่น "เครดิต 30 วัน", "จ่ายทันที" = ใส่ 0) ไม่มีก็ไม่ต้องถาม ปล่อยว่างไว้ได้เลย (เติมทีหลังในแอปได้)
  - jobWhtRate: % หัก ณ ที่จ่ายถ้าพูดถึง (0, 1, 3, หรือ 5) ไม่พูดถึงใส่ 0
- ถ้าข้อความบรรยายว่าเพิ่งจ่ายรายจ่าย/ค่าใช้จ่ายออกไป (ไม่ใช่รายรับ) ให้ intent = "add_expense" แล้วแยกใส่:
  - expenseName (บังคับ): ชื่อรายการสั้นๆ
  - expenseAmount (บังคับ): จำนวนเงินเป็นตัวเลขล้วน ห้ามเดาถ้าไม่ได้ระบุชัดเจน
  - expenseCategory: เลือกจากนี้เท่านั้น "${EXPENSE_CATEGORIES.join('", "')}" ถ้าไม่แน่ใจใช้ "อื่นๆ"
- ถ้าข้อความเป็นคำถาม/สอบถามข้อมูล ให้ intent = "question" แล้วตอบใส่ช่อง answer ตามกฎด้านบนทั้งหมด
- ถ้า intent = "add_job" แต่ไม่มี jobName หรือ jobValue หรือ intent = "add_expense" แต่ไม่มี expenseName หรือ expenseAmount ให้ยังคง intent นั้นไว้ แต่ใส่คำตอบในช่อง answer บอกสิ่งที่ขาดไปแบบเป็นมิตร ชวนพิมพ์มาใหม่พร้อมข้อมูลที่ขาด หรือกดปุ่ม "สั่งงานเลขา" แทนก็ได้
- ถ้าข้อความไม่เข้าเงื่อนไขไหนเลย (เช่นทักทายเฉยๆ, บอกชื่อตัวเองเฉยๆ, พูดคุยทั่วไป) ให้ intent = "other" และถ้าเป็นการทักทาย/แนะนำตัว/พูดคุยเล็กๆ น้อยๆ ที่พอตอบกลับได้แบบมีคาแรคเตอร์ ให้ใส่คำตอบสั้นๆ อบอุ่นในช่อง answer ด้วย (ไม่ต้องใส่ก็ได้ถ้าข้อความไม่มีความหมายจับต้องได้เลย)
- ไม่ว่า intent จะเป็นอะไรก็ตาม: ถ้าข้อความนี้มีการบอกชื่อของผู้ใช้เอง ให้ใส่เฉพาะชื่อเรียก (ไม่ใส่คำนำหน้า/คำอื่น) ลงในฟิลด์ userName เสมอ ไม่มีการบอกชื่อก็ไม่ต้องใส่ฟิลด์นี้
${pendingJobDraft ? `
ผู้ใช้เพิ่งเริ่มบันทึกงานนี้ไว้เมื่อครู่แต่ข้อมูลยังไม่ครบ ยังค้างรออยู่: ${JSON.stringify(pendingJobDraft)}
ถ้าข้อความใหม่นี้ดูเหมือนเป็นคำตอบที่เติมข้อมูลที่ขาดไปของงานนี้ (เช่น พิมพ์มาแค่ตัวเลขเดียว หรือชื่อลูกค้าเดียว โดยไม่มีบริบทอื่น) ให้ตีความว่า intent = "add_job" แล้วใส่ค่ากลับเข้าไปในฟิลด์ job* ให้ครบทุกฟิลด์ที่มีอยู่แล้วข้างต้นด้วย (ไม่ใช่ใส่แค่ฟิลด์ที่เพิ่งพิมพ์มาใหม่) รวมกับฟิลด์ใหม่ที่เพิ่งได้จากข้อความนี้ แต่ถ้าข้อความนี้ชัดเจนว่าเป็นเรื่องอื่นที่ไม่เกี่ยวกับการเติมงานนี้เลย (เช่นถามคำถามอื่น หรือพูดถึงงาน/รายจ่ายใหม่คนละเรื่อง หรือบอกว่านี่คือรายจ่ายไม่ใช่รายรับ) ให้ตีความตามความหมายจริงของมันตามปกติ ไม่ต้องฝืนตีความเป็น add_job` : ''}
${pendingExpenseDraft ? `
ผู้ใช้เพิ่งเริ่มบันทึกรายจ่ายนี้ไว้เมื่อครู่แต่ข้อมูลยังไม่ครบ ยังค้างรออยู่: ${JSON.stringify(pendingExpenseDraft)}
ถ้าข้อความใหม่นี้ดูเหมือนเป็นคำตอบที่เติมข้อมูลที่ขาดไปของรายจ่ายนี้ (เช่น พิมพ์มาแค่ชื่อรายการ หรือแค่จำนวนเงิน โดยไม่มีบริบทอื่น) ให้ตีความว่า intent = "add_expense" แล้วใส่ค่ากลับเข้าไปในฟิลด์ expense* ให้ครบทุกฟิลด์ที่มีอยู่แล้วข้างต้นด้วย (ไม่ใช่ใส่แค่ฟิลด์ที่เพิ่งพิมพ์มาใหม่) รวมกับฟิลด์ใหม่ที่เพิ่งได้จากข้อความนี้ แต่ถ้าข้อความนี้ชัดเจนว่าเป็นเรื่องอื่นที่ไม่เกี่ยวกับการเติมรายจ่ายนี้เลย ให้ตีความตามความหมายจริงของมันตามปกติ ไม่ต้องฝืนตีความเป็น add_expense` : ''}

ข้อมูลบัญชีจริง (JSON):
${JSON.stringify(compactLineAiContext(formatted, text, !!(pendingJobDraft || pendingExpenseDraft)))}
ถ้า _lineContext.hasOmissions เป็นจริง รายการที่ให้เป็นเพียงบางส่วน ห้ามสรุปว่าไม่มีงานจากการไม่พบในรายการนี้ ให้แนะนำเปิดรายงานในแอปเมื่อข้อมูลไม่พอ ยอดรวมยังเป็นยอดเต็มจากระบบ

ข้อความจากผู้ใช้: "${text}"`,
          },
        ],
      })
    );
    console.info('line_ai_usage', { model: policy.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    // Before this, a missing tool_use block or a missing `intent` fell straight through to
    // `return null` with zero logging -- indistinguishable in Vercel Logs from "Claude decided
    // not to answer" vs. a real parsing failure (e.g. stop_reason 'max_tokens' truncating the
    // tool call's JSON mid-stream). Log it explicitly so this failure mode is visible instead of
    // silently degrading to HELP_TEXT with no trace of why.
    if (!toolUse) {
      console.error('classifyMessage: no tool_use block in response', {
        stopReason: response.stop_reason,
        contentTypes: response.content.map((b) => b.type),
      });
      return null;
    }
    const parsed = toolUse.input as ClassifyResult;
    if (parsed.answer) parsed.answer = stripMarkdown(parsed.answer.trim());
    if (parsed.userName) {
      const cleaned = parsed.userName.trim().slice(0, 40);
      parsed.userName = cleaned || undefined;
    }
    if (!parsed.intent) {
      console.error('classifyMessage: tool_use input missing intent', {
        stopReason: response.stop_reason,
        input: toolUse.input,
      });
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('classifyMessage error:', err);
    return null;
  }
}

// Tappable shortcuts (LINE Quick Reply) -- every one of these is answered deterministically,
// zero AI calls involved anywhere in this flow. The add button exchanges a verified LINE
// identity for the linked owner's session, then opens the real in-app add-job form.
export function getQuickReply(): import('./line.js').LineQuickReply {
  const items: import('./line.js').LineQuickReply['items'] = [];
  const addJob = lineAppLink('/jobs?openAddJob=1', 'เพิ่มงาน');
  if (addJob) {
    items.push({ type: 'action', action: { type: 'uri', ...addJob } });
  }
  items.push(
    { type: 'action', action: { type: 'message', label: 'รอรับเงิน', text: 'รอรับเงิน' } },
    { type: 'action', action: { type: 'message', label: 'สรุปเดือนนี้', text: 'สรุปเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: 'งานเดือนนี้', text: 'งานเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: 'กำลังดำเนินงาน', text: 'กำลังดำเนินการ' } },
    { type: 'action', action: { type: 'message', label: 'เมนูเพิ่มเติม', text: 'เมนูเพิ่มเติม' } }
  );
  return { items: items.slice(0, 13) };
}

// Splits a freeform reply into a few short chat bubbles on blank-line boundaries instead of one
// long paragraph -- reads like a real person texting in short bursts rather than an AI-generated
// wall of text. Capped so a reply can never exceed LINE's 5-messages-per-reply limit; anything
// past the cap is folded into the last bubble rather than silently dropped.
const MAX_BUBBLES = 3;
function splitIntoBubbles(text: string): string[] {
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [text.trim()];
  if (parts.length <= MAX_BUBBLES) return parts;
  return [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join('\n\n')];
}

function textBubbles(text: string): LineMessage[] {
  return splitIntoBubbles(text).map((t) => ({ type: 'text', text: t }));
}

// Notifications and reports share one hierarchy: title, key amount, supporting details.
function buildReceiptCard(bodyContents: any[], altText: string, character: LineCardCharacter): LineMessage {
  const [heading, first, ...rest] = bodyContents;
  const hasMetric = first?.contents?.[1]?.size === 'xl';
  return lineCard({
    title: heading?.text || 'กระรอกตุนเงิน', altText, character, compact: true,
    ...(hasMetric ? { metric: { label: first.contents[0].text, value: first.contents[1].text, color: first.contents[1].color } } : {}),
    body: hasMetric ? rest : bodyContents.slice(1),
  });
}

export function buildUnpaidJobsMessage(snapshot: Pick<DataSnapshot, 'unpaid' | 'totalPendingAllTime'>): LineMessage {
  const jobs = [...snapshot.unpaid].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const shown = jobs.slice(0, MAX_LINE_ITEMS);
  return lineCard({
    title: 'รอรับเงิน', subtitle: 'ติดตามยอดที่ยังไม่ได้รับจากลูกค้า', character: 'reminder',
    metric: { label: 'ยอดรอรับทั้งหมด', value: formatCurrency(snapshot.totalPendingAllTime), note: `${jobs.length} งาน` },
    body: shown.length ? shown.map(j => lineJobItem({ name: j.name, client: j.client, amount: formatCurrency(j.pending),
      meta: j.dueDate ? `กำหนดรับ ${j.dueText}` : 'ยังไม่ระบุวันรับเงิน',
      metaColor: (j.dueText.includes('เลยกำหนด') || j.dueText.includes('overdue')) ? C.negative : C.muted,
    })) : [{ type: 'text', text: 'ไม่มีงานรอรับเงินในขณะนี้', size: 'sm', color: C.muted, wrap: true, margin: 'lg' }],
    note: jobs.length > shown.length ? `แสดง ${shown.length} จาก ${jobs.length} งาน · อีก ${jobs.length - shown.length} งานดูได้ในแอป` : undefined,
    footer: lineAppLink('/receivables', 'ดูงานรอรับเงินทั้งหมด'),
    altText: `รอรับเงิน ${jobs.length} งาน · รวม ${formatCurrency(snapshot.totalPendingAllTime)}`,
  });
}

export function buildMonthlySummaryMessage(s: MonthlySummaryWithMonth): LineMessage {
  return buildLineCashSummary({
    title: 'สรุปเดือนนี้', monthLabel: formatMonthKey(s.monthKey), summary: s,
    footer: lineAppLink('/report', 'ดูรายงานฉบับเต็ม'),
  });
}

function buildThisMonthSummaryMessage(snapshot: DataSnapshot): LineMessage {
  return buildMonthlySummaryMessage(snapshot.thisMonth);
}

export function buildWipJobsMessage(snapshot: Pick<DataSnapshot, 'wip'>): LineMessage {
  return lineCard({
    title: 'กำลังดำเนินงาน', subtitle: 'งานที่ยังอยู่ระหว่างดำเนินการ', character: 'working',
    metric: { label: 'งานระหว่างดำเนินการ', value: `${snapshot.wip.length} งาน` },
    body: snapshot.wip.length ? snapshot.wip.slice(0, MAX_LINE_ITEMS).map(j => lineJobItem({ name: j.name, client: j.client, amount: formatCurrency(j.value) }))
      : [{ type: 'text', text: 'ไม่มีงานระหว่างดำเนินการในขณะนี้', size: 'sm', color: C.muted, wrap: true, margin: 'lg' }],
    note: snapshot.wip.length > MAX_LINE_ITEMS ? `แสดง ${MAX_LINE_ITEMS} จาก ${snapshot.wip.length} งาน · ดูรายการที่เหลือในแอป` : undefined,
    footer: lineAppLink('/jobs', 'ดูงานทั้งหมด'), altText: `กำลังดำเนินงาน ${snapshot.wip.length} งาน`,
  });
}

export function buildThisMonthJobsMessage(snapshot: Pick<DataSnapshot, 'thisMonth' | 'thisMonthJobs'>): LineMessage {
  const s = snapshot.thisMonth;
  const monthLabel = formatMonthKey(s.monthKey);
  const wip = snapshot.thisMonthJobs.filter(j => j.isPosted === false);
  const invoiced = snapshot.thisMonthJobs.filter(j => j.isPosted !== false);
  const unpaid = invoiced.filter(j => j.isUnpaid);
  const paid = invoiced.filter(j => !j.isUnpaid);
  const unpaidSum = Math.max(0, s.income - s.received);
  const body: any[] = [];
  let remaining = MAX_LINE_ITEMS;
  for (const group of [{ label: 'รอรับเงิน', jobs: unpaid, pending: true }, { label: 'รับเงินครบแล้ว', jobs: paid, pending: false }, { label: 'กำลังดำเนินงาน', jobs: wip, pending: false }]) {
    if (!group.jobs.length) continue;
    const shown = group.jobs.slice(0, remaining);
    if (shown.length) body.push(lineSection(`${group.label} · ${group.jobs.length} งาน`));
    body.push(...shown.map(j => lineJobItem({ name: j.name, client: j.client, amount: formatCurrency(group.pending ? j.pending : j.value) })));
    remaining -= shown.length;
  }
  if (!snapshot.thisMonthJobs.length) body.push({ type: 'text', text: 'เดือนนี้ยังไม่มีงาน', size: 'sm', color: C.muted, margin: 'lg' });
  if (unpaidSum > 0) body.push(lineDivider(), lineValueRow('ยอดรอรับเดือนนี้', formatCurrency(unpaidSum)));
  return lineCard({
    title: 'งานเดือนนี้', subtitle: monthLabel, character: 'report',
    metric: { label: 'มูลค่างานเดือนนี้', value: formatCurrency(s.income), note: `${snapshot.thisMonthJobs.length} งาน · รอรับ ${unpaid.length} · รับครบ ${paid.length} · ดำเนินงาน ${wip.length}` },
    body, note: snapshot.thisMonthJobs.length > MAX_LINE_ITEMS ? `แสดง ${MAX_LINE_ITEMS} จาก ${snapshot.thisMonthJobs.length} งาน · ดูรายการที่เหลือในแอป` : undefined,
    footer: lineAppLink('/jobs', 'ดูงานทั้งหมด'),
    altText: `งานเดือนนี้ (${monthLabel}) ${snapshot.thisMonthJobs.length} งาน · รอรับ ${formatCurrency(unpaidSum)}`,
  });
}

const QUICK_ACTIONS: Record<string, (snapshot: DataSnapshot) => LineMessage> = {
  รอรับเงิน: buildUnpaidJobsMessage,
  งานค้างจ่าย: buildUnpaidJobsMessage,
  สรุปเดือนนี้: buildThisMonthSummaryMessage,
  งานสต็อก: buildWipJobsMessage,
  กำลังดำเนินการ: buildWipJobsMessage,
  กำลังดำเนินงาน: buildWipJobsMessage,
  งานเดือนนี้: buildThisMonthJobsMessage,
};

// Fallback for anything that isn't a Quick Reply command AND Claude couldn't answer (unconfigured
// or erroring, e.g. quota) -- a greeting, a random question, or anything else. Since there's no
// pending chat flow to get stuck in, this is always a safe, friendly fallback rather than a
// leftover mid-conversation prompt.
// Two short bubbles instead of one long block -- the button list used to be typed out again as
// plain text here too, which was redundant (the real tappable Quick Reply buttons already show
// up below every reply) and made this the longest, most wall-of-text-looking message in the bot.
function buildHelpText(name?: string): string {
  return [
    `🐿️ สวัสดี${name ? `ครับคุณ${name}` : 'ครับ'}!`,
    `บันทึกงานได้โดยพิมพ์ เช่น “${LINE_JOB_EXAMPLES[0]}” แล้วตรวจรายการก่อนยืนยันครับ หากต้องการคุยกับ AI ให้ขึ้นต้นด้วย “ถาม AI”`,
  ].join('\n\n');
}

// Builds a real Job record the same way JobsTab.tsx's add-job form does (WHT is not captured
// via chat, so it's left at 0 -- editable in-app afterward same as any other field).
export function buildJobFromDraft(draft: JobDraft): JobRow & { id: string; client: string; note: string; postDate: string; isPosted: boolean } {
  const today = (() => {
    const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
  })();

  const valueNum = draft.value || 0;
  const creditTerm = draft.creditTerm ?? 0;
  // Same formula as JobsTab.tsx's add-job form: whtAmount deducted from value first, then
  // "received" for a fully-paid job is the NET amount after tax, matching what actually lands
  // in the bank -- not the gross contract value.
  const whtRate = draft.whtRate || 0;
  const whtAmount = whtAmountFor(valueNum, whtRate);
  const netReceivable = roundMoney(valueNum - whtAmount);
  let status: string = 'pending';
  let received = 0;
  if (draft.paymentStatus === 'paid') {
    status = 'done';
    received = netReceivable;
  } else if (draft.paymentStatus === 'partial') {
    status = 'partial';
    received = draft.receivedAmount || 0;
  }
  const pending = Math.max(0, roundMoney(netReceivable - received));
  const payDate = calculatePayDate(today, creditTerm, false);

  return {
    id: randomUUID(),
    name: draft.name || 'งานใหม่จาก LINE',
    type: draft.type || 'ยังไม่ระบุ',
    client: draft.client || '',
    value: valueNum,
    received,
    pending,
    status,
    creditTerm,
    whtRate,
    whtAmount,
    postDate: today,
    isPosted: true,
    payDate,
    ...(status === 'partial' && received > 0 ? { depositDate: today, depositAmount: received } : {}),
    note: draft.note || '',
  };
}

export async function persistJob(user: UserRow, job: ReturnType<typeof buildJobFromDraft>): Promise<boolean> {
  try {
    if (user.operationId) job.id = createHash('sha256').update(`job:${user.user_id}:${user.operationId}`).digest('hex');
    validateChanges([{table:'cashflow_jobs',id:job.id,op:'set',version:null,data:job}]);
    const saved = await insertRecord('cashflow_jobs',user.user_id,job,!!user.operationId);
    user.lastWriteWasDuplicate = !saved.inserted;
    for (const key of Object.keys(job)) if (!Object.hasOwn(saved.record,key)) delete (job as any)[key];
    Object.assign(job,saved.record);
    return true;
  } catch { console.error('persistJob: insert failed'); return false; }
}

// Persist a draft before offering confirmation. Resolving a draft marks its identity
// instead of deleting the shared slot, which may already hold a newer concurrent draft.
// Every notif_settings writer here mutates `user.notif_settings` locally right after a successful
// write (instead of only writing to the DB) -- a single request can touch more than one of these
// keys in a row (e.g. a message that both introduces a name AND leaves a job draft incomplete),
// and each writer merges onto `user.notif_settings` as its base. Without updating that local
// object in between, a later writer in the same request would merge onto the original stale
// snapshot and silently drop whatever an earlier writer in this same request just saved.
async function saveJobDraft(user: UserRow, draft: JobDraft, fresh = false): Promise<void> {
  const previous = user.notif_settings?.pendingJobDraft;
  const stored = { draft, createdAt: new Date().toISOString(), operationKey: '' };
  stored.operationKey = !fresh && previous && isActiveLineDraft('job', previous, user.notif_settings || {})
    ? previous.operationKey || lineDraftKey('job', previous) : lineDraftKey('job', stored);
  const notif_settings = { ...(user.notif_settings || {}), pendingJobDraft: stored };
  await patchPrivate(user.user_id, { pendingJobDraft: notif_settings.pendingJobDraft });
  user.notif_settings = notif_settings;
}

export async function clearJobDraft(user: UserRow): Promise<void> {
  if (!user.notif_settings?.pendingJobDraft) return;
  const resolution = lineDraftResolution('job', user.notif_settings.pendingJobDraft, user.notif_settings);
  await patchPrivate(user.user_id, resolution.patch, resolution.remove);
  const next: NotifSettingsRow = { ...user.notif_settings, ...resolution.patch };
  for (const key of resolution.remove) delete next[key];
  user.notif_settings = next;
}

// Same shape as saveJobDraft/clearJobDraft, for an in-progress "add expense" that's missing a
// name or amount. Without this, a follow-up like "ชื่อรายการ คือ ตัดต่ออาร์คต" had nothing
// structured to complete -- it relied entirely on the model re-deriving the amount from chat
// history text, and worse, a *stale* pendingJobDraft (from an earlier, abandoned job) could hijack
// that short reply via the job-continuation prompt instruction below, misfiling it as a job.
async function saveExpenseDraft(user: UserRow, draft: ExpenseDraft, fresh = false): Promise<void> {
  const previous = user.notif_settings?.pendingExpenseDraft;
  const stored = { draft, createdAt: new Date().toISOString(), operationKey: '' };
  stored.operationKey = !fresh && previous && isActiveLineDraft('expense', previous, user.notif_settings || {})
    ? previous.operationKey || lineDraftKey('expense', previous) : lineDraftKey('expense', stored);
  const notif_settings = { ...(user.notif_settings || {}), pendingExpenseDraft: stored };
  await patchPrivate(user.user_id, { pendingExpenseDraft: notif_settings.pendingExpenseDraft });
  user.notif_settings = notif_settings;
}

export async function clearExpenseDraft(user: UserRow): Promise<void> {
  if (!user.notif_settings?.pendingExpenseDraft) return;
  const resolution = lineDraftResolution('expense', user.notif_settings.pendingExpenseDraft, user.notif_settings);
  await patchPrivate(user.user_id, resolution.patch, resolution.remove);
  const next: NotifSettingsRow = { ...user.notif_settings, ...resolution.patch };
  for (const key of resolution.remove) delete next[key];
  user.notif_settings = next;
}

// Persists the name once extracted from a message -- kept forever (no TTL, unlike the job draft)
// since remembering it is the whole point; a later message with a different name just overwrites it.
async function saveUserName(user: UserRow, name: string): Promise<void> {
  const notif_settings = { ...(user.notif_settings || {}), userName: name };
  await patchPrivate(user.user_id, { userName: name });
  user.notif_settings = notif_settings;
}

// Marks that we've asked for the user's name so the bot only ever asks once, even if they never
// answer -- same "never leave the user stuck or nagged" philosophy as the job draft TTL above.
async function markNameAsked(user: UserRow): Promise<void> {
  const notif_settings = { ...(user.notif_settings || {}), nameAskedAt: new Date().toISOString() };
  await patchPrivate(user.user_id, { nameAskedAt: notif_settings.nameAskedAt });
  user.notif_settings = notif_settings;
}

// Tacks a one-time, friendly ask for the user's name onto an outgoing plain-text reply -- never
// fires if the name is already known or has already been asked for once before, so it's a single
// gentle nudge rather than a recurring nag.
async function appendNameAskIfNeeded(user: UserRow, knowsName: boolean, alreadyAsked: boolean, replyText: string): Promise<string> {
  if (knowsName || alreadyAsked) return replyText;
  await markNameAsked(user);
  return `${replyText}\n\nป.ล. เรียกคุณว่าอะไรดีครับ พิมพ์ชื่อมาบอกได้เลย จะได้จำไว้เรียกทุกครั้งเลยครับ 🐿️`;
}

// Best-effort, same mutate-local-on-success pattern as the other notif_settings writers above --
// trims to the last CHAT_HISTORY_MAX_TURNS turns (a "turn" = one user message + one reply).
async function saveChatHistory(user: UserRow, userText: string, assistantText: string): Promise<void> {
  const existing = user.notif_settings?.chatHistory || [];
  const updated: ChatHistoryEntry[] = [
    ...existing,
    { role: 'user' as const, text: userText },
    { role: 'assistant' as const, text: assistantText },
  ].slice(-CHAT_HISTORY_MAX_TURNS * 2);
  const notif_settings = { ...(user.notif_settings || {}), chatHistory: updated, chatHistoryUpdatedAt: new Date().toISOString() };
  await patchPrivate(user.user_id, { chatHistory: updated, chatHistoryUpdatedAt: notif_settings.chatHistoryUpdatedAt });
  user.notif_settings = notif_settings;
}

// Shared tail for every conversational (plain-text) reply: appends the one-time name ask if due,
// records this exchange into short-term chat history for the next follow-up to reference, then
// splits into LINE bubbles.
async function finishConversationalReply(
  user: UserRow,
  userText: string,
  knowsName: boolean,
  alreadyAskedName: boolean,
  replyText: string
): Promise<LineMessage[]> {
  const finalText = await appendNameAskIfNeeded(user, knowsName, alreadyAskedName, replyText);
  await saveChatHistory(user, userText, finalText);
  return textBubbles(finalText);
}

// A plain heading keeps decorative icons and duplicate timestamps out of the report.
function buildTypeBadge(_icon: string, label: string, _color: string) {
  return { type: 'text', text: label, size: 'md', weight: 'bold', color: C.text, wrap: true };
}

function buildStatementRow(label: string, value: string, opts?: { size?: string; color?: string; bold?: boolean }) {
  return lineValueRow(label, value, opts);
}

// Minimal shape buildJobSavedMessage actually needs -- looser than buildJobFromDraft's return
// type so api/notify.ts can hand it a plain Job object straight from the web app (src/types.ts's
// Job satisfies this structurally) without going through the draft/chat flow.
export interface JobCardData {
  id: string;
  name: string;
  client: string;
  value: number;
  received?: number;
  pending?: number;
  status?: string;
  whtRate?: number;
  whtAmount?: number;
  isPosted?: boolean; // false = "สต็อกเตรียมผลิต" (WIP), same flag as JobsTab.tsx's formIsPosted
}

// Squirrel-branded Flex "receipt" card shown right after a job is saved -- styled like a bank
// transfer notification (big amount up top, clean label/value rows below) since that's the
// clearest, most familiar shape for this kind of confirmation. Falls back to a plain-text
// summary. monthNet, when given, adds
// a running "คงเหลือเดือนนี้" line -- receivedAfterVariableExpense from computeMonthlySummary
// (received minus already-logged variable expenses, not netFlow), matching the Dashboard's
// "คงเหลือหลังหักรายจ่าย" figure. Computed by the caller so this stays a pure display function.
export function buildJobSavedMessage(job: JobCardData, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const isDone = job.status === 'done';
  const isPartial = job.status === 'partial' || job.status === 'installment';
  const isPaidSome = isDone || isPartial;
  const statusLabel = isWip ? 'กำลังดำเนินการ' : isDone ? 'จ่ายครบแล้ว' : isPartial ? 'ได้รับมัดจำแล้ว' : 'ยังไม่ได้รับเงิน';
  // Four distinct moments, four distinct badges: WIP (indigo), posted with nothing received yet
  // (teal "ดีลงาน"), a deposit landed but the job isn't fully paid (amber "ได้รับมัดจำ" -- kept
  // separate from full payment per direct feedback: a deposit shouldn't read as "รับเงินแล้ว" the
  // same way a completed payment does), and fully paid (green "รับเงินแล้ว"). Before this, "done"
  // and "partial" shared the same green badge and headline, so a card for a job that had only
  // gotten a deposit looked identical to one that was fully settled.
  const headerLabel = isWip ? 'งานใหม่' : isDone ? 'รับเงิน' : isPartial ? 'รับมัดจำ' : 'มูลค่าดีล';
  const headerColor = isWip ? C.text : isDone ? C.positive : isPartial ? C.warning : C.text;
  // job.value is the full contract value, not what's actually landed -- for a partial payment
  // that's just the deposit, so show job.received (falling back to value if a caller doesn't send
  // it) instead of implying the whole contract amount arrived.
  const displayAmount = isPaidSome ? (job.received ?? job.value) : job.value;

  return buildReceiptCard([
        isWip
          ? buildTypeBadge('package', 'กำลังดำเนินการ', headerColor)
          : isDone
            ? buildTypeBadge('coin', 'รับเงินแล้ว', headerColor)
            : isPartial
              ? buildTypeBadge('partial', 'ได้รับมัดจำ', headerColor)
              : buildTypeBadge('deal', 'ดีลงาน', headerColor),
        buildStatementRow(headerLabel, `${isPaidSome ? '+' : ''}${formatCurrency(displayAmount)}`, { size: 'xl', color: headerColor }),
        { type: 'separator', margin: 'md', color: C.border },
        buildStatementRow('ชื่องาน', job.name, { bold: false }),
        ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
        ...(job.whtRate ? [buildStatementRow(`หัก ณ ที่จ่าย ${job.whtRate}%`, `-${formatCurrency(job.whtAmount || 0)}`, { bold: false, color: C.warning })] : []),
        buildStatementRow('สถานะ', statusLabel, { bold: false }),
        ...(!isWip && (job.pending || 0) > 0 ? [buildStatementRow('ค้างรับ', formatCurrency(job.pending || 0), { bold: false, color: C.warning })] : []),
        ...(!isWip && monthNet != null ? [{ type: 'separator', margin: 'md', color: C.border }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: C.positive })] : []),
  ], isWip ? `เพิ่มงาน \"${job.name}\" เป็นกำลังดำเนินการแล้วครับ` : `บันทึกงาน \"${job.name}\" สำเร็จแล้วครับ`, !isWip && isPaidSome && displayAmount > 0 ? 'received' : isWip ? 'working' : 'review');
}

// Builds a real Expense record the same way ExpenseRecordView.tsx's add-expense form does.
export function buildExpenseFromDraft(draft: ExpenseDraft): Expense {
  const today = (() => {
    const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
  })();

  return {
    id: randomUUID(),
    name: draft.name || 'รายจ่ายจาก LINE',
    category: draft.category || 'อื่นๆ',
    amount: draft.amount || 0,
    date: today,
    note: draft.note || '',
  };
}

export async function persistExpense(user: UserRow, expense: Expense): Promise<boolean> {
  try {
    if (user.operationId) expense.id = createHash('sha256').update(`expense:${user.user_id}:${user.operationId}`).digest('hex');
    validateChanges([{table:'cashflow_expenses',id:expense.id,op:'set',version:null,data:expense}]);
    const saved = await insertRecord('cashflow_expenses',user.user_id,expense,!!user.operationId);
    user.lastWriteWasDuplicate = !saved.inserted;
    for (const key of Object.keys(expense)) if (!Object.hasOwn(saved.record,key)) delete (expense as any)[key];
    Object.assign(expense,saved.record);
    return true;
  } catch { console.error('persistExpense: insert failed'); return false; }
}

// "คงเหลือเดือนนี้" for the job/expense-saved cards, computed server-side (LINE chat-add and the
// LIFF form both persist straight to Supabase with no client-side app state to read it from).
// extraJob/extraExpense is the record that was JUST persisted -- user.jobs/user.expenses here is
// the snapshot fetched before that write, so it has to be prepended, same as the client's own
// monthNetSafe([newRecord]) pattern in App.tsx.
export function computeMonthNetForUser(user: UserRow, extraJob?: JobRow, extraExpense?: ExpenseRow): number | undefined {
  try {
    const jobs = extraJob ? [extraJob, ...(user.jobs || []).filter(j=>j.id!==extraJob.id)] : (user.jobs || []);
    const expenses = extraExpense ? [extraExpense, ...(user.expenses || []).filter(e=>(e as any).id!==(extraExpense as any).id)] : (user.expenses || []);
    return computeMonthlySummary(jobs, expenses, user.goals || [], user.settings || {}, currentMonthKey()).receivedAfterVariableExpense;
  } catch (err) {
    console.error('computeMonthNetForUser error:', err);
    return undefined;
  }
}

// Same squirrel-branded Flex "receipt" style as the job-saved card, but in the app's rust/clay
// accent (--pink-acc in src/index.css) instead of acorn orange, so income vs expense reads apart
// at a glance. No specific-record deep link yet (only jobs support ?job=<id> in App.tsx), so the
// card confirms the saved expense without adding a navigation button.
export function buildExpenseSavedMessage(expense: Expense, monthNet?: number): LineMessage {
  return buildReceiptCard([
        buildTypeBadge('receipt', 'รายจ่ายใหม่', C.negative),
        buildStatementRow('จ่ายเงิน', `-${formatCurrency(expense.amount)}`, { size: 'xl', color: C.negative }),
        { type: 'separator', margin: 'md', color: C.border },
        buildStatementRow('รายการ', expense.name, { bold: false }),
        buildStatementRow('หมวด', expense.category, { bold: false }),
        ...(monthNet != null ? [{ type: 'separator', margin: 'md', color: C.border }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: C.positive })] : []),
  ], `บันทึกรายจ่าย \"${expense.name}\" สำเร็จแล้วครับ`, 'spent');
}

// LINE can't delete/unsend a message the bot already pushed -- there's no such API. This sends
// a follow-up "ยกเลิกแล้ว" card instead, so the chat at least shows the job was voided rather
// than leaving the original "บันทึกงานสำเร็จ" card looking like it's still active.
export function buildJobDeletedMessage(job: { name: string; client?: string; value: number; isPosted?: boolean }, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const bodyContents = [
    buildTypeBadge('trash', 'ยกเลิกงาน', C.muted),
    buildStatementRow('ยกเลิกงาน', formatCurrency(job.value), { size: 'xl', color: C.muted }),
    { type: 'separator', margin: 'md', color: C.border },
    buildStatementRow('ชื่องาน', job.name, { bold: false }),
    ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
    ...(!isWip && monthNet != null ? [{ type: 'separator', margin: 'md', color: C.border }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: C.positive })] : []),
  ];
  // No "เปิดแอป" button here -- the job is gone, there's nothing left in the app for this card
  // to open to.
  return buildReceiptCard(bodyContents, `ยกเลิกงาน "${job.name}" แล้วครับ`, 'cancelled');
}

// Sent when a job is edited through JobsTab's edit form without that edit also being a full
// payment completion (that case already gets the "รับเงิน" card via buildJobSavedMessage, reused
// so a payment landing on an existing project reads the same as one landing on a brand-new job).
// Distinguishing "edited" from narrower internal onEditJob calls (marking a follow-up, bumping
// isPosted alone, a partial-deposit button) is the caller's job -- see App.tsx's handleEditJob,
// which only reaches this path when the payload looks like a real edit-form save.
export function buildJobEditedMessage(job: JobCardData, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const statusLabel = isWip ? 'กำลังดำเนินการ' : job.status === 'done' ? 'จ่ายครบแล้ว' : job.status === 'installment' ? 'แบ่งชำระเป็นงวด' : job.status === 'partial' ? 'ได้รับมัดจำแล้ว' : 'ยังไม่ได้รับเงิน';
  const bodyContents = [
    buildTypeBadge('pencil', 'แก้ไขงาน', C.text),
    buildStatementRow('แก้ไขงาน', formatCurrency(job.value), { size: 'xl', color: C.text }),
    { type: 'separator', margin: 'md', color: C.border },
    buildStatementRow('ชื่องาน', job.name, { bold: false }),
    ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
    buildStatementRow('สถานะ', statusLabel, { bold: false }),
    ...(!isWip && (job.pending || 0) > 0 ? [buildStatementRow('ยอดค้างรับ', formatCurrency(job.pending || 0), { bold: false, color: C.warning })] : []),
    ...(!isWip && monthNet != null ? [{ type: 'separator', margin: 'md', color: C.border }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: C.positive })] : []),
  ];
  return buildReceiptCard(bodyContents, `แก้ไขงาน "${job.name}" แล้วครับ`, 'review');
}

// Same idea as buildJobDeletedMessage, for a deleted variable expense.
export function buildExpenseDeletedMessage(expense: { name: string; category?: string; amount: number }, monthNet?: number): LineMessage {
  const bodyContents = [
    buildTypeBadge('trash', 'ลบรายจ่าย', C.muted),
    buildStatementRow('ลบรายจ่าย', formatCurrency(expense.amount), { size: 'xl', color: C.muted }),
    { type: 'separator', margin: 'md', color: C.border },
    buildStatementRow('รายการ', expense.name, { bold: false }),
    ...(expense.category ? [buildStatementRow('หมวด', expense.category, { bold: false })] : []),
    ...(monthNet != null ? [{ type: 'separator', margin: 'md', color: C.border }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: C.positive })] : []),
  ];
  return buildReceiptCard(bodyContents, `ลบรายจ่าย "${expense.name}" แล้วครับ`, 'cancelled');
}

export function buildGoalCreatedMessage(goal: { name: string; target: number; deadline?: string }): LineMessage {
  // Purple, not the job-edited card's blue -- goal creation gets its own color so the two never
  // read as the same type of event at a glance.
  const bodyContents = [
    buildTypeBadge('target', 'เป้าหมายใหม่', C.text),
    buildStatementRow('เป้าหมายใหม่', goal.name, { size: 'xl', color: C.text }),
    { type: 'separator', margin: 'md', color: C.border },
    buildStatementRow('ยอดเป้าหมาย', formatCurrency(goal.target), { bold: false }),
    ...(goal.deadline ? [buildStatementRow('กำหนดเสร็จ', goal.deadline, { bold: false })] : []),
  ];
  return buildReceiptCard(bodyContents, `สร้างเป้าหมายใหม่ "${goal.name}" แล้วครับ`, 'saving');
}

// Covers both deposit (ฝากเงินเพิ่ม) and withdraw (ดึงเงินออก) -- same card shape, colored and
// signed differently, so it's always obvious at a glance which direction the money moved and
// which goal it was into/out of.
export function buildGoalTransactionMessage(
  goal: { name: string; target: number; current: number },
  tx: { type: 'deposit' | 'withdraw'; amount: number; reason: string }
): LineMessage {
  const isDeposit = tx.type === 'deposit';
  const headerLabel = isDeposit ? 'ฝากเข้าเป้าหมาย' : 'ถอนจากเป้าหมาย';
  const headerColor = isDeposit ? C.positive : C.negative;
  const bodyContents = [
    isDeposit ? buildTypeBadge('acorn', headerLabel, headerColor) : buildTypeBadge('outbox', headerLabel, headerColor),
    buildStatementRow(headerLabel, `${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}`, { size: 'xl', color: headerColor }),
    { type: 'separator', margin: 'md', color: C.border },
    buildStatementRow('เป้าหมาย', goal.name, { bold: false }),
    ...(tx.reason ? [buildStatementRow('เหตุผล', tx.reason, { bold: false })] : []),
    buildStatementRow('ยอดสะสมล่าสุด', `${formatCurrency(goal.current)} / ${formatCurrency(goal.target)}`, { bold: false }),
  ];
  return buildReceiptCard(bodyContents, `${headerLabel} "${goal.name}" ${formatCurrency(tx.amount)} แล้วครับ`, isDeposit ? 'saving' : 'withdraw');
}

// Sent when a goal deposit/withdraw history entry is deleted (the trash icon on each row in the
// goal detail modal) -- same "cancelled" framing as buildJobDeletedMessage/buildExpenseDeletedMessage,
// since LINE has no API to delete/unsend a message the bot already sent for the original transaction.
export function buildGoalTransactionDeletedMessage(
  goal: { name: string; target: number; current: number },
  tx: { type: 'deposit' | 'withdraw'; amount: number; reason?: string }
): LineMessage {
  const wasDeposit = tx.type === 'deposit';
  const bodyContents = [
    buildTypeBadge('trash', 'ลบรายการ', C.muted),
    buildStatementRow('ลบรายการ', formatCurrency(tx.amount), { size: 'xl', color: C.muted }),
    { type: 'separator', margin: 'md', color: C.border },
    buildStatementRow('เป้าหมาย', goal.name, { bold: false }),
    buildStatementRow('ประเภทที่ลบ', wasDeposit ? 'ฝากเข้า' : 'ดึงเงินออก', { bold: false }),
    ...(tx.reason ? [buildStatementRow('เหตุผลเดิม', tx.reason, { bold: false })] : []),
    buildStatementRow('ยอดสะสมล่าสุด', `${formatCurrency(goal.current)} / ${formatCurrency(goal.target)}`, { bold: false }),
  ];
  return buildReceiptCard(bodyContents, `ลบรายการ "${goal.name}" ${formatCurrency(tx.amount)} แล้วครับ`, 'cancelled');
}

function statusBehavior(statuses: StatusRow[], statusId: string): 'done' | 'partial' | 'pending' {
  return statuses.find((s) => s.id === statusId)?.behavior || 'pending';
}

// Entry point called from api/line-webhook.ts. Returns null when this LINE user isn't linked
// to any app account yet, so the caller can fall back to the link-code flow. Always returns an
// array (LINE's reply API takes one call with up to 5 message bubbles) -- a freeform text reply
// may be split into a few short bubbles by textBubbles, everything else is just one. The Quick
// Reply shortcuts are attached to the last bubble only, so they're always one tap away.
export interface LineAssistantDependencies {
  findUserByLineId: typeof findUserByLineId;
  checkLinkedAccountWriteAccess: typeof checkLinkedAccountWriteAccess;
  isProUser: typeof isProUser;
  saveJobDraft?: typeof saveJobDraft;
  saveExpenseDraft?: typeof saveExpenseDraft;
  clearJobDraft?: typeof clearJobDraft;
  clearExpenseDraft?: typeof clearExpenseDraft;
  persistJob?: typeof persistJob;
  persistExpense?: typeof persistExpense;
  classifyMessage?: typeof classifyMessage;
  listVaultFiles?: typeof listVaultFiles;
  findLineDocuments?: typeof findLineDocuments;
  handleDueAction?: typeof handleDueAction;
  handleDuePartialText?: typeof handleDuePartialText;
}

const defaultLineAssistantDependencies: LineAssistantDependencies = {
  findUserByLineId,
  checkLinkedAccountWriteAccess,
  isProUser,
};

/**
 * The reads every assistant message starts with, done ahead of time. The webhook starts this at the same
 * moment it claims the event and checks the rate limit, so the three groups wait on the network together
 * instead of one after another (each round trip to the database is ~150-250 ms from a Worker). It only
 * reads; handleAssistantMessage uses the answers exactly where it used to make the same calls, so an
 * unlinked, closed or expired account is still stopped at the same step and a failed lookup still fails
 * closed. Never rejects: each result carries its own outcome.
 */
export interface LinkedContext {
  user: PromiseSettledResult<UserRow | null>;
  access?: PromiseSettledResult<Awaited<ReturnType<typeof checkLinkedAccountWriteAccess>>>;
  pro?: PromiseSettledResult<boolean>;
}

export function prefetchLinkedContext(
  lineUserId: string,
  dependencies: LineAssistantDependencies = defaultLineAssistantDependencies,
): Promise<LinkedContext> {
  return (async () => {
    const [user] = await Promise.allSettled([(async () => dependencies.findUserByLineId(lineUserId))()]);
    if (user.status === 'rejected' || !user.value) return { user };
    const id = user.value.user_id;
    const [access, pro] = await Promise.allSettled([
      (async () => dependencies.checkLinkedAccountWriteAccess(id))(),
      (async () => dependencies.isProUser(id))(),
    ]);
    return { user, access, pro };
  })();
}

const settledValue = <T,>(result: PromiseSettledResult<T>): T => {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
};

export async function handleAssistantMessage(
  lineUserId: string,
  text: string,
  operationId?: string,
  dependencies: LineAssistantDependencies = defaultLineAssistantDependencies,
  prefetched?: Promise<LinkedContext>,
): Promise<LineMessage[] | null> {
  const result = await handleAssistantMessageInner(lineUserId, text, operationId, dependencies, prefetched);
  if (result === null) return null;
  const messages = Array.isArray(result) ? result : [result];
  // Linked, handled, nothing to say: the webhook sends no reply (never the link-code answer).
  if (messages.length === 0) return [];
  const lastIndex = messages.length - 1;
  const withQuick = messages.map((m, i) => (i === lastIndex && !m.quickReply ? { ...m, quickReply: getQuickReply() } : m));
  return withQuick.slice(0, 5); // LINE's reply API accepts at most 5 messages per call
}

async function handleAssistantMessageInner(
  lineUserId: string,
  text: string,
  operationId: string | undefined,
  dependencies: LineAssistantDependencies,
  prefetched?: Promise<LinkedContext>,
): Promise<LineMessage | LineMessage[] | null> {
  const linked = prefetched ? await prefetched : undefined;
  let user: UserRow | null;
  try {
    user = linked ? settledValue(linked.user) : await dependencies.findUserByLineId(lineUserId);
  } catch (err) {
    // A real query error, not "this LINE user isn't linked" -- must never fall through to the
    // link-code flow, since that would wrongly tell an already-linked user they aren't linked.
    console.error('handleAssistantMessage: findUserByLineId failed:', err);
    return { type: 'text', text: 'ขอโทษครับ ระบบมีปัญหาชั่วคราวตอนนี้ ลองพิมพ์คำถามใหม่อีกครั้งครับ' };
  }
  if (!user) return null;

  // A LINE message has no app cookie, so lifecycle access must be checked from both Auth and
  // the durable pause/deletion row. Do this immediately after resolving the linked user: a
  // closed account or either lookup failing must not reach Pro checks, model calls, reads, or
  // financial writes. Treat an unexpected dependency rejection as unavailable too.
  try {
    const access = linked?.access ? settledValue(linked.access) : await dependencies.checkLinkedAccountWriteAccess(user.user_id);
    if (!access.allowed) return { type: 'text', text: access.error };
  } catch (err) {
    console.error('handleAssistantMessage: lifecycle lookup failed:', err);
    return { type: 'text', text: 'ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาลองใหม่อีกครั้ง' };
  }
  user.operationId = operationId;

  // LINE chat is a Pro-only feature (per PlansTab's feature list) -- once the free trial and any
  // paid period have both lapsed, every message gets this renewal prompt instead of being
  // processed, so the bot never keeps working indefinitely for an expired account.
  if (!(linked?.pro ? settledValue(linked.pro) : await dependencies.isProUser(user.user_id))) {
    return buildRenewalMessage(user);
  }

  const trimmed = text.trim();
  // The 08:00 reminder's payment buttons, and the amount typed after "ได้ไม่ครบ" (owner, 2026-10-22).
  // Deterministic: recorded without the model, after the same account and Pro checks as every message.
  const dueAction = decodeDueAction(trimmed);
  if (dueAction) return await (dependencies.handleDueAction ?? handleDueAction)(user, dueAction);
  const duePartial = await (dependencies.handleDuePartialText ?? handleDuePartialText)(user, trimmed);
  if (duePartial) return duePartial;
  const documentRequest = parseLineDocumentRequest(trimmed);
  if (documentRequest) {
    if (documentRequest.query.length > 120) return buildLineDocumentMessages(documentRequest);
    try {
      const documents = await (dependencies.findLineDocuments ?? findLineDocuments)(user.user_id, documentRequest);
      return buildLineDocumentMessages(documentRequest, documents);
    } catch {
      console.error('LINE document lookup unavailable');
      return buildLineDocumentMessages(documentRequest);
    }
  }
  let vaultFiles;
  if (isLineWhtShortcut(trimmed)) {
    try { vaultFiles = await (dependencies.listVaultFiles ?? listVaultFiles)({ kind: 'user', id: user.user_id }); }
    catch { console.error('LINE WHT metadata unavailable'); }
  }
  const shortcut = buildLineFeatureShortcut(trimmed, user.jobs || [], new Date(), { vaultFiles });
  if (shortcut) return shortcut;

  if (QUICK_ACTIONS[trimmed]) {
    return QUICK_ACTIONS[trimmed](buildDataSnapshot(user));
  }

  // A draft only counts if it's still within TTL -- an expired one is silently dropped rather
  // than resumed, so a message sent long after an abandoned "add job" attempt is never
  // mysteriously merged into it.
  const storedDraft = user.notif_settings?.pendingJobDraft;
  const pendingDraft = isActiveLineDraft('job', storedDraft, user.notif_settings || {})
    ? storedDraft?.draft
    : undefined;

  const storedExpenseDraft = user.notif_settings?.pendingExpenseDraft;
  const pendingExpenseDraft = isActiveLineDraft('expense', storedExpenseDraft, user.notif_settings || {})
    ? storedExpenseDraft?.draft
    : undefined;

  // A model may propose a financial write, but only this exact user action commits it.
  // Confirmation is checked before asking the model again so it cannot manufacture approval.
  const cancellation = /^ยกเลิกบันทึก(?: (job|expense) ([a-f0-9]{16}))?$/.exec(trimmed);
  if (cancellation) {
    if (cancellation[1]) {
      const kind = cancellation[1] as 'job' | 'expense';
      const stored = kind === 'job' ? storedDraft : storedExpenseDraft;
      const active = kind === 'job' ? pendingDraft : pendingExpenseDraft;
      if (!stored || !active || lineDraftKey(kind, stored) !== cancellation[2]) return { type: 'text', text: 'รายการนี้ไม่ได้รอยืนยันแล้วครับ กรุณาใช้การ์ดล่าสุด' };
      if (kind === 'job') await (dependencies.clearJobDraft ?? clearJobDraft)(user);
      else await (dependencies.clearExpenseDraft ?? clearExpenseDraft)(user);
    } else {
      if (!pendingDraft && !pendingExpenseDraft) return { type: 'text', text: 'ไม่มีรายการที่รอยืนยันครับ' };
      if (pendingDraft) await (dependencies.clearJobDraft ?? clearJobDraft)(user);
      if (pendingExpenseDraft) await (dependencies.clearExpenseDraft ?? clearExpenseDraft)(user);
    }
    return lineCard({
      title: 'ยกเลิกรายการแล้ว', character: 'cancelled', subtitle: 'รายการร่างนี้ไม่ได้ถูกบันทึก',
      altText: 'ยกเลิกรายการที่รอยืนยันแล้วครับ ยังไม่ได้บันทึกเป็นรายรับหรือรายจ่าย',
      body: [{ type: 'text', text: 'พิมพ์รายการใหม่ได้เลย เมื่อพร้อมบันทึกอีกครั้ง', size: 'sm', color: C.muted, wrap: true }],
    });
  }
  const confirmation = /^ยืนยันบันทึก(งาน|รายจ่าย)(?: ([a-f0-9]{16}))?$/.exec(trimmed);
  if (confirmation) {
    const kind = confirmation[1] === 'งาน' ? 'job' : 'expense';
    const stored = kind === 'job' ? storedDraft : storedExpenseDraft;
    const draft = kind === 'job' ? pendingDraft : pendingExpenseDraft;
    if (!stored || !draft || (confirmation[2] && lineDraftKey(kind, stored) !== confirmation[2])) {
      return { type: 'text', text: 'รายการนี้หมดอายุหรือมีร่างใหม่แล้วครับ กรุณาใช้การ์ดล่าสุดหรือส่งรายละเอียดใหม่' };
    }
    // The draft identity, not the delivery/message identity, prevents double-clicks
    // from creating two records when separate confirmations arrive concurrently.
    user.operationId = lineDraftOperationId(kind, stored);
    if (kind === 'job') {
      if (!pendingDraft?.name || !pendingDraft.value || !pendingDraft.paymentStatus) return { type: 'text', text: 'ข้อมูลงานยังไม่ครบครับ กรุณาเพิ่มข้อมูลที่ขาดก่อนยืนยัน' };
      const job = buildJobFromDraft(pendingDraft);
      if (!(await (dependencies.persistJob ?? persistJob)(user, job))) return { type: 'text', text: 'บันทึกไม่สำเร็จ ลองยืนยันอีกครั้งนะครับ' };
      try { await (dependencies.clearJobDraft ?? clearJobDraft)(user); }
      catch { console.error('line-assistant: saved job draft resolution failed'); }
      return buildJobSavedMessage(job, computeMonthNetForUser(user, job));
    }
    if (!pendingExpenseDraft?.name || !pendingExpenseDraft.amount) return { type: 'text', text: 'ข้อมูลรายจ่ายยังไม่ครบครับ กรุณาเพิ่มข้อมูลที่ขาดก่อนยืนยัน' };
    const expense = buildExpenseFromDraft(pendingExpenseDraft);
    if (!(await (dependencies.persistExpense ?? persistExpense)(user, expense))) return { type: 'text', text: 'บันทึกไม่สำเร็จ ลองยืนยันอีกครั้งนะครับ' };
    try { await (dependencies.clearExpenseDraft ?? clearExpenseDraft)(user); }
    catch { console.error('line-assistant: saved expense draft resolution failed'); }
    return buildExpenseSavedMessage(expense, computeMonthNetForUser(user, undefined, expense));
  }

  const existingName = user.notif_settings?.userName?.trim() || undefined;
  const alreadyAskedName = !!user.notif_settings?.nameAskedAt;

  // Same TTL-drop pattern as the job draft above -- a history gap longer than CHAT_HISTORY_TTL_MS
  // means this is effectively a fresh conversation, so stale context never gets dragged in.
  const storedHistoryAt = user.notif_settings?.chatHistoryUpdatedAt;
  const recentHistory = storedHistoryAt && Date.now() - new Date(storedHistoryAt).getTime() < CHAT_HISTORY_TTL_MS
    ? user.notif_settings?.chatHistory
    : undefined;

  // Ordinary entries, incomplete inputs, typos, and edits never fall back to a model.
  // Paid-language processing is a separate, explicitly requested "ถาม AI ..." path.
  const quickDraft = parseLineQuickDraft(trimmed, { pendingJob: pendingDraft, pendingExpense: pendingExpenseDraft });
  const aiText = explicitLineAiText(trimmed);
  if (!quickDraft && !aiText) {
    if (pendingDraft && storedDraft) return [{ type:'text', text:'ยังไม่ได้แก้ร่างจากข้อความนี้ครับ แตะ “แก้ไขรายการ” เพื่อปรับข้อมูลได้เลย' },buildLineDraftReview('job',storedDraft)];
    if (pendingExpenseDraft && storedExpenseDraft) return [{ type:'text', text:'ยังไม่ได้แก้ร่างจากข้อความนี้ครับ แตะ “แก้ไขรายการ” เพื่อปรับข้อมูลได้เลย' },buildLineDraftReview('expense',storedExpenseDraft)];
    // No reply for a message the bot does not recognise (owner, 2026-10-22: the "เลขายังไม่เข้าใจครับ"
    // card is not needed). An empty list means handled with nothing to send; null still means not linked.
    return [];
  }
  const result = quickDraft ?? await (dependencies.classifyMessage ?? classifyMessage)(aiText!, buildDataSnapshot(user), pendingDraft, existingName, recentHistory, pendingExpenseDraft);
  if (!result) {
    return finishConversationalReply(user, trimmed, !!existingName, alreadyAskedName, buildHelpText(existingName));
  }

  // A message can introduce the user's own name alongside anything else it's doing -- save it
  // right away and fold it into the in-memory `user` snapshot so it's already known name-wise for
  // the rest of this request (see the comment above saveJobDraft for why that mutation matters).
  if (result.userName && result.userName !== existingName) {
    await saveUserName(user, result.userName);
  }
  const knownName = result.userName || existingName;

  // A pending draft of the OTHER type, left over from an earlier abandoned attempt, must not
  // linger once the model has clearly classified this message as something else -- e.g. "อันนี้
  // เป็นค่าใช้จ่ายนะ" tags intent=add_expense, but a stale pendingJobDraft would otherwise still
  // steer a LATER short reply (just a name, just a number) back into the abandoned job via the
  // continuation instruction in the prompt above.
  if (result.intent === 'add_job' && pendingExpenseDraft) await (dependencies.clearExpenseDraft ?? clearExpenseDraft)(user);
  if (result.intent === 'add_expense' && pendingDraft) await (dependencies.clearJobDraft ?? clearJobDraft)(user);

  if (result.intent === 'add_job') {
    // Merge onto whatever was already captured from an earlier incomplete message -- a field
    // this message provides always overrides the stored one, but a field it doesn't mention
    // keeps its earlier value instead of the whole draft being thrown away and the user having
    // to repeat everything they already said.
    const merged: JobDraft = {
      ...(quickDraft?.freshDraft ? {} : pendingDraft),
      ...(result.jobName !== undefined && { name: result.jobName }),
      ...(result.jobClient !== undefined && { client: result.jobClient }),
      ...(result.jobType !== undefined && { type: result.jobType }),
      ...(result.jobValue !== undefined && { value: result.jobValue }),
      ...(result.jobCreditTerm !== undefined && { creditTerm: result.jobCreditTerm }),
      ...(result.jobPaymentStatus !== undefined && { paymentStatus: result.jobPaymentStatus }),
      ...(result.jobReceivedAmount !== undefined && { receivedAmount: result.jobReceivedAmount }),
      ...(result.jobWhtRate !== undefined && { whtRate: result.jobWhtRate }),
    };
    // An explicit status change supersedes an earlier deposit amount.
    if (result.jobPaymentStatus === 'pending' || result.jobPaymentStatus === 'paid') delete merged.receivedAmount;

    // Safety net on top of Claude's own extraction: "มัดจำ<number>" is a common enough pattern
    // that it's worth catching directly in code rather than trusting the model to follow the
    // prompt's instruction every single time. Only fires when the model didn't already set a
    // payment status, so it never overrides a real extraction.
    if (!merged.paymentStatus) {
      const depositMatch = trimmed.match(/มัดจำ[^0-9]{0,15}([\d,]+(?:\.\d+)?)/);
      const depositAmount = depositMatch ? parseFloat(depositMatch[1].replace(/,/g, '')) : NaN;
      if (depositAmount > 0) {
        merged.paymentStatus = 'partial';
        merged.receivedAmount = depositAmount;
      }
    }

    // Required before actually saving: just name, value, and whether payment's been received --
    // the essentials worth pausing to ask about. Client and credit term are left as-is (blank
    // unless the message happened to mention them) and can be filled in later from the app itself
    // instead of turning every quick "just add this" message into a multi-question exchange.
    const missingLabels = [
      !merged.name && 'ชื่องาน',
      !merged.value && 'มูลค่างาน',
      !merged.paymentStatus && 'ได้รับเงินหรือยัง (ได้แล้ว/ยังไม่ได้/ได้มัดจำบางส่วน)',
    ].filter((s): s is string => !!s);

    if (missingLabels.length === 0) {
      const jobValue = merged.value!;
      const draft: JobDraft = {
        name: merged.name!,
        client: merged.client,
        type: merged.type,
        value: jobValue,
        creditTerm: merged.creditTerm || 0,
        paymentStatus: merged.paymentStatus,
        receivedAmount: merged.receivedAmount,
        whtRate: merged.whtRate || 0,
      };
      await (dependencies.saveJobDraft ?? saveJobDraft)(user, draft, quickDraft?.freshDraft || false);
      return buildLineDraftReview('job', user.notif_settings!.pendingJobDraft!);
    }

    // Still missing something -- keep what's been said so far and ask specifically for what's
    // left, instead of discarding it all and making the user retype from scratch.
    await (dependencies.saveJobDraft ?? saveJobDraft)(user, merged, quickDraft?.freshDraft || false);
    const missingText = missingLabels.join(', ');
    const knownText = [merged.name, merged.value ? formatCurrency(merged.value) : null, merged.client].filter(Boolean).join(' ');
    if (quickDraft) {
      const card = buildLineDraftReview('job', user.notif_settings!.pendingJobDraft!);
      if (!merged.paymentStatus) card.quickReply = { items: [
        { type: 'action', action: { type: 'message', label: 'ยังไม่ได้รับเงิน', text: 'ยังไม่ได้รับเงิน' } },
        { type: 'action', action: { type: 'message', label: 'รับเงินครบแล้ว', text: 'รับเงินครบแล้ว' } },
      ] };
      return card;
    }
    return finishConversationalReply(user, trimmed, !!knownName, alreadyAskedName, `จดไว้ให้แล้วนะครับ${knownText ? ` (${knownText})` : ''} ขอข้อมูลเพิ่มอีกนิดนะครับ: ${missingText}`);
  }

  if (result.intent === 'add_expense') {
    // Same merge-onto-earlier-draft pattern as add_job above -- a field this message provides
    // always overrides the stored one, but a field it doesn't mention keeps its earlier value.
    const merged: ExpenseDraft = {
      ...(quickDraft?.freshDraft ? {} : pendingExpenseDraft),
      ...(result.expenseName !== undefined && { name: result.expenseName }),
      ...(result.expenseCategory !== undefined && { category: result.expenseCategory }),
      ...(result.expenseAmount !== undefined && { amount: result.expenseAmount }),
    };

    const missingLabels = [!merged.name && 'ชื่อรายการ', !merged.amount && 'จำนวนเงิน'].filter((s): s is string => !!s);

    if (missingLabels.length === 0) {
      const expenseAmount = merged.amount!;
      const draft: ExpenseDraft = { name: merged.name!, category: merged.category, amount: expenseAmount };
      await (dependencies.saveExpenseDraft ?? saveExpenseDraft)(user, draft, quickDraft?.freshDraft || false);
      return buildLineDraftReview('expense', user.notif_settings!.pendingExpenseDraft!);
    }

    // Still missing something -- keep what's been said so far and ask specifically for what's
    // left, same as the add_job flow, instead of discarding it all and asking from scratch.
    await (dependencies.saveExpenseDraft ?? saveExpenseDraft)(user, merged, quickDraft?.freshDraft || false);
    const missingText = missingLabels.join(', ');
    const knownText = [merged.name, merged.amount ? formatCurrency(merged.amount) : null].filter(Boolean).join(' ');
    if (quickDraft) return buildLineDraftReview('expense', user.notif_settings!.pendingExpenseDraft!);
    return finishConversationalReply(user, trimmed, !!knownName, alreadyAskedName, `จดไว้ให้แล้วนะครับ${knownText ? ` (${knownText})` : ''} ขอข้อมูลเพิ่มอีกนิดนะครับ: ${missingText}`);
  }

  // Any intent's `answer` is usable here now, not just "question" -- lets a plain greeting or
  // name introduction (intent "other") get a real in-character reply instead of always falling
  // through to the generic buildHelpText below.
  if (result.answer) {
    return finishConversationalReply(user, trimmed, !!knownName, alreadyAskedName, result.answer);
  }

  return finishConversationalReply(user, trimmed, !!knownName, alreadyAskedName, buildHelpText(knownName));
}
