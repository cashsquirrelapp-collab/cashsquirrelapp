import type { ReactNode } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

type Page = 'dashboard' | 'adminDashboard' | 'jobs' | 'calendar' | 'receivables'
  | 'incomeExpense' | 'split' | 'report' | 'insight' | 'tax' | 'invoice' | 'groups' | 'plans' | 'settings' | 'vault' | 'wht50';

export default function PageHeader({ page, id, title, description, className = '', keepTitle = false, children }: {
  page: Page;
  id?: string;
  /** In place of the page's menu name. */
  title?: string;
  description?: string;
  className?: string;
  /** The title keeps its width and the actions move under it, right-aligned, when they do not fit beside it. */
  keepTitle?: boolean;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <header className={`ui-page-header ${className}`}>
      <div className={keepTitle ? 'min-w-0 flex-1 sm:min-w-[15rem]' : 'min-w-0 flex-1'}>
        <h1 id={id} className="ui-page-title">{title ?? t(`nav.${page}`)}</h1>
        <p className="ui-page-description">{description ?? t(`page.${page}Description`)}</p>
      </div>
      {children && <div className={keepTitle ? 'ui-page-actions sm:ml-auto' : 'ui-page-actions'}>{children}</div>}
    </header>
  );
}
