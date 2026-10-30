import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Modal } from '../../components/ui/Modal';
import { dateLocale, formatCurrency } from '../../utils';
import { tr } from '../../i18n/tr';
import './overdueReport.css';

// The overdue alert as a short report to the boss (owner, 2026-10-30: "ขึ้นมาเป็นกราฟิกหรือ UI แบบสวยๆ เหมือนกำลังรายงาน CEO
// ของตัวเอง ... เป็น liquid card ภาพรวม overall ... transition motion เบาๆ เหมือนเทคโนโลยี"). Computers and iPads; phones keep
// their alert. One glass summary (the total, how many, the longest wait, how late by bucket), the largest items, and
// the way to the receivables page. Motion is soft and once: rows rise in turn, the total counts up, a sheen crosses
// the glass; nothing moves with reduced motion.

export interface OverdueItem { id: string; name: string; client: string; pending: number; daysLate: number }

const BUCKETS = [
  { key: 'week', label: () => tr("เลยมา 1–7 วัน"), test: (days: number) => days <= 7 },
  { key: 'month', label: () => tr("เลยมา 8–30 วัน"), test: (days: number) => days > 7 && days <= 30 },
  { key: 'older', label: () => tr("เลยมาเกิน 30 วัน"), test: (days: number) => days > 30 },
] as const;
const SHOWN = 5;

function useCountUp(target: number, run: boolean) {
  const [value, setValue] = React.useState(run ? 0 : target);
  React.useEffect(() => {
    if (!run) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 750);
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
  // The list stays while the dialog fades out after it is closed.
  const kept = React.useRef(given);
  if (open && given.length) kept.current = given;
  const items = kept.current;
  const total = items.reduce((sum, item) => sum + item.pending, 0);
  const longest = items.reduce((max, item) => Math.max(max, item.daysLate), 0);
  const shownTotal = useCountUp(total, open && !reduce);
  const buckets = BUCKETS.map(bucket => {
    const inside = items.filter(item => bucket.test(item.daysLate));
    return { ...bucket, count: inside.length, amount: inside.reduce((sum, item) => sum + item.pending, 0) };
  });
  const top = [...items].sort((a, b) => b.pending - a.pending || b.daysLate - a.daysLate).slice(0, SHOWN);
  const today = new Date().toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32, delay, ease: [0.22, 1, 0.36, 1] as const } });
  const chip = (days: number) => (days > 30 ? 'is-older' : days > 7 ? 'is-month' : 'is-week');

  return (
    <Modal open={open} onClose={onClose} label={tr("รายงานเงินค้างรับเลยกำหนด")} width={600}>
      <div className="odr" data-testid="overdue-report">
        <div className="odr-stage">
        <motion.span className="odr-orb is-a" aria-hidden="true" {...(reduce ? {} : { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } })} />
        <motion.span className="odr-orb is-b" aria-hidden="true" {...(reduce ? {} : { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const } })} />
        <motion.header className="odr-head" {...rise(0)}>
          <img src="/line/mascot-v6-report.png" alt="" aria-hidden="true" className="odr-mascot" />
          <div className="min-w-0">
            <p className="odr-eyebrow">{tr("รายงานประจำวัน · {0}", today)}</p>
            <h2 className="odr-title">{tr("เงินค้างรับเลยกำหนด {0} รายการ", items.length)}</h2>
            {newToday > 0 && <p className="odr-sub">{tr("เพิ่งเลยกำหนดวันนี้ {0} รายการ", newToday)}</p>}
          </div>
        </motion.header>

        <motion.section className={`odr-glass${reduce ? '' : ' is-sheen'}`} aria-label={tr("ภาพรวม")} {...rise(0.08)}>
          <div className="odr-glass-top">
            <div className="min-w-0">
              <p className="odr-label">{tr("ยอดที่ยังไม่ได้รับ")}</p>
              <p className="odr-total" aria-live="off">{formatCurrency(Math.round(shownTotal))}</p>
            </div>
            <div className="odr-stat">
              <p className="odr-label">{tr("รอนานสุด")}</p>
              <p className="odr-stat-value">{tr("{0} วัน", longest)}</p>
            </div>
          </div>
          {total > 0 && (
            <div className="odr-bar" aria-hidden="true">
              {buckets.filter(bucket => bucket.amount > 0).map(bucket => (
                <motion.span key={bucket.key} className={`odr-bar-part is-${bucket.key}`} style={{ flexGrow: bucket.amount }}
                  {...(reduce ? {} : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] as const } })} />
              ))}
            </div>
          )}
          <dl className="odr-buckets">
            {buckets.map(bucket => (
              <div key={bucket.key} className="odr-bucket">
                <dt><span className={`odr-dot is-${bucket.key}`} aria-hidden="true" />{bucket.label()}</dt>
                <dd>{tr("{0} รายการ", bucket.count)}<span>{formatCurrency(bucket.amount)}</span></dd>
              </div>
            ))}
          </dl>
        </motion.section>
        </div>

        <section className="odr-items" aria-label={tr("รายการที่ยอดสูงสุด")}>
          <p className="odr-list-head">{items.length > SHOWN ? tr("ยอดสูงสุด {0} รายการ", SHOWN) : tr("ทุกรายการ")}</p>
          <ul className="odr-list">
            {top.map((item, index) => (
              <motion.li key={item.id} className="odr-row" {...rise(0.2 + index * 0.06)}>
                <div className="min-w-0">
                  <p className="odr-row-name">{item.name}</p>
                  <p className="odr-row-client">{item.client}</p>
                </div>
                <span className={`odr-chip ${chip(item.daysLate)}`}>{tr("เลย {0} วัน", item.daysLate)}</span>
                <span className="odr-row-amount">{formatCurrency(item.pending)}</span>
              </motion.li>
            ))}
          </ul>
          {items.length > SHOWN && <p className="odr-more">{tr("และอีก {0} รายการในหน้าเงินรอรับ", items.length - SHOWN)}</p>}
        </section>

        <motion.footer className="odr-actions" {...rise(0.2 + top.length * 0.06)}>
          <button type="button" onClick={onClose} className="odr-btn is-quiet">{tr("ไว้ทีหลัง")}</button>
          <button type="button" onClick={onOpen} className="odr-btn is-primary">{tr("ไปที่เงินรอรับ")}</button>
        </motion.footer>
      </div>
    </Modal>
  );
}
