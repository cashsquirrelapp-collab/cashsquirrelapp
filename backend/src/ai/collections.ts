import { statusBehavior, type UserRow } from '../services/lineAssistant.js';
import { todayInBangkok } from '../../../shared/dueJobs.js';

// Help with getting paid (owner, 2026-11-02: "ช่วยทวงเงิน"). Two things, both worked out from the account's own saved
// data with plain rules, no model:
// - how each client stands: what they owe, how much of it is late, by how many days, how often it was followed up;
// - a polite message asking a client to pay, ready to copy and send (เลขา never sends it). The words come from fixed
//   templates chosen by how late the money is, so the amounts and dates are exactly the saved ones and the tone is
//   always courteous. The account's own bank details go into the message, never through the model.
// How late a client paid in the past cannot be told: a payment overwrites the job's due date with the day the money came.

const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** "15 พ.ย. 2569" */
export const thaiDay = (day: string) => { const [y, m, d] = day.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y + 543}`; };
const money = (amount: number) => Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const clientKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

export interface OwedJob { id: string; name: string; client: string; amount: number; due: string | null; daysLate: number | null; followUps: number; lastFollowUp: string | null }
export interface ClientStanding {
  client: string; owed: number; late: number; lateJobs: number; maxDaysLate: number; jobs: number; followUps: number; lastFollowUp: string | null;
}

/** Every job with money still to come (the app's own unpaid rule), with how many days it is past its due date. */
export function owedJobs(user: UserRow, now = new Date()): OwedJob[] {
  const today = todayInBangkok(now);
  const statuses = user.statuses || [];
  return (user.jobs || []).filter(job => (job.pending || 0) > 0 && statusBehavior(statuses, job.status || '') !== 'done').map(job => {
    const due = isDay(job.dueDate) ? job.dueDate : isDay(job.payDate) ? job.payDate : null;
    const row = job as typeof job & { followUpCount?: number; lastFollowUpDate?: string };
    return { id: String(job.id), name: job.name || 'งาน', client: (job.client || '').trim(), amount: Math.round((job.pending || 0) * 100) / 100, due,
      daysLate: due ? daysBetween(due, today) : null, followUps: Math.max(0, Number(row.followUpCount) || 0), lastFollowUp: isDay(row.lastFollowUpDate) ? row.lastFollowUpDate : null };
  });
}

/** How each client stands now, the latest first: what is owed, how much of it is late and for how long. */
export function clientStandings(user: UserRow, now = new Date()): ClientStanding[] {
  const map = new Map<string, ClientStanding>();
  for (const job of owedJobs(user, now)) {
    const key = clientKey(job.client) || '(ไม่ระบุลูกค้า)';
    const row = map.get(key) ?? { client: job.client || 'ไม่ระบุลูกค้า', owed: 0, late: 0, lateJobs: 0, maxDaysLate: 0, jobs: 0, followUps: 0, lastFollowUp: null };
    row.owed += job.amount; row.jobs += 1; row.followUps += job.followUps;
    if (job.daysLate !== null && job.daysLate > 0) { row.late += job.amount; row.lateJobs += 1; row.maxDaysLate = Math.max(row.maxDaysLate, job.daysLate); }
    if (job.lastFollowUp && (!row.lastFollowUp || job.lastFollowUp > row.lastFollowUp)) row.lastFollowUp = job.lastFollowUp;
    map.set(key, row);
  }
  return [...map.values()].map(row => ({ ...row, owed: Math.round(row.owed * 100) / 100, late: Math.round(row.late * 100) / 100 }))
    .sort((a, b) => b.maxDaysLate - a.maxDaysLate || b.late - a.late || b.owed - a.owed);
}

export type Particle = 'ครับ' | 'ค่ะ';
export interface CollectionDraft { client: string; jobs: OwedJob[]; total: number; maxDaysLate: number; tone: 'ahead' | 'late' | 'long_late'; text: string; bank: boolean }

/** The account's bank details for the message, from its saved issuer profile; null when not saved. */
function bankLine(user: UserRow): string | null {
  const row = ((user as UserRow & { issuer_profile?: Record<string, unknown> }).issuer_profile ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string).replace(/\s+/g, ' ').trim().slice(0, 80) : '');
  const account = text('bankAccount');
  if (!account) return null;
  return ['ช่องทางชำระ:', text('bankName'), account, text('bankAccountName') ? `ชื่อบัญชี ${text('bankAccountName')}` : ''].filter(Boolean).join(' ');
}
function signature(user: UserRow): string {
  const row = ((user as UserRow & { issuer_profile?: Record<string, unknown> }).issuer_profile ?? {}) as Record<string, unknown>;
  return typeof row.name === 'string' ? row.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

/**
 * A message asking one client to pay, for the jobs they owe that are late or due within 7 days (all their unpaid jobs
 * with a due date when only those are left), or for one job. Null when nothing fits.
 */
export function collectionDraft(user: UserRow, options: { client?: string; jobId?: string; particle?: Particle; now?: Date }): CollectionDraft | null {
  const owed = owedJobs(user, options.now);
  let jobs: OwedJob[];
  if (options.jobId) {
    jobs = owed.filter(job => job.id === options.jobId);
  } else {
    const wanted = clientKey(options.client || '');
    const ofClient = wanted ? owed.filter(job => clientKey(job.client) === wanted || (wanted.length >= 2 && clientKey(job.client).includes(wanted))) : owed;
    if (!ofClient.length) return null;
    // Without a client named: the client whose money is latest.
    const client = wanted ? clientKey(ofClient[0].client) : clientKey([...ofClient].sort((a, b) => (b.daysLate ?? -999) - (a.daysLate ?? -999) || b.amount - a.amount)[0].client);
    const theirs = owed.filter(job => clientKey(job.client) === client);
    const pressing = theirs.filter(job => job.daysLate !== null && job.daysLate >= -7);
    jobs = pressing.length ? pressing : theirs.filter(job => job.due);
    if (!jobs.length) jobs = theirs;
  }
  if (!jobs.length) return null;
  jobs = [...jobs].sort((a, b) => (b.daysLate ?? -999) - (a.daysLate ?? -999)).slice(0, 6);
  const p = options.particle ?? 'ครับ';
  const q = p === 'ค่ะ' ? 'คะ' : 'ครับ';
  const client = jobs[0].client;
  const total = Math.round(jobs.reduce((sum, job) => sum + job.amount, 0) * 100) / 100;
  const maxDaysLate = Math.max(...jobs.map(job => job.daysLate ?? -999));
  const tone: CollectionDraft['tone'] = maxDaysLate > 14 ? 'long_late' : maxDaysLate > 0 ? 'late' : 'ahead';
  const name = client ? `คุณ${client.replace(/^คุณ\s*/, '')}` : '';
  const one = jobs.length === 1 ? jobs[0] : null;
  const what = one
    ? `ค่าบริการงาน "${one.name}" ยอด ${money(one.amount)} บาท`
    : `ค่าบริการ ${jobs.length} รายการ รวม ${money(total)} บาท`;
  const lines = one ? [] : jobs.map(job => `• ${job.name} ${money(job.amount)} บาท${job.due ? ` (ครบกำหนด ${thaiDay(job.due)})` : ''}`);
  const dueWords = one?.due
    ? (one.daysLate! > 0 ? `ซึ่งครบกำหนดชำระเมื่อวันที่ ${thaiDay(one.due)}` : `ซึ่งจะครบกำหนดชำระวันที่ ${thaiDay(one.due)}`)
    : '';
  const today = todayInBangkok(options.now);
  const askBy = thaiDay(new Date(Date.parse(`${today}T00:00:00Z`) + 3 * dayMs).toISOString().slice(0, 10));
  const body: string[] = [];
  if (tone === 'ahead') {
    body.push(`สวัสดี${p}${name ? ` ${name}` : ''} ขออนุญาตแจ้งเตือนล่วงหน้าเรื่อง${what}${dueWords ? ` ${dueWords}` : ''}`);
    if (lines.length) body.push(...lines);
    body.push(`ส่งมาเพื่อความสะดวกในการเตรียมชำระ${p} หากชำระเรียบร้อยแล้ว ขออภัยและขอบคุณมาก${p}`);
  } else if (tone === 'late') {
    body.push(`สวัสดี${p}${name ? ` ${name}` : ''} ขออนุญาตติดตาม${what}${dueWords ? ` ${dueWords}` : ''}${one ? ` (เลยกำหนดมา ${one.daysLate} วัน)` : ''}`);
    if (lines.length) body.push(...lines);
    body.push(`รบกวนช่วยตรวจสอบให้ด้วยนะ${q} หากชำระแล้ว รบกวนส่งหลักฐานการโอนให้ด้วย ขอบคุณมาก${p}`);
  } else {
    body.push(`สวัสดี${p}${name ? ` ${name}` : ''} ขออนุญาตติดตาม${what}${dueWords ? ` ${dueWords}` : ''} ขณะนี้เลยกำหนดมา ${maxDaysLate} วันแล้ว`);
    if (lines.length) body.push(...lines);
    body.push(`รบกวนแจ้งวันที่สะดวกชำระภายในวันที่ ${askBy} ได้ไหม${q} หากติดขัดเรื่องใด แจ้งได้เลย ยินดีหาทางที่สะดวกร่วมกัน${p}`);
    body.push(`หากชำระแล้ว รบกวนส่งหลักฐานการโอนให้ด้วย ขอบคุณมาก${p}`);
  }
  const bank = bankLine(user);
  if (bank) body.push(bank);
  const sign = signature(user);
  if (sign) body.push(sign);
  return { client: client || 'ลูกค้า', jobs, total, maxDaysLate, tone, text: body.join('\n'), bank: Boolean(bank) };
}
