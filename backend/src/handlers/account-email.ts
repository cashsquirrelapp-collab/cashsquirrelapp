import { z } from 'zod';
import type { Handler } from '../http/types.js';
import { HttpError, withGuard } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { appOrigin } from '../config/env.js';
import { seal, unseal } from '../security/cookies.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { stagingEmailAllowed } from '../security/staging.js';
import { sendLoginEmailConfirmation } from '../services/gmail.js';
import { isLineOnlyEmail } from '../../../shared/lineAccount.js';
import { isValidPassword } from '../../../shared/passwordPolicy.js';

// /api/account-email — an account made in LINE adds an email and a password, so it also signs in on the website (owner,
// 2026-11-14: "เข้าทางไหนก็ได้ ... ใช้ในเว็บไซต์ได้เหมือนกัน"). POST sets the password and sends a link to the address;
// the address becomes the account's only after that link is opened (GET), so nobody can take an address that is not
// theirs, and the LINE sign-in (which needs a confirmed address) keeps working until then.

type Pending = { purpose: 'add-login-email'; userId: string; email: string; expires: number };
const DAY = 86_400_000;
const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().max(128) }).strict();

export interface AccountEmailDeps {
  user: (req: Parameters<Handler>[0], res: Parameters<Handler>[1]) => Promise<{ id: string; email?: string | null; user_metadata?: Record<string, unknown> }>;
  limit: typeof rateLimit;
  allowed: (email: string) => boolean;
  /** The account already using the address, if any. */
  holder: (email: string) => Promise<string | null>;
  setPassword: (userId: string, password: string) => Promise<void>;
  send: (to: string, name: string | undefined, url: string) => Promise<boolean>;
  current: (userId: string) => Promise<string | null>;
  /** Makes the address the account's sign-in email, confirmed; false when another account took it meanwhile. */
  setEmail: (userId: string, email: string) => Promise<boolean>;
  now: () => number;
}

const taken = (error: { code?: string; status?: number; message?: string } | null) =>
  Boolean(error && (error.code === 'email_exists' || error.status === 422 || /already/i.test(error.message || '')));

const defaults: AccountEmailDeps = {
  user: (req, res) => requireUser(req, res),
  limit: rateLimit,
  allowed: email => stagingEmailAllowed(email),
  async holder(email) {
    const result = await getSupabaseAdmin().from('cashflow_account_snapshot').select('user_id').eq('email', email).maybeSingle();
    if (result.error) throw result.error;
    return (result.data as { user_id?: string } | null)?.user_id ?? null;
  },
  async setPassword(userId, password) {
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  },
  send: sendLoginEmailConfirmation,
  async current(userId) {
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
    if (error) throw error;
    return data.user?.email ?? null;
  },
  async setEmail(userId, email) {
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (taken(error)) return false;
    if (error) throw error;
    return true;
  },
  now: () => Date.now(),
};

export function createAccountEmailHandler(deps: AccountEmailDeps = defaults): Handler {
  return withGuard(async (req, res) => {
    if (req.method === 'GET') {
      const back = (result: string) => { res.status(302); res.setHeader('Location', `${appOrigin()}/settings?loginEmail=${result}`); res.end(); };
      const pending = unseal<Pending>(typeof req.query.token === 'string' ? req.query.token : '');
      if (!pending || pending.purpose !== 'add-login-email' || pending.expires < deps.now()) { back('expired'); return; }
      const email = await deps.current(pending.userId);
      if (email?.toLowerCase() === pending.email) { back('added'); return; }
      // Only an account still signing in through LINE alone: an address added since (another link) is never replaced.
      if (!isLineOnlyEmail(email)) { back('expired'); return; }
      back(await deps.setEmail(pending.userId, pending.email) ? 'added' : 'taken');
      return;
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const user = await deps.user(req, res);
    if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'Account mismatch');
    if (!isLineOnlyEmail(user.email)) throw new HttpError(409, 'บัญชีนี้มีอีเมลสำหรับเข้าสู่ระบบอยู่แล้ว');
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'กรุณาใส่อีเมลให้ถูกต้อง');
    const { email, password } = parsed.data;
    if (!isValidPassword(password)) throw new HttpError(400, 'รหัสผ่านต้องยาว 8–128 ตัวอักษร และมีตัวอักษรกับตัวเลขอย่างน้อยอย่างละ 1 ตัว');
    if (isLineOnlyEmail(email)) throw new HttpError(400, 'กรุณาใส่อีเมลให้ถูกต้อง');
    if (!deps.allowed(email)) throw new HttpError(403, 'เว็บทดสอบรับเฉพาะอีเมลที่อนุญาตไว้');
    await deps.limit('add-login-email', user.id, 5, 3600);
    const holder = await deps.holder(email);
    if (holder && holder !== user.id) throw new HttpError(409, 'อีเมลนี้ใช้กับบัญชีอื่นอยู่แล้ว ถ้าเป็นบัญชีของคุณ ให้เข้าสู่ระบบด้วยอีเมลนั้น แล้วเชื่อม LINE ที่หน้าตั้งค่าแทน');
    await deps.setPassword(user.id, password);
    const token = seal({ purpose: 'add-login-email', userId: user.id, email, expires: deps.now() + DAY } satisfies Pending);
    const meta = user.user_metadata || {};
    const name = [meta.display_name, meta.full_name, meta.name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const sent = await deps.send(email, name, `${appOrigin()}/api/account-email?token=${encodeURIComponent(token)}`);
    if (!sent) throw new HttpError(503, 'ส่งอีเมลยืนยันไม่สำเร็จ กรุณาลองอีกครั้ง');
    res.json({ ok: true });
  }, { csrf: true });
}

export default createAccountEmailHandler();
