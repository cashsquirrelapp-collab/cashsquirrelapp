import React from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { KsIcon, type KsIconName } from './icons';

// "ภาพรวม" on phones, laid out as in the owner's design file. It only draws: every figure and
// every handler comes from DashboardTab, so the numbers are the same ones the desktop shows.

/** The design's bottom sheet: grip, title, close button, scrolling content. */
export function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = React.useId();
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="ksm">
      <div className="ksm-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="ksm-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ksm-sheet-grip" aria-hidden="true" />
        <header className="ksm-sheet-header">
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>
          <button type="button" className="ksm-sheet-close" onClick={onClose} aria-label="ปิดหน้าต่าง"><KsIcon name="close" /></button>
        </header>
        <div className="ksm-sheet-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export type MobileHomeNext = { day: number; month: string; caption: string; title: string; onOpen: () => void };

export interface MobileHomeProps {
  greeting: string;
  monthPicker: React.ReactNode;
  /** The month's work value: the large figure at the top of the card. */
  workLabel: string;
  workValue: string;
  workDetail: string;
  received: string;
  /** Received minus expenses recorded as paid and savings set aside; never negative. Closes the "ดูที่มา" statement. */
  balance: string;
  /** Received minus expenses, before money moved to savings goals. */
  profit: string;
  profitDetail: string;
  hasPending: boolean;
  jobCount: number;
  next: MobileHomeNext | null;
  onNet: () => void;
  onReceived: () => void;
  onWork: () => void;
  onReceivables: () => void;
  onQuickPay: () => void;
  onAddIncome: () => void;
  onAddExpense: () => void;
  onDocuments: () => void;
  onGoals: () => void;
  onCalendar: () => void;
  onTools: () => void;
}

export function MobileHome(props: MobileHomeProps) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const closeMore = React.useCallback(() => setMoreOpen(false), []);
  const pendingStatus = props.hasPending ? 'มีรายการรอรับ' : 'ไม่มีรายการรอรับ';
  const quick: { label: string; icon: KsIconName; level: 'primary' | 'secondary' | 'tertiary'; run: () => void }[] = [
    { label: 'รับเงินด่วน', icon: 'receive', level: 'primary', run: props.onQuickPay },
    { label: 'เพิ่มรายรับ', icon: 'income', level: 'secondary', run: props.onAddIncome },
    { label: 'เพิ่มรายจ่าย', icon: 'expense', level: 'secondary', run: props.onAddExpense },
    { label: 'เพิ่มเติม', icon: 'more', level: 'tertiary', run: () => setMoreOpen(true) },
  ];
  const more: { title: string; description: string; icon: KsIconName; run: () => void }[] = [
    { title: 'ออกเอกสาร', description: 'เสนอราคา แจ้งหนี้ หรือใบเสร็จ', icon: 'document', run: props.onDocuments },
    { title: 'เป้าหมายออม', description: 'แบ่งเงินและติดตามความคืบหน้า', icon: 'target', run: props.onGoals },
    { title: 'ปฏิทิน', description: 'วันส่งงานและวันครบกำหนดรับเงิน', icon: 'calendar', run: props.onCalendar },
  ];
  return (
    <div className="ksm ksm-home">
      <div className="ksm-heading">
        <div><h2 id="dashboard-title">ภาพรวม</h2><p>{props.greeting}</p></div>
        {props.monthPicker}
      </div>

      <section className="ksm-summary" aria-label="สรุปเงินของเดือน">
        <div className="ksm-face">
          <div className="ksm-face-title"><span>สรุปเงินของคุณ</span></div>
          <span className="ksm-watermark" aria-hidden="true"><BrandLogo size={116} /></span>
          <button type="button" className="ksm-net" onClick={props.onWork}>
            <span className="ksm-net-label">{props.workLabel}</span>
            <strong data-metric="work">{props.workValue}</strong>
            <span className="ksm-net-detail">ดูที่มา <KsIcon name="chevron" size={17} /></span>
          </button>
          <p className="ksm-trend">{props.workDetail}</p>
        </div>
        <div className="ksm-cash">
          <button type="button" onClick={props.onReceived}><span>รับเงินจริง</span><b data-metric="received">{props.received}</b><KsIcon name="chevron" size={17} /></button>
          <button type="button" onClick={props.onNet}><span>ยอดเงินปัจจุบัน</span><b data-metric="balance">{props.balance}</b><KsIcon name="chevron" size={17} /></button>
        </div>
        <button type="button" className="ksm-work" onClick={props.onNet}>
          <span className="ksm-work-icon"><KsIcon name="income" size={17} /></span>
          <span className="ksm-grow"><b>กำไรสุทธิ</b><small>{props.profitDetail}</small></span>
          <strong data-metric="profit">{props.profit}</strong>
          <KsIcon name="chevron" size={17} />
        </button>
      </section>

      <button type="button" className={`ksm-notice ${props.hasPending ? 'has-pending' : 'is-empty'}`} onClick={props.onReceivables}
        aria-label={`เงินรอรับ · ${pendingStatus} · เปิดดูยอดและรายละเอียด`}>
        <span className="ksm-notice-label">เงินรอรับ</span>
        <span className="ksm-notice-status">{props.hasPending && <i aria-hidden="true" />}<span>{pendingStatus}</span></span>
        <KsIcon name="chevron" size={17} />
      </button>

      <section className="ksm-actions" aria-label="ทางลัดทำรายการ">
        {quick.map(action => (
          <button key={action.label} type="button" className={`ksm-quick is-${action.level}`} onClick={action.run}>
            <span className="ksm-quick-icon"><KsIcon name={action.icon} size={23} /></span>
            <span>{action.label}</span>
          </button>
        ))}
      </section>
      <p className="ksm-counts">{props.jobCount} งานทั้งหมด</p>

      {props.next && (
        <>
          <div className="ksm-section-title">
            <h3>กำหนดถัดไป</h3>
            <button type="button" className="ksm-link" onClick={props.onCalendar}>ปฏิทิน <KsIcon name="chevron" size={17} /></button>
          </div>
          <button type="button" className="ksm-agenda" onClick={props.next.onOpen}>
            <span className="ksm-date"><b>{props.next.day}</b><small>{props.next.month}</small></span>
            <span className="ksm-grow"><small>{props.next.caption}</small><b>{props.next.title}</b></span>
            <KsIcon name="chevron" size={17} />
          </button>
        </>
      )}

      <button type="button" className="ksm-tools-entry" onClick={props.onTools}>
        <span><KsIcon name="grid" size={17} />เครื่องมือทั้งหมด</span>
        <small>เอกสาร · รายงาน · ภาษี</small>
        <KsIcon name="chevron" size={17} />
      </button>

      {moreOpen && (
        <MobileSheet title="ทำรายการเพิ่มเติม" onClose={closeMore}>
          <p className="ksm-sheet-intro">เลือกสิ่งที่ต้องการทำต่อ</p>
          <div className="ksm-list">
            {more.map(item => (
              <button key={item.title} type="button" onClick={() => { closeMore(); item.run(); }}>
                <span className="ksm-list-icon"><KsIcon name={item.icon} size={22} /></span>
                <span className="ksm-grow"><b>{item.title}</b><p>{item.description}</p></span>
                <KsIcon name="chevron" size={16} />
              </button>
            ))}
          </div>
          <button type="button" className="ksm-sheet-all" onClick={() => { closeMore(); props.onTools(); }}>
            <KsIcon name="grid" size={17} />เครื่องมือทั้งหมด<KsIcon name="chevron" size={17} />
          </button>
          <p className="ksm-hint">รายงาน ภาษี คลังไฟล์ และการตั้งค่า ยังใช้บนมือถือได้</p>
        </MobileSheet>
      )}
    </div>
  );
}
