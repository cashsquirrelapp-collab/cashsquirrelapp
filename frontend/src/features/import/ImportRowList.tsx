import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../utils';
import { tr } from '../../i18n/tr';
import { categoryText } from '../incomeExpense/ExpenseDrawer';
import type { ImportRow } from './sheetImport';
import { ISSUE_LABELS, QUIET_ISSUES } from './importShared';
import { primaryIssue } from './importChatModel';
import { RowDetail } from './ImportReview';
import { useLanguage } from '../../i18n/LanguageContext';

// The rows of the file inside the import's report card (owner, 2026-11-04, a picture of the card he wanted: "อยากให้มันเป็น
// การ์ดแบบนี้ดูง่ายดี"): งาน / รายจ่าย as two tabs, each row a card with a tick to keep it in or leave it out, its name, the
// client or category, a status chip, the date and the amount, and ดูรายละเอียด for where it came from in the file.

const PAGE = 30;

/** A row the card lists: a job or an expense of its own. Rows left out by themselves (folded into a job from another tab, a
 *  transfer, a total, already in the app) are not; the check's steps say how many were already in the app. */
export const listedRow = (row: ImportRow) => ((row.kind === 'job' && !!row.job) || (row.kind === 'expense' && !!row.expense))
  && !(row.state === 'skip' && row.issues.some(issue => QUIET_ISSUES.includes(issue)));
type Tab = 'jobs' | 'expenses';

const day = (value: string | null | undefined, locale: string) => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T12:00:00+07:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }) : value;
};

/** A job's payment as one chip: received in full, a deposit, overdue, or waiting. */
function jobChip(row: ImportRow, today: string): { tone: 'ok' | 'part' | 'late' | 'wait'; label: string } {
  const job = row.job!;
  if (job.value > 0 && job.pending <= 0) return { tone: 'ok', label: tr("รับเงินครบแล้ว") };
  if (job.received > 0) return { tone: 'part', label: tr("รับมัดจำแล้ว") };
  if (job.payDate && job.payDate < today) return { tone: 'late', label: tr("เกินกำหนด") };
  return { tone: 'wait', label: tr("รอรับเงิน") };
}

export function ImportRowList({ rows, isIncluded, setIncluded, multiSheet, today }: {
  rows: ImportRow[];
  isIncluded: (row: ImportRow) => boolean;
  setIncluded: (change: (all: Record<string, boolean>) => Record<string, boolean>) => void;
  multiSheet: boolean;
  today: string;
}) {
  const { language } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-GB';
  const jobs = React.useMemo(() => rows.filter(row => row.kind === 'job' && listedRow(row)), [rows]);
  const expenses = React.useMemo(() => rows.filter(row => row.kind === 'expense' && listedRow(row)), [rows]);
  const [tab, setTab] = React.useState<Tab>(() => (jobs.length || !expenses.length ? 'jobs' : 'expenses'));
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [shown, setShown] = React.useState(PAGE);
  const list = tab === 'jobs' ? jobs : expenses;
  // The tab a row came from, only when this kind comes from more than one tab.
  const manyTabs = multiSheet && new Set(list.map(row => row.sheet)).size > 1;
  const picked = list.filter(isIncluded).length;
  // Rows left out by themselves (already in the app, a total row) stay out when everything is ticked; a tick on the row
  // itself still brings one in.
  const choosable = list.filter(row => row.state !== 'skip');
  const allPicked = choosable.length > 0 && choosable.every(isIncluded);
  const setAll = (value: boolean) => setIncluded(all => ({ ...all, ...Object.fromEntries((value ? choosable : list).map(row => [row.key, value])) }));
  const toggle = (row: ImportRow) => setIncluded(all => ({ ...all, [row.key]: !isIncluded(row) }));

  return (
    <div className="ic-rows" data-testid="import-rows">
      <div className="ic-tabs" role="tablist" aria-label={tr("ประเภทรายการ")}>
        <button type="button" role="tab" aria-selected={tab === 'jobs'} onClick={() => { setTab('jobs'); setShown(PAGE); }} data-testid="import-tab-jobs">{tr("งาน ({0})", jobs.length)}</button>
        <button type="button" role="tab" aria-selected={tab === 'expenses'} onClick={() => { setTab('expenses'); setShown(PAGE); }} data-testid="import-tab-expenses">{tr("รายจ่าย ({0})", expenses.length)}</button>
      </div>
      <div className="ic-rows-head">
        <p>{tab === 'jobs' ? tr("รายการงานที่ตรวจพบ") : tr("รายการรายจ่ายที่ตรวจพบ")}<span>{tr("เลือก {0} จาก {1}", picked, list.length)}</span></p>
        {choosable.length > 0 && <button type="button" className="ic-link" onClick={() => setAll(!allPicked)}>{allPicked ? tr("ยกเลิกทั้งหมด") : tr("เลือกทั้งหมด")}</button>}
      </div>
      {!list.length && <p className="ic-rows-empty">{tab === 'jobs' ? tr("ไฟล์นี้ไม่มีงาน") : tr("ไฟล์นี้ไม่มีรายจ่าย")}</p>}
      <ul className="ic-rowlist">
        {list.slice(0, shown).map(row => {
          const on = isIncluded(row);
          const issue = primaryIssue(row);
          const chip = row.job ? jobChip(row, today) : null;
          const name = row.job?.name || row.expense?.name || '—';
          const amount = row.job ? row.job.value : row.expense!.amount;
          const date = row.job ? day(row.job.postDate || row.job.payDate, locale) : day(row.expense!.date, locale);
          const sub = row.job ? row.job.client : categoryText(row.expense!.category);
          return (
            <li key={row.key} className={`ic-rowcard ${on ? 'is-on' : ''}`} data-testid="import-row" data-included={on ? 'true' : 'false'}>
              <div className="ic-rowcard-main">
                <button type="button" className="ic-tickbox" role="checkbox" aria-checked={on} onClick={() => toggle(row)}
                  aria-label={on ? tr("ไม่นำเข้า {0}", name) : tr("นำเข้า {0}", name)}>{on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</button>
                <div className="ic-rowcard-text">
                  <p className="ic-rowcard-name">{name}</p>
                  {sub && <p className="ic-rowcard-sub">{sub}</p>}
                  <p className="ic-rowcard-tags">
                    {row.update && <span className="ic-tag2 is-info">{tr("อัปเดตรายการเดิม")}</span>}
                    {chip && <span className={`ic-tag2 is-${chip.tone}`}>{chip.label}</span>}
                    {row.expense && row.use && <span className="ic-tag2">{row.use === 'personal' ? tr("ส่วนตัว") : tr("ธุรกิจ")}</span>}
                    {date && <span className="ic-rowcard-date">{date}</span>}
                    {manyTabs && <span className="ic-rowcard-date">{tr("แท็บ {0}", row.sheet)}</span>}
                  </p>
                  {issue && <p className="ic-rowcard-issue">{tr(ISSUE_LABELS[issue])}</p>}
                </div>
                <div className="ic-rowcard-side">
                  <b className="ic-amount">{formatCurrency(amount)}</b>
                  <button type="button" className="ic-more" aria-label={tr("ดูรายละเอียด")} aria-expanded={!!open[row.key]} onClick={() => setOpen(all => ({ ...all, [row.key]: !all[row.key] }))}>
                    <span className="ic-more-label">{tr("ดูรายละเอียด")}</span><ChevronDown className={`h-4 w-4 transition-transform ${open[row.key] ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {open[row.key] && <div className="ic-rowcard-detail"><RowDetail row={row} /></div>}
            </li>
          );
        })}
      </ul>
      {list.length > shown && (
        <button type="button" className="ic-button ic-rows-more" onClick={() => setShown(value => value + PAGE)}>{tr("ดูเพิ่มอีก {0} รายการ", Math.min(PAGE, list.length - shown))}</button>
      )}
    </div>
  );
}
