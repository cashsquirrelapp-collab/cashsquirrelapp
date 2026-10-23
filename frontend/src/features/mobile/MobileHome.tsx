import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useTransform } from 'motion/react';
import { KsIcon, type KsIconName } from './icons';
import { useCollapsingCard } from './useCollapsingCard';
import { useFitFigures } from './useFitFigures';

import { tr } from '../../i18n/tr';
// "ภาพรวม" on phones. It only draws: every figure and every handler comes from DashboardTab, so the
// numbers are the same ones the desktop shows. Layout follows the owner's "02 — Bold header"
// reference (2026-10-20): a terracotta header holding net profit and three month figures, four round
// shortcuts under it, then money owed, the next date and the latest money in and out. The logo,
// greeting and bell sit in the top bar above (MobileHeader's hero variant), in the same colour.

const HIDE_KEY = 'ksm_hide_amounts';
// Hiding the figures is a per-device convenience, so browser storage is enough; it may be unavailable.
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

/** The design's bottom sheet: grip, title, close button, scrolling content. */
export function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = React.useId();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="ksm">
      <div className="ksm-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="ksm-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ksm-sheet-grip" aria-hidden="true" />
        <header className="ksm-sheet-header">
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>
          <button type="button" className="ksm-sheet-close" onClick={onClose} aria-label={tr("ปิดหน้าต่าง")}><KsIcon name="close" /></button>
        </header>
        <div className="ksm-sheet-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export type MobileHomeNext = { day: number; month: string; caption: string; title: string; onOpen: () => void };
export type MobileHomeActivity = { key: string; label: string; sub: string; date: string; amount: string; isIncome: boolean };

export interface MobileHomeProps {
  fullFeatureAccess?: boolean;
  /** Pending money, quick pay and the receivables page. Default: fullFeatureAccess. */
  receivablesAccess?: boolean;
  /** Quotations can be issued. Default: fullFeatureAccess. */
  quotationAccess?: boolean;
  monthPicker: React.ReactNode;
  /** Received minus expenses, before money moved to savings goals: the large figure in the header. */
  profit: string;
  /** Change from last month, e.g. "+12% จากเดือนก่อน"; null when last month had no profit to compare. */
  profitTrend: { text: string; up: boolean } | null;
  /** The same for the month's work value: the pill beside the large figure. */
  workTrend: { text: string; up: boolean } | null;
  received: string;
  /** All of the month's expenses, the same total the desktop's รายจ่าย card shows. */
  expense: string;
  /** The month's work value: the large figure in the header (owner, 2026-10-20: work value and net profit swapped). */
  workLabel: string;
  workValue: string;
  /** e.g. "3 งานในเดือน". */
  workDetail: string;
  hasPending: boolean;
  next: MobileHomeNext | null;
  /** The latest money in and out, newest first (the desktop's รายการล่าสุด). */
  recent: MobileHomeActivity[];
  onNet: () => void;
  onReceived: () => void;
  onExpense: () => void;
  onWork: () => void;
  onAllActivity: () => void;
  onReceivables: () => void;
  onQuickPay: () => void;
  onAddIncome: () => void;
  onAddExpense: () => void;
  onDocuments: () => void;
  onGoals: () => void;
  onFeedback?: () => void;
  onCalendar: () => void;
  onTools: () => void;
}

export function MobileHome(props: MobileHomeProps) {
  const { fullFeatureAccess = false, receivablesAccess = fullFeatureAccess, quotationAccess = fullFeatureAccess } = props;
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [hidden, setHidden] = React.useState(readHidden);
  const toggleHidden = () => setHidden(current => {
    try { localStorage.setItem(HIDE_KEY, current ? '0' : '1'); } catch { /* still hides for this visit */ }
    return !current;
  });
  const money = (value: string) => (hidden ? '฿••••••' : value);
  const closeMore = React.useCallback(() => setMoreOpen(false), []);
  const pendingStatus = props.hasPending ? tr("มีรายการรอรับ") : tr("ไม่มีรายการรอรับ");
  const quick: { label: string; icon: KsIconName; level: 'primary' | 'secondary' | 'tertiary'; run: () => void }[] = [
    receivablesAccess
      ? { label: tr("รับเงินด่วน"), icon: 'arrowDown', level: 'primary', run: props.onQuickPay }
      : { label: tr("ออกเอกสาร"), icon: 'document', level: 'primary', run: props.onDocuments },
    { label: tr("เพิ่มรายรับ"), icon: 'arrowUp', level: 'secondary', run: props.onAddIncome },
    { label: tr("เพิ่มรายจ่าย"), icon: 'wallet', level: 'secondary', run: props.onAddExpense },
    { label: tr("เพิ่มเติม"), icon: 'more', level: 'secondary', run: () => setMoreOpen(true) },
  ];
  const more: { title: string; description: string; icon: KsIconName; run: () => void }[] = [
    { title: tr("ออกเอกสาร"), description: quotationAccess ? tr("เสนอราคา แจ้งหนี้ หรือใบเสร็จ") : tr("ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษี"), icon: 'document', run: props.onDocuments },
    fullFeatureAccess
      ? { title: tr("เป้าหมายออม"), description: tr("แบ่งเงินและติดตามความคืบหน้า"), icon: 'target', run: props.onGoals }
      : { title: tr("บอกเรา"), description: tr("แจ้งปัญหา เสนอไอเดีย หรือคุยกับทีม"), icon: 'chat', run: props.onFeedback ?? props.onTools },
    { title: tr("ปฏิทิน"), description: receivablesAccess ? tr("วันส่งงานและวันครบกำหนดรับเงิน") : tr("วันส่งงานและรายการในปฏิทิน"), icon: 'calendar', run: props.onCalendar },
  ];
  const card = useCollapsingCard();
  // Large amounts stay whole, only smaller; the layout never changes (useFitFigures).
  const heroRef = React.useRef<HTMLDivElement>(null);
  useFitFigures(heroRef, [hidden, props.workValue, props.received, props.expense, props.profit, props.workTrend?.text ?? props.workDetail, props.profitTrend?.text].join('|'));
  // Everything the card does while it closes follows one value, 0 (open) to 1 (bar).
  const metricsOpacity = useTransform(card.progress, [0, 0.45], [1, 0]);
  const metricsY = useTransform(card.progress, [0, 1], [0, -12]);
  const trendOpacity = useTransform(card.progress, [0, 0.3], [1, 0]);
  const monthOpacity = useTransform(card.progress, [0.25, 0.6], [1, 0]);
  const detailPointer = useTransform(card.progress, p => (p > 0.4 ? 'none' : 'auto'));
  const monthPointer = useTransform(card.progress, p => (p > 0.5 ? 'none' : 'auto'));
  const radius = useTransform(card.progress, [0, 1], [22, 18]);
  // Ends 74px above the open card's bottom; reaches 14px below the bar once closed.
  const backdropHeight = useTransform([card.height, card.progress], ([h, p]: number[]) => 8 + h - (74 - 88 * p));
  const metrics: { key: string; label: string; value: string; detail?: string; open: () => void }[] = [
    { key: 'received', label: tr("รับเงินจริง"), value: props.received, open: props.onReceived },
    { key: 'expense', label: tr("รายจ่ายรวม"), value: props.expense, open: props.onExpense },
    { key: 'profit', label: tr("กำไรสุทธิ"), value: props.profit, detail: props.profitTrend?.text, open: props.onNet },
  ];
  return (
    <div className="ksm ksm-home" ref={card.rootRef}>
      <h2 id="dashboard-title" className="ksm-sr-only">{tr("ภาพรวม")}</h2>

      {/* Pinned under the top bar; it closes into a one-line bar as the page scrolls (useCollapsingCard). */}
      <section className="ksm-summary" aria-label={tr("สรุปเงินของเดือน")} style={card.expanded ? { height: card.expanded + 18 } : undefined}>
        {/* The terracotta of the top bar runs on behind the card's upper part, and behind all of the bar when closed. */}
        <motion.div className="ksm-hero-backdrop" aria-hidden="true" style={{ height: backdropHeight }} />
        <div className="ksm-hero" ref={heroRef}>
          <motion.div className="ksm-hero-clip" style={{ height: card.expanded ? card.height : undefined, borderRadius: radius }}
            onClick={event => { if (card.progress.get() > 0.5 && !(event.target as HTMLElement).closest('button')) card.open(); }}>
            <div className="ksm-hero-inner" ref={card.innerRef}>
              <div className="ksm-hero-row" ref={card.labelRef}>
                <div className="ksm-hero-label">
                  <KsIcon name="bars" size={17} />
                  <span>{props.workLabel}</span>
                  <button type="button" className="ksm-eye" onClick={toggleHidden} aria-pressed={hidden}
                    aria-label={hidden ? tr("แสดงตัวเลข") : tr("ซ่อนตัวเลข")} title={hidden ? tr("แสดงตัวเลข") : tr("ซ่อนตัวเลข")}>
                    <KsIcon name={hidden ? 'eyeOff' : 'eye'} size={17} />
                  </button>
                </div>
              </div>
              <div className="ksm-hero-figure">
                <motion.button ref={card.amountRef} type="button" className="ksm-net" onClick={props.onWork} aria-label={tr("{0} {1} · ดูที่มา", props.workLabel, money(props.workValue))}
                  style={{ x: card.amountX, y: card.amountY, scale: card.amountScale, transformOrigin: '0 0' }}>
                  <strong data-metric="work" key={hidden ? 'hidden' : props.workValue}>{money(props.workValue)}</strong>
                </motion.button>
                {/* The change from last month, or how many jobs make up the figure when there is nothing to compare. */}
                <motion.span className={`ksm-trend ${props.workTrend ? (props.workTrend.up ? 'is-up' : 'is-down') : 'is-plain'}`} style={{ opacity: trendOpacity }}>{props.workTrend?.text ?? props.workDetail}</motion.span>
              </div>
              <motion.div className="ksm-hero-metrics" style={{ opacity: metricsOpacity, y: metricsY, pointerEvents: detailPointer }}>
                {metrics.map(metric => (
                  <button key={metric.key} type="button" onClick={metric.open} aria-label={tr("{0} {1} · ดูที่มา", metric.label, money(metric.value))}>
                    <span>{metric.label}</span>
                    <b data-metric={metric.key} key={hidden ? 'hidden' : metric.value}>{money(metric.value)}</b>
                    {metric.detail && <small>{metric.detail}</small>}
                  </button>
                ))}
              </motion.div>
            </div>
          </motion.div>
          {/* Outside the clipped card so its month list can open over the page. */}
          <motion.div className="ksm-hero-month" style={{ opacity: monthOpacity, pointerEvents: monthPointer }}>{props.monthPicker}</motion.div>
        </div>
      </section>

      <section className="ksm-actions" aria-label={tr("ทางลัดทำรายการ")}>
        {quick.map(action => (
          <button key={action.label} type="button" className={`ksm-quick is-${action.level}`} onClick={action.run}>
            <span className="ksm-quick-icon"><KsIcon name={action.icon} size={22} /></span>
            <span>{action.label}</span>
          </button>
        ))}
      </section>

      {receivablesAccess && <button type="button" className={`ksm-notice ${props.hasPending ? 'has-pending' : 'is-empty'}`} onClick={props.onReceivables}
        aria-label={tr("เงินรอรับ · {0} · เปิดดูยอดและรายละเอียด", pendingStatus)}>
        <span className="ksm-notice-icon"><KsIcon name="briefcase" size={21} /></span>
        <span className="ksm-grow">
          <span className="ksm-notice-label">{tr("เงินรอรับ")}{props.hasPending && <i aria-hidden="true" />}</span>
          <span className="ksm-notice-status">{pendingStatus}</span>
        </span>
        <KsIcon name="chevron" size={17} />
      </button>}

      <div className="ksm-section-title">
        <h3>{tr("กำหนดถัดไป")}</h3>
        <button type="button" className="ksm-link" onClick={props.onCalendar}>{tr("ปฏิทิน")}{' '}<KsIcon name="chevron" size={17} /></button>
      </div>
      {props.next ? (
        <button type="button" className="ksm-agenda" onClick={props.next.onOpen}>
          <span className="ksm-date"><b>{props.next.day}</b><small>{props.next.month}</small></span>
          <span className="ksm-agenda-body">
            <span className="ksm-grow"><small><i aria-hidden="true" />{props.next.caption}</small><b>{props.next.title}</b></span>
            <KsIcon name="chevron" size={17} />
          </span>
        </button>
      ) : <p className="ksm-quiet">{tr("ยังไม่มีกำหนดที่จะถึงในเดือนนี้")}</p>}

      <div className="ksm-section-title">
        <h3>{tr("รายการล่าสุด")}</h3>
        <button type="button" className="ksm-link" onClick={props.onAllActivity}>{tr("ดูทั้งหมด")}{' '}<KsIcon name="chevron" size={17} /></button>
      </div>
      {props.recent.length ? (
        <ul className="ksm-activity" aria-label={tr("รายการล่าสุด")}>
          {props.recent.map(item => (
            <li key={item.key} className={item.isIncome ? 'is-in' : 'is-out'}>
              <span className="ksm-activity-icon"><KsIcon name={item.isIncome ? 'arrowDown' : 'wallet'} size={20} /></span>
              <span className="ksm-grow"><b>{item.label}</b><small>{item.sub} • {item.date}</small></span>
              <strong>{hidden ? '••••' : item.amount}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="ksm-quiet">{tr("ยังไม่มีรายการรับเงินหรือรายจ่าย")}</p>}

      <button type="button" className="ksm-tools-entry" onClick={props.onTools}>
        <span><KsIcon name="grid" size={17} />{tr("เครื่องมือทั้งหมด")}</span>
        <small>{fullFeatureAccess ? tr("เอกสาร · รายงาน · ภาษี") : tr("เอกสาร · ปฏิทิน · บอกเรา")}</small>
        <KsIcon name="chevron" size={17} />
      </button>

      {moreOpen && (
        <MobileSheet title={tr("ทำรายการเพิ่มเติม")} onClose={closeMore}>
          <p className="ksm-sheet-intro">{tr("เลือกสิ่งที่ต้องการทำต่อ")}</p>
          <div className="ksm-list">
            {more.map(item => (
              <button key={item.title} type="button" onClick={() => { closeMore(); item.run(); }}>
                <span className="ksm-list-icon"><KsIcon name={item.icon} size={22} /></span>
                <span className="ksm-grow"><b>{item.title}</b><p>{item.description}</p></span>
                <KsIcon name="chevron" size={16} />
              </button>
            ))}
          </div>
          <button type="button" className="ksm-sheet-all" onClick={() => { closeMore(); props.onTools(); }}>
            <KsIcon name="grid" size={17} />{tr("เครื่องมือทั้งหมด")}<KsIcon name="chevron" size={17} />
          </button>
          <p className="ksm-hint">{fullFeatureAccess ? tr("รายงาน ภาษี คลังไฟล์ และการตั้งค่า ยังใช้บนมือถือได้") : tr("จัดการงาน รายรับรายจ่าย และเอกสารได้จากมือถือ")}</p>
        </MobileSheet>
      )}
    </div>
  );
}
