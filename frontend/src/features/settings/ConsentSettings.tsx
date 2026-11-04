import React from 'react';
import { tr } from '../../i18n/tr';
import { dateLocale } from '../../utils';
import { useConsents, withdrawConsent } from '../../services/consent';
import type { ConsentKey } from '../../../../shared/consents';
import { Panel } from './SettingsParts';

// Settings › ความยินยอม (owner, 2026-11-05): what the account agreed to and when, and the way to take each back. The terms
// end by deleting the account; เลขากระรอก is withdrawn here; LINE by disconnecting it (which also stops its notices).

const when = (at?: string) => {
  if (!at) return '';
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function Row({ title, desc, state, on, children }: { title: string; desc: string; state: string; on: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start" data-testid="consent-row">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-[1.5] text-brand-text">{title}</p>
        <p className="mt-0.5 text-[13px] leading-[1.6] text-brand-muted">{desc}</p>
        <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium leading-[1.5] ${on ? 'text-[#0A8F3F] dark:text-[#4ADE80]' : 'text-brand-muted'}`}>
          <span className={`h-[7px] w-[7px] rounded-full ${on ? 'bg-current' : 'bg-[#B8B2AB]'}`} aria-hidden="true" />{state}
        </p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const button = 'inline-flex min-h-10 items-center rounded-[10px] border border-brand-border px-3.5 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer disabled:opacity-50';

export function ConsentSettings({ account, lineConnected, lineAccess, onOpenLine, onOpenAssistant, onOpenSecurity, triggerConfirm, triggerAlert }: {
  account: string; lineConnected: boolean; lineAccess: boolean; onOpenLine: () => void; onOpenAssistant?: () => void; onOpenSecurity: () => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void) => void; triggerAlert: (title: string, message: string) => void;
}) {
  const consents = useConsents(account);
  const [busy, setBusy] = React.useState(false);
  const agreed = (key: ConsentKey) => consents.given(key) === true;
  const at = (key: ConsentKey) => when(consents.record(key)?.at);
  const withdrawAi = () => triggerConfirm(
    tr("ถอนความยินยอมการใช้เลขากระรอก"),
    tr("เลขากระรอกในแอปและใน LINE จะหยุดรับข้อความ เสียง และไฟล์ จนกว่าคุณจะกดยินยอมอีกครั้ง ประวัติแชตยังอยู่ครบ และลบเองได้ที่หน้าเลขากระรอก ต้องการถอนความยินยอมหรือไม่?"),
    async () => {
      setBusy(true);
      try { await withdrawConsent(account, 'ai'); }
      catch (error) { triggerAlert(tr("ถอนความยินยอมไม่สำเร็จ"), (error as Error).message || tr("ลองใหม่อีกครั้งครับ")); }
      finally { setBusy(false); }
    },
  );
  return (
    <>
      <Panel>
        <div className="divide-y divide-brand-border">
          <Row title={tr("ข้อกำหนดการใช้งานและนโยบายความเป็นส่วนตัว")}
            desc={tr("รวมถึงการยืนยันว่าข้อมูลลูกค้าที่คุณบันทึกเป็นข้อมูลที่ลูกค้าให้มา และใช้เพื่องานของลูกค้ารายนั้นเท่านั้น")}
            state={agreed('terms') ? (at('terms') ? tr("ยอมรับแล้ว · {0}", at('terms')) : tr("ยอมรับแล้ว")) : tr("ยังไม่ได้ยอมรับ")} on={agreed('terms')}>
            <a href="/terms" target="_blank" rel="noopener" className={button}>{tr("ข้อกำหนดการใช้งาน")}</a>
            <a href="/privacy" target="_blank" rel="noopener" className={button}>{tr("นโยบายความเป็นส่วนตัว")}</a>
          </Row>
          <Row title={tr("เลขากระรอก")}
            desc={tr("ให้เลขาช่วยตอบ บันทึก และเตรียมเอกสาร ทั้งในแอปและ LINE ข้อมูลใช้เพื่อตอบคุณเท่านั้น ไม่ถูกนำไปฝึก AI และคำตอบไม่ใช่คำปรึกษาทางภาษี บัญชี หรือกฎหมาย")}
            state={agreed('ai') ? (at('ai') ? tr("ยินยอมแล้ว · {0}", at('ai')) : tr("ยินยอมแล้ว")) : tr("ยังไม่ได้ยินยอม")} on={agreed('ai')}>
            {agreed('ai')
              ? <button type="button" className={button} onClick={withdrawAi} disabled={busy} data-testid="consent-withdraw-ai">{tr("ถอนความยินยอม")}</button>
              : onOpenAssistant && <button type="button" className={button} onClick={onOpenAssistant}>{tr("เปิดเลขากระรอกเพื่อยินยอม")}</button>}
          </Row>
          {(lineAccess || lineConnected) && (
            <Row title="LINE" desc={tr("รับแจ้งเตือนงาน ชื่อลูกค้า และยอดเงินทาง LINE ระบบใช้รหัสผู้ใช้ LINE เพื่อส่งข้อความถึงคุณคนเดียว")}
              state={lineConnected ? (at('line') ? tr("เชื่อมต่ออยู่ · ยินยอมเมื่อ {0}", at('line')) : tr("เชื่อมต่ออยู่")) : tr("ยังไม่ได้เชื่อมต่อ")} on={lineConnected}>
              <button type="button" className={button} onClick={onOpenLine}>{lineConnected ? tr("ยกเลิกการเชื่อมต่อ") : tr("ไปที่หน้า LINE")}</button>
            </Row>
          )}
        </div>
      </Panel>
      <p className="px-1 text-[12.5px] leading-[1.6] text-brand-muted">
        {tr("ถอนความยินยอมได้ทุกเมื่อ มีผลตั้งแต่ตอนที่ถอน หากต้องการเลิกใช้และลบข้อมูลทั้งหมด ทำได้ที่")}{' '}
        <button type="button" onClick={onOpenSecurity} className="font-medium text-[#C24A16] underline underline-offset-2 dark:text-[#FFA473] cursor-pointer">{tr("บัญชี & ความปลอดภัย")}</button>
      </p>
    </>
  );
}
