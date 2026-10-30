import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Radar, X } from 'lucide-react';
import type { Job } from '../../../../../shared/types';
import { dateLocale, formatCurrency } from '../../../utils';
import { tr } from '../../../i18n/tr';
import { bangkokToday, buildCreditRadar, type CreditRadarData, type RadarItem, type RadarStatus } from './radarData';
import { CreditCard, daysLabel } from './CreditCard';
import type { ScreenLine } from './HoloScreen';
import { HolographicSquirrel } from './HolographicSquirrel';
import { ConnectionLines, type LineTarget } from './ConnectionLines';
import { RadarSummary } from './RadarSummary';
import './creditRadar.css';

// KRAROK — FULLSCREEN HOLOGRAPHIC CREDIT RADAR (owner's brief, 2026-10-30), computers only (a mouse and 1024px+); iPads
// keep the report dialog and phones their alert. Opens over the whole window from the once-a-day overdue check and
// closes back to the page underneath (the close button, Esc, or opening a job). The jobs are the app's own, read live:
// a payment recorded elsewhere turns its card green.

const CARD_H = 180;
/** A card's height in the tall layout (two across, so the same card is a little shorter than in a side column). */
const CARD_H_TALL = 176;
const GROUP_ORDER: RadarStatus[] = ['overdue', 'soon', 'received', 'later'];
const groupLabel = (key: RadarStatus) => (key === 'overdue' ? tr("เกินกำหนด") : key === 'soon' ? tr("ใกล้ครบกำหนด") : key === 'received' ? tr("รับเงินแล้ว") : tr("ยังไม่ถึงกำหนด"));
const GAP = 16;


function useElementSize(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const read = () => setSize(current => (current.w === el.clientWidth && current.h === el.clientHeight ? current : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, active]);
  return size;
}

function AllItems({ data, onOpen, onClose }: { data: CreditRadarData; onOpen: (id: string) => void; onClose: () => void }) {
  const groups: { key: RadarStatus; title: string; items: RadarItem[] }[] = [
    { key: 'overdue', title: tr("เกินกำหนด"), items: data.overdue },
    { key: 'soon', title: tr("ใกล้ครบกำหนด (7 วัน)"), items: data.soon },
    { key: 'received', title: tr("รับเงินแล้ว (7 วันล่าสุด)"), items: data.received },
    { key: 'later', title: tr("ยังไม่ถึงกำหนด"), items: data.later },
  ];
  return (
    <motion.aside className="cra" role="region" aria-label={tr("รายการทั้งหมด")} data-testid="radar-all"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
      <div className="cra-head">
        <p className="cra-title">{tr("รายการทั้งหมด")}</p>
        <button type="button" className="cra-close" onClick={onClose} aria-label={tr("ปิดรายการทั้งหมด")}><X className="h-4 w-4" strokeWidth={2.2} /></button>
      </div>
      <div className="cra-body">
        {groups.filter(group => group.items.length).map(group => (
          <section key={group.key} className="cra-group">
            <p className={`cra-group-title is-${group.key}`}>{group.title}<span>{tr("{0} รายการ", group.items.length)} · {formatCurrency(group.items.reduce((sum, item) => sum + item.amount, 0))}</span></p>
            {group.items.map(item => (
              <button key={item.id} type="button" className="cra-row" onClick={() => onOpen(item.id)}>
                <span className="cra-row-who"><span className="cra-row-client">{item.client || item.name}</span><span className="cra-row-job">{item.name}</span></span>
                <span className="cra-row-end"><span className="cra-row-amount">{formatCurrency(item.amount)}</span><span className={`cra-row-days is-${item.status}`}>{daysLabel(item)}</span></span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </motion.aside>
  );
}

export function CreditRadar({ open, jobs, loading = false, onClose, onOpenJob, onOpenReceivables }: {
  open: boolean;
  jobs: Job[];
  loading?: boolean;
  onClose: () => void;
  onOpenJob: (id: string) => void;
  onOpenReceivables: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const hubRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const cardRefs = React.useRef(new Map<string, HTMLElement>());
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [picked, setPicked] = React.useState<RadarStatus | null>(null);
  const openedAt = React.useRef(0);
  React.useEffect(() => { if (open) openedAt.current = performance.now(); }, [open]);
  const [page, setPage] = React.useState(0);
  const showAllRef = React.useRef(false);
  showAllRef.current = showAll;
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const stage = useElementSize(stageRef, open);
  // A safety net: once closed, the radar is gone within 0.7 s even if its fade-out never reports back, so an invisible
  // layer can never sit over the page.
  const [present, setPresent] = React.useState(open);
  React.useEffect(() => {
    if (open) { setPresent(true); return; }
    const timer = window.setTimeout(() => setPresent(false), 700);
    return () => window.clearTimeout(timer);
  }, [open]);

  const today = React.useMemo(() => bangkokToday(), [open]);
  const result = React.useMemo((): { data: CreditRadarData | null; failed: boolean } => {
    try { return { data: buildCreditRadar(jobs, today), failed: false }; } catch { return { data: null, failed: true }; }
  }, [jobs, today]);
  const data = result.data;

  // Two layouts. Wide (computers, iPads in landscape): cards in a column on each side of the radar, as many as fit the
  // height (one to four a side). Tall (iPads in portrait): the radar on top, the cards two by two under it, as many rows
  // as leave the radar at least 340px. Cards never overlap and never leave the screen.
  const tall = stage.w > 0 && (stage.w < 900 || stage.w / Math.max(1, stage.h) < 1.2);
  const perSide = Math.max(1, Math.min(4, Math.floor((stage.h + GAP) / (CARD_H + GAP)) || 3));
  const tallRadar = (rows: number) => Math.min(stage.w - 32, stage.h - rows * (CARD_H_TALL + GAP) - 8, 560);
  const tallRows = [3, 2, 1].find(rows => tallRadar(rows) >= 340) ?? 1;
  // One status at a time (owner, 2026-10-30: "เกินกำหนด 9 รายการ ก็ขึ้นแค่ 9 รายการที่เกินกำหนด"): the tabs pick it, the cards,
  // the lines and the squirrel's screen all show that status only; more than fit turn over in pages.
  const groups: Record<RadarStatus, RadarItem[]> | null = data ? { overdue: data.overdue, soon: data.soon, received: data.received, later: data.later } : null;
  const firstGroup = GROUP_ORDER.find(key => groups?.[key].length) ?? 'overdue';
  const active: RadarStatus = picked && groups?.[picked].length ? picked : firstGroup;
  const list = groups ? groups[active] : [];
  const room = Math.max(1, tall ? tallRows * 2 : perSide * 2);
  const pages = Math.max(1, Math.ceil(list.length / room));
  const pageNow = Math.min(page, pages - 1);
  const shown = list.slice(pageNow * room, pageNow * room + room);
  const left = shown.filter((_, i) => i % 2 === 0), right = shown.filter((_, i) => i % 2 === 1);
  const total = data ? data.overdue.length + data.soon.length + data.received.length + data.later.length : 0;
  const colWidth = Math.round(Math.min(360, Math.max(256, stage.w * 0.25)));
  const centerWidth = Math.max(0, stage.w - 2 * colWidth - 2 * 32);
  const radarSize = Math.round(Math.max(240, tall ? tallRadar(tallRows) : Math.min(centerWidth, stage.h - 8, 620)));
  const showExtras = radarSize >= 340;
  const targets: LineTarget[] = tall
    ? shown.map(item => ({ id: item.id, status: item.status, side: 'top' as const }))
    : [...left.map(item => ({ id: item.id, status: item.status, side: 'left' as const })), ...right.map(item => ({ id: item.id, status: item.status, side: 'right' as const }))];
  // What the squirrel types onto its screen: the jobs of the status on show.
  const screenLines: ScreenLine[] = list.slice(0, 40).map(item => ({ key: item.id, name: item.client || item.name, amount: formatCurrency(item.amount), tone: item.status }));
  const screenCounts = data ? { overdue: data.overdue.length, soon: data.soon.length, received: data.received.length } : { overdue: 0, soon: 0, received: 0 };
  const longDate = new Date(`${today}T00:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

  // Esc closes the list first, then the radar; Tab stays inside; focus returns where it was.
  React.useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (showAllRef.current) setShowAll(false); else onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !rootRef.current) return;
      const focusable = [...rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);
  React.useEffect(() => { if (!open) { setShowAll(false); setHovered(null); setPicked(null); setPage(0); } }, [open]);
  // Back to the first page when the status or the room changes.
  React.useEffect(() => { setPage(0); }, [active, room]);
  const pick = (key: RadarStatus) => { setPicked(key); setPage(0); setHovered(null); };
  // The pages: beside the tabs on wide screens, in the summary bar on tall ones (so the tabs keep one row).
  const pagerNode = pages > 1 ? (
    <div className="cr-pager" data-testid="radar-pager">
      <button type="button" onClick={() => setPage(pageNow - 1)} disabled={pageNow === 0} aria-label={tr("หน้าก่อน")}><ChevronLeft className="h-4 w-4" strokeWidth={2.2} /></button>
      <span>{tr("{0}–{1} จาก {2}", pageNow * room + 1, pageNow * room + shown.length, list.length)}</span>
      <button type="button" onClick={() => setPage(pageNow + 1)} disabled={pageNow >= pages - 1} aria-label={tr("หน้าถัดไป")}><ChevronRight className="h-4 w-4" strokeWidth={2.2} /></button>
    </div>
  ) : null;
  // Cards wait until the stage has its size, so none come in only to leave again.
  const ready = stage.w > 0 && stage.h > 0;

  // Loops pause while the tab is hidden.
  React.useEffect(() => {
    if (!open) return;
    const sync = () => rootRef.current?.classList.toggle('is-paused', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [open]);

  // A light parallax with the mouse: CSS variables set once a frame, no React render.
  const frame = React.useRef(0);
  const onMouseMove = (event: React.MouseEvent) => {
    if (reduce || !rootRef.current) return;
    const { innerWidth: w, innerHeight: h } = window;
    const x = (event.clientX / w - 0.5) * 2, y = (event.clientY / h - 0.5) * 2;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      rootRef.current?.style.setProperty('--mx', x.toFixed(3));
      rootRef.current?.style.setProperty('--my', y.toFixed(3));
    });
  };

  // One card in its slot; n is its place in the order the cards come in.
  // Cards leave at once and the new ones slide in (a page or status change), so the old cards never hold places in the
  // columns and every line is measured against where the cards really end up. Right after opening they come in after
  // the squirrel; later, almost at once.
  const slot = (item: RadarItem, n: number, from: 'left' | 'right' | 'below') => (
    <motion.div key={`${active}:${pageNow}:${item.id}`} className="cr-slot"
      ref={el => { if (el) cardRefs.current.set(item.id, el); else cardRefs.current.delete(item.id); }}
      initial={reduce ? false : { opacity: 0, x: from === 'left' ? -36 : from === 'right' ? 36 : 0, y: from === 'below' ? 30 : 0, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ duration: 0.55, delay: reduce ? 0 : (performance.now() - openedAt.current < 1500 ? 0.35 : 0.04) + n * 0.06, ease: [0.22, 1, 0.36, 1] }}>
      <div className="cr-float" style={{ animationDuration: `${5.6 + (n % 4) * 0.7}s`, animationDelay: `${-(n * 1.3)}s` }}>
        <CreditCard item={item} today={today} dimmed={hovered !== null && hovered !== item.id} onHover={setHovered} onOpen={onOpenJob} />
      </div>
    </motion.div>
  );
  const cardList = (list: RadarItem[], side: 'left' | 'right') => (
    <div className={`cr-col is-${side}`}>
      {ready && list.map((item, i) => slot(item, i * 2 + (side === 'right' ? 1 : 0), side))}
    </div>
  );

  if (!open && !present) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div ref={rootRef} className={`cr${reduce ? ' is-still' : ''}${tall ? ' is-tall' : ''}`} role="dialog" aria-modal="true" aria-label={tr("เรดาร์เครดิตเทอม")} data-testid="credit-radar"
          onMouseMove={onMouseMove}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.01 : 0.4 }}>
          <span className="cr-ambient" aria-hidden="true" />
          <span className="cr-grid" aria-hidden="true" />
          <motion.div className="cr-scene" initial={reduce ? false : { scale: 1.03 }} animate={{ scale: 1 }} exit={{ scale: 0.985 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <header className="cr-head">
              <div className="cr-head-text">
                <p className="cr-eyebrow"><Radar className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{tr("เรดาร์เครดิตเทอม · ข้อมูล ณ {0}", longDate)}</p>
                <h2 className="cr-title">{data && data.totals.followUp > 0 ? tr("ต้องติดตาม {0} รายการ", data.totals.followUp) : tr("เรดาร์เครดิตเทอม")}</h2>
                {groups && total > 0 && (
                  <div className="cr-tabs">
                    <div className="cr-tablist" role="tablist" aria-label={tr("สถานะที่แสดง")}>
                      {GROUP_ORDER.map(key => (
                        <button key={key} type="button" role="tab" aria-selected={key === active} disabled={!groups[key].length}
                          className={`cr-tab is-${key}${key === active ? ' is-on' : ''}`} onClick={() => pick(key)} data-testid={`radar-tab-${key}`}>
                          <span className="cr-tab-dot" aria-hidden="true" />{groupLabel(key)}<span className="cr-tab-count">{groups[key].length}</span>
                        </button>
                      ))}
                    </div>
                    {!tall && pagerNode}
                  </div>
                )}
              </div>
              <button ref={closeRef} type="button" className="cr-close" onClick={onClose} aria-label={tr("ปิดเรดาร์")} data-testid="radar-close">
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </header>

            <main ref={stageRef} className={`cr-stage${tall ? ' is-tall' : ''}`} style={tall ? undefined : { gridTemplateColumns: `${colWidth}px minmax(0, 1fr) ${colWidth}px` }}>
              {loading ? (
                <div className="cr-state"><HolographicSquirrel ref={hubRef} size={Math.min(320, radarSize)} reduce={reduce} /><p>{tr("กำลังโหลดข้อมูล")}</p></div>
              ) : result.failed || !data ? (
                <div className="cr-state"><p className="cr-state-title">{tr("แสดงเรดาร์ไม่ได้ในขณะนี้")}</p><p>{tr("ดูรายการทั้งหมดได้ที่หน้าเงินรอรับ")}</p></div>
              ) : total === 0 ? (
                <div className="cr-state"><HolographicSquirrel ref={hubRef} size={Math.min(320, radarSize)} reduce={reduce} /><p className="cr-state-title">{tr("ตอนนี้ไม่มีรายการที่ต้องติดตาม")}</p></div>
              ) : tall ? (
                <>
                  <ConnectionLines stageRef={stageRef} hubRef={hubRef} cardRefs={cardRefs} targets={targets} hovered={hovered} reduce={reduce}
                    layoutKey={`tall:${stage.w}x${stage.h}:${targets.map(target => target.id).join(',')}`} />
                  <div className="cr-center is-top" style={{ height: radarSize }}>
                    <HolographicSquirrel ref={hubRef} size={radarSize} reduce={reduce}
                      screen={showExtras ? { lines: screenLines, counts: screenCounts, rows: radarSize >= 420 ? 3 : 2 } : undefined} />
                  </div>
                  <div className="cr-cards">
                    {ready && shown.map((item, n) => slot(item, n, 'below'))}
                  </div>
                </>
              ) : (
                <>
                  <ConnectionLines stageRef={stageRef} hubRef={hubRef} cardRefs={cardRefs} targets={targets} hovered={hovered} reduce={reduce}
                    layoutKey={`${stage.w}x${stage.h}:${targets.map(target => target.id).join(',')}`} />
                  {cardList(left, 'left')}
                  <div className="cr-center">
                    <HolographicSquirrel ref={hubRef} size={radarSize} reduce={reduce}
                      screen={showExtras ? { lines: screenLines, counts: screenCounts, rows: radarSize >= 420 ? 3 : 2 } : undefined} />
                  </div>
                  {cardList(right, 'right')}
                </>
              )}
            </main>

            {data && total > 0 && (
              <footer className="cr-foot">
                <RadarSummary data={data} hiddenCount={total - shown.length} reduce={reduce} onShowAll={() => setShowAll(true)} onOpenReceivables={onOpenReceivables}
                  leading={tall ? pagerNode : null} />
              </footer>
            )}
          </motion.div>
          <AnimatePresence>{showAll && data && <AllItems data={data} onOpen={onOpenJob} onClose={() => setShowAll(false)} />}</AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
