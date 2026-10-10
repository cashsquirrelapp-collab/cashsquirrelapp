import { FileCheck2, FolderOpen } from 'lucide-react';
import type { Expense, Job } from '../../../../shared/types';
import PageHeader from '../../components/ui/PageHeader';
import { VaultTab } from './VaultTab';
import { Wht50Panel } from './Wht50Panel';

export type VaultView = 'files' | 'wht50';

// เอกสาร › คลังเอกสาร is the one home for kept files and the 50 ทวิ tracker. The legacy
// /wht50 route still selects this page's second tab, but no longer renders a duplicate page.
export default function VaultPage({ jobs, expenses, triggerAlert, view, onViewChange }: {
  jobs: Job[];
  expenses: Expense[];
  triggerAlert: (title: string, message: string) => void;
  view: VaultView;
  onViewChange: (view: VaultView) => void;
}) {
  return (
    <div className="page-content space-y-5">
      <PageHeader page="vault" />

      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-brand-border bg-brand-white p-1.5 shadow-sm dark:bg-[#1F2024]" role="tablist" aria-label="มุมมองคลังเอกสาร">
        <button type="button" role="tab" aria-label="ทุกไฟล์" aria-selected={view === 'files'} onClick={() => onViewChange('files')}
          className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors cursor-pointer sm:px-4 ${view === 'files' ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}>
          <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:inline-flex ${view === 'files' ? 'bg-white/80 dark:bg-white/5' : 'bg-brand-faint'}`}><FolderOpen className="h-4.5 w-4.5" /></span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">ทุกไฟล์</span>
            <span className="mt-0.5 hidden truncate text-xs font-normal opacity-75 md:block">เอกสารที่อัปโหลดและจัดเก็บไว้</span>
          </span>
        </button>
        <button type="button" role="tab" aria-label="50 ทวิ" aria-selected={view === 'wht50'} onClick={() => onViewChange('wht50')}
          className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors cursor-pointer sm:px-4 ${view === 'wht50' ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}>
          <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:inline-flex ${view === 'wht50' ? 'bg-white/80 dark:bg-white/5' : 'bg-brand-faint'}`}><FileCheck2 className="h-4.5 w-4.5" /></span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">50 ทวิ</span>
            <span className="mt-0.5 hidden truncate text-xs font-normal opacity-75 md:block">ติดตามใบที่ได้รับแล้วและยังรอรับ</span>
          </span>
        </button>
      </div>

      {view === 'files'
        ? <VaultTab jobs={jobs} expenses={expenses} />
        : <Wht50Panel jobs={jobs} triggerAlert={triggerAlert} />}
    </div>
  );
}
