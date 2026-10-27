import { HttpError } from '../http/guard.js';
import type { LineMessage } from '../services/line.js';
import { lineAppLink, lineCard, lineValueRow } from '../services/lineCards.js';
import type { UserRow } from '../services/lineAssistant.js';
import { aiConfig, aiConfigFor } from './config.js';
import { lineAssistantReply } from './lineFormat.js';
import { rateLimit } from '../security/rateLimit.js';
import { confirmProposal, handleMessage, MESSAGE_RATE, thaiDay, usageStatus, type AssistantDb, type PlanInfo, type UsageStatus } from './service.js';
import { assistantPlanForUserId, supabaseAssistantDb } from './supabaseDb.js';
import type { ChatTurn } from './types.js';
import { lineHistoryText, type ChannelTurn } from './crossChannel.js';
import { notifyBillingIssues } from '../services/ownerAlerts.js';

// LINE talks to the same เลขากระรอก as the app: the same Gemini, rules, tools and Krarok Tokens (one pool per
// account), with answers shaped for LINE (lineFormat.ts). The LINE handler has already checked the account
// link, its lifecycle and Pro before calling here.

export interface LineAnswer { messages: LineMessage[]; text: string }

/** Replaceable parts, for tests; production uses the real database, plan lookup and rate limiter. */
export interface LineBridgeDeps {
  env?: Record<string, string | undefined>;
  db?: AssistantDb;
  plan?: (userId: string) => Promise<PlanInfo & { email: string | null }>;
  rateLimit?: typeof rateLimit;
  run?: typeof handleMessage;
  now?: Date;
}

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

/** The AI's answer, or null when the real เลขา is not on for this account (the handler keeps its old behaviour). */
export async function lineAssistantAnswer(user: UserRow, text: string, history: ChatTurn[], deps: LineBridgeDeps = {}): Promise<LineAnswer | null> {
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
    // The same per-minute limit as the app's chat: one bucket per account, wherever the message comes from.
    await (deps.rateLimit ?? rateLimit)(MESSAGE_RATE.scope, user.user_id, MESSAGE_RATE.limit, MESSAGE_RATE.seconds);
    const reply = await (deps.run ?? handleMessage)(db, { config, now: deps.now, onBillingIssue: issues => notifyBillingIssues(issues) }, user.user_id, plan, { text, history, channel: 'line' });
    const messages = lineAssistantReply(reply.text, reply.cards);
    // Running low: say so under the answer, with the same number the app shows.
    const limit = plan.plan === 'trial' ? config.trialTokens : plan.tokens ?? config.proTokensPerCycle;
    if (reply.tokensLeft !== null && reply.tokensLeft <= Math.max(5, Math.round(limit * 0.1))) {
      const note = `เหลือโทเคนเลขารอบนี้ ${reply.tokensLeft.toLocaleString('en-US')} จาก ${limit.toLocaleString('en-US')} (ใช้ร่วมกับในแอป)`;
      const last = [...messages].reverse().find((message): message is Extract<LineMessage, { type: 'text' }> => message.type === 'text');
      if (last) last.text = `${last.text}\n\n${note}`; else if (messages.length < 5) messages.push({ type: 'text', text: note });
    }
    // LINE's short history keeps the questions and any card waiting, so a follow-up here or in the app knows them.
    return { messages, text: lineHistoryText(reply.text, reply.cards as ChannelTurn['cards']) };
  } catch (error) {
    // Token, trial and pause answers are messages for the person.
    if (error instanceof HttpError && error.status !== 500) return { messages: [{ type: 'text', text: error.message }], text: error.message };
    throw error;
  }
}

const DONE: Record<string, { title: string; character: 'working' | 'received' | 'cancelled' }> = {
  add_job: { title: 'เพิ่มงานแล้ว', character: 'working' },
  record_payment: { title: 'บันทึกรับเงินแล้ว', character: 'received' },
  edit_job: { title: 'แก้ไขงานแล้ว', character: 'working' },
  delete_job: { title: 'ลบงานแล้ว', character: 'cancelled' },
};

/** ยืนยัน / ยกเลิก on a confirmation card in LINE. */
export async function lineAssistantCommand(user: UserRow, command: { action: 'confirm' | 'cancel'; proposalId: string }): Promise<LineMessage[]> {
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
    return [lineCard({
      title: label.title, subtitle: 'บันทึกในแอปเรียบร้อย', character: label.character, compact: true, altText: label.title,
      body: [lineValueRow('สถานะ', 'บันทึกแล้ว', { bold: false })],
      footer: lineAppLink(done.path || '/jobs', done.path ? 'เปิดรายการในแอป' : 'ดูในหน้างาน'),
    })];
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) return [{ type: 'text', text: error.message }];
    throw error;
  }
}
