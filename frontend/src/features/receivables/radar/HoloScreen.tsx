import React from 'react';
import { tr } from '../../../i18n/tr';
import type { RadarStatus } from './radarData';

// The squirrel's own hologram screen (owner, 2026-10-30: "ให้น้องมีจอเหมือนจอโฮโลแกรมของน้อง ที่กำลังดูงาน คอยพิมพ์งาน
// หรือตรวจเรดาร์"): it rises from the laptop in the squirrel's hands (the real "working" picture; the squirrel is never
// redrawn, the screen is a prop beside it). A small radar sweeps, the counts sit under it, and the real jobs type in one
// line at a time, newest at the bottom with a cursor. Only this screen re-renders, every few seconds, and not while the
// tab is hidden; with reduced motion it shows the first lines, still.

export interface ScreenLine { key: string; name: string; amount: string; tone: RadarStatus }

const ROWS = 3;

export function HoloScreen({ lines, counts, reduce }: {
  lines: ScreenLine[];
  counts: { overdue: number; soon: number; received: number };
  reduce: boolean;
}) {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (reduce || lines.length <= ROWS) return;
    const id = window.setInterval(() => { if (!document.hidden) setStep(current => current + 1); }, 2600);
    return () => window.clearInterval(id);
  }, [reduce, lines.length]);
  const shown = lines.length
    ? Array.from({ length: Math.min(ROWS, lines.length) }, (_, i) => ({ slot: step + i, line: lines[(step + i) % lines.length] }))
    : [];
  return (
    <div className="crv" aria-hidden="true">
      <span className="crv-corner is-tl" /><span className="crv-corner is-tr" />
      <span className="crv-corner is-bl" /><span className="crv-corner is-br" />
      <p className="crv-head"><span className="crv-live" />{tr("กำลังตรวจเครดิตเทอม")}</p>
      <div className="crv-top">
        <span className="crv-radar"><span className="crv-sweep" /><i /><i /><i /></span>
        <span className="crv-counts">
          <span className="is-overdue">{tr("เกินกำหนด {0}", counts.overdue)}</span>
          <span className="is-soon">{tr("ใกล้ครบ {0}", counts.soon)}</span>
          <span className="is-received">{tr("รับแล้ว {0}", counts.received)}</span>
        </span>
      </div>
      <div className="crv-log">
        {shown.map(({ slot, line }, i) => (
          // Plain elements (no motion): a line typed in while the radar closes must not hold its fade-out open.
          <p key={slot} className={`crv-line is-${line.tone}${i === shown.length - 1 && !reduce ? ' is-typing' : ''}`}>
            <span className="crv-name">{line.name}</span>
            <span className="crv-amount">{line.amount}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
