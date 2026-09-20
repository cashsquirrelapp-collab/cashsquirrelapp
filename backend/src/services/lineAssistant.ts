import { randomUUID, createHash } from 'node:crypto';
import { insertRecord, patchPrivate } from '../repositories/accounts.js';
import { validateChanges } from '../../../shared/validation.js';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../config/supabase.js';
import { calculatePayDate, getRelativeDaysText, formatMonthKey, DEFAULT_JOB_TYPES } from '../../../shared/calendar.js';
import type { Expense, Goal } from '../../../shared/types.js';
import type { LineMessage } from './line.js';
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
// natural-language add-job/add-expense (classifyMessage extracts everything from one message and
// saves immediately). The one exception is a bounded "pending job draft" (see
// PENDING_JOB_DRAFT_TTL_MS / saveJobDraft / clearJobDraft below): if a message is missing a
// required field, what was captured is saved and the reply asks specifically for what's left, so
// a short follow-up (just a number, just a name) completes it instead of making the user retype
// the whole thing -- but it expires on its own after PENDING_JOB_DRAFT_TTL_MS and is never
// surfaced as "still waiting", so there's still no state a user can get permanently stuck in.
// Everything else is either a fixed Quick Reply command (zero AI cost) or a Claude-answered
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
  pendingJobDraft?: { draft: JobDraft; createdAt: string };
  pendingExpenseDraft?: { draft: ExpenseDraft; createdAt: string };
  userName?: string;
  nameAskedAt?: string;
  chatHistory?: ChatHistoryEntry[];
  chatHistoryUpdatedAt?: string;
  [key: string]: unknown;
}

// How long a partial "add job" draft stays available to be completed by a follow-up message.
// Short enough that a user who never comes back isn't left with a stale draft resurfacing days
// later and getting silently merged into an unrelated message; long enough to actually type a
// reply. Expired drafts are just dropped, never surfaced as "your draft expired" -- the whole
// point is nothing ever leaves the user stuck, per the note on handleAssistantMessageInner.
const PENDING_JOB_DRAFT_TTL_MS = 15 * 60 * 1000;

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

// Same one-time ฿149 THB Payment Link used by App.tsx's handleUpgrade -- client_reference_id is
// appended per-user below so the Stripe webhook can attribute the payment correctly.
const paymentLink = () => process.env.VITE_PRO_PAYMENT_URL || `${process.env.APP_URL || ''}/app`;

export async function isProUser(userId: string): Promise<boolean> {
  const [{ data: authUser, error: authErr }, { data: sub, error: subErr }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('subscriptions').select('status, current_period_end').eq('user_id', userId).maybeSingle(),
  ]);
  // A real lookup failure is indistinguishable here from "actually expired" -- fail open (treat
  // as Pro) rather than risk locking a paying user out of LINE chat over a transient DB hiccup.
  if (authErr || subErr) {
    console.error('isProUser: lookup failed, denying access:', { authErr, subErr });
    return false;
  }

  const createdAt = authUser?.user?.created_at;
  const isInFreeTrial = !!createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000 > Date.now();

  const isPaidActive = sub?.status === 'active' && !!sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();

  return isInFreeTrial || isPaidActive;
}

// Shown instead of processing anything once a user's trial/paid period has lapsed -- polite,
// in-character, and points straight at checkout (client_reference_id pre-filled) rather than
// making them find the upgrade button in the app themselves.
function buildRenewalMessage(user: UserRow): LineMessage {
  const url = new URL(paymentLink());
  url.searchParams.set('client_reference_id', user.user_id);
  if (user.email) url.searchParams.set('prefilled_email', user.email);
  return {
    type: 'text',
    text: `แพ็กเกจ Pro ของคุณหมดอายุแล้วครับ 🥲 การคุยกับผมผ่าน LINE เป็นสิทธิ์ของสมาชิก Pro น่ะครับ\n\nต่ออายุง่ายๆ กดลิงก์นี้ได้เลย พอจ่ายเสร็จกลับมาคุยกับผมต่อได้ทันที: ${url.toString()}`,
  };
}

export interface UserRow {
  user_id: string;
  operationId?: string;
  email?: string;
  jobs?: JobRow[];
  goals?: Goal[];
  settings?: SettingsRow;
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

  // Scoped by payDate||postDate falling in this month -- same job set computeMonthlySummary
  // itself sums for thisMonth's income/received, just kept as a list instead of a total.
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

  return { wip, unpaid, overdue, dueToday, dueSoon, thisMonth, lastMonth, thisMonthJobs, upcomingForecast, goals, totalPendingAllTime };
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
  const ai = getClaudeClient();
  if (!ai) return null;

  const formatted = {
    งานที่ยังไม่โพสต์_สต็อกงาน: snapshot.wip.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)}`),
    งานที่ยังไม่จ่ายเงิน: snapshot.unpaid.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} กำหนดชำระ ${j.dueText}${j.dueDate ? ` (วันที่ ${j.dueDate}, เดือน ${j.dueDate.slice(0, 7)})` : ''}`),
    งานที่เลยกำหนดชำระแล้ว: snapshot.overdue.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} (${j.overdueText})`),
    งานที่ครบกำหนดชำระวันนี้: snapshot.dueToday.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ${formatCurrency(j.pending)}`),
    งานที่ใกล้ครบกำหนด_ภายใน10วัน_เรียงใกล้สุดก่อน: snapshot.dueSoon.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} (${j.dueText})`),
    งานที่เข้าเดือนนี้: snapshot.thisMonthJobs.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)} ${j.isUnpaid ? `(ค้าง ${formatCurrency(j.pending)})` : j.isPosted === false ? '(ในสต็อก)' : '(จ่ายแล้ว)'}`),
    ยอดค้างรับทั้งหมดรวมทุกงาน: formatCurrency(snapshot.totalPendingAllTime),
    สรุปเดือนนี้: { เดือน: snapshot.thisMonth.monthKey, รับแล้วจริง: formatCurrency(snapshot.thisMonth.received), รายจ่ายรวม: formatCurrency(snapshot.thisMonth.fixedExpenseCalculated + snapshot.thisMonth.variableExpense), กระแสเงินสดสุทธิ: formatCurrency(Math.max(0, snapshot.thisMonth.netFlow)), ยอดออมสะสมโดยประมาณ: formatCurrency(snapshot.thisMonth.actualSavings) },
    สรุปเดือนที่แล้ว: { เดือน: snapshot.lastMonth.monthKey, รับแล้วจริง: formatCurrency(snapshot.lastMonth.received), รายจ่ายรวม: formatCurrency(snapshot.lastMonth.fixedExpenseCalculated + snapshot.lastMonth.variableExpense), กระแสเงินสดสุทธิ: formatCurrency(Math.max(0, snapshot.lastMonth.netFlow)), ยอดออมสะสมโดยประมาณ: formatCurrency(snapshot.lastMonth.actualSavings) },
    พยากรณ์รายรับเดือนถัดไป_3เดือน: snapshot.upcomingForecast.map((f) => `${formatMonthKey(f.monthKey)} (เดือน ${f.monthKey}): คาดว่าจะได้รับ ${formatCurrency(f.expectedIncome)} (รวมยอดที่รับแล้ว+ยอดค้างรับของงานที่ส่งมอบแล้วซึ่งมีกำหนดชำระในเดือนนี้ ไม่รวมงานสต็อกที่ยังไม่ส่งมอบเพราะยังไม่รู้วันชำระแน่นอน)`),
    เป้าหมายออม: snapshot.goals.map((g) => `${g.name} เป้าหมาย ${formatCurrency(g.target)} สะสมแล้ว ${formatCurrency(g.current)} (${g.target > 0 ? Math.round((g.current / g.target) * 100) : 0}%) กำหนดเสร็จ ${g.deadline}${g.allocatedPercentage ? ` แบ่งจากกำไรอัตโนมัติ ${g.allocatedPercentage}%` : ''}`),
  };

  try {
    const response = await callWithRetry(() =>
      ai.messages.create({
        model: 'claude-haiku-4-5-20251001',
        // Was 1024 -- too tight once the tool call's "answer" field carries a real Thai
        // explanation (e.g. "what's included in this number") alongside the JSON scaffolding;
        // hitting the cap mid-answer truncates the tool_use JSON, which then fails to parse
        // and silently returns null below with nothing logged. 4096 gives real headroom.
        max_tokens: 4096,
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
- "กระแสเงินสดสุทธิ" ในข้อมูลนี้ไม่ใช่ตัวเลขเดียวกับ "กำไร/กำไรสุทธิ" เป๊ะๆ -- มันคือ (เงินที่รับแล้วจริง) ลบ (รายจ่ายที่บันทึกไว้ในระบบเท่านั้น) และไม่ติดลบต่ำกว่า 0 ถ้าผู้ใช้ถามถึงกำไร ให้ตอบด้วยตัวเลขนี้ได้แต่ต้องบอกด้วยว่านี่คือกระแสเงินสดสุทธิจากรายการที่บันทึกไว้ ไม่ใช่กำไรทางบัญชีที่แม่นยำ 100% เพราะอาจมีรายจ่ายที่ผู้ใช้ยังไม่ได้บันทึกเข้าระบบ (เช่น ค่าจ้างฟรีแลนซ์ช่วยงาน ต้นทุนอื่นๆ) ซึ่งจะไม่ถูกรวมในตัวเลขนี้
- ถ้าถามว่าตัวเลขใดตัวเลขหนึ่ง "รวมอะไรบ้าง" หรือครบถ้วนหรือไม่ ให้อธิบายตามจริงว่าเป็นผลรวมของอะไร (เช่น รายจ่ายรวม = ค่าใช้จ่ายคงที่ + ค่าใช้จ่ายผันแปรที่บันทึกไว้ในแอป) และบอกตรงๆ ว่าถ้ามีรายจ่ายอะไรที่ยังไม่ได้บันทึกเป็นรายการในแอป ตัวเลขนี้จะไม่รวมส่วนนั้น
- ถ้าคำถามเกี่ยวกับการเพิ่ม/แก้ไข/ลบข้อมูล ให้แนะนำให้กดปุ่ม "📝 ฟอร์มบันทึก" แทน เพราะที่นี่ตอบได้แค่คำถาม แก้ไขข้อมูลไม่ได้
- ปุ่มลัดที่มีอยู่จริงในแชทมีแค่นี้เท่านั้น: "📝 ฟอร์มบันทึก", "📋 งานค้างจ่าย", "📊 สรุปเดือนนี้", "📅 งานเดือนนี้", "📦 งานสต็อก" ห้ามอ้างถึงหรือแนะนำปุ่มชื่ออื่นที่ไม่มีอยู่ในรายการนี้เด็ดขาด (เช่นห้ามพูดถึงปุ่ม "สรุปรายรับ" เพราะไม่มีจริง)
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
- ถ้า intent = "add_job" แต่ไม่มี jobName หรือ jobValue หรือ intent = "add_expense" แต่ไม่มี expenseName หรือ expenseAmount ให้ยังคง intent นั้นไว้ แต่ใส่คำตอบในช่อง answer บอกสิ่งที่ขาดไปแบบเป็นมิตร ชวนพิมพ์มาใหม่พร้อมข้อมูลที่ขาด หรือกดปุ่ม "📝 ฟอร์มบันทึก" แทนก็ได้
- ถ้าข้อความไม่เข้าเงื่อนไขไหนเลย (เช่นทักทายเฉยๆ, บอกชื่อตัวเองเฉยๆ, พูดคุยทั่วไป) ให้ intent = "other" และถ้าเป็นการทักทาย/แนะนำตัว/พูดคุยเล็กๆ น้อยๆ ที่พอตอบกลับได้แบบมีคาแรคเตอร์ ให้ใส่คำตอบสั้นๆ อบอุ่นในช่อง answer ด้วย (ไม่ต้องใส่ก็ได้ถ้าข้อความไม่มีความหมายจับต้องได้เลย)
- ไม่ว่า intent จะเป็นอะไรก็ตาม: ถ้าข้อความนี้มีการบอกชื่อของผู้ใช้เอง ให้ใส่เฉพาะชื่อเรียก (ไม่ใส่คำนำหน้า/คำอื่น) ลงในฟิลด์ userName เสมอ ไม่มีการบอกชื่อก็ไม่ต้องใส่ฟิลด์นี้
${pendingJobDraft ? `
ผู้ใช้เพิ่งเริ่มบันทึกงานนี้ไว้เมื่อครู่แต่ข้อมูลยังไม่ครบ ยังค้างรออยู่: ${JSON.stringify(pendingJobDraft)}
ถ้าข้อความใหม่นี้ดูเหมือนเป็นคำตอบที่เติมข้อมูลที่ขาดไปของงานนี้ (เช่น พิมพ์มาแค่ตัวเลขเดียว หรือชื่อลูกค้าเดียว โดยไม่มีบริบทอื่น) ให้ตีความว่า intent = "add_job" แล้วใส่ค่ากลับเข้าไปในฟิลด์ job* ให้ครบทุกฟิลด์ที่มีอยู่แล้วข้างต้นด้วย (ไม่ใช่ใส่แค่ฟิลด์ที่เพิ่งพิมพ์มาใหม่) รวมกับฟิลด์ใหม่ที่เพิ่งได้จากข้อความนี้ แต่ถ้าข้อความนี้ชัดเจนว่าเป็นเรื่องอื่นที่ไม่เกี่ยวกับการเติมงานนี้เลย (เช่นถามคำถามอื่น หรือพูดถึงงาน/รายจ่ายใหม่คนละเรื่อง หรือบอกว่านี่คือรายจ่ายไม่ใช่รายรับ) ให้ตีความตามความหมายจริงของมันตามปกติ ไม่ต้องฝืนตีความเป็น add_job` : ''}
${pendingExpenseDraft ? `
ผู้ใช้เพิ่งเริ่มบันทึกรายจ่ายนี้ไว้เมื่อครู่แต่ข้อมูลยังไม่ครบ ยังค้างรออยู่: ${JSON.stringify(pendingExpenseDraft)}
ถ้าข้อความใหม่นี้ดูเหมือนเป็นคำตอบที่เติมข้อมูลที่ขาดไปของรายจ่ายนี้ (เช่น พิมพ์มาแค่ชื่อรายการ หรือแค่จำนวนเงิน โดยไม่มีบริบทอื่น) ให้ตีความว่า intent = "add_expense" แล้วใส่ค่ากลับเข้าไปในฟิลด์ expense* ให้ครบทุกฟิลด์ที่มีอยู่แล้วข้างต้นด้วย (ไม่ใช่ใส่แค่ฟิลด์ที่เพิ่งพิมพ์มาใหม่) รวมกับฟิลด์ใหม่ที่เพิ่งได้จากข้อความนี้ แต่ถ้าข้อความนี้ชัดเจนว่าเป็นเรื่องอื่นที่ไม่เกี่ยวกับการเติมรายจ่ายนี้เลย ให้ตีความตามความหมายจริงของมันตามปกติ ไม่ต้องฝืนตีความเป็น add_expense` : ''}

ข้อมูลบัญชีจริง (JSON):
${JSON.stringify(formatted, null, 2)}

ข้อความจากผู้ใช้: "${text}"`,
          },
        ],
      })
    );
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
// zero AI calls involved anywhere in this flow. The form button only appears once LIFF_ID is
// configured (api/liff-submit.ts). It deliberately opens a LIFF page rather than deep-linking
// into the web app's own Supabase-session-based UI: a LIFF page verifies identity from the LINE
// session itself (via an ID token, checked server-side), so it always saves to the account this
// LINE user is linked to -- no separate login, and no risk of landing in whatever account
// happens to be logged into the browser on that device.
function getQuickReply(): import('./line.js').LineQuickReply {
  const liffId = process.env.LIFF_ID;
  const items: import('./line.js').LineQuickReply['items'] = [];
  if (liffId) {
    items.push({ type: 'action', action: { type: 'uri', label: '📝 ฟอร์มบันทึก', uri: `https://liff.line.me/${liffId}` } });
  }
  items.push(
    { type: 'action', action: { type: 'message', label: '📋 งานค้างจ่าย', text: 'งานค้างจ่าย' } },
    { type: 'action', action: { type: 'message', label: '📊 สรุปเดือนนี้', text: 'สรุปเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: '📅 งานเดือนนี้', text: 'งานเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: '📦 งานสต็อก', text: 'งานสต็อก' } }
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

function buildSectionLabel(text: string, color: string) {
  return { type: 'text', text, size: 'xs', weight: 'bold', color, margin: 'lg' };
}

// Shared cream "bank statement" bubble shell every Quick Reply report below is built on --
// same visual language as buildJobSavedMessage (statement rows, separators, open-app footer),
// so every report reads as one consistent card style instead of a mix of card and plain text.
function buildReceiptCard(bodyContents: any[], altText: string, buttonColor: string = '#E65F2B', showButton: boolean = true): LineMessage {
  const contents: any = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', backgroundColor: '#FBF2E4', borderWidth: '1px', borderColor: '#D8CBB8', paddingAll: '20px', spacing: 'sm', contents: bodyContents },
  };
  const appUrl = process.env.APP_URL;
  if (appUrl && showButton) {
    contents.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{ type: 'button', style: 'primary', color: buttonColor, action: { type: 'uri', label: 'เปิดแอป', uri: appUrl.replace(/\/$/, '') } }],
    };
  }
  return { type: 'flex', altText, contents };
}

function buildJobRow(name: string, client: string, amount: number, color: string) {
  return buildStatementRow(name + (client ? ` (${client})` : ''), formatCurrency(amount), { bold: false, color });
}

function buildUnpaidJobsMessage(snapshot: DataSnapshot): LineMessage {
  if (snapshot.unpaid.length === 0) return { type: 'text', text: '🎉 ตอนนี้ไม่มีงานค้างจ่ายเลยครับ' };
  const bodyContents: any[] = [
    buildStatementRow('งานค้างจ่าย', `ทั้งหมด ${snapshot.unpaid.length} งาน`, { size: 'xl', color: '#3D2314' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    ...snapshot.unpaid.flatMap((j) => [
      buildJobRow(j.name, j.client, j.pending, '#A63F1B'),
      { type: 'text', text: `กำหนดชำระ ${j.dueText}`, size: 'xxs', color: '#A88A6E', align: 'end' },
    ]),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('รวมค้างรับทั้งหมด', formatCurrency(snapshot.totalPendingAllTime), { color: '#A63F1B' }),
  ];
  return buildReceiptCard(bodyContents, `งานค้างจ่ายทั้งหมด ${snapshot.unpaid.length} งาน • รวม ${formatCurrency(snapshot.totalPendingAllTime)}`);
}

function buildThisMonthSummaryMessage(snapshot: DataSnapshot): LineMessage {
  const s = snapshot.thisMonth;
  const monthLabel = formatMonthKey(s.monthKey);
  const bodyContents: any[] = [
    buildStatementRow('สรุปเดือนนี้', monthLabel, { size: 'xl', color: '#3D2314' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('รับแล้วจริง', formatCurrency(s.received), { bold: false, color: '#0E9F6E' }),
    buildStatementRow('รายจ่ายรวม', formatCurrency(s.fixedExpenseCalculated + s.variableExpense), { bold: false, color: '#A63F1B' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('กระแสเงินสดสุทธิ', formatCurrency(Math.max(0, s.netFlow)), { color: '#3D2314' }),
    buildStatementRow('ยอดออมสะสมโดยประมาณ', formatCurrency(s.actualSavings), { bold: false, color: '#0E9F6E' }),
  ];
  return buildReceiptCard(bodyContents, `สรุปเดือนนี้ (${monthLabel}) • รับแล้ว ${formatCurrency(s.received)} • คงเหลือ ${formatCurrency(Math.max(0, s.netFlow))}`);
}

function buildWipJobsMessage(snapshot: DataSnapshot): LineMessage {
  if (snapshot.wip.length === 0) return { type: 'text', text: '📦 ตอนนี้ไม่มีงานในสต็อก (ยังไม่โพสต์) เลยครับ' };
  const bodyContents: any[] = [
    buildStatementRow('งานในสต็อก', `ทั้งหมด ${snapshot.wip.length} งาน`, { size: 'xl', color: '#3D2314' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    ...snapshot.wip.map((j) => buildJobRow(j.name, j.client, j.value, '#4338CA')),
  ];
  return buildReceiptCard(bodyContents, `งานในสต็อก ${snapshot.wip.length} งาน (ยังไม่ส่งงาน)`);
}

// Flex "receipt" card version of the month's job list -- grouped into unpaid/paid/stock
// sections so it reads as a clean report instead of a wall of plain-text lines.
function buildThisMonthJobsMessage(snapshot: DataSnapshot): LineMessage {
  const s = snapshot.thisMonth;
  const monthLabel = formatMonthKey(s.monthKey);

  if (snapshot.thisMonthJobs.length === 0) {
    return { type: 'text', text: `📅 เดือนนี้ (${monthLabel}) ยังไม่มีงานเข้าเลยครับ` };
  }

  const wip = snapshot.thisMonthJobs.filter((j) => j.isPosted === false);
  const invoiced = snapshot.thisMonthJobs.filter((j) => j.isPosted !== false);
  const unpaid = invoiced.filter((j) => j.isUnpaid);
  const paid = invoiced.filter((j) => !j.isUnpaid);
  const unpaidSum = unpaid.reduce((sum, j) => sum + j.pending, 0);

  const bodyContents: any[] = [
    buildStatementRow('งานเดือนนี้', monthLabel, { size: 'xl', color: '#3D2314' }),
    { type: 'text', text: `ทั้งหมด ${snapshot.thisMonthJobs.length} งาน`, size: 'xs', color: '#A88A6E' },
  ];

  if (unpaid.length > 0) {
    bodyContents.push(
      { type: 'separator', margin: 'lg', color: '#E8DFD3' },
      buildSectionLabel(`💸 ยังไม่จ่าย (${unpaid.length} • ค้างรวม ${formatCurrency(unpaidSum)})`, '#A63F1B'),
      ...unpaid.map((j) => buildJobRow(j.name, j.client, j.pending, '#A63F1B'))
    );
  }
  if (paid.length > 0) {
    bodyContents.push(
      { type: 'separator', margin: 'lg', color: '#E8DFD3' },
      buildSectionLabel(`✅ จ่ายแล้ว (${paid.length})`, '#0E9F6E'),
      ...paid.map((j) => buildJobRow(j.name, j.client, j.value, '#0E9F6E'))
    );
  }
  if (wip.length > 0) {
    bodyContents.push(
      { type: 'separator', margin: 'lg', color: '#E8DFD3' },
      buildSectionLabel(`📦 ในสต็อก (${wip.length})`, '#4338CA'),
      ...wip.map((j) => buildJobRow(j.name, j.client, j.value, '#4338CA'))
    );
  }

  bodyContents.push(
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('รวมมูลค่าทั้งหมด', formatCurrency(s.income), { color: '#3D2314' })
  );

  const altText = unpaid.length > 0
    ? `งานเดือนนี้ (${monthLabel}) ${snapshot.thisMonthJobs.length} งาน • ยังไม่จ่าย ${unpaid.length} งาน ค้าง ${formatCurrency(unpaidSum)}`
    : `งานเดือนนี้ (${monthLabel}) ${snapshot.thisMonthJobs.length} งาน`;
  return buildReceiptCard(bodyContents, altText);
}

const QUICK_ACTIONS: Record<string, (snapshot: DataSnapshot) => LineMessage> = {
  งานค้างจ่าย: buildUnpaidJobsMessage,
  สรุปเดือนนี้: buildThisMonthSummaryMessage,
  งานสต็อก: buildWipJobsMessage,
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
    'พิมพ์เล่าเรื่องงาน/รายจ่ายมาได้เลย เดี๋ยวบันทึกให้ หรือถามอะไรเกี่ยวกับเงินๆ ทองๆ ก็ได้ครับ กดปุ่มด้านล่างก็ได้เหมือนกัน',
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
  const whtAmount = Math.round(valueNum * (whtRate / 100));
  const netReceivable = valueNum - whtAmount;
  let status: string = 'pending';
  let received = 0;
  if (draft.paymentStatus === 'paid') {
    status = 'done';
    received = netReceivable;
  } else if (draft.paymentStatus === 'partial') {
    status = 'partial';
    received = draft.receivedAmount || 0;
  }
  const pending = Math.max(0, netReceivable - received);
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
    note: draft.note || '',
  };
}

export async function persistJob(user: UserRow, job: ReturnType<typeof buildJobFromDraft>): Promise<boolean> {
  try {
    if (user.operationId) job.id = createHash('sha256').update(`job:${user.user_id}:${user.operationId}`).digest('hex');
    validateChanges([{table:'cashflow_jobs',id:job.id,op:'set',version:null,data:job}]);
    await insertRecord('cashflow_jobs',user.user_id,job,!!user.operationId); return true;
  } catch { console.error('persistJob: insert failed'); return false; }
}

// Persists (or clears) the in-progress "add job" draft so the next message can complete it
// instead of starting over -- best-effort: a failed write here just means the next message
// starts fresh rather than resuming, never a hard failure the user sees.
// Every notif_settings writer here mutates `user.notif_settings` locally right after a successful
// write (instead of only writing to the DB) -- a single request can touch more than one of these
// keys in a row (e.g. a message that both introduces a name AND leaves a job draft incomplete),
// and each writer merges onto `user.notif_settings` as its base. Without updating that local
// object in between, a later writer in the same request would merge onto the original stale
// snapshot and silently drop whatever an earlier writer in this same request just saved.
async function saveJobDraft(user: UserRow, draft: JobDraft): Promise<void> {
  const notif_settings = { ...(user.notif_settings || {}), pendingJobDraft: { draft, createdAt: new Date().toISOString() } };
  await patchPrivate(user.user_id, { pendingJobDraft: notif_settings.pendingJobDraft });
  user.notif_settings = notif_settings;
}

async function clearJobDraft(user: UserRow): Promise<void> {
  if (!user.notif_settings?.pendingJobDraft) return;
  const { pendingJobDraft: _omit, ...rest } = user.notif_settings;
  await patchPrivate(user.user_id, {}, ['pendingJobDraft']);
  user.notif_settings = rest;
}

// Same shape as saveJobDraft/clearJobDraft, for an in-progress "add expense" that's missing a
// name or amount. Without this, a follow-up like "ชื่อรายการ คือ ตัดต่ออาร์คต" had nothing
// structured to complete -- it relied entirely on the model re-deriving the amount from chat
// history text, and worse, a *stale* pendingJobDraft (from an earlier, abandoned job) could hijack
// that short reply via the job-continuation prompt instruction below, misfiling it as a job.
async function saveExpenseDraft(user: UserRow, draft: ExpenseDraft): Promise<void> {
  const notif_settings = { ...(user.notif_settings || {}), pendingExpenseDraft: { draft, createdAt: new Date().toISOString() } };
  await patchPrivate(user.user_id, { pendingExpenseDraft: notif_settings.pendingExpenseDraft });
  user.notif_settings = notif_settings;
}

async function clearExpenseDraft(user: UserRow): Promise<void> {
  if (!user.notif_settings?.pendingExpenseDraft) return;
  const { pendingExpenseDraft: _omit, ...rest } = user.notif_settings;
  await patchPrivate(user.user_id, {}, ['pendingExpenseDraft']);
  user.notif_settings = rest;
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

// Bangkok "19:33" style short clock time -- shown next to the badge label so a card still reads
// "when did this happen" on its own, without relying on LINE's own message timestamp (which
// users don't reliably notice, per direct feedback on a live card).
function formatTimeShort(): string {
  const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const hh = String(bkk.getUTCHours()).padStart(2, '0');
  const mm = String(bkk.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// A small colored icon chip + label + time, meant as the very first row of a notification
// card's bodyContents -- gives every card type (job saved, edited, deleted, expense added, goal
// deposit, ...) its own glanceable symbol + color, instead of every card reading as the same
// "cream statement card" shape with only a colored header word to tell them apart. `color`
// doubles as the label color and (baked into the PNG itself) the badge circle's background at
// ~15% opacity, matching the web app's own badge styling. icon is one of the basenames under
// public/icons/badge-*.png (generated to match this app's own hand-drawn line-icon style -- see
// icons.tsx). LINE Flex has no way to render inline SVG or an emoji-as-icon reliably across
// devices, only a hosted image, so these are real PNGs served from this deployment.
function buildTypeBadge(icon: string, label: string, color: string) {
  const appUrl = process.env.APP_URL;
  const iconUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/icons/badge-${icon}.png` : undefined;
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    alignItems: 'center',
    margin: 'md',
    contents: [
      ...(iconUrl ? [{ type: 'image', url: iconUrl, size: '26px', aspectRatio: '1:1', aspectMode: 'cover' as const, flex: 0 }] : []),
      { type: 'text', text: label, size: 'sm', weight: 'bold', color, gravity: 'center', flex: 1, wrap: true },
      { type: 'text', text: formatTimeShort(), size: 'xs', color: '#A88A6E', gravity: 'center', align: 'end', flex: 0 },
    ],
  };
}

// A simple label-left / value-right row, like a bank transfer receipt statement.
function buildStatementRow(label: string, value: string, opts?: { size?: string; color?: string; bold?: boolean }) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#7A5C43', flex: 2, gravity: 'center', wrap: true },
      { type: 'text', text: value, size: opts?.size || 'sm', color: opts?.color || '#3D2314', weight: opts?.bold === false ? 'regular' : 'bold', flex: 3, align: 'end', wrap: true },
    ],
  };
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
// summary when APP_URL isn't configured (no working deep link yet). monthNet, when given, adds
// a running "คงเหลือเดือนนี้" line -- receivedAfterVariableExpense from computeMonthlySummary
// (received minus already-logged variable expenses, not netFlow), matching the Dashboard's
// "คงเหลือหลังหักรายจ่าย" figure. Computed by the caller so this stays a pure display function.
export function buildJobSavedMessage(job: JobCardData, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const isDone = job.status === 'done';
  const isPartial = job.status === 'partial';
  const isPaidSome = isDone || isPartial;
  const statusLabel = isWip ? 'สต็อก (ยังไม่ส่งงาน)' : isDone ? 'จ่ายครบแล้ว' : isPartial ? 'ได้รับมัดจำแล้ว' : 'ยังไม่ได้รับเงิน';
  const appUrl = process.env.APP_URL;
  // Four distinct moments, four distinct badges: WIP (indigo), posted with nothing received yet
  // (teal "ดีลงาน"), a deposit landed but the job isn't fully paid (amber "ได้รับมัดจำ" -- kept
  // separate from full payment per direct feedback: a deposit shouldn't read as "รับเงินแล้ว" the
  // same way a completed payment does), and fully paid (green "รับเงินแล้ว"). Before this, "done"
  // and "partial" shared the same green badge and headline, so a card for a job that had only
  // gotten a deposit looked identical to one that was fully settled.
  const headerLabel = isWip ? 'สต็อกใหม่' : isDone ? 'รับเงิน' : isPartial ? 'รับมัดจำ' : 'มูลค่าดีล';
  const headerColor = isWip ? '#4338CA' : isDone ? '#0E9F6E' : isPartial ? '#B45309' : '#0D9488';
  // job.value is the full contract value, not what's actually landed -- for a partial payment
  // that's just the deposit, so show job.received (falling back to value if a caller doesn't send
  // it) instead of implying the whole contract amount arrived.
  const displayAmount = isPaidSome ? (job.received ?? job.value) : job.value;

  if (!appUrl) {
    const lines = [
      isWip ? '📦 บันทึกงานเข้าสต็อกแล้วครับ!' : 'บันทึกงานสำเร็จแล้วครับ! ✅',
      '',
      `ชื่องาน: ${job.name}`,
      ...(job.client ? [`ลูกค้า: ${job.client}`] : []),
      `มูลค่า: ${formatCurrency(job.value)}`,
      ...(job.whtRate ? [`หัก ณ ที่จ่าย ${job.whtRate}%: -${formatCurrency(job.whtAmount || 0)}`] : []),
      `สถานะ: ${statusLabel}`,
      ...(!isWip && (job.pending || 0) > 0 ? [`ยอดค้างรับ: ${formatCurrency(job.pending || 0)}`] : []),
      ...(!isWip && monthNet != null ? [`คงเหลือเดือนนี้: ${formatCurrency(Math.max(0, monthNet))}`] : []),
    ];
    return { type: 'text', text: lines.join('\n') };
  }

  const contents = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FBF2E4',
      borderWidth: '1px',
      borderColor: '#D8CBB8',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        isWip
          ? buildTypeBadge('package', 'เข้าสต็อก', headerColor)
          : isDone
            ? buildTypeBadge('coin', 'รับเงินแล้ว', headerColor)
            : isPartial
              ? buildTypeBadge('partial', 'ได้รับมัดจำ', headerColor)
              : buildTypeBadge('deal', 'ดีลงาน', headerColor),
        buildStatementRow(headerLabel, `${isPaidSome ? '+' : ''}${formatCurrency(displayAmount)}`, { size: 'xl', color: headerColor }),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        buildStatementRow('ชื่องาน', job.name, { bold: false }),
        ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
        ...(job.whtRate ? [buildStatementRow(`หัก ณ ที่จ่าย ${job.whtRate}%`, `-${formatCurrency(job.whtAmount || 0)}`, { bold: false, color: '#C17817' })] : []),
        buildStatementRow('สถานะ', statusLabel, { bold: false }),
        ...(!isWip && (job.pending || 0) > 0 ? [buildStatementRow('ค้างรับ', formatCurrency(job.pending || 0), { bold: false, color: '#C17817' })] : []),
        ...(!isWip && monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: headerColor,
          action: { type: 'uri', label: 'เปิดแอป', uri: `${appUrl.replace(/\/$/, '')}/?job=${encodeURIComponent(job.id)}` },
        },
      ],
    },
  };

  return { type: 'flex', altText: isWip ? `เพิ่มงาน "${job.name}" เข้าสต็อกแล้วครับ` : `บันทึกงาน "${job.name}" สำเร็จแล้วครับ`, contents };
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
    await insertRecord('cashflow_expenses',user.user_id,expense,!!user.operationId); return true;
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
// button just opens the app.
export function buildExpenseSavedMessage(expense: Expense, monthNet?: number): LineMessage {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    const lines = [
      'บันทึกรายจ่ายสำเร็จแล้วครับ! 🧾',
      '',
      `รายการ: ${expense.name}`,
      `หมวด: ${expense.category}`,
      `จำนวน: ${formatCurrency(expense.amount)}`,
      `วันที่: ${expense.date}`,
      ...(monthNet != null ? [`คงเหลือเดือนนี้: ${formatCurrency(Math.max(0, monthNet))}`] : []),
    ];
    return { type: 'text', text: lines.join('\n') };
  }

  const contents = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FBF2E4',
      borderWidth: '1px',
      borderColor: '#D8CBB8',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        buildTypeBadge('receipt', 'รายจ่ายใหม่', '#A63F1B'),
        buildStatementRow('จ่ายเงิน', `-${formatCurrency(expense.amount)}`, { size: 'xl', color: '#A63F1B' }),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        buildStatementRow('รายการ', expense.name, { bold: false }),
        buildStatementRow('หมวด', expense.category, { bold: false }),
        ...(monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#A63F1B',
          action: { type: 'uri', label: 'เปิดแอป', uri: `${appUrl.replace(/\/$/, '')}/?expense=${encodeURIComponent(expense.id)}` },
        },
      ],
    },
  };

  return { type: 'flex', altText: `บันทึกรายจ่าย "${expense.name}" สำเร็จแล้วครับ`, contents };
}

// LINE can't delete/unsend a message the bot already pushed -- there's no such API. This sends
// a follow-up "ยกเลิกแล้ว" card instead, so the chat at least shows the job was voided rather
// than leaving the original "บันทึกงานสำเร็จ" card looking like it's still active.
export function buildJobDeletedMessage(job: { name: string; client?: string; value: number; isPosted?: boolean }, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const bodyContents = [
    buildTypeBadge('trash', 'ยกเลิกงาน', '#78716C'),
    buildStatementRow('ยกเลิกงาน', formatCurrency(job.value), { size: 'xl', color: '#78716C' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('ชื่องาน', job.name, { bold: false }),
    ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
    ...(!isWip && monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
  ];
  // No "เปิดแอป" button here -- the job is gone, there's nothing left in the app for this card
  // to open to.
  return buildReceiptCard(bodyContents, `ยกเลิกงาน "${job.name}" แล้วครับ`, '#78716C', false);
}

// Sent when a job is edited through JobsTab's edit form without that edit also being a full
// payment completion (that case already gets the "รับเงิน" card via buildJobSavedMessage, reused
// so a payment landing on an existing project reads the same as one landing on a brand-new job).
// Distinguishing "edited" from narrower internal onEditJob calls (marking a follow-up, bumping
// isPosted alone, a partial-deposit button) is the caller's job -- see App.tsx's handleEditJob,
// which only reaches this path when the payload looks like a real edit-form save.
export function buildJobEditedMessage(job: JobCardData, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const statusLabel = isWip ? 'สต็อก (ยังไม่ส่งงาน)' : job.status === 'done' ? 'จ่ายครบแล้ว' : job.status === 'partial' ? 'ได้รับมัดจำแล้ว' : 'ยังไม่ได้รับเงิน';
  const bodyContents = [
    buildTypeBadge('pencil', 'แก้ไขงาน', '#2563EB'),
    buildStatementRow('แก้ไขงาน', formatCurrency(job.value), { size: 'xl', color: '#2563EB' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('ชื่องาน', job.name, { bold: false }),
    ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
    buildStatementRow('สถานะ', statusLabel, { bold: false }),
    ...(!isWip && (job.pending || 0) > 0 ? [buildStatementRow('ยอดค้างรับ', formatCurrency(job.pending || 0), { bold: false, color: '#C17817' })] : []),
    ...(!isWip && monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
  ];
  return buildReceiptCard(bodyContents, `แก้ไขงาน "${job.name}" แล้วครับ`, '#2563EB');
}

// Same idea as buildJobDeletedMessage, for a deleted variable expense.
export function buildExpenseDeletedMessage(expense: { name: string; category?: string; amount: number }, monthNet?: number): LineMessage {
  const bodyContents = [
    buildTypeBadge('trash', 'ลบรายจ่าย', '#78716C'),
    buildStatementRow('ลบรายจ่าย', formatCurrency(expense.amount), { size: 'xl', color: '#78716C' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('รายการ', expense.name, { bold: false }),
    ...(expense.category ? [buildStatementRow('หมวด', expense.category, { bold: false })] : []),
    ...(monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
  ];
  return buildReceiptCard(bodyContents, `ลบรายจ่าย "${expense.name}" แล้วครับ`, '#78716C');
}

export function buildGoalCreatedMessage(goal: { name: string; target: number; deadline?: string }): LineMessage {
  // Purple, not the job-edited card's blue -- goal creation gets its own color so the two never
  // read as the same type of event at a glance.
  const bodyContents = [
    buildTypeBadge('target', 'เป้าหมายใหม่', '#7C3AED'),
    buildStatementRow('เป้าหมายใหม่', goal.name, { size: 'xl', color: '#7C3AED' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('ยอดเป้าหมาย', formatCurrency(goal.target), { bold: false }),
    ...(goal.deadline ? [buildStatementRow('กำหนดเสร็จ', goal.deadline, { bold: false })] : []),
  ];
  return buildReceiptCard(bodyContents, `สร้างเป้าหมายใหม่ "${goal.name}" แล้วครับ`, '#7C3AED');
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
  const headerColor = isDeposit ? '#0E9F6E' : '#A63F1B';
  const bodyContents = [
    isDeposit ? buildTypeBadge('acorn', headerLabel, headerColor) : buildTypeBadge('outbox', headerLabel, headerColor),
    buildStatementRow(headerLabel, `${isDeposit ? '+' : '-'}${formatCurrency(tx.amount)}`, { size: 'xl', color: headerColor }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('เป้าหมาย', goal.name, { bold: false }),
    ...(tx.reason ? [buildStatementRow('เหตุผล', tx.reason, { bold: false })] : []),
    buildStatementRow('ยอดสะสมล่าสุด', `${formatCurrency(goal.current)} / ${formatCurrency(goal.target)}`, { bold: false }),
  ];
  return buildReceiptCard(bodyContents, `${headerLabel} "${goal.name}" ${formatCurrency(tx.amount)} แล้วครับ`, headerColor);
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
    buildTypeBadge('trash', 'ลบรายการ', '#78716C'),
    buildStatementRow('ลบรายการ', formatCurrency(tx.amount), { size: 'xl', color: '#78716C' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('เป้าหมาย', goal.name, { bold: false }),
    buildStatementRow('ประเภทที่ลบ', wasDeposit ? 'ฝากเข้า' : 'ดึงเงินออก', { bold: false }),
    ...(tx.reason ? [buildStatementRow('เหตุผลเดิม', tx.reason, { bold: false })] : []),
    buildStatementRow('ยอดสะสมล่าสุด', `${formatCurrency(goal.current)} / ${formatCurrency(goal.target)}`, { bold: false }),
  ];
  return buildReceiptCard(bodyContents, `ลบรายการ "${goal.name}" ${formatCurrency(tx.amount)} แล้วครับ`, '#78716C');
}

function statusBehavior(statuses: StatusRow[], statusId: string): 'done' | 'partial' | 'pending' {
  return statuses.find((s) => s.id === statusId)?.behavior || 'pending';
}

// Entry point called from api/line-webhook.ts. Returns null when this LINE user isn't linked
// to any app account yet, so the caller can fall back to the link-code flow. Always returns an
// array (LINE's reply API takes one call with up to 5 message bubbles) -- a freeform text reply
// may be split into a few short bubbles by textBubbles, everything else is just one. The Quick
// Reply shortcuts are attached to the last bubble only, so they're always one tap away.
export async function handleAssistantMessage(lineUserId: string, text: string, operationId?: string): Promise<LineMessage[] | null> {
  const result = await handleAssistantMessageInner(lineUserId, text, operationId);
  if (result === null) return null;
  const messages = Array.isArray(result) ? result : [result];
  if (messages.length === 0) return null;
  const lastIndex = messages.length - 1;
  const withQuick = messages.map((m, i) => (i === lastIndex ? { ...m, quickReply: getQuickReply() } : m));
  return withQuick.slice(0, 5); // LINE's reply API accepts at most 5 messages per call
}

async function handleAssistantMessageInner(lineUserId: string, text: string, operationId?: string): Promise<LineMessage | LineMessage[] | null> {
  let user: UserRow | null;
  try {
    user = await findUserByLineId(lineUserId);
  } catch (err) {
    // A real query error, not "this LINE user isn't linked" -- must never fall through to the
    // link-code flow, since that would wrongly tell an already-linked user they aren't linked.
    console.error('handleAssistantMessage: findUserByLineId failed:', err);
    return { type: 'text', text: 'ขอโทษครับ ระบบมีปัญหาชั่วคราวตอนนี้ ลองพิมพ์คำถามใหม่อีกครั้งครับ' };
  }
  if (!user) return null;
  user.operationId = operationId;

  // LINE chat is a Pro-only feature (per PlansTab's feature list) -- once the free trial and any
  // paid period have both lapsed, every message gets this renewal prompt instead of being
  // processed, so the bot never keeps working indefinitely for an expired account.
  if (!(await isProUser(user.user_id))) {
    return buildRenewalMessage(user);
  }

  const trimmed = text.trim();

  if (QUICK_ACTIONS[trimmed]) {
    return QUICK_ACTIONS[trimmed](buildDataSnapshot(user));
  }

  // A draft only counts if it's still within TTL -- an expired one is silently dropped rather
  // than resumed, so a message sent long after an abandoned "add job" attempt is never
  // mysteriously merged into it.
  const storedDraft = user.notif_settings?.pendingJobDraft;
  const pendingDraft = storedDraft && Date.now() - new Date(storedDraft.createdAt).getTime() < PENDING_JOB_DRAFT_TTL_MS
    ? storedDraft.draft
    : undefined;

  const storedExpenseDraft = user.notif_settings?.pendingExpenseDraft;
  const pendingExpenseDraft = storedExpenseDraft && Date.now() - new Date(storedExpenseDraft.createdAt).getTime() < PENDING_JOB_DRAFT_TTL_MS
    ? storedExpenseDraft.draft
    : undefined;

  const existingName = user.notif_settings?.userName?.trim() || undefined;
  const alreadyAskedName = !!user.notif_settings?.nameAskedAt;

  // Same TTL-drop pattern as the job draft above -- a history gap longer than CHAT_HISTORY_TTL_MS
  // means this is effectively a fresh conversation, so stale context never gets dragged in.
  const storedHistoryAt = user.notif_settings?.chatHistoryUpdatedAt;
  const recentHistory = storedHistoryAt && Date.now() - new Date(storedHistoryAt).getTime() < CHAT_HISTORY_TTL_MS
    ? user.notif_settings?.chatHistory
    : undefined;

  // Anything else goes through one combined Claude call -- could be a question, or a natural-
  // language "just add this job/expense" message. classifyMessage returns null whenever Claude
  // is unconfigured or the call fails (including a 429 the retry couldn't clear), so an outage
  // degrades to the same friendly greeting/buttons a brand-new user sees, instead of a raw error.
  const result = await classifyMessage(trimmed, buildDataSnapshot(user), pendingDraft, existingName, recentHistory, pendingExpenseDraft);
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
  if (result.intent === 'add_job' && pendingExpenseDraft) await clearExpenseDraft(user);
  if (result.intent === 'add_expense' && pendingDraft) await clearJobDraft(user);

  if (result.intent === 'add_job') {
    // Merge onto whatever was already captured from an earlier incomplete message -- a field
    // this message provides always overrides the stored one, but a field it doesn't mention
    // keeps its earlier value instead of the whole draft being thrown away and the user having
    // to repeat everything they already said.
    const merged: JobDraft = {
      ...pendingDraft,
      ...(result.jobName !== undefined && { name: result.jobName }),
      ...(result.jobClient !== undefined && { client: result.jobClient }),
      ...(result.jobType !== undefined && { type: result.jobType }),
      ...(result.jobValue !== undefined && { value: result.jobValue }),
      ...(result.jobCreditTerm !== undefined && { creditTerm: result.jobCreditTerm }),
      ...(result.jobPaymentStatus !== undefined && { paymentStatus: result.jobPaymentStatus }),
      ...(result.jobReceivedAmount !== undefined && { receivedAmount: result.jobReceivedAmount }),
      ...(result.jobWhtRate !== undefined && { whtRate: result.jobWhtRate }),
    };

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
      const draft: JobDraft = {
        name: merged.name!,
        client: merged.client,
        type: merged.type,
        value: merged.value!,
        creditTerm: merged.creditTerm || 0,
        paymentStatus: merged.paymentStatus,
        receivedAmount: merged.receivedAmount,
        whtRate: merged.whtRate || 0,
      };
      const job = buildJobFromDraft(draft);
      const ok = await persistJob(user, job);
      if (!ok) {
        return { type: 'text', text: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะครับ' };
      }
      if (pendingDraft) await clearJobDraft(user);
      return buildJobSavedMessage(job, computeMonthNetForUser(user, job));
    }

    // Still missing something -- keep what's been said so far and ask specifically for what's
    // left, instead of discarding it all and making the user retype from scratch.
    await saveJobDraft(user, merged);
    const missingText = missingLabels.join(', ');
    const knownText = [merged.name, merged.value ? formatCurrency(merged.value) : null, merged.client].filter(Boolean).join(' ');
    return finishConversationalReply(
      user,
      trimmed,
      !!knownName,
      alreadyAskedName,
      `จดไว้ให้แล้วนะครับ${knownText ? ` (${knownText})` : ''} ขอข้อมูลเพิ่มอีกนิดนะครับ: ${missingText}`
    );
  }

  if (result.intent === 'add_expense') {
    // Same merge-onto-earlier-draft pattern as add_job above -- a field this message provides
    // always overrides the stored one, but a field it doesn't mention keeps its earlier value.
    const merged: ExpenseDraft = {
      ...pendingExpenseDraft,
      ...(result.expenseName !== undefined && { name: result.expenseName }),
      ...(result.expenseCategory !== undefined && { category: result.expenseCategory }),
      ...(result.expenseAmount !== undefined && { amount: result.expenseAmount }),
    };

    const missingLabels = [!merged.name && 'ชื่อรายการ', !merged.amount && 'จำนวนเงิน'].filter((s): s is string => !!s);

    if (missingLabels.length === 0) {
      const draft: ExpenseDraft = { name: merged.name!, category: merged.category, amount: merged.amount! };
      const expense = buildExpenseFromDraft(draft);
      const ok = await persistExpense(user, expense);
      if (!ok) {
        return { type: 'text', text: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะครับ' };
      }
      if (pendingExpenseDraft) await clearExpenseDraft(user);
      return buildExpenseSavedMessage(expense, computeMonthNetForUser(user, undefined, expense));
    }

    // Still missing something -- keep what's been said so far and ask specifically for what's
    // left, same as the add_job flow, instead of discarding it all and asking from scratch.
    await saveExpenseDraft(user, merged);
    const missingText = missingLabels.join(', ');
    const knownText = [merged.name, merged.amount ? formatCurrency(merged.amount) : null].filter(Boolean).join(' ');
    return finishConversationalReply(
      user,
      trimmed,
      !!knownName,
      alreadyAskedName,
      `จดไว้ให้แล้วนะครับ${knownText ? ` (${knownText})` : ''} ขอข้อมูลเพิ่มอีกนิดนะครับ: ${missingText}`
    );
  }

  // Any intent's `answer` is usable here now, not just "question" -- lets a plain greeting or
  // name introduction (intent "other") get a real in-character reply instead of always falling
  // through to the generic buildHelpText below.
  if (result.answer) {
    return finishConversationalReply(user, trimmed, !!knownName, alreadyAskedName, result.answer);
  }

  return finishConversationalReply(user, trimmed, !!knownName, alreadyAskedName, buildHelpText(knownName));
}
