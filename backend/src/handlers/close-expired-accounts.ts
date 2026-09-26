import type { VercelRequest, VercelResponse } from '../http/types.js';
import { HttpError } from '../http/guard.js';
import { required } from '../config/env.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { deleteAccountPermanently } from '../services/accountDeletion.js';
import { bangkokDayKey, bangkokDayNumber, sendAccountPauseReminder } from '../services/accountReminder.js';
import { claimDelivery, releaseDelivery } from '../repositories/deliveries.js';

type DueAccount = { user_id: string; state: 'paused' | 'deleting' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (req.headers.authorization !== `Bearer ${required('CRON_SECRET')}`) throw new HttpError(401, 'Unauthorized');
  const admin = getSupabaseAdmin();
  const runAt = new Date();
  const now = runAt.toISOString();
  const [paused, abandoned] = await Promise.all([
    admin.from('cashflow_account_pauses').select('user_id,state').eq('state', 'paused').lte('delete_after', now).order('delete_after').limit(50),
    admin.from('cashflow_account_pauses').select('user_id,state').eq('state', 'deleting').lte('deletion_lease_until', now).order('delete_after').limit(50),
  ]);
  if (paused.error) throw paused.error;
  if (abandoned.error) throw abandoned.error;

  let deleted = 0;
  let deferred = 0;
  for (const row of ([...(abandoned.data || []), ...(paused.data || [])] as DueAccount[]).slice(0, 50)) {
    // Conditional update is the claim: an owner who reactivated first has no row to claim.
    let claim = admin.from('cashflow_account_pauses').update({ state: 'deleting', deletion_lease_until: new Date(Date.now() + 10 * 60_000).toISOString() })
      .eq('user_id', row.user_id).eq('state', row.state).lte('delete_after', now);
    if (row.state === 'deleting') claim = claim.lte('deletion_lease_until', now);
    const claimed = await claim.select('user_id').maybeSingle();
    if (claimed.error) throw claimed.error;
    if (!claimed.data) continue;

    try {
      const current = await admin.auth.admin.getUserById(row.user_id);
      if (current.error && current.error.status !== 404) throw current.error;
      if (!current.data.user || current.data.user.app_metadata?.account_paused !== true) {
        const removed = await admin.from('cashflow_account_pauses').delete().eq('user_id', row.user_id).eq('state', 'deleting');
        if (removed.error) throw removed.error;
        continue;
      }
      await deleteAccountPermanently(row.user_id);
      deleted += 1;
    } catch (error) {
      // Keep the account paused and retry on the next run. In particular, never
      // remove a sole group leader or the final system administrator.
      const released = await admin.from('cashflow_account_pauses').update({ state: 'paused', deletion_lease_until: null })
        .eq('user_id', row.user_id).eq('state', 'deleting');
      if (released.error) console.error('Account deletion lease release failed', { type: released.error.name });
      console.error('Deferred expired account deletion', { type: error instanceof Error ? error.name : 'UnknownError' });
      deferred += 1;
    }
  }

  const reminderWindowEnd = new Date(runAt.getTime() + 4 * 86_400_000).toISOString();
  const reminders = await admin.from('cashflow_account_pauses').select('user_id,delete_after')
    .eq('state', 'paused').eq('closure_kind', 'pause').gt('delete_after', now).lt('delete_after', reminderWindowEnd).order('delete_after').limit(1000);
  if (reminders.error) throw reminders.error;
  let reminded = 0;
  let reminderFailed = 0;
  for (const row of reminders.data || []) {
    const deadline = new Date(row.delete_after);
    const daysLeft = bangkokDayNumber(deadline) - bangkokDayNumber(runAt);
    if (daysLeft < 1 || daysLeft > 3) continue;
    const key = `account-pause-reminder:${row.user_id}:${bangkokDayKey(runAt)}`;
    let claimed = false;
    try {
      claimed = await claimDelivery(key);
      if (!claimed) continue;
      // Skip a reminder if the owner reopened the account after the list query.
      const fresh = await admin.from('cashflow_account_pauses').select('delete_after').eq('user_id', row.user_id).eq('state', 'paused').eq('closure_kind', 'pause').gt('delete_after', new Date().toISOString()).maybeSingle();
      if (fresh.error) throw fresh.error;
      if (!fresh.data || fresh.data.delete_after !== row.delete_after) { await releaseDelivery(key); claimed = false; continue; }
      const account = await admin.auth.admin.getUserById(row.user_id);
      if (account.error) throw account.error;
      if (!account.data.user?.email || account.data.user.app_metadata?.account_paused !== true) { await releaseDelivery(key); claimed = false; continue; }
      const sent = await sendAccountPauseReminder(account.data.user.email, deadline, daysLeft);
      if (!sent) throw new Error('Reminder email delivery failed');
      reminded += 1;
    } catch (error) {
      if (claimed) {
        try { await releaseDelivery(key); } catch (releaseError) { console.error('Reminder claim release failed', { type: releaseError instanceof Error ? releaseError.name : 'UnknownError' }); }
      }
      console.error('Account pause reminder failed', { type: error instanceof Error ? error.name : 'UnknownError' });
      reminderFailed += 1;
    }
  }
  res.json({ deleted, deferred, reminded, reminderFailed });
}
