import type { LineMessage } from './line.js';
import { adminRecipients, retryKey, type DeliveryDeps } from './adminProfitReportRun.js';
import { microUsd } from './adminProfitReport.js';
import type { AiCreditSnapshot, CreditProvider, CreditStatus } from '../../../shared/aiCredit.js';
import type { getSupabaseAdmin } from '../config/supabase.js';

// AI credit and reserve (owner, 2026-10-25: "แจ้งเตือนกูด้วยว่าถ้าโทเค็น AI ตัวไหนกำลังจะหมดแล้วให้กูเติม ... ต้องมีเงิน
// สำรองประมาณนี้ ... ไม่ใช่ว่าหมดแล้วค่อยเติม แล้วคนใช้อาจจะงง"). Neither provider lets the app read the credit left, so:
// - the owner records the balance their console shows; the app takes off what it measured since then;
// - the pace of the last 7 days (or today's, when higher) gives the days left and the reserve for 30 days;
// - a provider that answers "out of credit" or "over quota" is an alert at once, whatever was recorded.
// Money: millionths of a dollar (integers). Nothing here changes prices, quotas or what users are charged.

type Db = ReturnType<typeof getSupabaseAdmin>;
export const PROVIDERS: CreditProvider[] = ['anthropic', 'google'];
const DAY_MS = 86_400_000;
/** 30% on top of the recent pace, for a busier month. */
export const RESERVE_BUFFER = 1.3;
export const WATCH_DAYS = 14;
export const LOW_DAYS = 7;

export interface CreditRow { provider: CreditProvider; balance_usd: string | number; recorded_at: string; note: string | null }
export interface SpendRow { provider: string; day: string; usd: string | number; requests: number | string }
export interface IssueRow { issue: string; times: number | string; last_at: string }
export type BillingIssue = 'anthropic_credit' | 'gemini_billing' | 'gemini_quota';
export const issueProvider = (issue: string): CreditProvider | null => issue.startsWith('anthropic') ? 'anthropic' : issue.startsWith('gemini') ? 'google' : null;

const bangkokDay = (at: Date) => new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** One provider's position from its latest recorded balance, its spend since then and its recent daily spend. */
export function creditStatus(input: {
  provider: CreditProvider; now: Date; record: CreditRow | null; spentSinceMicro: number | null;
  days: { day: string; usdMicro: number; requests: number }[]; issues: IssueRow[];
}): CreditStatus {
  const today = bangkokDay(input.now);
  const byDay = new Map(input.days.map(row => [row.day, row]));
  const lastDays = Array.from({ length: 7 }, (_, index) => addDays(today, -(index + 1)));
  const first = input.days.map(row => row.day).sort()[0];
  const counted = first ? lastDays.filter(day => day >= first) : [];
  const avg7 = counted.length ? Math.round(counted.reduce((sum, day) => sum + (byDay.get(day)?.usdMicro ?? 0), 0) / counted.length) : 0;
  const todayMicro = byDay.get(today)?.usdMicro ?? 0;
  const dailyMicro = Math.max(avg7, todayMicro);
  const since = (n: number) => input.days.filter(row => row.day > addDays(today, -n));
  const spend7Micro = since(7).reduce((sum, row) => sum + row.usdMicro, 0);
  const spend30Micro = since(30).reduce((sum, row) => sum + row.usdMicro, 0);
  const requests30 = since(30).reduce((sum, row) => sum + row.requests, 0);
  const recorded = input.record ? { balanceMicro: microUsd(input.record.balance_usd), at: input.record.recorded_at, note: input.record.note } : null;
  const remainingMicro = recorded && input.spentSinceMicro !== null ? recorded.balanceMicro - input.spentSinceMicro : null;
  const runwayDays = remainingMicro === null || dailyMicro <= 0 ? null : Math.max(0, Math.floor(remainingMicro / dailyMicro));
  const reserve30Micro = Math.ceil(dailyMicro * 30 * RESERVE_BUFFER);
  const issues = input.issues.filter(row => issueProvider(row.issue) === input.provider);
  const issues24h = issues.reduce((sum, row) => sum + Number(row.times || 0), 0);
  const status: CreditStatus['status'] = issues24h > 0 || (remainingMicro !== null && remainingMicro <= 0) ? 'out'
    : remainingMicro === null ? 'unknown'
    : runwayDays !== null && runwayDays < LOW_DAYS ? 'low'
    : runwayDays !== null && runwayDays < WATCH_DAYS ? 'watch' : 'ok';
  return {
    provider: input.provider, recorded, spentSinceMicro: input.spentSinceMicro, remainingMicro, dailyMicro, todayMicro, spend7Micro, spend30Micro, requests30,
    runwayDays, runOutOn: runwayDays === null ? null : addDays(today, runwayDays), reserve30Micro,
    topUpMicro: remainingMicro === null ? null : Math.max(0, reserve30Micro - Math.max(0, remainingMicro)),
    status, issues: issues.map(row => ({ issue: row.issue, times: Number(row.times || 0), lastAt: row.last_at })),
  };
}

// ---------- reading ----------
async function spend(db: Db, from: Date, to: Date): Promise<SpendRow[]> {
  const result = await db.rpc('cashflow_admin_ai_provider_spend', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (result.error) throw new Error(result.error.code === 'PGRST202' ? 'sql_not_run' : 'spend_unavailable');
  return (result.data ?? []) as SpendRow[];
}

/** Everything the admin page and the 08:00 check need, read on request. */
export async function loadCreditSnapshot(db: Db, now: Date, extra: { rate4: number | null; dailyCapUsd: number; payingMembers: number | null; proTokens: number; tokenUsd: number }): Promise<AiCreditSnapshot> {
  const [records, recent, issuesRead] = await Promise.all([
    db.from('cashflow_admin_ai_credit').select('provider,balance_usd,recorded_at,note').order('recorded_at', { ascending: false }).limit(50),
    spend(db, new Date(now.getTime() - 31 * DAY_MS), now),
    db.rpc('cashflow_admin_ai_billing_issues', { p_since: new Date(now.getTime() - DAY_MS).toISOString() }),
  ]);
  if (records.error) throw new Error(records.error.code === '42P01' || records.error.code === 'PGRST205' ? 'sql_not_run' : 'credit_unavailable');
  const latest = new Map<CreditProvider, CreditRow>();
  for (const row of (records.data ?? []) as CreditRow[]) if (!latest.has(row.provider)) latest.set(row.provider, row);
  const issues = issuesRead.error ? [] : (issuesRead.data ?? []) as IssueRow[];
  const providers: CreditStatus[] = [];
  for (const provider of PROVIDERS) {
    const record = latest.get(provider) ?? null;
    let spentSinceMicro: number | null = null;
    if (record) {
      const rows = await spend(db, new Date(record.recorded_at), now);
      spentSinceMicro = rows.filter(row => row.provider === provider).reduce((sum, row) => sum + microUsd(row.usd), 0);
    }
    const days = recent.filter(row => row.provider === provider).map(row => ({ day: String(row.day).slice(0, 10), usdMicro: microUsd(row.usd), requests: Number(row.requests || 0) }));
    providers.push(creditStatus({ provider, now, record, spentSinceMicro, days, issues }));
  }
  const worstMonthlyMicro = extra.payingMembers === null ? null : Math.round(extra.payingMembers * extra.proTokens * extra.tokenUsd * 1_000_000);
  return { generatedAt: now.toISOString(), rate4: extra.rate4, dailyCapUsd: extra.dailyCapUsd, providers,
    ceiling: { payingMembers: extra.payingMembers, worstMonthlyMicro, capMonthlyMicro: Math.round(extra.dailyCapUsd * 30 * 1_000_000) },
    issuesRead: !issuesRead.error };
}

// ---------- alerts ----------
const NAME: Record<CreditProvider, string> = { anthropic: 'Claude (Anthropic)', google: 'Gemini (Google)' };
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;
const thb = (micro: number, rate4: number | null) => rate4 === null ? '' : ` (฿${Math.round((micro / 1_000_000) * (rate4 / 10_000)).toLocaleString('en-US')})`;
const thaiDate = (day: string) => {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${months[m - 1]} ${y + 543}`;
};
const WHERE: Record<CreditProvider, string> = { anthropic: 'console.anthropic.com', google: 'Google AI Studio หรือ Google Cloud Billing' };

/** The owner's LINE message for a provider that answered with a billing problem (sent once a day per problem). */
export function issueAlertText(issue: BillingIssue): string {
  const head = 'แจ้งเตือนเครดิต AI';
  if (issue === 'anthropic_credit') return `${head}\nClaude (Anthropic) แจ้งว่าเครดิตไม่พอแล้ว งานเอกสาร งานลบ และงานแก้ไขสำคัญจะหยุดชั่วคราว คำถามทั่วไปยังตอบด้วย Gemini ได้\nเติมเครดิตได้ที่ ${WHERE.anthropic} แล้วบันทึกยอดใหม่ในหน้าแอดมิน แท็บ “กำไรและต้นทุน AI”`;
  if (issue === 'gemini_billing') return `${head}\nGemini (Google) แจ้งว่าการเรียกเก็บเงินมีปัญหา เลขาอาจตอบลูกค้าไม่ได้\nตรวจบัตรหรือเครดิตได้ที่ ${WHERE.google}`;
  return `${head}\nGemini (Google) แจ้งว่าใช้เกินโควตาของบัญชีแล้ว เลขาอาจตอบลูกค้าไม่ได้ชั่วคราว\nตรวจโควตาหรือเพิ่มระดับบัญชีได้ที่ ${WHERE.google}`;
}

/** The 08:00 message for a provider running low, or null when there is nothing to say. */
export function lowAlertText(status: CreditStatus, rate4: number | null): string | null {
  if (status.status !== 'low' && status.status !== 'out') return null;
  if (status.remainingMicro === null) return null; // an "out" from a billing answer is sent by issueAlertText
  const name = NAME[status.provider];
  const left = status.remainingMicro <= 0
    ? `${name} เครดิตน่าจะหมดแล้ว (ใช้ไปเกินยอดที่บันทึกไว้ ${usd(-status.remainingMicro)})`
    : `${name} เหลือประมาณ ${usd(status.remainingMicro)}${thb(status.remainingMicro, rate4)} ใช้ได้อีกราว ${status.runwayDays} วัน${status.runOutOn ? ` (ถึงประมาณ ${thaiDate(status.runOutOn)})` : ''}`;
  const top = status.topUpMicro ? `\nควรเติมอย่างน้อย ${usd(status.topUpMicro)}${thb(status.topUpMicro, rate4)} เพื่อให้พอใช้ 30 วัน` : '';
  return `แจ้งเตือนเครดิต AI\n${left}${top}\nเติมได้ที่ ${WHERE[status.provider]} แล้วบันทึกยอดใหม่ในหน้าแอดมิน`;
}

/** Sends each alert to the system admins who linked LINE, once per key (a Bangkok day goes into every key). */
export async function sendCreditAlerts(alerts: { key: string; text: string }[], deps: DeliveryDeps): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 };
  if (!alerts.length) return result;
  const recipients = await adminRecipients(deps);
  for (const alert of alerts) {
    if (!recipients.length || !(await deps.claim(alert.key))) { result.skipped++; continue; }
    const message: LineMessage = { type: 'text', text: alert.text.slice(0, 4900) };
    const outcomes = await Promise.all(recipients.map(recipient => deps.push(recipient.lineUserId, message, retryKey(alert.key, recipient.userId)).catch(() => 'failed' as const)));
    if (outcomes.some(outcome => outcome === 'accepted')) result.sent++; else result.failed++;
  }
  return result;
}

/** The keys and texts for a billing answer seen now (the request path calls this; at most one message a day each). */
export function issueAlerts(issues: BillingIssue[], now: Date): { key: string; text: string }[] {
  const day = bangkokDay(now);
  return [...new Set(issues)].map(issue => ({ key: `ai-billing:${issue}:${day}`, text: issueAlertText(issue) }));
}
export function lowAlerts(snapshot: AiCreditSnapshot, now: Date): { key: string; text: string }[] {
  const day = bangkokDay(now);
  return snapshot.providers.flatMap(status => {
    const text = lowAlertText(status, snapshot.rate4);
    return text ? [{ key: `ai-credit:${status.provider}:${status.status}:${day}`, text }] : [];
  });
}
