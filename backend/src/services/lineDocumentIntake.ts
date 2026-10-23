import { VAULT_KINDS, VAULT_MAX_BYTES, type VaultKind } from '../../../shared/vault.js';
import { vaultMetaSchema } from './vault.js';

/**
 * Metadata planning only. This module does not download, read/OCR, store, or classify files.
 * Future ingestion must claim a durable operation key, stream LINE content with a hard byte
 * limit, inspect the actual bytes with sniffVaultMime, and persist with storeVaultFile.
 * ready_for_upload means prerequisites passed, never "uploaded" or "saved".
 */
export interface LineDocumentEvent {
  type?: string;
  webhookEventId?: string;
  source?: { type?: string; userId?: string };
  message?: {
    id?: string;
    type?: string;
    fileName?: string;
    fileSize?: number;
    contentProvider?: { type?: string };
  };
}

/**
 * Populate only from verified signature + server-side account, lifecycle and entitlement
 * lookups. Never construct these values from a LINE message, postback, or URL parameter.
 * The first integration is personal-account only; group access needs its own membership check.
 */
export interface LineDocumentOwnership {
  signatureVerified: boolean;
  lineUserId: string;
  userId: string;
  accountWritable: boolean;
  hasVaultAccess: boolean;
  ownedRecords: readonly { id: string; type: 'job' | 'expense'; name: string; client?: string }[];
}

export interface LineDocumentSelection { kind: VaultKind; recordId: string }
export interface LineDocumentMetadata {
  messageId: string;
  eventId: string;
  messageType: 'image' | 'file';
  fileName: string;
  declaredSize: number | null;
}

export type LineDocumentIntakePlan =
  | { status: 'unsupported'; reason: 'message_type' | 'external_content' }
  | { status: 'rejected'; reason: 'unverified_source' | 'invalid_metadata' | 'too_large' | 'account_unavailable' | 'pro_required' | 'record_not_owned' | 'invalid_selection' }
  | { status: 'awaiting_account' }
  | { status: 'awaiting_project'; document: LineDocumentMetadata; userId: string }
  | { status: 'ready_for_upload'; document: LineDocumentMetadata; userId: string; operationKey: string;
      scope: { kind: 'user'; id: string }; meta: { kind: VaultKind; jobId: string; jobName: string; client: string | null; fileName: string } };

/** Fail closed on identity, limits and ownership before any future fetch/storage work. */
export function planLineDocumentIntake(
  event: LineDocumentEvent,
  ownership: LineDocumentOwnership | null,
  selection?: LineDocumentSelection,
): LineDocumentIntakePlan {
  const message = event.message;
  if (event.type !== 'message' || (message?.type !== 'image' && message?.type !== 'file')) {
    return { status: 'unsupported', reason: 'message_type' };
  }
  if (event.source?.type !== 'user' || !event.source.userId) return { status: 'rejected', reason: 'unverified_source' };
  if (!ownership) return { status: 'awaiting_account' };
  if (!ownership.signatureVerified || ownership.lineUserId !== event.source.userId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownership.userId)) {
    return { status: 'rejected', reason: 'unverified_source' };
  }
  if (!ownership.accountWritable) return { status: 'rejected', reason: 'account_unavailable' };
  if (!ownership.hasVaultAccess) return { status: 'rejected', reason: 'pro_required' };
  if (message.contentProvider?.type && message.contentProvider.type !== 'line') {
    return { status: 'unsupported', reason: 'external_content' };
  }
  if (!message.id || !/^[A-Za-z0-9_-]{1,100}$/.test(message.id)
    || !event.webhookEventId || !/^[A-Za-z0-9_-]{1,100}$/.test(event.webhookEventId)) {
    return { status: 'rejected', reason: 'invalid_metadata' };
  }
  const fileSize = message.fileSize;
  if (fileSize !== undefined && (!Number.isSafeInteger(fileSize) || fileSize <= 0)) return { status: 'rejected', reason: 'invalid_metadata' };
  if (fileSize !== undefined && fileSize > VAULT_MAX_BYTES) return { status: 'rejected', reason: 'too_large' };
  if (message.type === 'file' && (typeof message.fileName !== 'string' || !message.fileName.trim()
    || !vaultMetaSchema.shape.fileName.safeParse(message.fileName).success || fileSize === undefined)) {
    return { status: 'rejected', reason: 'invalid_metadata' };
  }
  // MIME and extension are deliberately not inferred from the untrusted name. The archive
  // writer must cleanVaultFileName against the byte-sniffed MIME after the download succeeds.
  const document: LineDocumentMetadata = {
    messageId: message.id, eventId: event.webhookEventId, messageType: message.type,
    fileName: message.type === 'file' ? message.fileName! : `line-image-${message.id}`,
    declaredSize: fileSize ?? null,
  };
  if (!selection) return { status: 'awaiting_project', document, userId: ownership.userId };
  if (!VAULT_KINDS.includes(selection.kind) || !selection.recordId || selection.recordId.length > 120) {
    return { status: 'rejected', reason: 'invalid_selection' };
  }
  const recordType = selection.kind === 'expense' ? 'expense' : 'job';
  const record = ownership.ownedRecords.find(row => row.id === selection.recordId && row.type === recordType);
  if (!record) return { status: 'rejected', reason: 'record_not_owned' };
  const meta = vaultMetaSchema.safeParse({
    kind: selection.kind, jobId: record.id, jobName: record.name, client: record.client || null, fileName: document.fileName,
  });
  if (!record.name || !meta.success) {
    return { status: 'rejected', reason: 'invalid_selection' };
  }
  return {
    status: 'ready_for_upload', document, userId: ownership.userId,
    // Event redelivery uses the same message ID. A storage implementation must enforce this
    // key durably; this pure plan cannot guarantee idempotent writes by itself.
    operationKey: `line-document:${ownership.userId}:${message.id}`,
    scope: { kind: 'user', id: ownership.userId },
    meta: { kind: meta.data.kind, jobId: meta.data.jobId!, jobName: meta.data.jobName!, client: meta.data.client || null, fileName: meta.data.fileName },
  };
}
