import { z } from 'zod';
import { withGuard, HttpError } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { deleteVaultFile, listVaultFiles, resolveVaultScope, updateVaultFile, vaultUpdateSchema } from '../services/vault.js';

// Document vault: list the workspace's files, edit what a file is linked to, or delete it.
const deleteSchema = z.object({ action: z.literal('delete'), id: z.uuid() }).strict();

export default withGuard(async (req, res) => {
  const user = await requireUser(req, res);
  const scope = await resolveVaultScope(req, user);
  if (req.method === 'GET') {
    res.json({ files: await listVaultFiles(scope) });
    return;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  await rateLimit('vault-write', user.id, 60, 60);
  const body = req.body as { action?: unknown };
  if (body?.action === 'delete') {
    const input = deleteSchema.safeParse(body);
    if (!input.success) throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
    await deleteVaultFile(scope, input.data.id);
    res.json({ ok: true });
    return;
  }
  const input = vaultUpdateSchema.safeParse(body);
  if (!input.success) throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง');
  res.json({ file: await updateVaultFile(scope, input.data) });
});
