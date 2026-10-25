import React from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Image as ImageIcon, X } from 'lucide-react';
import { growth, wrapped } from '../../../../shared/flexStats';
import type { Invoice, Job } from '../../../../shared/types';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { tr } from '../../i18n/tr';
import { dateLocale } from '../../utils';
import './flex.css';

const StoryMaker = React.lazy(() => import('./StoryMaker'));

// โหมดโชว์ผลงาน (Flex Display, pkg78; owner approved the mockup 2026-10-25): a full-screen page to photograph on a
// MacBook or iPad. Only the account's own saved figures; amounts are hidden until the user shows them; no client
// names, document numbers or accounts ever. Admins only until the owner opens it to everyone.

export type FlexMode = 'income' | 'growth' | 'wrapped';
export const money = (value: number) => `฿${Math.round(value).toLocaleString('en-US')}`;
export const HIDDEN_AMOUNT = '฿ ••••••';
export const monthName = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
const shortMonth = (month: string) => new Date(`${month}-15T00:00:00Z`).toLocaleDateString(dateLocale(), { month: 'short', timeZone: 'Asia/Bangkok' });
export const percentText = (value: number | null) => (value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`);
const IDLE_MS = 3000;

function Bars({ series }: { series: { month: string; amount: number }[] }) {
  const top = Math.max(1, ...series.map(row => row.amount));
  const w = 360 / series.length;
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label={tr("รายรับ {0} เดือนล่าสุด ไม่แสดงยอด", series.length)}>
      <line className="kfx-grid" x1="0" y1="170" x2="360" y2="170" />
      {series.map((row, index) => {
        const h = Math.max(row.amount > 0 ? 6 : 2, Math.round((row.amount / top) * 150));
        return <rect key={row.month} className={`kfx-bar${index === series.length - 1 ? ' is-now' : ''}`} x={index * w + 8} y={170 - h} width={w - 16} height={h} rx="6" />;
      })}
      {series.map((row, index) => <text key={`l${row.month}`} className="kfx-axis" x={index * w + w / 2} y="192" textAnchor="middle">{shortMonth(row.month)}</text>)}
    </svg>
  );
}

function Line({ series }: { series: { month: string; amount: number }[] }) {
  const top = Math.max(1, ...series.map(row => row.amount));
  const step = 330 / Math.max(1, series.length - 1);
  const points = series.map((row, index) => [15 + index * step, 160 - Math.round((row.amount / top) * 130)] as const);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox="0 0 360 200" role="img" aria-label={tr("แนวโน้มรายรับ {0} เดือนล่าสุด", series.length)}>
      <line className="kfx-grid" x1="0" y1="170" x2="360" y2="170" />
      <path className="kfx-area" d={`${line} L${last[0]} 170 L${points[0][0]} 170 Z`} />
      <path className="kfx-line" d={line} />
      <circle className="kfx-dot" cx={last[0]} cy={last[1]} r="6" />
      <text className="kfx-axis" x="15" y="192" textAnchor="start">{shortMonth(series[0].month)}</text>
      <text className="kfx-axis" x="345" y="192" textAnchor="end">{shortMonth(series[series.length - 1].month)}</text>
    </svg>
  );
}

function Empty() {
  return (
    <div className="kfx-empty">
      <b>{tr("ยังมีข้อมูลไม่พอ")}</b>
      <span>{tr("บันทึกการรับเงินในแอปอย่างน้อย 2 เดือน แล้วโหมดนี้จะแสดงผลจากข้อมูลจริง")}</span>
    </div>
  );
}

export default function FlexDisplay({ jobs, invoices, onClose }: { jobs: Job[]; invoices: Invoice[] | null; onClose: () => void }) {
  const [mode, setMode] = React.useState<FlexMode>('income');
  const [show, setShow] = React.useState(false);
  const [idle, setIdle] = React.useState(false);
  const [story, setStory] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<number>(0);
  const g = React.useMemo(() => growth(jobs), [jobs]);
  const w = React.useMemo(() => wrapped(jobs, invoices), [jobs, invoices]);

  const wake = React.useCallback(() => {
    setIdle(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  React.useEffect(() => { wake(); return () => window.clearTimeout(timer.current); }, [wake]);
  // Full screen when the browser allows it (it was opened by a click); leaving the mode leaves full screen too.
  React.useEffect(() => {
    try { void root.current?.requestFullscreen?.().catch(() => undefined); } catch { /* not allowed here */ }
    return () => { try { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); } catch { /* already out */ } };
  }, []);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !story) onClose(); else wake(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, story, wake]);
  React.useEffect(() => { root.current?.focus(); }, []);

  const marks = [
    g.best ? tr("เดือนที่ดีที่สุดในรอบ 6 เดือน") : '',
    w.jobsDone ? tr("งานสำเร็จ {0} งาน", w.jobsDone) : '',
    w.clients ? tr("ลูกค้า {0} ราย", w.clients) : '',
  ].filter(Boolean);
  const modes: [FlexMode, string][] = [['income', tr("รายรับ")], ['growth', tr("การเติบโต")], ['wrapped', tr("สรุปเดือน")]];

  return createPortal(
    <div ref={root} className="kfx" role="dialog" aria-modal="true" aria-label={tr("โหมดโชว์ผลงาน")} tabIndex={-1} onMouseMove={wake} onFocus={wake}>
      <div className="kfx-top">
        <BrandLockup size={26} />
        <div className={`kfx-controls${idle ? ' is-idle' : ''}`}>
          <div className="kfx-seg" role="radiogroup" aria-label={tr("แบบที่แสดง")}>
            {modes.map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={mode === key} className={mode === key ? 'is-on' : ''} onClick={() => setMode(key)}>{label}</button>
            ))}
          </div>
          <button type="button" role="switch" aria-checked={show} className="kfx-ctl" onClick={() => setShow(value => !value)}>
            {show ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}{tr("แสดงยอดเงิน")}
          </button>
          <button type="button" className="kfx-ctl" onClick={() => setStory(true)}><ImageIcon size={16} aria-hidden="true" />{tr("ทำภาพ Story")}</button>
          <button type="button" className="kfx-ctl is-icon" onClick={onClose} aria-label={tr("ออกจากโหมดโชว์ผลงาน")} title={tr("ออก (Esc)")}><X size={18} aria-hidden="true" /></button>
        </div>
      </div>

      <main className="kfx-main">
        {mode === 'income' && (g.monthsWithData === 0 ? <Empty /> : (
          <div className="kfx-split">
            <div className="kfx-big">
              <span className="kfx-label">{tr("รายรับที่ได้รับแล้ว · {0}", monthName(g.month))}</span>
              <span className={`kfx-num${show ? '' : ' is-hidden'}`}>{show ? money(g.amount) : HIDDEN_AMOUNT}</span>
              <span className="kfx-delta">{g.percent === null ? tr("ยังไม่มีเดือนก่อนให้เทียบ") : tr("{0} จากเดือนก่อน", percentText(g.percent))}</span>
              {!show && <span className="kfx-note">{tr("ยอดเงินซ่อนอยู่ กด “แสดงยอดเงิน” ถ้าต้องการโชว์")}</span>}
            </div>
            <div className="kfx-chart"><Bars series={g.series} /></div>
          </div>
        ))}
        {mode === 'growth' && (g.percent === null ? <Empty /> : (
          <div className="kfx-split">
            <div className="kfx-big">
              <span className="kfx-label">{tr("รายรับเติบโตจากเดือนก่อน")}</span>
              <span className="kfx-num">{percentText(g.percent)}</span>
              {g.streak >= 2 && <span className="kfx-delta">{tr("โตต่อเนื่อง {0} เดือน", g.streak)}</span>}
              <span className="kfx-note">{tr("แสดงเป็นเปอร์เซ็นต์ ไม่เปิดยอดเงินจริง")}</span>
            </div>
            <div className="kfx-chart"><Line series={g.series} /></div>
          </div>
        ))}
        {mode === 'wrapped' && (w.payments === 0 && w.jobsDone === 0 ? <Empty /> : (
          <div className="kfx-tiles">
            <div className="kfx-tile"><span className="k">{tr("งานที่สำเร็จ (รับเงินครบ)")}</span><span className="v">{w.jobsDone.toLocaleString('en-US')}</span><span className="s">{monthName(w.month)}</span></div>
            <div className="kfx-tile"><span className="k">{tr("ลูกค้าที่ชำระเงิน")}</span><span className="v">{w.clients.toLocaleString('en-US')}</span><span className="s">{tr("ราย ไม่แสดงชื่อ")}</span></div>
            <div className="kfx-tile"><span className="k">{tr("รายรับที่ได้รับจริง")}</span><span className={`v${show ? '' : ' is-hidden'}`}>{show ? money(w.received) : '••••••'}</span><span className="s">{show ? tr("เดือนนี้") : tr("ซ่อนอยู่")}</span></div>
            <div className="kfx-tile"><span className="k">{tr("ใบเสนอราคาที่ออก")}</span><span className="v">{w.quotations === null ? '—' : w.quotations.toLocaleString('en-US')}</span><span className="s">{w.quotations === null ? tr("เปิดหน้าเอกสารก่อนเพื่อนับ") : tr("ฉบับ")}</span></div>
            <div className="kfx-tile"><span className="k">{tr("รับเงินแล้ว")}</span><span className="v">{w.payments.toLocaleString('en-US')}</span><span className="s">{tr("รายการ")}</span></div>
            <div className="kfx-tile"><span className="k">{tr("เทียบเดือนก่อน")}</span><span className="v">{percentText(w.growthPercent)}</span><span className="s">{tr("รายรับ")}</span></div>
          </div>
        ))}
      </main>

      <div className="kfx-foot">
        <span className="kfx-marks">{(mode === 'wrapped' ? [tr("Freelancer Wrapped · {0}", monthName(w.month))] : marks).map(mark => <span key={mark}>{mark}</span>)}</span>
        <span className="kfx-domain">krarok.com</span>
      </div>

      {story && (
        <React.Suspense fallback={null}>
          <StoryMaker jobs={jobs} invoices={invoices} onClose={() => { setStory(false); root.current?.focus(); }} />
        </React.Suspense>
      )}
    </div>,
    document.body,
  );
}
