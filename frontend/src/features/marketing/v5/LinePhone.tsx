import React from 'react';
import { Bell, ChevronLeft, Keyboard, Menu, Search } from 'lucide-react';
import { LineLogo } from '../../../components/ui/LineLogo';
import { GmailLogo } from '../../../components/ui/GmailLogo';
import { tr } from '../../../i18n/tr';
import './linePhone.css';

// The 08:00 reminder on a phone (the landing's "เตือนก่อนลืมทุกเช้า"). The lock screen is the one from v4/Demos.tsx; the
// LINE chat is drawn as LINE shows it (owner, 2026-10-30, from a screenshot of the real chat: the cards were "ซูมเกินไป"):
// the account's bar, the bot's picture beside a card at LINE's own size with its time, the green message LINE sends when
// ได้รับแล้ว is pressed (the button's own displayText), the bot's reply card, and the bar with the menu's name (lineRichMenus
// chatBarText). Colours from the screenshot (LINE's dark look). The chat moves up as each message arrives, as LINE does;
// how far is measured, as it depends on the phone's size.

/** Where ได้รับแล้ว sits on the reminder card picture (line-reminder.webp, 600 × 1208), as parts of its width and height. */
const PAID_BUTTON = { x: 0.2, y: 0.599 };
const TAP = 46;

export function LinePhone() {
  const chat = React.useRef<HTMLDivElement>(null);
  const area = React.useRef<HTMLDivElement>(null);
  const track = React.useRef<HTMLDivElement>(null);
  const card = React.useRef<HTMLImageElement>(null);
  const sent = React.useRef<HTMLDivElement>(null);
  const reply = React.useRef<HTMLDivElement>(null);
  const tap = React.useRef<HTMLSpanElement>(null);

  const measure = React.useCallback(() => {
    const root = chat.current, box = area.current, list = track.current, first = card.current;
    if (!root || !box || !list || !first || !sent.current || !reply.current || !tap.current) return;
    // layout positions (offsets), so the page's scale of the phone does not matter
    const offset = (el: HTMLElement, to: HTMLElement) => { let x = 0, y = 0; for (let e: HTMLElement | null = el; e && e !== to; e = e.offsetParent as HTMLElement | null) { x += e.offsetLeft; y += e.offsetTop; } return { x, y }; };
    const at = offset(first, root);
    tap.current.style.left = `${Math.round(at.x + first.offsetWidth * PAID_BUTTON.x - TAP / 2)}px`;
    tap.current.style.top = `${Math.round(at.y + first.offsetHeight * PAID_BUTTON.y - TAP / 2)}px`;
    const room = box.clientHeight;
    const bottomOf = (el: HTMLElement) => offset(el, list).y + el.offsetHeight + 10;
    list.style.setProperty('--lp-a', `${Math.max(0, Math.round(bottomOf(sent.current) - room))}px`);
    list.style.setProperty('--lp-b', `${Math.max(0, Math.round(bottomOf(reply.current) - room))}px`);
  }, []);
  React.useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (chat.current) observer.observe(chat.current);
    if (track.current) observer.observe(track.current);
    return () => observer.disconnect();
  }, [measure]);

  const avatar = <span className="lp-avatar" aria-hidden="true"><img src="/kv/symbol.svg" alt="" /></span>;
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
          <div className="gl-linechat lp-chat" ref={chat}>
            <div className="lp-bar" aria-hidden="true">
              <ChevronLeft size={20} strokeWidth={2.2} />
              <b>{tr('กระรอกตุนเงิน')}</b>
              <span className="lp-bar-icons"><Search size={15} strokeWidth={2.2} /><Menu size={16} strokeWidth={2.2} /></span>
            </div>
            <div className="lp-area" ref={area}>
              <div className="lp-track" ref={track}>
                <span className="lp-day" aria-hidden="true">{tr('วันนี้')}</span>
                <div className="lp-row is-bot">
                  {avatar}
                  <img ref={card} className="lp-card" src="/landing-v4/line-reminder.webp" alt={tr('การ์ดเตือนรับเงินใน LINE')} onLoad={measure} />
                  <time className="lp-time" aria-hidden="true">08:00</time>
                </div>
                <div className="lp-row is-me lp-sent" ref={sent} aria-hidden="true">
                  <span className="lp-meta"><small className="lp-read">{tr('อ่านแล้ว')}</small><time className="lp-time">08:01</time></span>
                  <p className="lp-bubble">{tr('ได้รับเงินแล้ว · {0}', tr('รีวิวสินค้า'))}</p>
                </div>
                <div className="lp-row is-bot lp-reply" ref={reply} aria-hidden="true">
                  {avatar}
                  <img className="lp-card" src="/landing-v4/line-received.webp" alt="" onLoad={measure} />
                  <time className="lp-time">08:01</time>
                </div>
              </div>
            </div>
            <div className="lp-menu" aria-hidden="true"><Keyboard size={18} strokeWidth={1.8} /><span>{tr('เลขาการเงิน')} ▴</span></div>
            <span ref={tap} className="gl-tap is-tap2 lp-tap" />
          </div>
        </div>
      </div>
    </div>
  );
}
