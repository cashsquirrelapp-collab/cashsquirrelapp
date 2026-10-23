import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Building2, CircleAlert, Clock3, RefreshCw, Wallet } from 'lucide-react';
import type { AnalyticsRange } from '../../../../shared/adminAnalytics';
import type { AdminStripeFinance as AdminStripeFinanceData, StripeFinancePayment } from '../../../../shared/adminStripeFinance';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { adminStripeFinanceApi } from '../../services/adminStripeFinance';
import { secondary } from './groupUi';

type Copy = (th: string, en: string) => string;
type FinanceSection = AdminStripeFinanceData['balance'] | AdminStripeFinanceData['summary'] | AdminStripeFinanceData['payments'] | AdminStripeFinanceData['payouts'];

// Stripe preserves two-decimal API amounts for ISK and UGX. HUF/TWD payouts
// also use two-decimal amounts, even though their payout amount must be whole.
const zeroDecimal = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const threeDecimal = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
function money(amount: number, currency: string, locale: string) {
  const code = currency.toLowerCase();
  const digits = zeroDecimal.has(code) ? 0 : threeDecimal.has(code) ? 3 : 2;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: code.toUpperCase(), minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount / (10 ** digits));
}

function SectionNotice({ section, copy }: { section: FinanceSection; copy: Copy }) {
  if (section.status === 'ready' && section.complete) return null;
  const missing = section.error?.code === 'permission_missing';
  return <p role={section.status === 'unavailable' ? 'status' : undefined} className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-brand-muted"><CircleAlert size={14} className="mt-0.5 shrink-0" /><span>{section.status === 'ready'
    ? copy('แสดงเฉพาะรายการล่าสุด', 'Showing the most recent records')
    : missing ? copy('ยังอ่านข้อมูลส่วนนี้ไม่ได้ ต้องเพิ่มสิทธิ์อ่านให้คีย์ Stripe', 'Stripe read permission is required for this section')
      : section.error?.code === 'incomplete' ? copy('ข้อมูลยังไม่ครบ จึงยังไม่แสดงยอดรวม กรุณาเลือกช่วงเวลาสั้นลง', 'Totals are withheld because the data is incomplete. Please select a shorter period.') : copy('ข้อมูลส่วนนี้ยังไม่พร้อม กรุณาอัปเดตอีกครั้ง', 'This section is unavailable. Please refresh to try again.')}
    {missing && section.error?.permission && <span className="ml-1 font-mono">({section.error.permission})</span>}</span></p>;
}

function BankDate({ payout, date, copy }: { payout: StripeFinancePayment['payout']; date: (value: string) => string; copy: Copy }) {
  if (!payout) return null;
  const paid = payout.status === 'paid';
  return <p className={`mt-1 text-[11px] font-medium ${paid ? 'text-brand-green-acc' : 'text-brand-blue-acc'}`}><Building2 size={11} className="mr-1 inline" />{paid ? copy('โอนเข้าธนาคารแล้ว', 'Paid out to your bank') : copy('จะเข้าธนาคารประมาณ', 'Expected in your bank')} {date(payout.arrivalDate)}</p>;
}

/** A part is shown when Stripe returned it, or when it only needs a shorter period. */
const readable = (section: FinanceSection) => section.status === 'ready' || section.error?.code === 'incomplete';
const hasReadablePart = (data: AdminStripeFinanceData) => [data.balance, data.summary, data.payments, data.payouts].some(readable);

function payoutLabel(status: string, copy: Copy) {
  switch (status) {
    case 'pending': return copy('รอโอน', 'Pending');
    case 'in_transit': return copy('กำลังโอน', 'In transit');
    case 'paid': return copy('Stripe โอนแล้ว', 'Paid by Stripe');
    case 'failed': return copy('โอนไม่สำเร็จ', 'Failed');
    case 'canceled': return copy('ยกเลิกแล้ว', 'Canceled');
    default: return status;
  }
}

export default function AdminStripeFinance({ userId, range, revision, liveTick = 0, detailed, onViewDetails }: {
  userId: string; range: AnalyticsRange; revision: number;
  /** Bumped by the dashboard when a new payment arrives: refresh quietly, keeping what is shown. */
  liveTick?: number;
  detailed: boolean; onViewDetails: () => void;
}) {
  const { language } = useLanguage();
  const copy: Copy = (th, en) => language === 'th' ? th : en;
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [data, setData] = useState<AdminStripeFinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  // Owner, 2026-10-22: a part Stripe will not let the server read is left out, not explained; with
  // nothing readable the panel is not shown at all. It appears by itself once read access is added.
  const [hadContent, setHadContent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Clear previous-account/previous-range data immediately, including on 403.
    setData(null);
    setLoading(true);
    setError('');
    adminStripeFinanceApi.snapshot(userId, range, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setHadContent(hasReadablePart(result)); } })
      .catch(cause => { if (!controller.signal.aborted) { setError((cause as Error).message); setHadContent(false); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, range, revision, retry]);

  useEffect(() => {
    if (!liveTick) return;
    const controller = new AbortController();
    adminStripeFinanceApi.snapshot(userId, range, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setError(''); setHadContent(hasReadablePart(result)); } })
      .catch(() => { /* keep what is shown; the next change or a manual refresh tries again */ });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTick]);

  const date = (value: string, time = false) => new Date(value).toLocaleString(locale, {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
  const formatMoney = (amount: number, currency: string) => money(amount, currency, locale);
  const formatPercent = (value: number | null) => value === null ? '—' : `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const balances = data?.balance.status === 'ready' ? data.balance.data?.currencies : null;
  const totals = data?.summary.status === 'ready' && data.summary.complete ? data.summary.data?.currencies : null;
  const payments = data?.payments.status === 'ready' ? data.payments.data?.items : null;
  const payouts = data?.payouts.status === 'ready' ? data.payouts.data : null;
  const latestPayment = payments?.[0];
  const nextPayout = payouts?.nextPayouts[0];
  const failedPayout = payouts?.items.find(item => item.status === 'failed');
  const negativeBalance = balances?.some(item => item.available < 0);

  // Nothing readable, or still loading without anything shown before: no panel (no flash).
  if (loading ? !hadContent : error || !data || !hasReadablePart(data)) return null;
  const show = data ? { summary: readable(data.summary), balance: readable(data.balance), payments: readable(data.payments), payouts: readable(data.payouts) } : null;

  return <section aria-labelledby="stripe-finance-title" className={`${uiSurface} overflow-hidden`}>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-border/60 p-5 sm:p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 id="stripe-finance-title" className="text-[15px] font-semibold">{copy('เงินรับและการโอนจาก Stripe', 'Stripe payments and payouts')}</h2>{data?.livemode && <span className="rounded-full bg-brand-green-bg px-2 py-0.5 text-[10px] font-semibold text-brand-green-acc">{copy('บัญชีจริง', 'Live account')}</span>}</div>
        <p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy(`ข้อมูลทั้งบัญชี Stripe · ยอดรับ ${range} วันล่าสุด · เวลาไทย`, `Entire Stripe account · Last ${range} days · Bangkok time`)}</p>
        {data && <p className="mt-1 text-[11px] text-brand-muted">{copy('อัปเดต', 'Updated')} {date(data.generatedAt, true)}</p>}
      </div>
      <button type="button" onClick={() => setRetry(value => value + 1)} disabled={loading} className={secondary} aria-label={copy('อัปเดตข้อมูล Stripe', 'Refresh Stripe data')}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /><span className="text-xs">{copy('อัปเดต Stripe', 'Refresh Stripe')}</span></button>
    </div>
    {loading ? <div className="space-y-4 p-5 sm:p-6" role="status" aria-label={copy('กำลังอ่านข้อมูล Stripe', 'Loading Stripe data')}><div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(item => <div key={item}><SkeletonBlock className="h-3 w-28" /><SkeletonBlock className="mt-3 h-8 w-36" /></div>)}</div><SkeletonBlock className="h-24 w-full" /></div>
      : error ? <div className="p-5 sm:p-6" role="alert"><p className="text-sm font-medium">{copy('ยังโหลดข้อมูล Stripe ไม่ได้', 'Could not load Stripe data')}</p><p className="mt-1 text-xs text-brand-muted">{error}</p></div>
        : data && show && <div className="space-y-5 p-5 sm:p-6">
          {show.summary && <div>
            {totals?.length ? <div className="space-y-4">{totals.map(total => <div key={total.currency} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                [copy('รับชำระสำเร็จ', 'Successful payments'), formatMoney(total.gross, total.currency), copy(`${total.paymentCount} รายการ · ${total.currency.toUpperCase()}`, `${total.paymentCount} payments · ${total.currency.toUpperCase()}`)],
                [copy('คืนเงิน', 'Refunds'), formatMoney(total.refunds, total.currency), copy('คืนเงินในช่วงที่เลือก', 'Refunded in selected period')],
                [copy('ค่าธรรมเนียมรวม', 'Total fees'), formatMoney(total.fees, total.currency), copy(`${formatPercent(total.effectiveFeePercent)} ของยอดรับ · รวมภาษีค่าธรรมเนียม`, `${formatPercent(total.effectiveFeePercent)} of gross · includes fee tax`)],
                [copy('สุทธิจากรับชำระและคืนเงิน', 'Net payment activity'), formatMoney(total.net, total.currency), copy('ยังไม่ใช่ยอดเข้าธนาคาร', 'Not a bank deposit yet')],
              ].map(([label, value, detail]) => <div key={label} className="min-w-0"><p className="text-xs text-brand-muted">{label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{value}</p><p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{detail}</p></div>)}
            </div>)}</div> : data.summary.status === 'ready' ? <p className="text-sm text-brand-muted">{copy('ยังไม่มีรายการรับชำระในช่วงนี้', 'No payment activity in this period')}</p> : <p className="text-sm font-medium">{copy('ยอดรับและค่าธรรมเนียม: ยังไม่พร้อม', 'Payment and fee totals: unavailable')}</p>}
            <SectionNotice section={data.summary} copy={copy} />
          </div>}

          {(show.balance || show.payouts) && <div className={`grid gap-3 ${show.balance && show.payouts ? 'lg:grid-cols-2' : ''}`}>
            {show.balance && <div className="rounded-xl border border-brand-border/70 bg-brand-bg/50 p-4">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold"><Wallet size={16} className="text-brand-blue-acc" />{copy('เงินในบัญชี Stripe ตอนนี้', 'Current Stripe balance')}</h3>
              {balances?.length ? balances.map(balance => <dl key={balance.currency} className="mt-4 grid grid-cols-2 gap-3"><div><dt className="text-xs text-brand-muted">{copy('พร้อมให้ Stripe โอน', 'Available for payout')}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatMoney(balance.available, balance.currency)}</dd></div><div><dt className="text-xs text-brand-muted">{copy('รอพร้อมใช้', 'Pending settlement')}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatMoney(balance.pending, balance.currency)}</dd></div></dl>) : <p className="mt-3 text-sm text-brand-muted">{data.balance.status === 'ready' ? copy('ยังไม่มียอดคงเหลือ', 'No balance yet') : copy('ยังอ่านยอดคงเหลือไม่ได้', 'Balance unavailable')}</p>}
              {negativeBalance && <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">{copy('ยอดพร้อมใช้ติดลบจะหักกลบกับเงินที่พร้อมใช้รอบถัดไป ทำให้ยอดโอนจริงต่างจากยอดสุทธิของรายการได้', 'A negative available balance offsets later funds, so the payout can differ from the net payment amount.')}</p>}
              <SectionNotice section={data.balance} copy={copy} />
            </div>}
            {show.payouts && <div className="rounded-xl border border-brand-border/70 bg-brand-bg/50 p-4">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold"><Building2 size={16} className="text-brand-blue-acc" />{copy('รอบโอนเข้าธนาคารถัดไป', 'Next bank payout')}</h3>
              {nextPayout ? <><p className="mt-3 text-xl font-semibold tabular-nums">{formatMoney(nextPayout.amount, nextPayout.currency)}</p><p className="mt-1 text-sm">{copy('คาดว่าจะเข้า', 'Expected arrival')} {date(nextPayout.arrivalDate)}</p><p className="mt-1 text-xs text-brand-muted">{payoutLabel(nextPayout.status, copy)} · {copy('วันที่ประมาณการจาก Stripe', 'Stripe estimate')}</p></>
                : <><p className="mt-3 text-base font-semibold">{payouts?.nextPayoutsComplete ? copy('ยังไม่กำหนดวันโอน', 'No payout scheduled yet') : copy('ยังอ่านกำหนดโอนไม่ได้', 'Payout schedule unavailable')}</p><p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy('วันที่เงินพร้อมใช้ใน Stripe เป็นคนละวันกับวันที่เงินเข้าธนาคาร วันโอนจะแสดงเมื่อ Stripe สร้างรอบโอน', 'Funds becoming available in Stripe is separate from bank arrival. The arrival estimate appears once Stripe creates a payout.')}</p></>}
              <SectionNotice section={data.payouts} copy={copy} />
            </div>}
          </div>}

          {failedPayout && <p role="status" className="flex items-start gap-2 rounded-xl border border-red-300/50 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700 dark:bg-red-950/20 dark:text-red-300"><CircleAlert size={15} className="mt-0.5 shrink-0" /><span>{copy('มีรายการโอนไม่สำเร็จ', 'A payout failed')} {formatMoney(failedPayout.amount, failedPayout.currency)} · {date(failedPayout.createdAt)} {copy('ตรวจสอบรายละเอียดใน Stripe', 'Review the details in Stripe')}</span></p>}
          {latestPayment && <div className="flex items-start gap-2.5 rounded-xl bg-brand-green-bg/60 px-4 py-3" role="status"><ArrowUpRight size={17} className="mt-0.5 shrink-0 text-brand-green-acc" /><div className="min-w-0 text-xs leading-relaxed"><p className="font-semibold">{copy('รับชำระล่าสุด', 'Latest successful payment')} {formatMoney(latestPayment.amount, latestPayment.currency)} · {date(latestPayment.createdAt, true)}</p><p className="mt-0.5 text-brand-muted">{latestPayment.settlement ? <>{copy('ค่าธรรมเนียม', 'Fees')} {formatMoney(latestPayment.settlement.fee, latestPayment.settlement.currency)} ({formatPercent(latestPayment.settlement.effectiveFeePercent)}) · {latestPayment.amountRefunded > 0 ? copy('สุทธิก่อนคืนเงิน', 'Net before refunds') : copy('สุทธิ', 'Net')} {formatMoney(latestPayment.settlement.net, latestPayment.settlement.currency)}{latestPayment.settlement.status === 'pending' && <> · {copy('รอพร้อมใช้ใน Stripe', 'Available in Stripe on')} {date(latestPayment.settlement.availableOn)}</>}</> : copy('รอข้อมูลค่าธรรมเนียมและวันพร้อมใช้จาก Stripe', 'Waiting for Stripe fee and settlement details')}{latestPayment.amountRefunded > 0 && <> · {copy('คืนแล้ว', 'Refunded')} {formatMoney(latestPayment.amountRefunded, latestPayment.currency)}</>}</p><BankDate payout={latestPayment.payout} date={value => date(value)} copy={copy} /></div></div>}

          {detailed ? <div className={`grid gap-5 ${show.payments && show.payouts ? 'xl:grid-cols-2' : ''}`}>
            {show.payments && <section className="min-w-0" aria-labelledby="stripe-payments-title"><h3 id="stripe-payments-title" className="text-sm font-semibold">{copy('รายการรับชำระล่าสุด', 'Recent successful payments')}</h3><p className="mt-1 text-[11px] text-brand-muted">{copy('เฉพาะรายการสำเร็จในช่วงที่เลือก · รวมรายการที่คืนเงินแล้ว', 'Successful payments in the selected period, including refunds')}</p><div className="mt-3 divide-y divide-brand-border/60">{payments?.length ? payments.map(payment => <article key={payment.id} className="py-3 first:pt-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium">{date(payment.createdAt, true)}</p><p className="mt-1 text-[11px] text-brand-muted">{payment.paymentMethod || 'Stripe'} · {payment.appPayment ? copy('การชำระในแอป', 'App payment') : copy('รายการในบัญชี Stripe', 'Stripe account payment')}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</p></div>{payment.settlement && <p className="mt-2 text-[11px] leading-relaxed text-brand-muted">{copy('หัก', 'Fee')} {formatMoney(payment.settlement.fee, payment.settlement.currency)} ({formatPercent(payment.settlement.effectiveFeePercent)}) · {payment.amountRefunded > 0 ? copy('สุทธิก่อนคืนเงิน', 'Net before refunds') : copy('สุทธิ', 'Net')} {formatMoney(payment.settlement.net, payment.settlement.currency)}<br /><Clock3 size={11} className="mr-1 inline" />{payment.settlement.status === 'available' ? copy('พร้อมใช้ใน Stripe', 'Available in Stripe') : copy('พร้อมใช้ใน Stripe ประมาณ', 'Available in Stripe around')} {date(payment.settlement.availableOn)}</p>}<BankDate payout={payment.payout} date={value => date(value)} copy={copy} />{payment.amountRefunded > 0 && <p className="mt-1 text-[11px] text-brand-pink-acc">{copy('คืนเงินแล้ว', 'Refunded')} {formatMoney(payment.amountRefunded, payment.currency)}</p>}</article>) : <p className="py-3 text-xs text-brand-muted">{payments ? copy('ไม่มีรายการสำเร็จในช่วงนี้', 'No successful payments in this period') : copy('ยังอ่านรายการรับชำระไม่ได้', 'Payment list unavailable')}</p>}</div><SectionNotice section={data.payments} copy={copy} /></section>}
            {show.payouts && <section className="min-w-0" aria-labelledby="stripe-payouts-title"><h3 id="stripe-payouts-title" className="text-sm font-semibold">{copy('ประวัติการโอนเข้าธนาคาร', 'Bank payout history')}</h3><p className="mt-1 text-[11px] text-brand-muted">{copy('รายการล่าสุดจาก Stripe · สถานะโอนแล้วควรตรวจเทียบกับธนาคาร', 'Latest Stripe payouts · Reconcile paid payouts with your bank')}</p><div className="mt-3 divide-y divide-brand-border/60">{payouts?.items.length ? payouts.items.map(payout => <article key={payout.id} className="flex items-start justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="text-xs font-medium">{payoutLabel(payout.status, copy)}</p><p className="mt-1 text-[11px] text-brand-muted">{copy('วันเข้าธนาคารที่ Stripe ระบุ', 'Arrival date from Stripe')} {date(payout.arrivalDate)}</p><p className="mt-1 text-[11px] text-brand-muted">{payout.automatic ? copy('โอนอัตโนมัติ', 'Automatic payout') : copy('สั่งโอนเอง', 'Manual payout')}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(payout.amount, payout.currency)}</p></article>) : <p className="py-3 text-xs text-brand-muted">{payouts ? copy('ยังไม่มีประวัติการโอน', 'No payouts yet') : copy('ยังอ่านประวัติการโอนไม่ได้', 'Payout history unavailable')}</p>}</div></section>}
          </div> : (show.payments || show.payouts) && <button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-acc" onClick={onViewDetails}>{copy('ดูรายการรับเงินและประวัติการโอน', 'View payments and payout history')}<ArrowRight size={14} /></button>}
          {(show.summary || show.balance || show.payouts) && <p className="text-[11px] leading-relaxed text-brand-muted">{copy('สุทธิในช่วงนี้รวมการรับชำระ คืนเงิน และค่าธรรมเนียมตามวันที่บันทึกใน Stripe ส่วนยอดคงเหลือและยอดโอนอาจรวมรายการช่วงอื่น ข้อพิพาท และรายการปรับยอดด้วย', 'Period net includes payments, refunds, and fees by Stripe transaction date. Balances and payouts may also include other periods, disputes, and balance adjustments.')}</p>}
        </div>}
  </section>;
}
