import { z } from 'zod';

// A message from the team to everyone (owner, 2026-11-03: "พิมพ์ไปหา user ทุกคนได้ ... ขึ้นหน้าจอในเว็บเขา ... ให้เขาตอบกลับเราได้
// ด้วย เพราะกูต้องการฟีดแบ็ก"). The owner writes it on the admin page; every account that existed when it was sent sees it
// once, the next time it opens the app, and can answer with a score from 1 to 5 and a few words. A written answer becomes a
// แจ้งปัญหา conversation from that account, so the team can answer it there. Nothing new in the database: the message
// lives in the sender's private state (`broadcasts`), each account's answer in its own (`broadcastAnswers`).

export const BROADCAST_MAX = 600;
export const BROADCAST_REPLY_MAX = 1000;
/** A message is shown for this many days unless the owner stops it sooner. */
export const BROADCAST_DAYS = 30;
const KEEP_SENT = 20;
const KEEP_ANSWERS = 20;

export interface Broadcast { id: string; body: string; askRating: boolean; createdAt: string; endedAt: string | null }
export interface BroadcastAnswer {
  status: 'seen' | 'dismissed' | 'answered';
  at: string;
  rating?: number;
  reply?: string;
  /** The แจ้งปัญหา conversation a written answer started. */
  threadId?: string;
}
/** What an account is shown. */
export type BroadcastNotice = Pick<Broadcast, 'id' | 'body' | 'askRating' | 'createdAt'>;

const text = (max: number) => z.string().max(max * 2).transform(value => value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()).pipe(z.string().max(max));
export const broadcastUserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seen'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('dismiss'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('answer'), id: z.uuid(), reply: text(BROADCAST_REPLY_MAX).default(''), rating: z.number().int().min(1).max(5).optional() }).strict()
    .refine(value => value.reply.length > 0 || value.rating !== undefined, { message: 'empty_answer' }),
]);
export const broadcastAdminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), body: text(BROADCAST_MAX).pipe(z.string().min(1)), askRating: z.boolean().default(true) }).strict(),
  z.object({ action: z.literal('end'), id: z.uuid() }).strict(),
]);
export type BroadcastUserAction = z.infer<typeof broadcastUserActionSchema>;

const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function readBroadcasts(raw: unknown): Broadcast[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(item => {
    const value = item as Partial<Broadcast> | null;
    return value && typeof value.id === 'string' && typeof value.body === 'string' && value.body && isDate(value.createdAt)
      ? [{ id: value.id, body: value.body, askRating: value.askRating !== false, createdAt: value.createdAt, endedAt: isDate(value.endedAt) ? value.endedAt : null }]
      : [];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readAnswers(raw: unknown): Record<string, BroadcastAnswer> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const answers: Record<string, BroadcastAnswer> = {};
  for (const [id, item] of Object.entries(raw as Record<string, unknown>)) {
    const value = item as Partial<BroadcastAnswer> | null;
    if (!value || !['seen', 'dismissed', 'answered'].includes(String(value.status)) || !isDate(value.at)) continue;
    answers[id] = {
      status: value.status as BroadcastAnswer['status'], at: value.at,
      ...(Number.isInteger(value.rating) && value.rating! >= 1 && value.rating! <= 5 ? { rating: value.rating } : {}),
      ...(typeof value.reply === 'string' && value.reply ? { reply: value.reply.slice(0, BROADCAST_REPLY_MAX) } : {}),
      ...(typeof value.threadId === 'string' ? { threadId: value.threadId } : {}),
    };
  }
  return answers;
}

/** The message on show: the newest one not stopped and younger than BROADCAST_DAYS. */
export function activeBroadcast(list: Broadcast[], now = new Date()): Broadcast | null {
  const newest = list[0];
  if (!newest || newest.endedAt) return null;
  return now.getTime() - Date.parse(newest.createdAt) <= BROADCAST_DAYS * 86_400_000 ? newest : null;
}

/** What one account sees: the message on show, if the account existed when it was sent and has not answered or closed it. */
export function broadcastFor(list: Broadcast[], account: { createdAt: string | null | undefined }, answers: Record<string, BroadcastAnswer>, now = new Date()): BroadcastNotice | null {
  const active = activeBroadcast(list, now);
  if (!active) return null;
  if (!account.createdAt || Date.parse(account.createdAt) >= Date.parse(active.createdAt)) return null;
  const answer = answers[active.id];
  if (answer && answer.status !== 'seen') return null;
  return { id: active.id, body: active.body, askRating: active.askRating, createdAt: active.createdAt };
}

/** The sender's list after a new message: the one on show stops, the new one goes first. */
export function withNewBroadcast(list: Broadcast[], next: Omit<Broadcast, 'endedAt'>): Broadcast[] {
  return [{ ...next, endedAt: null }, ...list.map(item => (item.endedAt ? item : { ...item, endedAt: next.createdAt }))].slice(0, KEEP_SENT);
}

export function withEndedBroadcast(list: Broadcast[], id: string, at: string): Broadcast[] {
  return list.map(item => (item.id === id && !item.endedAt ? { ...item, endedAt: at } : item));
}

/** An account's answers after one more; "seen" never replaces an answer or a close, and only the latest few are kept. */
export function withAnswer(answers: Record<string, BroadcastAnswer>, id: string, answer: BroadcastAnswer): Record<string, BroadcastAnswer> {
  if (answer.status === 'seen' && answers[id]) return answers;
  const next = { ...answers, [id]: answer };
  return Object.fromEntries(Object.entries(next).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, KEEP_ANSWERS));
}

/** The แจ้งปัญหา message a written answer starts: what it answers, the score, then the words. */
export function broadcastReplyBody(broadcast: Pick<Broadcast, 'body'>, reply: string, rating?: number): string {
  const said = broadcast.body.replace(/\s+/g, ' ').trim();
  const quote = said.length > 80 ? `${said.slice(0, 80)}…` : said;
  return [`ตอบข้อความจากทีมงาน: “${quote}”`, ...(rating ? [`ให้คะแนนแอป ${rating} จาก 5`] : []), '', reply].join('\n').trim();
}

export interface BroadcastReply { userId: string; name: string; publicId: string; rating: number | null; reply: string | null; at: string; threadId: string | null }
export interface BroadcastResult extends Broadcast {
  /** Accounts that existed when it was sent (admins not counted). */
  audience: number;
  seen: number;
  answered: number;
  dismissed: number;
  /** How many gave each score, 1 to 5. */
  ratings: [number, number, number, number, number];
  average: number | null;
  replies: BroadcastReply[];
}
export interface AdminBroadcastResponse { results: BroadcastResult[] }

export function broadcastResult(broadcast: Broadcast, accounts: { userId: string; name: string; publicId: string; createdAt: string; admin: boolean }[],
  answersBy: Map<string, Record<string, BroadcastAnswer>>): BroadcastResult {
  const audience = accounts.filter(account => !account.admin && Date.parse(account.createdAt) < Date.parse(broadcast.createdAt));
  const ratings: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let seen = 0; let answered = 0; let dismissed = 0;
  const replies: BroadcastReply[] = [];
  for (const account of audience) {
    const answer = answersBy.get(account.userId)?.[broadcast.id];
    if (!answer) continue;
    seen += 1;
    if (answer.status === 'dismissed') dismissed += 1;
    if (answer.status !== 'answered') continue;
    answered += 1;
    if (answer.rating) ratings[answer.rating - 1] += 1;
    replies.push({ userId: account.userId, name: account.name, publicId: account.publicId, rating: answer.rating ?? null, reply: answer.reply ?? null, at: answer.at, threadId: answer.threadId ?? null });
  }
  const scored = ratings.reduce((sum, count) => sum + count, 0);
  return {
    ...broadcast, audience: audience.length, seen, answered, dismissed, ratings,
    average: scored ? Math.round((ratings.reduce((sum, count, index) => sum + count * (index + 1), 0) / scored) * 10) / 10 : null,
    replies: replies.sort((a, b) => b.at.localeCompare(a.at)),
  };
}
