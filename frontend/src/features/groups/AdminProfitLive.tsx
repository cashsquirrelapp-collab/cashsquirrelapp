import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleAlert, RefreshCw } from 'lucide-react';
import type { AdminAnalyticsAccount } from '../../../../shared/adminAnalytics';
import type { AccountFigures, AdminProfitLive as ProfitData, Change, Completeness } from '../../../../shared/adminProfit';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { adminProfitLiveApi } from '../../services/adminProfitLive';
import { secondary } from './groupUi';
import AdminUsageTable from './AdminUsageTable';
import AdminAiCredit from './AdminAiCredit';

// กำไรและต้นทุน AI (owner, 2026-10-25: "คำนวณต้นทุน AI ... แบบเรียลไทม์ ... เหมือนของ Stripe"): the monthly report's
// engine worked out live for this month, refreshed every minute while the page is open and on screen, and at once when
// a payment arrives. Every number comes from the server; a figure that is not known says so and is never shown as 0.

type Copy = (th: string, en: string) => string;
const REFRESH_MS = 60_000;
const bangkokMonthKey = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

function useFormat(language: string) {
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const unknown = language === 'th' ? 'ยังไม่ทราบ' : 'Not known yet';
  const money = (satang: number | null | undefined) => satang === null || satang === undefined ? unknown
    : new Intl.NumberFormat(locale, { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(satang / 100);
  const usd = (micro: number) => `$${(micro / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: micro < 1_000_000 ? 4 : 2, maximumFractionDigits: micro < 1_000_000 ? 4 : 2 })}`;
  const count = (n: number | null | undefined) => n === null || n === undefined ? unknown : n.toLocaleString(locale);
  const percent = (bp: number | null | undefined) => bp === null || bp === undefined ? unknown : `${(bp / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  const monthName = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { locale, money, usd, count, percent, monthName, time, unknown };
}

const STATUS: Record<Completeness, [string, string, string]> = {
  COMPLETE: ['ข้อมูลครบ', 'Complete', 'bg-brand-green-bg text-brand-green-acc'],
  PARTIAL: ['ข้อมูลยังไม่ครบบางส่วน', 'Partly incomplete', 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'],
  UNRECONCILED: ['ยอดบางส่วนยังกระทบกันไม่ตรง', 'Not reconciled', 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'],
  FAILED: ['อ่านข้อมูลไม่ได้', 'Could not be read', 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300'],
};

function ChangeChip({ item, copy, percent }: { item: Change; copy: Copy; percent: (bp: number | null) => string }) {
  if (item.kind === 'none') return <span className="text-[11px] text-brand-muted">{copy('ยังไม่มีเดือนก่อนให้เทียบ', 'No last month to compare')}</span>;
  if (item.kind === 'new') return <span className="text-[11px] text-brand-muted">{copy('เริ่มมีในเดือนนี้', 'New this month')}</span>;
  const bp = item.kind === 'same' ? 0 : item.percentBp ?? 0;
  const up = bp > 0;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${bp === 0 ? 'text-brand-muted' : up ? 'text-brand-green-acc' : 'text-red-600 dark:text-red-300'}`}>
    {bp !== 0 && (up ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />)}
    {bp === 0 ? copy('เท่าเดือนก่อน', 'Same as last month') : copy(`${percent(Math.abs(bp))} จากเดือนก่อน`, `${percent(Math.abs(bp))} vs last month`)}</span>;
}

function Tile({ label, value, detail, change }: { label: string; value: string; detail?: string; change?: ReactNode }) {
  return <div className="min-w-0 rounded-xl border border-brand-border/70 bg-brand-bg/50 p-4">
    <p className="text-xs leading-relaxed text-brand-muted">{label}</p>
    <p className="mt-2 break-words text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{value}</p>
    {detail && <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{detail}</p>}
    {change && <div className="mt-1.5">{change}</div>}
  </div>;
}

function Rows({ title, rows }: { title: string; rows: [string, string][] }) {
  return <section className="min-w-0 rounded-xl border border-brand-border/70 p-4">
    <h3 className="text-[13px] font-semibold">{title}</h3>
    <dl className="mt-3 space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-3 text-[13px] leading-relaxed">
      <dt className="min-w-0 text-brand-muted">{label}</dt><dd className="shrink-0 text-right font-medium tabular-nums">{value}</dd></div>)}</dl>
  </section>;
}

export default function AdminProfitLive({ userId, accounts, appDays = 30, liveTick = 0, revision = 0 }: {
  userId: string;
  /** The dashboard's account list: names, public IDs and app use for the table (the report itself has none). */
  accounts?: AdminAnalyticsAccount[];
  /** The days the dashboard's app-use figures cover. */
  appDays?: number;
  liveTick?: number;
  revision?: number;
}) {
  const { language } = useLanguage();
  const copy: Copy = (th, en) => language === 'th' ? th : en;
  const f = useFormat(language);
  const current = bangkokMonthKey();
  const [month, setMonth] = useState(current);
  const [data, setData] = useState<ProfitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = async (quiet: boolean, signal?: AbortSignal) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    if (!quiet) { setLoading(true); setError(''); setData(null); }
    try {
      const result = await adminProfitLiveApi.snapshot(userId, month, signal);
      if (!signal?.aborted) { setData(result); setError(''); }
    } catch (cause) {
      if (!signal?.aborted && !quiet) setError((cause as Error).message);
    } finally {
      busyRef.current = false; setBusy(false);
      if (!signal?.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    busyRef.current = false;
    void load(false, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month, revision]);
  // Live: this month refreshes every minute while the page is on screen, at once on return, and when a payment arrives.
  useEffect(() => {
    if (month !== current) return;
    const controller = new AbortController();
    const tick = () => { if (!document.hidden) void load(true, controller.signal); };
    const timer = window.setInterval(tick, REFRESH_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, month, current]);
  useEffect(() => {
    if (!liveTick || month !== current) return;
    const controller = new AbortController();
    void load(true, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick]);

  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(current, -index));

  const m = data?.metrics;
  const status = m ? STATUS[m.status] : null;
  const todayShare = data?.today && data.today.capUsd > 0 ? Math.min(100, (data.today.usdMicro / 1_000_000 / data.today.capUsd) * 100) : null;
  const notes = m ? [...m.sections.revenue.notes, ...m.sections.ai.notes, ...m.sections.profit.notes, ...m.sections.comparison.notes] : [];

  return <section aria-labelledby="profit-live-title" className="space-y-4">
    <div className={`${uiSurface} flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="profit-live-title" className="text-[15px] font-semibold">{copy('กำไรและต้นทุน AI', 'Profit and AI cost')}</h2>
          {status && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status[2]}`}>{copy(status[0], status[1])}</span>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy('คำนวณจากการชำระเงินจริงใน Stripe และการใช้ AI จริงทุกข้อความ · เวลาไทย · ตัวเลขที่ยังไม่ทราบจะไม่แสดงเป็น 0', 'From real Stripe payments and every AI request · Bangkok time · unknown figures are never shown as 0')}</p>
        {data && <p className="mt-1 text-[11px] text-brand-muted">{data.live
          ? copy(`ข้อมูลเดือนนี้ถึงตอนนี้ · อัปเดตเองทุก 1 นาที · ล่าสุด ${f.time(data.generatedAt)}`, `This month so far · refreshes every minute · last ${f.time(data.generatedAt)}`)
          : copy(`ทั้งเดือน · คำนวณเมื่อ ${f.time(data.generatedAt)}`, `Whole month · worked out at ${f.time(data.generatedAt)}`)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="ui-input !w-auto" aria-label={copy('เลือกเดือน', 'Select month')} value={month} onChange={event => setMonth(event.target.value)}>
          {months.map(key => <option key={key} value={key}>{key === current ? copy(`เดือนนี้ (${f.monthName(key)})`, `This month (${f.monthName(key)})`) : f.monthName(key)}</option>)}
        </select>
        <button type="button" className={secondary} onClick={() => void load(true)} disabled={busy}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />{copy('อัปเดต', 'Refresh')}</button>
      </div>
    </div>

    <AdminAiCredit userId={userId} payingMembers={data?.metrics.members.paidAtEnd ?? null} />

    {loading && !data ? <div className={`${uiSurface} grid gap-4 p-5 sm:grid-cols-3 sm:p-6`} role="status" aria-label={copy('กำลังคำนวณ', 'Working it out')}>{[0, 1, 2].map(item => <div key={item}><SkeletonBlock className="h-3 w-28" /><SkeletonBlock className="mt-3 h-7 w-36" /></div>)}</div>
      : error ? <div role="alert" className="rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{copy('ยังคำนวณไม่ได้', 'Could not work it out')}: {error}</div>
        : m && data && <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Tile label={copy('รับชำระ', 'Payments received')} value={f.money(m.revenue.gross)} detail={copy(`${f.count(m.revenue.payments)} รายการ · คืนเงิน ${f.money(m.revenue.refunds)}`, `${f.count(m.revenue.payments)} payments · refunds ${f.money(m.revenue.refunds)}`)}
              change={<ChangeChip item={m.comparison.gross} copy={copy} percent={f.percent} />} />
            <Tile label={copy('ค่าธรรมเนียม Stripe', 'Stripe fees')} value={f.money(m.revenue.fees)} detail={m.revenue.feesSource === 'estimate' ? copy('ประมาณจากอัตราบัตรไทย', 'Estimated from the Thai card rate') : copy(`รับสุทธิ ${f.money(m.revenue.net)}`, `Net ${f.money(m.revenue.net)}`)} />
            <Tile label={copy('ค่า AI', 'AI cost')} value={f.money(m.ai.thb?.total)} detail={copy(`${f.usd(m.ai.usd.total + m.ai.usd.reportNotes)} · ${f.count(m.ai.requests)} ข้อความ`, `${f.usd(m.ai.usd.total + m.ai.usd.reportNotes)} · ${f.count(m.ai.requests)} requests`)}
              change={<ChangeChip item={m.comparison.aiThb} copy={copy} percent={f.percent} />} />
            <Tile label={copy('กำไรก่อนค่าใช้จ่ายคงที่', 'Contribution')} value={f.money(m.profit.contribution)} detail={copy('รับสุทธิ − ค่าธรรมเนียม − ค่า AI', 'Net − fees − AI')}
              change={<ChangeChip item={m.comparison.contribution} copy={copy} percent={f.percent} />} />
            <Tile label={copy('กำไรประมาณ', 'Estimated profit')} value={f.money(m.profit.operating)}
              detail={copy(`อัตรากำไร ${f.percent(m.profit.marginBp)} · คุ้มทุนที่สมาชิก ${m.profit.breakEvenMembers === null ? f.unknown : `${f.count(m.profit.breakEvenMembers)} คน`}`, `Margin ${f.percent(m.profit.marginBp)} · break-even at ${m.profit.breakEvenMembers === null ? f.unknown : `${f.count(m.profit.breakEvenMembers)} members`}`)}
              change={<ChangeChip item={m.comparison.operating} copy={copy} percent={f.percent} />} />
          </div>

          {data.today && <div className={`${uiSurface} p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-semibold">{copy('ค่า AI วันนี้', 'AI cost today')}</h3>
              <p className="text-[13px] tabular-nums"><b>{f.usd(data.today.usdMicro)}</b> <span className="text-brand-muted">{copy(`จากเพดาน $${data.today.capUsd.toFixed(2)} ต่อวัน · ${f.count(data.today.requests)} ข้อความ`, `of the $${data.today.capUsd.toFixed(2)} daily cap · ${f.count(data.today.requests)} requests`)}</span></p>
            </div>
            {todayShare !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-faint" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(todayShare)} aria-label={copy('สัดส่วนจากเพดานรายวัน', 'Share of the daily cap')}>
              <div className={`h-full rounded-full ${todayShare >= 80 ? 'bg-amber-500' : 'bg-brand-blue-acc'}`} style={{ width: `${todayShare}%` }} /></div>}
          </div>}

          <div className="grid gap-3 lg:grid-cols-3">
            <Rows title={copy('ค่า AI แยกส่วน', 'AI cost in parts')} rows={[
              ['Gemini', f.money(m.ai.thb?.gemini)], ['Claude', f.money(m.ai.thb?.claude)],
              [copy('ค่าระบบส่วนกลาง (แคช ครั้งที่ล้มเหลว โน้ตรายงาน)', 'Shared (cache, failed attempts, report notes)'), f.money(m.ai.thb?.platform)],
              [copy('ใช้แคชแทนอ่านใหม่ ประหยัดไป', 'Saved by the cache'), f.usd(m.ai.usd.cacheSaved)],
              [copy('เฉลี่ยต่อข้อความ', 'Per request'), f.money(m.ai.perMessage)],
              [copy('ต่อสมาชิก Pro', 'Per Pro member'), f.money(m.ai.perPaidMember)],
              [copy('ต่อบัญชีที่ใช้ AI', 'Per account using AI'), f.money(m.ai.perActiveAccount)],
              [copy('สูงสุด / มัธยฐาน / P90 ต่อบัญชี', 'Max / median / P90 per account'), `${f.money(m.ai.accountMax)} / ${f.money(m.ai.accountMedian)} / ${f.money(m.ai.accountP90)}`],
              [copy('บัญชีที่โทเคนหมด', 'Accounts out of tokens'), f.count(m.ai.usedUpAccounts)],
              [copy('วันที่ใกล้เพดาน / ถึงเพดาน', 'Days near / at the cap'), `${f.count(m.ai.daysNearCap)} / ${f.count(m.ai.daysAtCap)}`],
            ]} />
            <Rows title={copy('สมาชิก', 'Members')} rows={[
              [copy('Pro ที่จ่ายเงิน ณ ตอนนี้', 'Paying Pro now'), f.count(m.members.paidAtEnd)],
              [copy('จ่ายครั้งแรกเดือนนี้', 'First paid this month'), f.count(m.members.newPaying)],
              [copy('ไม่ต่ออายุ', 'Did not renew'), f.count(m.members.ended)],
              [copy('ตั้งให้หยุดต่ออายุ', 'Set to stop renewing'), f.count(m.members.cancelling)],
              [copy('กำลังทดลองใช้', 'In trial'), f.count(m.members.trials)],
              [copy('แอดมินให้สิทธิ์', 'Granted by an admin'), f.count(m.members.granted)],
              [copy('บัญชีทั้งหมด', 'All accounts'), f.count(m.members.total)],
              [copy('สมัครใช้งานใหม่เดือนนี้', 'Signed up this month'), f.count(m.members.signedUp)],
              [copy('ชำระไม่สำเร็จ', 'Failed payments'), m.revenue.failedPayments === null || m.revenue.failedPayments === undefined ? f.unknown : `${f.count(m.revenue.failedPayments)}${m.revenue.failedAmount ? ` (${f.money(m.revenue.failedAmount)})` : ''}`],
            ]} />
            <Rows title={copy('ค่าใช้จ่ายและคุณภาพ', 'Costs and quality')} rows={[
              ...data.settings.items.map(item => [`${item.label} (${copy('ต่อเดือน', 'a month')})`, f.money(item.monthlySatang)] as [string, string]),
              ...(m.profit.unknownCosts ?? []).map(label => [label, f.unknown] as [string, string]),
              [copy('อัตราแลกเปลี่ยนที่ใช้', 'Dollar rate used'), data.settings.rate4 === null ? f.unknown : `฿${(data.settings.rate4 / 10_000).toFixed(2)} / $1`],
              [copy('เลขาเตรียมรายการ / ยืนยัน', 'Prepared / confirmed'), `${f.count(m.quality.prepared)} / ${f.count(m.quality.confirmed)} (${f.percent(m.quality.confirmRateBp)})`],
              [copy('ค่า AI ต่อรายการที่ยืนยัน', 'AI cost per confirmed item'), f.money(m.quality.costPerConfirmed)],
              [copy('ตอบไม่ทัน / Gemini ล้ม / Claude ล้ม', 'Timeouts / Gemini / Claude failures'), `${f.count(m.reliability.timeouts)} / ${f.count(m.reliability.geminiFailures)} / ${f.count(m.reliability.claudeFailures)}`],
              [copy('คำตอบที่ระบบกรองชื่อ AI ออก', 'Answers the confidentiality check changed'), f.count(m.reliability.confidentialBlocked)],
            ]} />
          </div>

          <AdminUsageTable accounts={accounts} figures={data.accounts} month={data.month} appDays={appDays} copy={copy} money={f.money} count={f.count} unknown={f.unknown} locale={f.locale} />

          {notes.length > 0 && <div className={`${uiSurface} p-5`}><h3 className="text-[13px] font-semibold">{copy('หมายเหตุของตัวเลข', 'About these figures')}</h3>
            <ul className="mt-2 space-y-1.5">{notes.map(note => <li key={note} className="flex items-start gap-2 text-xs leading-relaxed text-brand-muted"><CircleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{note}</span></li>)}</ul></div>}
        </>}
  </section>;
}
