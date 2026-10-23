import React from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { incomeRowsForMonth, incomeRowsForYear, sumIncome, type IncomeRow } from '../../../../shared/incomeExport';
import { getJobPaymentEntries } from '../../../../shared/installmentPayments';
import { displayYear, formatCurrency, installmentLabel } from '../../utils';
import { currentLanguage } from '../../i18n/currentLanguage';
import { Modal } from '../../components/ui/Modal';

import { tr } from '../../i18n/tr';
// Income (money received) as an Excel file: one month, or a whole year with a sheet per month
// summary plus every payment. Same numbers as the dashboard.

const MONTHS_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
// Thai: Thai month and Buddhist Era year; English: English month and the Gregorian year.
const isEn = () => currentLanguage === 'en';
const monthLabel = (key: string) => isEn()
  ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  : `${MONTHS_TH[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(0, 4)) + 543}`;
const thaiDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${isEn() ? iso.slice(0, 4) : Number(iso.slice(0, 4)) + 543}`;
const MONEY = '#,##0.00';

export type IncomePeriod = { kind: 'month'; monthKey: string } | { kind: 'year'; year: number };

export async function downloadIncomeExcel(jobs: Job[], period: IncomePeriod): Promise<boolean> {
  const XLSX = await import('xlsx');
  const header = [tr("วันที่รับเงิน"), tr("งาน"), tr("ลูกค้า"), tr("ประเภทงาน"), tr("รายการ"), tr("ยอดก่อนหัก (บาท)"), tr("หัก ณ ที่จ่าย (%)"), tr("หัก ณ ที่จ่าย (บาท)"), tr("รับจริง (บาท)")];
  const rowCells = (r: IncomeRow) => [thaiDate(r.date), r.jobName, r.client, tr(r.type), installmentLabel(r.label), r.gross, r.whtRate ? r.whtRate / 100 : 0, r.wht, r.received];
  const formatSheet = (sheet: import('xlsx').WorkSheet, rows: number, money: number[], percent: number[] = []) => {
    for (let r = 1; r <= rows; r++) {
      for (const c of money) { const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (cell && typeof cell.v === 'number') cell.z = MONEY; }
      for (const c of percent) { const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (cell && typeof cell.v === 'number') cell.z = '0.##%'; }
    }
  };
  const paymentsSheet = (rows: IncomeRow[]) => {
    const total = sumIncome(rows);
    const data = [header, ...rows.map(rowCells), [], [tr("รวม"), '', '', '', tr("{0} รายการ", rows.length), total.gross, '', total.wht, total.received]];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = [{ wch: 13 }, { wch: 32 }, { wch: 24 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    formatSheet(sheet, data.length, [5, 7, 8], [6]);
    return sheet;
  };

  const book = XLSX.utils.book_new();
  let fileName: string;
  if (period.kind === 'month') {
    const rows = incomeRowsForMonth(jobs, period.monthKey);
    if (!rows.length) return false;
    XLSX.utils.book_append_sheet(book, paymentsSheet(rows), tr("รายรับ"));
    fileName = tr("รายรับ_{0}.xlsx", monthLabel(period.monthKey).replace(' ', '_'));
  } else {
    const rows = incomeRowsForYear(jobs, period.year);
    if (!rows.length) return false;
    const summary = [[tr("เดือน"), tr("จำนวนรายการ"), tr("ยอดก่อนหัก (บาท)"), tr("หัก ณ ที่จ่าย (บาท)"), tr("รับจริง (บาท)")]];
    for (let m = 1; m <= 12; m++) {
      const key = `${period.year}-${String(m).padStart(2, '0')}`;
      const monthRows = rows.filter(r => r.date.startsWith(key));
      const t = sumIncome(monthRows);
      summary.push([monthLabel(key), monthRows.length, t.gross, t.wht, t.received] as never);
    }
    const t = sumIncome(rows);
    summary.push([] as never, [tr("รวมทั้งปี"), rows.length, t.gross, t.wht, t.received] as never);
    const sheet = XLSX.utils.aoa_to_sheet(summary);
    sheet['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    formatSheet(sheet, summary.length, [2, 3, 4]);
    XLSX.utils.book_append_sheet(book, sheet, tr("สรุปรายเดือน"));
    XLSX.utils.book_append_sheet(book, paymentsSheet(rows), tr("รายการทั้งหมด"));
    fileName = tr("รายรับ_ปี_{0}.xlsx", isEn() ? period.year : period.year + 543);
  }
  XLSX.writeFile(book, fileName);
  return true;
}

/** Months that have income, plus the last 12 months, newest first. */
function monthOptions(jobs: Job[]): string[] {
  const keys = new Set<string>();
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  for (const job of jobs) for (const entry of getJobPaymentEntries(job)) if (entry.date) keys.add(entry.date.slice(0, 7));
  return [...keys].sort().reverse();
}

export function IncomeExportDialog({ open, jobs, onClose, initialMonth, notify }: {
  open: boolean;
  jobs: Job[];
  onClose: () => void;
  initialMonth?: string;
  notify: (title: string, message: string) => void;
}) {
  const months = React.useMemo(() => monthOptions(jobs), [jobs]);
  const years = React.useMemo(() => [...new Set(months.map(m => Number(m.slice(0, 4))))].sort((a, b) => b - a), [months]);
  const [kind, setKind] = React.useState<'month' | 'year'>('month');
  const [monthKey, setMonthKey] = React.useState(months[0]);
  const [year, setYear] = React.useState(years[0]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setKind('month'); setMonthKey(initialMonth && months.includes(initialMonth) ? initialMonth : months[0]); setYear(years[0]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = kind === 'month' ? incomeRowsForMonth(jobs, monthKey) : incomeRowsForYear(jobs, year);
  const total = sumIncome(rows);
  const download = async () => {
    setBusy(true);
    try {
      const ok = await downloadIncomeExcel(jobs, kind === 'month' ? { kind, monthKey } : { kind, year });
      if (ok) onClose(); else notify(tr("ไม่พบรายรับ"), tr("ช่วงเวลานี้ยังไม่มีเงินเข้า"));
    } catch { notify(tr("ดาวน์โหลดไม่สำเร็จ"), tr("สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setBusy(false); }
  };
  const field = 'h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-[14px] text-brand-text outline-none focus:border-[#E65F2B] cursor-pointer dark:bg-[#141518]';

  return (
    <Modal open={open} onClose={onClose} label={tr("ส่งออกรายรับ")} width={420}>
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-3 pr-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]"><FileSpreadsheet className="h-5 w-5" /></span>
          <div>
            <p className="text-[16px] font-semibold text-brand-text">{tr("ส่งออกรายรับ")}</p>
            <p className="text-xs text-brand-muted">{tr("ไฟล์ Excel ของเงินที่รับจริง แยกตามวันที่เงินเข้า")}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={tr("ช่วงเวลา")}>
          {([['month', tr("รายเดือน")], ['year', tr("ทั้งปี")]] as const).map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={kind === key} onClick={() => setKind(key)}
              className={`h-10 rounded-full border text-[13px] font-medium transition-colors cursor-pointer ${kind === key ? 'border-[#E65F2B] bg-[#E65F2B] text-white' : 'border-brand-border text-brand-text hover:bg-brand-faint'}`}>{label}</button>
          ))}
        </div>
        {kind === 'month' ? (
          <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-brand-text">{tr("เดือน")}</span>
            <select value={monthKey} onChange={e => setMonthKey(e.target.value)} className={field} aria-label={tr("เดือน")}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </label>
        ) : (
          <label className="block"><span className="mb-1.5 block text-[13px] font-medium text-brand-text">{tr("ปี")}</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className={field} aria-label={tr("ปี")}>
              {years.map(y => <option key={y} value={y}>{displayYear(y)}</option>)}
            </select>
          </label>
        )}
        <dl className="space-y-1.5 rounded-xl bg-brand-faint/70 px-4 py-3 text-[13px]">
          <div className="flex justify-between"><dt className="text-brand-muted">{tr("จำนวนรายการ")}</dt><dd className="text-brand-text">{tr("{0} รายการ", rows.length)}</dd></div>
          <div className="flex justify-between"><dt className="text-brand-muted">{tr("หัก ณ ที่จ่าย")}</dt><dd className="font-mono text-brand-text">{formatCurrency(total.wht)}</dd></div>
          <div className="flex justify-between border-t border-brand-border pt-1.5"><dt className="font-medium text-brand-text">{tr("รับจริง")}</dt><dd className="font-mono font-semibold text-brand-text">{formatCurrency(total.received)}</dd></div>
        </dl>
        {kind === 'year' && <p className="text-xs text-brand-muted">{tr("ไฟล์มี 2 ชีต: สรุปรายเดือน และรายการทั้งหมด")}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-brand-border text-[14px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer">{tr("ยกเลิก")}</button>
          <button type="button" onClick={() => void download()} disabled={busy || rows.length === 0}
            className="inline-flex h-11 flex-[1.5] items-center justify-center gap-1.5 rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            <Download className="h-4 w-4" />{busy ? tr("กำลังสร้างไฟล์…") : tr("ดาวน์โหลด Excel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
