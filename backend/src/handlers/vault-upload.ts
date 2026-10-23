import { withGuard, HttpError, readRawBody } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { hasProAccess, resolveVaultScope, storeVaultFile, vaultMetaSchema } from '../services/vault.js';
import { VAULT_MAX_BYTES } from '../../../shared/vault.js';

// Upload one file to the document vault. The body is the raw file; what it is (kind, linked job,
// original name) travels in the X-Vault-Meta header as URI-encoded JSON.
export default withGuard(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  const scope = await resolveVaultScope(req, user);
  await rateLimit('vault-upload', user.id, 30, 60);
  if (!(await hasProAccess(user))) throw new HttpError(402, 'คลังเอกสารเป็นฟีเจอร์สำหรับสมาชิก Pro', 'pro_required');
  let meta: unknown;
  try { meta = JSON.parse(decodeURIComponent(String(req.headers['x-vault-meta'] || ''))); }
  catch { throw new HttpError(400, 'ข้อมูลไฟล์ไม่ถูกต้อง'); }
  const parsed = vaultMetaSchema.safeParse(meta);
  if (!parsed.success) throw new HttpError(400, 'ข้อมูลไฟล์ไม่ถูกต้อง');
  const body = await readRawBody(req, VAULT_MAX_BYTES);
  res.status(201).json({ file: await storeVaultFile(scope, user, body, parsed.data) });
});
