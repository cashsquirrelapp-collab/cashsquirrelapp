import React from 'react';
import { Paperclip, Upload } from 'lucide-react';
import type { Expense } from '../../../../shared/types';
import { FileRow, useVault } from './VaultProvider';
import { expenseFiles } from './vaultStatus';

// Slips and receipts kept with an expense, shown in the expense's detail panel. Files can be
// picked or dropped straight onto the section; they go to the document vault as kind 'expense'.

export function ExpenseSlips({ expense }: { expense: Expense }) {
  const vault = useVault();
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);
  if (!vault.available) return null;
  const files = expenseFiles(expense, vault.files);
  const attach = (dropped?: File[]) => vault.openUpload({ kind: 'expense', expense, files: dropped });
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');
  const drop = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current += 1; setDragging(true); },
    onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth.current = 0; setDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length) attach(dropped);
    },
  };
  return (
    <section aria-label="สลิป / ใบเสร็จ" className="relative mt-6" {...drop} data-testid="expense-slips">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-brand-text">สลิป / ใบเสร็จ{files.length ? ` (${files.length})` : ''}</p>
        {files.length > 0 && (
          <button type="button" onClick={() => attach()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[#C24A16] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10">
            <Paperclip className="h-4 w-4" />แนบเพิ่ม
          </button>
        )}
      </div>
      {files.length === 0 ? (
        <button type="button" onClick={() => attach()}
          className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed px-4 py-7 text-center transition-colors cursor-pointer ${dragging ? 'border-[#E65F2B] bg-[#FFF5EE] dark:bg-[#E65F2B]/10' : 'border-brand-border hover:bg-brand-faint'}`}>
          <Upload className={`h-5 w-5 ${dragging ? 'text-[#C24A16] dark:text-[#FF9A6B]' : 'text-brand-muted'}`} />
          <span className="text-[13px] font-medium text-brand-text">{dragging ? 'วางไฟล์ที่นี่' : 'แนบสลิปโอนเงินหรือใบเสร็จ'}</span>
          <span className="text-xs text-brand-muted">ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์ / ถ่ายรูป</span>
        </button>
      ) : (
        <div className={`rounded-2xl border px-3 transition-colors ${dragging ? 'border-dashed border-[#E65F2B] bg-[#FFF5EE] dark:bg-[#E65F2B]/10' : 'border-brand-border'}`}>
          <ul className="divide-y divide-brand-border">{files.map(file => <FileRow key={file.id} file={file} onRemove={vault.remove} />)}</ul>
        </div>
      )}
    </section>
  );
}

/** Small paperclip next to an expense's name when it has slips kept. */
export function ExpenseSlipMark({ expenseId }: { expenseId: string }) {
  const vault = useVault();
  const count = vault.available ? expenseFiles({ id: expenseId }, vault.files).length : 0;
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex shrink-0 items-center gap-0.5 align-middle text-[11px] font-medium text-brand-muted" title={`มีสลิป / ใบเสร็จ ${count} ไฟล์`} aria-label={`มีสลิป ${count} ไฟล์`}>
      <Paperclip className="h-3 w-3" />{count > 1 ? count : ''}
    </span>
  );
}
