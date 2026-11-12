import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Coins, FlaskConical, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import type { AdminLookup, AdminTokenGrantLog } from '../../../../shared/adminTeam';
import type { AdminDashboardAccountDetail } from '../../../../shared/groups';
import { GRANT_MAX_TOKENS, GRANT_NOTE_MAX, accountTarget } from '../../../../shared/tokenGrants';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { groupApi } from '../../services/groups';
import { getCurrentAccount } from '../../services/api';
import type { Confirm } from './groupUi';
import './adminTeam.css';

// ทีมงานและโทเคน, the owner's page alone (owner, 2026-11-04: "อีเมลนี้จะมีสิทธิ์ในการให้สิทธิ์แอดมิน ... มึงสังเกต UID ไหม ...
// กูอาจจะแจกโทเค็นให้กับผู้ที่เข้ามาใช้งาน ... กูจะได้แบบใส่ให้เขาง่าย"). One search by UID finds the account; from its card the
// owner gives it tokens or makes it a team admin. Below: the team, and the latest tokens given. The server checks every
// step (admin-users.ts): only the owner's account may do any of it.

type Copy = (th: string, en: string) => string;
const QUICK_AMOUNTS = [100, 200, 500, 1000];

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `grant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function AdminTeamTokens({ userId, triggerConfirm, language, mobile = false }: {
  userId: string; triggerConfirm: Confirm; language: 'th' | 'en'; mobile?: boolean;
}) {
  const copy: Copy = (th, en) => (language === 'th' ? th : en);
  const locale = language === 'th' ? 'th-TH' : 'en-GB';
  const number = (value: number) => value.toLocaleString(locale);
  const day = (value: string) => new Date(value).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
  const when = (value: string) => new Date(value).toLocaleString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const [target, setTarget] = useState('');
  const [found, setFound] = useState<AdminLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [amount, setAmount] = useState('200');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [admins, setAdmins] = useState<AdminDashboardAccountDetail[] | null>(null);
  const [log, setLog] = useState<AdminTokenGrantLog[] | null>(null);
  const [listError, setListError] = useState('');
  // One id per grant being made: a retry after a lost answer sends the same id, and the server gives once.
  const requestId = useRef(newRequestId());
  const lookupAbort = useRef<AbortController | null>(null);

  const loadLists = useCallback((signal?: AbortSignal) => {
    setListError('');
    return Promise.all([
      groupApi.adminDashboardDetails(userId, 'admins', 0, signal).then(result => { if (!signal?.aborted) setAdmins(result.accounts || []); }),
      groupApi.tokenGrants(userId, signal).then(result => { if (!signal?.aborted) setLog(result.grants); }),
    ]).catch(cause => { if (!signal?.aborted) setListError((cause as Error).message); });
  }, [userId]);
  useEffect(() => { const controller = new AbortController(); void loadLists(controller.signal); return () => controller.abort(); }, [loadLists]);
  useEffect(() => () => lookupAbort.current?.abort(), []);

  const lookup = async (text = target) => {
    const value = text.trim();
    setNotice(''); setError('');
    if (!accountTarget(value)) { setFound(null); setLookupError(copy('กรุณาใส่ UID แบบ SQ-XXXXXXXXXX', 'Enter a UID such as SQ-XXXXXXXXXX')); return; }
    lookupAbort.current?.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;
    setLooking(true); setLookupError('');
    try {
      const result = await groupApi.lookupAccount(userId, value, controller.signal);
      if (controller.signal.aborted || getCurrentAccount() !== userId) return;
      setFound(result);
      requestId.current = newRequestId();
    } catch (cause) {
      if (!controller.signal.aborted) { setFound(null); setLookupError((cause as Error).message); }
    } finally {
      if (!controller.signal.aborted) setLooking(false);
    }
  };
  const open = (publicId: string) => { setTarget(publicId); void lookup(publicId); };

  const tokens = Number(amount.replace(/[^\d]/g, ''));
  const amountOk = Number.isInteger(tokens) && tokens >= 1 && tokens <= GRANT_MAX_TOKENS;
  const name = found ? `${found.displayName} (${found.publicId})` : '';

  /** When the tokens about to be given can be used until, in the account's own terms. */
  const lasts = (account: AdminLookup): string => {
    const until = account.tokens?.resetsAt;
    if (account.tokens?.plan === 'pro' && until) return copy(`เพิ่มในรอบบิลนี้ของบัญชี ใช้ได้ถึง ${day(until)} ส่วนที่เหลือไม่ยกไปรอบถัดไป`, `Added to this billing cycle, usable until ${day(until)}; what is left does not carry over`);
    if (account.tokens?.plan === 'admin' && until) return copy(`เพิ่มในเดือนนี้ ใช้ได้ถึง ${day(until)}`, `Added to this month, usable until ${day(until)}`);
    return copy('ใช้กับเลขากระรอกได้จนกว่าจะหมด ไม่มีวันหมดอายุ', 'Usable with the assistant until used up; never expires');
  };
  const planWords = (account: AdminLookup): string => {
    const plan = account.tokens?.plan;
    if (!account.tokens) return copy('อ่านสถานะโทเคนไม่ได้ชั่วคราว', 'Token status unavailable');
    if (plan === 'pro') return 'Pro';
    if (plan === 'admin') return copy('แอดมิน · โทเคนรายเดือน', 'Admin · monthly tokens');
    if (plan === 'lapsed') return copy('Pro หมดอายุ · ใช้โทเคนที่เหลือ', 'Pro ended · using what is left');
    if (plan === 'trial') return account.granted > 0 ? copy('ใช้โทเคนที่ได้รับ', 'Using given tokens') : copy('ทดลองใช้เลขากระรอก', 'Trying the assistant');
    return copy('ยังใช้เลขากระรอกไม่ได้ จะใช้ได้เมื่อได้รับโทเคน', 'Cannot use the assistant yet; given tokens open it');
  };
  const roleWords = (account: Pick<AdminLookup, 'role' | 'isOwner'>) => (account.isOwner ? copy('ผู้ดูแล', 'Owner') : account.role === 'admin' ? copy('แอดมิน', 'Admin') : copy('ผู้ใช้ทั่วไป', 'User'));

  const give = () => {
    if (!found || !amountOk || busy) return;
    const account = found;
    triggerConfirm(
      copy('แจกโทเคน', 'Give tokens'),
      copy(`แจก ${number(tokens)} โทเคนให้ ${name} ${lasts(account)}`, `Give ${number(tokens)} tokens to ${name}. ${lasts(account)}`),
      async () => {
        setBusy(true); setNotice(''); setError('');
        try {
          const result = await groupApi.grantTokens(userId, account.userId, tokens, note, requestId.current);
          if (getCurrentAccount() !== userId) return;
          setFound(result.account);
          requestId.current = newRequestId();
          setNote('');
          const left = result.account.tokens?.left;
          setNotice(copy(`แจก ${number(tokens)} โทเคนให้ ${result.account.displayName} แล้ว${left !== null && left !== undefined ? ` · ตอนนี้ใช้ได้ ${number(left)} โทเคน` : ''}`,
            `Gave ${number(tokens)} tokens to ${result.account.displayName}${left !== null && left !== undefined ? ` · ${number(left)} tokens available now` : ''}`));
          void loadLists();
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setBusy(false);
        }
      },
    );
  };

  const setRole = (account: Pick<AdminLookup, 'userId' | 'displayName' | 'publicId'>, role: 'admin' | 'user') => {
    if (busy) return;
    const label = `${account.displayName} (${account.publicId})`;
    triggerConfirm(
      role === 'admin' ? copy('ให้สิทธิ์แอดมิน', 'Make admin') : copy('ถอดสิทธิ์แอดมิน', 'Remove admin'),
      role === 'admin'
        ? copy(`${label} จะเปิดหน้าแอดมินได้: ผู้ใช้งาน การใช้ฟีเจอร์ รายบัญชี ผู้ใช้ใหม่ ข้อความจากผู้ใช้ (ตอบได้) และส่งข้อความถึงผู้ใช้ จะไม่เห็นรายได้ กำไรและต้นทุน หรือภาพรวมการเงิน ไม่ได้ฟีเจอร์ Pro และไม่ได้โทเคน เว้นแต่คุณแจกให้`,
          `${label} will open the admin page: activity, features, accounts, new users, messages (with replies) and messages to everyone; never revenue, profit and cost, or the money overview. No Pro features and no tokens unless you give them.`)
        : copy(`${label} จะเปิดหน้าแอดมินไม่ได้อีก และกลับเป็นผู้ใช้ทั่วไป`, `${label} will no longer open the admin page and becomes a regular user.`),
      async () => {
        setBusy(true); setNotice(''); setError('');
        try {
          await groupApi.setRole(userId, account.userId, role);
          if (getCurrentAccount() !== userId) return;
          setNotice(role === 'admin' ? copy(`ให้สิทธิ์แอดมินแก่ ${account.displayName} แล้ว`, `${account.displayName} is now an admin`) : copy(`ถอดสิทธิ์แอดมินของ ${account.displayName} แล้ว`, `${account.displayName} is no longer an admin`));
          if (found?.userId === account.userId) setFound({ ...found, role });
          void loadLists();
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setBusy(false);
        }
      },
    );
  };

  // ฟีเจอร์ทดลอง (shared/labs.ts; owner, 2026-11-12): a tester sees Settings › ฟีเจอร์ทดลอง and turns new features on there.
  const setTester = (account: AdminLookup, on: boolean) => {
    if (busy) return;
    const label = `${account.displayName} (${account.publicId})`;
    triggerConfirm(
      on ? copy('ตั้งเป็นบัญชีทดสอบ', 'Make a tester') : copy('เลิกเป็นบัญชีทดสอบ', 'Stop testing'),
      on
        ? copy(`${label} จะเห็นส่วนฟีเจอร์ทดลองในหน้าตั้งค่า และเปิดลองฟีเจอร์ใหม่ที่สร้างเสร็จแล้วได้เอง`, `${label} will see ฟีเจอร์ทดลอง in Settings and can turn on new features that are ready.`)
        : copy(`${label} จะไม่เห็นส่วนฟีเจอร์ทดลอง และฟีเจอร์ทดลองที่เปิดไว้จะปิดทั้งหมด ข้อมูลในแอปยังอยู่ครบ`, `${label} will no longer see ฟีเจอร์ทดลอง and every experimental feature turns off. Data in the app stays.`),
      async () => {
        setBusy(true); setNotice(''); setError('');
        try {
          const result = await groupApi.setTester(userId, account.userId, on);
          if (getCurrentAccount() !== userId) return;
          setFound(result.account);
          setNotice(on ? copy(`ตั้ง ${account.displayName} เป็นบัญชีทดสอบแล้ว`, `${account.displayName} is now a tester`) : copy(`${account.displayName} เลิกเป็นบัญชีทดสอบแล้ว`, `${account.displayName} is no longer a tester`));
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setBusy(false);
        }
      },
    );
  };

  // ── Parts ─────────────────────────────────────────────────────────────────────────────────────
  const section = (key: string, title: string, sub: string | null, children: ReactNode) => (mobile ? (
    <div key={key} className="atk-mobile-part">
      <div className="ksm-group-title"><h3>{title}</h3></div>
      <div className="ksm-panel atk-panel">{sub && <p className="atk-sub">{sub}</p>}{children}</div>
    </div>
  ) : (
    <section key={key} className={`${uiSurface} atk-section`}>
      <h2 className="atk-title">{title}</h2>
      {sub && <p className="atk-sub">{sub}</p>}
      {children}
    </section>
  ));

  const finder = (
    <form className="atk-find" onSubmit={event => { event.preventDefault(); void lookup(); }}>
      <label className="atk-field atk-grow">
        <span>{copy('UID ของบัญชี', 'Account UID')}</span>
        <input className="ui-input" value={target} onChange={event => setTarget(event.target.value)} placeholder="SQ-XXXXXXXXXX" maxLength={64}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="team-lookup-input" />
      </label>
      <button type="submit" className="ui-button ui-button-secondary atk-find-button" disabled={looking || !target.trim()} data-testid="team-lookup">
        <Search size={16} aria-hidden="true" />{looking ? copy('กำลังค้นหา…', 'Searching…') : copy('ค้นหาบัญชี', 'Find account')}
      </button>
    </form>
  );

  const card = found && (
    <div className="atk-card" data-testid="team-account">
      <div className="atk-card-head">
        <span className="atk-avatar" aria-hidden="true">{found.displayName.slice(0, 1).toUpperCase()}</span>
        <div className="atk-grow atk-min">
          <b className="atk-name">{found.displayName}</b>
          <small className="atk-meta">{found.publicId} · {copy('สมัคร', 'Joined')} {found.createdAt ? day(found.createdAt) : '—'}</small>
        </div>
        <span className={`atk-role${found.role === 'admin' ? ' is-admin' : ''}`}>{roleWords(found)}</span>
      </div>
      <dl className="atk-facts">
        <div><dt>{copy('เลขากระรอก', 'Assistant')}</dt><dd>{planWords(found)}</dd></div>
        <div><dt>{copy('โทเคนที่ใช้ได้ตอนนี้', 'Tokens available now')}</dt><dd className="atk-num">{found.tokens?.left !== null && found.tokens?.left !== undefined ? `${number(found.tokens.left)}${found.tokens.limit ? ` / ${number(found.tokens.limit)}` : ''}` : '—'}</dd></div>
        <div><dt>{copy('ได้รับจากผู้ดูแลทั้งหมด', 'Given by the owner in all')}</dt><dd className="atk-num">{number(found.granted)}</dd></div>
      </dl>

      <div className="atk-give">
        <h3 className="atk-subhead"><Coins size={16} aria-hidden="true" />{copy('แจกโทเคน', 'Give tokens')}</h3>
        <div className="atk-chips" role="group" aria-label={copy('จำนวนที่ใช้บ่อย', 'Common amounts')}>
          {QUICK_AMOUNTS.map(value => (
            <button key={value} type="button" className={`atk-chip${tokens === value ? ' is-on' : ''}`} aria-pressed={tokens === value} onClick={() => setAmount(String(value))}>{number(value)}</button>
          ))}
        </div>
        <div className="atk-give-row">
          <label className="atk-field atk-amount">
            <span>{copy('จำนวนโทเคน', 'Tokens')}</span>
            <input className="ui-input" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value.replace(/[^\d]/g, '').slice(0, 5))} data-testid="team-amount"
              aria-invalid={!amountOk} />
          </label>
          <label className="atk-field atk-grow">
            <span>{copy('บันทึกถึงตัวเอง (ไม่บังคับ)', 'Note to yourself (optional)')}</span>
            <input className="ui-input" value={note} maxLength={GRANT_NOTE_MAX} onChange={event => setNote(event.target.value)} placeholder={copy('เช่น รางวัลกิจกรรม, ทีมงานทดลองใช้', 'e.g. prize, team testing')} data-testid="team-note" />
          </label>
        </div>
        <p className="atk-hint">{amountOk ? lasts(found) : copy(`ใส่ได้ 1–${number(GRANT_MAX_TOKENS)} โทเคนต่อครั้ง`, `1–${number(GRANT_MAX_TOKENS)} tokens at a time`)}</p>
        <button type="button" className="ui-button ui-button-primary atk-primary" disabled={!amountOk || busy} onClick={give} data-testid="team-give">
          <Coins size={16} aria-hidden="true" />{amountOk ? copy(`แจก ${number(tokens)} โทเคน`, `Give ${number(tokens)} tokens`) : copy('แจกโทเคน', 'Give tokens')}
        </button>
      </div>

      {!found.isOwner && found.userId !== userId && (
        <div className="atk-rights">
          <div className="atk-grow atk-min">
            <h3 className="atk-subhead"><ShieldCheck size={16} aria-hidden="true" />{copy('สิทธิ์แอดมิน', 'Admin rights')}</h3>
            <p className="atk-hint">{found.role === 'admin'
              ? copy('บัญชีนี้เป็นแอดมินอยู่ ดูหลังบ้านได้ ยกเว้นรายได้ กำไรและต้นทุน และภาพรวมการเงิน ไม่ได้ฟีเจอร์ Pro ใช้เลขากระรอกได้เมื่อคุณแจกโทเคนให้', 'This account is an admin: the back office without revenue, profit and cost, or the money overview. No Pro features; the assistant works on tokens you give.')
              : copy('ให้ทีมงานดูหลังบ้านได้ โดยไม่เห็นรายได้ กำไรและต้นทุน และภาพรวมการเงิน ไม่ได้ฟีเจอร์ Pro และไม่ได้โทเคน เว้นแต่คุณแจกให้', 'Lets a team member see the back office without revenue, profit and cost, or the money overview. No Pro features and no tokens unless you give them.')}</p>
          </div>
          <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={() => setRole(found, found.role === 'admin' ? 'user' : 'admin')} data-testid="team-role">
            {found.role === 'admin' ? <><ShieldOff size={16} aria-hidden="true" />{copy('ถอดสิทธิ์แอดมิน', 'Remove admin')}</> : <><ShieldCheck size={16} aria-hidden="true" />{copy('ให้สิทธิ์แอดมิน', 'Make admin')}</>}
          </button>
        </div>
      )}

      {!found.isOwner && (
        <div className="atk-rights">
          <div className="atk-grow atk-min">
            <h3 className="atk-subhead"><FlaskConical size={16} aria-hidden="true" />{copy('บัญชีทดสอบ (ฟีเจอร์ทดลอง)', 'Tester (experimental features)')}</h3>
            <p className="atk-hint">{found.labsTester
              ? copy('เป็นบัญชีทดสอบอยู่: เห็นส่วนฟีเจอร์ทดลองในหน้าตั้งค่า และเปิดลองฟีเจอร์ใหม่ได้เอง', 'A tester: sees ฟีเจอร์ทดลอง in Settings and turns new features on there.')
              : copy('ให้บัญชีนี้ลองฟีเจอร์ใหม่ก่อนเปิดให้ทุกคน ลูกค้าทั่วไปจะไม่เห็นส่วนนี้', 'Lets this account try new features before everyone. Other customers never see them.')}</p>
          </div>
          <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={() => setTester(found, !found.labsTester)} data-testid="team-tester">
            <FlaskConical size={16} aria-hidden="true" />{found.labsTester ? copy('เลิกเป็นบัญชีทดสอบ', 'Stop testing') : copy('ตั้งเป็นบัญชีทดสอบ', 'Make a tester')}
          </button>
        </div>
      )}

      {found.grants.length > 0 && (
        <details className="atk-history">
          <summary>{copy(`โทเคนที่บัญชีนี้ได้รับ ${found.grants.length} ครั้งล่าสุด`, `Latest ${found.grants.length} grants to this account`)}</summary>
          <ul>{found.grants.map(grant => <li key={grant.id}><span className="atk-num">+{number(grant.tokens)}</span><span className="atk-grow atk-min">{grant.note || '—'}</span><small>{when(grant.at)}</small></li>)}</ul>
        </details>
      )}
    </div>
  );

  const status = (
    <>
      {notice && <p className="atk-notice" role="status" data-testid="team-notice">{notice}</p>}
      {error && <p className="atk-error" role="alert">{error}</p>}
    </>
  );

  const team = admins === null && !listError ? <SkeletonBlock className="h-20 w-full rounded-xl" /> : (
    <ul className="atk-list" data-testid="team-admins">
      {(admins || []).map(admin => (
        <li key={admin.userId}>
          <button type="button" className="atk-row" onClick={() => open(admin.publicId)} aria-label={copy(`เปิดบัญชี ${admin.displayName}`, `Open ${admin.displayName}`)}>
            <span className="atk-avatar is-small" aria-hidden="true">{admin.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="atk-grow atk-min"><b className="atk-name">{admin.displayName}{admin.userId === userId ? copy(' (คุณ)', ' (you)') : ''}</b><small className="atk-meta">{admin.publicId}{admin.isOnline ? ` · ${copy('ออนไลน์', 'Online')}` : ''}</small></span>
            <span className="atk-role is-admin">{admin.userId === userId ? copy('ผู้ดูแล', 'Owner') : copy('แอดมิน', 'Admin')}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const history = log === null && !listError ? <SkeletonBlock className="h-20 w-full rounded-xl" /> : log && log.length ? (
    <ul className="atk-list" data-testid="team-log">
      {log.map(entry => (
        <li key={`${entry.userId}:${entry.id}`}>
          <button type="button" className="atk-row" onClick={() => open(entry.publicId)} aria-label={copy(`เปิดบัญชี ${entry.displayName}`, `Open ${entry.displayName}`)}>
            <span className="atk-grow atk-min"><b className="atk-name">{entry.displayName}</b><small className="atk-meta">{entry.publicId}{entry.note ? ` · ${entry.note}` : ''}</small></span>
            <span className="atk-log-side"><b className="atk-num">+{number(entry.tokens)}</b><small>{when(entry.at)}</small></span>
          </button>
        </li>
      ))}
    </ul>
  ) : <p className="atk-empty">{copy('ยังไม่ได้แจกโทเคนให้บัญชีใด', 'No tokens given yet')}</p>;

  return (
    <div className={`atk${mobile ? ' is-mobile' : ''}`}>
      {section('find', copy('ค้นหาบัญชีด้วย UID', 'Find an account by UID'),
        copy('UID คือ User ID ที่ผู้ใช้เห็นในหน้าตั้งค่า (SQ-XXXXXXXXXX) หรือดูได้ในรายบัญชี จากนั้นแจกโทเคนหรือให้สิทธิ์แอดมินจากการ์ดของบัญชีนั้น', 'The UID is the User ID people see in their settings (SQ-XXXXXXXXXX), also listed in Accounts. Then give tokens or admin rights from the account’s card.'),
        <>{finder}{lookupError && <p className="atk-error" role="alert">{lookupError}</p>}{status}{card}</>)}
      {listError && <p className="atk-error" role="alert">{listError}</p>}
      {section('team', copy('ทีมแอดมิน', 'Admin team'),
        copy('แอดมินเห็นผู้ใช้งาน การใช้ฟีเจอร์ รายบัญชี ผู้ใช้ใหม่ ข้อความจากผู้ใช้ และส่งข้อความถึงผู้ใช้ได้ ไม่ได้ฟีเจอร์ Pro และไม่ได้โทเคน เว้นแต่คุณแจกให้ เฉพาะผู้ดูแลเห็นรายได้ กำไรและต้นทุน และภาพรวมการเงิน', 'Admins see activity, features, accounts, new users and messages, and can message everyone. No Pro features and no tokens unless you give them. Only the owner sees revenue, profit and cost, and the money overview.'),
        team)}
      {section('log', copy('โทเคนที่แจกล่าสุด', 'Latest tokens given'), null, history)}
    </div>
  );
}
