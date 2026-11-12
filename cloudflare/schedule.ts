// Five Cloudflare cron triggers (the Free plan's most per account; staging has none). Each trigger is its own Worker
// invocation, so each has its own allowance of 50 outgoing requests. Until 2026-11-01 every 08:00 job ran in one
// invocation: the overdue digest used most of the 50, and the monthly report, the 50 ทวิ reminder, the owner's profit
// report and the AI credit check all failed with "network" errors (owner: "ทุกวันที่หนึ่ง ... ไม่เห็นมีอะไรส่งมา").
//   0 1 * * *          08:00 Bangkok daily   overdue digest
//   5 1-10 * * *       08:05 Bangkok daily   the owner's AI credit check (LINE when a provider runs low), once a day at
//                      08:05; and on the 1st–3rd, hourly 08:05–17:05, the 50 ทวิ reminder in this invocation of its own
//                      (2026-11-03: it is on for every Pro account with LINE unless turned off, so it needs the room; it
//                      keeps to a request budget and leaves the rest for the next hour)
//   0 1-10 1-3 * *     08:00 on the 1st: the monthly report, in an invocation of its own beside the digest's (owner,
//                      2026-11-01: "ส่งแค่เดือนละครั้ง ... 8โมงเช้าทุกวันที่1"). Sent once per account and month (delivery
//                      claims); the hourly runs to 17:00 and on the 2nd–3rd send nothing new unless 08:00 did not get
//                      through (as on 2026-11-01).
//   2 1-10 1-3 * *     08:02 on the 1st: the owner's profit report alone (its Stripe reads need the room; at 13:00 on
//                      2026-11-01 it failed sharing the monthly jobs' invocation), hourly retries the same way.
//   0 2 * * *          09:00 Bangkok daily   close expired accounts; LINE menus (admins keep แนบเอกสาร, 2026-10-24);
//                      promotion-month card renewals moved to ฿271 before their first December renewal
// The tax-season reminder (owner, 2026-11-02) rides on 08:02 on 2 January and 2 March: by the 2nd the profit report has
// gone out (it only retries what the 1st missed), so the invocation has room; the hourly runs retry what 08:02 missed.
// The filing-calendar reminder (ฟีเจอร์ทดลอง, owner, 2026-11-12; test accounts only, a few requests) rides 08:05: alone
// beside the AI credit check on the 4th–31st, and at 17:05 on the 1st–3rd, when the 50 ทวิ reminder has had the day.
// The 50 ทวิ reminder is back since the owner launched the page (2026-10-31: "ใบ 50 ทวิ แจ้งเตือนได้ด้วย"): to Pro
// accounts with LINE linked, on unless turned off in Settings (owner, 2026-11-03; before that only when turned on).
export const CRONS = ['0 1 * * *', '5 1-10 * * *', '0 1-10 1-3 * *', '2 1-10 1-3 * *', '0 2 * * *'] as const;
const MONTHLY_DAYS = 3;

export function scheduledPaths(cron: string, scheduledTime: number): string[] {
  // Use the event's intended time, not execution time: delayed events must still make the same decision. Between 01:00
  // and 10:59 UTC the Bangkok date agrees with the UTC date.
  const scheduledAt = new Date(scheduledTime);
  if (!Number.isFinite(scheduledAt.getTime())) throw new Error('Invalid scheduled event time');
  switch (cron) {
    case '0 1 * * *': return ['/api/send-overdue-digest'];
    case '5 1-10 * * *': return [
      ...(scheduledAt.getUTCHours() === 1 ? ['/api/check-ai-credit'] : []),
      ...(scheduledAt.getUTCDate() <= MONTHLY_DAYS ? ['/api/send-wht50-reminder'] : []),
      ...((scheduledAt.getUTCDate() > MONTHLY_DAYS ? scheduledAt.getUTCHours() === 1 : scheduledAt.getUTCHours() === 10) ? ['/api/send-filing-reminder'] : []),
    ];
    case '0 1-10 1-3 * *': return scheduledAt.getUTCDate() <= MONTHLY_DAYS ? ['/api/send-monthly-report'] : [];
    case '2 1-10 1-3 * *': return scheduledAt.getUTCDate() <= MONTHLY_DAYS ? ['/api/send-admin-profit-report',
      ...(scheduledAt.getUTCDate() === 2 && [0, 2].includes(scheduledAt.getUTCMonth()) ? ['/api/send-tax-season-reminder'] : [])] : [];
    case '0 2 * * *': return ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals'];
    default: return [];
  }
}
