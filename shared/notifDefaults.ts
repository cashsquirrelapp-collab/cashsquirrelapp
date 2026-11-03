// Which notifications are on when the account never touched their switch. Shared by Settings, the scheduled job and เลขา
// so all three agree.

/** The monthly 50 ทวิ reminder in LINE: on unless the account turned it off (owner, 2026-11-03: on for Pro accounts with
 *  LINE linked; "ถ้า user ไม่ต้องการให้เตือน ... เราแค่ไม่ต้องเตือน"). Before 2026-11-03 it was off until turned on. */
export function wht50ReminderOn(settings: { wht50ReminderEnabled?: boolean } | null | undefined): boolean {
  return settings?.wht50ReminderEnabled !== false;
}
