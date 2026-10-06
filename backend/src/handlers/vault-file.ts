import { withGuard, HttpError } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { readableVaultFile } from '../services/vault.js';

// Open or download one vault file. Served through the API (never a public link) after checking
// the signed-in user may read it. ?download=1 saves it, otherwise it opens in the browser.
export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (typeof req.query.account === 'string' && req.query.account !== user.id) throw new HttpError(403, 'ไฟล์นี้เป็นของบัญชีอื่น');
  await rateLimit('vault-read', user.id, 240, 60);
  const { row, body } = await readableVaultFile(user, String(req.query.id || ''));
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  const asciiName = row.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
  // Files are private and shown only inside the app.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.send(body);
});
