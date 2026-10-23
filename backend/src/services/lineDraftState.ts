import { lineDraftKey, type DraftKind, type StoredLineDraft } from './lineDraftReview.js';

const DRAFT_TTL_MS = 15 * 60 * 1000;
const RESOLUTION_RETENTION_MS = 20 * 60 * 1000;
const RESOLUTION_KEY = /^lineDraftResolved_(?:job|expense)_[a-f0-9]{16}$/;

function resolutionKey(kind: DraftKind, stored: StoredLineDraft): string {
  return `lineDraftResolved_${kind}_${stored.operationKey || lineDraftKey(kind, stored)}`;
}

/** A resolution belongs to one draft, never to the mutable "latest draft" slot. */
export function isActiveLineDraft(
  kind: DraftKind,
  stored: StoredLineDraft | undefined,
  privateState: Readonly<Record<string, unknown>>,
  now = Date.now(),
): boolean {
  if (!stored || !Number.isFinite(now)) return false;
  const createdAt = Date.parse(stored.createdAt);
  const age = now - createdAt;
  if (!Number.isFinite(createdAt) || age < 0 || age >= DRAFT_TTL_MS) return false;
  return !Object.prototype.hasOwnProperty.call(privateState, resolutionKey(kind, stored));
}

/**
 * Merge this patch through cashflow_patch_private. Do not remove a pending-draft
 * slot: another request may already have put a newer draft there. Retired marker
 * keys are safe to remove because their drafts have independently expired.
 */
export function lineDraftResolution(
  kind: DraftKind,
  stored: StoredLineDraft,
  privateState: Readonly<Record<string, unknown>>,
  now = Date.now(),
): { patch: Record<string, number>; remove: string[] } {
  if (!Number.isFinite(now)) throw new RangeError('Invalid draft resolution time');
  const key = resolutionKey(kind, stored);
  const remove = Object.entries(privateState)
    .filter(([name, timestamp]) => name !== key && RESOLUTION_KEY.test(name)
      && typeof timestamp === 'number' && Number.isFinite(timestamp)
      && timestamp >= 0 && now - timestamp >= RESOLUTION_RETENTION_MS)
    .map(([name]) => name);
  return { patch: { [key]: now }, remove };
}
