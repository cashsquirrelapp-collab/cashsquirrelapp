import React from 'react';
import { ChevronDown } from 'lucide-react';
import { uiSecondaryButton } from '../../components/ui/uiStyles';
import { formatCurrency } from '../../utils';
import { tr, T } from '../../i18n/tr';
import { categoryText } from '../incomeExpense/ExpenseDrawer';
import type { ImportRow, IssueCode } from './sheetImport';
import { FIELD_LABELS, ISSUE_LABELS, PAGE, QUIET_ISSUES, REASON_LABELS, UPDATE_LABELS, shown, type RowEdit } from './importShared';
import { primaryIssue } from './importChatModel';

// Every row of the import, as the chat's "ดูทุกแถวก่อน" opens it (moved from the 4-step ImportWizard, 2026-10-31):
// tick or untick a row, fix its name, amount or date, open where it came from. Computers and iPads see a table; phones
// a list of rows, each opening to its fields.

export type ReviewFilter = 'all' | 'confirm' | 'check' | 'update' | 'skip' | `issue:${IssueCode}`;
interface Props {
  rows: ImportRow[];
  isIncluded: (row: ImportRow) => boolean;
  included: Record<string, boolean>;
  setIncluded: (change: (all: Record<string, boolean>) => Record<string, boolean>) => void;
  edits: Record<string, RowEdit>;
  setEdits: (change: (all: Record<string, RowEdit>) => Record<string, RowEdit>) => void;
  multiSheet: boolean;
  filter: ReviewFilter;
  setFilter: (filter: ReviewFilter) => void;
  phone: boolean;
}

const chip = 'rounded-md px-1.5 py-0.5 text-[11px]';
const amber = 'bg-[#FAEEDA] text-[#8A5A0B]';
const green = 'bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]';

/** Where a row came from and what it becomes: the file's cells, the fields they went to, and why. */
function RowDetail({ row }: { row: ImportRow }) {
  const job = row.job, expense = row.expense;
  const saved: [string, string][] = job ? [
    [T("ชื่อ"), job.name], [T("ลูกค้า"), job.client || '—'], [T("ประเภทงาน"), tr(job.type)], [T("มูลค่างาน"), formatCurrency(job.value)],
    [T("หัก ณ ที่จ่าย"), job.whtRate ? `${job.whtRate}% · ${formatCurrency(job.whtAmount || 0)}` : '—'], [T("ยอดที่รับแล้ว"), formatCurrency(job.received)],
    [T("ยอดค้างรับ"), formatCurrency(job.pending)], [T("วันส่งงาน"), job.postDate || '—'], [job.paymentStatus === 'paid' ? T("วันที่รับเงิน") : T("วันครบกำหนดรับเงิน"), job.payDate || '—'],
    ...(job.depositAmount ? [[T("มัดจำ"), `${formatCurrency(job.depositAmount)} · ${job.depositDate || '—'}`] as [string, string]] : []),
    ...(job.installments?.length ? [[T("งวด"), job.installments.map(i => `${formatCurrency(i.amount)} ${i.status === 'paid' ? tr("รับแล้ว {0}", i.paidAt || '') : tr("ครบกำหนด {0}", i.dueDate || '—')}`).join(' · ')] as [string, string]] : []),
    [T("หมายเหตุ"), job.note || '—'],
  ] : expense ? [
    [T("ชื่อ"), expense.name], [T("หมวดหมู่"), categoryText(expense.category)], [T("ยอดเงิน"), formatCurrency(expense.amount)], [T("วันที่"), expense.date || '—'],
    ...(row.use ? [[T("ธุรกิจ / ส่วนตัว"), row.use === 'personal' ? tr("ส่วนตัว") : tr("ธุรกิจ")] as [string, string]] : []),
    [T("หมายเหตุ"), expense.note || '—'],
  ] : [];
  return (
    <div className="grid gap-4 bg-brand-faint/40 px-4 py-4 lg:grid-cols-2" data-testid="import-row-detail">
      <div>
        <p className="mb-2 text-[12px] font-medium text-brand-muted">{tr("ในไฟล์ · แท็บ {0} แถว {1}", row.sheet, row.rowNumber)}{row.source?.ref ? ` · ${row.source.ref}` : ''}</p>
        {row.source?.cells.length ? (
          <table className="w-full table-fixed text-left text-[12px]">
            <tbody>
              {row.source.cells.map((cell, i) => (
                <tr key={i} className="border-t border-brand-border first:border-t-0">
                  <td className="w-[28%] truncate py-1.5 pr-2 text-brand-muted" title={cell.header}>{cell.header}</td>
                  <td className="truncate py-1.5 pr-2 text-brand-text" title={cell.text}>{cell.text}</td>
                  <td className="w-[34%] py-1.5 text-brand-muted">{tr(FIELD_LABELS[cell.target])}{cell.target !== 'keep' && cell.target !== 'ignore' && <span className="block text-[11px]">{tr(REASON_LABELS[cell.reason])}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-[12px] text-brand-muted">—</p>}
      </div>
      <div>
        <p className="mb-2 text-[12px] font-medium text-brand-muted">{row.update ? tr("เปลี่ยนรายการที่มีอยู่ในแอป") : tr("จะบันทึกเป็น")}</p>
        {row.update ? (
          <table className="w-full table-fixed text-left text-[12px]">
            <thead className="text-brand-muted"><tr><th className="w-[34%] pb-1 font-medium" /><th className="pb-1 font-medium">{tr("ตอนนี้ในแอป")}</th><th className="pb-1 font-medium">{tr("ตามไฟล์")}</th></tr></thead>
            <tbody>
              {Object.keys(row.update.after).map(field => (
                <tr key={field} className="border-t border-brand-border">
                  <td className="py-1.5 pr-2 text-brand-muted">{tr(UPDATE_LABELS[field] || field)}</td>
                  <td className="py-1.5 pr-2 text-brand-muted line-through decoration-brand-border">{shown(field, row.update!.before[field])}</td>
                  <td className="py-1.5 font-medium text-brand-text">{shown(field, row.update!.after[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <dl className="grid grid-cols-[34%_1fr] gap-x-2 gap-y-1 text-[12px]">
            {saved.map(([label, value]) => (<React.Fragment key={label}><dt className="text-brand-muted">{tr(label)}</dt><dd className="break-words text-brand-text">{value}</dd></React.Fragment>))}
          </dl>
        )}
        {row.mergedFrom?.length ? <p className="mt-2 text-[12px] text-brand-muted">{tr("รวมข้อมูลจาก {0} จึงนับครั้งเดียว", row.mergedFrom.join(', '))}</p> : null}
        {row.mergedInto ? <p className="mt-2 text-[12px] text-brand-muted">{tr("แถวนี้รวมอยู่ใน {0} แล้ว จึงไม่นับซ้ำ", row.mergedInto)}</p> : null}
      </div>
    </div>
  );
}

function Chips({ row, on }: { row: ImportRow; on: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.state === 'confirm' && <span className={`${chip} font-medium ${on ? green : amber}`}>{on ? tr("ยืนยันแล้ว") : tr("รอยืนยัน")}</span>}
      {row.issues.map(issue => <span key={issue} className={`${chip} ${QUIET_ISSUES.includes(issue) ? 'bg-brand-faint text-brand-muted' : amber}`}>{issue === 'merged' && row.mergedInto ? tr("รวมเข้ากับ {0}", row.mergedInto) : tr(ISSUE_LABELS[issue])}</span>)}
      {row.mergedCount ? <span className={`${chip} ${green}`}>{tr("รวมข้อมูลจากแท็บอื่น {0} แถว", row.mergedCount)}</span> : null}
      {!row.issues.length && !row.mergedCount && <span className="text-[11px] text-[#12804F] dark:text-[#6FD3A3]">{tr("พร้อม")}</span>}
    </div>
  );
}

const paid = (row: ImportRow) => (row.job ? (row.job.paymentStatus === 'paid' ? <span className="text-[#12804F] dark:text-[#6FD3A3]">{tr("รับครบแล้ว")}</span>
  : row.job.paymentStatus === 'partial' ? tr("รับบางส่วน") : <span className="text-[#C24A16] dark:text-[#FF9A6B]">{tr("ยังไม่จ่าย")}</span>) : null);

export function ImportReview({ rows, isIncluded, included, setIncluded, edits, setEdits, multiSheet, filter, setFilter, phone }: Props) {
  const [shownRows, setShownRows] = React.useState(PAGE);
  const [openRow, setOpenRow] = React.useState<string | null>(null);
  React.useEffect(() => { setShownRows(PAGE); }, [filter]);
  const isUpdate = (row: ImportRow) => Boolean(row.update);
  const check = rows.filter(row => isIncluded(row) && !row.update && row.issues.length > 0).length;
  const skip = rows.filter(row => !isIncluded(row)).length;
  const visibleRows = rows.filter(row => filter === 'all' ? true : filter === 'skip' ? !isIncluded(row) : filter === 'confirm' ? row.state === 'confirm'
    : filter === 'update' ? isUpdate(row) : filter === 'check' ? isIncluded(row) && !row.update && row.issues.length > 0 : primaryIssue(row) === filter.slice(6));
  const tabs = ([['all', T("ทั้งหมด"), rows.length], ['confirm', T("รอยืนยัน"), rows.filter(row => row.state === 'confirm').length], ['check', T("ควรตรวจ"), check],
    ['update', T("อัปเดต"), rows.filter(isUpdate).length], ['skip', T("ไม่นำเข้า"), skip]] as const).filter(([key, , count]) => key === 'all' || key === 'check' || key === 'skip' || count > 0);
  const input = 'h-8 w-full rounded-lg border border-transparent bg-transparent px-2 text-[13px] text-brand-text hover:border-brand-border focus:border-[#E65F2B] focus:bg-brand-white focus:outline-none dark:focus:bg-neutral-950';
  const field = 'h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-[16px] text-brand-text focus:border-[#E65F2B] focus:outline-none dark:bg-neutral-950';

  return (
    <div data-testid="import-review">
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label={tr("แสดงแถว")}>
        {filter.startsWith('issue:') && (
          <button type="button" role="tab" aria-selected className="h-8 cursor-pointer rounded-full border border-[#F3B08C] bg-[#FFF1E8] px-3 text-[12px] font-medium text-[#C24A16] dark:bg-[#E65F2B]/10 dark:text-[#FF9A6B]">
            {tr(ISSUE_LABELS[filter.slice(6) as IssueCode])} {visibleRows.length}
          </button>
        )}
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
            className={`h-8 cursor-pointer rounded-full border px-3 text-[12px] ${filter === key ? 'border-[#F3B08C] bg-[#FFF1E8] font-medium text-[#C24A16] dark:bg-[#E65F2B]/10 dark:text-[#FF9A6B]' : 'border-brand-border text-brand-text'}`}>{tr(label)} {count}</button>
        ))}
      </div>

      {phone ? (
        <ul className="divide-y divide-brand-border overflow-hidden rounded-xl border border-brand-border">
          {visibleRows.slice(0, shownRows).map(row => {
            const on = isIncluded(row);
            const edit = edits[row.key] || {};
            const setEdit = (patch: RowEdit) => setEdits(all => ({ ...all, [row.key]: { ...all[row.key], ...patch } }));
            const name = row.job?.name ?? row.expense?.name ?? '';
            const amount = row.job?.value ?? row.expense?.amount ?? 0;
            const date = row.job ? row.job.postDate || row.job.payDate || '' : row.expense?.date || '';
            const editable = row.kind !== 'skip' && !row.update;
            const expanded = openRow === row.key;
            return (
              <li key={row.key} className={on ? '' : 'bg-brand-faint/40'}>
                <div className="flex items-start gap-3 px-3 py-3">
                  <input type="checkbox" checked={on} disabled={row.kind === 'skip'} className="mt-1 h-5 w-5 shrink-0 accent-[#E65F2B]"
                    aria-label={row.state === 'confirm' ? tr("ยืนยันและนำเข้าแถว {0}", row.rowNumber) : tr("นำเข้าแถว {0}", row.rowNumber)}
                    onChange={e => setIncluded(all => ({ ...all, [row.key]: e.target.checked }))} />
                  <button type="button" onClick={() => setOpenRow(expanded ? null : row.key)} aria-expanded={expanded} className="min-w-0 flex-1 cursor-pointer text-left">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`min-w-0 truncate text-[15px] ${on ? 'text-brand-text' : 'text-brand-muted'}`}>{edit.name ?? name ?? '—'}</span>
                      {row.kind !== 'skip' && <span className="shrink-0 text-[15px] font-medium tabular-nums text-brand-text">{formatCurrency(amount)}</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-brand-muted">
                      <span>{multiSheet ? `${row.sheet} · ` : ''}{tr("แถว {0}", row.rowNumber)}</span>
                      {row.expense && <span className="text-[#C43A3A] dark:text-[#F19A9A]">{tr("รายจ่าย")}</span>}
                      {date && <span className="tabular-nums">{edit.date ?? date}</span>}
                      {paid(row)}
                    </span>
                    <span className="mt-1.5 block"><Chips row={row} on={on} /></span>
                  </button>
                </div>
                {expanded && (
                  <div className="space-y-3 border-t border-brand-border px-3 py-3">
                    {editable && (<>
                      <label className="block text-[13px] text-brand-muted">{tr("ชื่อ")}<input className={`${field} mt-1`} value={edit.name ?? name} onChange={e => setEdit({ name: e.target.value })} /></label>
                      <label className="block text-[13px] text-brand-muted">{tr("ยอดเงิน")}<input className={`${field} mt-1 tabular-nums`} inputMode="decimal" value={edit.amount ?? amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} onChange={e => setEdit({ amount: e.target.value })} /></label>
                      <label className="block text-[13px] text-brand-muted">{tr("วันที่")}<input className={`${field} mt-1`} type="date" value={edit.date ?? date} onChange={e => setEdit({ date: e.target.value })} /></label>
                    </>)}
                    {(row.job || row.expense) && <RowDetail row={row} />}
                  </div>
                )}
              </li>
            );
          })}
          {!visibleRows.length && <li className="px-4 py-8 text-center text-[13px] text-brand-muted">{tr("ไม่มีแถวในหมวดนี้")}</li>}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-border">
          {/* Fixed column widths so the name keeps its room; narrow windows scroll the table sideways. */}
          <table className="w-full min-w-[960px] table-fixed text-left text-[13px]">
            <colgroup>
              <col style={{ width: 40 }} /><col style={{ width: 88 }} /><col style={{ width: 60 }} /><col />
              <col style={{ width: 132 }} /><col style={{ width: 104 }} /><col style={{ width: 144 }} /><col style={{ width: 88 }} /><col style={{ width: 150 }} /><col style={{ width: 40 }} />
            </colgroup>
            <thead className="bg-brand-faint/70 text-[12px] text-brand-muted">
              <tr>
                <th className="px-3 py-2.5"><span className="sr-only">{tr("นำเข้า")}</span></th>
                <th className="px-2 py-2.5 font-medium">{tr("แถว")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("ประเภท")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("ชื่อ")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("ลูกค้า / หมวด")}</th>
                <th className="px-2 py-2.5 text-right font-medium">{tr("ยอดเงิน")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("วันที่")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("รับเงิน")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("ข้อสังเกต")}</th>
                <th className="px-2 py-2.5"><span className="sr-only">{tr("ที่มา")}</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.slice(0, shownRows).map(row => {
                const on = isIncluded(row);
                const edit = edits[row.key] || {};
                const setEdit = (patch: RowEdit) => setEdits(all => ({ ...all, [row.key]: { ...all[row.key], ...patch } }));
                const name = row.job?.name ?? row.expense?.name ?? '';
                const amount = row.job?.value ?? row.expense?.amount ?? 0;
                const date = row.job ? row.job.postDate || row.job.payDate || '' : row.expense?.date || '';
                const editable = row.kind !== 'skip' && !row.update;
                const expanded = openRow === row.key;
                return (
                  <React.Fragment key={row.key}>
                    <tr className={`border-t border-brand-border ${on ? '' : 'opacity-55'} ${row.state === 'confirm' && !on ? 'bg-[#FFFBF3] dark:bg-[#F2A93B]/5' : ''}`}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={on} disabled={row.kind === 'skip'} aria-label={row.state === 'confirm' ? tr("ยืนยันและนำเข้าแถว {0}", row.rowNumber) : tr("นำเข้าแถว {0}", row.rowNumber)} className="accent-[#E65F2B]"
                        onChange={e => setIncluded(all => ({ ...all, [row.key]: e.target.checked }))} /></td>
                      <td className="truncate px-2 py-1.5 text-[12px] text-brand-muted" title={`${row.sheet} · ${row.rowNumber}`}>{multiSheet ? `${row.sheet} · ` : ''}{row.rowNumber}</td>
                      <td className="px-2 py-1.5 text-[12px]">{row.job ? tr("งาน") : row.expense ? <span className="text-[#C43A3A] dark:text-[#F19A9A]">{tr("รายจ่าย")}</span> : '—'}</td>
                      <td className="px-1 py-1.5">{editable ? <input aria-label={tr("ชื่อแถว {0}", row.rowNumber)} className={input} value={edit.name ?? name} onChange={e => setEdit({ name: e.target.value })} /> : <span className="block truncate px-2 text-brand-muted" title={name}>{name || '—'}</span>}</td>
                      <td className="truncate px-2 py-1.5 text-brand-muted">{row.job ? row.job.client || '—' : row.expense ? `${categoryText(row.expense.category)}${row.use === 'personal' ? ` · ${tr("ส่วนตัว")}` : ''}` : ''}</td>
                      <td className="px-1 py-1.5">{editable ? <input aria-label={tr("ยอดเงินแถว {0}", row.rowNumber)} inputMode="decimal" className={`${input} text-right tabular-nums`} value={edit.amount ?? amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} onChange={e => setEdit({ amount: e.target.value })} /> : row.kind === 'skip' ? null : <span className="block px-2 text-right tabular-nums text-brand-muted">{amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}</td>
                      <td className="px-1 py-1.5">{editable ? <input aria-label={tr("วันที่แถว {0}", row.rowNumber)} type="date" className={input} value={edit.date ?? date} onChange={e => setEdit({ date: e.target.value })} /> : row.kind === 'skip' ? null : <span className="block px-2 text-brand-muted">{date || '—'}</span>}</td>
                      <td className="px-2 py-1.5 text-[12px]">{paid(row)}</td>
                      <td className="px-2 py-1.5"><Chips row={row} on={on} /></td>
                      <td className="px-1 py-1.5">{(row.job || row.expense) && (
                        <button type="button" onClick={() => setOpenRow(expanded ? null : row.key)} aria-expanded={expanded} aria-label={tr("ดูที่มาของแถว {0}", row.rowNumber)}
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-muted hover:bg-brand-faint hover:text-brand-text"><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
                      )}</td>
                    </tr>
                    {expanded && <tr className="border-t border-brand-border"><td colSpan={10} className="p-0"><RowDetail row={row} /></td></tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {!visibleRows.length && <p className="px-4 py-8 text-center text-[13px] text-brand-muted">{tr("ไม่มีแถวในหมวดนี้")}</p>}
        </div>
      )}
      {visibleRows.length > shownRows && <button type="button" onClick={() => setShownRows(n => n + PAGE)} className={`${uiSecondaryButton} mt-3 px-4 text-[13px]`}>{tr("แสดงเพิ่มอีก {0} แถว", Math.min(PAGE, visibleRows.length - shownRows))}</button>}
    </div>
  );
}
