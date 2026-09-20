import type { VercelRequest, VercelResponse } from '../http/types.js';

// LIFF ID is not a secret -- it has to be embedded in client-side JS for liff.init() to work --
// but it's served from an env var instead of hardcoded in public/liff-add.html so it can be
// changed without editing/redeploying the static file.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const liffId = process.env.LIFF_ID;
  if (!liffId) {
    res.status(404).json({ error: 'LIFF_ID not configured' });
    return;
  }
  res.status(200).json({ liffId });
}
