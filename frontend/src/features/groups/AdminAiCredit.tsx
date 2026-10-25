import { useEffect, useState } from 'react';
import { AlertTriangle, CircleAlert, ExternalLink, Save } from 'lucide-react';
import type { AiCreditSnapshot, CreditProvider, CreditStatus } from '../../../../shared/aiCredit';
import { uiSurface } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { adminAiCreditApi } from '../../services/adminAiCredit';
import { secondary } from './groupUi';

// เครดิต AI และเงินสำรอง (owner, 2026-10-25: "ต้องมีเงินสำรองประมาณนี้เพื่อไปเติม API ของตัวนี้ ... ให้มันบาลานซ์ ไม่ใช่ว่า
// หมดแล้วค่อยเติม"). Each provider's estimated credit left (the balance the owner recorded − what the app measured
// since), the days it lasts at the recent pace, the reserve for 30 days and what to top up. The owner records a new
// balance after each top-up. LINE warns when a week is left, or at once when a provider says the credit is out.

type Copy = (th: string, en: string) => string;
const REFRESH_MS = 5 * 60_000;
const NAME: Record<CreditProvider, string> = { anthropic: 'Claude (Anthropic)', google: 'Gemini (Google)' };
const CONSOLE: Record<CreditProvider, string> = { anthropic: 'https://console.anthropic.com/settings/billing', google: 'https://aistudio.google.com/usage' };

function useMoney(language: string, rate4: number | null) {
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const usd = (micro: number) => `$${(micro / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const both = (micro: number) => rate4 === null ? usd(micro) : `${usd(micro)} (฿${Math.round((micro / 1_000_000) * (rate4 / 10_000)).toLocaleString(locale)})`;
  const date = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
  return { usd, both, date };
}

const STATUS: Record<CreditStatus['status'], [string, string, string]> = {
  ok: ['พอใช้', 'Enough', 'bg-brand-green-bg text-brand-green-acc'],
  watch: ['ควรเติมเร็ว ๆ นี้', 'Top up soon', 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'],
  low: ['ใกล้หมด', 'Running low', 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300'],
  out: ['หมดหรือใช้ไม่ได้', 'Out or blocked', 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300'],
  unknown: ['ยังไม่ได้บันทึกยอด', 'No balance recorded', 'border border-brand-border text-brand-muted'],
};

/** A strip above the admin tabs when a provider is running low or out (shown on every tab). */
export function AiCreditBanner({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const { language } = useLanguage();
  const copy: Copy = (th, en) => language === 'th' ? th : en;
  const [snapshot, setSnapshot] = useState<AiCreditSnapshot | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => { if (!document.hidden) adminAiCreditApi.get(userId, controller.signal).then(setSnapshot).catch(() => undefined); };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [userId]);
  const urgent = snapshot?.providers.filter(status => status.status === 'low' || status.status === 'out') ?? [];
  if (!urgent.length) return null;
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-200">
    <p className="flex min-w-0 items-start gap-2 leading-relaxed"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{urgent.map(status => status.issues.length
      ? copy(`${NAME[status.provider]} แจ้งว่าเครดิตหรือโควตาไม่พอแล้ว`, `${NAME[status.provider]} says its credit or quota has run out`)
      : status.status === 'out' ? copy(`${NAME[status.provider]} เครดิตน่าจะหมดแล้ว`, `${NAME[status.provider]} credit is probably used up`)
        : copy(`${NAME[status.provider]} เหลือใช้ได้อีกราว ${status.runwayDays} วัน`, `${NAME[status.provider]} lasts about ${status.runwayDays} more days`)).join(' · ')}</span></p>
    <button type="button" className={secondary} onClick={onOpen}>{copy('ดูและบันทึกยอด', 'View and record')}</button>
  </div>;
}

function ProviderCard({ status, rate4, copy, money, onSave }: { status: CreditStatus; rate4: number | null; copy: Copy; money: ReturnType<typeof useMoney>; onSave: (provider: CreditProvider, balanceUsd: number, note: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = STATUS[status.status];
  const save = async () => {
    const amount = Number(value.replace(/[,$\s]/g, ''));
    if (!Number.isFinite(amount) || amount < 0 || amount >= 1_000_000 || value.trim() === '') { setError(copy('กรอกยอดเป็นดอลลาร์ เช่น 25.50', 'Enter the balance in dollars, e.g. 25.50')); return; }
    setBusy(true); setError('');
    try { await onSave(status.provider, amount, note.trim()); setValue(''); setNote(''); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const id = `credit-${status.provider}`;
  return <section className="grid min-w-0 content-start gap-3 rounded-xl border border-brand-border/70 p-4" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 id={`${id}-title`} className="text-[14px] font-semibold">{NAME[status.provider]}</h4>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${label[2]}`}>{copy(label[0], label[1])}</span>
    </div>
    {status.issues.length > 0 && <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 dark:bg-red-950/20 dark:text-red-300"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{copy(`ผู้ให้บริการแจ้งปัญหาการเงิน ${status.issues.reduce((sum, item) => sum + item.times, 0)} ครั้งใน 24 ชั่วโมง ล่าสุด ${money.date(status.issues[0].lastAt)}`, `The provider reported a billing problem ${status.issues.reduce((sum, item) => sum + item.times, 0)} times in 24 hours, last ${money.date(status.issues[0].lastAt)}`)}</span></p>}
    <div>
      <p className="text-xs text-brand-muted">{copy('เครดิตคงเหลือโดยประมาณ', 'Estimated credit left')}</p>
      <p className="mt-1 break-words text-xl font-semibold tabular-nums">{status.remainingMicro === null ? copy('ยังไม่ทราบ', 'Not known yet') : status.remainingMicro <= 0 ? copy('หมดแล้ว', 'Used up') : money.both(status.remainingMicro)}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{status.recorded
        ? copy(`บันทึกไว้ ${money.usd(status.recorded.balanceMicro)} เมื่อ ${money.date(status.recorded.at)} · ใช้ไปแล้ว ${money.usd(status.spentSinceMicro ?? 0)}`, `Recorded ${money.usd(status.recorded.balanceMicro)} on ${money.date(status.recorded.at)} · used since ${money.usd(status.spentSinceMicro ?? 0)}`)
        : status.provider === 'google'
          ? copy('ถ้าบัญชี Google ตัดบัตรรายเดือน ไม่ต้องบันทึก ดูยอดที่ต้องเตรียมจ่ายด้านล่างแทน', 'If Google bills your card monthly, nothing to record: see what to keep ready below')
          : copy('บันทึกยอดจากหน้า Billing ของ console เพื่อให้ระบบนับถอยหลังให้', 'Record the balance from the console’s Billing page so the app can count down')}</p>
    </div>
    <dl className="grid gap-1.5 text-[13px]">
      {[
        [copy('ใช้ได้อีกราว', 'Lasts about'), status.runwayDays === null ? '—' : copy(`${status.runwayDays} วัน${status.runOutOn ? ` (ถึง ${money.date(status.runOutOn)})` : ''}`, `${status.runwayDays} days${status.runOutOn ? ` (to ${money.date(status.runOutOn)})` : ''}`)],
        [copy('ใช้ต่อวันตอนนี้', 'Daily pace now'), money.usd(status.dailyMicro)],
        [copy('ใช้ 7 วัน / 30 วันล่าสุด', 'Last 7 / 30 days'), `${money.usd(status.spend7Micro)} / ${money.usd(status.spend30Micro)}`],
        [copy('เงินสำรองที่ควรมี (30 วัน +30%)', 'Reserve to keep (30 days +30%)'), money.both(status.reserve30Micro)],
        [copy('ควรเติมเพิ่ม', 'Top up'), status.topUpMicro === null ? '—' : status.topUpMicro === 0 ? copy('ยังไม่ต้องเติม', 'Not needed yet') : money.both(status.topUpMicro)],
      ].map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3"><dt className="text-brand-muted">{k}</dt><dd className="text-right font-medium tabular-nums">{v}</dd></div>)}
    </dl>
    <div className="grid gap-2 border-t border-brand-border/60 pt-3">
      <label className="text-[12px] font-medium text-brand-muted" htmlFor={`${id}-amount`}>{copy('บันทึกยอดคงเหลือจากหน้า console (ดอลลาร์)', 'Record the balance shown in the console (USD)')}</label>
      <div className="flex flex-wrap gap-2">
        <input id={`${id}-amount`} className="ui-input !w-32" inputMode="decimal" placeholder="25.00" value={value} onChange={event => setValue(event.target.value)} />
        <input id={`${id}-note`} className="ui-input min-w-0 flex-1" maxLength={200} placeholder={copy('หมายเหตุ เช่น เติม $20', 'Note, e.g. topped up $20')} aria-label={copy('หมายเหตุ', 'Note')} value={note} onChange={event => setNote(event.target.value)} />
        <button type="button" className={secondary} onClick={() => void save()} disabled={busy}><Save size={15} aria-hidden="true" />{copy('บันทึก', 'Save')}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <a className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue-acc" href={CONSOLE[status.provider]} target="_blank" rel="noreferrer">{copy('เปิดหน้ายอดเครดิตของผู้ให้บริการ', 'Open the provider’s billing page')}<ExternalLink size={12} aria-hidden="true" /></a>
    </div>
  </section>;
}

export default function AdminAiCredit({ userId, payingMembers }: { userId: string; payingMembers: number | null }) {
  const { language } = useLanguage();
  const copy: Copy = (th, en) => language === 'th' ? th : en;
  const [snapshot, setSnapshot] = useState<AiCreditSnapshot | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const load = () => { if (!document.hidden) adminAiCreditApi.get(userId, controller.signal).then(result => { setSnapshot(result); setError(''); }).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); }); };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [userId]);
  const money = useMoney(language, snapshot?.rate4 ?? null);
  const save = async (provider: CreditProvider, balanceUsd: number, note: string) => {
    setSnapshot(await adminAiCreditApi.save(userId, { provider, balanceUsd, ...(note ? { note } : {}) }));
  };
  if (error && !snapshot) return <div className={`${uiSurface} p-5 text-sm text-brand-muted`} role="status">{copy('เครดิต AI', 'AI credit')}: {error === 'unreadable' ? copy('อ่านข้อมูลเครดิต AI ไม่ได้ในตอนนี้', 'AI credit could not be read right now') : error}</div>;
  if (!snapshot) return null;
  const reserve = snapshot.providers.reduce((sum, status) => sum + status.reserve30Micro, 0);
  // Each paid plan's own tokens; members not on one (owner grants, older subscriptions) the default allowance.
  const allowance = snapshot.allowance;
  const worstTokens = payingMembers === null || !allowance ? null
    : (allowance.planTokens ?? 0) + Math.max(0, payingMembers - (allowance.planAccounts ?? 0)) * allowance.proTokens;
  const worst = worstTokens === null || !allowance ? null : Math.round(worstTokens * allowance.tokenUsd * 1_000_000);
  return <section className={`${uiSurface} grid gap-4 p-5 sm:p-6`} aria-labelledby="ai-credit-title">
    <div className="min-w-0">
      <h3 id="ai-credit-title" className="text-[15px] font-semibold">{copy('เครดิต AI และเงินสำรอง', 'AI credit and reserve')}</h3>
      <p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy('ยอดคงเหลือเป็นค่าประมาณ คือยอดที่คุณบันทึกจากหน้า console ลบค่าใช้จ่ายที่ระบบวัดได้ตั้งแต่นั้น · LINE จะเตือนตอน 08:00 เมื่อเหลือใช้ไม่ถึง 7 วัน และเตือนทันทีถ้าผู้ให้บริการแจ้งว่าเครดิตหรือโควตาหมด', 'Credit left is an estimate: the balance you recorded from the console minus what the app measured since · LINE warns at 08:00 when under 7 days are left, and at once when a provider says the credit or quota is out')}</p>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">{snapshot.providers.map(status => <ProviderCard key={status.provider} status={status} rate4={snapshot.rate4} copy={copy} money={money} onSave={save} />)}</div>
    <p className="rounded-xl bg-brand-bg/60 px-4 py-3 text-[13px] leading-relaxed">
      {copy(`ควรเตรียมเงินสำหรับ AI ใน 30 วันข้างหน้า รวม ${money.both(reserve)} ตามการใช้จริงตอนนี้ (+30%)`, `Keep ${money.both(reserve)} ready for AI over the next 30 days at the current pace (+30%)`)}
      {worst !== null && <> · {copy(`ถ้าสมาชิกที่จ่ายเงินทั้ง ${payingMembers} คนใช้เต็มโควตา: ${money.both(worst)}`, `if all ${payingMembers} paying members use their full allowance: ${money.both(worst)}`)}</>}
      {' · '}{copy(`เพดานรวมของแอป: ${money.both(snapshot.ceiling.capMonthlyMicro)} ต่อเดือน`, `the app's own cap: ${money.both(snapshot.ceiling.capMonthlyMicro)} a month`)}
    </p>
  </section>;
}
