import React from 'react';
import { Download, ExternalLink, FileCheck2, FolderOpen, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { Expense, Job } from '../../../../shared/types';
import { VAULT_KIND_LABEL, formatFileSize, type VaultFile, type VaultKind } from '../../../../shared/vault';
import { safeFormatThaiDate } from '../../utils';
import { Drawer } from '../../components/ui/Drawer';
import PageHeader from '../../components/ui/PageHeader';
import { RowMenu } from '../../components/ui/RowMenu';
import { vaultFileUrl } from '../../services/vault';
import { FileThumb, useVault } from './VaultProvider';
import { downloadVaultZip } from './zip';

// เอกสาร › คลังเอกสาร: every kept file (50 ทวิ, contracts / POs, expense slips, others), searchable
// and filtered by type and year, each linked to the job (or, for slips, the expense) it belongs to.

type Filter = 'all' | VaultKind;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'ทุกไฟล์' },
  { key: 'wht50', label: '50 ทวิ' },
  { key: 'contract', label: 'สัญญา / PO' },
  { key: 'expense', label: 'สลิปรายจ่าย' },
  { key: 'other', label: 'อื่น ๆ' },
];
const thaiYear = (iso: string) => Number(iso.slice(0, 4)) + 543;

export function VaultTab({ jobs, expenses, onOpenWht50 }: {
  jobs: Job[];
  expenses: Expense[];
  onOpenWht50: () => void;
}) {
  const vault = useVault();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');
  const [year, setYear] = React.useState<number | 'all'>('all');
  const [openId, setOpenId] = React.useState<string | null>(null);

  const years = React.useMemo(() => [...new Set([new Date().getFullYear() + 543, ...vault.files.map(f => thaiYear(f.createdAt))])].sort((a, b) => b - a), [vault.files]);
  const q = query.trim().toLowerCase();
  const shown = vault.files.filter(file =>
    (filter === 'all' || file.kind === filter) &&
    (year === 'all' || thaiYear(file.createdAt) === year) &&
    (!q || [file.fileName, file.jobName, file.client].some(v => v?.toLowerCase().includes(q))));
  const count = (key: Filter) => (key === 'all' ? vault.files.length : vault.files.filter(f => f.kind === key).length);
  const opened = vault.files.find(f => f.id === openId) || null;
  const [zipping, setZipping] = React.useState(false);
  // Drop files anywhere on the page: the upload dialog opens with them already picked.
  const [pageDragging, setPageDragging] = React.useState(false);
  const pageDepth = React.useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');
  const pageDrop = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); pageDepth.current += 1; setPageDragging(true); },
    onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: () => { pageDepth.current = Math.max(0, pageDepth.current - 1); if (!pageDepth.current) setPageDragging(false); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); pageDepth.current = 0; setPageDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length) vault.openUpload({ kind: filter === 'all' ? 'wht50' : filter, files: dropped });
    },
  };
  // Everything currently listed (type + year + search) as one ZIP, e.g. all of this year's 50 ทวิ.
  const downloadShown = async () => {
    if (!shown.length) return;
    setZipping(true);
    const kindName = filter === 'all' ? 'เอกสาร' : filter === 'wht50' ? 'ใบ50ทวิ' : filter === 'contract' ? 'สัญญา-PO' : filter === 'expense' ? 'สลิปรายจ่าย' : 'อื่นๆ';
    try { await downloadVaultZip(shown, `${kindName}${year === 'all' ? '' : `-${year}`}.zip`, expenses); }
    catch (err) { window.alert((err as Error).message); }
    finally { setZipping(false); }
  };

  if (!vault.available) {
    return (
      <>
      <PageHeader page="vault" />
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <FolderOpen className="mb-3 h-10 w-10 text-brand-border" />
        <p className="text-[15px] font-medium text-brand-text">คลังเอกสารใช้ได้กับบัญชีจริง</p>
        <p className="mt-1 max-w-sm text-[13px] text-brand-muted">เก็บใบ 50 ทวิ สัญญา และ PO ไว้กับงาน ออกจากโหมดทดลองแล้วเข้าสู่ระบบเพื่อใช้งาน</p>
      </div>
      </>
    );
  }

  return (
    <div className="relative space-y-4" {...pageDrop} data-testid="vault-page">
      {pageDragging && (
        <div className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center bg-black/20 p-6 backdrop-blur-[1px]">
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-[#E65F2B] bg-brand-white px-8 py-12 text-center shadow-xl dark:bg-[#1F2024]">
            <Upload className="h-9 w-9 text-[#C24A16] dark:text-[#FF9A6B]" />
            <p className="text-[17px] font-semibold text-brand-text">วางไฟล์เพื่อเพิ่มเข้าคลัง</p>
            <p className="text-[13px] text-brand-muted">PDF, JPG, PNG, WEBP ไม่เกิน 10 MB ต่อไฟล์</p>
          </div>
        </div>
      )}
      <PageHeader page="vault">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onOpenWht50}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer">
            <FileCheck2 className="h-4 w-4" />จัดการใบ 50 ทวิ
          </button>
          <button type="button" onClick={() => void downloadShown()} disabled={!shown.length || zipping}
            title="ดาวน์โหลดทุกไฟล์ที่แสดงอยู่เป็นไฟล์ ZIP เดียว แยกโฟลเดอร์ตามงาน"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text hover:bg-brand-faint disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
            <Download className="h-4 w-4" /><span className="hidden sm:inline">{zipping ? 'กำลังรวมไฟล์…' : `ดาวน์โหลดทั้งหมด (${shown.length})`}</span><span className="sm:hidden">ZIP</span>
          </button>
          <button type="button" onClick={() => vault.openUpload({ kind: filter === 'all' ? 'wht50' : filter })}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white hover:bg-[#D35221] cursor-pointer">
            <Plus className="h-4 w-4" />เพิ่มเอกสาร
          </button>
        </div>
      </PageHeader>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="ประเภทไฟล์">
        {FILTERS.map(f => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors cursor-pointer ${filter === f.key ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}>
            {f.label}<span className="text-xs opacity-70">{count(f.key)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อไฟล์ งาน รายจ่าย หรือลูกค้า..." aria-label="ค้นหาเอกสาร"
            className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B]" />
        </div>
        <select value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="ปี"
          className="h-10 rounded-xl border border-brand-border bg-brand-white px-3 text-[13px] text-brand-text outline-none focus:border-[#E65F2B] sm:w-36 cursor-pointer">
          <option value="all">ทุกปี</option>
          {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
        </select>
      </div>

      {vault.error && <p role="alert" className="rounded-xl bg-[#FDEEEE] px-4 py-3 text-[13px] text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]">{vault.error}</p>}

      {vault.loading && !vault.files.length ? (
        <ul className="space-y-3" aria-busy="true">{[0, 1, 2].map(i => <li key={i} className="flex items-center gap-4 py-2"><span className="h-14 w-11 animate-pulse rounded-lg bg-brand-faint" /><span className="flex-1 space-y-2"><span className="block h-3 w-48 animate-pulse rounded bg-brand-faint" /><span className="block h-2.5 w-32 animate-pulse rounded bg-brand-faint" /></span></li>)}</ul>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-brand-border px-6 py-14 text-center">
          <FolderOpen className="mb-3 h-9 w-9 text-brand-border" />
          <p className="text-[14px] font-medium text-brand-text">{vault.files.length ? 'ไม่พบไฟล์ที่ตรงกับตัวกรอง' : 'ยังไม่มีเอกสารในคลัง'}</p>
          <p className="mt-1 text-[13px] text-brand-muted">{vault.files.length ? 'ลองเปลี่ยนคำค้นหาหรือปี' : 'แนบใบ 50 ทวิ สัญญา PO หรือสลิปรายจ่าย หาเจอได้ทันทีตอนยื่นภาษี'}</p>
          {!vault.files.length && (
            <button type="button" onClick={() => vault.openUpload({ kind: 'wht50' })} className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-border px-4 text-[13px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer"><Plus className="h-4 w-4" />เพิ่มเอกสาร</button>
          )}
        </div>
      ) : (
        <section aria-label="ไฟล์ในคลัง">
          <p className="mb-1 text-xs font-medium text-brand-muted">ล่าสุด</p>
          <ul className="divide-y divide-brand-border">
            {shown.map(file => (
              <li key={file.id} className="flex items-center gap-2">
                <button type="button" onClick={() => setOpenId(file.id)} className="flex min-w-0 flex-1 items-center gap-4 rounded-xl py-3.5 pr-2 text-left transition-colors hover:bg-brand-faint/60 cursor-pointer">
                  <FileThumb file={file} className="h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-brand-border" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-brand-text">{file.fileName}</span>
                    <span className="mt-0.5 block text-xs font-medium text-[#C24A16] dark:text-[#FF9A6B]">{VAULT_KIND_LABEL[file.kind]}</span>
                    {(file.jobName || file.client) && <span className="block truncate text-xs text-brand-muted">{[file.jobName, file.client].filter(Boolean).join(' · ')}</span>}
                  </span>
                  <span className="hidden shrink-0 text-xs text-brand-muted sm:block">{safeFormatThaiDate(file.createdAt.slice(0, 10))}</span>
                </button>
                <RowMenu label={`ตัวเลือกของ ${file.fileName}`} items={[
                  { label: 'เปิดดู', icon: ExternalLink, run: () => window.open(vaultFileUrl(file.id), '_blank', 'noopener') },
                  { label: 'ดาวน์โหลด', icon: Download, run: () => { window.location.href = vaultFileUrl(file.id, true); } },
                  { label: 'แก้ไขข้อมูล', icon: Pencil, run: () => setOpenId(file.id) },
                  { label: 'ลบไฟล์', icon: Trash2, danger: true, run: () => vault.remove(file) },
                ]} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <FileDrawer file={opened} jobs={jobs} expenses={expenses} onClose={() => setOpenId(null)} />
    </div>
  );
}

function FileDrawer({ file, jobs, expenses, onClose }: { file: VaultFile | null; jobs: Job[]; expenses: Expense[]; onClose: () => void }) {
  const vault = useVault();
  const [kind, setKind] = React.useState<VaultKind>('other');
  const [jobId, setJobId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (file) { setKind(file.kind); setJobId(file.jobId || ''); setError(''); } }, [file]);
  const changed = file && (kind !== file.kind || jobId !== (file.jobId || ''));
  // Slips link to an expense, everything else to a job; switching between them clears the link.
  const forExpense = kind === 'expense';
  const pickKind = (next: VaultKind) => { if ((next === 'expense') !== forExpense) setJobId(''); setKind(next); };
  const sameSide = file ? (file.kind === 'expense') === forExpense : false;
  const save = async () => {
    if (!file) return;
    const job = forExpense ? null : jobs.find(j => j.id === jobId);
    const expense = forExpense ? expenses.find(e => e.id === jobId) : null;
    setSaving(true); setError('');
    // A link to a job or expense that no longer exists is kept as it was unless the user picks another one.
    const keepOld = !job && !expense && jobId !== '' && jobId === file.jobId && sameSide;
    const link = keepOld ? { jobId: file.jobId, jobName: file.jobName, client: file.client }
      : job ? { jobId: job.id, jobName: job.name, client: job.client || null }
      : expense ? { jobId: expense.id, jobName: expense.name, client: null }
      : { jobId: null, jobName: null, client: null };
    try { await vault.update(file, { kind, ...link }); }
    catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <Drawer open={Boolean(file)} title={file ? VAULT_KIND_LABEL[file.kind] : ''} onClose={onClose} width={460}
      footer={file ? (
        <div className="flex gap-2">
          <a href={vaultFileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221]"><ExternalLink className="h-4 w-4" />เปิดดู</a>
          <a href={vaultFileUrl(file.id, true)} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-border text-[14px] font-medium text-brand-text hover:bg-brand-faint"><Download className="h-4 w-4" />ดาวน์โหลด</a>
          <button type="button" onClick={() => { vault.remove(file); }} aria-label="ลบไฟล์" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-border text-[#C43A3A] hover:bg-[#FDEEEE] cursor-pointer dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      ) : undefined}>
      {file && (
        <div className="space-y-5">
          <a href={vaultFileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="mx-auto block aspect-[3/4] max-w-[260px] overflow-hidden rounded-xl border border-brand-border shadow-sm hover:opacity-95">
            <FileThumb file={file} className="h-full w-full" large />
          </a>
          <div className="text-center">
            <p className="break-all text-[14px] font-medium text-brand-text">{file.fileName}</p>
            <p className="text-xs text-brand-muted">{formatFileSize(file.sizeBytes)} · เพิ่มเมื่อ {safeFormatThaiDate(file.createdAt.slice(0, 10))}</p>
          </div>
          <div className="space-y-3 border-t border-brand-border pt-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-brand-text">ประเภท</span>
              <select value={kind} onChange={e => pickKind(e.target.value as VaultKind)} className="h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-[14px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#141518]">
                {(Object.keys(VAULT_KIND_LABEL) as VaultKind[]).map(k => <option key={k} value={k}>{VAULT_KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-brand-text">{forExpense ? 'รายจ่าย' : 'งาน'}</span>
              <select value={jobId} onChange={e => setJobId(e.target.value)} className="h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-[14px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#141518]">
                <option value="">{forExpense ? 'ไม่ผูกกับรายจ่าย' : 'ไม่ผูกกับงาน'}</option>
                {sameSide && file.jobId && !(forExpense ? expenses : jobs).some(item => item.id === file.jobId) && <option value={file.jobId}>{file.jobName || (forExpense ? 'รายจ่ายเดิม' : 'งานเดิม')}</option>}
                {forExpense
                  ? [...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(e => <option key={e.id} value={e.id}>{e.name} · {safeFormatThaiDate(e.date, { day: 'numeric', month: 'short', year: '2-digit' })}</option>)
                  : jobs.map(j => <option key={j.id} value={j.id}>{j.name}{j.client ? ` · ${j.client}` : ''}</option>)}
              </select>
            </label>
            {error && <p className="text-xs text-[#C43A3A] dark:text-[#F19A9A]">{error}</p>}
            {changed && (
              <button type="button" onClick={() => void save()} disabled={saving} className="h-10 w-full rounded-xl border border-[#F3B08C] bg-[#FFF5EE] text-[13px] font-semibold text-[#C24A16] hover:bg-[#FFEBDD] disabled:opacity-50 cursor-pointer dark:bg-[#E65F2B]/10 dark:text-[#FF9A6B]">
                {saving ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}
              </button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
