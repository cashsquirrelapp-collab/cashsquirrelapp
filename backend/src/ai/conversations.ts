import { getSupabaseAdmin } from '../config/supabase.js';
import type { AssistantCard } from './types.js';
import type { LineCardData } from '../../../shared/lineInbox.js';

// เลขากระรอก chat history per account (owner, 2026-10-24: "ทำให้บันทึกประวัติการคุยได้ สำหรับผู้ใช้นั้นๆ").
// Every read and write is scoped to the signed-in user id from the session; a conversation id alone never opens a
// chat. Pictures and files are not stored, only their name and kind. Needs
// supabase/migrations/20261024150000_ai_conversations.sql; before it runs, chats work as before and are not kept.

export const CONVERSATION_ID = /^c_[0-9a-f-]{36}$/;
/** A chat the browser starts: crypto.randomUUID (v4). The notifications thread's id is made here, never sent. */
export const BROWSER_CONVERSATION_ID = /^c_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_CONVERSATIONS = 200;
// Each chat keeps its latest 400 messages, all the app shows (owner, 2026-10-24: tidy up quietly, never
// stop anyone chatting because space is full).
export const MAX_MESSAGES = 400;
/** The notifications thread loads with the chat every time, so it keeps less. */
export const INBOX_MESSAGES = 200;

/**
 * The "แจ้งเตือนอัตโนมัติ" thread's own history: one per account, its id made from the account id in the shape of
 * a v5 uuid. A browser can only start v4 chats, so no one can take another account's thread id first.
 */
export async function inboxConversationId(userId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`krarok-line-thread:${userId}`)));
  const hex = [...digest.slice(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const variant = (8 | (parseInt(hex[16], 16) & 3)).toString(16);
  return `c_${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** `memo`: what an attached file showed (note_from_file), hidden on screen and sent with later messages. */
export type StoredCard = AssistantCard | { kind: 'line'; card: LineCardData } | { kind: 'memo'; text: string };
export interface StoredTurn { role: 'user' | 'assistant'; text: string; cards?: StoredCard[]; attachment?: { name: string; kind: 'image' | 'pdf' } }
export interface ConversationSummary { id: string; title: string; pinned: boolean; archived: boolean; createdAt: string; updatedAt: string }
export interface StoredMessage extends StoredTurn { id: string; at: string }

const admin = () => getSupabaseAdmin();
const fail = (error: { message?: string } | null) => { if (error) throw new Error(`conversation store: ${error.message || 'failed'}`); };

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  // The notifications thread has its own place at the top of the list, so its history is left out here.
  const { data, error } = await admin().from('cashflow_ai_conversations').select('id,title,pinned,archived,created_at,updated_at')
    .eq('user_id', userId).neq('id', await inboxConversationId(userId)).order('updated_at', { ascending: false }).limit(MAX_CONVERSATIONS);
  fail(error);
  return (data || []).map(row => ({ id: row.id, title: row.title, pinned: row.pinned, archived: row.archived, createdAt: row.created_at, updatedAt: row.updated_at }));
}

/** One conversation's messages (the latest 400), with each confirmation card's current state from its proposal. */
export async function loadConversation(userId: string, id: string, limit = MAX_MESSAGES): Promise<StoredMessage[] | null> {
  const owner = await admin().from('cashflow_ai_conversations').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  fail(owner.error);
  if (!owner.data) return null;
  const { data, error } = await admin().from('cashflow_ai_messages').select('id,role,text,cards,attachment,created_at')
    .eq('conversation_id', id).eq('user_id', userId).order('id', { ascending: false }).limit(limit);
  fail(error);
  const rows = (data || []).reverse();
  const proposalIds = rows.flatMap(row => ((row.cards || []) as StoredCard[]).flatMap(card => (card.kind === 'confirm' ? [card.id] : [])));
  const states = new Map<string, string>();
  if (proposalIds.length) {
    const found = await admin().from('cashflow_ai_proposals').select('id,status,expires_at').eq('user_id', userId).in('id', proposalIds.slice(0, 500));
    for (const row of found.data || []) {
      const expired = row.status === 'pending' && Date.parse(row.expires_at) <= Date.now();
      states.set(row.id, expired ? 'expired' : row.status === 'applying' ? 'pending' : row.status);
    }
  }
  return rows.map(row => ({
    id: `m-${row.id}`, role: row.role, text: row.text, at: row.created_at,
    ...(row.cards ? { cards: (row.cards as StoredCard[]).map(card => (card.kind === 'confirm' ? { ...card, status: states.get(card.id) ?? 'expired' } : card)) as StoredCard[] } : {}),
    ...(row.attachment ? { attachment: row.attachment } : {}),
  }));
}

/** Keep one exchange: the user's message and เลขา's answer. Creates the conversation on its first message. */
export async function appendTurns(userId: string, id: string, turns: StoredTurn[], options: { title?: string; keep?: number } = {}): Promise<void> {
  const found = await admin().from('cashflow_ai_conversations').select('id,user_id').eq('id', id).maybeSingle();
  fail(found.error);
  if (found.data && found.data.user_id !== userId) throw new Error('conversation belongs to another account');
  if (!found.data) {
    const title = (options.title || turns.find(turn => turn.role === 'user')?.text || 'แชตใหม่').replace(/\s+/g, ' ').trim().slice(0, 60);
    const created = await admin().from('cashflow_ai_conversations').insert({ id, user_id: userId, title });
    fail(created.error);
    await pruneConversations(userId);
  } else {
    const touched = await admin().from('cashflow_ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    fail(touched.error);
  }
  const rows = turns.map(turn => ({ conversation_id: id, user_id: userId, role: turn.role, text: turn.text.slice(0, 12000),
    cards: turn.cards?.length ? turn.cards : null, attachment: turn.attachment ?? null }));
  const inserted = await admin().from('cashflow_ai_messages').insert(rows);
  fail(inserted.error);
  await trimMessages(userId, id, options.keep ?? MAX_MESSAGES).catch(() => console.warn('assistant: old chat messages not trimmed'));
}

/** Messages older than a chat's latest 400 go (the app never shows them). */
async function trimMessages(userId: string, id: string, keep: number): Promise<void> {
  const { data, error } = await admin().from('cashflow_ai_messages').select('id').eq('conversation_id', id).eq('user_id', userId)
    .order('id', { ascending: false }).range(keep, keep);
  fail(error);
  const edge = data?.[0]?.id;
  if (edge === undefined || edge === null) return;
  const removed = await admin().from('cashflow_ai_messages').delete().eq('conversation_id', id).eq('user_id', userId).lte('id', edge);
  fail(removed.error);
}

/** The oldest unpinned conversations beyond 200 go, so one account cannot grow without end. */
async function pruneConversations(userId: string): Promise<void> {
  const { data } = await admin().from('cashflow_ai_conversations').select('id').eq('user_id', userId).eq('pinned', false)
    .neq('id', await inboxConversationId(userId)).order('updated_at', { ascending: false }).range(MAX_CONVERSATIONS, MAX_CONVERSATIONS + 50);
  const extra = (data || []).map(row => row.id);
  if (extra.length) await admin().from('cashflow_ai_conversations').delete().eq('user_id', userId).in('id', extra);
}

export async function updateConversation(userId: string, id: string, change: { title?: string; pinned?: boolean; archived?: boolean }): Promise<void> {
  const patch = {
    ...(typeof change.title === 'string' ? { title: change.title.trim().slice(0, 120) } : {}),
    ...(typeof change.pinned === 'boolean' ? { pinned: change.pinned } : {}),
    ...(typeof change.archived === 'boolean' ? { archived: change.archived } : {}),
  };
  if (!Object.keys(patch).length) return;
  const { error } = await admin().from('cashflow_ai_conversations').update(patch).eq('id', id).eq('user_id', userId);
  fail(error);
}

export async function deleteConversations(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await admin().from('cashflow_ai_conversations').delete().eq('user_id', userId).in('id', ids.slice(0, 100));
  fail(error);
}

/** An edited confirmation card replaces the old one in the stored chat too. */
export async function replaceStoredCard(userId: string, oldId: string, card: AssistantCard): Promise<void> {
  const { data, error } = await admin().from('cashflow_ai_messages').select('id,cards').eq('user_id', userId)
    .contains('cards', JSON.stringify([{ id: oldId }])).limit(1);
  fail(error);
  const row = data?.[0];
  if (!row) return;
  const cards = (row.cards as StoredCard[]).map(item => (item.kind === 'confirm' && item.id === oldId ? card : item));
  const updated = await admin().from('cashflow_ai_messages').update({ cards }).eq('id', row.id).eq('user_id', userId);
  fail(updated.error);
}
