import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Modal } from '../../components/ui/Modal';
import { dateLocale, formatCurrency } from '../../utils';
import { tr } from '../../i18n/tr';
import './overdueReport.css';

// The overdue alert as a short report to the boss (owner, 2026-10-30: "เหมือนกำลังรายงาน CEO ... liquid card ภาพรวม ...
// transition motion เบาๆ เหมือนเทคโนโลยี"; round 2: "ฟิลโฮโลแกรม แบบ mind map แตกแขนงเข้าไปได้ ... ข้อความสรุปอีกฝั่ง").
// Computers and iPads; phones keep their alert. A hologram map: the total on the left, branching to how late (over 30 days
// on top), then to the largest jobs of each; beside it a short summary of what is owed and how much. Motion plays once:
// the total counts up, branches draw out with a light running along them, nodes come into focus, the summary types in.
// Nothing moves with reduced motion.

export interface OverdueItem { id: string; name: string; client: string; pending: number; daysLate: number }

type BucketKey = 'older' | 'month' | 'week';
const BUCKETS: { key: BucketKey; node: () => string; label: () => string; test: (days: number) => boolean }[] = [
  { key: 'older', node: () => tr("เกิน 30 วัน"), label: () => tr("เลยมาเกิน 30 วัน"), test: days => days > 30 },
  { key: 'month', node: () => tr("8–30 วัน"), label: () => tr("เลยมา 8–30 วัน"), test: days => days > 7 && days <= 30 },
  { key: 'week', node: () => tr("1–7 วัน"), label: () => tr("เลยมา 1–7 วัน"), test: days => days <= 7 },
];

// The map in px: the stage is drawn at this size, so text never scales.
const W = 560;
const ROW = 64;
const PAD = 16;
const ROOT = { x: 10, w: 132 };
const BRANCH = { x: 198, w: 128 };
const LEAF = { x: 372, w: 178 };
const PER_BRANCH = 2;

const byAmount = (a: OverdueItem, b: OverdueItem) => b.pending - a.pending || b.daysLate - a.daysLate;
const sum = (list: OverdueItem[]) => list.reduce((total, item) => total + item.pending, 0);
const chipOf = (days: number) => (days > 30 ? 'is-older' : days > 7 ? 'is-month' : 'is-week');

function mapLayout(items: OverdueItem[]) {
  const branches = BUCKETS.map(bucket => ({ ...bucket, items: items.filter(item => bucket.test(item.daysLate)).sort(byAmount) }))
    .filter(branch => branch.items.length > 0);
  const used = branches.reduce((n, branch) => n + Math.min(PER_BRANCH, branch.items.length), 0);
  const rows = Math.max(3, used);
  const height = rows * ROW + PAD * 2;
  let row = (rows - used) / 2;
  const placed = branches.map(branch => {
    const leaves = branch.items.slice(0, PER_BRANCH).map(item => ({ item, y: PAD + (row++ + 0.5) * ROW }));
    return { ...branch, leaves, y: leaves.reduce((total, leaf) => total + leaf.y, 0) / leaves.length, amount: sum(branch.items) };
  });
  const rootY = height / 2;
  const rootRight = ROOT.x + ROOT.w, branchRight = BRANCH.x + BRANCH.w;
  const trunks = placed.map(branch => ({ key: branch.key, d: `M ${rootRight} ${rootY} C ${rootRight + 30} ${rootY}, ${BRANCH.x - 30} ${branch.y}, ${BRANCH.x} ${branch.y}` }));
  const twigs = placed.flatMap(branch => branch.leaves.map(leaf => ({ key: branch.key, d: `M ${branchRight} ${branch.y} C ${branchRight + 24} ${branch.y}, ${LEAF.x - 24} ${leaf.y}, ${LEAF.x} ${leaf.y}` })));
  const shown = placed.reduce((n, branch) => n + branch.leaves.length, 0);
  return { height, rootY, branches: placed, trunks, twigs, hidden: items.length - shown };
}

function useCountUp(target: number, run: boolean) {
  const [value, setValue] = React.useState(run ? 0 : target);
  React.useEffect(() => {
    if (!run) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - 180) / 800));
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return value;
}

export function OverdueReport({ open, items: given, newToday, onOpen, onClose }: { open: boolean; items: OverdueItem[]; newToday: number; onOpen: () => void; onClose: () => void }) {
  const reduce = useReducedMotion() ?? false;
  // The map stays while the dialog fades out after it is closed.
  const kept = React.useRef(given);
  if (open && given.length) kept.current = given;
  const items = kept.current;
  const glowId = `odr-glow-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const total = sum(items);
  const shownTotal = useCountUp(total, open && !reduce);
  const map = React.useMemo(() => mapLayout(items), [items]);
  const today = new Date().toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

  // The summary: plain figures worked out here.
  const byClient = new Map<string, number>();
  for (const item of items) byClient.set(item.client, (byClient.get(item.client) || 0) + item.pending);
  const topClient = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0];
  const oldest = [...items].sort((a, b) => b.daysLate - a.daysLate || b.pending - a.pending)[0];
  const first = map.branches[0]?.items[0];
  const brief: { label: string; value: string; tone?: BucketKey }[] = [
    { label: tr("ค้างรับรวม"), value: tr("{0} · {1} รายการ", formatCurrency(total), items.length) },
    ...BUCKETS.map(bucket => {
      const inside = items.filter(item => bucket.test(item.daysLate));
      return { label: bucket.label(), value: inside.length ? tr("{0} · {1} รายการ", formatCurrency(sum(inside)), inside.length) : tr("ไม่มีรายการ"), tone: bucket.key };
    }),
    ...(topClient ? [{ label: tr("ลูกค้าที่ค้างมากที่สุด"), value: `${topClient[0]} · ${formatCurrency(topClient[1])}` }] : []),
    ...(oldest ? [{ label: tr("รอนานที่สุด"), value: tr("{0} · {1} วัน", oldest.name, oldest.daysLate) }] : []),
  ];

  const ease = [0.22, 1, 0.36, 1] as const;
  const appear = (delay: number) => (reduce ? {} : {
    initial: { opacity: 0, scale: 0.92, filter: 'blur(6px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    transition: { duration: 0.42, delay, ease },
  });
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay, ease } });
  const draw = (delay: number) => (reduce ? {} : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.5, delay, ease } });
  const trunkDelay = (i: number) => 0.34 + i * 0.08;
  const twigDelay = (j: number) => 0.78 + j * 0.06;
  const lines = [...map.trunks.map((line, i) => ({ ...line, delay: trunkDelay(i) })), ...map.twigs.map((line, j) => ({ ...line, delay: twigDelay(j) }))];
  const totalText = formatCurrency(Math.round(shownTotal));

  return (
    <Modal open={open} onClose={onClose} label={tr("รายงานเงินค้างรับเลยกำหนด")} width={940}>
      <div className={`odr${reduce ? '' : ' is-live'}`} data-testid="overdue-report">
        <motion.header className="odr-head" {...rise(0)}>
          <img src="/line/mascot-v6-report.png" alt="" aria-hidden="true" className="odr-mascot" />
          <div className="min-w-0">
            <p className="odr-eyebrow">{tr("รายงานประจำวัน · {0}", today)}</p>
            <h2 className="odr-title">{tr("เงินค้างรับเลยกำหนด {0} รายการ", items.length)}</h2>
            {newToday > 0 && <p className="odr-sub">{tr("เพิ่งเลยกำหนดวันนี้ {0} รายการ", newToday)}</p>}
          </div>
        </motion.header>

        <div className="odr-body">
          <section className="odr-map" aria-label={tr("แผนผังเงินค้างรับ")}>
            <motion.div className="odr-stage" style={{ width: W, height: map.height }}
              {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.08 } })}>
              <span className="odr-corner is-tl" aria-hidden="true" />
              <span className="odr-corner is-tr" aria-hidden="true" />
              <span className="odr-corner is-bl" aria-hidden="true" />
              <span className="odr-corner is-br" aria-hidden="true" />
              <p className="odr-hud" aria-hidden="true">{tr("แผนผังเงินค้างรับ")}</p>

              <svg className="odr-lines" width={W} height={map.height} viewBox={`0 0 ${W} ${map.height}`} aria-hidden="true">
                <defs>
                  <filter id={glowId} x="-20%" y="-50%" width="140%" height="200%">
                    <feGaussianBlur stdDeviation="2.6" />
                  </filter>
                </defs>
                {lines.map((line, n) => (
                  <g key={n} className={`odr-line is-${line.key}`}>
                    <motion.path d={line.d} className="odr-line-glow" filter={`url(#${glowId})`} {...draw(line.delay)} />
                    <motion.path d={line.d} className="odr-line-core" {...draw(line.delay)} />
                  </g>
                ))}
              </svg>
              {!reduce && lines.map((line, n) => (
                <span key={n} className={`odr-pulse is-${line.key}`} aria-hidden="true"
                  style={{ offsetPath: `path('${line.d}')`, animationDelay: `${line.delay + 0.3}s` } as React.CSSProperties} />
              ))}

              <div className="odr-node-at" style={{ left: ROOT.x, top: map.rootY, width: ROOT.w }}>
                <motion.div className="odr-node odr-root odr-holo" {...appear(0.16)}>
                  <p className="odr-node-label">{tr("ค้างรับรวม")}</p>
                  <p className={`odr-root-total${totalText.length > 11 ? ' is-longer' : totalText.length > 9 ? ' is-long' : ''}`}>{totalText}</p>
                  <p className="odr-node-meta">{tr("{0} รายการ", items.length)}</p>
                </motion.div>
              </div>
              {map.branches.map((branch, i) => (
                <div key={branch.key} className="odr-node-at" style={{ left: BRANCH.x, top: branch.y, width: BRANCH.w }}>
                  <motion.div className={`odr-node odr-branch odr-holo is-${branch.key}`} {...appear(trunkDelay(i) + 0.26)}>
                    <p className="odr-node-label"><span className={`odr-dot is-${branch.key}`} aria-hidden="true" />{branch.node()}</p>
                    <p className="odr-branch-amount">{formatCurrency(branch.amount)}</p>
                    <p className="odr-node-meta">{tr("{0} รายการ", branch.items.length)}</p>
                  </motion.div>
                </div>
              ))}
              {map.branches.flatMap(branch => branch.leaves).map((leaf, j) => (
                <div key={leaf.item.id} className="odr-node-at" style={{ left: LEAF.x, top: leaf.y, width: LEAF.w }}>
                  <motion.div className="odr-node odr-leaf odr-holo" title={leaf.item.client} {...appear(twigDelay(j) + 0.24)}>
                    <p className="odr-leaf-name">{leaf.item.name}</p>
                    <p className="odr-leaf-meta">
                      <span className={`odr-chip ${chipOf(leaf.item.daysLate)}`}>{tr("เลย {0} วัน", leaf.item.daysLate)}</span>
                      <span className="odr-leaf-amount">{formatCurrency(leaf.item.pending)}</span>
                    </p>
                  </motion.div>
                </div>
              ))}
            </motion.div>
            {map.hidden > 0 && <p className="odr-more">{tr("และอีก {0} รายการในหน้าเงินรอรับ", map.hidden)}</p>}
          </section>

          <section className="odr-brief" aria-label={tr("สรุปสั้น ๆ")}>
            <motion.p className="odr-brief-title" {...rise(0.4)}>{tr("สรุปสั้น ๆ")}</motion.p>
            <dl className="odr-brief-list">
              {brief.map((line, k) => (
                <div key={line.label} className="odr-brief-line" style={reduce ? undefined : { animationDelay: `${0.5 + k * 0.12}s` }}>
                  <dt>{line.tone && <span className={`odr-dot is-${line.tone}`} aria-hidden="true" />}{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            {first && (
              <p className="odr-advice" style={reduce ? undefined : { animationDelay: `${0.5 + brief.length * 0.12}s` }}>
                {tr("ควรติดตาม {0} ก่อน ยอด {1} เลยกำหนดมา {2} วัน", first.client, formatCurrency(first.pending), first.daysLate)}
              </p>
            )}
          </section>
        </div>

        <motion.footer className="odr-actions" {...rise(1.1)}>
          <button type="button" onClick={onClose} className="odr-btn is-quiet">{tr("ไว้ทีหลัง")}</button>
          <button type="button" onClick={onOpen} className="odr-btn is-primary">{tr("ไปที่เงินรอรับ")}</button>
        </motion.footer>
      </div>
    </Modal>
  );
}
