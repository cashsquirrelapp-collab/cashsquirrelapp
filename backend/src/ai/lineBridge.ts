import { HttpError } from '../http/guard.js';
import type { LineMessage } from '../services/line.js';
import { lineAppLink, lineCard, lineValueRow } from '../services/lineCards.js';
import type { UserRow } from '../services/lineAssistant.js';
import { aiConfig, aiConfigFor } from './config.js';
import { lineAssistantReply } from './lineFormat.js';
import { LINE_CARD_COLORS } from '../services/lineCards.js';
import { rateLimit } from '../security/rateLimit.js';
import { confirmProposal, handleMessage, MESSAGE_RATE, thaiDay, usageStatus, type AssistantDb, type PlanInfo, type UsageStatus } from './service.js';
import { assistantPlanForUserId, supabaseAssistantDb } from './supabaseDb.js';
import type { AssistantCard, ChatFile, ChatTurn } from './types.js';
import { attachFilesToRecords, attachFileToRecord, cardGroupOf, dropCardGroup, takeFileForProposal, takeFilesForProposals } from '../services/lineFileLinks.js';
import { lineHistoryText, type ChannelTurn } from './crossChannel.js';
import { notifyBillingIssues } from '../services/ownerAlerts.js';
import { hasConsent } from '../repositories/consents.js';
import { appOrigin } from '../config/env.js';

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
}

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
  const next = status.plan === 'trial' ? 'สิทธิ์ทดลองใช้ไม่เติมใหม่ ใช้ต่อได้เมื่อเป็น Pro'
    : status.plan === 'lapsed' ? 'Pro หมดอายุแล้ว ใช้โทเคนที่เหลือได้จนหมด ต่ออายุ Pro เพื่อรับโทเคนใหม่'
    : status.resetsAt ? `ได้รับใหม่วันที่ ${thaiDay(new Date(status.resetsAt))}` : '';
  return [`โทเคนเลขารอบนี้ เหลือ ${left} จาก ${status.tokenLimit.toLocaleString('en-US')}`, next, shared].filter(Boolean).join('\n');
}

/** The AI's answer, or null when the real เลขา is not on for this account (the handler keeps its old behaviour).
 *  `files`: a picture or PDF sent in LINE (owner, 2026-11-06), read the same way as in the app's chat. */
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
    const messages = lineAssistantReply(reply.text, reply.cards);
    // Running low: say so under the answer, with the same number the app shows.
    const limit = plan.plan === 'trial' ? config.trialTokens : plan.tokens ?? config.proTokensPerCycle;
    if (reply.tokensLeft !== null && reply.tokensLeft <= Math.max(5, Math.round(limit * 0.1))) {
      const note = `เหลือโทเคนเลขารอบนี้ ${reply.tokensLeft.toLocaleString('en-US')} จาก ${limit.toLocaleString('en-US')} (ใช้ร่วมกับในแอป)`;
      const last = [...messages].reverse().find((message): message is Extract<LineMessage, { type: 'text' }> => message.type === 'text');
      if (last) last.text = `${last.text}\n\n${note}`; else if (messages.length < 5) messages.push({ type: 'text', text: note });
    }
    // LINE's short history keeps the questions and any card waiting, so a follow-up here or in the app knows them.
    const proposalIds = reply.cards.flatMap(card => (card.kind === 'confirm' ? [card.id] : []));
    return { messages, text: lineHistoryText(reply.text, reply.cards as ChannelTurn['cards']), ...(proposalIds.length ? { proposalIds } : {}), reply: { text: reply.text, cards: reply.cards } };
  } catch (error) {
    // Too slow this time: a plain line to send it again (a failed request costs no tokens).
    if (error instanceof HttpError && error.code === 'ai_provider') return { messages: [{ type: 'text', text: LINE_TOO_SLOW }], text: LINE_TOO_SLOW };
    // Token, trial and pause answers are messages for the person.
    if (error instanceof HttpError && error.status !== 500) return { messages: [{ type: 'text', text: error.message }], text: error.message };
    throw error;
  }
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
      ? lineCard({ title: 'ยกเลิกรายการแล้ว', subtitle: 'รายการนี้ไม่ได้ถูกบันทึก', character: 'cancelled', compact: true, altText: 'ยกเลิกรายการแล้ว ไม่ได้บันทึก',
        body: [{ type: 'text', text: 'พิมพ์บอกเลขาใหม่ได้เลย เมื่อพร้อม', size: 'sm', color: '#6B6560', wrap: true }] })
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
    return [lineCard({
      title: label.title, subtitle: 'บันทึกในแอปเรียบร้อย', character: label.character, compact: true, altText: label.title,
      body: [lineValueRow('สถานะ', 'บันทึกแล้ว', { bold: false }), ...(attached ? [lineValueRow('ไฟล์', `แนบกับ ${attached} ในคลังเอกสารแล้ว`, { bold: false })] : [])],
      footer: lineAppLink(done.path || '/jobs', done.path ? 'เปิดรายการในแอป' : 'ดูในหน้างาน'),
    })];
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) return [{ type: 'text', text: error.message }];
    throw error;
  }
}

/** Replaceable parts of the group commands, for tests. */
export interface LineGroupDeps {
  confirm?: (userId: string, proposalId: string) => Promise<{ kind: string; path?: string; jobId?: string; recordId?: string }>;
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
export async function lineGroupCommand(user: UserRow, command: { action: 'confirm' | 'cancel' | 'show'; groupId: string }, deps: LineGroupDeps = {}): Promise<LineMessage[]> {
  const group = cardGroupOf(user.notif_settings, command.groupId, deps.now);
  if (!group) return [{ type: 'text', text: 'การ์ดนี้หมดเวลาแล้วครับ ส่งรูปใหม่อีกครั้งได้เลย' }];
  const cards = group.cards.filter((card): card is Extract<AssistantCard, { kind: 'confirm' }> => Boolean(card) && (card as AssistantCard).kind === 'confirm');
  if (command.action === 'show') return lineAssistantReply('', cards);
  const drop = deps.drop ?? dropCardGroup;
  if (command.action === 'cancel') {
    for (const card of cards) await (deps.cancel ?? ((id, proposal) => supabaseAssistantDb.cancelProposal(id, proposal)))(user.user_id, card.id).catch(() => false);
    await drop(user.user_id, command.groupId).catch(() => undefined);
    return [lineCard({ title: 'ยกเลิกทั้งหมดแล้ว', subtitle: `${cards.length} รายการนี้ไม่ได้ถูกบันทึก`, character: 'cancelled', compact: true,
      altText: `ยกเลิก ${cards.length} รายการแล้ว`, body: [{ type: 'text', text: 'รูปยังอยู่ในคลังเอกสาร ส่งรูปใหม่หรือพิมพ์บอกเลขาได้เลย', size: 'sm', color: LINE_CARD_COLORS.muted, wrap: true }] })];
  }
  let saved = 0;
  let already = 0;
  let failed = 0;
  let path: string | undefined;
  const confirmed: { id: string; done: { kind: string; jobId?: string; recordId?: string } }[] = [];
  for (const card of cards) {
    try {
      const done = await (deps.confirm ?? ((id, proposal) => confirmProposal(supabaseAssistantDb, id, proposal, { channel: 'line' })))(user.user_id, card.id);
      saved += 1;
      path ??= done.path;
      confirmed.push({ id: card.id, done });
    } catch (error) {
      // Confirmed already (ดูทีละใบ), or no longer waiting: counted, never saved twice.
      if (error instanceof HttpError && error.status === 409) already += 1; else failed += 1;
    }
  }
  if (!failed) await drop(user.user_id, command.groupId).catch(() => undefined);
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
  const body = [
    lineValueRow('บันทึกแล้ว', `${saved} รายการ`, { bold: true }),
    ...(attached ? [lineValueRow('แนบรูปกับรายการ', `${attached} รูป`, { bold: false })] : []),
    ...(already ? [lineValueRow('ยืนยันไว้ก่อนแล้ว', `${already} รายการ`, { bold: false })] : []),
    ...(failed ? [lineValueRow('ยังไม่สำเร็จ', `${failed} รายการ`, { bold: false, color: LINE_CARD_COLORS.negative })] : []),
  ];
  return [lineCard({
    title: failed ? `บันทึกแล้ว ${saved} จาก ${cards.length} รายการ` : `บันทึกแล้ว ${saved + already} รายการ`, subtitle: 'บันทึกในแอปเรียบร้อย',
    character: 'review', compact: true, altText: `บันทึกแล้ว ${saved} รายการ`, body,
    ...(failed ? { note: 'กด “บันทึกทั้งหมด” อีกครั้ง หรือ “ดูทีละใบ” เพื่อดูรายการที่ยังไม่สำเร็จ' } : {}),
    footer: lineAppLink(path || '/incomeExpense', 'เปิดในแอป'),
  })];
}
