import type { ReactNode } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

type Page = 'dashboard' | 'adminDashboard' | 'jobs' | 'calendar' | 'clients' | 'receivables'
  | 'incomeExpense' | 'split' | 'report' | 'insight' | 'tax' | 'invoice' | 'groups' | 'plans' | 'settings';

export default function PageHeader({ page, id, className = '', children }: {
  page: Page;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <header className={`ui-page-header ${className}`}>
      <div className="min-w-0 flex-1">
        <h1 id={id} className="ui-page-title">{t(`nav.${page}`)}</h1>
        <p className="ui-page-description">{t(`page.${page}Description`)}</p>
      </div>
      {children && <div className="ui-page-actions">{children}</div>}
    </header>
  );
}
