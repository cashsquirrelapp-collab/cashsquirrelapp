import { FileCheck2 } from 'lucide-react';
import type { Expense, Job } from '../../../../shared/types';
import PageHeader from '../../components/ui/PageHeader';
import { VaultTab } from './VaultTab';

// เอกสาร › คลังเอกสาร as its own page (a sub-item under เอกสาร in the menu).
export default function VaultPage({ jobs, expenses, onOpenWht50 }: {
  jobs: Job[];
  expenses: Expense[];
  onOpenWht50: () => void;
}) {
  return (
    <div className="page-content space-y-4">
      <PageHeader page="vault">
        <button type="button" onClick={onOpenWht50}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer">
          <FileCheck2 className="h-4 w-4" />จัดการใบ 50 ทวิ
        </button>
      </PageHeader>
      <VaultTab jobs={jobs} expenses={expenses} />
    </div>
  );
}
