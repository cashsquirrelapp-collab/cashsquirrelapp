import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowRight, Clock3, LayoutList, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../utils';
import { tr } from '../../../i18n/tr';
import type { CreditRadarData } from './radarData';

// The figures that matter, biggest first: everything still owed, how many to follow up, how much is overdue, how much
// is due soon. Each counts up when the radar opens and again only when its figure really changes.

function useCounter(value: number, run: boolean) {
  const [shown, setShown] = React.useState(run ? 0 : value);
  const from = React.useRef(run ? 0 : value);
  React.useEffect(() => {
    if (!run) { setShown(value); from.current = value; return; }
    const start = performance.now(), begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start - 250) / 900));
      const next = begin + (value - begin) * (1 - Math.pow(1 - t, 3));
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = value; };
  }, [value, run]);
  return shown;
}

export function RadarSummary({ data, hiddenCount, reduce, onShowAll, onOpenReceivables }: {
  data: CreditRadarData; hiddenCount: number; reduce: boolean; onShowAll: () => void; onOpenReceivables: () => void;
}) {
  const outstanding = useCounter(data.totals.outstanding, !reduce);
  const followUp = useCounter(data.totals.followUp, !reduce);
  const overdue = useCounter(data.totals.overdue, !reduce);
  const soon = useCounter(data.totals.soon, !reduce);
  const all = data.overdue.length + data.soon.length + data.received.length + data.later.length;
  return (
    <motion.div className="crs" data-testid="radar-summary"
      {...(reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] as const } })}>
      <div className="crs-metric is-main">
        <Wallet className="crs-icon" strokeWidth={1.9} aria-hidden="true" />
        <div>
          <p className="crs-label">{tr("เงินค้างรับทั้งหมด")}</p>
          <p className="crs-value" data-testid="radar-outstanding">{formatCurrency(Math.round(outstanding))}</p>
        </div>
      </div>
      <div className="crs-metric">
        <LayoutList className="crs-icon" strokeWidth={1.9} aria-hidden="true" />
        <div>
          <p className="crs-label">{tr("ต้องติดตาม")}</p>
          <p className="crs-value is-small" data-testid="radar-followup">{tr("{0} รายการ", Math.round(followUp))}</p>
        </div>
      </div>
      <div className="crs-metric is-overdue">
        <AlertTriangle className="crs-icon" strokeWidth={1.9} aria-hidden="true" />
        <div>
          <p className="crs-label">{tr("เกินกำหนด")}</p>
          <p className="crs-value is-small" data-testid="radar-overdue">{formatCurrency(Math.round(overdue))}</p>
        </div>
      </div>
      <div className="crs-metric is-soon">
        <Clock3 className="crs-icon" strokeWidth={1.9} aria-hidden="true" />
        <div>
          <p className="crs-label">{tr("ใกล้ครบกำหนด")}</p>
          <p className="crs-value is-small" data-testid="radar-soon">{formatCurrency(Math.round(soon))}</p>
        </div>
      </div>
      <div className="crs-actions">
        <button type="button" className="crs-btn is-quiet" onClick={onShowAll} data-testid="radar-show-all">
          {hiddenCount > 0 ? tr("ดูทั้งหมด {0} รายการ", all) : tr("ดูเป็นรายการ")}
        </button>
        <button type="button" className="crs-btn is-primary" onClick={onOpenReceivables}>
          {tr("ไปที่เงินรอรับ")}<ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
