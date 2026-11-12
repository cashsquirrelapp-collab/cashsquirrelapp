import React from 'react';
import { LAB_FEATURES, type LabFeatureId, type LabState } from '../../../../shared/labs';
import { tr } from '../../i18n/tr';
import { setLabFeature } from '../../services/labs';
import { Note, RowText, Switch, rowShell } from './SettingsParts';
import { uiSurface } from '../../components/ui/uiStyles';

// Settings › ฟีเจอร์ทดลอง (shared/labs.ts; owner, 2026-11-12). Only testers reach this page. Each new feature of the
// sheet-assistant direction is listed here; a built one has a switch the tester turns on for itself, one still being built
// says so and its switch stays locked.

export function LabsSettings({ account, labs, triggerAlert }: {
  account: string; labs: LabState; triggerAlert: (title: string, message: string) => void;
}) {
  const [busy, setBusy] = React.useState<LabFeatureId | null>(null);
  const toggle = async (id: LabFeatureId, on: boolean) => {
    setBusy(id);
    try { await setLabFeature(account, id, on); }
    catch (error) { triggerAlert(tr("เปลี่ยนฟีเจอร์ทดลองไม่สำเร็จ"), (error as Error).message || tr("กรุณาลองใหม่อีกครั้ง")); }
    finally { setBusy(null); }
  };
  return (
    <>
      <Note>{tr("ฟีเจอร์ในหน้านี้ยังอยู่ระหว่างทดลอง เห็นเฉพาะบัญชีทดสอบ ลูกค้าทั่วไปไม่เห็น เปิดหรือปิดได้ทุกเมื่อ ข้อมูลเดิมในแอปไม่เปลี่ยน")}</Note>
      <div className={`${uiSurface} divide-y divide-brand-border overflow-hidden`} data-testid="labs-list">
        {LAB_FEATURES.map(feature => {
          const on = labs.on.includes(feature.id);
          return (
            <div key={feature.id} className={rowShell} data-testid={`lab-${feature.id}`}>
              <RowText title={tr(feature.th)} desc={tr(feature.desc)} />
              {feature.ready
                ? <Switch on={on} label={tr(feature.th)} disabled={busy !== null} onClick={() => void toggle(feature.id, !on)} />
                : <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-faint px-2.5 py-1 text-[12px] font-medium leading-[1.5] text-brand-muted">{tr("กำลังสร้าง")}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
