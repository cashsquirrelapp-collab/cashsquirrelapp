import React from 'react';
import { Choice } from './SettingsParts';
import { uiInput } from '../../components/ui/uiStyles';
import { tr } from '../../i18n/tr';
import { isClockTime, scheduleIsDark, type ThemePreference } from '../../../../shared/themeSchedule';

/**
 * The display sheet's choices (owner, 2026-10-30: "ปรับได้เอง อัตโนมัติ ... กำหนดว่า 6 โมงเย็นปรับ ... หรือปรับด้วยมือ"):
 * automatic by the clock with the two times the user sets, always light, or always dark. Any change here also counts as
 * the new-account tip's answer (it is never shown after).
 */
export function ThemeScheduleChoices({ pref, onChange, now = new Date() }: { pref: ThemePreference; onChange: (next: ThemePreference) => void; now?: Date }) {
  const [darkFrom, setDarkFrom] = React.useState(pref.darkFrom);
  const [lightFrom, setLightFrom] = React.useState(pref.lightFrom);
  React.useEffect(() => { setDarkFrom(pref.darkFrom); setLightFrom(pref.lightFrom); }, [pref.darkFrom, pref.lightFrom]);
  const same = darkFrom === lightFrom;
  const save = (next: Partial<ThemePreference>) => onChange({ ...pref, ...next, asked: true });
  // A time is kept once it is a whole time and differs from the other one.
  const setTime = (which: 'darkFrom' | 'lightFrom', value: string) => {
    if (which === 'darkFrom') setDarkFrom(value); else setLightFrom(value);
    const next = { darkFrom: which === 'darkFrom' ? value : darkFrom, lightFrom: which === 'lightFrom' ? value : lightFrom };
    if (isClockTime(next.darkFrom) && isClockTime(next.lightFrom) && next.darkFrom !== next.lightFrom) save({ mode: 'auto', ...next });
  };
  const auto = pref.mode === 'auto';
  const darkNow = scheduleIsDark(pref, now);
  return (
    <div role="radiogroup" aria-label={tr("การแสดงผล")} className="space-y-2">
      <Choice selected={auto} label={tr("อัตโนมัติตามเวลา")} hint={tr("มืดตั้งแต่ {0} · สว่างตั้งแต่ {1}", pref.darkFrom, pref.lightFrom)} onClick={() => save({ mode: 'auto' })} />
      {auto && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-brand-border bg-brand-faint/60 p-3.5">
          <label className="block min-w-0" htmlFor="theme-dark-from">
            <span className="mb-1.5 block text-xs font-medium text-brand-muted">{tr("เริ่มโหมดมืด")}</span>
            <input id="theme-dark-from" type="time" value={darkFrom} onChange={(e) => setTime('darkFrom', e.target.value)} className={`${uiInput} w-full font-mono`} />
          </label>
          <label className="block min-w-0" htmlFor="theme-light-from">
            <span className="mb-1.5 block text-xs font-medium text-brand-muted">{tr("กลับเป็นโหมดสว่าง")}</span>
            <input id="theme-light-from" type="time" value={lightFrom} onChange={(e) => setTime('lightFrom', e.target.value)} className={`${uiInput} w-full font-mono`} />
          </label>
          <p className={`col-span-2 text-xs leading-relaxed ${same ? 'text-[#C43A3A] dark:text-[#F19A9A]' : 'text-brand-muted'}`} role={same ? 'alert' : undefined}>
            {same ? tr("เวลาเริ่มโหมดมืดและโหมดสว่างต้องไม่ตรงกัน")
              : darkNow ? tr("ตอนนี้เป็นโหมดมืด · สลับเป็นโหมดสว่างตอน {0}", pref.lightFrom) : tr("ตอนนี้เป็นโหมดสว่าง · สลับเป็นโหมดมืดตอน {0}", pref.darkFrom)}
          </p>
          <p className="col-span-2 text-xs leading-relaxed text-brand-muted">{tr("ปุ่มพระอาทิตย์และพระจันทร์สลับได้ชั่วคราว จนถึงเวลาสลับครั้งถัดไป")}</p>
        </div>
      )}
      <Choice selected={pref.mode === 'light'} label={tr("สว่างตลอด")} hint={tr("ไม่สลับเอง")} onClick={() => save({ mode: 'light' })} />
      <Choice selected={pref.mode === 'dark'} label={tr("มืดตลอด")} hint={tr("ไม่สลับเอง")} onClick={() => save({ mode: 'dark' })} />
      <p className="pt-2 text-xs leading-relaxed text-brand-muted">{tr("ใช้กับทุกเครื่องที่เข้าบัญชีนี้")}</p>
    </div>
  );
}
