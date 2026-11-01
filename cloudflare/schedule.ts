// Four Cloudflare cron triggers (the Free plan allows five per account; staging has none). Each trigger is its own Worker
// invocation, so each has its own allowance of 50 outgoing requests. Until 2026-11-01 every 08:00 job ran in one
// invocation: the overdue digest used most of the 50, and the monthly report, the 50 ทวิ reminder, the owner's profit
// report and the AI credit check all failed with "network" errors (owner: "ทุกวันที่หนึ่ง ... ไม่เห็นมีอะไรส่งมา").
//   0 1 * * *          08:00 Bangkok daily   overdue digest
//   5 1 * * *          08:05 Bangkok daily   the owner's AI credit check (LINE when a provider runs low)
//   0 1-10 1-3 * *     08:00 on the 1st: the monthly report, 50 ทวิ reminder and the owner's profit report, in an
//                      invocation of their own beside the digest's (owner, 2026-11-01: "ส่งแค่เดือนละครั้ง ... 8โมงเช้า
//                      ทุกวันที่1"). Each is sent once per account and month (delivery claims); the hourly runs to 17:00
//                      and on the 2nd–3rd send nothing new unless 08:00 did not get through (as on 2026-11-01).
//   0 2 * * *          09:00 Bangkok daily   close expired accounts; LINE menus (admins keep แนบเอกสาร, 2026-10-24);
//                      promotion-month card renewals moved to ฿271 before their first December renewal
// The 50 ทวิ reminder is back since the owner launched the page (2026-10-31: "ใบ 50 ทวิ แจ้งเตือนได้ด้วย"): to accounts
// that turned it on in Settings (Pro, LINE linked).
// TEMPORARY (owner, 2026-11-01 12:35: "ลองส่งให้กูลองเทส ... ส่งมาผ่านไลน์เลย"): one send of the owner's profit report at
// 12:42 Bangkok today, removed right after.
export const CRONS = ['0 1 * * *', '5 1 * * *', '0 1-10 1-3 * *', '0 2 * * *', '42 5 1 11 *'] as const;
const MONTHLY_DAYS = 3;

export function scheduledPaths(cron: string, scheduledTime: number): string[] {
  // Use the event's intended time, not execution time: delayed events must still make the same decision. Between 01:00
  // and 10:59 UTC the Bangkok date agrees with the UTC date.
  const scheduledAt = new Date(scheduledTime);
  if (!Number.isFinite(scheduledAt.getTime())) throw new Error('Invalid scheduled event time');
  switch (cron) {
    case '0 1 * * *': return ['/api/send-overdue-digest'];
    case '5 1 * * *': return ['/api/check-ai-credit'];
    case '0 1-10 1-3 * *': return scheduledAt.getUTCDate() <= MONTHLY_DAYS ? ['/api/send-monthly-report', '/api/send-wht50-reminder', '/api/send-admin-profit-report'] : [];
    case '0 2 * * *': return ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals'];
    case '42 5 1 11 *': return scheduledAt.toISOString().startsWith('2026-11-01') ? ['/api/send-admin-profit-report'] : [];
    default: return [];
  }
}
