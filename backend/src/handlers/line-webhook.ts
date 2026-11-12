import { stagingLineAllowed } from '../security/staging.js';
import { readRawBody } from '../http/guard.js';
import { rateLimit, challengeHash } from '../security/rateLimit.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { findUserByLineId, getQuickReply, handleAssistantMessage, isProUser, prefetchLinkedContext } from '../services/lineAssistant.js';
import { buildLineStart, buildLineWelcome } from '../services/lineLinkCards.js';
import { freeMonthlyTokens, lineSignupOn } from '../services/lineFirst.js';
import type { LineMessage } from '../services/line.js';
import { toneLineMessages } from '../services/lineTone.js';
import { decodeLineDraftAction } from '../services/lineDraftReview.js';
import { decodeLineDocumentAction } from '../services/lineDocumentDraft.js';
import { decodeVaultAction, handleLineFileMessage, handleLineImageSetPart, handleLineVaultAction } from '../services/lineVaultChat.js';
import { forgetLineMenu, lineMenuDeps, syncLineMenuFor } from '../services/lineRichMenus.js';
import { decodeDueAction } from '../services/lineDuePayments.js';
import { decodeWht50Action } from '../services/lineWht50Reminders.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_LOADING_URL = 'https://api.line.me/v2/bot/chat/loading/start';

/**
 * LINE's own typing dots in the chat while เลขา works (owner, 2026-10-28: "อยากให้มีสัญลักษณ์แบบ 3 จุดเหมือนกำลังพิมพ์"):
 * shown for up to 30 s, and gone the moment the answer arrives. Best effort: a failure never stops the answer.
 */
export async function showTyping(accessToken: string, chatId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl(LINE_LOADING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ chatId, loadingSeconds: 30 }),
    });
    if (!res.ok) console.warn('line-webhook: typing dots not shown', { status: res.status });
  } catch {
    console.warn('line-webhook: typing dots not shown');
  }
}


export interface LineEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string; id?: string; fileName?: string; fileSize?: number; imageSet?: { id?: string; index?: number; total?: number } };
  postback?: { data?: string };
}

export function lineEventCommand(event: LineEvent): string | null {
  if (event.source?.type !== 'user' || !event.source.userId) return null;
  if (event.type === 'postback') {
    const data = event.postback?.data || '';
    // Payment buttons in the 08:00 reminder pass through as-is; the assistant records them.
    if (decodeVaultAction(data) || decodeDueAction(data) || decodeWht50Action(data)) return data;
    // ยืนยัน / ยกเลิก on a เลขากระรอก confirmation card.
    const ai = /^ai:(confirm|cancel):(p_[0-9a-f-]{36})$/.exec(data);
    if (ai) return `${ai[1] === 'confirm' ? 'ยืนยัน' : 'ยกเลิก'}รายการเลขา ${ai[2]}`;
    // บันทึกทั้งหมด / ดูทีละใบ / ยกเลิกทั้งหมด on the one card for several pictures.
    const group = /^ai:(confirmall|cancelall|showall):(g[A-Za-z0-9]{6,40})$/.exec(data);
    if (group) return `${group[1] === 'confirmall' ? 'บันทึก' : group[1] === 'cancelall' ? 'ยกเลิก' : 'ดู'}ทั้งหมดเลขา ${group[2]}`;
    // สร้างเอกสาร / ยกเลิก on a quotation or invoice draft card (lineDocumentDraft.ts).
    return decodeLineDocumentAction(data) ?? decodeLineDraftAction(data);
  }
  if (event.type !== 'message') return null;
  if (event.message?.type === 'text') return (event.message.text || '').slice(0, 5000);
  if (event.message?.type === 'image' || event.message?.type === 'file') return 'ส่งเอกสาร';
  return null;
}

async function reply(accessToken: string, replyToken: string, messages: LineMessage[]): Promise<void> {
  const res = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      replyToken,
      messages: toneLineMessages(messages),
    }),
  });
  // LINE rejects an invalid payload (e.g. malformed Flex JSON) with a 4xx and a body explaining
  // why -- silently swallowing that (the previous behavior) means a bad message just never
  // arrives, with nothing in the logs to say why. Log it so that failure mode is visible.
  if (!res.ok) {
    console.error(`line-webhook: LINE reply API returned ${res.status}:`, await res.text());
    throw new Error(`LINE reply failed (${res.status})`);
  }
}

interface NotifSettingsRow {
  lineLinkCode?: string;
  lineLinkCodeExpiresAt?: string;
  [key: string]: unknown;
}

// Matches an incoming message's text against any account's pending link code (generated by
// api/line-link-code.ts from Settings) and links that account's lineUserId on a match --
// self-service, no manual "look up your ID and send it to support" step needed.
/** After the reply: the chat's LINE menu (admins keep แนบเอกสาร). Never fails or delays the answer itself. */
async function syncMenu(lineUserId: string): Promise<void> {
  const deps = lineMenuDeps();
  if (!deps) return;
  try { await syncLineMenuFor(lineUserId, deps); }
  catch (error) { console.error('line-menu: chat sync failed', { type: error instanceof Error ? error.message.slice(0, 80) : 'unknown' }); }
}

const LINK_CODE = /^[A-F0-9]{16}$/;

/**
 * What a link code means when this LINE chat is already linked: the same account (nothing to do), another account (the
 * old one has to let go first: moving the chat could strand an account made in LINE), or no live code at all. Null when
 * the chat is not linked, so the usual linking runs. The code is only looked at, never used up.
 */
export interface LinkCodeDeps {
  linkedTo(lineUserId: string): Promise<string | null>;
  codeOwner(code: string): Promise<string | null>;
  limit(lineUserId: string): Promise<void>;
}
const linkCodeDeps: LinkCodeDeps = {
  async linkedTo(lineUserId) {
    const linked = await supabaseAdmin.from('cashflow_line_links').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
    if (linked.error) throw linked.error;
    return (linked.data as { user_id?: string } | null)?.user_id ?? null;
  },
  async codeOwner(code) {
    const challenge = await supabaseAdmin.from('cashflow_challenges').select('user_id').eq('purpose', 'link')
      .eq('code_hash', challengeHash(code)).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (challenge.error) throw challenge.error;
    return (challenge.data as { user_id?: string } | null)?.user_id ?? null;
  },
  limit: async lineUserId => { await rateLimit('line-claim', lineUserId, 5, 900); },
};

export async function linkCodeWhileLinked(lineUserId: string, messageText: string, deps: LinkCodeDeps = linkCodeDeps): Promise<string | null> {
  const current = await deps.linkedTo(lineUserId);
  if (!current) return null;
  await deps.limit(lineUserId);
  const owner = await deps.codeOwner(messageText.trim().toUpperCase());
  if (!owner) return 'ไม่พบรหัสนี้ หรือรหัสหมดอายุแล้วครับ รหัสใช้ได้ 5 นาที และต้องขอจากเว็บเดียวกับ LINE นี้ ขอรหัสใหม่ได้ที่ ตั้งค่า › เชื่อมต่อ LINE';
  if (owner === current) return 'LINE นี้เชื่อมกับบัญชีนี้อยู่แล้วครับ พิมพ์บอกเลขาได้เลย';
  return 'LINE นี้เชื่อมกับอีกบัญชีหนึ่งอยู่ครับ ถ้าจะย้ายมาใช้บัญชีที่ขอรหัสนี้ ให้ยกเลิกการเชื่อมต่อในบัญชีเดิมก่อน (กดเมนูเปิดแอป › ตั้งค่า › เชื่อมต่อ LINE › ยกเลิกการเชื่อมต่อ) แล้วขอรหัสใหม่และส่งมาอีกครั้ง';
}

async function tryLinkAccount(userId: string, messageText: string): Promise<boolean> {
  const code = messageText.trim().toUpperCase();
  if (!LINK_CODE.test(code)) return false;
  await rateLimit('line-claim', userId, 5, 900);
  const result = await supabaseAdmin.rpc('cashflow_claim_line', { p_hash: challengeHash(code), p_line_user_id: userId });
  if (result.error) throw result.error;
  return !!result.data;
}

/** A follow (someone added the OA): with sign-up in LINE on, the เริ่มใช้งาน card for a chat without an account. */
async function answerFollow(event: LineEvent, accessToken: string): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineSignupOn() || event.source?.type !== 'user' || !lineUserId || !event.replyToken || !stagingLineAllowed(lineUserId)) return;
  if (!event.webhookEventId) throw new Error('LINE event is missing its ID');
  const claim = await supabaseAdmin.rpc('cashflow_claim_webhook', { p_key: event.webhookEventId });
  if (claim.error) throw claim.error;
  if (claim.data === 'done') return;
  if (claim.data !== 'claimed') throw new Error('LINE event is still processing');
  if (!(await findUserByLineId(lineUserId))) await reply(accessToken, event.replyToken, [buildLineStart(process.env.LIFF_ID)]);
  const done = await supabaseAdmin.from('cashflow_webhook_events').update({ status: 'done' }).eq('key', event.webhookEventId);
  if (done.error) throw done.error;
}

/** The card sent right after a LINE chat is linked: the Pro or the plain welcome for that account. */
export async function welcomeAfterLink(lineUserId: string, deps = { findUserByLineId, isProUser, getQuickReply }): Promise<LineMessage> {
  let pro = false;
  try {
    const user = await deps.findUserByLineId(lineUserId);
    // With the free monthly allowance on (services/lineFirst.ts), an account without Pro chats too: same welcome.
    pro = !!user && (freeMonthlyTokens() > 0 || await deps.isProUser(user.user_id));
  } catch {
    console.error('line-webhook: plan lookup for the welcome failed');
  }
  return buildLineWelcome({ pro, quickReply: pro ? deps.getQuickReply() : undefined });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !accessToken) {
    res.status(500).json({ error: 'Missing LINE_CHANNEL_SECRET or LINE_CHANNEL_ACCESS_TOKEN' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-line-signature'];
  const expectedSignature = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  if (typeof signature !== 'string' || Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const body = JSON.parse(rawBody.toString('utf-8')) as { events?: LineEvent[] };
    const events = body.events || [];

    await Promise.all(
      events.map(async (event) => {
        // A new friend (LINE_SIGNUP on): the เริ่มใช้งาน card, once per follow; someone already linked gets nothing extra.
        if (event.type === 'follow') { await answerFollow(event, accessToken); return; }
        const messageText = lineEventCommand(event);
        if (messageText === null || !event.replyToken) return;
        const lineUserId = event.source?.userId;
        if (event.source?.type !== 'user' || !lineUserId || !stagingLineAllowed(lineUserId)) return;

        if (!event.webhookEventId) throw new Error('LINE event is missing its ID');
        const vaultAction = event.type === 'postback' ? decodeVaultAction(event.postback?.data || '') : null;
        const vaultFile = event.type === 'message' && (event.message?.type === 'image' || event.message?.type === 'file')
          ? event.message : null;
        // Start the assistant's reads now (they only read) so they overlap the claim and rate-limit round
        // trips below instead of following them. A duplicate delivery just ignores the result.
        const linkedContext = vaultAction || vaultFile ? undefined : prefetchLinkedContext(lineUserId);
        const claim = await supabaseAdmin.rpc('cashflow_claim_webhook', { p_key: event.webhookEventId });
        if (claim.error) throw claim.error;
        if (claim.data === 'done') return;
        if (claim.data !== 'claimed') throw new Error('LINE event is still processing');
        // This message is ours to answer: the typing dots go up now, while the rest is read and worked out. Every reply
        // waits for them first, so they can never land after the answer and linger.
        const startedAt = Date.now();
        const typing = showTyping(accessToken, lineUserId);
        const send = async (messages: LineMessage[]) => { await typing; await reply(accessToken, event.replyToken!, messages); };
        await rateLimit('line-message', lineUserId, 30, 60);
        const complete = async () => {
          const result = await supabaseAdmin.from('cashflow_webhook_events').update({ status: 'done' }).eq('key', event.webhookEventId!);
          if (result.error) throw result.error;
        };

        // Already-linked accounts go through the AI assistant (add job / query / report).
        // handleAssistantMessage returns null when this LINE user isn't linked to anything
        // yet, in which case we fall back to matching the message against a pending link code.
        if (vaultAction || vaultFile) {
          // A picture or PDF is kept, then read by เลขา into confirmation cards (lineVaultChat.ts handleLineFileMessage).
          // Several pictures sent at once come one event each; only the one that completes the set answers.
          const messages = vaultAction ? [await handleLineVaultAction(lineUserId, vaultAction)]
            : (vaultFile!.imageSet?.total ?? 0) > 1 ? await handleLineImageSetPart(lineUserId, vaultFile!, accessToken)
            : await handleLineFileMessage(lineUserId, vaultFile!, accessToken);
          if (messages.length) await send(messages);
          await complete();
          return;
        }
        // A 16-character link code from a chat that is already linked (owner, 2026-11-13: the code went to เลขา, which
        // could only guess): say plainly what the code means here instead.
        if (event.type === 'message' && LINK_CODE.test(messageText.trim().toUpperCase())) {
          const answer = await linkCodeWhileLinked(lineUserId, messageText);
          if (answer) { await send([{ type: 'text', text: answer }]); await complete(); return; }
        }
        const assistantReply = await handleAssistantMessage(lineUserId, messageText, event.webhookEventId, undefined, linkedContext);
        if (assistantReply !== null) {
          // An empty answer is a linked message that needs no reply (an unrecognised message).
          if (assistantReply.length) await send(assistantReply);
          // How long the answer took, with no words from the chat: what to look at if LINE feels slow again.
          console.info('line-webhook: answered', { ms: Date.now() - startedAt, kind: event.type, replied: assistantReply.length > 0 });
          await complete();
          await syncMenu(lineUserId);
          return;
        }

        const linked = await tryLinkAccount(lineUserId, messageText);
        if (linked) {
          // The welcome says only what this account can use; if the plan cannot be read right now it
          // takes the version that promises nothing extra (the Pro features are named, not offered).
          await send([await welcomeAfterLink(lineUserId)]);
          await complete();
          forgetLineMenu(lineUserId);
          await syncMenu(lineUserId);
          return;
        }
        const replyText = 'ไม่พบรหัสเชื่อมต่อที่ตรงกันครับ ไปที่หน้าตั้งค่าในแอปกระรอกตุนเงิน > เชื่อมต่อ LINE เพื่อรับรหัสใหม่ แล้วส่งรหัสนั้นมาที่นี่ครับ';
        // With sign-up in LINE on, anything else from a chat without an account gets the เริ่มใช้งาน card; a code that did
        // not match still gets the code answer.
        const looksLikeCode = LINK_CODE.test(messageText.trim().toUpperCase());

        await send([lineSignupOn() && !looksLikeCode ? buildLineStart(process.env.LIFF_ID) : { type: 'text', text: replyText }]);
        await complete();
      })
    );

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('line-webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}
