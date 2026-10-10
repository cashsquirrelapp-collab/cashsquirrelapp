import type { Expense, Job } from '../../../../shared/types';
import { VaultTab } from './VaultTab';

// เอกสาร › คลังเอกสาร as its own page (a sub-item under เอกสาร in the menu).
export default function VaultPage({ jobs, expenses, onOpenWht50 }: {
  jobs: Job[];
  expenses: Expense[];
  onOpenWht50: () => void;
}) {
  return (
    <div className="page-content space-y-4">
      <VaultTab jobs={jobs} expenses={expenses} onOpenWht50={onOpenWht50} />
    </div>
  );
}
