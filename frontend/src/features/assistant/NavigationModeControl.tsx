import React from 'react';
import { tr } from '../../i18n/tr';
import { readNavigationMode, saveNavigationMode, type NavigationMode } from './assistantNavigation';

const EVENT = 'krarok:assistant-navigation-mode';
export function useNavigationMode(accountId?: string) {
  const [saved, setSaved] = React.useState(() => ({ accountId, value: readNavigationMode(accountId) }));
  React.useEffect(() => {
    const refresh = () => setSaved({ accountId, value: readNavigationMode(accountId) });
    refresh(); window.addEventListener(EVENT, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [accountId]);
  const mode = saved.accountId === accountId ? saved.value : 'manual';
  const change = (value: NavigationMode) => {
    saveNavigationMode(accountId, value); setSaved({ accountId, value }); window.dispatchEvent(new Event(EVENT));
  };
  return [mode, change] as const;
}

export function NavigationModeControl({ mode, onChange }: { mode: NavigationMode; onChange: (mode: NavigationMode) => void }) {
  return <label className="asx-navigation-mode"><span>{tr('เปิดหน้าที่เกี่ยวข้อง')}</span>
    <select aria-label={tr('วิธีเปิดหน้าจากเลขากระรอก')} value={mode} onChange={event => onChange(event.target.value === 'auto' ? 'auto' : 'manual')}>
      <option value="manual">{tr('กดเปิดเอง')}</option><option value="auto">{tr('พาไปอัตโนมัติ')}</option>
    </select>
  </label>;
}
