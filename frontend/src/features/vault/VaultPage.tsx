import type { Job } from '../../../../shared/types';
import { VaultTab } from './VaultTab';

// เอกสาร › คลังเอกสาร as its own page (a sub-item under เอกสาร in the menu).
export default function VaultPage({ jobs }: { jobs: Job[] }) {
  return (
    <div className="page-content space-y-4">
      <VaultTab jobs={jobs} />
    </div>
  );
}
