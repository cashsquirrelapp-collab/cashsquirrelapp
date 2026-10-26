import { useEffect, useState } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, CircleHelp, CreditCard, QrCode, RefreshCw, Webhook, Server, Tag } from 'lucide-react';
import { PRO_MONTH_PROMO_NEXT_DAY, formatBaht, thaiShortDate } from '../../../../shared/proPricing';
import type { PaymentReadiness, ReadinessPrice, ReadinessState } from '../../../../shared/paymentReadiness';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { adminPaymentReadinessApi } from '../../services/adminPaymentReadiness';
import { primary, secondary, type Confirm } from './groupUi';

// The admin page's payment check (owner, 2026-10-27: "ทำระบบชำระเงินให้มันชำระได้ทั้งบัตรเครดิตแล้วก็ QR code ... เป็นยอด
// ใหม่ด้วยนะ"): whether customers can pay for Pro by card and by PromptPay QR now, at the price on screen, and what is
// missing when they cannot. The prices it can make itself are one button away (the owner confirms first); the rest
// names where to change it in Stripe. Like the Stripe money view, it is left out when it cannot be loaded at all.

type Copy = (th: string, en: string) => string;
type Row = { key: string; icon: typeof Server; title: string; state: ReadinessState; lines: string[]; fix?: string };

const tone: Record<ReadinessState, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: 'text-brand-green-acc' },
  problem: { icon: CircleAlert, className: 'text-brand-pink-acc' },
  unknown: { icon: CircleHelp, className: 'text-brand-yellow-acc' },
};

function priceName(item: ReadinessPrice, copy: Copy) {
  return item.kind === 'one_time'
    ? copy(`ชำระครั้งเดียว (QR และบัตร) ${formatBaht(item.expected)}`, `One-time (QR and card) ${formatBaht(item.expected)}`)
    : copy(`บัตรต่ออายุอัตโนมัติ ${formatBaht(item.expected)}/เดือน`, `Card auto-renewal ${formatBaht(item.expected)}/month`);
}
function priceLine(item: ReadinessPrice, copy: Copy) {
  const state = item.state === 'ok' ? copy('มีใน Stripe แล้ว', 'in Stripe')
    : item.state === 'missing' ? copy('ยังไม่มีใน Stripe', 'not in Stripe yet')
      : copy(`ใน Stripe ยังเป็น ${formatBaht(item.current ?? 0)}`, `Stripe still has ${formatBaht(item.current ?? 0)}`);
  return `${priceName(item, copy)} · ${state}`;
}
const permissionLine = (permission: string | undefined, copy: Copy) => permission
  ? copy(`คีย์ Stripe ของเซิร์ฟเวอร์อ่านส่วนนี้ไม่ได้ ต้องเพิ่มสิทธิ์ ${permission}`, `The server's Stripe key cannot read this. Add ${permission}.`)
  : copy('ยังอ่านส่วนนี้จาก Stripe ไม่ได้ กรุณาตรวจอีกครั้ง', 'Stripe did not answer for this part. Please check again.');

/** "1 ธ.ค. 2569" in Thai, "1 Dec 2026" in English. */
const dayLabel = (key: string, copy: Copy) => copy(thaiShortDate(key), new Date(`${key}T12:00:00+07:00`).toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }));

/** A price with no price of its kind in Stripe to copy: the button cannot make it. */
const uncopyable = (items: ReadinessPrice[], copy: Copy) => items.some(item => item.state !== 'ok' && !item.creatable)
  ? copy('บางราคาไม่มีราคาเดิมใน Stripe ให้คัดลอก จึงสร้างจากหน้านี้ไม่ได้ กรุณาแจ้งทีมพัฒนาเพื่อสร้างชุดราคาใหม่', 'Some prices have no earlier price in Stripe to copy, so they cannot be made here. Ask the developers to set them up.')
  : undefined;

function rowsOf(data: PaymentReadiness, copy: Copy, appHost: string): Row[] {
  const today = data.prices.items.filter(item => !item.later);
  const later = data.prices.items.filter(item => item.later);
  const nextDay = dayLabel(PRO_MONTH_PROMO_NEXT_DAY, copy);
  const rows: Row[] = [
    { key: 'server', icon: Server, title: copy('การรับชำระบนเซิร์ฟเวอร์', 'Payments on the server'), state: data.server.state,
      lines: data.server.state === 'ok' ? [copy('เปิดอยู่', 'On')] : [
        ...(data.server.prepaid ? [] : [copy('ยังไม่ได้เปิด KRAROK_PREPAID_ENABLED', 'KRAROK_PREPAID_ENABLED is off')]),
        ...(data.server.publishableKey ? [] : [copy('STRIPE_PUBLISHABLE_KEY ไม่ตรงกับโหมดของคีย์ Stripe', 'STRIPE_PUBLISHABLE_KEY does not match the Stripe mode')]),
      ], fix: data.server.state === 'ok' ? undefined : copy('ตั้งค่าใน Cloudflare → Workers → kraroktunngern → Settings → Variables', 'Set it in Cloudflare → Workers → kraroktunngern → Settings → Variables') },
    { key: 'methods', icon: CreditCard, title: copy('ช่องทางบัตรและ PromptPay ใน Stripe', 'Card and PromptPay in Stripe'), state: data.methods.state,
      lines: data.methods.state === 'unknown' ? [permissionLine(data.methods.permission, copy)] : [
        `${copy('บัตร', 'Card')} ${data.methods.card ? copy('เปิด', 'on') : copy('ปิด', 'off')} · PromptPay ${data.methods.promptpay ? copy('เปิด', 'on') : copy('ปิด', 'off')}`,
        ...(data.methods.extra.length ? [copy(`มีช่องทางอื่นเปิดอยู่ ซึ่งแอปยังยืนยันผลไม่ได้: ${data.methods.extra.join(', ')}`, `Other methods are on, which the app cannot confirm: ${data.methods.extra.join(', ')}`)] : []),
      ], fix: data.methods.state === 'problem' ? copy('Stripe Dashboard → Settings → Payment methods: เปิดบัตรและ PromptPay ปิดช่องทางอื่น', 'Stripe Dashboard → Settings → Payment methods: card and PromptPay on, others off') : undefined },
    { key: 'today', icon: Tag, title: copy('ราคาที่ชำระวันนี้', 'Prices charged today'), state: data.prices.state,
      lines: data.prices.state === 'unknown' ? [permissionLine(data.prices.permission, copy)] : today.map(item => priceLine(item, copy)), fix: uncopyable(today, copy) },
  ];
  if (data.nextPriceReady !== null) rows.push({ key: 'later', icon: Tag, title: copy(`ราคาตั้งแต่ ${nextDay}`, `Prices from ${nextDay}`),
    state: data.prices.state === 'unknown' ? 'unknown' : data.nextPriceReady ? 'ok' : 'problem',
    lines: data.prices.state === 'unknown' ? [permissionLine(data.prices.permission, copy)] : [
      ...later.map(item => priceLine(item, copy)),
      ...(data.nextPriceReady ? [] : [copy(`ต้องมีก่อน ${nextDay} ไม่เช่นนั้นวันนั้นจะรับชำระรายเดือนไม่ได้`, `Needed before ${nextDay}, or monthly payments stop that day`)]),
    ], fix: data.prices.state === 'unknown' ? undefined : uncopyable(later, copy) });
  rows.push({ key: 'webhook', icon: Webhook, title: copy('Stripe แจ้งผลการชำระกลับมาที่แอป', 'Stripe reports payments to the app'), state: data.webhook.state,
    lines: data.webhook.state === 'unknown' ? [permissionLine(data.webhook.permission, copy)] : [
      data.webhook.state === 'ok' ? copy(`ส่งถึง ${appHost} แล้ว`, `Reaches ${appHost}`) : copy(`ยังไม่ส่งถึง ${appHost} การชำระด้วยบัตรจะไม่เปิด Pro ให้ลูกค้า`, `Not reaching ${appHost}: a card payment would not turn on Pro`),
      ...(data.webhook.otherHosts.length ? [copy(`ตอนนี้ส่งไปที่ ${data.webhook.otherHosts.join(', ')}`, `Currently sent to ${data.webhook.otherHosts.join(', ')}`)] : []),
      ...(data.webhook.missingEvents.length && data.webhook.state === 'ok' ? [copy(`ยังไม่ส่ง ${data.webhook.missingEvents.length} เหตุการณ์ เช่น คืนเงินหรือข้อพิพาท: ${data.webhook.missingEvents.join(', ')}`, `${data.webhook.missingEvents.length} events not sent, e.g. refunds or disputes: ${data.webhook.missingEvents.join(', ')}`)] : []),
    ], fix: data.webhook.state === 'problem' ? copy(`Stripe Dashboard → Developers → Webhooks: เพิ่มปลายทาง https://${appHost}/api/stripe-webhook`, `Stripe Dashboard → Developers → Webhooks: add https://${appHost}/api/stripe-webhook`) : undefined });
  return rows;
}

/** Only a whole answer is drawn: anything else (an old server, a proxy page) leaves the card out. */
const isReadiness = (value: unknown): value is PaymentReadiness => {
  const data = value as PaymentReadiness | null;
  return Boolean(data && typeof data.status === 'string' && data.server && data.methods && Array.isArray(data.methods.extra)
    && data.prices && Array.isArray(data.prices.items) && data.webhook && Array.isArray(data.webhook.missingEvents) && Array.isArray(data.webhook.otherHosts));
};

/** Computers and iPads (the admin page's 744px+ design); the phone admin page has no Stripe panel (owner, 2026-10-22). */
export default function AdminPaymentReadiness({ userId, triggerConfirm }: { userId: string; triggerConfirm: Confirm }) {
  const { language } = useLanguage();
  const copy: Copy = (th, en) => (language === 'th' ? th : en);
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [data, setData] = useState<PaymentReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  // All green: one line on the dashboard, the rows a tap away; anything to fix shows the rows by itself.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    adminPaymentReadinessApi.read(userId, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(isReadiness(result) ? result : null); setFailed(!isReadiness(result)); } })
      .catch(() => { if (!controller.signal.aborted) { setData(null); setFailed(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, retry]);

  if (failed || (!loading && !data)) return null;
  const appHost = typeof window === 'undefined' ? '' : window.location.host;
  const create = () => {
    if (!data?.creatable) return;
    const list = data.prices.items.filter(item => item.creatable).map(item => `• ${priceName(item, copy)}${item.later ? copy(` (ตั้งแต่ ${dayLabel(PRO_MONTH_PROMO_NEXT_DAY, copy)})`, ` (from ${dayLabel(PRO_MONTH_PROMO_NEXT_DAY, copy)})`) : ''}`).join('\n');
    triggerConfirm(copy('สร้างราคาใน Stripe', 'Create prices in Stripe'),
      copy(`จะสร้างราคาใหม่ใน Stripe ${data.livemode ? 'บัญชีจริง' : 'โหมดทดสอบ'} ${data.creatable} รายการ:\n${list}\nราคาเดิมไม่ถูกลบ และสมาชิกที่ต่ออายุอยู่แล้วยังจ่ายตามราคาที่ตกลงไว้`,
        `This creates ${data.creatable} new price(s) in Stripe (${data.livemode ? 'live' : 'test mode'}):\n${list}\nOld prices are kept, and existing renewals keep the price they agreed to.`),
      () => {
        setCreating(true); setNote(null);
        adminPaymentReadinessApi.createPrices(userId)
          .then(result => { if (isReadiness(result)) setData(result); setNote({ ok: true, text: copy(`สร้างราคาใน Stripe แล้ว ${result.created} รายการ`, `Created ${result.created} price(s) in Stripe`) }); })
          .catch(cause => setNote({ ok: false, text: (cause as Error).message }))
          .finally(() => setCreating(false));
      });
  };

  const status = data?.status;
  const badge = status === 'ready' ? { text: copy('รับชำระได้ทั้งบัตรและ QR', 'Card and QR payments work'), className: 'bg-brand-green-bg text-brand-green-acc' }
    : status === 'blocked' ? { text: copy('ยังรับชำระไม่ได้', 'Payments are not working'), className: 'bg-brand-pink-bg text-brand-pink-acc' }
      : status === 'unknown' ? { text: copy('ตรวจได้ไม่ครบ', 'Partly checked'), className: 'bg-brand-yellow-bg text-brand-yellow-acc' } : null;
  const checked = data && new Date(data.checkedAt).toLocaleString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <section aria-labelledby="payment-ready-title" data-testid="payment-readiness" data-status={status || 'loading'} className={`${uiSurface} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border/60 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="payment-ready-title" className="text-[15px] font-semibold">{copy('ระบบชำระเงิน', 'Payments')}</h2>
            {badge && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-[1.5] ${badge.className}`}>{badge.text}</span>}
          </div>
          <p className="mt-1 text-xs leading-[1.5] text-brand-muted"><CreditCard size={12} className="mr-1 inline" aria-hidden /><QrCode size={12} className="mr-1 inline" aria-hidden />{copy('ตรวจกับ Stripe ด้วยคีย์ของเซิร์ฟเวอร์', 'Checked with Stripe using the server key')}{data && <> · {data.livemode ? copy('บัญชีจริง', 'Live') : copy('โหมดทดสอบ', 'Test mode')} · {checked}</>}</p>
        </div>
        <button type="button" onClick={() => { setNote(null); setRetry(value => value + 1); }} disabled={loading || creating} className={secondary} aria-label={copy('ตรวจระบบชำระเงินอีกครั้ง', 'Check payments again')}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /><span className="text-xs">{copy('ตรวจอีกครั้ง', 'Check again')}</span>
        </button>
      </div>
      {loading && !data ? (
        <div className="space-y-3 p-5 sm:p-6" role="status" aria-label={copy('กำลังตรวจระบบชำระเงิน', 'Checking payments')}>
          {[0, 1, 2].map(item => <SkeletonBlock key={item} className="h-10 w-full" />)}
        </div>
      ) : data && (
        <div className="p-5 pt-2 sm:p-6 sm:pt-3">
          {data.status === 'ready' && data.nextPriceReady !== false && !data.creatable && !note && (
            <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="payment-ready-rows"
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-acc">
              {expanded ? copy('ซ่อนรายละเอียด', 'Hide details') : copy('ดูรายละเอียด', 'Show details')}<ChevronDown size={14} className={expanded ? 'rotate-180' : ''} aria-hidden />
            </button>
          )}
          {(expanded || data.status !== 'ready' || data.nextPriceReady === false || data.creatable > 0 || note) && <ul id="payment-ready-rows" className="divide-y divide-brand-border/60" role="list">
            {rowsOf(data, copy, appHost).map(row => {
              const State = tone[row.state].icon;
              const Icon = row.icon;
              return (
                <li key={row.key} data-check={row.key} data-state={row.state} className="flex items-start gap-3 py-3">
                  <Icon size={16} className="mt-0.5 shrink-0 text-brand-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-[1.5]">{row.title}</p>
                    {row.lines.map(line => <p key={line} className="mt-0.5 break-words text-xs leading-[1.5] text-brand-muted">{line}</p>)}
                    {row.fix && <p className="mt-1 break-words text-[11.5px] leading-[1.5] text-brand-text">{row.fix}</p>}
                  </div>
                  <State size={18} className={`mt-0.5 shrink-0 ${tone[row.state].className}`} aria-label={row.state === 'ok' ? copy('พร้อม', 'Ready') : row.state === 'problem' ? copy('ต้องแก้', 'Needs a fix') : copy('ตรวจไม่ได้', 'Not checked')} />
                </li>
              );
            })}
          </ul>}
          {data.creatable > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-brand-border/60 pt-4">
              <button type="button" className={primary} onClick={create} disabled={creating || loading}>
                {creating ? copy('กำลังสร้างราคา…', 'Creating prices…') : copy(`สร้างราคาที่ขาดใน Stripe (${data.creatable} รายการ)`, `Create missing prices in Stripe (${data.creatable})`)}
              </button>
              <p className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-brand-muted">{copy('ยืนยันก่อนสร้าง ราคาเดิมไม่ถูกลบ', 'You confirm first. Old prices are kept.')}</p>
            </div>
          )}
          {note && <p role="status" className={`mt-3 text-xs leading-[1.5] ${note.ok ? 'text-brand-green-acc' : 'text-brand-pink-acc'}`}>{note.text}</p>}
        </div>
      )}
    </section>
  );
}
