import { randomBytes, randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from '../repositories/accounts.js';
import { appendTurns, loadConversation, type StoredMessage, type StoredTurn } from './conversations.js';
import { CONTINUE_WINDOW_MS } from './crossChannel.js';
import { assessMessage } from './routingPolicy.js';
import type { AssistantCard, ChatTurn } from './types.js';

// ทำต่อในแอป (owner's plan, item 4: "งานใหญ่ที่สั่งใน LINE ... LINE ตอบสั้น ๆ พร้อมปุ่ม ทำต่อในแอป ที่เปิดแชทในแอปโดยมีบทสนทนา
// เดิมอยู่แล้ว"; asked to finish it on 2026-11-14). When an answer in LINE cannot be complete there (cards LINE had no room
// for, a card too long to confirm in LINE, or work that needs the app such as tax planning and analysis), LINE keeps that
// conversation for two hours in the account's private state and adds the button. Opening it makes one chat in the app's
// history with the same turns and the same cards, so the cards are confirmed there and เลขา reads the conversation as its
// own. Only the account's own words and cards are kept; nothing is spent until the person writes again.

/** The link's id: 16 random bytes, base64url (22 characters). */
export const CONTINUE_ID = /^[A-Za-z0-9_-]{22}$/;
/** The LINE turns carried (four exchanges before this one), as the app's history would send them. */
const MAX_EARLIER = 8;
const MAX_TEXT = 4000;

export type ContinueWhy = 'cards' | 'detail';
export interface StoredContinue { id: string; at: string; why: ContinueWhy; turns: StoredTurn[]; chatId?: string }

/**
 * Why this LINE answer goes on in the app, or null: cards that did not fit or were too long for LINE, or analysis (tax
 * planning, comparisons, money goals: the router's own `analysis`). Never while เลขา is asking something in LINE.
 */
export function continueWhy(input: { text: string; history: ChatTurn[]; asking: boolean; left: number; oversized: boolean }): ContinueWhy | null {
  if (input.asking) return null;
  if (input.left > 0 || input.oversized) return 'cards';
  return assessMessage({ text: input.text, history: input.history }).intent === 'analysis' ? 'detail' : null;
}

// LINE's history marks a waiting card in words for the model ("[การ์ดรอยืนยัน: …]"); the app shows real cards instead.
const withoutCardMarks = (text: string) => text.replace(/\n?\[การ์ดรอยืนยัน:[^\]]*\]/g, '').trim();

/** The turns the app's chat opens with: LINE's earlier ones (text), then this message and เลขา's whole answer with its cards. */
export function continueTurns(history: ChatTurn[], said: string, files: { name: string; mimeType: string }[], reply: { text: string; cards: AssistantCard[] }): StoredTurn[] {
  const earlier = history.slice(-MAX_EARLIER).map(turn => ({ role: turn.role, text: (turn.role === 'assistant' ? withoutCardMarks(turn.text) : turn.text).slice(0, MAX_TEXT) }))
    .filter(turn => turn.text);
  const kind = (mime: string) => (mime.startsWith('image/') ? 'image' as const : mime === 'application/pdf' ? 'pdf' as const : 'text' as const);
  const named = files.map(file => ({ name: file.name.slice(0, 120), kind: kind(file.mimeType) }));
  const attachment = named.length === 1 ? { attachment: named[0] } : named.length ? { attachment: { name: named[0].name, kind: named[0].kind, files: named } } : {};
  return [
    ...earlier,
    { role: 'user', text: said.slice(0, MAX_TEXT), ...attachment },
    { role: 'assistant', text: reply.text.slice(0, MAX_TEXT), ...(reply.cards.length ? { cards: reply.cards } : {}) },
  ];
}

export interface ContinueDeps {
  load(userId: string): Promise<unknown>;
  save(userId: string, value: StoredContinue): Promise<void>;
  append: typeof appendTurns;
  open: typeof loadConversation;
  now(): number;
}

export const continueDeps: ContinueDeps = {
  async load(userId) {
    const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('lineContinue:data->lineContinue').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return (data as { lineContinue?: unknown } | null)?.lineContinue ?? null;
  },
  save: (userId, value) => patchPrivate(userId, { lineContinue: value }),
  append: appendTurns,
  open: loadConversation,
  now: () => Date.now(),
};

/** Keeps this LINE conversation for ทำต่อในแอป (the latest one only) and gives the link's id. */
export async function keepForApp(userId: string, why: ContinueWhy, turns: StoredTurn[], deps: Pick<ContinueDeps, 'save' | 'now'> = continueDeps): Promise<string> {
  const id = randomBytes(16).toString('base64url');
  await deps.save(userId, { id, at: new Date(deps.now()).toISOString(), why, turns });
  return id;
}

const isStored = (value: unknown): value is StoredContinue => {
  const row = value as Partial<StoredContinue> | null;
  return Boolean(row && typeof row.id === 'string' && typeof row.at === 'string' && Array.isArray(row.turns) && (row.why === 'cards' || row.why === 'detail'));
};

/**
 * The app's chat for a ทำต่อในแอป link: made on the first open (the same chat on any later open of the same link), or
 * null when the link is not this account's latest, or older than two hours.
 */
export async function openInApp(userId: string, id: string, deps: ContinueDeps = continueDeps): Promise<{ conversationId: string; title: string; why: ContinueWhy; messages: StoredMessage[] } | null> {
  if (!CONTINUE_ID.test(id)) return null;
  const stored = await deps.load(userId);
  if (!isStored(stored) || stored.id !== id) return null;
  const at = Date.parse(stored.at);
  if (!Number.isFinite(at) || deps.now() - at > CONTINUE_WINDOW_MS) return null;
  const first = stored.turns.find(turn => turn.role === 'user')?.text.replace(/\s+/g, ' ').trim() ?? '';
  const title = `ต่อจาก LINE · ${first || 'แชตใหม่'}`.slice(0, 60);
  let conversationId = stored.chatId;
  if (!conversationId) {
    conversationId = `c_${randomUUID()}`;
    await deps.append(userId, conversationId, stored.turns, { title });
    // A second open (another tap, a reload) opens the same chat instead of making another.
    await deps.save(userId, { ...stored, chatId: conversationId }).catch(() => console.warn('assistant: line continue not marked'));
  }
  const messages = await deps.open(userId, conversationId);
  if (!messages) return null;
  return { conversationId, title, why: stored.why, messages };
}
