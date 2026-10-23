import React, { useEffect, useState } from 'react';
import { Home, Briefcase, Plus, CalendarDays, Grid2X2, Moon, Sun, Bell, User, Search, ChevronRight, X } from 'lucide-react';
import { BrandLockup } from '../../components/brand/BrandLogo';

interface Props {
  fullFeatureAccess?: boolean;
  activeTab: string;
  darkMode: boolean;
  toggleTheme: () => void;
  navigate: (tab: string) => void;
  onAdd: () => void;
  toolsOpen: boolean;
  setToolsOpen: (open: boolean) => void;
  hasNotices: boolean;
  profileOpen: boolean;
  toggleProfile: () => void;
  profileMenu: React.ReactNode;
  workspacePicker: React.ReactNode;
  items: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

export default function PhoneChrome({ activeTab, darkMode, toggleTheme, navigate, onAdd, toolsOpen, setToolsOpen, hasNotices, profileOpen, toggleProfile, profileMenu, workspacePicker, items, fullFeatureAccess = false }: Props) {
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!toolsOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setToolsOpen(false); document.getElementById('phone-tools-button')?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [toolsOpen, setToolsOpen]);
  const go = (tab: string) => { setToolsOpen(false); navigate(tab); };
  const tools = items.filter(item => !['dashboard', 'jobs', 'calendar'].includes(item.key) && (fullFeatureAccess || ['incomeExpense', 'invoice', 'feedback'].includes(item.key)));
  return <>
    <header className="phone-top">
      <button type="button" className="phone-brand" aria-label="กลับหน้าภาพรวม" onClick={() => go('dashboard')}><BrandLockup size={31} /></button>
      <div className="phone-top-actions">
        <button type="button" className="phone-icon" aria-label={darkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'} onClick={toggleTheme}>{darkMode ? <Sun /> : <Moon />}</button>
        {fullFeatureAccess && <button type="button" className="phone-icon" aria-label="การแจ้งเตือน" onClick={() => go('receivables')}><Bell />{hasNotices && <i className="phone-notice-dot" />}</button>}
        <div className="relative">
          <button type="button" className="phone-icon" aria-label="เปิดเมนูโปรไฟล์" aria-expanded={profileOpen} onClick={toggleProfile}><User /></button>
          {profileMenu}
        </div>
      </div>
    </header>
    {toolsOpen && <section className="phone-tools" aria-labelledby="phone-tools-title">
      <div className="phone-page-heading"><div><h1 id="phone-tools-title">เครื่องมือ</h1><p>เลือกสิ่งที่ต้องการจัดการ</p></div><button type="button" className="phone-icon" aria-label="ปิดเครื่องมือ" onClick={() => setToolsOpen(false)}><X /></button></div>
      {workspacePicker && <div className="phone-workspace">{workspacePicker}</div>}
      <label className="phone-search"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเครื่องมือ" aria-label="ค้นหาเครื่องมือ" /></label>
      <div className="phone-tool-list">{tools.filter(item => item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => go(key)}><span className="phone-tool-icon"><Icon /></span><span>{label}</span><ChevronRight /></button>)}</div>
      {search && !tools.some(item => item.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="phone-empty">ไม่พบเครื่องมือที่ค้นหา</p>}
    </section>}
    <nav className="phone-nav" aria-label="เมนูหลักมือถือ">
      <button type="button" aria-current={!toolsOpen && activeTab === 'dashboard' ? 'page' : undefined} onClick={() => go('dashboard')}><Home /><span>ภาพรวม</span></button>
      <button type="button" aria-current={!toolsOpen && activeTab === 'jobs' ? 'page' : undefined} onClick={() => go('jobs')}><Briefcase /><span>งาน</span></button>
      <button type="button" className="phone-nav-add" onClick={() => { setToolsOpen(false); onAdd(); }}><span className="phone-add-symbol"><Plus /></span><span>เพิ่มงาน</span></button>
      <button type="button" aria-current={!toolsOpen && activeTab === 'calendar' ? 'page' : undefined} onClick={() => go('calendar')}><CalendarDays /><span>ปฏิทิน</span></button>
      <button type="button" id="phone-tools-button" aria-expanded={toolsOpen} aria-current={toolsOpen ? 'page' : undefined} onClick={() => { setSearch(''); setToolsOpen(!toolsOpen); }}><Grid2X2 /><span>เครื่องมือ</span></button>
    </nav>
  </>;
}
