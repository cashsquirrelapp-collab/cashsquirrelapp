// Preserve the four jobs' Bangkok times using only two Cloudflare cron slots.
//   0 1 * * *   08:00 Bangkok daily       overdue digest; the owner's AI credit check (LINE when a provider runs low);
//                                         on the 1st also the monthly report and the 50 ทวิ reminder; on the 1st–3rd the
//                                         owner's profit report (sent once; the 2nd and 3rd only retry a failed send)
//   0 2 * * *   09:00 Bangkok daily       close expired accounts; LINE menus (admins keep แนบเอกสาร, 2026-10-24);
//                                         promotion-month card renewals moved to ฿271 before their first December renewal
// The 50 ทวิ reminder was hidden from 2026-10-22 and is back since the owner launched the page (2026-10-31: "ใบ 50 ทวิ
// แจ้งเตือนได้ด้วย"): on the 1st, to accounts that turned it on in Settings (Pro, LINE linked).
export const CRONS = ['0 1 * * *', '0 2 * * *'] as const;

export function scheduledPaths(cron: string, scheduledTime: number): string[] {
  switch (cron) {
    case '0 1 * * *': {
      // Use the event's intended time, not execution time: delayed events must
      // still make the same monthly decision. At 01:00 UTC the Bangkok date agrees.
      const scheduledAt = new Date(scheduledTime);
      if (!Number.isFinite(scheduledAt.getTime())) throw new Error('Invalid scheduled event time');
      const day = scheduledAt.getUTCDate();
      if (day === 1) return ['/api/send-overdue-digest', '/api/send-monthly-report', '/api/send-wht50-reminder', '/api/send-admin-profit-report', '/api/check-ai-credit'];
      return day <= 3 ? ['/api/send-overdue-digest', '/api/send-admin-profit-report', '/api/check-ai-credit'] : ['/api/send-overdue-digest', '/api/check-ai-credit'];
    }
    case '0 2 * * *': return ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals'];
    default: return [];
  }
}
