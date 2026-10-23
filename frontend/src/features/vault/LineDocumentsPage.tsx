import { BrandLockup } from '../../components/brand/BrandLogo';
import React from 'react';
import { ArrowUpRight, Check, ChevronRight, FileText, FolderCheck, LoaderCircle, Paperclip, Plus, Search, X } from 'lucide-react';
import type { Expense, Job } from '../../../../shared/types';
import { VAULT_ACCEPT, VAULT_KIND_LABEL, VAULT_MAX_BYTES, formatFileSize, type VaultFile, type VaultKind } from '../../../../shared/vault';
import { uploadVault, vaultFileUrl, type VaultMeta } from '../../services/vault';
import { useVault } from './VaultProvider';
import { documentInboxGaps, isFileAssigned } from './documentInbox';

import { tr } from '../../i18n/tr';
type Filter = 'filed' | 'missing';
const inputClass = 'h-12 w-full rounded-xl border border-brand-border bg-brand-white px-3 text-[14px] text-brand-text outline-none focus:border-[#E65F2B]';
const kinds: VaultKind[] = ['wht50', 'contract', 'expense', 'other'];

function FileEditor({ file, initialKind, jobs, expenses, disabled = false, onSave, onClose }: {
  file?: VaultFile; initialKind?: VaultKind; jobs: Job[]; expenses: Expense[]; disabled?: boolean;
  onSave: (patch: VaultMeta) => Promise<void> | void; onClose: () => void;
}) {
  const [kind, setKind] = React.useState<VaultKind>(initialKind || file?.kind || 'other');
  const [targetId, setTargetId] = React.useState(file?.jobId || '');
  const [saving, setSaving] = React.useState(false);
  const busy = saving || disabled;
  const [error, setError] = React.useState('');
  const targets = kind === 'expense' ? expenses : jobs;
  const target = targets.find(item => item.id === targetId);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    setSaving(true); setError('');
    try { await onSave({ kind, jobId: target.id, jobName: target.name, client: 'client' in target ? target.client : null }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : tr("บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setSaving(false); }
  };
  return <form onSubmit={save} className="mt-3 space-y-3 rounded-2xl bg-brand-faint p-4" aria-label={file ? tr("จัดไฟล์ {0}", file.fileName) : tr("เลือกงานก่อนแนบไฟล์")}>
    <div className="flex items-center justify-between"><strong className="text-sm">{file ? tr("เก็บไฟล์นี้ไว้กับอะไร?") : tr("แนบไฟล์ให้กับรายการไหน?")}</strong><button type="button" onClick={onClose} disabled={busy} aria-label={tr("ปิดการจัดไฟล์")} className="rounded-full p-2"><X size={18} /></button></div>
    <label className="block text-xs font-medium text-brand-muted">{tr("ประเภทเอกสาร")}<select value={kind} onChange={event => { const next = event.target.value as VaultKind; if ((next === 'expense') !== (kind === 'expense')) setTargetId(''); setKind(next); }} className={`${inputClass} mt-1.5`} disabled={busy}>
        {kinds.map(value => <option key={value} value={value}>{VAULT_KIND_LABEL[value]}</option>)}
      </select>
    </label>
    <label className="block text-xs font-medium text-brand-muted">{kind === 'expense' ? tr("รายจ่ายที่เกี่ยวข้อง") : tr("งาน / โปรเจกต์")}
      <select value={targetId} onChange={event => setTargetId(event.target.value)} className={`${inputClass} mt-1.5`} disabled={busy} required>
        <option value="">{targets.length ? tr("เลือกหนึ่งรายการ") : tr("ยังไม่มีรายการให้เลือก")}</option>
        {targets.map(item => <option key={item.id} value={item.id}>{item.name}{'client' in item && item.client ? ` · ${item.client}` : ''}</option>)}
      </select>
    </label>
    {!targets.length && <a href={kind === 'expense' ? '/incomeExpense?openAddExpense=1' : '/jobs?openAddJob=1'} className="inline-block text-sm font-medium text-[#C24A16] underline">{kind === 'expense' ? tr("เพิ่มรายจ่ายในแอปก่อน") : tr("เพิ่มงานในแอปก่อน")}</a>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={!target || busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#E65F2B] text-sm font-semibold text-white disabled:opacity-40">{busy ? <LoaderCircle className="animate-spin" size={18} /> : file ? <Check size={18} /> : <Paperclip size={18} />}{busy ? tr("กำลังบันทึก…") : file ? tr("จัดไฟล์เข้ารายการนี้") : tr("เลือกไฟล์เพื่อแนบ")}</button>
  </form>;
}

export default function LineDocumentsPage({ financeKey, jobs, expenses }: { financeKey: string; jobs: Job[]; expenses: Expense[] }) {
  const vault = useVault();
  const [filter, setFilter] = React.useState<Filter>(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    return view === 'missing' ? 'missing' : 'filed';
  });
  const [selecting, setSelecting] = React.useState(false);
  const [focusedFileId, setFocusedFileId] = React.useState(() => new URLSearchParams(window.location.search).get('file'));
  const [focusedKind] = React.useState(() => {
    const kind = new URLSearchParams(window.location.search).get('kind') as VaultKind;
    return kinds.includes(kind) ? kind : undefined;
  });
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const input = React.useRef<HTMLInputElement>(null);
  const uploadMeta = React.useRef<VaultMeta | null>(null);
  const focusedFile = vault.files.find(file => file.id === focusedFileId);
  const filed = vault.files.filter(file => isFileAssigned(file, jobs, expenses));
  const gaps = documentInboxGaps(jobs, vault.files);
  const q = query.trim().toLocaleLowerCase();
  const matches = (...values: (string | null | undefined)[]) => !q || values.some(value => value?.toLocaleLowerCase().includes(q));
  const files = filed.filter(file => matches(file.fileName, file.jobName, file.client));
  const shownGaps = gaps.filter(({ job }) => matches(job.name, job.client));
  const chooseFile = (meta: VaultMeta) => {
    if (busy || !meta.jobId) return;
    setError(''); setNotice('');
    if (!vault.isPro) { setError(tr("แนบไฟล์ได้ในช่วงทดลองหรือแพ็กเกจ Pro")); return; }
    uploadMeta.current = meta; input.current?.click();
  };
  const closeFocusedFile = () => {
    setFocusedFileId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('file'); url.searchParams.delete('kind');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  };
  const receiveFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []); event.target.value = '';
    if (!selected.length || busy || !uploadMeta.current?.jobId) return;
    const meta = { ...uploadMeta.current };
    setBusy(true); setError(''); setNotice('');
    let saved = 0;
    const failures: string[] = [];
    for (const file of selected) {
      if (file.size > VAULT_MAX_BYTES) { failures.push(tr("{0}: ใหญ่เกิน 10 MB", file.name)); continue; }
      try { await uploadVault(financeKey, file, meta); saved += 1; }
      catch (cause) { failures.push(`${file.name}: ${cause instanceof Error ? cause.message : tr("ส่งไม่สำเร็จ")}`); }
    }
    if (saved) { vault.refresh(); setFilter('filed'); setSelecting(false); setQuery(''); setNotice(tr("แนบ {0} ไฟล์ให้ {1} แล้ว", saved, meta.jobName)); }
    if (failures.length) setError(failures.join('\n'));
    setBusy(false);
  };
  return <main className="h-dvh overflow-y-auto bg-brand-bg text-brand-text" data-testid="line-documents">
    <div className="mx-auto min-h-full w-full max-w-xl px-5 pb-10 pt-5 sm:pt-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <BrandLockup size={32} />
        <a href="/app" className="inline-flex items-center gap-1 rounded-full border border-brand-border px-3 py-2 text-xs font-medium">{tr("เปิดแอป")}{' '}<ArrowUpRight size={14} /></a>
      </header>
      <section className="relative mb-5 overflow-hidden rounded-[26px] border border-[#EED8C1] bg-[linear-gradient(115deg,#FFF9F1,#F7E8D6)] px-5 pb-5 pt-6 text-[#4A2D1A]">
        <div className="relative z-10 max-w-[72%]"><p className="mb-1 text-xs font-medium text-[#996C47]">{tr("ไฟล์พร้อม งานก็ไปต่อ")}</p><h1 className="text-[27px] font-bold leading-tight">{tr("เอกสารของฉัน")}</h1><p className="mt-2 text-[13px] leading-relaxed text-[#80634E]">{tr("เลือกงาน แนบไฟล์ เก็บให้ตรงรายการ")}</p></div>
        <img src="/line/mascot-v6-document.png" alt="" className="pointer-events-none absolute -right-3 top-2 h-36 w-36 object-contain" />
        <button type="button" onClick={() => { setError(''); setNotice(''); if (!vault.isPro) { setError(tr("แนบไฟล์ได้ในช่วงทดลองหรือแพ็กเกจ Pro")); return; } setSelecting(true); setEditing(null); }} disabled={busy || !vault.ready} className="relative z-10 mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#E65F2B] text-sm font-semibold text-white shadow-[0_5px_15px_#E65F2B25] disabled:opacity-50">
          {busy ? <LoaderCircle size={19} className="animate-spin" /> : <Plus size={21} />}{busy ? tr("กำลังแนบไฟล์…") : tr("แนบไฟล์ใหม่")}
        </button>
        <input ref={input} type="file" accept={VAULT_ACCEPT} multiple onChange={receiveFiles} className="hidden" aria-label={tr("เลือกไฟล์เอกสาร")} />
        <p className="mt-2.5 text-center text-[11px] text-[#80634E]">{tr("PDF หรือรูปภาพ · ไม่เกิน 10 MB ต่อไฟล์")}</p>
      </section>
      {selecting && <div className="mb-5"><FileEditor jobs={jobs} expenses={expenses} disabled={busy} onClose={() => setSelecting(false)} onSave={chooseFile} /></div>}
      {focusedFileId && vault.ready && <section className="mb-5 rounded-2xl border border-brand-border bg-brand-white p-4">
        {focusedFile ? <><h2 className="break-words text-sm font-semibold">{focusedFile.fileName}</h2><FileEditor key={focusedFile.id} file={focusedFile} initialKind={focusedKind} jobs={jobs} expenses={expenses} onClose={closeFocusedFile} onSave={async patch => { await vault.update(focusedFile, patch); closeFocusedFile(); setFilter('filed'); setQuery(''); setNotice(tr("เก็บ {0} ไว้กับ {1} แล้ว", focusedFile.fileName, patch.jobName)); }} /></> : <p className="text-sm text-brand-muted">{tr("ไม่พบไฟล์นี้ในบัญชีของคุณ")}{' '}<button type="button" className="ml-2 underline" onClick={closeFocusedFile}>{tr("ปิด")}</button></p>}
      </section>}
      <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label={tr("สถานะเอกสาร")}>
        {([{ key: 'filed', title: tr("จัดแล้ว"), count: filed.length, icon: FolderCheck }, { key: 'missing', title: tr("งานรอเอกสาร"), count: gaps.length, icon: Paperclip }] as const).map(({ key, title, count, icon: Icon }) => <button type="button" key={key} onClick={() => { setFilter(key); setEditing(null); setQuery(''); }} aria-pressed={filter === key} className={`flex min-h-[88px] flex-col items-start justify-between rounded-2xl border p-3 text-left transition-colors ${filter === key ? 'border-[#E65F2B] bg-[#FFF0E5] text-[#9F431B] dark:bg-[#E65F2B]/15 dark:text-[#FFAA80]' : 'border-brand-border bg-brand-white text-brand-muted'}`}>
          <span className="flex w-full items-center justify-between"><Icon size={17} /><b className="text-xl font-semibold leading-none">{vault.ready ? count : '–'}</b></span><span className="text-[12px] font-semibold">{title}</span>
        </button>)}
      </div>
      <p className="mb-3 text-xs leading-relaxed text-brand-muted">{filter === 'filed' ? tr("ไฟล์ที่ผูกกับงานหรือรายจ่ายแล้ว เปิดดูหรือย้ายรายการได้") : tr("ใบ 50 ทวิที่ยังรอ และงานที่ยังไม่มีไฟล์แนบ")}</p>
      <div className="relative mb-4"><Search className="absolute left-3 top-3.5 text-brand-muted" size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("ค้นหาไฟล์ ชื่องาน หรือลูกค้า")} aria-label={tr("ค้นหาเอกสาร")} className={`${inputClass} pl-10`} /></div>
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="mb-4 whitespace-pre-line rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {vault.error ? <div role="alert" className="rounded-2xl border border-brand-border p-5 text-sm">{tr("โหลดไฟล์ไม่สำเร็จ")}{' '}<button type="button" onClick={vault.refresh} className="ml-2 font-semibold text-[#C24A16] underline">{tr("ลองอีกครั้ง")}</button></div>
        : !vault.ready ? <div className="flex justify-center gap-2 py-14 text-sm text-brand-muted" role="status"><LoaderCircle className="animate-spin" size={18} />{tr("กำลังเปิดเอกสารของคุณ…")}</div>
        : filter === 'missing' ? <div className="space-y-3">{shownGaps.map(({ job, kind, required }) => <article key={job.id} className="rounded-2xl border border-brand-border bg-brand-white p-4">
          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${required ? 'bg-[#FFF0E5] text-[#A85324]' : 'bg-brand-faint text-brand-muted'}`}>{required ? tr("รอใบ 50 ทวิ") : tr("ยังไม่มีไฟล์แนบ")}</span>
          <h2 className="mt-2 text-[15px] font-semibold">{job.name}</h2>{job.client && <p className="mt-1 text-xs text-brand-muted">{job.client}</p>}
          {!required && <p className="mt-2 text-xs text-brand-muted">{tr("ถ้ามีเอกสารของงานนี้ แนบเก็บไว้ได้เลย")}</p>}
          <button type="button" disabled={busy} onClick={() => chooseFile({ kind, jobId: job.id, jobName: job.name, client: job.client })} className="mt-3 flex h-11 w-full items-center justify-between rounded-xl bg-brand-faint px-3 text-sm font-semibold text-[#B44E21] dark:text-[#FFAA80]"><span className="flex items-center gap-2"><Paperclip size={17} />{tr("แนบให้กับงานนี้")}</span><ChevronRight size={17} /></button>
        </article>)}{!shownGaps.length && <Empty text={q ? tr("ไม่พบงานที่ค้นหา") : tr("ไม่มีงานรอเอกสารแล้ว")} />}</div>
        : <div className="space-y-3">{files.map(file => <article key={file.id} className="rounded-2xl border border-brand-border bg-brand-white p-4">
          <div className="flex items-start gap-3"><a href={vaultFileUrl(file.id)} target="_blank" rel="noreferrer" aria-label={tr("เปิด {0}", file.fileName)} className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-faint text-[#B57B4D]"><FileText size={23} /></a><div className="min-w-0 flex-1"><a href={vaultFileUrl(file.id)} target="_blank" rel="noreferrer" className="block break-words text-[14px] font-semibold leading-snug">{file.fileName}</a><p className="mt-1 text-[11px] text-brand-muted">{formatFileSize(file.sizeBytes)} · {VAULT_KIND_LABEL[file.kind]}</p>{filter === 'filed' && <p className="mt-1.5 truncate text-xs text-[#447458]">{file.jobName}</p>}</div></div>
          {editing === file.id ? <FileEditor key={file.id} file={file} jobs={jobs} expenses={expenses} onClose={() => setEditing(null)} onSave={async patch => { await vault.update(file, patch); setEditing(null); setNotice(tr("เก็บ {0} ไว้กับ {1} แล้ว", file.fileName, patch.jobName)); }} /> : <button type="button" onClick={() => { setEditing(file.id); setSelecting(false); setNotice(''); }} className="mt-3 flex h-10 w-full items-center justify-between rounded-xl bg-brand-faint px-3 text-xs font-semibold"><span>{tr("แก้ประเภท / ย้ายงาน")}</span><ChevronRight size={16} /></button>}
        </article>)}{!files.length && <Empty text={q ? tr("ไม่พบไฟล์ที่ค้นหา") : tr("ยังไม่มีไฟล์ที่จัดเข้ารายการ")} />}</div>}
      <p className="mt-7 text-center text-[11px] leading-relaxed text-brand-muted">{tr("รวมไฟล์ที่แนบกับงานหรือรายจ่ายแล้ว")}<br />{tr("เอกสารอยู่ในบัญชีที่คุณเชื่อมไว้")}</p>
    </div>
  </main>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-brand-border px-5 py-12 text-center"><FolderCheck size={28} className="mx-auto mb-3 text-[#85A58A]" /><p className="text-sm text-brand-muted">{text}</p></div>; }
