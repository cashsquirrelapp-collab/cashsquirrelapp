import { getSupabaseAdmin } from '../config/supabase.js';
export const REPORTS_BUCKET = 'monthly-reports';
export async function ensurePrivateReportBucket(): Promise<void> {
  const storage = getSupabaseAdmin().storage;
  const options = { public: false, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] };
  const found = await storage.getBucket(REPORTS_BUCKET);
  if (found.error) {
    if (String(found.error.statusCode) !== '404' && !/not found/i.test(found.error.message)) throw found.error;
    const created = await storage.createBucket(REPORTS_BUCKET, options);
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  }
  const updated = await storage.updateBucket(REPORTS_BUCKET, options);
  if (updated.error) throw updated.error;
}

/**
 * The bucket check for one run of the monthly report (2026-11-01). Workers Free allows 50 outgoing requests per run and
 * the check costs two, so checking before every account's upload held a run to about five accounts. The returned
 * function checks once and shares the answer; after a failure the next call checks again.
 */
export function bucketCheckOnce(check: () => Promise<void> = ensurePrivateReportBucket): () => Promise<void> {
  let pending: Promise<void> | null = null;
  return () => (pending ??= check().catch(error => { pending = null; throw error; }));
}
