// Preserve the four jobs' Bangkok times using only two Cloudflare cron slots.
//   0 1 * * *   08:00 Bangkok daily       overdue digest; on the 1st also the monthly report
//   0 2 * * *   09:00 Bangkok daily       close expired accounts
// The 50 ทวิ reminder is hidden until the owner launches the feature (2026-10-22). Its handler and
// message stay as they are; to bring it back, add '/api/send-wht50-reminder' to the 1st's list again.
export const CRONS = ['0 1 * * *', '0 2 * * *'] as const;

export function scheduledPaths(cron: string, scheduledTime: number): string[] {
  switch (cron) {
    case '0 1 * * *': {
      // Use the event's intended time, not execution time: delayed events must
      // still make the same monthly decision. At 01:00 UTC the Bangkok date agrees.
      const scheduledAt = new Date(scheduledTime);
      if (!Number.isFinite(scheduledAt.getTime())) throw new Error('Invalid scheduled event time');
      return scheduledAt.getUTCDate() === 1
        ? ['/api/send-overdue-digest', '/api/send-monthly-report']
        : ['/api/send-overdue-digest'];
    }
    case '0 2 * * *': return ['/api/close-expired-accounts'];
    default: return [];
  }
}
