import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Job } from '../../../../shared/types';
import { DEFAULT_JOB_TYPES } from '../../utils';

const UNSPECIFIED = 'ยังไม่ระบุ';

interface JobTypeManagerProps {
  open: boolean;
  onClose: () => void;
  jobTypes: string[];
  setJobTypes: React.Dispatch<React.SetStateAction<string[]>>;
  jobs: Job[];
  onRename: (from: string, to: string) => void;
}

// Jobs store their type as a plain label, so the selectable list and the jobs are independent:
// hiding a type only takes it out of the list, and every job keeps showing the label it was saved
// with. Types still used by jobs can be hidden (and shown again) but never deleted; a type no job
// uses is simply removed.
export default function JobTypeManager({ open, onClose, jobTypes, setJobTypes, jobs, onRename }: JobTypeManagerProps) {
  const [newName, setNewName] = React.useState('');
  const [editing, setEditing] = React.useState<{ from: string; to: string } | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setNewName('');
    setEditing(null);
    setError('');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    // Capture phase so Escape closes only this dialog, not the job drawer underneath.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const usage = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      const type = job.type || UNSPECIFIED;
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    return counts;
  }, [jobs]);

  const isBuiltIn = (type: string) => type === UNSPECIFIED || DEFAULT_JOB_TYPES.includes(type);
  const active = jobTypes.filter(type => !isBuiltIn(type));
  const hidden = [...usage.keys()].filter(type => type && !isBuiltIn(type) && !jobTypes.includes(type)).sort((a, b) => a.localeCompare(b, 'th'));
  const allNames = [UNSPECIFIED, ...DEFAULT_JOB_TYPES, ...jobTypes, ...hidden];
  const taken = (name: string, except?: string) =>
    allNames.some(existing => existing !== except && existing.toLowerCase() === name.toLowerCase());

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    // Typing the name of a hidden type brings it back instead of creating a duplicate.
    const hiddenMatch = hidden.find(type => type.toLowerCase() === name.toLowerCase());
    if (hiddenMatch) {
      setJobTypes(prev => [...prev, hiddenMatch]);
    } else if (taken(name)) {
      setError(`มีประเภท "${name}" อยู่แล้ว`);
      return;
    } else {
      setJobTypes(prev => [...prev, name]);
    }
    setNewName('');
    setError('');
  };

  const saveRename = () => {
    if (!editing) return;
    const to = editing.to.trim();
    if (!to) { setError('กรุณาใส่ชื่อประเภทงาน'); return; }
    if (to !== editing.from && taken(to, editing.from)) { setError(`มีประเภท "${to}" อยู่แล้ว`); return; }
    if (to !== editing.from) {
      setJobTypes(prev => prev.map(type => type === editing.from ? to : type));
      if (usage.get(editing.from)) onRename(editing.from, to);
    }
    setEditing(null);
    setError('');
  };

  const remove = (type: string) => setJobTypes(prev => prev.filter(t => t !== type));
  const restore = (type: string) => setJobTypes(prev => [...prev, type]);

  if (!open) return null;

  const rowButton = 'h-8 shrink-0 rounded-lg px-2.5 text-xs transition-colors cursor-pointer';
  const inputClass = 'h-10 min-w-0 flex-1 rounded-[10px] border border-brand-border bg-brand-white px-3 text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-[#E65F2B] dark:bg-neutral-950';

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-type-manager-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-brand-border bg-brand-white shadow-xl dark:bg-stone-900 sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-border px-5 py-4">
          <div>
            <h3 id="job-type-manager-title" className="text-base font-semibold text-brand-text">จัดการประเภทงาน</h3>
            <p className="mt-0.5 text-xs text-brand-muted">ประเภทที่มีงานใช้อยู่ลบไม่ได้ แต่ซ่อนจากรายการได้ งานเดิมยังแสดงชื่อเดิม</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder="เพิ่มประเภทงานใหม่"
                aria-label="ชื่อประเภทงานใหม่"
                className={inputClass}
              />
              <button
                type="button"
                onClick={add}
                disabled={!newName.trim()}
                className="h-10 shrink-0 rounded-[10px] bg-[#E65F2B] px-4 text-[13px] font-semibold text-white hover:bg-[#D85723] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                เพิ่ม
              </button>
            </div>
            {error && <p role="alert" className="mt-1.5 text-xs text-[#C43A3A] dark:text-rose-300">{error}</p>}
          </div>

          <section>
            <h4 className="mb-2 text-xs font-medium text-brand-muted">ประเภทที่สร้างเอง</h4>
            {active.length === 0 ? (
              <p className="rounded-[10px] bg-brand-faint px-3 py-2.5 text-[13px] text-brand-muted">ยังไม่มีประเภทที่สร้างเอง</p>
            ) : (
              <ul className="divide-y divide-brand-border rounded-[10px] border border-brand-border">
                {active.map(type => {
                  const count = usage.get(type) || 0;
                  const isEditing = editing?.from === type;
                  return (
                    <li key={type} className="flex items-center gap-2 px-3 py-2">
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            autoFocus
                            value={editing.to}
                            onChange={(e) => { setEditing({ from: type, to: e.target.value }); setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveRename(); } }}
                            aria-label={`ชื่อใหม่ของประเภท ${type}`}
                            className={inputClass}
                          />
                          <button type="button" onClick={saveRename} className={`${rowButton} font-medium text-[#C24A16] hover:bg-[#FFF1E8] dark:text-orange-300`}>บันทึก</button>
                          <button type="button" onClick={() => { setEditing(null); setError(''); }} className={`${rowButton} text-brand-muted hover:bg-brand-faint`}>ยกเลิก</button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-brand-text">{type}</p>
                            <p className="text-[11px] text-brand-muted">{count > 0 ? `ใช้ใน ${count} งาน` : 'ยังไม่มีงานใช้'}</p>
                          </div>
                          <button type="button" onClick={() => { setEditing({ from: type, to: type }); setError(''); }} className={`${rowButton} text-brand-text hover:bg-brand-faint`}>แก้ชื่อ</button>
                          {count > 0 ? (
                            <button type="button" onClick={() => remove(type)} className={`${rowButton} text-brand-muted hover:bg-brand-faint hover:text-brand-text`}>ซ่อน</button>
                          ) : (
                            <button type="button" onClick={() => remove(type)} className={`${rowButton} text-[#C43A3A] hover:bg-[#FFF0F0] dark:text-rose-300 dark:hover:bg-rose-950/40`}>ลบ</button>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {hidden.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-medium text-brand-muted">ซ่อนอยู่ · ไม่แสดงตอนเลือกประเภทงาน</h4>
              <ul className="divide-y divide-brand-border rounded-[10px] border border-brand-border">
                {hidden.map(type => (
                  <li key={type} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-brand-muted">{type}</p>
                      <p className="text-[11px] text-brand-muted">ใช้ใน {usage.get(type)} งาน</p>
                    </div>
                    <button type="button" onClick={() => restore(type)} className={`${rowButton} text-brand-text hover:bg-brand-faint`}>แสดงอีกครั้ง</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[11px] leading-relaxed text-brand-muted">
            ประเภทเริ่มต้น (แก้ไขไม่ได้): {DEFAULT_JOB_TYPES.join(', ')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
