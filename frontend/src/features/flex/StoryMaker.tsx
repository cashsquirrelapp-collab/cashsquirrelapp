import React from 'react';
import { Download, Share2, X } from 'lucide-react';
import { achievements, bangkokMonthKey, growth, shiftMonthKey, wrapped, type Achievement } from '../../../../shared/flexStats';
import type { Invoice, Job } from '../../../../shared/types';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { Mascot } from '../../components/mascot/Mascot';
import { tr } from '../../i18n/tr';
import { HIDDEN_AMOUNT, money, monthName, percentText } from './FlexDisplay';

// Story Flex (pkg79; owner approved the mockup 2026-10-25): a 1080 × 1920 picture for Instagram or Facebook Story,
// drawn on this device from the account's own saved figures with the picture tool the app already uses for PDFs.
// No AI. Amounts stay hidden unless the user shows them; client names and document numbers are never in it.

export type StoryTemplate = 'income' | 'project' | 'growth' | 'wrapped' | 'achievement';
const W = 1080;
const H = 1920;
const PREVIEW = 0.25;

/** A moment in the chosen month: now for this month, the last day (12:00 Bangkok) for last month. */
function momentFor(period: 'this' | 'last', now = new Date()): Date {
  if (period === 'this') return now;
  const [y, m] = shiftMonthKey(bangkokMonthKey(now), -1).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 5));
}
function achievementTitle(item: Achievement, show: boolean): string {
  if (item.kind === 'received_10k') return tr("รับเงินครบ ฿10K");
  if (item.kind === 'received_100k') return tr("รับเงินครบ ฿100K");
  if (item.kind === 'jobs_10') return tr("งานสำเร็จครบ 10 งาน");
  return show && item.amount !== null ? tr("เดือนที่ดีที่สุด {0}", money(item.amount)) : tr("เดือนที่ดีที่สุด");
}

/** The picture itself, at full size (1080 × 1920). */
function Story({ template, jobs, invoices, at, show }: { template: StoryTemplate; jobs: Job[]; invoices: Invoice[] | null; at: Date; show: boolean }) {
  const g = growth(jobs, at);
  const w = wrapped(jobs, invoices, at);
  // The newest milestone (฿10K, ฿100K, 10 jobs); the best month only when no milestone has been reached yet.
  const reached = achievements(jobs, at).sort((a, b) => b.date.localeCompare(a.date));
  const newest = reached.find(item => item.kind !== 'best_month') ?? reached[0];
  const month = monthName(g.month);
  const top = Math.max(1, ...g.series.map(row => row.amount));
  const dark = template === 'income' || template === 'growth' || template === 'achievement';
  return (
    <div className={`kst kst-${template}`} style={{ width: W, height: H }}>
      <div className="kst-top"><BrandLockup size={64} inverse={dark} /></div>
      <div className="kst-mid">
        {template === 'income' && (<>
          <span className="kst-k">{tr("รายรับที่ได้รับแล้ว · {0}", month)}</span>
          <span className="kst-v">{show ? money(g.amount) : g.percent !== null ? percentText(g.percent) : HIDDEN_AMOUNT}</span>
          <span className="kst-s">{show ? (g.percent === null ? tr("ยังไม่มีเดือนก่อนให้เทียบ") : tr("{0} จากเดือนก่อน", percentText(g.percent))) : tr("รายรับเติบโตจากเดือนก่อน")}</span>
          <div className="kst-bars" aria-hidden="true">{g.series.map((row, index) => <i key={row.month} className={index === g.series.length - 1 ? 'is-now' : ''} style={{ height: `${Math.max(4, Math.round((row.amount / top) * 100))}%` }} />)}</div>
        </>)}
        {template === 'project' && (<>
          <span className="kst-k">{tr("งานที่ทำสำเร็จ · {0}", month)}</span>
          <span className="kst-v">{tr("{0} งาน", w.jobsDone)}</span>
          <span className="kst-s">{tr("จากลูกค้า {0} ราย", w.clients)}</span>
        </>)}
        {template === 'growth' && (<>
          <span className="kst-k">{tr("รายรับเติบโต")}</span>
          <span className="kst-v">{percentText(g.percent)}</span>
          <span className="kst-s">{g.percent === null ? tr("ยังไม่มีเดือนก่อนให้เทียบ") : tr("เทียบเดือนก่อน · ไม่เปิดยอดเงิน")}</span>
        </>)}
        {template === 'wrapped' && (<>
          <span className="kst-k">{tr("สรุปเดือน{0}", month)}</span>
          <div className="kst-tiles">
            <div><b>{w.jobsDone}</b><span>{tr("งานสำเร็จ")}</span></div>
            <div><b>{w.clients}</b><span>{tr("ลูกค้า")}</span></div>
            <div><b>{w.payments}</b><span>{tr("รับเงินแล้ว")}</span></div>
            <div><b>{show ? money(w.received) : percentText(w.growthPercent)}</b><span>{show ? tr("รายรับ") : tr("รายรับเทียบเดือนก่อน")}</span></div>
          </div>
        </>)}
        {template === 'achievement' && (newest ? (
          <div className="kst-badge">
            <Mascot mood="celebrate" action="celebrate" animated={false} size={360} />
            <span className="kst-k">{tr("ปลดล็อกแล้ว")}</span>
            <span className="kst-v is-title">{achievementTitle(newest, show)}</span>
            <span className="kst-s">{newest.kind === 'best_month' ? monthName(newest.date.slice(0, 7)) : tr("ครั้งแรก · {0}", monthName(newest.date.slice(0, 7)))}</span>
          </div>
        ) : <span className="kst-s">{tr("ยังไม่มีความสำเร็จที่ปลดล็อก")}</span>)}
      </div>
      <span className="kst-foot">krarok.com</span>
    </div>
  );
}

const TEMPLATES: [StoryTemplate, string][] = [
  ['income', 'Income Flex'], ['project', 'Project Flex'], ['growth', 'Growth Flex'], ['wrapped', 'Monthly Wrapped'], ['achievement', 'Achievement Flex'],
];
const canShareFile = (file: File) => {
  try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); }
  catch { return false; }
};

export default function StoryMaker({ jobs, invoices, onClose }: { jobs: Job[]; invoices: Invoice[] | null; onClose: () => void }) {
  const [template, setTemplate] = React.useState<StoryTemplate>('income');
  const [period, setPeriod] = React.useState<'this' | 'last'>('this');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const capture = React.useRef<HTMLDivElement>(null);
  const at = React.useMemo(() => momentFor(period), [period]);
  const nothing = template === 'achievement' && achievements(jobs, at).length === 0;

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const picture = async (): Promise<File | null> => {
    const node = capture.current?.firstElementChild as HTMLElement | null;
    if (!node) return null;
    const { default: html2canvas } = await import('html2canvas-pro');
    await document.fonts?.ready;
    const canvas = await html2canvas(node, { scale: 1, width: W, height: H, backgroundColor: null, useCORS: true, logging: false });
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], `krarok-story-${template}-${bangkokMonthKey(at)}.png`, { type: 'image/png' }) : null;
  };
  const run = async (share: boolean) => {
    setBusy(true); setError('');
    try {
      const file = await picture();
      if (!file) throw new Error('no picture');
      if (share && canShareFile(file)) { await navigator.share({ files: [file], title: 'Krarok' }); return; }
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(tr("ทำภาพไม่สำเร็จ ลองอีกครั้ง"));
    } finally { setBusy(false); }
  };

  return (
    <div className="kst-maker" role="dialog" aria-modal="true" aria-label={tr("ทำภาพ Story")}>
      <div className="kst-panel lg-glass is-menu">
        <header className="kst-head"><b>{tr("ทำภาพ Story")}</b>
          <button type="button" className="kfx-ctl is-icon" onClick={onClose} aria-label={tr("ปิด")}><X size={18} aria-hidden="true" /></button></header>
        <div className="kst-body">
          <div className="kst-side">
            <fieldset className="kst-field"><legend>{tr("1. เลือกเทมเพลต")}</legend>
              {TEMPLATES.map(([key, label]) => (
                <label key={key} className={`kst-option${template === key ? ' is-on' : ''}`}>
                  <input type="radio" name="kst-template" value={key} checked={template === key} onChange={() => setTemplate(key)} />{label}
                </label>
              ))}
            </fieldset>
            <fieldset className="kst-field"><legend>{tr("2. เลือกช่วงเวลา")}</legend>
              <div className="kfx-seg" role="radiogroup" aria-label={tr("ช่วงเวลา")}>
                <button type="button" role="radio" aria-checked={period === 'this'} className={period === 'this' ? 'is-on' : ''} onClick={() => setPeriod('this')}>{tr("เดือนนี้")}</button>
                <button type="button" role="radio" aria-checked={period === 'last'} className={period === 'last' ? 'is-on' : ''} onClick={() => setPeriod('last')}>{tr("เดือนที่แล้ว")}</button>
              </div>
            </fieldset>
            <fieldset className="kst-field"><legend>{tr("3. เลือกข้อมูลที่จะเปิดเผย")}</legend>
              <button type="button" role="switch" aria-checked={show} className="kfx-ctl" onClick={() => setShow(value => !value)}>{tr("แสดงยอดเงิน")}</button>
              <span className="kst-hint">{tr("ภาพจะไม่มีชื่อลูกค้า เลขเอกสาร หรือข้อมูลบัญชี")}</span>
            </fieldset>
            <div className="kst-field"><span className="kst-legend">{tr("5. บันทึกหรือแชร์")}</span>
              <div className="kst-actions">
                <button type="button" className="kst-btn is-primary" disabled={busy || nothing} onClick={() => void run(false)}><Download size={16} aria-hidden="true" />{busy ? tr("กำลังทำภาพ…") : tr("บันทึกภาพ")}</button>
                {typeof navigator.share === 'function' && <button type="button" className="kst-btn" disabled={busy || nothing} onClick={() => void run(true)}><Share2 size={16} aria-hidden="true" />{tr("แชร์")}</button>}
              </div>
              {error && <span className="kst-error" role="alert">{error}</span>}
            </div>
          </div>
          <div className="kst-preview-col">
            <span className="kst-legend">{tr("4. ดูตัวอย่าง")}</span>
            <div className="kst-preview" style={{ width: W * PREVIEW, height: H * PREVIEW }} aria-label={tr("ภาพตัวอย่าง 1080 × 1920")} role="img">
              <div style={{ transform: `scale(${PREVIEW})`, transformOrigin: 'top left' }} aria-hidden="true">
                <Story template={template} jobs={jobs} invoices={invoices} at={at} show={show} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* The full-size copy the picture is taken from, out of sight. */}
      <div ref={capture} className="kst-capture" aria-hidden="true"><Story template={template} jobs={jobs} invoices={invoices} at={at} show={show} /></div>
    </div>
  );
}
