import React from 'react';
import { apiJson } from '../../../services/api';
import { tr } from '../../../i18n/tr';
import './signups.css';

// "มีผู้สมัครแล้ว {จำนวน} คน · มาเริ่มจัดการเรื่องเงินไปด้วยกัน" (owner, 2026-10-29), above the start button under the
// price. The number is the real total from /api/public-stats (only the total; the server counts at most once a minute).
// The page asks again every 60 seconds while it is open and in view; it is not called live or real time. A new total
// rolls the digits from the old number to the new one (never from zero). While the first answer is on its way the line
// keeps its room; if there is no real total, no number is shown at all (never a 0), and a later failure keeps the last
// real one.

const POLL_MS = 60_000;
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function useSignupCount() {
  const [count, setCount] = React.useState<number | null>(null);
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    let last = 0;
    const load = async () => {
      last = Date.now();
      try {
        const reply = await apiJson<{ signups?: unknown }>('/api/public-stats');
        const value = reply.signups;
        if (alive && typeof value === 'number' && Number.isSafeInteger(value) && value > 0) setCount(value);
      } catch { /* the last real total stays; with none, no number is shown */ }
      if (alive) setSettled(true);
    };
    load();
    const tick = () => { if (document.visibilityState === 'visible' && Date.now() - last >= POLL_MS - 1000) load(); };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  return { count, settled };
}

/** The number on rolling wheels: each digit slides to its new place; a digit keeps its wheel as the number grows. */
function Odometer({ value }: { value: number }) {
  const chars = [...value.toLocaleString('en-US')];
  return (
    <span className="cl-odo" aria-hidden="true">
      {chars.map((char, at) => {
        const place = chars.length - at;
        return /\d/.test(char)
          ? <span key={`d${place}`} className="cl-odo-wheel"><span className="cl-odo-strip" style={{ transform: `translateY(${-Number(char) * 10}%)` }}>{DIGITS.map(digit => <span key={digit}>{digit}</span>)}</span></span>
          : <span key={`s${place}`} className="cl-odo-sep">{char}</span>;
      })}
    </span>
  );
}

export function SignupCount() {
  const { count, settled } = useSignupCount();
  const [changed, setChanged] = React.useState(0);
  const previous = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (count !== null && previous.current !== null && count !== previous.current) setChanged(value => value + 1);
    previous.current = count;
  }, [count]);
  if (settled && count === null) {
    return (
      <div className="cl-signups is-plain">
        <span className="cl-signups-mark" aria-hidden="true"><img src="/kv/symbol.svg" alt="" /></span>
        <span className="cl-signups-text"><span className="cl-signups-sub">{tr('มาเริ่มจัดการเรื่องเงินไปด้วยกัน')}</span></span>
      </div>
    );
  }
  const [before, after] = tr('มีผู้สมัครแล้ว {0} คน', '\u0000').split('\u0000');
  return (
    <div className={`cl-signups${count === null ? ' is-waiting' : ''}`}>
      <span key={changed} className={`cl-signups-mark${changed ? ' is-new' : ''}`} aria-hidden="true"><img src="/kv/symbol.svg" alt="" /></span>
      <span className="cl-signups-text">
        {count === null
          ? <span className="cl-signups-count is-wait" aria-hidden="true" />
          : (
            <span className="cl-signups-count">
              <span className="sr-only">{tr('มีผู้สมัครแล้ว {0} คน', count.toLocaleString('en-US'))}</span>
              <span aria-hidden="true">{before.trim()} <Odometer value={count} /> {after.trim()}</span>
            </span>
          )}
        <span className="cl-signups-sub">{tr('มาเริ่มจัดการเรื่องเงินไปด้วยกัน')}</span>
      </span>
    </div>
  );
}
