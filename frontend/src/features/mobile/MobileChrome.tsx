import React from 'react';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { Mascot } from '../../components/mascot/Mascot';
import { KsIcon, SquirrelAdd, type KsIconName } from './icons';
import { mobileBottomTabs, type MobileBottomTab, type MobileTab } from './mobileNavigation';
import { MobilePageHero } from './MobilePageHero';
// The one place the mobile stylesheet is loaded (App imports this file), so page components that
// unit tests import for their pure functions never pull a .css file into Node.
import './mobile.css';

import { tr, T } from '../../i18n/tr';
// The app's shell on phones (see useMobileLayout): a top bar, a bottom bar with the squirrel
// add button in the middle, and the tools screen behind "เมนู". Layout and styling follow the
// owner's design file; every button calls the app's existing handlers, and the tools list is built
// from the same permission-filtered list the desktop sidebar uses, so no feature is dropped.

export type { MobileTab } from './mobileNavigation';

export type MobileGreeting = { name: string; avatarUrl?: string; onOpen: () => void };

export function MobileHeader({ dark, onToggleTheme, alerts, onOpenAlerts, onHome, greeting, hero = false, alertsAccess = false }: {
  dark: boolean; onToggleTheme: () => void; alerts: number; onOpenAlerts: () => void; onHome: () => void;
  /** The overview: the bar takes the header's terracotta and adds a greeting under the logo. */
  greeting?: MobileGreeting;
  /** A page with its own terracotta header under the bar (งาน): the bar takes that colour, without a greeting. */
  hero?: boolean;
  /** The bell (due-payment reminders) is open to this account. */
  alertsAccess?: boolean;
}) {
  const themeLabel = dark ? tr("เปลี่ยนเป็นโหมดสว่าง") : tr("เปลี่ยนเป็นโหมดมืด");
  const theme = (
    <button key="theme" type="button" className="ksm-iconbtn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel} aria-pressed={dark}>
      <KsIcon name={dark ? 'moon' : 'sun'} />
    </button>
  );
  const bell = alertsAccess && (
    <button key="bell" type="button" className="ksm-iconbtn is-notify" onClick={onOpenAlerts}
      aria-label={alerts ? tr("การแจ้งเตือน: ถึงเวลาตามเงิน {0} รายการ", alerts) : tr("การแจ้งเตือน")}>
      <KsIcon name="bell" />
      {alerts > 0 && <i className="ksm-dot" aria-hidden="true" />}
    </button>
  );
  const isHero = Boolean(greeting) || hero;
  return (
    <header className={`ksm ksm-header${isHero ? ' is-hero' : ''}`}>
      {/* The overview header (owner's reference, 2026-10-20): the original mascot as a faint white shape behind the greeting. */}
      {greeting && <span className="ksm-header-mascot" aria-hidden="true"><Mascot mood="happy" action="hold-baht" animated={false} size={124} /></span>}
      <div className="ksm-top">
        <button type="button" className="ksm-brand" onClick={onHome} aria-label={tr("กระรอกตุนเงิน ไปหน้าภาพรวม")}>
          <span className="ksm-brand-mark"><BrandLogo size={greeting ? 34 : 36} inverse={isHero} /></span>
          <span className="ksm-wordmark" aria-hidden="true">{tr("กระรอก")}<span>{tr("ตุนเงิน")}</span></span>
        </button>
        <span className="ksm-spacer" />
        {/* The terracotta bar puts the bell first, as in the overview's reference; other pages keep theme, then bell. */}
        {isHero ? [bell, theme] : [theme, bell]}
      </div>
      {greeting && (
        <button type="button" className="ksm-hello" onClick={greeting.onOpen} aria-label={tr("โปรไฟล์ของ {0}", greeting.name)}>
          <span className="ksm-hello-text"><small>{tr("สวัสดีอีกครั้ง")}</small><b>Hello, {greeting.name}</b></span>
          <span className="ksm-hello-avatar">{greeting.avatarUrl ? <img src={greeting.avatarUrl} alt="" /> : <BrandLogo size={44} />}</span>
        </button>
      )}
    </header>
  );
}

export function MobileBottomNav({ current, onSelect, onAddJob, calendarAccess = false }: { current: MobileTab | null; onSelect: (tab: MobileTab) => void; onAddJob: () => void; calendarAccess?: boolean }) {
  // The five slots come from mobileNavigation.ts; the fourth is ปฏิทิน wherever the launch policy opens it.
  const { left, right } = mobileBottomTabs(calendarAccess);
  const item = (tab: MobileBottomTab) => (
    <button key={tab.key} type="button" className="ksm-nav-item" aria-current={current === tab.key ? 'page' : undefined} onClick={() => onSelect(tab.key)}>
      <span className="ksm-nav-icon"><KsIcon name={tab.icon} size={23} filled={current === tab.key} /></span>
      <span>{tab.label}</span>
    </button>
  );
  return (
    <>
    <div className="ksm ksm-nav-fade" aria-hidden="true" />
    <nav className="ksm ksm-nav lg-glass" aria-label={tr("เมนูหลัก")}>
      {left.map(item)}
      {/* Opens the add-job form straight away: no second menu to choose from. */}
      <button type="button" className="ksm-nav-item ksm-nav-add" onClick={onAddJob} aria-label={tr("เพิ่มงาน")}>
        <span className="ksm-squirrel"><SquirrelAdd /></span>
        <span>{tr("เพิ่มงาน")}</span>
      </button>
      {right.map(item)}
    </nav>
    </>
  );
}

/** One entry. `value` shows on the right (e.g. the current language); `soon` marks something not open yet: shown, not tappable. */
export type MobileTool = { key: string; title: string; description: string; icon: KsIconName; search?: string; value?: string; soon?: boolean; onOpen: () => void;
  /** A brand mark drawn instead of the icon (the LINE logo). */
  mark?: React.ReactNode };
/** A section of the menu. A section with a single entry opens it straight away instead of expanding. */
export type MobileToolGroup = { id: string; number?: string; name: string; sub: string; icon: KsIconName; items: MobileTool[]; mark?: React.ReactNode };

const SOON = T("เร็ว ๆ นี้");

// iOS Settings-style tiles (owner, 2026-10-23): a white symbol on a coloured rounded square, one
// colour per kind of tool, from the app's own palette.
const TILE: Partial<Record<KsIconName, string>> = {
  wallet: '#E65F2B', expense: '#D64545', document: '#C17817', shield: '#A63F1B', bell: '#E65F2B',
  users: '#E65F2B', sun: '#57524D', moon: '#57524D', globe: '#C17817', settings: '#8E8A85',
  chat: '#18A66A', logout: '#D64545', target: '#18A66A', chart: '#7A5C43', receipt: '#A63F1B',
  folder: '#C17817', grid: '#57524D',
};
const tileStyle = (icon: KsIconName) => ({ '--tile': TILE[icon] || '#8E8A85' }) as React.CSSProperties;

export function MobileMenuPage({ groups, account, workspace }: {
  groups: MobileToolGroup[];
  /** `plan` shows as a pill on the profile box (FREE, PRO, the trial). */
  account: { name: string; detail: string; plan?: string; avatarUrl?: string; onOpen: () => void };
  workspace?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const q = query.trim().toLocaleLowerCase();
  const found = q ? groups.flatMap(group => group.items.map(tool => ({ group, tool }))).filter(({ group, tool }) => `${group.name} ${tool.title} ${tool.description} ${tool.search || ''}`.toLocaleLowerCase().includes(q)) : [];
  const trailing = (tool: MobileTool) => (tool.soon
    ? <span className="ksm-soon">{tr(SOON)}</span>
    : <>{tool.value && <span className="ksm-row-value">{tool.value}</span>}<KsIcon name="chevron" size={16} /></>);
  const row = (tool: MobileTool, description = tool.description) => (
    <button key={tool.key} type="button" className={`ksm-row${tool.soon ? ' is-soon' : ''}`} onClick={tool.soon ? undefined : tool.onOpen}
      aria-disabled={tool.soon || undefined} aria-label={tool.soon ? `${tool.title} · ${tr(SOON)}` : undefined}>
      {tool.mark ? <span className="ksm-row-icon is-mark">{tool.mark}</span> : <span className="ksm-row-icon is-tile" style={tileStyle(tool.icon)}><KsIcon name={tool.icon} size={18} /></span>}
      <span className="ksm-grow"><b>{tool.title}</b>{description && <p>{description}</p>}</span>
      {trailing(tool)}
    </button>
  );
  const heading = (group: MobileToolGroup, sub = group.sub) => (
    <>
      {group.mark ? <span className="ksm-group-symbol is-mark">{group.mark}</span> : <span className="ksm-group-symbol is-tile" style={tileStyle(group.icon)}><KsIcon name={group.icon} size={20} /></span>}
      <span className="ksm-grow">{group.number && <i className="ksm-group-number">{group.number}</i>}<b>{group.name}</b><small>{sub}</small></span>
    </>
  );
  const layerRef = React.useRef<HTMLDivElement>(null);
  const getLayer = React.useCallback(() => layerRef.current, []);
  return (
    <div className="ksm ksm-layer" role="region" aria-label={tr("เครื่องมือทั้งหมด")} ref={layerRef}>
      <section className="ksm-page">
        {/* The same header as every page (owner, 2026-10-20): the profile box sits on the terracotta and
            fades away with the title as the menu scrolls; a soft strip stays pinned under the bar. */}
        <MobilePageHero title={tr("เมนู")} scroller={getLayer}>
          <div className="ksm-minisum">
            <button type="button" className="ksm-hero-inner ksm-account" onClick={account.onOpen}>
              <span className="ksm-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <BrandLogo size={34} />}</span>
              <span className="ksm-grow"><b>{account.name}</b><small>{account.detail}</small></span>
              {account.plan && <span className="ksm-plan-pill">{account.plan}</span>}
              <KsIcon name="chevron" size={17} />
            </button>
          </div>
        </MobilePageHero>
        <div className="ksm-search">
          <KsIcon name="search" />
          <input type="text" inputMode="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("ค้นหา เช่น รายจ่าย ปฏิทิน เอกสาร")} aria-label={tr("ค้นหาเครื่องมือ")} enterKeyHint="search" />
          {query && <button type="button" className="ksm-search-clear" onClick={() => setQuery('')} aria-label={tr("ล้างคำค้น")}><KsIcon name="close" size={17} /></button>}
        </div>
        <div aria-live="polite">
          {q ? (
            <>
              <p className="ksm-count">{tr("พบ {0} เครื่องมือ", found.length)}</p>
              <div className="ksm-panel">
                {found.length ? found.map(({ group, tool }) => row(tool, `${group.name} · ${tool.description}`)) : <p className="ksm-empty">{tr("ไม่พบเครื่องมือ ลองคำว่า รายจ่าย ปฏิทิน หรือเอกสาร")}</p>}
              </div>
            </>
          ) : (
            <div className="ksm-groups">
              {groups.map(group => {
                if (group.items.length === 1) {
                  const tool = group.items[0];
                  return (
                    <button key={group.id} type="button" className={`ksm-group ksm-group-direct${tool.soon ? ' is-soon' : ''}`} onClick={tool.soon ? undefined : tool.onOpen}
                      aria-disabled={tool.soon || undefined} aria-label={`${group.name}${tool.soon ? ` · ${tr(SOON)}` : ''}`}>
                      {/* The entry's own description: it says what this account can do there (e.g. no quotations in phase one). */}
                      {heading(group, tool.description || group.sub)}
                      {tool.soon ? <span className="ksm-soon">{tr(SOON)}</span> : <>{tool.value && <span className="ksm-row-value">{tool.value}</span>}<span className="ksm-group-chevron"><KsIcon name="chevron" size={17} /></span></>}
                    </button>
                  );
                }
                return (
                  <details key={group.id} className="ksm-group" open={open === group.id}
                    onToggle={event => { const isOpen = (event.currentTarget as HTMLDetailsElement).open; setOpen(current => (isOpen ? group.id : current === group.id ? null : current)); }}>
                    <summary>
                      {heading(group)}
                      <span className="ksm-group-chevron"><KsIcon name="chevron" size={17} /></span>
                    </summary>
                    <div className="ksm-group-body">{group.items.map(tool => row(tool))}</div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
        {workspace && <div className="ksm-workspace">{workspace}</div>}
      </section>
    </div>
  );
}
