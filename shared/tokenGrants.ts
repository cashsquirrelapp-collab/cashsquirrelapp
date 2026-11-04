// Tokens the owner gives an account by hand (owner, 2026-11-04: "แจกโทเค็นให้กับผู้ที่เข้ามาใช้งานแบบแจกกี่ร้อยกี่ร้อย ... กูจะเอา
// โทเค็นให้กับทีมงานกูไปทดลอง กูจะได้แบบใส่ให้เขาง่าย"). Kept in the account's private state (aiTokenGrants), which only
// server code writes; the account's own snapshot never carries it.

export interface TokenGrant {
  /** Made by the owner's page for each grant, so a repeated click or a retry never gives twice. */
  id: string;
  tokens: number;
  /** When it was given (ISO): the cycle it is added to. */
  at: string;
  /** The owner's own note (a prize, team testing). Shown on the owner's page only. */
  note?: string;
}

/** The most one grant gives, and the most grants an account keeps. */
export const GRANT_MAX_TOKENS = 5000;
export const GRANT_MAX_KEPT = 200;
export const GRANT_NOTE_MAX = 80;

const GRANT_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The grants as stored; anything malformed is left out (never more tokens by mistake). */
export function readGrants(value: unknown): TokenGrant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TokenGrant[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, tokens, at, note } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !GRANT_ID.test(id)) return [];
    if (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens < 1 || tokens > GRANT_MAX_TOKENS) return [];
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return [];
    return [{ id, tokens, at, ...(typeof note === 'string' && note.trim() ? { note: note.trim().slice(0, GRANT_NOTE_MAX) } : {}) }];
  }).slice(-GRANT_MAX_KEPT);
}

export const grantedTotal = (grants: readonly Pick<TokenGrant, 'tokens'>[]) => grants.reduce((sum, grant) => sum + grant.tokens, 0);

/** An account the owner typed: a public ID (SQ-XXXXXXXXXX) or the account's UUID. Null when it is neither. */
export function accountTarget(text: string): { publicId: string } | { userId: string } | null {
  const value = text.trim();
  const publicId = value.toUpperCase().replace(/\s+/g, '');
  if (/^SQ-[0-9A-F]{10}$/.test(publicId)) return { publicId };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return { userId: value.toLowerCase() };
  return null;
}
