import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BellRing, Building2, CalendarClock } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { dateLocale, formatCurrency } from '../../utils';
import { tr } from '../../i18n/tr';
import './overdueReport.css';

// The overdue alert as a short report to the boss (owner, 2026-10-30). Round 1: "เหมือนกำลังรายงาน CEO ... liquid card";
// round 2: "ฟิลโฮโลแกรม แบบ mind map แตกแขนง ... ข้อความสรุปอีกฝั่ง"; round 3, from the owner's reference picture: "ฟีลๆ นี้
// ... แต่ให้ฟีลพื้นหลังดูเหมือนการเงิน". Computers and iPads; phones keep their alert.
// A dark hologram stage over a finance backdrop (price grid, candlesticks, a rising line): the report squirrel (the real
// picture, never redrawn) stands on a glowing Krarok stand; the total floats above it; the largest overdue jobs float
// around it as glass cards (client, amount, how late, sent -> due -> today), each joined to the squirrel by a branch;
// chips on the orbit count how late. Below, a short summary. Motion plays once; nothing moves with reduced motion.

export interface OverdueItem {
  id: string; name: string; client: string; pending: number; daysLate: number;
  /** The day the work was sent (postDate) and the day the money was due. */
  sentOn?: string | null; dueOn?: string | null;
}

type BucketKey = 'older' | 'month' | 'week';
const BUCKETS: { key: BucketKey; chip: () => string; label: () => string; test: (days: number) => boolean }[] = [
  { key: 'older', chip: () => tr("เกิน 30 วัน"), label: () => tr("เลยมาเกิน 30 วัน"), test: days => days > 30 },
  { key: 'month', chip: () => tr("8–30 วัน"), label: () => tr("เลยมา 8–30 วัน"), test: days => days > 7 && days <= 30 },
  { key: 'week', chip: () => tr("1–7 วัน"), label: () => tr("เลยมา 1–7 วัน"), test: days => days <= 7 },
];
const bucketOf = (days: number): BucketKey => (days > 30 ? 'older' : days > 7 ? 'month' : 'week');
const sum = (list: OverdueItem[]) => list.reduce((total, item) => total + item.pending, 0);
const COMPANY = /บริษัท|จำกัด|หจก|ห้าง|ร้าน|สตูดิโอ|สำนักงาน|studio|\bco\b|co\.|ltd|inc|company|shop|store|agency|market|tech/i;
const initialOf = (name: string) => (name.replace(/^[เแโใไ\s]+/, '').trim()[0] || '?').toUpperCase();

// The stage in px, wide (computers) and narrow (iPads, 744–1023px). Text never scales.
const STAGES = {
  wide: { w: 892, h: 452, card: 236, center: 212, hubY: 292, mascot: 164, rx: 172, chips: true },
  narrow: { w: 660, h: 452, card: 196, center: 188, hubY: 292, mascot: 148, rx: 140, chips: false },
};
type Stage = typeof STAGES.wide;
const CARD_TOP = [22, 244];

function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = React.useState(() => typeof window === 'undefined' || window.matchMedia(query).matches);
  React.useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setWide(list.matches);
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, []);
  return wide;
}

function useCountUp(target: number, run: boolean) {
  const [value, setValue] = React.useState(run ? 0 : target);
  React.useEffect(() => {
    if (!run) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - 650) / 800));
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return value;
}

/** Price grid, candlesticks and a rising line: the finance backdrop. Shapes only, no text. */
function FinanceBackdrop({ w, h, glowId, reduce }: { w: number; h: number; glowId: string; reduce: boolean }) {
  const candles = React.useMemo(() => {
    const list: { x: number; open: number; close: number; high: number; low: number }[] = [];
    let level = h * 0.78;
    for (let i = 0, x = 14; x < w - 8; i++, x += 22) {
      const drift = -h * 0.011 + Math.sin(i * 1.7) * h * 0.035 + Math.cos(i * 0.6) * h * 0.012;
      const open = level, close = level + drift;
      list.push({ x, open, close, high: Math.min(open, close) - 6 - Math.abs(Math.sin(i * 2.3)) * 12, low: Math.max(open, close) + 5 + Math.abs(Math.cos(i * 1.1)) * 10 });
      level = Math.max(h * 0.34, Math.min(h * 0.86, close));
    }
    return list;
  }, [w, h]);
  const trend = React.useMemo(() => {
    const points = Array.from({ length: 13 }, (_, i) => [i * (w / 12), h * (0.74 - i * 0.032) + Math.sin(i * 1.9) * 16] as const);
    return points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  }, [w, h]);
  const grow = (i: number) => (reduce ? {} : { initial: { scaleY: 0, opacity: 0 }, animate: { scaleY: 1, opacity: 1 }, transition: { duration: 0.5, delay: 0.05 + i * 0.015, ease: [0.22, 1, 0.36, 1] as const } });
  return (
    <svg className="odr-fin" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${glowId}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB070" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#FFB070" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: Math.floor(h / 38) }, (_, i) => <line key={`h${i}`} x1="0" x2={w} y1={30 + i * 38} y2={30 + i * 38} className="odr-fin-grid" />)}
      {Array.from({ length: Math.floor(w / 56) + 1 }, (_, i) => <line key={`v${i}`} y1="0" y2={h} x1={i * 56} x2={i * 56} className="odr-fin-grid is-v" />)}
      {candles.map((candle, i) => {
        const up = candle.close <= candle.open;
        const top = Math.min(candle.open, candle.close), height = Math.max(3, Math.abs(candle.close - candle.open));
        return (
          <motion.g key={i} className={`odr-fin-candle${up ? ' is-up' : ''}`} style={{ transformOrigin: `${candle.x}px ${candle.low}px` }} {...grow(i)}>
            <line x1={candle.x} x2={candle.x} y1={candle.high} y2={candle.low} />
            <rect x={candle.x - 4} y={top} width="8" height={height} rx="1.5" />
          </motion.g>
        );
      })}
      <path d={`${trend} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${glowId}-area)`} />
      <motion.path d={trend} className="odr-fin-trend" filter={`url(#${glowId})`}
        {...(reduce ? {} : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 1.3, delay: 0.1, ease: [0.45, 0, 0.2, 1] as const } })} />
    </svg>
  );
}

function JobCard({ item, today }: { item: OverdueItem; today: string }) {
  const short = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) : '–');
  const bucket = bucketOf(item.daysLate);
  return (
    <>
      <div className="odr-card-top">
        <span className="odr-avatar" aria-hidden="true">{COMPANY.test(item.client) ? <Building2 className="h-4 w-4" strokeWidth={2} /> : initialOf(item.client)}</span>
        <div className="odr-card-who">
          <p className="odr-card-client">{item.client}</p>
          <p className="odr-card-job">{item.name}</p>
        </div>
      </div>
      <div className="odr-card-money">
        <p className="odr-card-amount">{formatCurrency(item.pending)}</p>
        <div className="odr-card-status">
          <span className={`odr-pill is-${bucket}`}>{item.daysLate > 7 ? tr("เกินกำหนด") : tr("เพิ่งเลยกำหนด")}</span>
          <span className={`odr-late is-${bucket}`}>{tr("{0} วัน", item.daysLate)}</span>
        </div>
      </div>
      <div className={`odr-tl is-${bucket}`}>
        <div className="odr-tl-track" aria-hidden="true"><span className="odr-tl-done" /><span className="odr-tl-late" /><i /><i /><i /></div>
        <div className="odr-tl-labels">
          <p><span>{tr("ส่งงาน")}</span>{short(item.sentOn)}</p>
          <p><span>{tr("ครบกำหนด")}</span>{short(item.dueOn)}</p>
          <p className="is-now"><span>{tr("วันนี้")}</span>{today}</p>
        </div>
      </div>
    </>
  );
}

export function OverdueReport({ open, items: given, newToday, onOpen, onClose }: { open: boolean; items: OverdueItem[]; newToday: number; onOpen: () => void; onClose: () => void }) {
  const reduce = useReducedMotion() ?? false;
  // The scene stays while the dialog fades out after it is closed.
  const kept = React.useRef(given);
  if (open && given.length) kept.current = given;
  const items = kept.current;
  const glowId = `odr-glow-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stage: Stage = useWide() ? STAGES.wide : STAGES.narrow;

  const total = sum(items);
  const totalText = formatCurrency(Math.round(useCountUp(total, open && !reduce)));
  const now = new Date();
  const longDate = now.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  const shortToday = now.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

  // The four largest jobs float around the squirrel: largest top left, then top right, bottom left, bottom right.
  const cards = [...items].sort((a, b) => b.pending - a.pending || b.daysLate - a.daysLate).slice(0, 4);
  const hub = { x: stage.w / 2, y: stage.hubY };
  const place = (n: number) => {
    const left = n % 2 === 0;
    const x = left ? 12 : stage.w - 12 - stage.card;
    const y = CARD_TOP[Math.floor(n / 2)];
    return { left, x, y, edge: { x: left ? x + stage.card : x, y: y + 84 } };
  };
  const branch = (to: { x: number; y: number }) => {
    const bend = (to.x - hub.x) * 0.55;
    return `M ${hub.x} ${hub.y} C ${hub.x + bend} ${hub.y}, ${to.x - bend * 0.4} ${to.y}, ${to.x} ${to.y}`;
  };
  const centerX = (stage.w - stage.center) / 2;
  const branches = [
    { d: `M ${hub.x} ${hub.y - 70} L ${hub.x} 140`, key: 'month' as BucketKey, delay: 0.62 },
    ...cards.map((item, n) => ({ d: branch(place(n).edge), key: bucketOf(item.daysLate), delay: 0.78 + n * 0.08 })),
  ];
  const chips = [
    ...BUCKETS.map(bucket => ({ key: bucket.key, top: bucket.chip(), bottom: tr("{0} รายการ", items.filter(item => bucket.test(item.daysLate)).length) })),
    { key: 'clients' as const, top: tr("ลูกค้า"), bottom: tr("{0} ราย", new Set(items.map(item => item.client)).size) },
  ];
  const chipAt = [
    { x: hub.x - 140, y: 196 }, { x: hub.x + 140, y: 196 },
    { x: hub.x - 130, y: 330 }, { x: hub.x + 130, y: 330 },
  ];

  // The summary under the stage: plain figures worked out here.
  const byClient = new Map<string, number>();
  for (const item of items) byClient.set(item.client, (byClient.get(item.client) || 0) + item.pending);
  const topClient = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0];
  const oldest = [...items].sort((a, b) => b.daysLate - a.daysLate || b.pending - a.pending)[0];
  const first = BUCKETS.map(bucket => items.filter(item => bucket.test(item.daysLate)).sort((a, b) => b.pending - a.pending)[0]).find(Boolean);
  const brief = [
    { label: tr("ค้างรับรวม"), value: tr("{0} · {1} รายการ", formatCurrency(total), items.length) },
    ...BUCKETS.map(bucket => {
      const inside = items.filter(item => bucket.test(item.daysLate));
      return { label: bucket.label(), value: inside.length ? tr("{0} · {1} รายการ", formatCurrency(sum(inside)), inside.length) : tr("ไม่มีรายการ"), tone: bucket.key };
    }),
    ...(topClient ? [{ label: tr("ลูกค้าที่ค้างมากที่สุด"), value: `${topClient[0]} · ${formatCurrency(topClient[1])}` }] : []),
    ...(oldest ? [{ label: tr("รอนานที่สุด"), value: tr("{0} · {1} วัน", oldest.name, oldest.daysLate) }] : []),
  ] as { label: string; value: string; tone?: BucketKey }[];
  // On computers the orbit chips already count how late, so the summary is one row.
  const briefShown = stage.chips ? brief.filter(line => !line.tone) : brief;

  const ease = [0.22, 1, 0.36, 1] as const;
  const focus = (delay: number, from: { x?: number; y?: number; scale?: number } = {}) => (reduce ? {} : {
    initial: { opacity: 0, filter: 'blur(8px)', x: from.x ?? 0, y: from.y ?? 0, scale: from.scale ?? 0.94 },
    animate: { opacity: 1, filter: 'blur(0px)', x: 0, y: 0, scale: 1 },
    transition: { duration: 0.55, delay, ease },
  });
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay, ease } });
  const draw = (delay: number, duration = 0.55) => (reduce ? {} : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration, delay, ease } });
  const pedestalY = stage.h - 62;

  return (
    <Modal open={open} onClose={onClose} label={tr("รายงานเงินค้างรับเลยกำหนด")} width={940}>
      <div className={`odr${reduce ? '' : ' is-live'}`} data-testid="overdue-report">
        <motion.header className="odr-head" {...rise(0)}>
          <p className="odr-eyebrow">{tr("รายงานประจำวัน · {0}", longDate)}</p>
          <h2 className="odr-title">{tr("เงินค้างรับเลยกำหนด {0} รายการ", items.length)}</h2>
          {newToday > 0 && <p className="odr-sub">{tr("เพิ่งเลยกำหนดวันนี้ {0} รายการ", newToday)}</p>}
        </motion.header>

        <section className="odr-scene" aria-label={tr("แผนผังเงินค้างรับ")}>
          <motion.div className="odr-stage" style={{ width: stage.w, height: stage.h }}
            {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.45 } })}>
            <FinanceBackdrop w={stage.w} h={stage.h} glowId={glowId} reduce={reduce} />

            <svg className="odr-fx" width={stage.w} height={stage.h} viewBox={`0 0 ${stage.w} ${stage.h}`} aria-hidden="true">
              <defs>
                <filter id={glowId} x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="3" /></filter>
                <radialGradient id={`${glowId}-floor`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FF8A4C" stopOpacity="0.55" />
                  <stop offset="60%" stopColor="#E65F2B" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#E65F2B" stopOpacity="0" />
                </radialGradient>
                <radialGradient id={`${glowId}-disc`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FFE2C6" stopOpacity="0.95" />
                  <stop offset="45%" stopColor="#FF9A5C" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#E65F2B" stopOpacity="0.05" />
                </radialGradient>
                <linearGradient id={`${glowId}-side`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: 'var(--odr-side-top, #3A2117)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--odr-side-bottom, #120B08)' }} />
                </linearGradient>
              </defs>
              {/* The floor and the stand. */}
              <ellipse cx={hub.x} cy={pedestalY + 6} rx={stage.rx * 2} ry="48" fill={`url(#${glowId}-floor)`} />
              {[1.55, 1.25].map((k, i) => (
                <motion.ellipse key={k} cx={hub.x} cy={pedestalY + 6} rx={stage.rx * k} ry={30 * k} className="odr-floor-ring" {...draw(0.15 + i * 0.1, 0.8)} />
              ))}
              <path d={`M ${hub.x - stage.rx} ${pedestalY} L ${hub.x - stage.rx} ${pedestalY + 26} A ${stage.rx} 26 0 0 0 ${hub.x + stage.rx} ${pedestalY + 26} L ${hub.x + stage.rx} ${pedestalY} Z`} fill={`url(#${glowId}-side)`} className="odr-stand-side" />
              <ellipse cx={hub.x} cy={pedestalY} rx={stage.rx} ry="26" className="odr-stand-top" />
              <ellipse cx={hub.x} cy={pedestalY} rx={stage.rx * 0.62} ry="15" fill={`url(#${glowId}-disc)`} />
              <motion.ellipse cx={hub.x} cy={pedestalY} rx={stage.rx} ry="26" className="odr-stand-rim" filter={`url(#${glowId})`} {...draw(0.2, 0.9)} />
              <ellipse cx={hub.x} cy={pedestalY} rx={stage.rx} ry="26" className="odr-stand-rim is-core" />
              {/* The orbit around the squirrel. */}
              <g transform={`rotate(-7 ${hub.x} ${hub.y})`}>
                <motion.ellipse cx={hub.x} cy={hub.y} rx={stage.chips ? 196 : 150} ry="104" className="odr-orbit" {...draw(0.5, 1)} />
                <motion.ellipse cx={hub.x} cy={hub.y + 6} rx={stage.chips ? 250 : 190} ry="134" className="odr-orbit is-far" {...draw(0.6, 1.1)} />
              </g>
              {/* Branches from the squirrel to the total and to each job. */}
              {branches.map((line, n) => (
                <g key={n} className={`odr-branch-line is-${line.key}`}>
                  <motion.path d={line.d} className="odr-branch-glow" filter={`url(#${glowId})`} {...draw(line.delay)} />
                  <motion.path d={line.d} className="odr-branch-core" {...draw(line.delay)} />
                </g>
              ))}
            </svg>
            {!reduce && branches.map((line, n) => (
              <span key={n} className={`odr-pulse is-${line.key}`} aria-hidden="true" style={{ offsetPath: `path('${line.d}')`, animationDelay: `${line.delay + 0.35}s` } as React.CSSProperties} />
            ))}

            {/* The light beam and the squirrel on its stand. */}
            <motion.span className="odr-beam" aria-hidden="true" style={{ left: hub.x - 110, top: 120, height: pedestalY - 120 }}
              {...(reduce ? {} : { initial: { opacity: 0, scaleY: 0.2 }, animate: { opacity: 1, scaleY: 1 }, transition: { duration: 0.7, delay: 0.3, ease } })} />
            <motion.img src="/line/mascot-v6-report.png" alt="" aria-hidden="true" className="odr-squirrel"
              style={{ left: hub.x - stage.mascot / 2, top: pedestalY - stage.mascot + 14, width: stage.mascot, height: stage.mascot }}
              {...focus(0.4, { y: 18, scale: 0.96 })} />
            <motion.div className="odr-brand" aria-hidden="true" style={{ left: hub.x - 60, top: pedestalY + 28 }} {...rise(0.5)}>
              <img className="odr-logo is-on-dark" src="/brand/logo01-v1/symbol-white.svg" alt="" width="16" height="16" />
              <img className="odr-logo is-on-light" src="/brand/logo01-v1/symbol-ci.svg" alt="" width="16" height="16" />
              <span>Krarok</span>
            </motion.div>

            {/* The total, floating above. */}
            <div className="odr-at" style={{ left: centerX, top: 18, width: stage.center }}>
              <motion.div className="odr-glass odr-total-card" {...focus(0.6, { y: -12 })}>
                <span className="odr-bell" aria-hidden="true"><BellRing className="h-4 w-4" strokeWidth={2.2} /></span>
                <CalendarClock className="odr-total-icon" strokeWidth={1.8} aria-hidden="true" />
                <p className="odr-total-label">{tr("ค้างรับเลยกำหนด")}</p>
                <p className={`odr-total${totalText.length > 11 ? ' is-longer' : totalText.length > 9 ? ' is-long' : ''}`}>{totalText}</p>
                <p className="odr-total-meta">{tr("{0} รายการ", items.length)}</p>
              </motion.div>
            </div>

            {/* The largest jobs as glass cards around the squirrel. */}
            {cards.map((item, n) => {
              const at = place(n);
              return (
                <div key={item.id} className={`odr-at odr-tilt ${at.left ? 'is-left' : 'is-right'}`} style={{ left: at.x, top: at.y, width: stage.card }}>
                  <motion.div className="odr-glass odr-card" data-testid="overdue-card" {...focus(0.86 + n * 0.08, { x: at.left ? 26 : -26 })}>
                    <JobCard item={item} today={shortToday} />
                  </motion.div>
                </div>
              );
            })}

            {/* How late, and how many clients, on the orbit. */}
            {stage.chips && chips.map((chip, n) => (
              <div key={chip.key} className="odr-at" style={{ left: chipAt[n].x - 38, top: chipAt[n].y - 38, width: 76 }}>
                <motion.div className={`odr-chip-orb is-${chip.key}`} {...focus(1.1 + n * 0.07, { scale: 0.7 })}>
                  <p>{chip.top}</p>
                  <p className="odr-chip-count">{chip.bottom}</p>
                </motion.div>
              </div>
            ))}
          </motion.div>
          {items.length > cards.length && <p className="odr-more">{tr("และอีก {0} รายการในหน้าเงินรอรับ", items.length - cards.length)}</p>}
        </section>

        <section className={`odr-brief${stage.chips ? ' is-row' : ''}`} aria-label={tr("สรุปสั้น ๆ")}>
          <p className="odr-brief-title">{tr("สรุปสั้น ๆ")}</p>
          <dl className="odr-brief-list">
            {briefShown.map((line, k) => (
              <div key={line.label} className="odr-brief-line" style={reduce ? undefined : { animationDelay: `${1.2 + k * 0.1}s` }}>
                <dt>{line.tone && <span className={`odr-dot is-${line.tone}`} aria-hidden="true" />}{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
          {first && (
            <p className="odr-advice" style={reduce ? undefined : { animationDelay: `${1.2 + briefShown.length * 0.1}s` }}>
              {tr("ควรติดตาม {0} ก่อน ยอด {1} เลยกำหนดมา {2} วัน", first.client, formatCurrency(first.pending), first.daysLate)}
            </p>
          )}
        </section>

        <motion.footer className="odr-actions" {...rise(1.3)}>
          <button type="button" onClick={onClose} className="odr-btn is-quiet">{tr("ไว้ทีหลัง")}</button>
          <button type="button" onClick={onOpen} className="odr-btn is-primary">{tr("ไปที่เงินรอรับ")}</button>
        </motion.footer>
      </div>
    </Modal>
  );
}
