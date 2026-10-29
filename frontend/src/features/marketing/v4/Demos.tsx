import React from 'react';
import { Bell, Check, SendHorizontal } from 'lucide-react';
import { Mascot } from '../../../components/mascot/Mascot';
import { LineLogo } from '../../../components/ui/LineLogo';
import { GmailLogo } from '../../../components/ui/GmailLogo';
import { tr } from '../../../i18n/tr';

// The landing's four motions (owner, 2026-10-29: "เป็นคลิปหรือแบบเป็นโมชั่นเลย ... ให้ทุกคนอ๋อ มันทำแบบนี้นี่เอง"), no frames
// around them. Each loops on CSS alone (demos.css) and starts when its row comes into view. The pictures are the app's
// real cards with example data; everything else is drawn in the app's own look.

/** เลขา: a question typed and answered, then an instruction typed and done. */
export function ChatDemo() {
  return (
    <div className="gl-demo gl-chat" role="img" aria-label={tr('ตัวอย่าง: ถามเลขาว่าใครยังไม่จ่าย แล้วบอกงานพรุ่งนี้ให้บันทึก')}>
      <div className="gl-chat-head" aria-hidden="true">
        <span className="gl-chat-face"><Mascot gear="headset" mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
        <span><b>{tr('เลขากระรอก')}</b><small><i />{tr('พร้อมช่วย')}</small></span>
      </div>
      <div className="gl-chat-body" aria-hidden="true">
        <div className="gl-chat-track">
          <p className="gl-msg is-me is-m1 gl-loop">{tr('ใครยังไม่จ่ายบ้าง')}</p>
          {/* Each answer has its place from the start; the typing dots wait in it, so nothing moves when it arrives. */}
          <div className="gl-slot"><span className="gl-dots is-d1"><i /><i /><i /></span>
          <div className="gl-msg is-bot is-b1 gl-loop">
            <p>{tr('ตอนนี้ค้างรับอยู่ 2 งาน รวม {0} ครับ', '฿12,500')}</p>
            <ul>
              <li><span>{tr('รีวิวสินค้า · คุณเอ')}</span><b>฿5,000</b><em className="is-late">{tr('เลยกำหนด 3 วัน')}</em></li>
              <li><span>{tr('ถ่ายรูปสินค้า · ร้านบี')}</span><b>฿7,500</b><em>{tr('ครบกำหนดวันนี้')}</em></li>
            </ul>
          </div></div>
          <p className="gl-msg is-me is-m2 gl-loop">{tr('พรุ่งนี้มีงานรีวิว 2 งาน งานละ 5,000 กับงานถ่ายรูปอีก 8,000')}</p>
          <div className="gl-slot"><span className="gl-dots is-d2"><i /><i /><i /></span>
          <figure className="gl-msg is-card is-b2"><img src="/landing-v4/chat-saved.webp" alt="" /></figure></div>
        </div>
      </div>
      <div className="gl-chat-composer" aria-hidden="true">
        <span className="gl-type is-t1 gl-loop">{tr('ใครยังไม่จ่ายบ้าง')}</span>
        <span className="gl-type is-t2 gl-loop">{tr('พรุ่งนี้มีงานรีวิว 2 งาน…')}</span>
        <span className="gl-type-hint">{tr('พิมพ์หรือพูดกับเลขา…')}</span>
        <span className="gl-send"><SendHorizontal size={16} /></span>
      </div>
    </div>
  );
}

/** The 08:00 reminder: a locked phone, two notifications arrive, one is opened, ได้รับแล้ว is pressed. */
export function PhoneDemo() {
  return (
    <div className="gl-demo gl-phone-demo" role="img" aria-label={tr('ตัวอย่าง: แจ้งเตือนเข้า LINE ตอน 08:00 เปิดดูแล้วกดได้รับแล้ว')}>
      <div className="gl-device">
        <span className="gl-island" aria-hidden="true" />
        <div className="gl-screen">
        <div className="gl-lock" aria-hidden="true">
          <p className="gl-lock-date">{tr('วันพฤหัสบดีที่ 30 ตุลาคม')}</p>
          <p className="gl-lock-time gl-num">08:00</p>
          <div className="gl-notif is-n1"><span className="gl-notif-app"><LineLogo size={26} /></span><span className="gl-notif-text"><b>{tr('กระรอกตุนเงิน')}<small>{tr('ตอนนี้')}</small></b>{tr('เตือนรับเงิน 2 รายการ รวม {0}', '฿12,500')}</span></div>
          <div className="gl-notif is-n2"><span className="gl-notif-app"><GmailLogo size={24} /></span><span className="gl-notif-text"><b>{tr('สรุปงานวันนี้')}<small>{tr('ตอนนี้')}</small></b>{tr('ครบกำหนดวันนี้ 1 งาน')}</span></div>
          <span className="gl-ting" aria-hidden="true"><Bell size={16} /></span>
          <span className="gl-tap is-tap1" />
        </div>
        <div className="gl-linechat">
          <div className="gl-line-bar" aria-hidden="true"><span>‹</span><b>{tr('กระรอกตุนเงิน')}</b><span /></div>
          <div className="gl-line-scroll">
            <img className="gl-line-card" src="/landing-v4/line-reminder.webp" alt={tr('การ์ดเตือนรับเงินใน LINE')} />
            <img className="gl-line-card is-received" src="/landing-v4/line-received.webp" alt="" aria-hidden="true" />
          </div>
          <span className="gl-tap is-tap2" />
        </div>
        </div>
      </div>
    </div>
  );
}

/** One job's documents, one after another: quotation, invoice, receipt. */
export function DocsDemo() {
  return (
    <div className="gl-demo gl-docs" role="img" aria-label={tr('ตัวอย่าง: ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ ออกต่อกันจากงานเดียว')}>
      {[['doc-quotation', tr('ใบเสนอราคา')], ['doc-invoice', tr('ใบแจ้งหนี้')], ['doc-receipt', tr('ใบเสร็จ')]].map(([file, label], at) => (
        <figure key={file} className={`gl-doc is-${at + 1}`} aria-hidden="true">
          <img src={`/landing-v4/${file}.webp`} alt="" />
          <figcaption>{at > 0 && <span className="gl-doc-arrow">→</span>}{label}</figcaption>
          {at === 2 && <span className="gl-stamp">{tr('ชำระแล้ว')}</span>}
        </figure>
      ))}
    </div>
  );
}

const MONTH_START = 4; // 1 Oct 2569 is a Thursday (Sun = 0)
const TODAY = 13; // two jobs already paid, three still to come
const PAYDAYS: { day: number; amount: string; paid?: boolean }[] = [
  { day: 3, amount: '฿5,000', paid: true }, { day: 10, amount: '฿8,000', paid: true }, { day: 16, amount: '฿12,500' }, { day: 22, amount: '฿7,500' }, { day: 30, amount: '฿5,500' },
];
const RUNNING = ['฿0', '฿5,000', '฿13,000', '฿25,500', '฿33,000', '฿38,500'];

/** The month on a calendar: each job's money lands on its day, the month's total adds up. */
export function CalendarDemo() {
  const cells = Array.from({ length: 35 }, (_, at) => at - MONTH_START + 1);
  const weekdays = [tr('อา.'), tr('จ.'), tr('อ.'), tr('พ.'), tr('พฤ.'), tr('ศ.'), tr('ส.')];
  return (
    <div className="gl-demo gl-cal" role="img" aria-label={tr('ตัวอย่าง: ปฏิทินเดือนตุลาคมที่บอกว่าเงินแต่ละงานจะเข้าวันไหน เท่าไร')}>
      <div className="gl-cal-head" aria-hidden="true">
        <b>{tr('ตุลาคม 2569')}</b>
        <span className="gl-cal-total">{tr('เงินเข้าเดือนนี้')}<span className="gl-cal-sum gl-num">{RUNNING.map((value, at) => <i key={value} className={`is-${at + 1}`}>{value}</i>)}</span></span>
      </div>
      <div className="gl-cal-grid" aria-hidden="true">
        {weekdays.map(day => <span key={day} className="gl-cal-wd">{day}</span>)}
        {cells.map((day, at) => {
          const pay = PAYDAYS.findIndex(item => item.day === day);
          return (
            <span key={at} className={`gl-cal-cell${day < 1 || day > 31 ? ' is-out' : ''}${day === TODAY ? ' is-today' : ''}`}>
              {day >= 1 && day <= 31 && <small>{day}</small>}
              {pay >= 0 && <em className={`gl-cal-pay is-${pay + 1}${PAYDAYS[pay].paid ? ' is-paid' : ''}`}>{PAYDAYS[pay].paid && <Check size={10} strokeWidth={3.4} />}{PAYDAYS[pay].amount}</em>}
            </span>
          );
        })}
      </div>
      <div className="gl-cal-legend" aria-hidden="true"><span><i className="is-paid" />{tr('รับแล้ว')}</span><span><i />{tr('รอรับ')}</span></div>
    </div>
  );
}
