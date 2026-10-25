import { validateChanges, type Change } from '../../../shared/validation.js';
import { HttpError } from '../http/guard.js';

export interface AssistantDocumentQuota {
  unlimited(userId: string): Promise<boolean>;
  claim(userId: string, count: number): Promise<string[] | null>;
  release(keys: string[]): Promise<void>;
  apply(userId: string, changes: Change[]): Promise<boolean>;
}

/** Same quota and rollback policy as /api/data; edits and deletes never consume a document slot. */
export async function applyWithDocumentQuota(userId: string, input: unknown[], deps: AssistantDocumentQuota): Promise<boolean> {
  const changes = validateChanges(input);
  const count = changes.filter(change => change.table === 'cashflow_invoices' && change.op === 'set' && change.version === null).length;
  let slots: string[] = [];
  if (count && !await deps.unlimited(userId)) {
    const claimed = await deps.claim(userId, count);
    if (!claimed) throw new HttpError(402, 'สร้างเอกสารฟรีครบ 10 ฉบับในเดือนนี้แล้ว อัปเกรดเป็น Pro เพื่อสร้างเพิ่ม', 'document_quota_exceeded');
    slots = claimed;
  }
  let applied: boolean;
  try { applied = await deps.apply(userId, changes); }
  catch (error) { if (slots.length) await deps.release(slots).catch(() => undefined); throw error; }
  if (!applied && slots.length) await deps.release(slots);
  return applied;
}
