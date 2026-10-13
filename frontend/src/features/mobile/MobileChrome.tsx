import React from 'react';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { KsIcon, SquirrelAdd, type KsIconName } from './icons';
// The one place the mobile stylesheet is loaded (App imports this file), so page components that
// unit tests import for their pure functions never pull a .css file into Node.
import './mobile.css';

// The app's shell on phones (see useMobileLayout): a top bar, a bottom bar with the squirrel
// add button in the middle, and the tools screen behind "เมนู". Layout and styling follow the
// owner's design file; every button calls the app's existing handlers, and the tools list is built
// from the same permission-filtered list the desktop sidebar uses, so no feature is dropped.

export type MobileTab = 'dashboard' | 'jobs' | 'receivables' | 'menu';

export function MobileHeader({ dark, onToggleTheme, alerts, onOpenAlerts, onHome }: {
  dark: boolean; onToggleTheme: () => void; alerts: number; onOpenAlerts: () => void; onHome: () => void;
}) {
  const themeLabel = dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด';
  return (
    <header className="ksm ksm-header">
      <div className="ksm-top">
        <button type="button" className="ksm-brand" onClick={onHome} aria-label="กระรอกตุนเงิน ไปหน้าภาพรวม">
          <BrandLogo size={36} />
          <span className="ksm-wordmark" aria-hidden="true">กระรอก<span>ตุนเงิน</span></span>
        </button>
        <span className="ksm-spacer" />
        <button type="button" className="ksm-iconbtn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel} aria-pressed={dark}>
          <KsIcon name={dark ? 'moon' : 'sun'} />
        </button>
        <button type="button" className="ksm-iconbtn is-notify" onClick={onOpenAlerts}
          aria-label={alerts ? `การแจ้งเตือน: ถึงเวลาตามเงิน ${alerts} รายการ` : 'การแจ้งเตือน'}>
          <KsIcon name="bell" />
          {alerts > 0 && <i className="ksm-dot" aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

const TABS: { key: MobileTab; label: string; icon: KsIconName }[] = [
  { key: 'dashboard', label: 'ภาพรวม', icon: 'home' },
  { key: 'jobs', label: 'งาน', icon: 'briefcase' },
  { key: 'receivables', label: 'รอรับ', icon: 'wallet' },
  { key: 'menu', label: 'เมนู', icon: 'grid' },
];

export function MobileBottomNav({ current, onSelect, onAddJob }: { current: MobileTab | null; onSelect: (tab: MobileTab) => void; onAddJob: () => void }) {
  const item = (tab: typeof TABS[number]) => (
    <button key={tab.key} type="button" className="ksm-nav-item" aria-current={current === tab.key ? 'page' : undefined} onClick={() => onSelect(tab.key)}>
      <span className="ksm-nav-icon"><KsIcon name={tab.icon} size={23} /></span>
      <span>{tab.label}</span>
    </button>
  );
  return (
    <nav className="ksm ksm-nav" aria-label="เมนูหลัก">
      {TABS.slice(0, 2).map(item)}
      {/* Opens the add-job form straight away: no second menu to choose from. */}
      <button type="button" className="ksm-nav-item ksm-nav-add" onClick={onAddJob} aria-label="เพิ่มงาน">
        <span className="ksm-squirrel"><SquirrelAdd /></span>
        <span>เพิ่มงาน</span>
      </button>
      {TABS.slice(2).map(item)}
    </nav>
  );
}

export type MobileTool = { key: string; title: string; description: string; icon: KsIconName; search?: string; onOpen: () => void };
export type MobileToolGroup = { id: string; name: string; sub: string; icon: KsIconName; items: MobileTool[] };

export function MobileMenuPage({ groups, account, workspace, onSignOut }: {
  groups: MobileToolGroup[];
  account: { name: string; detail: string; avatarUrl?: string; onOpen: () => void };
  workspace?: React.ReactNode;
  onSignOut?: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState<string | null>(null);
  const q = query.trim().toLocaleLowerCase();
  const found = q ? groups.flatMap(group => group.items.map(tool => ({ group, tool }))).filter(({ group, tool }) => `${group.name} ${tool.title} ${tool.description} ${tool.search || ''}`.toLocaleLowerCase().includes(q)) : [];
  const row = (tool: MobileTool, description = tool.description) => (
    <button key={tool.key} type="button" className="ksm-row" onClick={tool.onOpen}>
      <span className="ksm-row-icon"><KsIcon name={tool.icon} size={19} /></span>
      <span className="ksm-grow"><b>{tool.title}</b><p>{description}</p></span>
      <KsIcon name="chevron" size={16} />
    </button>
  );
  return (
    <div className="ksm ksm-layer" role="region" aria-label="เครื่องมือทั้งหมด">
      <section className="ksm-page">
        <div className="ksm-title"><h2>เครื่องมือทั้งหมด</h2><p>เลือกหมวดที่ใช้ แล้วค่อยเปิดรายละเอียด</p></div>
        <div className="ksm-search">
          <KsIcon name="search" />
          <input type="text" inputMode="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหา เช่น ใบแจ้งหนี้ ภาษี เป้าหมาย" aria-label="ค้นหาเครื่องมือ" enterKeyHint="search" />
          {query && <button type="button" className="ksm-search-clear" onClick={() => setQuery('')} aria-label="ล้างคำค้น"><KsIcon name="close" size={17} /></button>}
        </div>
        <div aria-live="polite">
          {q ? (
            <>
              <p className="ksm-count">พบ {found.length} เครื่องมือ</p>
              <div className="ksm-panel">
                {found.length ? found.map(({ group, tool }) => row(tool, `${group.name} · ${tool.description}`)) : <p className="ksm-empty">ไม่พบเครื่องมือ ลองคำว่า เอกสาร ภาษี หรือเป้าหมาย</p>}
              </div>
            </>
          ) : (
            <div className="ksm-groups">
              {groups.map(group => (
                <details key={group.id} className="ksm-group" open={open === group.id}
                  onToggle={event => { const isOpen = (event.currentTarget as HTMLDetailsElement).open; setOpen(current => (isOpen ? group.id : current === group.id ? null : current)); }}>
                  <summary>
                    <span className="ksm-group-symbol"><KsIcon name={group.icon} size={20} /></span>
                    <span className="ksm-grow"><b>{group.name}</b><small>{group.sub}</small></span>
                    <span className="ksm-group-chevron"><KsIcon name="chevron" size={17} /></span>
                  </summary>
                  <div className="ksm-group-body">{group.items.map(tool => row(tool))}</div>
                </details>
              ))}
            </div>
          )}
        </div>
        {workspace && <div className="ksm-workspace">{workspace}</div>}
        <button type="button" className="ksm-account" onClick={account.onOpen}>
          <span className="ksm-avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : account.name.slice(0, 2)}</span>
          <span className="ksm-grow"><b>{account.name}</b><small>{account.detail}</small></span>
          <KsIcon name="edit" size={17} />
        </button>
        {onSignOut && (
          <div className="ksm-panel">
            <button type="button" className="ksm-row" onClick={onSignOut}>
              <span className="ksm-row-icon"><KsIcon name="logout" size={19} /></span>
              <span className="ksm-grow"><b>ออกจากระบบ</b></span>
            </button>
          </div>
        )}
        <p className="ksm-note">ใช้ได้บนมือถือทุกหมวด · ไม่ต้องเปลี่ยนไปใช้คอม</p>
      </section>
    </div>
  );
}
