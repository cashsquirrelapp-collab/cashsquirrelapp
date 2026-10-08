import type { Job } from '../../../../shared/types';
import PageHeader from '../../components/ui/PageHeader';
import { Wht50Panel } from './Wht50Panel';

// เอกสาร › ใบ 50 ทวิ: the withholding tax certificates for each year's jobs, as its own page
// under เอกสาร (it used to be a tab on the tax page).
export default function Wht50Page({ jobs, triggerAlert }: { jobs: Job[]; triggerAlert: (title: string, message: string) => void }) {
  return (
    <div className="page-content space-y-4">
      <PageHeader page="wht50" />
      <Wht50Panel jobs={jobs} triggerAlert={triggerAlert} />
    </div>
  );
}
