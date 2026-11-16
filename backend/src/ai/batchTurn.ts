import type { AskQuestion } from '../../../shared/askQuestions.js';
import { allExpenseCategories } from '../../../shared/expenseCategory.js';
import type { UserRow } from '../services/lineAssistant.js';
import {
  answerQuestions, entryCall, entrySummary, parseEntries, questionsFor, questionsLeft, STOP_WORD,
  type EntryBatch, type EntryKind, type EntryQuestion, type OpenJob, type PreparedEntry,
} from './batchEntries.js';
import type { AssistantCard, ToolCall, ToolOutcome } from './types.js';

// One turn of a paste of many records (batchEntries.ts), the same in the app's chat and in LINE: read the lines, ask what is
// missing (the app's card asks up to five at once; LINE one at a time with taps), then prepare every card with the same tools
// and checks as เลขา's own cards. The batch waits in the account's private state between the questions (two hours).

export const ENTRY_BATCH_KEY = 'entryBatch';
const ACTIVE_MS = 2 * 3600_000;
/** The app's own categories before the account's in allExpenseCategories ("อื่นๆ" is last). */
const EXPENSE_CATEGORIES_COUNT = 7;
const bangkokToday = (now: Date) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** The batch still waiting for answers, or null. */
export function activeEntryBatch(state: unknown, now = new Date()): EntryBatch | null {
  const batch = state as EntryBatch | null | undefined;
  if (!batch || !Array.isArray(batch.entries) || typeof batch.createdAt !== 'string' || !batch.asking?.length) return null;
  return now.getTime() - Date.parse(batch.createdAt) < ACTIVE_MS ? batch : null;
}

/** The account's jobs still waiting for money, for "is this money for a job already here?". */
export function openJobsOf(user: Pick<UserRow, 'jobs'>): OpenJob[] {
  return ((user.jobs || []) as { id?: string; name?: string; client?: string; pending?: number; value?: number; paymentStatus?: string }[])
    .filter(job => job.id && Number(job.pending) > 0 && job.paymentStatus !== 'paid')
    .map(job => ({ id: String(job.id), name: String(job.name || ''), client: job.client ? String(job.client) : '', pending: Number(job.pending), value: Number(job.value) || 0 }));
}

/** Whether this message may start or answer a paste of many records (cheap, before the account is read). */
export function mayBeEntryTurn(text: string, state: unknown, now = new Date()): boolean {
  return Boolean(activeEntryBatch(state, now)) || (text.includes('\n') && Boolean(parseEntries(text, bangkokToday(now), now)));
}

export interface EntryTurn {
  /** The words above the cards or the questions. */
  text: string;
  /** The confirmation cards (each tagged with its line and kind), or the app's question card. */
  cards: AssistantCard[];
  /** The questions asked this turn (LINE shows them with taps). */
  questions: EntryQuestion[];
  /** How many questions are still to come, these included. */
  left: number;
  /** Every line and what became of it, once the cards are made. */
  prepared?: PreparedEntry[];
  batch: EntryBatch;
  /** What to keep for the next answer: the batch while asking, null to clear it. */
  state: EntryBatch | null;
}

/** The app's question card for these questions: taps, a typed answer where it fits, a calendar for days. */
export function entryQuestionCard(batch: EntryBatch, questions: EntryQuestion[]): AssistantCard {
  return { kind: 'questions', id: `entries-${batch.id}`, questions: questions.map((question, at): AskQuestion => ({
    id: `q${at + 1}`, text: question.label, options: question.options,
    allowText: Boolean(question.typed || question.date || question.field === 'kind'),
    ...(question.date ? { calendar: true, placeholder: 'เช่น 14 พ.ย.' } : question.typed ? { placeholder: question.field === 'credit' ? 'เช่น 30' : 'ตัวเลข เช่น 10000' } : {}),
  })) };
}

/**
 * The turn, or null when the message neither starts a paste of many records nor answers the questions waiting (it goes on
 * to เลขา as before; the caller clears a batch that was waiting). `execute` prepares a card with เลขา's own tools.
 */
export async function entryTurn(input: {
  text: string; user: UserRow; now: Date; channel: 'app' | 'line';
  execute: (call: ToolCall) => Promise<ToolOutcome>;
}): Promise<EntryTurn | { cleared: true; text: string } | null> {
  const { text, user, now, channel } = input;
  const today = bangkokToday(now);
  const jobs = openJobsOf(user);
  // The account's own expense categories too (owner, 2026-11-16).
  const categories = allExpenseCategories(user.settings);
  const stored = activeEntryBatch((user.notif_settings as Record<string, unknown> | undefined)?.[ENTRY_BATCH_KEY], now);
  let batch: EntryBatch | null = null;
  // Answers first: the app's card sends several answers on several lines, which must never be read as a new paste.
  if (stored) {
    if (text.trim() === STOP_WORD || /^(?:ยกเลิก|หยุด)(?:ทั้งหมด)?$/.test(text.trim())) {
      return { cleared: true, text: 'ยกเลิกรายการที่วางมาแล้วครับ ยังไม่ได้บันทึกอะไร' };
    }
    // The questions as they were asked, made again from the batch (the same lines and details).
    const asked = questionsFor({ ...stored, asking: null }, jobs, stored.asking!.length, categories)
      .filter(question => stored.asking!.some(item => item.field === question.field && item.lines.join() === question.lines.join()));
    const answered = answerQuestions(stored, asked, text, jobs, categories);
    if (answered) batch = { ...answered, asking: null };
  }
  const fresh = !batch && text.includes('\n');
  if (fresh) {
    batch = parseEntries(text, today, now);
    // An expense named like one of the account's own categories goes there without asking ("ค่าฟิตเนส" → "ฟิตเนส").
    const own = categories.slice(EXPENSE_CATEGORIES_COUNT, -1);
    for (const entry of batch?.entries ?? []) {
      if (entry.kind !== 'expense' || entry.category) continue;
      const name = entry.name.replace(/^ค่า/, '');
      const match = own.find(item => name.includes(item.replace(/^ค่า/, '')) || item.replace(/^ค่า/, '').includes(name));
      if (match && name.length >= 2) entry.category = match;
    }
  }
  if (!batch) return null;
  const questions = questionsFor(batch, jobs, channel === 'app' ? 5 : 1, categories);
  if (questions.length) {
    const left = questionsLeft(batch, jobs);
    const state = { ...batch, asking: questions.map(question => ({ field: question.field, lines: question.lines })) };
    const count = batch.entries.length;
    const lead = channel === 'app'
      ? fresh ? `อ่านได้ ${count} รายการครับ ก่อนเตรียมการ์ดขอถาม ${left} ข้อ${left > questions.length ? ` (รอบนี้ ${questions.length} ข้อ)` : ''} ตอบแล้วกดส่งได้เลย` : `ได้ครับ ขอถามอีก ${left} ข้อ`
      : fresh ? `อ่านได้ ${count} รายการครับ ขอถาม ${left} ข้อก่อนเตรียมการ์ด` : '';
    return { text: lead,
      cards: channel === 'app' ? [entryQuestionCard(batch, questions)] : [], questions, left, batch, state };
  }
  // Every line complete: a card for each, prepared by เลขา's own tools with every usual check.
  const prepared: PreparedEntry[] = [];
  const cards: AssistantCard[] = [];
  for (const entry of batch.entries) {
    const call = entry.skip ? null : entryCall(entry, jobs);
    if (!call) { prepared.push({ entry, proposalId: null, problem: entry.skip ? null : 'ข้อมูลไม่ครบ' }); continue; }
    try {
      const outcome = await input.execute({ id: `entry-${batch.id}-${entry.line}`, name: call.name, args: call.args });
      if (outcome.card?.kind === 'confirm') {
        cards.push({ ...outcome.card, entry: { line: entry.line, kind: entry.kind as EntryKind } });
        prepared.push({ entry, proposalId: outcome.card.id, problem: null });
      } else {
        const result = outcome.result as { error?: string; missing?: string[] } | null;
        prepared.push({ entry, proposalId: null, problem: result?.error || (result?.missing?.length ? `ยังขาด ${result.missing.join(', ')}` : 'ตรวจข้อมูลไม่ผ่าน') });
      }
    } catch {
      prepared.push({ entry, proposalId: null, problem: 'เตรียมการ์ดไม่สำเร็จ ลองส่งใหม่อีกครั้ง' });
    }
  }
  return { text: entrySummary(batch, prepared), cards, questions: [], left: 0, prepared, batch, state: null };
}
