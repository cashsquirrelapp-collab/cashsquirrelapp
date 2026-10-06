import React from 'react';
import { CheckCircle2, Download, FileText, Paperclip, Search } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { jobWhtAmount } from '../../../../shared/wht';
import { formatCurrency } from '../../utils';
import { RowMenu } from '../../components/ui/RowMenu';
import { uiSurface } from '../../components/ui/uiStyles';
import { useVault } from './VaultProvider';
import { paidYearOf, wht50Files, wht50StatusOf } from './vaultStatus';
import { downloadVaultZip } from './zip';

// ผู้ช่วยจัดการภาษี › 50 ทวิ: every job this year whose client withheld tax, whether its 50 ทวิ is
// on file, and one click to download them all for filing.

type Filter = 'all' | 'have' | 'waiting';

export function Wht50Panel({ jobs, triggerAlert }: { jobs: Job[]; triggerAlert: (title: string, message: string) => void }) {
  const vault = useVault();
  const currentYear = new Date().getFullYear();
  const withTax = React.useMemo(() => jobs.filter(job => jobWhtAmount(job) > 0 && (job.received || 0) > 0), [jobs]);
  const years = React.useMemo(() => [...new Set([currentYear, ...withTax.map(paidYearOf).filter((y): y is number => y !== null)])].sort((a, b) => b - a), [withTax, currentYear]);
  const [year, setYear] = React.useState(currentYear);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<'waiting' | 'latest'>('waiting');
  const [zipping, setZipping] = React.useState(false);

  const rows = withTax
    .filter(job => paidYearOf(job) === year)
    .map(job => ({ job, files: wht50Files(job, vault.files), status: wht50StatusOf(job, vault.files) as 'have' | 'waiting' }));
  const have = rows.filter(r => r.status === 'have');
  const waiting = rows.filter(r => r.status === 'waiting');
  const withheld = rows.reduce((sum, r) => sum + jobWhtAmount(r.job), 0);
  const share = rows.length ? Math.round((have.length / rows.length) * 100) : 0;
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter(r => filter === 'all' || r.status === filter)
    .filter(r => !q || [r.job.name, r.job.client].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => sort === 'waiting'
      ? Number(b.status === 'waiting') - Number(a.status === 'waiting') || (a.job.payDate || '').localeCompare(b.job.payDate || '')
      : (b.job.payDate || '').localeCompare(a.job.payDate || ''));

  const downloadAll = async () => {
    const files = have.flatMap(r => r.files);
    if (!files.length) return;
    setZipping(true);
    try { await downloadVaultZip(files, `ใบ50ทวิ-${year + 543}.zip`); }
    catch (err) { triggerAlert('ดาวน์โหลดไม่สำเร็จ', (err as Error).message); }
    finally { setZipping(false); }
  };

  const chip = (on: boolean) => `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors cursor-pointer ${on ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`;
  const statusChip = (r: (typeof rows)[number]) => r.status === 'have'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F7F0] px-2.5 py-1 text-xs font-medium text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]"><CheckCircle2 className="h-3.5 w-3.5" />มี 50 ทวิ ({r.files.length} ไฟล์)</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-[#FDEEEE] px-2.5 py-1 text-xs font-medium text-[#C43A3A] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]"><span className="h-1.5 w-1.5 rounded-full bg-current" />รอใบ 50 ทวิ</span>;
  const fileCell = (r: (typeof rows)[number]) => r.status === 'have'
    ? <button type="button" onClick={() => vault.openJob(r.job)} className="inline-flex min-w-0 items-center gap-1.5 text-xs text-brand-muted hover:text-brand-text cursor-pointer"><FileText className="h-3.5 w-3.5 shrink-0 text-[#E5484D]" /><span className="truncate">{r.files[0].fileName}</span></button>
    : <button type="button" onClick={() => vault.openUpload({ kind: 'wht50', job: r.job })} className="inline-flex items-center gap-1 rounded-lg border border-[#F3B08C] px-2.5 py-1.5 text-xs font-medium text-[#C24A16] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10"><Paperclip className="h-3.5 w-3.5" />แนบเอกสาร</button>;
  const menu = (r: (typeof rows)[number]) => (
    <RowMenu label={`ตัวเลือกของ ${r.job.name}`} items={[
      ...(r.files.length ? [{ label: 'ดูไฟล์', run: () => vault.openJob(r.job) }] : []),
      { label: 'แนบเอกสาร', run: () => vault.openUpload({ kind: 'wht50', job: r.job }) },
    ]} />
  );

  if (!vault.available) {
    return <p className={`${uiSurface} p-6 text-[13px] text-brand-muted`}>คลังใบ 50 ทวิ ใช้ได้กับบัญชีจริง ออกจากโหมดทดลองแล้วเข้าสู่ระบบเพื่อใช้งาน</p>;
  }

  return (
    <div className="space-y-5">
      <section className={`${uiSurface} space-y-5 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-brand-text">หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)</h2>
          <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="ปีภาษี" className="h-9 rounded-xl border border-brand-border bg-brand-white px-3 text-[13px] text-brand-text outline-none cursor-pointer">
            {years.map(y => <option key={y} value={y}>ปีภาษี {y + 543}</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'ภาษีถูกหักแล้ว', value: formatCurrency(withheld), tone: 'text-brand-text' },
            { label: 'มีเอกสารแล้ว', value: `${have.length} ใบ`, tone: 'text-[#12804F] dark:text-[#6FD3A3]' },
            { label: 'รอเอกสาร', value: `${waiting.length} ใบ`, tone: waiting.length ? 'text-[#C43A3A] dark:text-[#F19A9A]' : 'text-brand-text' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl bg-brand-faint/70 px-4 py-3">
              <p className="text-xs text-brand-muted">{stat.label}</p>
              <p className={`mt-0.5 font-mono text-[20px] font-semibold ${stat.tone}`}>{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[200px] flex-1">
            <p className="mb-1.5 text-xs text-brand-muted">เอกสารพร้อม {have.length} จาก {rows.length} รายการ</p>
            <div className="h-2 overflow-hidden rounded-full bg-brand-faint"><div className="h-full rounded-full bg-[#18A66A] transition-[width] duration-500" style={{ width: `${share}%` }} /></div>
          </div>
          <span className="font-mono text-[13px] text-brand-muted">{share}%</span>
          <button type="button" onClick={() => void downloadAll()} disabled={!have.length || zipping}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            <Download className="h-4 w-4" />{zipping ? 'กำลังรวมไฟล์…' : 'ดาวน์โหลดทั้งหมด (ZIP)'}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="สถานะเอกสาร">
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={chip(filter === 'all')}>ทั้งหมด <span className="text-xs opacity-70">{rows.length}</span></button>
          <button type="button" role="tab" aria-selected={filter === 'have'} onClick={() => setFilter('have')} className={chip(filter === 'have')}>มีเอกสารแล้ว <span className="text-xs opacity-70">{have.length}</span></button>
          <button type="button" role="tab" aria-selected={filter === 'waiting'} onClick={() => setFilter('waiting')} className={chip(filter === 'waiting')}>รอเอกสาร <span className="text-xs opacity-70">{waiting.length}</span></button>
        </div>
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาลูกค้า / ชื่องาน..." aria-label="ค้นหางาน"
              className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B]" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as 'waiting' | 'latest')} aria-label="เรียงตาม" className="h-10 rounded-xl border border-brand-border bg-brand-white px-3 text-[13px] text-brand-text outline-none cursor-pointer">
            <option value="waiting">เรียงตาม: รอนานที่สุด</option>
            <option value="latest">เรียงตาม: ล่าสุด</option>
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-border px-6 py-12 text-center text-[13px] text-brand-muted">
          {rows.length ? 'ไม่พบงานที่ตรงกับตัวกรอง' : `ยังไม่มีงานที่ถูกหัก ณ ที่จ่ายในปี ${year + 543}`}
        </p>
      ) : (
        <>
          {/* Wide screens: a table */}
          <div className={`${uiSurface} hidden overflow-hidden md:block`}>
            <table className="w-full text-[13px]">
              <thead className="border-b border-brand-border text-left text-xs text-brand-muted">
                <tr><th className="px-5 py-3 font-medium">งาน / ลูกค้า</th><th className="px-3 py-3 text-right font-medium">ยอดงาน</th><th className="px-3 py-3 text-right font-medium">ภาษีหัก ณ ที่จ่าย</th><th className="px-3 py-3 font-medium">สถานะเอกสาร</th><th className="px-3 py-3 font-medium">ไฟล์</th><th className="w-12" /></tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {shown.map(r => (
                  <tr key={r.job.id} className="transition-colors hover:bg-brand-faint/50">
                    <td className="px-5 py-3.5"><button type="button" onClick={() => vault.openJob(r.job)} className="text-left cursor-pointer"><span className="block font-medium text-brand-text">{r.job.name}</span><span className="block text-xs text-brand-muted">{r.job.client || '—'}</span></button></td>
                    <td className="px-3 py-3.5 text-right font-mono text-brand-text">{formatCurrency(r.job.value || 0)}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-brand-text">{r.job.whtRate || 0}% <span className="text-brand-muted">({formatCurrency(jobWhtAmount(r.job))})</span></td>
                    <td className="px-3 py-3.5">{statusChip(r)}</td>
                    <td className="max-w-[220px] px-3 py-3.5">{fileCell(r)}</td>
                    <td className="px-2 py-3.5">{menu(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: a list */}
          <ul className={`${uiSurface} divide-y divide-brand-border md:hidden`}>
            {shown.map(r => (
              <li key={r.job.id} className="flex items-start gap-2 px-4 py-3.5">
                <button type="button" onClick={() => (r.files.length ? vault.openJob(r.job) : vault.openUpload({ kind: 'wht50', job: r.job }))} className="min-w-0 flex-1 text-left cursor-pointer">
                  <span className="block truncate text-[14px] font-medium text-brand-text">{r.job.name}</span>
                  <span className="block truncate text-xs text-brand-muted">{r.job.client || '—'} · หัก {r.job.whtRate || 0}% {formatCurrency(jobWhtAmount(r.job))}</span>
                  <span className="mt-1.5 block">{statusChip(r)}</span>
                </button>
                {menu(r)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
