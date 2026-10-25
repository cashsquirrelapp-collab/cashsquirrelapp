import type { VercelRequest, VercelResponse } from '../http/types.js';
import { lineMenuDeps, syncAllLineMenus } from '../services/lineRichMenus.js';

// The LINE menus (services/lineRichMenus.ts): publishes the 5-tile menu for everyone and the 6-tile admin menu
// with แนบเอกสาร once per version, then attaches the admin menu to every LINE chat linked to a system admin and
// returns everyone else to the default. Runs every day at 09:00 Bangkok (cloudflare/schedule.ts) and can be run
// again by hand with CRON_SECRET; it is safe to repeat.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const deps = lineMenuDeps();
  if (!deps) {
    res.status(500).json({ error: 'Missing LINE_CHANNEL_ACCESS_TOKEN or LIFF_ID', failed: 1 });
    return;
  }
  try {
    res.status(200).json(await syncAllLineMenus(deps));
  } catch (error) {
    console.error('line-menu: sync failed', { type: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    res.status(500).json({ error: 'LINE menu sync failed', failed: 1 });
  }
}
