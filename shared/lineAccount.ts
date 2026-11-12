// Accounts made from LINE (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย"): no email is asked, so the account carries a
// made-up address in a reserved domain that can never receive mail (".invalid", RFC 2606). Nothing is ever sent to it;
// screens show "บัญชี LINE" in its place.

export const LINE_ONLY_DOMAIN = 'line.krarok.invalid';

export function isLineOnlyEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${LINE_ONLY_DOMAIN}`);
}
