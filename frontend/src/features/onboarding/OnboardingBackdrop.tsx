import React from 'react';
import { Bell, FileText, Plus } from 'lucide-react';
import { LineLogo } from '../../components/ui/LineLogo';
import { Mascot } from '../../components/mascot/Mascot';
import { tr } from '../../i18n/tr';

// The background of Welcome Onboarding, look A "การ์ดลอย" (owner, 2026-11-01: "เอาแบบการ์ดที่1"; the canvas
// Pq9Lo57QVdan83pEAKhNa3): the landing page's floating glass cards, popping in and drifting on white. On the name step
// they are clear; on the questions they fade back, and on the last question the card for each goal picked lights up.
// A sample of what the app shows, never the account's figures. Decoration only: hidden from screen readers, never takes a
// click, and still when the device asks for reduced motion. Phones show four on the name step and none on the questions;
// narrower computers and iPads keep only the cards that stay clear of the words (onboarding.css).

export type BackdropCard = 'line' | 'owed' | 'quote' | 'paid' | 'income' | 'chat' | 'work' | 'alarm';

type Place = { id: BackdropCard; delay: number; tilt: number; rest: number; float: number; drift: number; sway: number };
// delay (s) and tilt (deg) of the pop-in, the angle it settles at, and its drift: seconds, px, deg.
const WIDE: Place[] = [
  { id: 'line', delay: 0.35, tilt: -14, rest: 0, float: 3.4, drift: -12, sway: -3 },
  { id: 'owed', delay: 0.48, tilt: 10, rest: -2, float: 4, drift: 9, sway: 1.5 },
  { id: 'quote', delay: 0.62, tilt: 14, rest: 2, float: 3.2, drift: -10, sway: 2 },
  { id: 'paid', delay: 0.74, tilt: -12, rest: 1, float: 3.8, drift: -8, sway: -1.5 },
  { id: 'income', delay: 0.42, tilt: 12, rest: -3, float: 4.2, drift: 10, sway: 2 },
  { id: 'chat', delay: 0.9, tilt: -8, rest: 2, float: 4.6, drift: -9, sway: -1 },
  { id: 'work', delay: 0.68, tilt: 9, rest: -1, float: 3.9, drift: 8, sway: 1.5 },
  { id: 'alarm', delay: 0.56, tilt: 14, rest: -2, float: 3.6, drift: 11, sway: 2 },
];
const PHONE: Place[] = [
  { id: 'line', delay: 0.35, tilt: -14, rest: 0, float: 3.4, drift: -9, sway: -3 },
  { id: 'owed', delay: 0.48, tilt: 10, rest: 3, float: 4, drift: 8, sway: -1.5 },
  { id: 'chat', delay: 0.9, tilt: -8, rest: -1, float: 4.4, drift: -7, sway: 1 },
  { id: 'alarm', delay: 0.62, tilt: 14, rest: 4, float: 3.6, drift: 8, sway: 2 },
];

function CardBody({ id, name }: { id: BackdropCard; name: string }) {
  switch (id) {
    case 'line':
      return <span className="wob-tile-line"><LineLogo size={66} /></span>;
    case 'owed':
      return (
        <div className="wob-card-glass is-figure">
          <p className="wob-card-label"><i className="is-caramel" />{tr("เงินรอรับ")}</p>
          <p className="wob-card-figure">฿12,500</p>
          <p className="wob-card-note is-caramel">{tr("{0} งาน", 2)}</p>
        </div>
      );
    case 'income':
      return (
        <div className="wob-card-glass is-figure">
          <p className="wob-card-label"><i className="is-green" />{tr("เงินเข้าเดือนนี้")}</p>
          <p className="wob-card-figure">฿38,500</p>
          <svg className="wob-spark" width="150" height="32" viewBox="0 0 150 34" fill="none" focusable="false">
            <path pathLength={1} d="M2 30 C 18 30, 24 22, 38 23 S 60 16, 74 18 S 98 10, 112 12 S 136 4, 148 2" />
          </svg>
        </div>
      );
    case 'quote':
      return (
        <div className="wob-card-glass is-row">
          <span className="wob-card-icon is-orange"><FileText size={19} strokeWidth={1.9} /></span>
          <span><b>{tr("ใบเสนอราคา")}</b><small>QT-2569-012</small></span>
        </div>
      );
    case 'paid':
      return (
        <div className="wob-card-glass is-row">
          <span className="wob-card-icon is-green"><Plus size={18} strokeWidth={2.4} /></span>
          <span><b className="is-green">+฿5,000</b><small>{tr("รับแล้ว")}</small></span>
        </div>
      );
    case 'work':
      return (
        <div className="wob-card-glass is-figure">
          <p className="wob-card-label">{tr("งานที่กำลังทำ")}</p>
          <p className="wob-card-title">{tr("ถ่ายภาพแคมเปญ")}</p>
          <p className="wob-card-note is-rust">{tr("ส่งงานอีก {0} วัน", 3)}</p>
        </div>
      );
    case 'alarm':
      return (
        <div className="wob-card-orange">
          <span className="wob-card-icon is-light"><Bell size={18} strokeWidth={2} /></span>
          <span><b>08:00</b><small>{tr("เตือนรับเงิน")}</small></span>
        </div>
      );
    case 'chat':
      return (
        <div className="wob-card-glass is-chat">
          <p className="wob-chat-head">
            <span className="wob-chat-face"><Mascot mood="happy" gear="headset" animated={false} size={26} viewBox="10 14 82 82" /></span>
            {tr("เลขากระรอก")}<span className="wob-chat-app">LINE</span>
          </p>
          <div className="wob-chat-bubble">
            {name
              ? <span key="name" className="wob-chat-text">{tr("สวัสดีครับ คุณ{0}", name)}</span>
              : <span key="dots" className="wob-chat-dots"><i /><i /><i /></span>}
          </div>
        </div>
      );
  }
}

export function OnboardingBackdrop({ phone, still, quiet, name, lit }: {
  phone: boolean; still: boolean; quiet: boolean; name: string; lit: ReadonlySet<BackdropCard>;
}) {
  // Phones: the questions need the whole screen, so the cards stay on the name step only.
  const places = phone ? (quiet ? [] : PHONE) : WIDE;
  return (
    <div className={`wob-backdrop${quiet ? ' is-quiet' : ''}${still ? ' is-still' : ''}`} aria-hidden="true">
      {places.map(place => (
        <div key={place.id} className={`wob-card is-${place.id}${lit.has(place.id) ? ' is-lit' : ''}`}
          style={{ '--d': `${place.delay}s`, '--r': `${place.tilt}deg`, '--rr': `${place.rest}deg` } as React.CSSProperties}>
          <div className="wob-card-pop">
            <div className="wob-card-float" style={{ '--fd': `${place.float}s`, '--fy': `${place.drift}px`, '--fr': `${place.sway}deg` } as React.CSSProperties}>
              <CardBody id={place.id} name={name} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
