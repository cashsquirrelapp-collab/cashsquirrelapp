import { HttpError, withGuard } from '../http/guard.js';
import { countSignups, signupCache } from '../services/signupCount.js';

// GET /api/public-stats: the landing's "มีผู้สมัครแล้ว {จำนวน} คน" (owner, 2026-10-29). Only the total, never a name,
// an email or anything else about an account; visitors never read the accounts table. The total is counted at most
// once a minute (per server instance) and kept, so a page full of visitors does not reach the database; the page asks
// again every 60 seconds. When no real total can be had, this answers 503 and the page shows no number (never a 0).

const read = signupCache(() => countSignups());

export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  let result: Awaited<ReturnType<typeof read>>;
  try {
    result = await read();
  } catch (error) {
    console.error('public-stats: signups could not be counted', (error as Error).message);
    throw new HttpError(503, 'ยังนับจำนวนผู้สมัครไม่ได้');
  }
  res.status(200).json({ signups: result.signups, countedAt: new Date(result.countedAt).toISOString() });
});
