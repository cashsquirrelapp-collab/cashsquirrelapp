import React from 'react';
import { AlertCircle, CheckCircle2, Download, FileText, FolderOpen, Paperclip, RefreshCw, Search } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import type { VaultFile } from '../../../../shared/vault';
import { jobWhtAmount } from '../../../../shared/wht';
import { formatCurrency, safeFormatThaiDate } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';
import { RowMenu } from '../../components/ui/RowMenu';
import { uiSurface } from '../../components/ui/uiStyles';
import { useVault } from './VaultProvider';
import { KsIcon } from '../mobile/icons';
import { MobileSheet } from '../mobile/MobileHome';
import { useMobileLayout } from '../mobile/useMobileLayout';
import {
  isWht50Trackable,
  paidYearOf,
  receivedPaymentDateOf,
  wht50Files,
  wht50StatusOf,
  wht50WaitingDays,
  type Wht50TaxYear,
} from './vaultStatus';
import { downloadVaultZip } from './zip';

import { tr, T } from '../../i18n/tr';
import { currentLanguage } from '../../i18n/currentLanguage';
// เอกสาร › ติดตามใบ 50 ทวิ: one follow-up row per qualifying paid job. The attachment itself
// stays in the shared document vault; this page only derives its received/waiting status.
// 1% jobs are e-WHT (see isEWhtJob): their evidence is in the Revenue Department's system, so
// they count as backed and are never waited on; a certificate the payer issues anyway can be attached.

type Filter = 'waiting' | 'have' | 'all';
const WHT_CREDIT_NOTE = T("ภาษีที่ถูกหักไว้ นำไปหักกับภาษีที่ต้องจ่ายตอนยื่นแบบ ส่วนที่เกินขอคืนได้ หลักฐานคือใบ 50 ทวิ หรือข้อมูล e-WHT ในระบบกรมสรรพากร ได้คืนจริงเท่าไรขึ้นกับภาษีทั้งปีของคุณ");
const E_WHT_NOTE = T("งานที่หัก 1% นับเป็นการหักผ่าน e-Withholding Tax ผู้จ่ายไม่ต้องออกใบ 50 ทวิ ธนาคารส่งข้อมูลให้กรมสรรพากร ตรวจสอบได้ในระบบของกรมสรรพากร หากผู้จ่ายออกใบให้ (เช่น ค่าขนส่งที่หัก 1%) แนบไว้กับงานได้");
type Sort = 'waiting' | 'latest' | 'wht' | 'value';
type TrackingRow = {
  job: Job;
  files: VaultFile[];
  status: 'have' | 'eWht' | 'waiting';
  paidDate: string | null;
  waitingDays: number | null;
};

/** Baht with satang when there are any: these totals are what goes on the tax return. */
const exactBaht = (amount: number) => {
  const cents = Math.round(amount * 100);
  return cents % 100 === 0 ? formatCurrency(cents / 100)
    : new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100).replace('THB', '฿');
};

const compareKnownDates = (a: string | null, b: string | null, newestFirst = false) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return newestFirst ? b.localeCompare(a) : a.localeCompare(b);
};

export function Wht50Panel({ jobs, triggerAlert, year, onOpenVault }: {
  jobs: Job[];
  triggerAlert: (title: string, message: string) => void;
  year: Wht50TaxYear;
  onOpenVault: () => void;
}) {
  const vault = useVault();
  const [filter, setFilter] = React.useState<Filter>('waiting');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<Sort>('waiting');
  const [zipping, setZipping] = React.useState(false);
  const mobile = useMobileLayout();
  const [toolsOpen, setToolsOpen] = React.useState(false);

  const rows = React.useMemo<TrackingRow[]>(() => jobs
    .filter(isWht50Trackable)
    .filter(job => year === 'unknown' ? paidYearOf(job) === null : paidYearOf(job) === year)
    .map(job => {
      const files = wht50Files(job, vault.files);
      const status = wht50StatusOf(job, vault.files);
      return {
        job,
        files,
        status: status === 'have' || status === 'eWht' ? status : 'waiting',
        paidDate: receivedPaymentDateOf(job),
        waitingDays: wht50WaitingDays(job),
      };
    }), [jobs, vault.files, year]);

  const have = rows.filter(row => row.status === 'have');
  const eWht = rows.filter(row => row.status === 'eWht');
  const waiting = rows.filter(row => row.status === 'waiting');
  const needCertificate = have.length + waiting.length;
  const receivedFileCount = have.reduce((sum, row) => sum + row.files.length, 0);
  // Tax withheld on these jobs. With a 50 ทวิ, or e-WHT data at the Revenue Department, it can be
  // credited against the year's tax (any excess is refunded); without either it cannot be used yet.
  // Same amounts as the rows show.
  const withheld = (list: TrackingRow[]) => list.reduce((sum, row) => sum + jobWhtAmount(row.job), 0);
  const whtTotal = withheld(rows);
  const whtHave = withheld(have) + withheld(eWht);
  const whtWaiting = withheld(waiting);
  const share = needCertificate ? Math.round((have.length / needCertificate) * 100) : 0;
  const eWhtPart = eWht.length ? tr(" · e-WHT {0} งาน", eWht.length) : '';
  const q = query.trim().toLocaleLowerCase();
  const shown = rows
    .filter(row => filter === 'all' || row.status === filter || (filter === 'have' && row.status === 'eWht'))
    .filter(row => !q || [row.job.name, row.job.client, ...row.files.map(file => file.fileName)]
      .some(value => value?.toLocaleLowerCase().includes(q)))
    .sort((a, b) => {
      if (sort === 'wht') return jobWhtAmount(b.job) - jobWhtAmount(a.job) || a.job.name.localeCompare(b.job.name, 'th');
      if (sort === 'value') return (b.job.value || 0) - (a.job.value || 0) || a.job.name.localeCompare(b.job.name, 'th');
      if (sort === 'latest') return compareKnownDates(a.paidDate, b.paidDate, true) || a.job.name.localeCompare(b.job.name, 'th');
      const waitingFirst = Number(b.status === 'waiting') - Number(a.status === 'waiting');
      return waitingFirst || compareKnownDates(a.paidDate, b.paidDate) || a.job.name.localeCompare(b.job.name, 'th');
    });

  const downloadAll = async () => {
    const files = have.flatMap(row => row.files);
    if (!files.length) return;
    setZipping(true);
    const yearLabel = year === 'unknown' ? tr("ไม่ระบุปีภาษี") : String(currentLanguage === 'en' ? year : year + 543);
    try { await downloadVaultZip(files, tr("ใบ50ทวิ-{0}.zip", yearLabel)); }
    catch (err) { triggerAlert(tr("ดาวน์โหลดไม่สำเร็จ"), (err as Error).message); }
    finally { setZipping(false); }
  };

  const chip = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer ${on ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`;
  const filterOrder: Filter[] = ['waiting', 'have', 'all'];
  const moveFilterFocus = (event: React.KeyboardEvent<HTMLButtonElement>, current: Filter) => {
    const currentIndex = filterOrder.indexOf(current);
    const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % filterOrder.length
      : event.key === 'ArrowLeft' ? (currentIndex - 1 + filterOrder.length) % filterOrder.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? filterOrder.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = filterOrder[nextIndex];
    setFilter(next);
    requestAnimationFrame(() => document.getElementById(`wht50-tab-${next}`)?.focus());
  };
  const statusChip = (row: TrackingRow) => row.status === 'have'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F7F0] px-2.5 py-1 text-xs font-medium text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]"><CheckCircle2 className="h-3.5 w-3.5" />{tr("ได้รับแล้ว · {0} ไฟล์", row.files.length)}</span>
    : row.status === 'eWht'
      ? <span className="block space-y-0.5">
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-faint px-2.5 py-1 text-xs font-medium text-brand-text"><CheckCircle2 className="h-3.5 w-3.5 text-[#18A66A] dark:text-[#6FD3A3]" />e-WHT</span>
          <span className="block text-[11px] text-brand-muted">{tr("ไม่ต้องรอใบ 50 ทวิ")}</span>
        </span>
      : <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF4D8] px-2.5 py-1 text-xs font-medium text-[#93620A] dark:bg-[#F2B84B]/10 dark:text-[#F2C66D]"><span className="h-1.5 w-1.5 rounded-full bg-current" />{tr("รอใบ 50 ทวิ")}</span>;
  const waitingCell = (row: TrackingRow) => (
    <div className="space-y-0.5">
      <span className="block font-mono text-[13px] font-semibold text-[#A9650B] dark:text-[#F2C66D]">
        {row.waitingDays === null ? '—' : row.waitingDays === 0 ? tr("วันนี้") : tr("{0} วัน", row.waitingDays)}
      </span>
      <span className="block text-[11px] text-brand-muted">{row.paidDate ? safeFormatThaiDate(row.paidDate, { day: 'numeric', month: 'short', year: '2-digit' }) : tr("ไม่พบวันที่รับเงินจริง")}</span>
    </div>
  );
  const action = (row: TrackingRow, wide = false) => row.status === 'have'
    ? <button type="button" aria-label={tr("ดูเอกสารของ {0}", row.job.name)} onClick={() => vault.openJob(row.job)}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-border px-3 text-xs font-medium text-brand-text hover:bg-brand-faint cursor-pointer ${wide ? 'w-full' : ''}`}>
        <FileText className="h-3.5 w-3.5" />{tr("ดูเอกสาร")}</button>
    : row.status === 'eWht'
      ? <button type="button" aria-label={tr("แนบเอกสารของ {0} (ถ้ามี)", row.job.name)} onClick={() => vault.openUpload({ kind: 'wht50', job: row.job })}
        className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-border px-3 text-xs font-medium text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer ${wide ? 'w-full' : ''}`}>
          <Paperclip className="h-3.5 w-3.5" />{tr("แนบ (ถ้ามี)")}</button>
    : <button type="button" aria-label={tr("แนบใบ 50 ทวิสำหรับ {0}", row.job.name)} onClick={() => vault.openUpload({ kind: 'wht50', job: row.job })}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#F3B08C] px-3 text-xs font-semibold text-[#C24A16] hover:bg-[#FFF5EE] dark:border-[#E65F2B]/40 dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10 cursor-pointer ${wide ? 'w-full' : ''}`}>
        <Paperclip className="h-3.5 w-3.5" />{tr("แนบใบ 50 ทวิ")}</button>;
  const menu = (row: TrackingRow) => (
    <RowMenu label={tr("ตัวเลือกของ {0}", row.job.name)} items={[
      ...(row.files.length ? [
        { label: tr("ดูเอกสาร"), run: () => vault.openJob(row.job) },
        { label: tr("จัดการไฟล์"), run: () => vault.openJob(row.job) },
      ] : []),
      { label: row.files.length ? tr("แนบเอกสารเพิ่ม") : tr("แนบเอกสาร"), run: () => vault.openUpload({ kind: 'wht50', job: row.job }) },
    ]} />
  );

  if (!vault.available) {
    return <p className={`${uiSurface} p-6 text-[13px] text-brand-muted`}>{tr("การติดตามใบ 50 ทวิใช้ได้กับบัญชีจริง ออกจากโหมดทดลองแล้วเข้าสู่ระบบเพื่อใช้งาน")}</p>;
  }

  if (vault.error) {
    return (
      <div role="alert" className={`${uiSurface} flex flex-col items-center px-6 py-12 text-center`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FDEEEE] text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]"><AlertCircle className="h-5 w-5" /></span>
        <p className="mt-3 text-[15px] font-semibold text-brand-text">{tr("โหลดสถานะใบ 50 ทวิไม่สำเร็จ")}</p>
        <p className="mt-1 max-w-md text-[13px] text-brand-muted">{tr("ยังไม่แสดงจำนวน “ได้รับแล้ว” หรือ “ยังรอ” เพื่อป้องกันสถานะคลาดเคลื่อน กรุณาลองโหลดข้อมูลอีกครั้ง")}</p>
        <p className="mt-2 max-w-md text-xs text-[#B83434] dark:text-[#F19A9A]">{vault.error}</p>
        <button type="button" onClick={vault.refresh} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-border px-4 text-[13px] font-semibold text-brand-text hover:bg-brand-faint cursor-pointer"><RefreshCw className="h-4 w-4" />{tr("ลองอีกครั้ง")}</button>
      </div>
    );
  }

  if (!vault.ready) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" aria-label={tr("กำลังโหลดสถานะใบ 50 ทวิ")} className="space-y-4">
        <span className="sr-only">{tr("กำลังโหลดสถานะใบ 50 ทวิ")}</span>
        <section className={`${uiSurface} overflow-hidden`}>
          <div className="grid grid-cols-2 sm:grid-cols-3">
            {[0, 1, 2].map(index => <div key={index} className={`${index === 0 ? 'col-span-2 border-b sm:col-span-1 sm:border-b-0 sm:border-r' : index === 1 ? 'border-r' : ''} space-y-2 border-brand-border px-4 py-4 sm:px-5 sm:py-5`}><span className="block h-5 w-12 animate-pulse rounded bg-brand-faint motion-reduce:animate-none" /><span className="block h-3 w-20 max-w-full animate-pulse rounded bg-brand-faint motion-reduce:animate-none" /></div>)}
          </div>
          <div className="space-y-2 border-t border-brand-border px-4 py-4 sm:px-5"><span className="block h-3 w-40 animate-pulse rounded bg-brand-faint motion-reduce:animate-none" /><span className="block h-2 w-full animate-pulse rounded-full bg-brand-faint motion-reduce:animate-none" /></div>
        </section>
        <div className={`${uiSurface} space-y-3 p-5`}>{[0, 1, 2].map(index => <span key={index} className="block h-16 animate-pulse rounded-xl bg-brand-faint motion-reduce:animate-none" />)}</div>
      </div>
    );
  }

  const sectionTitle = filter === 'waiting'
    ? tr("งานที่ยังรอเอกสาร ({0})", waiting.length)
    : filter === 'have'
      ? tr("งานที่มีหลักฐานแล้ว ({0})", have.length + eWht.length)
      : eWht.length ? tr("งานทั้งหมดที่หัก ณ ที่จ่าย ({0})", rows.length) : tr("งานทั้งหมดที่ต้องมีใบ 50 ทวิ ({0})", rows.length);
  const sectionHelper = filter === 'waiting'
    ? tr("ควรติดตามตามลำดับจากงานที่รอนานที่สุด")
    : filter === 'have'
      ? eWht.length ? tr("ใบ 50 ทวิที่แนบไว้ และงานที่หัก 1% ผ่าน e-WHT") : tr("เปิดดูหรือจัดการไฟล์ที่ได้รับแล้ว")
      : eWht.length ? tr("รวมงานที่ยังรอ งานที่ได้รับเอกสารแล้ว และงานที่หักผ่าน e-WHT") : tr("รวมงานที่ยังรอและงานที่ได้รับเอกสารแล้ว");

  const emptyState = (() => {
    if (q) return { title: tr("ไม่พบงานที่ตรงกับคำค้นหา"), copy: tr("ลองค้นหาด้วยชื่องานหรือลูกค้าอื่น") };
    if (!rows.length) return { title: tr("ยังไม่มีงานที่ต้องติดตามใบ 50 ทวิ"), copy: year === 'unknown' ? tr("ไม่มีงานที่รับเงินจริงแล้วแต่ยังไม่ระบุวันที่รับเงิน") : tr("งานที่มีการหัก ณ ที่จ่ายจะถูกนำมาติดตามที่นี่โดยอัตโนมัติ") };
    if (filter === 'waiting') return { title: tr("เอกสารครบแล้ว ✓"), copy: year === 'unknown' ? tr("งานที่ไม่ระบุปีภาษีได้รับใบ 50 ทวิครบแล้ว") : tr("ปีภาษีนี้คุณได้รับใบ 50 ทวิครบทุกงานแล้ว") };
    if (filter === 'have') return { title: tr("ยังไม่มีใบ 50 ทวิที่ได้รับ"), copy: tr("เมื่อแนบเอกสารจากงาน รายการจะปรากฏตรงนี้") };
    return { title: tr("ไม่พบรายการ"), copy: tr("ลองเปลี่ยนตัวกรองหรือคำค้นหา") };
  })();

  // Phones: the mobile design's 50 ทวิ list. Same rows, filters and vault actions as below; search,
  // sorting and the zip download sit behind the ⋯ button.
  if (mobile) {
    const toolsActive = Boolean(q) || sort !== 'waiting';
    return (
      <div>
        <section aria-label={tr("สรุปการติดตามใบ 50 ทวิ")} aria-live="polite" className="ksm-metrics">
          <div className="ksm-metric is-wide"><small>{tr("ภาษีหัก ณ ที่จ่ายรวม · {0} งาน", rows.length)}</small><b data-testid="wht-total">{exactBaht(whtTotal)}</b></div>
          <div className={`ksm-metric${waiting.length > 0 ? ' is-warning' : ''}`}><small>{tr("ยังไม่มีเอกสาร · {0} งาน", waiting.length)}</small><b data-testid="wht-waiting">{exactBaht(whtWaiting)}</b></div>
          <div className="ksm-metric"><small>{tr("มีหลักฐานรองรับ · {0} งาน", have.length + eWht.length)}</small><b data-testid="wht-have">{exactBaht(whtHave)}</b></div>
        </section>
        <p className="ksm-hint">{tr(WHT_CREDIT_NOTE)}</p>
        {eWht.length > 0 && <p className="ksm-hint" data-testid="ewht-note">{tr(E_WHT_NOTE)}</p>}
        <div className="ksm-row-between">
          <div className="ksm-chips" role="tablist" aria-label={tr("สถานะใบ 50 ทวิ")}>
            {filterOrder.map(option => {
              const label = option === 'waiting' ? tr("ยังรอ") : option === 'have' ? tr("ได้รับแล้ว") : tr("ทั้งหมด");
              const count = option === 'waiting' ? waiting.length : option === 'have' ? have.length + eWht.length : rows.length;
              return (
                <button key={option} id={`wht50-tab-${option}`} type="button" role="tab" aria-selected={filter === option} aria-controls="wht50-tabpanel"
                  tabIndex={filter === option ? 0 : -1} onClick={() => setFilter(option)} onKeyDown={event => moveFilterFocus(event, option)}>
                  {label} {count}
                </button>
              );
            })}
          </div>
          <button type="button" className={`ksm-plainbtn${toolsActive ? ' is-active' : ''}`} onClick={() => setToolsOpen(true)} aria-haspopup="dialog" aria-label={tr("เครื่องมือ 50 ทวิ")}>
            <KsIcon name="more" />{toolsActive && <i aria-hidden="true" />}
          </button>
        </div>
        <section id="wht50-tabpanel" role="tabpanel" aria-labelledby={`wht50-tab-${filter}`}>
          {shown.length === 0 ? (
            <div className="ksm-empty" style={{ marginTop: 12 }}><h3>{emptyState.title}</h3><p>{emptyState.copy}</p></div>
          ) : shown.map(row => (
            <article key={row.job.id} className="ksm-whtcard">
              <h3>{row.job.client || row.job.name}</h3>
              <p>{tr("{0} · หัก ณ ที่จ่าย {1}", row.job.name, formatCurrency(jobWhtAmount(row.job)))}</p>
              <div className="ksm-whtcard-foot">
                <span className={`ksm-badge ${row.status === 'waiting' ? 'is-warning' : 'is-success'}`}>
                  <KsIcon name={row.status === 'waiting' ? 'clock' : 'check'} size={14} />
                  {row.status === 'have'
                    ? tr("ได้รับไฟล์แล้ว · {0} ไฟล์", row.files.length)
                    : row.status === 'eWht'
                      ? tr("หักผ่าน e-WHT · ไม่ต้องรอใบ")
                      : tr("ยังรอเอกสาร{0}", row.waitingDays === null ? '' : row.waitingDays === 0 ? tr(" · วันนี้") : tr(" · {0} วัน", row.waitingDays))}
                </span>
                <button type="button" className="ksm-btn is-soft is-small"
                  aria-label={row.status === 'have' ? tr("ดูเอกสารของ {0}", row.job.name) : tr("แนบใบ 50 ทวิสำหรับ {0}", row.job.name)}
                  onClick={() => (row.status === 'have' ? vault.openJob(row.job) : vault.openUpload({ kind: 'wht50', job: row.job }))}>
                  <KsIcon name="upload" size={17} />{tr("แนบ / จัดการ")}</button>
              </div>
            </article>
          ))}
        </section>
        <p className="ksm-caption">{tr("สถานะมีใบรับรองอ้างอิงไฟล์ที่แนบ ไม่ใช่สถานะการรับเงิน")}</p>
        {toolsOpen && (
          <MobileSheet title={tr("เครื่องมือ 50 ทวิ")} onClose={() => setToolsOpen(false)}>
            <div className="ksm-search" style={{ marginTop: 14 }}>
              <KsIcon name="search" />
              <input type="text" inputMode="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("ค้นหางาน / ลูกค้า...")} aria-label={tr("ค้นหางานหรือลูกค้า")} enterKeyHint="search" />
            </div>
            <div className="ksm-selects" style={{ gridTemplateColumns: '1fr' }}>
              <label><span>{tr("เรียงตาม")}</span>
                <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
                  <option value="waiting">{tr("รอนานที่สุด")}</option>
                  <option value="latest">{tr("ล่าสุด")}</option>
                  <option value="wht">{tr("WHT สูงสุด")}</option>
                  <option value="value">{tr("ยอดงานสูงสุด")}</option>
                </select>
              </label>
            </div>
            <div className="ksm-list" style={{ marginTop: 12 }}>
              <button type="button" disabled={!receivedFileCount || zipping} onClick={() => { setToolsOpen(false); void downloadAll(); }}>
                <span className="ksm-list-icon"><KsIcon name="download" /></span>
                <span className="ksm-grow"><b>{zipping ? tr("กำลังรวมไฟล์…") : tr("ดาวน์โหลดใบที่ได้รับแล้ว ({0} ไฟล์)", receivedFileCount)}</b><p>{tr("ได้รับแล้ว {0} จาก {1} งานที่ต้องมีใบ · {2}%", have.length, needCertificate, share)}</p></span>
              </button>
            </div>
          </MobileSheet>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section aria-label={tr("สรุปการติดตามใบ 50 ทวิ")} className={`${uiSurface} overflow-hidden`}>
        <div aria-live="polite" className="grid grid-cols-2 sm:grid-cols-3">
          <div className="col-span-2 min-w-0 border-b border-brand-border px-4 py-3 sm:col-span-1 sm:border-b-0 sm:border-r sm:px-5 sm:py-5">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-brand-muted sm:text-xs">{tr("ภาษีหัก ณ ที่จ่ายรวม")}</p>
            <p className="mt-1 font-mono text-[24px] font-semibold leading-8 text-brand-text tabular-nums" data-testid="wht-total">{exactBaht(whtTotal)}</p>
            <p className="mt-0.5 text-[11px] text-brand-muted sm:text-xs">{tr("{0} งานที่ต้องมีใบ 50 ทวิ{1}", needCertificate, eWhtPart)}</p>
          </div>
          <div className="min-w-0 border-r border-brand-border px-4 py-3 sm:px-5 sm:py-5">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-brand-muted sm:text-xs"><span className="h-1.5 w-1.5 rounded-full bg-[#18A66A]" />{tr("มีหลักฐานรองรับ")}</p>
            <p className="mt-1 font-mono text-[24px] font-semibold leading-8 text-[#12804F] tabular-nums dark:text-[#6FD3A3]" data-testid="wht-have">{exactBaht(whtHave)}</p>
            <p className="mt-0.5 text-[11px] text-brand-muted sm:text-xs">{tr("ได้รับแล้ว {0} งาน{1} · ใช้เครดิตหรือขอคืนภาษีได้", have.length, eWhtPart)}</p>
          </div>
          <div className="min-w-0 px-4 py-3 sm:px-5 sm:py-5">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-brand-muted sm:text-xs"><span className="h-1.5 w-1.5 rounded-full bg-[#E79A24]" />{tr("ยังไม่มีเอกสาร")}</p>
            <p className="mt-1 font-mono text-[24px] font-semibold leading-8 text-[#A9650B] tabular-nums dark:text-[#F2C66D]" data-testid="wht-waiting">{exactBaht(whtWaiting)}</p>
            <p className="mt-0.5 text-[11px] text-brand-muted sm:text-xs">{tr("ยังรอ {0} งาน · ต้องได้ใบ 50 ทวิก่อนจึงใช้ได้", waiting.length)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-brand-border px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-brand-muted">
              <span>{tr("ได้รับแล้ว {0} จาก {1} งานที่ต้องมีใบ 50 ทวิ", have.length, needCertificate)}</span>
              <span className="shrink-0 font-mono font-semibold text-brand-text">{share}%</span>
            </div>
            <div role="progressbar" aria-label={tr("ความคืบหน้าการได้รับใบ 50 ทวิ")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-valuetext={tr("ได้รับแล้ว {0} จาก {1} งาน", have.length, needCertificate)} className="h-2 overflow-hidden rounded-full bg-brand-faint"><div className="h-full rounded-full bg-[#18A66A] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${share}%` }} /></div>
          </div>
          <button type="button" onClick={() => void downloadAll()} disabled={!receivedFileCount || zipping}
            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-4 text-[13px] font-medium text-brand-text hover:bg-brand-faint disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#1F2024] cursor-pointer lg:w-auto">
            <Download className="h-4 w-4" />{zipping ? tr("กำลังรวมไฟล์…") : tr("ดาวน์โหลดใบที่ได้รับแล้ว ({0} ไฟล์)", receivedFileCount)}
          </button>
        </div>
        <p className="border-t border-brand-border px-4 py-3 text-[11.5px] leading-relaxed text-brand-muted sm:px-5">{tr(WHT_CREDIT_NOTE)}</p>
        {eWht.length > 0 && <p className="-mt-1.5 px-4 pb-3 text-[11.5px] leading-relaxed text-brand-muted sm:px-5" data-testid="ewht-note">{tr(E_WHT_NOTE)}</p>}
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label={tr("สถานะใบ 50 ทวิ")}>
          {filterOrder.map(option => {
            const label = option === 'waiting' ? tr("ยังรอ") : option === 'have' ? tr("ได้รับแล้ว") : tr("ทั้งหมด");
            const count = option === 'waiting' ? waiting.length : option === 'have' ? have.length + eWht.length : rows.length;
            return <button key={option} id={`wht50-tab-${option}`} type="button" role="tab" aria-selected={filter === option} aria-controls="wht50-tabpanel" tabIndex={filter === option ? 0 : -1} onKeyDown={event => moveFilterFocus(event, option)} onClick={() => setFilter(option)} className={chip(filter === option)}>{label} <span className="text-xs opacity-70">{count}</span></button>;
          })}
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:ml-auto lg:w-auto">
          <div className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("ค้นหางาน / ลูกค้า...")} aria-label={tr("ค้นหางานหรือลูกค้า")}
              className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B] dark:bg-[#1F2024]" />
          </div>
          <select value={sort} onChange={event => setSort(event.target.value as Sort)} aria-label={tr("เรียงตาม")}
            className="h-10 w-full rounded-xl border border-brand-border bg-brand-white px-3 text-[13px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#1F2024] cursor-pointer sm:w-auto">
            <option value="waiting">{tr("รอนานที่สุด")}</option>
            <option value="latest">{tr("ล่าสุด")}</option>
            <option value="wht">{tr("WHT สูงสุด")}</option>
            <option value="value">{tr("ยอดงานสูงสุด")}</option>
          </select>
        </div>
      </div>

      <section id="wht50-tabpanel" role="tabpanel" aria-labelledby={`wht50-tab-${filter}`} className="space-y-3">
        <div>
          <h2 id="wht50-list-title" className="text-[15px] font-semibold text-brand-text">{sectionTitle}</h2>
          <p className="mt-0.5 text-xs text-brand-muted">{sectionHelper}</p>
        </div>

        {shown.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-brand-border px-6 py-10 text-center">
            {filter === 'waiting' && rows.length > 0 && !q && <Mascot mood="proud" action="hold-document" animated={false} size={64} className="mb-2" />}
            <p className="text-[15px] font-semibold text-brand-text">{emptyState.title}</p>
            <p className="mt-1 max-w-sm text-[13px] text-brand-muted">{emptyState.copy}</p>
          </div>
        ) : (
          <>
            <div className={`${uiSurface} hidden overflow-hidden lg:block`}>
              <table className="w-full table-fixed text-[13px]">
                <thead className="border-b border-brand-border text-left text-xs text-brand-muted">
                  <tr>
                    <th className="w-[34%] px-5 py-3 font-medium">{tr("งาน / ลูกค้า")}</th>
                    <th className="w-[14%] px-3 py-3 text-right font-medium">{tr("ยอดงาน")}</th>
                    <th className="w-[20%] px-3 py-3 text-right font-medium">{tr("ภาษีหัก ณ ที่จ่าย")}</th>
                    <th className="w-[13%] px-3 py-3 font-medium">{filter === 'waiting' ? tr("รอมานาน") : tr("สถานะ")}</th>
                    <th className="w-[15%] px-3 py-3 font-medium">{tr("ดำเนินการ")}</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {shown.map(row => (
                    <tr key={row.job.id} className="transition-colors duration-150 hover:bg-brand-faint/50">
                      <td className="min-w-0 px-5 py-4">
                        <span title={row.job.name} className="block truncate font-medium text-brand-text">{row.job.name}</span>
                        <span title={row.job.client || undefined} className="mt-0.5 block truncate text-xs text-brand-muted">{row.job.client || '—'} · {row.paidDate ? tr("รับเงินจริง {0}", safeFormatThaiDate(row.paidDate, { day: 'numeric', month: 'short', year: '2-digit' })) : tr("ไม่ระบุวันรับเงินจริง")}</span>
                      </td>
                      <td className="px-3 py-4 text-right font-mono text-brand-text">{formatCurrency(row.job.value || 0)}</td>
                      <td className="px-3 py-4 text-right font-mono text-brand-text">{row.job.whtRate || 0}% <span className="text-brand-muted">({formatCurrency(jobWhtAmount(row.job))})</span></td>
                      <td className="px-3 py-4">{row.status === 'waiting' ? waitingCell(row) : statusChip(row)}</td>
                      <td className="px-3 py-4">{action(row)}</td>
                      <td className="px-2 py-4">{menu(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className={`${uiSurface} divide-y divide-brand-border lg:hidden`}>
              {shown.map(row => (
                <li key={row.job.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-brand-text">{row.job.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-brand-muted">{row.job.client || '—'}</span>
                    </div>
                    {menu(row)}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="block text-brand-muted">{tr("ยอดงาน")}</span><span className="mt-0.5 block font-mono font-medium text-brand-text">{formatCurrency(row.job.value || 0)}</span></div>
                    <div><span className="block text-brand-muted">WHT</span><span className="mt-0.5 block font-mono font-medium text-brand-text">{row.job.whtRate || 0}% · {formatCurrency(jobWhtAmount(row.job))}</span></div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-brand-border/70 pt-3">
                    <div className="min-w-0">
                      {row.status === 'waiting' ? waitingCell(row) : statusChip(row)}
                      {row.status !== 'waiting' && row.paidDate && <span className="mt-1 block text-[11px] text-brand-muted">{tr("รับเงินจริง {0}", safeFormatThaiDate(row.paidDate, { day: 'numeric', month: 'short', year: '2-digit' }))}</span>}
                    </div>
                  </div>
                  {action(row, true)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-brand-border/70 bg-brand-faint/50 px-3.5 py-3 text-xs text-brand-muted sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#C24A16] dark:text-[#FF9A6B]" />
          <p><span className="font-semibold text-brand-text">{tr("เคล็ดลับ:")}</span> {tr("แนบเอกสาร 50 ทวิจากหน้านี้ หรืออัปโหลดใน “คลังเอกสาร” แล้วผูกกับงานภายหลังได้")}</p>
        </div>
        <button type="button" onClick={onOpenVault} className="shrink-0 self-start font-semibold text-[#C24A16] hover:underline dark:text-[#FF9A6B] cursor-pointer sm:self-auto">{tr("ไปที่คลังเอกสาร →")}</button>
      </div>
    </div>
  );
}
