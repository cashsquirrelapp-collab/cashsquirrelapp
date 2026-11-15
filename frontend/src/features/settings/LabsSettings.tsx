import React from 'react';
import { LAB_FEATURES, labReleased, type LabFeatureId, type LabState } from '../../../../shared/labs';
import { tr } from '../../i18n/tr';
import { setLabFeature } from '../../services/labs';
import { Note, RowText, Switch, rowShell } from './SettingsParts';
import { uiSurface } from '../../components/ui/uiStyles';

// Settings › Google Sheets และ Excel (shared/labs.ts). The tools released on 2026-11-16 (owner: "ฟีเจอร์ทดลองอ่ะไม่ต้องให้มัน
// เป็นฟีเจอร์ทดลองละ") open from here for every account. Below them, a test account still sees ฟีเจอร์ทดลอง: a built one has a
// switch it turns on for itself, one still being built says so and its switch stays locked.

/** Features that have their own screen once they are on: a เปิด button beside the switch. */
const OPENS: LabFeatureId[] = ['sheets', 'excel', 'filingCalendar', 'templates'];

export function LabsSettings({ account, labs, triggerAlert, onOpen }: {
  account: string; labs: LabState; triggerAlert: (title: string, message: string) => void;
  onOpen?: (id: LabFeatureId) => void;
}) {
  const [busy, setBusy] = React.useState<LabFeatureId | null>(null);
  const toggle = async (id: LabFeatureId, on: boolean) => {
    setBusy(id);
    try { await setLabFeature(account, id, on); }
    catch (error) { triggerAlert(tr("เปลี่ยนฟีเจอร์ทดลองไม่สำเร็จ"), (error as Error).message || tr("กรุณาลองใหม่อีกครั้ง")); }
    finally { setBusy(null); }
  };
  // Released tools: a เปิด button each (no switch; on for everyone). Still being built: test accounts only.
  const tools = LAB_FEATURES.filter(feature => labReleased(feature.id) && OPENS.includes(feature.id));
  const testing = labs.tester ? LAB_FEATURES.filter(feature => !labReleased(feature.id)) : [];
  return (
    <>
      <div className={`${uiSurface} divide-y divide-brand-border overflow-hidden`} data-testid="tools-list">
        {tools.map(feature => (
          <div key={feature.id} className={rowShell} data-testid={`tool-${feature.id}`}>
            <RowText title={tr(feature.th)} desc={tr(feature.desc)} />
            {onOpen && (
              <button type="button" onClick={() => onOpen(feature.id)} data-testid={`lab-open-${feature.id}`}
                className="shrink-0 whitespace-nowrap rounded-full border border-brand-border bg-brand-white px-3.5 py-1.5 text-[13px] font-semibold leading-[1.5] text-brand-text hover:bg-brand-faint">{tr("เปิด")}</button>
            )}
          </div>
        ))}
      </div>
      <Note>{tr("เมื่อเชื่อมชีตแล้ว เลขากระรอกบอกได้ว่าแต่ละคอลัมน์คืออะไร เพิ่มแถวลงชีตเมื่อคุณกดยืนยัน และหน้างานกับหน้ารายจ่ายแสดงรายการจากชีตของคุณ")}</Note>
      {testing.length > 0 && <>
        <h3 className="pt-2 text-[15px] font-semibold leading-[1.5] text-brand-text">{tr("ฟีเจอร์ทดลอง")}</h3>
        <Note>{tr("ฟีเจอร์ในส่วนนี้ยังอยู่ระหว่างทดลอง เห็นเฉพาะบัญชีทดสอบ ลูกค้าทั่วไปไม่เห็น เปิดหรือปิดได้ทุกเมื่อ ข้อมูลเดิมในแอปไม่เปลี่ยน")}</Note>
        <div className={`${uiSurface} divide-y divide-brand-border overflow-hidden`} data-testid="labs-list">
          {testing.map(feature => {
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
      </>}
    </>
  );
}
