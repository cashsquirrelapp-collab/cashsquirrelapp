import { stagingLineAllowed } from '../security/staging.js';
import { notificationOutcomeCounts, recordChannelOutcome } from '../services/notificationOutcome.js';
import { randomUUID } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import type { Job } from '../../../shared/types.js';
import type { VaultFile } from '../../../shared/vault.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { Handler } from '../http/types.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { patchPrivate } from '../repositories/accounts.js';
import { hasProAccess, listVaultFiles } from '../services/vault.js';
import type { LineMessage } from '../services/line.js';
import { checkLinkedAccountWriteAccess, type LinkedAccountWriteAccess } from '../services/linkedAccountAccess.js';
import { buildWht50ReminderMessage, findWaitingWht50Jobs, isWht50ReminderDay, wht50ReminderMonth } from '../services/lineWht50Reminders.js';

export type Wht50SendOutcome = 'accepted' | 'rejected' | 'unknown';
export interface Wht50ReminderAccount {
  user_id: string;
  jobs: Job[] | null;
  notif_settings: {
    wht50ReminderEnabled?: boolean;
    lastWht50ReminderMonth?: string;
    lineUserId?: string | null;
  } | null;
}
export interface Wht50ReminderDependencies {
  now(): Date;
  cronSecret(): string | undefined;
  listAccounts(): Promise<Wht50ReminderAccount[]>;
  getUser(userId: string): Promise<User | null>;
  hasPro(user: User): Promise<boolean>;
  checkAccess(userId: string): Promise<LinkedAccountWriteAccess>;
  listFiles(userId: string): Promise<VaultFile[]>;
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
  markSent(userId: string, week: string): Promise<void>;
  send(lineUserId: string, message: LineMessage, retryKey: string): Promise<Wht50SendOutcome>;
  log(message: string): void;
}

/** Retry only inside this invocation with identical content/key. Uncertain delivery keeps its claim. */
export async function sendWht50ReminderPayload(
  lineUserId: string, message: LineMessage, retryKey: string,
  options: { token?: string; fetcher?: typeof fetch; pause?: () => Promise<void> } = {},
): Promise<Wht50SendOutcome> {
  if (!stagingLineAllowed(lineUserId)) return 'rejected';
  const token = options.token ?? process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return 'rejected';
  const fetcher = options.fetcher ?? fetch;
  const body = JSON.stringify({ to: lineUserId, messages: [message] });
  let uncertain = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher('https://api.line.me/v2/bot/message/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Line-Retry-Key': retryKey },
        signal: AbortSignal.timeout(10000), body,
      });
      if (response.ok || (response.status === 409 && response.headers.has('x-line-accepted-request-id'))) return 'accepted';
      if (response.status >= 400 && response.status < 500) return uncertain ? 'unknown' : 'rejected';
      uncertain = true;
    } catch { uncertain = true; }
    if (attempt === 0) await (options.pause?.() ?? new Promise(resolve => setTimeout(resolve, 250)));
  }
  return 'unknown';
}

const defaults: Wht50ReminderDependencies = {
  now: () => new Date(), cronSecret: () => process.env.CRON_SECRET,
  listAccounts: async () => {
    const accounts: Wht50ReminderAccount[] = [];
    const pageSize = 200;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await getSupabaseAdmin().from('cashflow_account_snapshot')
        .select('user_id,jobs,notif_settings').eq('notif_settings->>wht50ReminderEnabled', 'true')
        .order('user_id').range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as Wht50ReminderAccount[];
      accounts.push(...page);
      if (page.length < pageSize) return accounts;
    }
  },
  getUser: async userId => {
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
    if (error) throw error;
    return data.user;
  },
  hasPro: hasProAccess,
  checkAccess: checkLinkedAccountWriteAccess,
  listFiles: userId => listVaultFiles({ kind: 'user', id: userId }),
  claim: claimDelivery, release: releaseDelivery,
  markSent: (userId, month) => patchPrivate(userId, { lastWht50ReminderMonth: month }),
  send: sendWht50ReminderPayload,
  log: message => console.error(message),
};

export function createWht50ReminderHandler(deps: Wht50ReminderDependencies = defaults): Handler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const secret = deps.cronSecret();
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const now = deps.now();
    const outcomes = notificationOutcomeCounts();
    if (!isWht50ReminderDay(now)) { res.json({ processed: 0, sent: 0, skipped: 0, ...outcomes, reason: 'not_scheduled_day' }); return; }
    const month = wht50ReminderMonth(now);
    let processed = 0; let sent = 0; let skipped = 0;
    try {
      const accounts = await deps.listAccounts();
      for (const account of accounts) {
        processed += 1;
        const settings = account.notif_settings;
        if (!stagingLineAllowed(settings?.lineUserId)) { skipped += 1; continue; }
        if (settings?.wht50ReminderEnabled !== true || !settings.lineUserId || settings.lastWht50ReminderMonth === month) { skipped += 1; continue; }
        let failureCounted = false;
        try {
          const user = await deps.getUser(account.user_id);
          if (!user || user.id !== account.user_id || user.app_metadata?.account_paused === true || !await deps.hasPro(user)) { skipped += 1; continue; }
          // Durable pause/deletion state can lead Auth metadata. Reuse the LINE lifecycle guard
          // so unavailable or closed accounts never reach vault reads, claims, or a message send.
          const access = await deps.checkAccess(account.user_id);
          if (!access.allowed) {
            if (access.status === 503) outcomes.failed += 1;
            else skipped += 1;
            continue;
          }
          // A failed metadata read must not turn into an empty vault and a false missing-document alert.
          const files = await deps.listFiles(account.user_id);
          const waiting = findWaitingWht50Jobs(account.jobs || [], files, now).filter(item => item.days === null || item.days >= 7);
          if (!waiting.length) { skipped += 1; continue; }
          const message = buildWht50ReminderMessage(waiting);
          const key = `wht50-month:${account.user_id}:${month}`;
          if (!await deps.claim(key)) { skipped += 1; continue; }
          let outcome: Wht50SendOutcome;
          try { outcome = await deps.send(settings.lineUserId, message, randomUUID()); }
          catch { outcome = 'unknown'; }
          recordChannelOutcome(outcomes, 'line', outcome);
          if (outcome === 'rejected') {
            outcomes.failed += 1; failureCounted = true;
            await deps.release(key);
            continue;
          }
          if (outcome === 'unknown') {
            // A timeout can follow successful acceptance. Keep the claim to avoid duplicate pushes.
            outcomes.uncertain += 1;
            deps.log('send-wht50-reminder: uncertain LINE acceptance; retained monthly claim');
            continue;
          }
          sent += 1;
          // The durable delivery claim remains even if this convenience marker fails to persist.
          try { await deps.markSent(account.user_id, month); }
          catch { outcomes.markerFailed += 1; deps.log('send-wht50-reminder: sent marker failed; delivery claim retained'); }
        } catch {
          if (!failureCounted) outcomes.failed += 1;
          deps.log('send-wht50-reminder: account processing failed');
        }
      }
      res.json({ processed, sent, skipped, ...outcomes });
    } catch {
      deps.log('send-wht50-reminder: account listing failed');
      res.status(500).json({ error: 'Reminder job failed' });
    }
  };
}

export default createWht50ReminderHandler();
