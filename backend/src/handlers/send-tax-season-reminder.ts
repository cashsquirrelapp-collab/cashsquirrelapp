import { randomUUID } from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import type { Job } from '../../../shared/types.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { Handler } from '../http/types.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { patchPrivate } from '../repositories/accounts.js';
import { stagingLineAllowed } from '../security/staging.js';
import type { LineMessage } from '../services/line.js';
import { notificationOutcomeCounts, recordChannelOutcome } from '../services/notificationOutcome.js';
import { buildTaxSeasonMessage, filingYear, taxSeasonFacts, taxSeasonPhase } from '../services/taxSeason.js';
import { hasProAccess } from '../services/vault.js';
import { sendWht50ReminderPayload, type Wht50SendOutcome } from './send-wht50-reminder.js';

// The tax-season reminder (services/taxSeason.ts): 2 January and 2 March, to Pro accounts with LINE linked and their
// notifications on, once per account and season (a delivery claim, and a marker in the account's private state).
// Same delivery rules as the 50 ทวิ reminder: a refused push releases its claim; an uncertain one keeps it.

export interface TaxSeasonAccount {
  user_id: string;
  jobs: Job[] | null;
  notif_settings: { dailyDigestEnabled?: boolean; enabled?: boolean; lineUserId?: string | null; lastTaxSeasonReminder?: string } | null;
}
export interface TaxSeasonDependencies {
  now(): Date;
  cronSecret(): string | undefined;
  listAccounts(): Promise<TaxSeasonAccount[]>;
  getUser(userId: string): Promise<User | null>;
  hasPro(user: User): Promise<boolean>;
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
  markSent(userId: string, season: string): Promise<void>;
  send(lineUserId: string, message: LineMessage, retryKey: string): Promise<Wht50SendOutcome>;
  log(message: string): void;
}

const defaults: TaxSeasonDependencies = {
  now: () => new Date(), cronSecret: () => process.env.CRON_SECRET,
  listAccounts: async () => {
    const accounts: TaxSeasonAccount[] = [];
    const pageSize = 200;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await getSupabaseAdmin().from('cashflow_account_snapshot').select('user_id,jobs,notif_settings')
        .not('notif_settings->>lineUserId', 'is', null).order('user_id').range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as TaxSeasonAccount[];
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
  claim: claimDelivery, release: releaseDelivery,
  markSent: (userId, season) => patchPrivate(userId, { lastTaxSeasonReminder: season }),
  send: sendWht50ReminderPayload,
  log: message => console.error(message),
};

export function createTaxSeasonHandler(deps: TaxSeasonDependencies = defaults): Handler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const secret = deps.cronSecret();
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const now = deps.now();
    const outcomes = notificationOutcomeCounts();
    const phase = taxSeasonPhase(now);
    if (!phase) { res.json({ processed: 0, sent: 0, skipped: 0, ...outcomes, reason: 'not_scheduled_day' }); return; }
    const season = `${filingYear(now)}-${phase}`;
    let processed = 0; let sent = 0; let skipped = 0;
    try {
      for (const account of await deps.listAccounts()) {
        processed += 1;
        const settings = account.notif_settings;
        const on = settings?.dailyDigestEnabled ?? settings?.enabled ?? false;
        // Cheap checks first: every request after them counts against the run's allowance.
        if (!settings?.lineUserId || !on || settings.lastTaxSeasonReminder === season || !stagingLineAllowed(settings.lineUserId)) { skipped += 1; continue; }
        let failureCounted = false;
        try {
          const user = await deps.getUser(account.user_id);
          if (!user || user.id !== account.user_id || user.app_metadata?.account_paused === true || !await deps.hasPro(user)) { skipped += 1; continue; }
          const message = buildTaxSeasonMessage(taxSeasonFacts(account.jobs || [], now), phase);
          const key = `tax-season:${account.user_id}:${season}`;
          if (!await deps.claim(key)) { skipped += 1; continue; }
          let outcome: Wht50SendOutcome;
          try { outcome = await deps.send(settings.lineUserId, message, randomUUID()); }
          catch { outcome = 'unknown'; }
          recordChannelOutcome(outcomes, 'line', outcome);
          if (outcome === 'rejected') { outcomes.failed += 1; failureCounted = true; await deps.release(key); continue; }
          if (outcome === 'unknown') { outcomes.uncertain += 1; deps.log('send-tax-season-reminder: uncertain LINE acceptance; retained claim'); continue; }
          sent += 1;
          try { await deps.markSent(account.user_id, season); }
          catch { outcomes.markerFailed += 1; deps.log('send-tax-season-reminder: sent marker failed; delivery claim retained'); }
        } catch {
          if (!failureCounted) outcomes.failed += 1;
          deps.log('send-tax-season-reminder: account processing failed');
        }
      }
      res.json({ processed, sent, skipped, ...outcomes });
    } catch {
      deps.log('send-tax-season-reminder: account listing failed');
      res.status(500).json({ error: 'Reminder job failed' });
    }
  };
}

export default createTaxSeasonHandler();
