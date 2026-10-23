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
