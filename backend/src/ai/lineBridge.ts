import { HttpError } from '../http/guard.js';
import type { LineMessage } from '../services/line.js';
import { lineAppLink, lineCard, lineDoneCard, type DoneKind } from '../services/lineCards.js';
import type { UserRow } from '../services/lineAssistant.js';
import { aiConfig, aiConfigFor } from './config.js';
import { randomBytes } from 'node:crypto';
import { cardKind, cardLine, confirmAllMessage, lineAssistantReply, listFocus, shapeLineReply } from './lineFormat.js';
import { continueTurns, continueWhy, keepForApp } from './lineContinue.js';
import { LINE_CARD_COLORS } from '../services/lineCards.js';
import { rateLimit } from '../security/rateLimit.js';
import { confirmProposal, handleMessage, MESSAGE_RATE, thaiDay, usageStatus, type AssistantDb, type PlanInfo, type UsageStatus } from './service.js';
import { assistantPlanForUserId, supabaseAssistantDb } from './supabaseDb.js';
import type { AssistantCard, ChatFile, ChatTurn } from './types.js';
import { attachFilesToRecords, attachFileToRecord, cardGroupOf, dropCardGroup, saveCardGroup, takeFileForProposal, takeFilesForProposals } from '../services/lineFileLinks.js';
import { lineHistoryText, type ChannelTurn } from './crossChannel.js';
import { notifyBillingIssues } from '../services/ownerAlerts.js';
import { hasConsent } from '../repositories/consents.js';
import { appOrigin } from '../config/env.js';
import { patchPrivate } from '../repositories/accounts.js';
import { QUESTIONS_LEAD } from './gateway.js';
import { pendingAiQuestions, type PendingAiQuestions } from '../services/lineAiQuestions.js';
import { buildLineUpgradeMessages, markUpgradeCardShown, upgradeCardDue } from '../services/lineUpgrade.js';
import { activeEntryBatch, ENTRY_BATCH_KEY, entryTurn, mayBeEntryTurn } from './batchTurn.js';
import { KIND_WORDS, type EntryKind } from './batchEntries.js';
import { entryQuestionMessages, entryReviewMessages } from './lineEntries.js';
import { createToolbox } from './tools.js';
import { proposalBaseVersion } from './proposals.js';

// LINE talks to the same เลขากระรอก as the app: the same Gemini, rules, tools and Krarok Tokens (one pool per
// account), with answers shaped for LINE (lineFormat.ts). The LINE handler has already checked the account
// link, its lifecycle and Pro before calling here.

export interface LineAnswer { messages: LineMessage[]; text: string; /** The confirmation cards this answer prepared. */ proposalIds?: string[];
  /** เลขา's own answer, for a reply built differently (several pictures as one card). */ reply?: { text: string; cards: AssistantCard[] } }

/** Replaceable parts, for tests; production uses the real database, plan lookup and rate limiter. */
export interface LineBridgeDeps {
  env?: Record<string, string | undefined>;
  db?: AssistantDb;
  plan?: (userId: string) => Promise<PlanInfo & { email: string | null }>;
  rateLimit?: typeof rateLimit;
  run?: typeof handleMessage;
  now?: Date;
  /** How long เลขา may take in LINE before a short "try again" goes out instead (tests shorten it). */
  budgetMs?: number;
  /** Whether the account agreed to เลขากระรอก (shared/consents.ts); tests stand in for the record. */
  consented?: (userId: string) => Promise<boolean>;
  /** Keeps เลขา's questions while LINE asks them one at a time (services/lineAiQuestions.ts); tests stand in for it. */
  keepQuestions?: (userId: string, state: PendingAiQuestions) => Promise<void>;
  /** Keeps the conversation for ทำต่อในแอป and gives the link's id (ai/lineContinue.ts); tests stand in for it. */
  keepForApp?: typeof keepForApp;
  /** Keeps several cards as one group for ยืนยันทั้งหมด (services/lineFileLinks.ts); tests stand in for it. */
  saveGroup?: typeof saveCardGroup;
  /** The Plus / Pro card under an answer, at most once a week (services/lineUpgrade.ts); tests stand in for it. */
  upgradeDue?: (userId: string, now: Date) => Promise<boolean>;
  markUpgrade?: (userId: string, now: Date) => Promise<void>;
}

/** An account without a paid plan: free tokens, a gift, given tokens, or a paid plan that has ended. */
const unpaid = (plan: PlanInfo) => plan.plan === 'trial' || plan.plan === 'lapsed';

/**
 * LINE's answer has to go out inside the Worker's background time (about 30 s after LINE gets its 200; see
 * cloudflare/deferred.ts): the reads before the model, the model, the bookkeeping and the reply. Past this, เลขา stops
 * and says so plainly instead of the request being cut off with no answer at all (owner, 2026-10-28: "พิมพ์ข้อความแรก
 * ไป...อ่านแต่ว่าไม่สามารถตอบได้").
 */
export const LINE_AI_BUDGET_MS = 20_000;
const LINE_TOO_SLOW = 'ขอโทษครับ รอบนี้เลขาใช้เวลานานกว่าปกติ ส่งข้อความเดิมอีกครั้งได้เลยครับ (ไม่มีการหักโทเคน)';

/** "เช็กโทเคน", "โทเคนเหลือเท่าไหร่": a short question about tokens is answered from the pool, with no AI call. */
export const isTokenQuestion = (text: string) => text.trim().length <= 40 && /โท(เค|เค็)น|token/i.test(text);

/** The same balance as the token ring in the app: one pool per account for the app, LINE and voice. */
export function tokenBalanceText(status: UsageStatus): string {
  const shared = 'โทเคนนี้ใช้ร่วมกันทั้งเลขาในแอปและใน LINE';
  if (status.tokenLimit === null) return `ยังอ่านจำนวนโทเคนของบัญชีนี้ไม่ได้ กรุณาลองใหม่ภายหลัง\n${shared}`;
  const left = (status.tokensLeft ?? 0).toLocaleString('en-US');
  const next = status.plan === 'trial' ? 'อัปเกรดเป็น Pro เพื่อรับโทเคนเลขาทุกเดือน'
    : status.plan === 'lapsed' ? 'Pro หมดอายุแล้ว ใช้โทเคนที่เหลือได้จนหมด ต่ออายุ Pro เพื่อรับโทเคนใหม่'
    : status.resetsAt ? `ได้รับใหม่วันที่ ${thaiDay(new Date(status.resetsAt))}` : '';
  return [`โทเคนเลขารอบนี้ เหลือ ${left} จาก ${status.tokenLimit.toLocaleString('en-US')}`, next, shared].filter(Boolean).join('\n');
}

/** The AI's answer, or null when the real เลขา is not on for this account (the handler keeps its old behaviour).
 *  `files`: a picture or PDF sent in LINE (owner, 2026-11-06), read the same way as in the app's chat. */
async function keepQuestions(userId: string, state: PendingAiQuestions): Promise<void> {
  await patchPrivate(userId, { pendingAiQuestions: state });
}

export async function lineAssistantAnswer(user: UserRow, text: string, history: ChatTurn[], deps: LineBridgeDeps = {}, files: ChatFile[] = []): Promise<LineAnswer | null> {
  const settings = aiConfig(deps.env ?? process.env);
  if (!settings.enabled) return null;
  const plan = await (deps.plan ?? assistantPlanForUserId)(user.user_id);
  const config = aiConfigFor(settings, plan.plan, plan.email);
  if (plan.plan === 'none' || !config.enabled) return null;
  const db = deps.db ?? supabaseAssistantDb;
  try {
    if (isTokenQuestion(text)) {
      const balance = tokenBalanceText(await usageStatus(db, config, user.user_id, plan, deps.now));
      return { messages: [{ type: 'text', text: balance }], text: balance };
    }
    // Not before the account has agreed to เลขากระรอก (owner, 2026-11-05): the agreement is made in the app, once.
    if (!(await (deps.consented ?? (id => hasConsent(id, 'ai')))(user.user_id))) {
      const ask = `ก่อนคุยกับเลขากระรอกใน LINE กรุณาอ่านและกดยินยอมการใช้เลขาในแอปก่อนครับ (ครั้งเดียว) เปิดได้ที่ ${appOrigin()}/assistant`;
      return { messages: [{ type: 'text', text: ask }], text: ask };
    }
    // The same per-minute limit as the app's chat: one bucket per account, wherever the message comes from.
    await (deps.rateLimit ?? rateLimit)(MESSAGE_RATE.scope, user.user_id, MESSAGE_RATE.limit, MESSAGE_RATE.seconds);
    const reply = await (deps.run ?? handleMessage)(db, { config, now: deps.now, signal: AbortSignal.timeout(deps.budgetMs ?? LINE_AI_BUDGET_MS),
      onBillingIssue: issues => notifyBillingIssues(issues) }, user.user_id, plan, { text, history, channel: 'line', ...(files.length ? { attachments: files } : {}) });
    // เลขา's questions come one at a time (owner, 2026-11-14): the first now, the rest as each is answered; the line it adds
    // when it only asks ("รบกวนตอบคำถามด้านล่าง…") is left out.
    const asking = reply.cards.find((card): card is Extract<AssistantCard, { kind: 'questions' }> => card.kind === 'questions');
    if (asking) {
      try { await (deps.keepQuestions ?? keepQuestions)(user.user_id, pendingAiQuestions(asking.questions)); }
      catch { console.error('line-assistant: questions not kept'); }
    }
    const shown = asking && reply.text.trim() === QUESTIONS_LEAD ? '' : reply.text;
    // What the question is about stands out in a list of records (the delivery date, the payment date or the amount).
    const focus = listFocus(text);
    let shaped = shapeLineReply(shown, reply.cards, undefined, { focus });
    // ทำต่อในแอป (owner's plan, item 4): an answer LINE cannot give complete goes on in the app's chat with this conversation.
    const why = continueWhy({ text, history, asking: Boolean(asking), left: shaped.left, oversized: shaped.oversized });
    if (why) {
      try {
        const id = await (deps.keepForApp ?? keepForApp)(user.user_id, why, continueTurns(history, text, files, { text: reply.text, cards: reply.cards }));
        const link = lineAppLink(`/assistant?continue=${id}`, 'ทำต่อในแอป');
        if (link) shaped = shapeLineReply(shown, reply.cards, undefined, { continueLink: link, why, focus });
      } catch { console.error('line-assistant: the conversation was not kept for the app'); }
    }
    let messages = shaped.messages;
    // ยืนยันทั้งหมด (owner, 2026-11-15): several cards LINE shows in full get one card that confirms them all. It takes the
    // last place, before ทำต่อในแอป for analysis; cards LINE could not show in full go on in the app instead.
    const confirms = reply.cards.filter(card => card.kind === 'confirm');
    if (!asking && confirms.length >= 2 && shaped.left === 0 && !shaped.oversized) {
      try {
        const groupId = `g${randomBytes(12).toString('hex')}`;
        await (deps.saveGroup ?? saveCardGroup)(user.user_id, groupId, { cards: confirms, files: 0 });
        const base = why === 'detail' ? shapeLineReply(shown, reply.cards, undefined, { focus }).messages : messages;
        messages = [...base.slice(0, 4), confirmAllMessage(groupId, confirms)];
      } catch { console.error('line-assistant: the cards were not grouped'); }
    }
    // Running low: say so under the answer, with the same number the app shows (never under a question).
    const limit = plan.plan === 'trial' ? config.trialTokens : plan.tokens ?? config.proTokensPerCycle;
    if (!asking && reply.tokensLeft !== null && reply.tokensLeft <= Math.max(5, Math.round(limit * 0.1))) {
      const note = `เหลือโทเคนเลขารอบนี้ ${reply.tokensLeft.toLocaleString('en-US')} จาก ${limit.toLocaleString('en-US')} (ใช้ร่วมกับในแอป)`;
      const last = [...messages].reverse().find((message): message is Extract<LineMessage, { type: 'text' }> => message.type === 'text');
      if (last) last.text = `${last.text}\n\n${note}`; else if (messages.length < 5) messages.push({ type: 'text', text: note });
    }
    // Plus / Pro (owner, 2026-11-16): under an answer to an account without a paid plan when its tokens run low, or once a
    // week anyway; never under a question, never past LINE's five messages, never more than once a week.
    const low = reply.tokensLeft !== null && reply.tokensLeft <= Math.max(5, Math.round(limit * 0.1));
    if (unpaid(plan) && !asking && messages.length < 5) {
      const now = deps.now ?? new Date();
      try {
        if (await (deps.upgradeDue ?? upgradeCardDue)(user.user_id, now)) {
          messages = [...messages, ...buildLineUpgradeMessages(low ? 'low' : 'weekly', now, 5 - messages.length)];
          await (deps.markUpgrade ?? markUpgradeCardShown)(user.user_id, now);
        }
      } catch { console.error('line-assistant: the plans card was not added'); }
    }
    // LINE's short history keeps the questions and any card waiting, so a follow-up here or in the app knows them.
    const proposalIds = reply.cards.flatMap(card => (card.kind === 'confirm' ? [card.id] : []));
    return { messages, text: lineHistoryText(reply.text, reply.cards as ChannelTurn['cards']), ...(proposalIds.length ? { proposalIds } : {}), reply: { text: reply.text, cards: reply.cards } };
  } catch (error) {
    // Too slow this time: a plain line to send it again (a failed request costs no tokens).
    if (error instanceof HttpError && error.code === 'ai_provider') return { messages: [{ type: 'text', text: LINE_TOO_SLOW }], text: LINE_TOO_SLOW };
    // Token, trial and pause answers are messages for the person.
    // Out of tokens: recording by typing still works, with no tokens (owner, 2026-11-14).
    if (error instanceof HttpError && error.status === 402) {
      // With the Plus / Pro card for an account without a paid plan (owner, 2026-11-16: "ตอนโทเคนหมด").
      const card = unpaid(plan) ? buildLineUpgradeMessages('out', deps.now ?? new Date(), 4) : [];
      if (card.length) void (deps.markUpgrade ?? markUpgradeCardShown)(user.user_id, deps.now ?? new Date());
      const said = `${error.message}\nพิมพ์จดรายรับรายจ่ายได้ตามปกติ เช่น “ค่ากาแฟ 60” หรือ “งานตัดต่อ 3000” ไม่ใช้โทเคน`;
      return { messages: [{ type: 'text', text: said }, ...card], text: error.message };
    }
    if (error instanceof HttpError && error.status !== 500) return { messages: [{ type: 'text', text: error.message }], text: error.message };
    throw error;
  }
}

/**
 * A paste of many records in LINE, and the answers to its questions (batchTurn.ts, owner 2026-11-16): every line read by
 * rules, what a line does not say asked one at a time with taps, then the summary, a card per kind and ยืนยันทั้งหมด. No
 * model, no tokens. Null when the message is neither (it goes on as before; a batch that was waiting is dropped).
 */
export async function lineEntryTurn(user: UserRow, text: string, deps: { db?: AssistantDb; now?: Date; saveGroup?: typeof saveCardGroup } = {}): Promise<{ messages: LineMessage[]; text: string } | null> {
  const now = deps.now ?? new Date();
  const state = (user.notif_settings as Record<string, unknown> | undefined)?.[ENTRY_BATCH_KEY];
  if (!mayBeEntryTurn(text, state, now)) return null;
  const db = deps.db ?? supabaseAssistantDb;
  const { user: account, versions, absentRecords } = await db.loadAccount(user.user_id);
  if (account.user_id !== user.user_id) return null;
  const reader = { ...account, notif_settings: { ...(account.notif_settings ?? {}), ...(user.notif_settings ?? {}) } } as UserRow;
  const proposals = { save: (proposal: Parameters<AssistantDb['saveProposal']>[0]) => db.saveProposal({ ...proposal, baseVersion: proposalBaseVersion(proposal, versions, absentRecords) }) };
  const turn = await entryTurn({ text, user: reader, now, channel: 'line',
    execute: createToolbox({ user: reader, proposals, memory: { remember: async () => undefined }, now, channel: 'line' }) });
  const keep = turn && !('cleared' in turn) ? turn.state : null;
  if (turn || activeEntryBatch(state, now)) await db.saveEntryBatch?.(user.user_id, keep).catch(() => console.error('line-assistant: the pasted records were not kept'));
  if (!turn) return null;
  if ('cleared' in turn) return { messages: [{ type: 'text', text: turn.text }], text: turn.text };
  if (turn.questions.length) return { messages: entryQuestionMessages(turn), text: [turn.text, turn.questions[0].text].filter(Boolean).join('\n') };
  const confirms = turn.cards.filter((card): card is Extract<AssistantCard, { kind: 'confirm' }> => card.kind === 'confirm');
  const groupId = `g${randomBytes(12).toString('hex')}`;
  if (confirms.length) {
    const kinds = Object.fromEntries(confirms.flatMap(card => (card.entry ? [[card.id, card.entry.kind]] : [])));
    await (deps.saveGroup ?? saveCardGroup)(user.user_id, groupId, { cards: confirms, files: 0, kinds });
  }
  return { messages: entryReviewMessages(groupId, turn), text: turn.text };
}

const DONE: Record<string, { title: string; character: 'working' | 'received' | 'cancelled' | 'spent' }> = {
  add_job: { title: 'เพิ่มงานแล้ว', character: 'working' },
  add_expense: { title: 'บันทึกรายจ่ายแล้ว', character: 'spent' },
  record_payment: { title: 'บันทึกรับเงินแล้ว', character: 'received' },
  edit_job: { title: 'แก้ไขงานแล้ว', character: 'working' },
  delete_job: { title: 'ลบงานแล้ว', character: 'cancelled' },
};

/** The file links, replaceable for tests (lineFileLinks.ts). */
export interface LineFileLinkDeps { take: typeof takeFileForProposal; attach: typeof attachFileToRecord }

/** ยืนยัน / ยกเลิก on a confirmation card in LINE. A card prepared from a file sent in LINE gets that file attached. */
export async function lineAssistantCommand(user: UserRow, command: { action: 'confirm' | 'cancel'; proposalId: string },
  links: LineFileLinkDeps = { take: takeFileForProposal, attach: attachFileToRecord }): Promise<LineMessage[]> {
  if (command.action === 'cancel') {
    const cancelled = await supabaseAssistantDb.cancelProposal(user.user_id, command.proposalId);
    return [cancelled
      ? lineDoneCard({ kind: 'cancelled', status: 'ยกเลิกรายการแล้ว', altText: 'ยกเลิกรายการแล้ว ไม่ได้บันทึก',
        rows: [{ name: 'รายการนี้ไม่ได้ถูกบันทึก', lines: ['พิมพ์บอกเลขาใหม่ได้เลย เมื่อพร้อม'] }] })
      : { type: 'text', text: 'รายการนี้ยืนยันไปแล้วหรือหมดเวลาแล้วครับ' }];
  }
  try {
    const done = await confirmProposal(supabaseAssistantDb, user.user_id, command.proposalId, { channel: 'line' });
    const label = DONE[done.kind] ?? { title: 'บันทึกแล้ว', character: 'working' as const };
    // Saved already: attaching the file never costs the confirmation.
    // Only a card prepared from a file sent in LINE looks for it (the account's private state comes with notif_settings).
    let attached: string | null = null;
    const fromFile = (user.notif_settings as { lineFileProposals?: Record<string, unknown> } | undefined)?.lineFileProposals?.[command.proposalId];
    if (fromFile) {
      try {
        const fileId = await links.take(user.user_id, command.proposalId);
        if (fileId) attached = await links.attach(user.user_id, fileId, done as { kind: string; jobId?: string; recordId?: string });
      } catch { console.error('line-assistant: the file was not attached'); }
    }
    // Which record, by name and client (owner, 2026-11-15: "กูไม่รู้ว่ามันเป็นงานคลิปไหน มึงเขียนกำกับด้วย"), as the slim slip of
    // design B: a finished record has no big header.
    const name = (done as { name?: string }).name;
    const client = (done as { client?: string }).client;
    const kind: DoneKind = /^delete/.test(done.kind) ? 'cancelled' : /expense/.test(done.kind) ? 'expense' : done.kind === 'record_payment' ? 'income'
      : /document|issuer/.test(done.kind) ? 'document' : 'job';
    const sheetLine = done.sheet?.status === 'written' ? `ลงชีต: แถว ${done.sheet.row} แท็บ ${done.sheet.tab} ใน ${done.sheet.file}`
      : done.sheet?.status === 'failed' ? `ยังไม่ได้ลงชีต: ${done.sheet.error}` : null;
    return [lineDoneCard({
      kind, status: label.title, altText: name ? `${label.title}: ${name}` : label.title,
      rows: [{ name: name ? (client ? `${name} · ${client}` : name) : label.title, lines: ['บันทึกในแอปแล้ว', attached ? `แนบกับ ${attached} ในคลังเอกสารแล้ว` : null, sheetLine] }],
      footer: lineAppLink(done.path || '/jobs', 'เปิดในแอป'),
    })];
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) return [{ type: 'text', text: error.message }];
    throw error;
  }
}

/** Replaceable parts of the group commands, for tests. */
export interface LineGroupDeps {
  confirm?: (userId: string, proposalId: string) => Promise<{ kind: string; path?: string; jobId?: string; recordId?: string;
    sheet?: { status: string; url?: string; tab?: string; row?: number; file?: string } | null }>;
  cancel?: (userId: string, proposalId: string) => Promise<boolean>;
  drop?: typeof dropCardGroup;
  take?: typeof takeFilesForProposals;
  attach?: typeof attachFilesToRecords;
  now?: Date;
}

/**
 * บันทึกทั้งหมด / ดูทีละใบ / ยกเลิกทั้งหมด on the one card for several pictures (owner, 2026-11-06: "การ์ดเดียว + บันทึก
 * ทั้งหมด"). Every card is confirmed on its own, so each keeps the app's checks; one already confirmed with ดูทีละใบ is
 * counted, not saved twice.
 */
export async function lineGroupCommand(user: UserRow, command: { action: 'confirm' | 'cancel' | 'show'; groupId: string; kind?: EntryKind }, deps: LineGroupDeps = {}): Promise<LineMessage[]> {
  const group = cardGroupOf(user.notif_settings, command.groupId, deps.now);
  if (!group) return [{ type: 'text', text: 'การ์ดนี้หมดเวลาแล้วครับ ส่งใหม่หรือพิมพ์บอกเลขาอีกครั้งได้เลย' }];
  const every = group.cards.filter((card): card is Extract<AssistantCard, { kind: 'confirm' }> => Boolean(card) && (card as AssistantCard).kind === 'confirm');
  // ยืนยันรายรับ / รายจ่าย / งาน on a paste of many records: only that kind's cards; the group stays for the rest.
  const cards = command.kind ? every.filter(card => group.kinds?.[card.id] === command.kind) : every;
  if (!cards.length) return [{ type: 'text', text: 'ไม่มีรายการในกลุ่มนี้ที่รอยืนยันแล้วครับ' }];
  if (command.action === 'show') return lineAssistantReply('', cards);
  const drop = deps.drop ?? dropCardGroup;
  if (command.action === 'cancel') {
    for (const card of cards) await (deps.cancel ?? ((id, proposal) => supabaseAssistantDb.cancelProposal(id, proposal)))(user.user_id, card.id).catch(() => false);
    await drop(user.user_id, command.groupId).catch(() => undefined);
    return [lineDoneCard({ kind: 'cancelled', status: 'ยกเลิกทั้งหมดแล้ว', altText: `ยกเลิก ${cards.length} รายการแล้ว`,
      rows: cards.slice(0, 10).map(card => ({ name: cardLine(card).name, lines: ['ไม่ได้บันทึก'] })),
      ...(cards.length > 10 ? { more: `และอีก ${cards.length - 10} รายการ` } : {}),
      note: group.files ? 'รูปยังอยู่ในคลังเอกสาร ส่งรูปใหม่หรือพิมพ์บอกเลขาได้เลย' : 'พิมพ์บอกเลขาใหม่ได้เลย เมื่อพร้อม' })];
  }
  let saved = 0;
  let already = 0;
  let failed = 0;
  let path: string | undefined;
  const confirmed: { id: string; done: { kind: string; jobId?: string; recordId?: string } }[] = [];
  // Rows written to the person's sheet, so the answer says where and opens them selected (owner, 2026-11-16).
  const sheetRows: { url: string; tab: string; file: string; row: number }[] = [];
  // What became of each card, named in the card that answers (owner, 2026-11-15: "เขียนกำกับ ... ว่าแก้ไขคลิปไหนบ้าง").
  const marks = new Map<string, { text: string; bad?: boolean }>();
  for (const card of cards) {
    try {
      const done = await (deps.confirm ?? ((id, proposal) => confirmProposal(supabaseAssistantDb, id, proposal, { channel: 'line' })))(user.user_id, card.id);
      saved += 1;
      path ??= done.path;
      confirmed.push({ id: card.id, done });
      marks.set(card.id, { text: 'บันทึกแล้ว' });
      const sheet = (done as { sheet?: { status: string; url?: string; tab?: string; row?: number; file?: string } | null }).sheet;
      if (sheet?.status === 'written' && sheet.row) sheetRows.push({ url: sheet.url ?? '', tab: sheet.tab ?? '', file: sheet.file ?? '', row: sheet.row });
    } catch (error) {
      // Confirmed already (ดูทีละใบ), or no longer waiting: counted, never saved twice.
      if (error instanceof HttpError && error.status === 409) { already += 1; marks.set(card.id, { text: 'ยืนยันไว้ก่อนแล้ว' }); }
      else { failed += 1; marks.set(card.id, { text: 'ยังไม่สำเร็จ', bad: true }); }
    }
  }
  if (!failed && !command.kind) await drop(user.user_id, command.groupId).catch(() => undefined);
  // Each saved record gets the picture เลขา said it came from (owner, 2026-11-06: "ทำให้ส่งหลายรูปแล้วผูกบิลอัตโนมัติด้วย"),
  // taken in one read and attached in a batch; saved already, so attaching never costs a record.
  let attached = 0;
  const fromFiles = (user.notif_settings as { lineFileProposals?: Record<string, unknown> } | undefined)?.lineFileProposals ?? {};
  const linked = confirmed.filter(item => fromFiles[item.id]);
  if (linked.length) {
    try {
      const files = await (deps.take ?? takeFilesForProposals)(user.user_id, linked.map(item => item.id));
      const items = linked.flatMap(item => (files.get(item.id) ? [{ fileId: files.get(item.id) as string, done: item.done }] : []));
      if (items.length) attached = (await (deps.attach ?? attachFilesToRecords)(user.user_id, items)).filter(Boolean).length;
    } catch { console.error('line-assistant: the pictures were not attached'); }
  }
  // The slim slip of design B: each record by name and client, with what became of it; the kind of most of them colours it.
  const kinds = cards.map(card => cardKind(card));
  const common = (['job', 'expense', 'income', 'document'] as const).map(kind => ({ kind, count: kinds.filter(item => item === kind).length })).sort((a, b) => b.count - a.count)[0];
  const edits = cards.every(card => card.title.startsWith('แก้ไข'));
  const firstTab = sheetRows[0]?.tab;
  const tabRows = sheetRows.filter(item => item.tab === firstTab).map(item => item.row);
  const first = tabRows.length ? Math.min(...tabRows) : 0;
  const last = tabRows.length ? Math.max(...tabRows) : 0;
  const sheetUrl = sheetRows[0]?.url ? sheetRows[0].url.replace(/range=A\d+:([A-Z]+)\d+/, (_, column: string) => `range=A${first}:${column}${last}`) : '';
  const sheetLine = sheetRows.length ? `ลงชีต ${sheetRows[0].file} แท็บ ${firstTab} ${first === last ? `แถว ${first}` : `แถว ${first}–${last}`}${sheetRows.length > tabRows.length ? ` และแท็บอื่นอีก ${sheetRows.length - tabRows.length} แถว` : ''}` : null;
  return [lineDoneCard({
    kind: command.kind ?? (common?.count ? common.kind : 'job'),
    status: failed ? `บันทึกแล้ว ${saved} จาก ${cards.length} รายการ` : edits ? `แก้ไขแล้ว ${saved + already} รายการ`
      : command.kind ? `บันทึก${KIND_WORDS[command.kind]}แล้ว ${saved + already} รายการ` : `บันทึกแล้ว ${saved + already} รายการ`,
    altText: `บันทึกแล้ว ${saved} รายการ`,
    rows: cards.slice(0, 10).map(card => {
      const line = cardLine(card);
      const mark = marks.get(card.id);
      return { name: line.name, lines: [`${mark?.text ?? 'บันทึกแล้ว'} · ${line.detail}`], bad: mark?.bad };
    }),
    ...(cards.length > 10 ? { more: `และอีก ${cards.length - 10} รายการ` } : {}),
    extra: attached ? [{ label: 'แนบรูปกับรายการ', value: `${attached} รูป` }] : undefined,
    ...(failed ? { note: 'กด “บันทึกทั้งหมด” อีกครั้ง หรือ “ดูทีละใบ” เพื่อดูรายการที่ยังไม่สำเร็จ' } : sheetLine ? { note: `${sheetLine} กดดูในชีต ระบบจะเลือกแถวใหม่ไว้ให้` } : {}),
    // The sheet last (owner, 2026-11-16: "ชีตควรที่จะอยู่ด้านล่างสุดเลย"): ดูในชีต opens the new rows selected.
    footer: sheetUrl ? { label: 'ดูในชีต', uri: sheetUrl } : lineAppLink(path || '/incomeExpense', 'เปิดในแอป'),
  })];
}
