// Which notifications are on when the account never touched their switch. Shared by Settings, the scheduled job and เลขา
// so all three agree.

/** The monthly 50 ทวิ reminder in LINE: on unless the account turned it off (owner, 2026-11-03: on for Pro accounts with
 *  LINE linked; "ถ้า user ไม่ต้องการให้เตือน ... เราแค่ไม่ต้องเตือน"). Before 2026-11-03 it was off until turned on. */
/** The daily delivery reminder (เตือนส่งงาน, owner 2026-11-15): until the account sets it, it follows the payment reminder
 *  (แจ้งเตือนเครดิตเทอม), so whoever gets the 08:00 reminder now gets the work due too, and can turn either off alone. */
export function deliveryReminderOn(settings: { deliveryReminderEnabled?: boolean; dailyDigestEnabled?: boolean; enabled?: boolean } | null | undefined): boolean {
  return settings?.deliveryReminderEnabled ?? settings?.dailyDigestEnabled ?? settings?.enabled ?? false;
}

export function wht50ReminderOn(settings: { wht50ReminderEnabled?: boolean } | null | undefined): boolean {
  return settings?.wht50ReminderEnabled !== false;
}
