// "ย้ายข้อมูลเข้าแอป" offered on an empty overview (owner, 2026-11-04: a friend did not know the import existed). The
// card shows while the account has no jobs and no expenses, until the person presses ไม่ต้อง or answers ไม่มี to the
// last onboarding question ("ถ้าเขาไม่ต้องการก็โอเค"). Kept on this device only: browser storage may be unavailable,
// and then the card simply shows again next time.

const key = (accountId: string) => `krarok.importInvite.${accountId}`;

export function importInviteDismissed(accountId: string): boolean {
  try { return localStorage.getItem(key(accountId)) === 'no'; } catch { return false; }
}

export function dismissImportInvite(accountId: string): void {
  try { localStorage.setItem(key(accountId), 'no'); } catch { /* hidden for this visit only */ }
}

/** An account of one's own with nothing recorded yet. */
export function shouldOfferImport(input: { jobs: number; expenses: number; dismissed: boolean; guest: boolean; groupWorkspace: boolean }): boolean {
  return !input.guest && !input.groupWorkspace && !input.dismissed && input.jobs === 0 && input.expenses === 0;
}
