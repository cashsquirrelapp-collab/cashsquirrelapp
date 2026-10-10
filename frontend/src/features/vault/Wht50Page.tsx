import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { Job } from '../../../../shared/types';
import { nowInBangkok } from '../../../../shared/monthlySummary';
import PageHeader from '../../components/ui/PageHeader';
import { useLanguage } from '../../i18n/LanguageContext';
import { Wht50Panel } from './Wht50Panel';
import { isWht50Trackable, paidYearOf, type Wht50TaxYear } from './vaultStatus';

// เอกสาร › ติดตามใบ 50 ทวิ: a dedicated follow-up page under เอกสาร.
export default function Wht50Page({ jobs, triggerAlert, onOpenDocuments, onOpenVault }: {
  jobs: Job[];
  triggerAlert: (title: string, message: string) => void;
  onOpenDocuments: () => void;
  onOpenVault: () => void;
}) {
  const { t } = useLanguage();
  const currentYear = nowInBangkok().getUTCFullYear();
  const trackable = React.useMemo(() => jobs.filter(isWht50Trackable), [jobs]);
  const years = React.useMemo(() => [...new Set([
    currentYear,
    ...trackable.map(paidYearOf).filter((year): year is number => year !== null),
  ])].sort((a, b) => b - a), [trackable, currentYear]);
  const unknownYearCount = React.useMemo(() => trackable.filter(job => paidYearOf(job) === null).length, [trackable]);
  const [year, setYear] = React.useState<Wht50TaxYear>(currentYear);

  React.useEffect(() => {
    if (year === 'unknown' && unknownYearCount === 0) setYear(currentYear);
  }, [currentYear, unknownYearCount, year]);

  return (
    <div className="page-content space-y-4">
      <div>
        <nav aria-label="เส้นทางเอกสาร" className="mb-2 flex items-center gap-1.5 text-xs text-brand-muted">
          <button type="button" onClick={onOpenDocuments} className="rounded-md hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E65F2B]/40 cursor-pointer">{t('nav.invoice')}</button>
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          <span aria-current="page">{t('nav.wht50')}</span>
        </nav>
        <PageHeader page="wht50">
          <div className="flex w-full flex-col items-end gap-1.5 sm:w-auto">
            <label className="flex w-full items-center justify-between gap-3 text-[13px] font-medium text-brand-muted sm:w-auto sm:justify-start">
              <span>ปีภาษี</span>
              <select value={String(year)} onChange={event => setYear(event.target.value === 'unknown' ? 'unknown' : Number(event.target.value))} aria-label="ปีภาษี"
                className="h-10 min-w-36 rounded-xl border border-brand-border bg-brand-white px-3 text-[13px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#1F2024] cursor-pointer">
                {years.map(option => <option key={option} value={option}>ปีภาษี {option + 543}</option>)}
                {unknownYearCount > 0 && <option value="unknown">ไม่ระบุปีภาษี ({unknownYearCount} งาน)</option>}
              </select>
            </label>
            {unknownYearCount > 0 && year !== 'unknown' && (
              <button type="button" onClick={() => setYear('unknown')} className="text-[11px] font-medium text-[#A9650B] hover:underline dark:text-[#F2C66D] cursor-pointer">
                {unknownYearCount} งานไม่พบวันที่รับเงินจริง
              </button>
            )}
          </div>
        </PageHeader>
      </div>
      <Wht50Panel jobs={jobs} triggerAlert={triggerAlert} year={year} onOpenVault={onOpenVault} />
    </div>
  );
}
