import React from 'react';
import { Mascot } from '../mascot/Mascot';

// Filled versions of the sidebar icons, for the page that is open (iOS style, owner 2026-10-23):
// outline icons for the other pages, a solid one for where you are. Inner details are drawn in
// the sidebar's own colour so they read as cut-outs on both light and dark glass.
const CUT = 'var(--nav-glyph-cut, #FFFFFF)';

type Glyph = (cut: string) => React.ReactNode;

const line = (d: string, cut: string, width = 1.7) => <path d={d} fill="none" stroke={cut} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />;

const DOC = 'M7 2.5h6.8L19.5 8.2v11.3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z';

const FILLED: Record<string, Glyph> = {
  dashboard: () => <path d="M11.3 2.6a1.1 1.1 0 0 1 1.4 0l8.6 7.3c.8.7.3 1.9-.7 1.9H19V20a1.5 1.5 0 0 1-1.5 1.5H14v-5.2a.8.8 0 0 0-.8-.8h-2.4a.8.8 0 0 0-.8.8v5.2H6.5A1.5 1.5 0 0 1 5 20v-8.2H3.4c-1 0-1.5-1.2-.7-1.9Z" />,
  jobs: () => <path fillRule="evenodd" d="M9 3.5A1.5 1.5 0 0 0 7.5 5v1.5H5A2.5 2.5 0 0 0 2.5 9v9A2.5 2.5 0 0 0 5 20.5h14a2.5 2.5 0 0 0 2.5-2.5V9A2.5 2.5 0 0 0 19 6.5h-2.5V5A1.5 1.5 0 0 0 15 3.5Zm.2 1.7h5.6v1.3H9.2Z" />,
  calendar: () => <path d="M8 2.2a.9.9 0 0 1 .9.9V4h6.2v-.9a.9.9 0 1 1 1.8 0V4H18a3 3 0 0 1 3 3v1.5H3V7a3 3 0 0 1 3-3h1.1v-.9A.9.9 0 0 1 8 2.2ZM3 10.3h18V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" />,
  receivables: cut => <><circle cx="12" cy="12" r="9.5" />{line('M12 7v5l3.2 2', cut)}</>,
  incomeExpense: cut => <><path d="M5 2.5h14a1 1 0 0 1 1 1v17.6a.6.6 0 0 1-.9.5L17 20.3l-2.2 1.3a.6.6 0 0 1-.6 0L12 20.3l-2.2 1.3a.6.6 0 0 1-.6 0L7 20.3l-2.1 1.3a.6.6 0 0 1-.9-.5V3.5a1 1 0 0 1 1-1Z" />{line('M8.5 8h7M8.5 12h7M8.5 16h4', cut)}</>,
  invoice: cut => <><path d={DOC} />{line('M9 13h6M9 16.5h4', cut)}</>,
  vault: () => <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2 2 0 0 1 1.4.6L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />,
  wht50: cut => <><path d={DOC} />{line('m9 14.5 2 2 4-4', cut, 1.9)}</>,
  feedback: () => <path d="M5 3.5h14A2.5 2.5 0 0 1 21.5 6v9a2.5 2.5 0 0 1-2.5 2.5H9.6l-4 3.3A1 1 0 0 1 4 20v-2.6A2.5 2.5 0 0 1 2.5 15V6A2.5 2.5 0 0 1 5 3.5Z" />,
  plans: cut => <><path d="M6.2 2.6a1 1 0 0 1 .8-.4h10a1 1 0 0 1 .8.4l2.9 3.9a1 1 0 0 1 .3.7V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.2a1 1 0 0 1 .2-.6Z" />{line('M3.6 6.6h16.8M16 10a4 4 0 0 1-8 0', cut)}</>,
  settings: cut => <><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /><circle cx="12" cy="12" r="3" fill={cut} /></>,
  split: cut => <><circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5.2" fill="none" stroke={cut} strokeWidth={1.7} /><circle cx="12" cy="12" r="1.6" fill={cut} /></>,
  tax: cut => <><rect x="4" y="2.5" width="16" height="19" rx="2.5" />{line('M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01', cut, 2.2)}</>,
  groups: () => <><circle cx="9" cy="7.5" r="3.6" /><path d="M2.5 19.6c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6c.1.5-.3.9-.8.9H3.3c-.5 0-.9-.4-.8-.9Z" /><circle cx="16.8" cy="8.2" r="2.8" /><path d="M16.5 13.2c2.7.1 4.6 2.2 5 5.2.1.5-.3.9-.8.9h-3.6c.1-2.2-.2-4.3-.6-6.1Z" /></>,
  assistant: () => <><path d="M10.2 3.6a.8.8 0 0 1 1.5 0l1.4 3.9a3 3 0 0 0 1.8 1.8l3.9 1.4a.8.8 0 0 1 0 1.5l-3.9 1.4a3 3 0 0 0-1.8 1.8l-1.4 3.9a.8.8 0 0 1-1.5 0l-1.4-3.9a3 3 0 0 0-1.8-1.8l-3.9-1.4a.8.8 0 0 1 0-1.5l3.9-1.4a3 3 0 0 0 1.8-1.8Z" /><path d="M18.6 2.6a.5.5 0 0 1 .9 0l.5 1.3a1 1 0 0 0 .6.6l1.3.5a.5.5 0 0 1 0 .9l-1.3.5a1 1 0 0 0-.6.6l-.5 1.3a.5.5 0 0 1-.9 0l-.5-1.3a1 1 0 0 0-.6-.6l-1.3-.5a.5.5 0 0 1 0-.9l1.3-.5a1 1 0 0 0 .6-.6Z" /></>,
  adminDashboard: () => <><rect x="3" y="3" width="8" height="10" rx="2" /><rect x="13" y="3" width="8" height="6" rx="2" /><rect x="13" y="11" width="8" height="10" rx="2" /><rect x="3" y="15" width="8" height="6" rx="2" /></>,
};

/** The sidebar icon for a page: the lucide outline normally, the filled glyph when it is the open page. */
export function NavGlyph({ tab, active, outline: Outline, className }: {
  tab: string; active: boolean; outline: React.ComponentType<{ className?: string; strokeWidth?: number }>; className?: string;
}) {
  // เลขากระรอก's icon is the squirrel itself (owner, 2026-10-23), the official drawing at icon size.
  if (tab === 'assistant') {
    return <span className={`inline-grid place-items-center ${className || ''}`} aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={22} viewBox="12 8 76 76" /></span>;
  }
  const filled = active ? FILLED[tab] : undefined;
  if (!filled) return <Outline className={className} strokeWidth={active ? 2.3 : 1.7} />;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {filled(CUT)}
    </svg>
  );
}
