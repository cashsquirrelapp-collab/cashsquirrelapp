import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { Handler } from '../http/types.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';
import { OWNER_EMAIL } from '../security/adminAnalyticsAccess.js';
import { stagingLineAllowed } from '../security/staging.js';
import type { LineMessage } from '../services/line.js';
import { lineAppLink, lineCard, lineValueRow } from '../services/lineCards.js';
import { notificationOutcomeCounts, recordChannelOutcome } from '../services/notificationOutcome.js';
import { readBusinessProfile } from '../../../shared/businessProfile.js';
import { filingReminders, lastDay, readFiled, type FilingItem, type ReminderKind } from '../../../shared/filingCalendar.js';
import { labState, readLabs } from '../../../shared/labs.js';
import { sendWht50ReminderPayload, type Wht50SendOutcome } from './send-wht50-reminder.js';

// ปฏิทินยื่นภาษี in LINE (ฟีเจอร์ทดลอง; owner, 2026-11-12, plan phase 1): to test accounts with the filing calendar on, LINE
// linked and LINE notifications not turned off, three days before a return's paper date and on its last day (online
// date when there is one), from the six business answers (settings.business). Returns marked ยื่นแล้ว (settings.filed)
// are skipped. One card per account and day, claimed once (a refused push releases the claim, an uncertain one keeps it).
// It rides the 08:05 invocation (cloudflare/schedule.ts) and keeps to a small request budget.

export interface FilingAccount { user_id: string; settings: { business?: unknown; filed?: unknown } | null; notif_settings: { enabled?: boolean; lineUserId?: string | null } | null }
export interface FilingDependencies {
  now(): Date;
  cronSecret(): string | undefined;
  /** Accounts whose ฟีเจอร์ทดลอง has the filing calendar on (testers, and the owner). */
  listAccounts(): Promise<FilingAccount[]>;
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
  send(lineUserId: string, message: LineMessage, retryKey: string): Promise<Wht50SendOutcome>;
  log(message: string): void;
}

/** Requests one run may spend on sending (claim + push per account); the listing takes three. */
export const FILING_SEND_BUDGET = 16;

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`; };
/** Today in Bangkok. */
export const bangkokDate = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export function buildFilingMessage(reminders: { item: FilingItem; kind: ReminderKind }[], today: string): LineMessage {
  const last = reminders.some(reminder => reminder.kind === 'today');
  const rows = reminders.slice(0, 6).map(({ item, kind }) => lineValueRow(
    `${item.title} · ${item.period}`,
    kind === 'today' ? 'วันนี้วันสุดท้าย' : thaiDate(item.paper),
    { caption: kind === 'today' ? item.what : `${item.what}${item.online ? ` · ออนไลน์ได้ถึง ${thaiDate(lastDay(item))}` : ''}`, ...(kind === 'today' ? { color: '#C43A3A', bold: true } : {}) },
  ));
  const conditional = reminders.some(({ item }) => item.when);
  const link = lineAppLink('/calendar?view=tax', 'ดูปฏิทินยื่นภาษี');
  return lineCard({
    compact: true, character: last ? 'urgent' : 'reminder',
    title: last ? 'วันนี้วันสุดท้ายยื่นแบบ' : 'อีก 3 วันถึงกำหนดยื่นแบบ',
    subtitle: `ปฏิทินยื่นภาษี · ${thaiDate(today)}`,
    altText: `${last ? 'วันนี้วันสุดท้ายยื่นแบบ' : 'ใกล้ถึงกำหนดยื่นแบบ'}: ${reminders.map(({ item }) => `${item.title} ${item.period}`).join(', ')}`,
    body: [
      ...rows,
      ...(reminders.length > 6 ? [{ type: 'text', text: `และอีก ${reminders.length - 6} แบบ ดูในปฏิทิน`, size: 'xs', wrap: true, margin: 'md' }] : []),
      ...(conditional ? [{ type: 'text', text: 'ภ.ง.ด.1, 3, 53 ยื่นเฉพาะเดือนที่หักภาษี ณ ที่จ่ายไว้', size: 'xs', color: '#6B645E', wrap: true, margin: 'lg' }] : []),
    ],
    note: 'ปฏิทินบอกวันและเอกสารที่ต้องเตรียม ไม่ได้ยื่นแบบแทนคุณ กด ยื่นแล้ว ในแอปเพื่อหยุดเตือนแบบนั้น',
    ...(link ? { footer: { label: link.label, uri: link.uri } } : {}),
  });
}

const defaults: FilingDependencies = {
  now: () => new Date(), cronSecret: () => process.env.CRON_SECRET,
  listAccounts: async () => {
    const admin = getSupabaseAdmin();
    const [labsRows, owner] = await Promise.all([
      admin.from('cashflow_private_state').select('user_id,labs:data->labs').not('data->labs', 'is', null),
      admin.from('cashflow_account_snapshot').select('user_id').eq('email', OWNER_EMAIL).maybeSingle(),
    ]);
    if (labsRows.error) throw labsRows.error;
    const ownerId = (owner.data as { user_id?: string } | null)?.user_id ?? null;
    const records = new Map<string, unknown>(((labsRows.data || []) as { user_id: string; labs: unknown }[]).map(row => [row.user_id, row.labs]));
    if (ownerId && !records.has(ownerId)) records.set(ownerId, null);
    const ids = [...records].filter(([id, labs]) => labState(readLabs(labs), id === ownerId).on.includes('filingCalendar')).map(([id]) => id);
    if (!ids.length) return [];
    const { data, error } = await admin.from('cashflow_account_snapshot').select('user_id,settings,notif_settings').in('user_id', ids);
    if (error) throw error;
    return (data || []) as FilingAccount[];
  },
  claim: claimDelivery, release: releaseDelivery,
  send: sendWht50ReminderPayload,
  log: message => console.error(message),
};

export function createFilingReminderHandler(deps: FilingDependencies = defaults): Handler {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const secret = deps.cronSecret();
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const today = bangkokDate(deps.now());
    const outcomes = notificationOutcomeCounts();
    let processed = 0; let sent = 0; let skipped = 0; let deferred = 0; let used = 0;
    try {
      for (const account of await deps.listAccounts()) {
        processed += 1;
        const line = account.notif_settings;
        if (!line?.lineUserId || line.enabled === false || !stagingLineAllowed(line.lineUserId)) { skipped += 1; continue; }
        const profile = readBusinessProfile(account.settings?.business);
        if (!profile) { skipped += 1; continue; }
        const reminders = filingReminders(profile, today, readFiled(account.settings?.filed));
        if (!reminders.length) { skipped += 1; continue; }
        if (used + 2 > FILING_SEND_BUDGET) { deferred += 1; continue; }
        const key = `filing:${account.user_id}:${today}`;
        used += 1;
        if (!await deps.claim(key)) { skipped += 1; continue; }
        let outcome: Wht50SendOutcome;
        used += 1;
        try { outcome = await deps.send(line.lineUserId, buildFilingMessage(reminders, today), randomUUID()); }
        catch { outcome = 'unknown'; }
        recordChannelOutcome(outcomes, 'line', outcome);
        if (outcome === 'rejected') { outcomes.failed += 1; await deps.release(key).catch(() => undefined); continue; }
        if (outcome === 'unknown') { outcomes.uncertain += 1; deps.log('send-filing-reminder: uncertain LINE acceptance; retained claim'); continue; }
        sent += 1;
      }
      res.json({ processed, sent, skipped, deferred, ...outcomes });
    } catch {
      deps.log('send-filing-reminder: account listing failed');
      res.status(500).json({ error: 'Reminder job failed' });
    }
  };
}

export default createFilingReminderHandler();
