import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, CheckCircle2, Download, ExternalLink, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { VAULT_ACCEPT, VAULT_KIND_LABEL, VAULT_MAX_BYTES, formatFileSize, type VaultFile, type VaultKind } from '../../../../shared/vault';
import { jobWhtAmount, jobNetReceivable } from '../../../../shared/wht';
import { formatCurrency, safeFormatThaiDate } from '../../utils';
import { Drawer } from '../../components/ui/Drawer';
import { Modal } from '../../components/ui/Modal';
import { RowMenu } from '../../components/ui/RowMenu';
import { deleteVault, listVault, updateVault, uploadVault, vaultFileUrl, type VaultMeta } from '../../services/vault';
import { wht50Files } from './vaultStatus';

// The document vault for the finance workspace that is open: one list of files shared by the
// Documents, Jobs and Tax pages, plus the dialogs those pages open (upload, the 50 ทวิ prompt
// after a payment, and a job's files).

interface UploadRequest { kind: VaultKind; job?: Job | null; /** Files dropped on a page before the dialog opened. */ files?: File[] }

interface VaultApi {
  /** Signed-in account (not guest): the vault works here. */
  available: boolean;
  isPro: boolean;
  files: VaultFile[];
  loading: boolean;
  error: string;
  refresh: () => void;
  openUpload: (request: UploadRequest) => void;
  openJob: (job: Job) => void;
  promptAfterPayment: (job: Job) => void;
  remove: (file: VaultFile) => void;
  update: (file: VaultFile, patch: Partial<VaultMeta>) => Promise<void>;
}

const VaultContext = React.createContext<VaultApi | null>(null);
export function useVault(): VaultApi {
  const value = React.useContext(VaultContext);
  if (!value) throw new Error('useVault must be used inside VaultProvider');
  return value;
}

export function VaultProvider({ financeKey, available, isPro, jobs, onUpgrade, triggerConfirm, triggerAlert, children }: {
  financeKey: string;
  available: boolean;
  isPro: boolean;
  jobs: Job[];
  onUpgrade: () => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void) => void;
  triggerAlert: (title: string, message: string) => void;
  children: React.ReactNode;
}) {
  const [files, setFiles] = React.useState<VaultFile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const [upload, setUpload] = React.useState<UploadRequest | null>(null);
  const [jobView, setJobView] = React.useState<Job | null>(null);
  const [paidPrompt, setPaidPrompt] = React.useState<Job | null>(null);

  React.useEffect(() => {
    setFiles([]); setError('');
    if (!available || !financeKey) return;
    let cancelled = false;
    setLoading(true);
    listVault(financeKey)
      .then(list => { if (!cancelled) setFiles(list); })
      .catch(err => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [financeKey, available, revision]);

  const remove = React.useCallback((file: VaultFile) => {
    triggerConfirm('ลบไฟล์นี้?', `${file.fileName} จะถูกลบออกจากคลังเอกสารถาวร`, () => {
      deleteVault(financeKey, file.id)
        .then(() => setFiles(list => list.filter(item => item.id !== file.id)))
        .catch(err => triggerAlert('ลบไฟล์ไม่สำเร็จ', (err as Error).message));
    });
  }, [financeKey, triggerConfirm, triggerAlert]);

  const update = React.useCallback(async (file: VaultFile, patch: Partial<VaultMeta>) => {
    const next = await updateVault(financeKey, file.id, patch);
    setFiles(list => list.map(item => (item.id === next.id ? next : item)));
  }, [financeKey]);

  const api: VaultApi = {
    available, isPro, files, loading, error,
    refresh: () => setRevision(n => n + 1),
    openUpload: request => setUpload(request),
    openJob: job => setJobView(job),
    // Only worth asking when the workspace can actually keep the file.
    promptAfterPayment: job => { if (available && isPro && jobWhtAmount(job) > 0) setPaidPrompt(job); },
    remove, update,
  };
  // App announces a job that just got fully paid; ask for its 50 ทวิ when tax was withheld.
  const promptRef = React.useRef(api.promptAfterPayment);
  promptRef.current = api.promptAfterPayment;
  React.useEffect(() => {
    const onPaid = (event: Event) => { const job = (event as CustomEvent<Job>).detail; if (job) promptRef.current(job); };
    window.addEventListener('cash-squirrel:wht-paid', onPaid);
    return () => window.removeEventListener('cash-squirrel:wht-paid', onPaid);
  }, []);

  // Keep an open job drawer in step with the latest job data.
  const liveJobView = jobView ? jobs.find(j => j.id === jobView.id) || jobView : null;

  return (
    <VaultContext.Provider value={api}>
      {children}
      <WhtPaidPrompt
        job={paidPrompt}
        onAttach={() => { const job = paidPrompt; setPaidPrompt(null); if (job) setUpload({ kind: 'wht50', job }); }}
        onClose={() => setPaidPrompt(null)}
      />
      <UploadDialog
        request={upload}
        financeKey={financeKey}
        available={available}
        isPro={isPro}
        jobs={jobs}
        existing={files}
        onUpgrade={() => { setUpload(null); onUpgrade(); }}
        onUploaded={file => setFiles(list => [file, ...list.filter(item => item.id !== file.id)])}
        onRemove={remove}
        onClose={() => setUpload(null)}
      />
      <JobFilesDrawer
        job={liveJobView}
        files={liveJobView ? wht50Files(liveJobView, files) : []}
        onAdd={() => liveJobView && setUpload({ kind: 'wht50', job: liveJobView })}
        onRemove={remove}
        onClose={() => setJobView(null)}
      />
    </VaultContext.Provider>
  );
}

// ---------------------------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------------------------

/** A file's picture: the image itself, or a PDF page icon. */
export function FileThumb({ file, className = '', large = false }: { file: Pick<VaultFile, 'id' | 'mimeType' | 'fileName'>; className?: string; large?: boolean }) {
  if (file.mimeType.startsWith('image/')) {
    return <img src={vaultFileUrl(file.id)} alt="" loading="lazy" className={`object-cover ${className}`} />;
  }
  return <PdfIcon className={className} large={large} />;
}

export function PdfIcon({ className = '', large = false }: { className?: string; large?: boolean }) {
  return (
    <span className={`relative flex items-center justify-center bg-[#F6F4F1] dark:bg-[#2A2B2F] ${className}`} aria-hidden>
      <FileText className={`${large ? 'h-10 w-10' : 'h-5 w-5'} text-brand-muted`} strokeWidth={1.5} />
      <span className={`absolute rounded bg-[#E5484D] font-bold text-white ${large ? 'bottom-3 right-3 px-1.5 py-0.5 text-[10px]' : 'bottom-1 right-1 px-1 text-[8px] leading-tight'}`}>PDF</span>
    </span>
  );
}

const typeLabel = (file: Pick<VaultFile, 'mimeType'>) => (file.mimeType === 'application/pdf' ? 'PDF' : file.mimeType.replace('image/', '').toUpperCase().replace('JPEG', 'JPG'));

/** One file row with open / download / delete. */
export function FileRow({ file, onRemove }: { file: VaultFile; onRemove?: (file: VaultFile) => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <a href={vaultFileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-90">
        <FileThumb file={file} className="h-12 w-10 shrink-0 overflow-hidden rounded-md border border-brand-border" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-brand-text">{file.fileName}</span>
          <span className="block text-xs text-brand-muted">{typeLabel(file)} · {formatFileSize(file.sizeBytes)}</span>
        </span>
      </a>
      <RowMenu label={`ตัวเลือกของ ${file.fileName}`} items={[
        { label: 'เปิดดู', icon: ExternalLink, run: () => window.open(vaultFileUrl(file.id), '_blank', 'noopener') },
        { label: 'ดาวน์โหลด', icon: Download, run: () => { window.location.href = vaultFileUrl(file.id, true); } },
        ...(onRemove ? [{ label: 'ลบไฟล์', icon: Trash2, danger: true, run: () => onRemove(file) }] : []),
      ]} />
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// 1. After a payment on a job with withholding tax
// ---------------------------------------------------------------------------------------------

function WhtPaidPrompt({ job, onAttach, onClose }: { job: Job | null; onAttach: () => void; onClose: () => void }) {
  const wht = job ? jobWhtAmount(job) : 0;
  return (
    <Modal open={Boolean(job)} onClose={onClose} label="รับเงินเรียบร้อยแล้ว" width={420}>
      {job && (
        <div className="p-6">
          <div className="flex items-start gap-3 pr-8">
            <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-[#18A66A]" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-brand-text">รับเงินเรียบร้อยแล้ว</p>
              <p className="mt-0.5 font-mono text-[24px] font-semibold leading-tight text-brand-text">{formatCurrency(jobNetReceivable(job))}</p>
              <p className="mt-0.5 truncate text-[13px] text-brand-muted">{job.name}{job.client ? ` · ${job.client}` : ''}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-brand-border pt-3 text-[13px]">
            <span className="text-brand-muted">หัก ณ ที่จ่าย {job.whtRate || 0}%</span>
            <span className="font-mono font-medium text-brand-text">{formatCurrency(wht)}</span>
          </div>
          <div className="mt-4 rounded-2xl bg-[#FFF5EE] p-4 dark:bg-[#E65F2B]/10">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-brand-text"><FileText className="h-4 w-4 text-[#C24A16] dark:text-[#FF9A6B]" />ใบ 50 ทวิ</p>
            <p className="mt-1 text-[13px] leading-relaxed text-brand-muted">ได้รับหนังสือรับรองการหักภาษี ณ ที่จ่ายจากลูกค้ารายนี้หรือยัง? เก็บไว้ใช้เครดิตภาษีตอนยื่นแบบ</p>
            <button type="button" onClick={onAttach} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">
              <Upload className="h-4 w-4" />แนบใบ 50 ทวิ
            </button>
            <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-xl border border-brand-border bg-brand-white text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer dark:bg-transparent">
              ยังไม่ได้ — ไว้ตามทีหลัง
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-brand-muted">งานนี้จะขึ้นสถานะ “รอใบ 50 ทวิ” จนกว่าจะแนบไฟล์</p>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// 2–3. Upload (pick files or take a photo) and the success state
// ---------------------------------------------------------------------------------------------

interface Picked { key: string; file: File; preview: string | null; error: string }
const okType = (file: File) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type) || /\.(pdf|jpe?g|png|webp)$/i.test(file.name);

function UploadDialog({ request, financeKey, available, isPro, jobs, existing, onUpgrade, onUploaded, onRemove, onClose }: {
  request: UploadRequest | null;
  financeKey: string;
  available: boolean;
  isPro: boolean;
  jobs: Job[];
  existing: VaultFile[];
  onUpgrade: () => void;
  onUploaded: (file: VaultFile) => void;
  onRemove: (file: VaultFile) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = React.useState<Picked[]>([]);
  const [kind, setKind] = React.useState<VaultKind>('wht50');
  const [jobId, setJobId] = React.useState('');
  const [busy, setBusy] = React.useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = React.useState<string[]>([]);
  const [doneIds, setDoneIds] = React.useState<string[] | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const cameraInput = React.useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = React.useState(false);
  const dragDepth = React.useRef(0);
  // Image previews live until the dialog closes (or the file is taken out of the list).
  const previews = React.useRef<string[]>([]);
  const releasePreviews = () => { previews.current.forEach(url => URL.revokeObjectURL(url)); previews.current = []; };
  React.useEffect(() => {
    if (!request) return;
    setPicked([]); setFailures([]); setDoneIds(null); setBusy(null); setDragging(false); dragDepth.current = 0;
    setKind(request.kind); setJobId(request.job?.id || '');
    if (request.files?.length) add(request.files);
    return releasePreviews;
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const fixedJob = request?.job || null;
  const job = fixedJob || jobs.find(j => j.id === jobId) || null;
  const title = kind === 'wht50' ? 'แนบใบ 50 ทวิ' : 'เพิ่มเอกสาร';

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const next = Array.from(list).map((file, i): Picked => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      if (preview) previews.current.push(preview);
      return {
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      preview,
      error: !okType(file) ? 'รองรับเฉพาะ PDF, JPG, PNG, WEBP' : file.size > VAULT_MAX_BYTES ? 'ไฟล์ใหญ่เกิน 10 MB' : '',
      };
    });
    setPicked(current => [...current, ...next]);
  };
  // Drag files from the computer straight into the dialog.
  const dropHandlers = {
    onDragEnter: (e: React.DragEvent) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); if (!busy) add(e.dataTransfer.files); },
  };

  const save = async () => {
    const ready = picked.filter(p => !p.error);
    if (!ready.length) return;
    setBusy({ done: 0, total: ready.length }); setFailures([]);
    const ids: string[] = []; const failed: string[] = [];
    for (const [index, item] of ready.entries()) {
      try {
        const file = await uploadVault(financeKey, item.file, { kind, jobId: job?.id || null, jobName: job?.name || null, client: job?.client || null });
        onUploaded(file); ids.push(file.id);
      } catch (err) {
        if ((err as { code?: string }).code === 'pro_required') { setBusy(null); onUpgrade(); return; }
        failed.push(`${item.file.name}: ${(err as Error).message}`);
      }
      setBusy({ done: index + 1, total: ready.length });
    }
    setBusy(null);
    setFailures(failed);
    if (ids.length) { setPicked([]); setDoneIds(ids); }
  };

  const doneFiles = doneIds ? (job ? existing.filter(f => f.jobId === job.id && f.kind === kind) : existing.filter(f => doneIds.includes(f.id))) : [];

  return (
    <Modal open={Boolean(request)} onClose={busy ? () => {} : onClose} label={title}>
      {!available ? (
        <div className="p-6 pr-12">
          <p className="text-[16px] font-semibold text-brand-text">{title}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-brand-muted">คลังเอกสารเก็บไฟล์ไว้ในบัญชีของคุณ จึงใช้ได้กับบัญชีจริงเท่านั้น ออกจากโหมดทดลองแล้วเข้าสู่ระบบเพื่อใช้งาน</p>
        </div>
      ) : !isPro ? (
        <div className="p-6 pr-12">
          <p className="text-[16px] font-semibold text-brand-text">{title}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-brand-muted">คลังเอกสารเป็นฟีเจอร์สำหรับสมาชิก Pro เก็บใบ 50 ทวิ สัญญา และเอกสารลูกค้าไว้กับงาน ดาวน์โหลดรวมตอนยื่นภาษีได้ในคลิกเดียว</p>
          <button type="button" onClick={onUpgrade} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221] cursor-pointer">อัปเกรดเป็น Pro</button>
        </div>
      ) : doneIds ? (
        <div className="p-6">
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="h-12 w-12 text-[#18A66A]" />
            <p className="mt-3 text-[16px] font-semibold text-[#12804F] dark:text-[#6FD3A3]">แนบเอกสารเรียบร้อยแล้ว</p>
            <p className="mt-1 text-[13px] text-brand-muted">ไฟล์ถูกเก็บ{job ? 'ไว้กับงานนี้' : 'ในคลังเอกสาร'}เรียบร้อย ดูหรือเพิ่มไฟล์ได้ตลอด</p>
          </div>
          {failures.length > 0 && <ul className="mt-4 space-y-1 rounded-xl bg-[#FDEEEE] p-3 text-xs text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]">{failures.map(f => <li key={f}>{f}</li>)}</ul>}
          <div className="mt-5 rounded-2xl border border-brand-border px-4 pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-brand-text">{VAULT_KIND_LABEL[kind]} · {doneFiles.length} ไฟล์</p>
              <button type="button" onClick={() => setDoneIds(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#C24A16] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10"><Plus className="h-3.5 w-3.5" />เพิ่มไฟล์</button>
            </div>
            <ul className="divide-y divide-brand-border">{doneFiles.map(file => <FileRow key={file.id} file={file} onRemove={onRemove} />)}</ul>
          </div>
          <button type="button" onClick={onClose} className="mt-5 h-11 w-full rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221] cursor-pointer">เสร็จสิ้น</button>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1 overflow-y-auto p-6" {...dropHandlers} data-testid="vault-drop-zone">
            {dragging && (
              <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E65F2B] bg-[#FFF5EE]/95 text-center dark:bg-[#2A1F1A]/95">
                <Upload className="h-7 w-7 text-[#C24A16] dark:text-[#FF9A6B]" />
                <p className="text-[15px] font-semibold text-[#C24A16] dark:text-[#FF9A6B]">วางไฟล์ที่นี่</p>
                <p className="text-xs text-brand-muted">PDF, JPG, PNG, WEBP ไม่เกิน 10 MB ต่อไฟล์</p>
              </div>
            )}
            <div className="pr-8 text-center">
              <p className="text-[17px] font-semibold text-brand-text">{title}</p>
              <p className="mt-1 text-[13px] text-brand-muted">ลากไฟล์มาวาง เลือกจากเครื่อง หรือถ่ายรูปเอกสาร แนบได้มากกว่า 1 ไฟล์</p>
              {fixedJob && <p className="mt-2 truncate text-xs text-brand-muted"><span className="font-medium text-brand-text">{fixedJob.name}</span>{fixedJob.client ? ` · ${fixedJob.client}` : ''}</p>}
            </div>

            {!fixedJob && (
              <div className="mt-5 space-y-3">
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="ประเภทเอกสาร">
                  {(Object.keys(VAULT_KIND_LABEL) as VaultKind[]).map(k => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                      className={`h-10 rounded-full border text-[13px] font-medium transition-colors cursor-pointer ${kind === k ? 'border-[#E65F2B] bg-[#E65F2B] text-white' : 'border-brand-border text-brand-text hover:bg-brand-faint'}`}>
                      {VAULT_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-brand-text">ผูกกับงาน (ไม่บังคับ)</span>
                  <select value={jobId} onChange={e => setJobId(e.target.value)} className="h-11 w-full rounded-[10px] border border-brand-border bg-brand-white px-3 text-[14px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#141518]">
                    <option value="">ไม่ผูกกับงาน</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.name}{j.client ? ` · ${j.client}` : ''}</option>)}
                  </select>
                </label>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => fileInput.current?.click()} className="flex flex-col items-center gap-1 rounded-2xl border border-brand-border px-3 py-4 text-center transition-colors hover:border-[#F3B08C] hover:bg-[#FFF8F2] cursor-pointer dark:hover:bg-[#E65F2B]/10">
                <Upload className="h-5 w-5 text-brand-text" />
                <span className="text-[13px] font-medium text-brand-text">ลากมาวาง หรือเลือกไฟล์</span>
                <span className="text-[11px] text-brand-muted">JPG, PNG, WEBP, PDF</span>
              </button>
              <button type="button" onClick={() => cameraInput.current?.click()} className="flex flex-col items-center gap-1 rounded-2xl border border-brand-border px-3 py-4 text-center transition-colors hover:border-[#F3B08C] hover:bg-[#FFF8F2] cursor-pointer dark:hover:bg-[#E65F2B]/10">
                <Camera className="h-5 w-5 text-brand-text" />
                <span className="text-[13px] font-medium text-brand-text">ถ่ายรูปเอกสาร</span>
                <span className="text-[11px] text-brand-muted">(มือถือ)</span>
              </button>
            </div>
            <input ref={fileInput} type="file" accept={VAULT_ACCEPT} multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} data-testid="vault-file-input" />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
            <p className="mt-2 text-xs text-brand-muted">ขนาดไม่เกิน 10 MB ต่อไฟล์</p>

            {picked.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[13px] font-medium text-brand-text">ไฟล์ที่เลือก ({picked.length})</p>
                <ul className="grid grid-cols-3 gap-2.5">
                  {picked.map(p => (
                    <li key={p.key} className="relative">
                      <span className={`block aspect-[3/4] overflow-hidden rounded-xl border ${p.error ? 'border-[#E95454]' : 'border-brand-border'}`}>
                        {p.preview ? <img src={p.preview} alt="" className="h-full w-full object-cover" /> : <PdfIcon className="h-full w-full" />}
                      </span>
                      <button type="button" onClick={() => { if (p.preview) URL.revokeObjectURL(p.preview); setPicked(list => list.filter(item => item.key !== p.key)); }} aria-label={`เอา ${p.file.name} ออก`}
                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-brand-border bg-brand-white text-brand-muted shadow-sm hover:text-brand-text cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                      <p className="mt-1 truncate text-[11px] text-brand-text">{p.file.name}</p>
                      <p className={`text-[10.5px] ${p.error ? 'text-[#C43A3A] dark:text-[#F19A9A]' : 'text-brand-muted'}`}>{p.error || formatFileSize(p.file.size)}</p>
                    </li>
                  ))}
                  <li>
                    <button type="button" onClick={() => fileInput.current?.click()} className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-border text-[12px] text-[#C24A16] hover:bg-[#FFF8F2] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10">
                      <Plus className="h-4 w-4" />เพิ่มไฟล์
                    </button>
                  </li>
                </ul>
              </div>
            )}
            {failures.length > 0 && <ul className="mt-3 space-y-1 rounded-xl bg-[#FDEEEE] p-3 text-xs text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]">{failures.map(f => <li key={f}>{f}</li>)}</ul>}
          </div>
          <div className="flex gap-2 border-t border-brand-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} disabled={Boolean(busy)} className="h-11 flex-1 rounded-xl border border-brand-border text-[14px] font-medium text-brand-text hover:bg-brand-faint disabled:opacity-50 cursor-pointer">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={Boolean(busy) || !picked.some(p => !p.error)}
              className="h-11 flex-[1.4] rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
              {busy ? `กำลังอัปโหลด ${busy.done}/${busy.total}…` : 'บันทึก'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// 6. A job's 50 ทวิ files
// ---------------------------------------------------------------------------------------------

function JobFilesDrawer({ job, files, onAdd, onRemove, onClose }: { job: Job | null; files: VaultFile[]; onAdd: () => void; onRemove: (file: VaultFile) => void; onClose: () => void }) {
  const latest = files[0];
  return (
    <Drawer open={Boolean(job)} title="ใบ 50 ทวิ" onClose={onClose} width={460}
      footer={latest ? (
        <div className="flex gap-2">
          <a href={vaultFileUrl(latest.id)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221]"><ExternalLink className="h-4 w-4" />ดูเอกสาร</a>
          <a href={vaultFileUrl(latest.id, true)} className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-border text-[14px] font-medium text-brand-text hover:bg-brand-faint"><Download className="h-4 w-4" />ดาวน์โหลด</a>
        </div>
      ) : undefined}>
      {job && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${files.length ? 'bg-[#18A66A]' : 'bg-[#E95454]'}`} />
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-brand-text">{job.client || job.name}</p>
              <p className="truncate text-[13px] text-brand-muted">{job.name}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-brand-faint/70 p-4 text-[13px]">
            <div><dt className="text-brand-muted">ยอดงาน</dt><dd className="mt-0.5 font-mono text-[15px] font-semibold text-brand-text">{formatCurrency(job.value || 0)}</dd></div>
            <div className="text-right"><dt className="text-brand-muted">หัก ณ ที่จ่าย ({job.whtRate || 0}%)</dt><dd className="mt-0.5 font-mono text-[15px] font-semibold text-brand-text">{formatCurrency(jobWhtAmount(job))}</dd></div>
          </dl>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-brand-text">ไฟล์เอกสาร ({files.length})</p>
              <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[#C24A16] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10"><Plus className="h-4 w-4" />เพิ่มไฟล์</button>
            </div>
            {files.length === 0 ? (
              <button type="button" onClick={onAdd} className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-brand-border px-4 py-8 text-center hover:bg-brand-faint cursor-pointer">
                <Upload className="h-5 w-5 text-brand-muted" />
                <span className="text-[13px] font-medium text-brand-text">ยังไม่มีใบ 50 ทวิ</span>
                <span className="text-xs text-brand-muted">กดเพื่อแนบไฟล์หรือถ่ายรูปเอกสาร</span>
              </button>
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                {files.map(file => (
                  <li key={file.id} className="relative">
                    <a href={vaultFileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="block aspect-[3/4] overflow-hidden rounded-xl border border-brand-border hover:opacity-90">
                      <FileThumb file={file} className="h-full w-full" large />
                    </a>
                    <button type="button" onClick={() => onRemove(file)} aria-label={`ลบ ${file.fileName}`}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70 cursor-pointer"><X className="h-4 w-4" /></button>
                    <p className="mt-1.5 truncate text-[12px] font-medium text-brand-text">{file.fileName}</p>
                    <p className="text-[11px] text-brand-muted">{typeLabel(file)} · {formatFileSize(file.sizeBytes)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {latest && (
            <dl className="space-y-1.5 border-t border-brand-border pt-4 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-brand-muted">ได้รับเมื่อ</dt><dd className="text-brand-text">{safeFormatThaiDate(latest.createdAt.slice(0, 10))}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-brand-muted">ชื่อไฟล์</dt><dd className="truncate text-brand-text">{latest.fileName}</dd></div>
            </dl>
          )}
        </div>
      )}
    </Drawer>
  );
}

/** Small 50 ทวิ status under a job's payment badge; nothing for jobs without withholding tax. */
export function Wht50Chip({ job }: { job: Job }) {
  const vault = useVault();
  if (!vault.available || jobWhtAmount(job) <= 0 || !((job.received || 0) > 0)) return null;
  const files = wht50Files(job, vault.files);
  return files.length ? (
    <button type="button" onClick={(e) => { e.stopPropagation(); vault.openJob(job); }}
      className="inline-flex items-center gap-1 rounded-full bg-[#E9F7F0] px-2 py-0.5 text-[11px] font-medium text-[#12804F] hover:bg-[#DDF2E8] cursor-pointer dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]">
      <CheckCircle2 className="h-3 w-3" />50 ทวิ{files.length > 1 ? ` (${files.length})` : ''}
    </button>
  ) : (
    <button type="button" onClick={(e) => { e.stopPropagation(); vault.openUpload({ kind: 'wht50', job }); }}
      className="inline-flex items-center gap-1 rounded-full border border-[#F0B8B8] px-2 py-0.5 text-[11px] font-medium text-[#C43A3A] hover:bg-[#FDEEEE] cursor-pointer dark:border-[#F19A9A]/40 dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10">
      <span className="h-1.5 w-1.5 rounded-full bg-current" />รอใบ 50 ทวิ
    </button>
  );
}
