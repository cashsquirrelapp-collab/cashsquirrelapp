import { z } from 'zod';
import { notifyBillingIssues } from '../services/ownerAlerts.js';
import { ATTACHMENT_MAX_BASE64, ATTACHMENT_TYPES, checkAttachment } from '../ai/attachment.js';
import { aiConfig, aiConfigFor } from '../ai/config.js';
import { buildLineInbox, inboxReply } from '../ai/lineInbox.js';
import { accountSnapshot } from '../repositories/accounts.js';
import type { UserRow } from '../services/lineAssistant.js';
import type { LineCardData } from '../../../shared/lineInbox.js';
import { dueActionOutcome, duePartialOutcome, dueRefFromDigestId } from '../services/lineDuePayments.js';
import { confirmProposal, handleMessage, MESSAGE_RATE, reviseProposal, usageStatus } from '../ai/service.js';
import { appendTurns, BROWSER_CONVERSATION_ID, CONVERSATION_ID, deleteConversations, INBOX_MESSAGES, inboxConversationId, listConversations, loadConversation, replaceStoredCard, updateConversation, type StoredTurn } from '../ai/conversations.js';
import { assistantPlan, supabaseAssistantDb } from '../ai/supabaseDb.js';
import { transcribeVoice, VOICE_MAX_BASE64 } from '../ai/transcription.js';
import { HttpError, withGuard } from '../http/guard.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';

// /api/assistant — เลขากระรอก. GET: is it on, the plan, tokens left. POST: send a message, confirm or cancel a
// proposal. Off unless AI_ENABLED=true; the keys stay on the server. The browser never chooses the model, the
// user id or the cost.

// 2,000 characters: a turn can carry what was read from a file sent earlier (note_from_file), 2026-10-24.
const turnSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) }).strict();
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('message'),
    text: z.string().trim().min(1).max(6000),
    history: z.array(turnSchema).max(12).optional(),
    pageName: z.string().trim().max(40).optional(),
    attachment: z.object({ name: z.string().max(200), mimeType: z.enum(ATTACHMENT_TYPES), data: z.string().min(4).max(ATTACHMENT_MAX_BASE64) }).strict().optional(),
    // The chat this message belongs to, kept in the account's history (2026-10-24); or the notifications thread.
    conversationId: z.string().regex(BROWSER_CONVERSATION_ID).optional(),
    thread: z.literal('line').optional(),
  }).strict(),
  z.object({ action: z.literal('conversation-update'), id: z.string().regex(CONVERSATION_ID),
    title: z.string().trim().min(1).max(120).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('conversations-delete'), ids: z.array(z.string().regex(CONVERSATION_ID)).min(1).max(100) }).strict(),
  z.object({
    action: z.literal('transcribe'),
    audio: z.object({ mimeType: z.literal('audio/wav'), data: z.string().min(4).max(VOICE_MAX_BASE64) }).strict(),
    language: z.enum(['th-TH', 'en-US']).optional(),
  }).strict(),
  z.object({ action: z.literal('confirm'), proposalId: z.string().regex(/^p_[0-9a-f-]{36}$/) }).strict(),
  z.object({ action: z.literal('cancel'), proposalId: z.string().regex(/^p_[0-9a-f-]{36}$/) }).strict(),
  // Fields changed on a confirmation card before confirming (2026-10-24); the card is prepared again, no model call.
  // A full document card has 10 party fields, 15 item fields and 3 tax/date fields. The service still checks
  // each key against the proposal tool's allowlist; item_1_price and similar keys include numeric indices.
  z.object({ action: z.literal('revise'), proposalId: z.string().regex(/^p_[0-9a-f-]{36}$/),
    edits: z.record(z.string().regex(/^[a-z_][a-z0-9_]{0,29}$/), z.union([z.string().max(200), z.number()])).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 28) }).strict(),
  // The notifications thread: a payment button on a reminder, or the amount typed after ได้ไม่ครบ.
  // `shown` is the button's line in the thread ("ได้รับเงินแล้ว · งาน"), kept with the answer.
  z.object({ action: z.literal('line-due'), kind: z.enum(['paid', 'later', 'partial']), id: z.string().regex(/^[A-Za-z0-9_.-]{1,128}(?::[A-Za-z0-9_.-]{1,128})?$/),
    shown: z.string().trim().min(1).max(200).optional() }).strict(),
  z.object({ action: z.literal('line-partial'), text: z.string().trim().min(1).max(200) }).strict(),
  // A quick reply (รอรับเงิน, สรุปเดือนนี้, กำลังดำเนินการ): the thread answers it at once; this keeps it.
  z.object({ action: z.literal('line-quick'), kind: z.enum(['unpaid', 'month', 'wip']), text: z.string().trim().min(1).max(60) }).strict(),
]);

/** One exchange of the notifications thread, kept in the account's history; a failure never costs the answer. */
async function keepInThread(userId: string, mine: string, reply: { text?: string; card?: LineCardData }) {
  const turns: StoredTurn[] = [
    { role: 'user', text: mine },
    { role: 'assistant', text: reply.text || '', ...(reply.card ? { cards: [{ kind: 'line' as const, card: reply.card }] } : {}) },
  ];
  await appendTurns(userId, await inboxConversationId(userId), turns, { title: 'แจ้งเตือนอัตโนมัติ', keep: INBOX_MESSAGES }).catch(() => console.warn('assistant: notifications thread not kept'));
}

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  // Group workspaces are not supported yet: the assistant works on the signed-in person's own account only.
  if (req.headers['x-finance-group'] !== undefined) throw new HttpError(400, 'เลขากระรอกใช้ได้กับบัญชีส่วนตัวเท่านั้นในตอนนี้');
  const config = aiConfig(process.env);
  const db = supabaseAssistantDb;

  // Status, chat and dictation share one policy; the browser cannot supply a role or subscription plan.
  const configFor = (plan: Awaited<ReturnType<typeof assistantPlan>>) => aiConfigFor(config, plan.plan, user.email);
  const requestConfigFor = (plan: Awaited<ReturnType<typeof assistantPlan>>) => {
    if (plan.plan === 'none') throw new HttpError(403, 'เลขากระรอกเป็นสิทธิ์ของสมาชิก Pro', 'ai_pro_only');
    return configFor(plan);
  };

  if (req.method === 'GET' && req.query.view === 'line') {
    // The "แจ้งเตือนอัตโนมัติ" thread: built from this account's own data, whether or not the AI is on.
    await rateLimit('assistant-read', user.id, 60, 60);
    const [account, history] = await Promise.all([
      accountSnapshot(user.id),
      inboxConversationId(user.id).then(id => loadConversation(user.id, id, INBOX_MESSAGES)).catch(() => null),
    ]);
    res.json({ ...buildLineInbox(account as unknown as UserRow), history: history ?? [] });
    return;
  }
  // The account's chat history (2026-10-24): the list, then one conversation when it is opened.
  if (req.method === 'GET' && req.query.view === 'conversations') {
    await rateLimit('assistant-read', user.id, 60, 60);
    res.json({ conversations: await listConversations(user.id).catch(() => []) });
    return;
  }
  if (req.method === 'GET' && req.query.view === 'conversation') {
    await rateLimit('assistant-read', user.id, 60, 60);
    const id = String(req.query.id || '');
    if (!CONVERSATION_ID.test(id)) throw new HttpError(400, 'ไม่พบบทสนทนา');
    const messages = await loadConversation(user.id, id).catch(() => null);
    if (!messages) throw new HttpError(404, 'ไม่พบบทสนทนานี้');
    res.json({ messages });
    return;
  }
  if (req.method === 'GET') {
    await rateLimit('assistant-read', user.id, 60, 60);
    const plan = await assistantPlan(user);
    res.json(await usageStatus(db, configFor(plan), user.id, plan));
    return;
  }

  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'ข้อความไม่ถูกต้อง หรือยาวเกิน 6,000 ตัวอักษร');
  const body = parsed.data;
  if (body.action === 'transcribe') {
    await rateLimit('assistant-voice-minute', user.id, 6, 60);
    await rateLimit('assistant-voice-window', user.id, 20, 600);
    const plan = await assistantPlan(user);
    res.json(await transcribeVoice(db, { config: requestConfigFor(plan) }, user.id, plan, body));
    return;
  }
  if (body.action === 'confirm') {
    await rateLimit('assistant-confirm', user.id, 30, 60);
    res.json(await confirmProposal(db, user.id, body.proposalId));
    return;
  }
  if (body.action === 'revise') {
    await rateLimit('assistant-confirm', user.id, 30, 60);
    const info = await assistantPlan(user);
    const revised = await reviseProposal(db, user.id, body.proposalId, body.edits, { isAdmin: info.plan === 'admin' });
    await replaceStoredCard(user.id, body.proposalId, revised.card).catch(() => console.warn('assistant: stored card not replaced'));
    res.json(revised);
    return;
  }
  if (body.action === 'conversation-update') {
    await rateLimit('assistant-confirm', user.id, 30, 60);
    await updateConversation(user.id, body.id, body);
    res.json({ ok: true });
    return;
  }
  if (body.action === 'conversations-delete') {
    await rateLimit('assistant-confirm', user.id, 30, 60);
    await deleteConversations(user.id, body.ids);
    res.json({ ok: true });
    return;
  }
  if (body.action === 'line-due' || body.action === 'line-partial') {
    // The same recording as LINE's 08:00 buttons (lineDuePayments): reread, apply, save with its version.
    await rateLimit('assistant-confirm', user.id, 30, 60);
    if (body.action === 'line-due') {
      const ref = dueRefFromDigestId(body.id);
      if (!ref) throw new HttpError(400, 'รายการไม่ถูกต้อง');
      const reply = inboxReply(await dueActionOutcome({ user_id: user.id }, { kind: body.kind, ref }));
      if (body.shown) await keepInThread(user.id, body.shown, reply);
      res.json(reply);
      return;
    }
    const account = await accountSnapshot(user.id) as unknown as UserRow;
    const outcome = await duePartialOutcome({ user_id: user.id, jobs: account.jobs as never }, body.text);
    const reply = outcome ? inboxReply(outcome) : { text: 'พิมพ์ยอดต่อท้ายข้อความ เช่น รับเงินบางส่วน #ABC123 ยอด 5000' };
    await keepInThread(user.id, body.text, reply);
    res.json(reply);
    return;
  }
  if (body.action === 'line-quick') {
    // The card is made again here from the account's own data, so what is kept is the server's, not the browser's.
    await rateLimit('assistant-confirm', user.id, 30, 60);
    const card = buildLineInbox(await accountSnapshot(user.id) as unknown as UserRow).quick[body.kind];
    await keepInThread(user.id, body.text, { card });
    res.json({ card });
    return;
  }
  if (body.action === 'cancel') {
    await rateLimit('assistant-confirm', user.id, 30, 60);
    res.json({ cancelled: await db.cancelProposal(user.id, body.proposalId) });
    return;
  }
  await rateLimit(MESSAGE_RATE.scope, user.id, MESSAGE_RATE.limit, MESSAGE_RATE.seconds);
  const attachment = body.attachment ? checkAttachment(body.attachment) : undefined;
  if (attachment) await rateLimit('assistant-file', user.id, 10, 600);
  const plan = await assistantPlan(user);
  const result = await handleMessage(db, { config: requestConfigFor(plan), onBillingIssue: issues => notifyBillingIssues(issues) }, user.id, plan, { text: body.text, history: body.history, pageName: body.pageName, attachment });
  // Kept in the account's history: the message (a file only by its name and kind) and the answer with its cards.
  // A history failure never costs the answer; before the migration runs the chat simply is not kept.
  const keepIn = body.thread === 'line' ? await inboxConversationId(user.id) : body.conversationId;
  if (keepIn) {
    await appendTurns(user.id, keepIn, [
      { role: 'user', text: body.text, ...(attachment ? { attachment: { name: attachment.name.slice(0, 120), kind: attachment.mimeType === 'application/pdf' ? 'pdf' as const : 'image' as const } } : {}) },
      { role: 'assistant', text: result.text, ...(result.cards?.length || result.memo ? { cards: [...(result.cards ?? []), ...(result.memo ? [{ kind: 'memo' as const, text: result.memo }] : [])] } : {}) },
    ], body.thread === 'line' ? { title: 'แจ้งเตือนอัตโนมัติ', keep: INBOX_MESSAGES } : {}).catch(() => console.warn('assistant: chat history not kept'));
  }
  res.json(result);
}, { csrf: true });
