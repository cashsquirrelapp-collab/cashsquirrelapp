import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Mascot } from '../../../../frontend/src/components/mascot/Mascot';
import { MARK_VIEWBOX } from '../../../../frontend/src/components/brand/BrandLogo';
import { LineCard } from './flex';

// "เชื่อมต่อ LINE กับกระรอกตุนเงิน": a 9:16 tutorial clip drawn as one React tree whose every
// position and opacity is a function of the time t (seconds). render.ts steps t frame by frame and
// photographs the page, so the clip is exact and repeatable.
//
// What is real: the settings screens (photographed from the app by shots.ts), the LINE cards
// (built by the app's own message builders in cards.ts), the bot's "linked" reply, the menu
// picture and the commands. What is a stand-in: the phone frame and the LINE chat chrome.

export const DURATION = 49;
const W = 540, H = 960;
const C = { bg: '#FAFAF9', text: '#1C1917', sub: '#7D7772', primary: '#E65F2B', accentText: '#C24A16', rust: '#A63F1B', soft: '#FFF1E8', peach: '#F3B08C', border: '#E5E3DF', muted: '#F3F2F0', line: '#06C755', white: '#FFFFFF' };
const FONT = "'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif";
const SAMPLE_CODE = 'A1B2C3D4E5F60718';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CARDS: Record<string, any> = (window as any).__CARDS;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const fadeIn = (t: number, at: number, d = 0.45) => ease(ramp(t, at, at + d));
/** 0 → 1 → 0: visible between a and b with soft edges. */
const span = (t: number, a: number, b: number, d = 0.4) => Math.min(fadeIn(t, a, d), 1 - fadeIn(t, b - d, d));
const rise = (t: number, at: number, d = 0.5, px = 18): React.CSSProperties => ({ opacity: fadeIn(t, at, d), transform: `translateY(${(1 - fadeIn(t, at, d)) * px}px)` });

/* ---------- shared pieces ---------- */

function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.26 }}>
      <Mascot mood="happy" action="hold-baht" animated={false} size={size} viewBox={MARK_VIEWBOX} />
      <span style={{ fontFamily: "'Prompt', 'IBM Plex Sans Thai', sans-serif", fontWeight: 600, fontSize: size * 0.56, color: C.text, whiteSpace: 'nowrap', lineHeight: 1 }}>กระรอก<span style={{ color: C.primary }}>ตุนเงิน</span></span>
    </span>
  );
}

function LineBadge({ size = 44 }: { size?: number }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size * 0.28, background: C.line, color: '#fff', fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: size * 0.3, letterSpacing: 0.2 }}>LINE</span>;
}

const PHONE = { x: 117, y: 214, w: 306, h: 644, pad: 8 };
const SCREEN = { w: PHONE.w - PHONE.pad * 2, h: PHONE.h - PHONE.pad * 2 };
const K = SCREEN.w / 390; // the app and the chat are laid out at 390px wide, like the real phone shots

function Phone({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: 'absolute', left: PHONE.x, top: PHONE.y, width: PHONE.w, height: PHONE.h, borderRadius: 40, background: '#1C1917', boxShadow: '0 18px 40px rgba(60,40,28,.18), 0 4px 10px rgba(60,40,28,.10)', ...style }}>
      <div style={{ position: 'absolute', left: PHONE.pad, top: PHONE.pad, width: SCREEN.w, height: SCREEN.h, borderRadius: 32, overflow: 'hidden', background: C.bg }}>
        <div style={{ width: 390, height: SCREEN.h / K, transform: `scale(${K})`, transformOrigin: '0 0', position: 'relative' }}>{children}</div>
      </div>
    </div>
  );
}

type Rect = { x: number; y: number; w: number; h: number };
/** A ring around the control being talked about, and a finger tap on it. */
function Pointer({ t, rect, from, tapAt, until }: { t: number; rect: Rect; from: number; tapAt?: number; until: number }) {
  const show = span(t, from, until, 0.25);
  const tap = tapAt === undefined ? 0 : span(t, tapAt - 0.18, tapAt + 0.3, 0.16);
  const pulse = 1 + Math.sin((t - from) * 5) * 0.012;
  return (
    <>
      <div style={{ position: 'absolute', left: rect.x - 5, top: rect.y - 5, width: rect.w + 10, height: rect.h + 10, borderRadius: 16, border: `3px solid ${C.primary}`, background: 'rgba(230,95,43,.08)', opacity: show, transform: `scale(${pulse})` }} />
      {tapAt !== undefined && <div style={{ position: 'absolute', left: rect.x + rect.w / 2 - 26, top: rect.y + rect.h / 2 - 26, width: 52, height: 52, borderRadius: '50%', background: 'rgba(230,95,43,.30)', border: '2px solid rgba(230,95,43,.65)', opacity: tap, transform: `scale(${0.7 + tap * 0.4})` }} />}
    </>
  );
}

type Shot = { name: string; from: number; to: number; ring?: Rect; tapAt?: number };
function Shots({ t, shots }: { t: number; shots: Shot[] }) {
  return (
    <>
      {shots.map((shot, i) => {
        const opacity = i === 0 ? 1 - fadeIn(t, shot.to - 0.15, 0.3) : Math.min(fadeIn(t, shot.from - 0.15, 0.3), i === shots.length - 1 ? 1 : 1 - fadeIn(t, shot.to - 0.15, 0.3));
        if (opacity <= 0) return null;
        return (
          <div key={shot.name} style={{ position: 'absolute', inset: 0, opacity }}>
            <img src={`shots/${shot.name}.png`} alt="" style={{ width: 390, display: 'block' }} />
            {shot.ring && <Pointer t={t} rect={shot.ring} from={shot.from + 0.25} tapAt={shot.tapAt} until={shot.to} />}
          </div>
        );
      })}
    </>
  );
}

/* ---------- the LINE chat stand-in ---------- */

type Msg =
  | { at: number; from: 'me'; text: string; typeFrom?: number }
  | { at: number; from: 'bot'; text: string }
  | { at: number; from: 'bot'; card: string }
  | { at: number; until: number; from: 'typing' };

const AVATAR = 'icons/app-icon-192-v4.png';
function Chat({ t, messages, quick = [], quickTap, quickScroll, menu, banner }: {
  t: number; messages: Msg[]; quick?: string[]; quickTap?: { label: string; at: number }; quickScroll?: { from: number; to: number; px: number };
  menu?: { taps: { rect: readonly [number, number, number, number]; at: number }[]; hideAt?: number };
  banner?: { at: number; until: number; text: string };
}) {
  const typing = messages.find((m): m is Extract<Msg, { from: 'me' }> => m.from === 'me' && m.typeFrom !== undefined && t >= m.typeFrom && t < m.at);
  const typed = typing ? typing.text.slice(0, Math.ceil(typing.text.length * ramp(t, typing.typeFrom!, typing.at - 0.25))) : '';
  const menuH = 390 * (623 / 924);
  const menuOpen = menu ? 1 - fadeIn(t, menu.hideAt ?? 999, 0.35) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#D5DEEB', fontFamily: FONT }}>
      <div style={{ flex: 'none', height: 92, paddingTop: 40, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14, background: '#FFFFFF', borderBottom: '1px solid #E3E6EB' }}>
        <span style={{ fontSize: 26, lineHeight: 1, color: '#111', marginTop: -3 }}>‹</span>
        <img src={AVATAR} alt="" style={{ width: 36, height: 36, borderRadius: '50%', background: '#FDF6EC' }} />
        <span style={{ fontSize: 17, fontWeight: 600, color: '#111' }}>กระรอกตุนเงิน</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '10px 12px 6px', overflow: 'hidden' }}>
        {messages.map((m, i) => {
          if (m.from === 'typing') {
            const on = span(t, m.at, m.until, 0.15);
            return <div key={i} style={{ flex: 'none', overflow: 'hidden', maxHeight: on * 52, opacity: on }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                <img src={AVATAR} alt="" style={{ width: 34, height: 34, borderRadius: '50%', background: '#FDF6EC' }} />
                <div style={{ display: 'inline-flex', gap: 5, alignItems: 'center', height: 36, padding: '0 14px', borderRadius: 18, background: '#FFFFFF' }}>
                  {[0, 1, 2].map(d => <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#9AA3AF', opacity: 0.4 + 0.6 * Math.abs(Math.sin((t - m.at) * 4 - d * 0.7)) }} />)}
                </div>
              </div>
            </div>;
          }
          const on = fadeIn(t, m.at, 0.35);
          if (on <= 0) return null;
          const mine = m.from === 'me';
          return (
            <div key={i} style={{ flex: 'none', overflow: 'hidden', maxHeight: on * 900, opacity: on }}>
              <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                {!mine && <img src={AVATAR} alt="" style={{ width: 34, height: 34, borderRadius: '50%', background: '#FDF6EC', flex: 'none' }} />}
                {'card' in m
                  ? <LineCard message={CARDS[m.card]} />
                  : <div style={{ maxWidth: mine ? 250 : 262, padding: '9px 13px', borderRadius: 18, background: mine ? '#8DE055' : '#FFFFFF', color: '#111', fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap', fontFamily: mine && /^[A-F0-9]{16}$/.test(m.text) ? "'IBM Plex Sans', monospace" : FONT, letterSpacing: mine && /^[A-F0-9]{16}$/.test(m.text) ? 0.6 : 0 }}>{m.text}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {quick.length > 0 && (
        <div style={{ flex: 'none', padding: '4px 12px 8px', overflow: 'hidden' }}><div style={{ display: 'flex', gap: 8, transform: `translateX(${quickScroll ? -ease(ramp(t, quickScroll.from, quickScroll.to)) * quickScroll.px : 0}px)` }}>
          {quick.map(label => {
            const hit = quickTap && quickTap.label === label ? span(t, quickTap.at - 0.2, quickTap.at + 0.3, 0.15) : 0;
            return <span key={label} style={{ flex: 'none', padding: '8px 14px', borderRadius: 18, background: '#FFFFFF', border: `1.5px solid ${hit > 0 ? C.primary : '#C9CFD8'}`, boxShadow: hit > 0 ? `0 0 0 ${hit * 4}px rgba(230,95,43,.25)` : undefined, fontSize: 14, color: '#111', whiteSpace: 'nowrap' }}>{label}</span>;
          })}
        </div></div>
      )}
      {menu ? (
        <div style={{ flex: 'none', position: 'relative', height: menuH * menuOpen, overflow: 'hidden', background: '#F6EEE3' }}>
          <img src="landing/line-menu.webp" alt="" style={{ width: 390, height: menuH, display: 'block' }} />
          {menu.taps.map(({ rect: [l, tp, r, b], at }, i) => {
            const hit = span(t, at - 0.45, at + 0.3, 0.18);
            return <div key={i} style={{ position: 'absolute', left: l * 390, top: tp * menuH, width: (r - l) * 390, height: (b - tp) * menuH, borderRadius: 14, border: `3px solid ${C.primary}`, background: 'rgba(230,95,43,.14)', opacity: hit, transform: `scale(${1 - hit * 0.03})` }} />;
          })}
        </div>
      ) : (
        <div style={{ flex: 'none', height: 58, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: '#FFFFFF', borderTop: '1px solid #E3E6EB' }}>
          <span style={{ fontSize: 24, color: '#6B7280', lineHeight: 1 }}>+</span>
          <div style={{ flex: 1, height: 38, borderRadius: 19, background: '#F1F3F6', display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 15, color: typed ? '#111' : '#9AA3AF', fontFamily: /^[A-F0-9]+$/.test(typed) ? "'IBM Plex Sans', monospace" : FONT }}>
            {typed || 'Aa'}{typed && <span style={{ width: 1.5, height: 18, marginLeft: 1, background: C.line, opacity: Math.sin(t * 9) > 0 ? 1 : 0 }} />}
          </div>
          <span style={{ width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: typed ? C.line : '#E5E7EB', color: '#fff', fontSize: 16 }}>➤</span>
        </div>
      )}
      {banner && (
        <div style={{ position: 'absolute', left: 10, right: 10, top: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, background: 'rgba(250,250,250,.97)', boxShadow: '0 8px 24px rgba(0,0,0,.18)', transform: `translateY(${(1 - span(t, banner.at, banner.until, 0.3)) * -120}px)` }}>
          <img src={AVATAR} alt="" style={{ width: 36, height: 36, borderRadius: 9, background: '#FDF6EC' }} />
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: '#111' }}>กระรอกตุนเงิน</div><div style={{ fontSize: 13, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.text}</div></div>
        </div>
      )}
    </div>
  );
}

/* ---------- page furniture: section label, heading, caption, progress ---------- */

function Heading({ t, at, until, part, title, sub }: { t: number; at: number; until: number; part: string; title: string; sub?: string }) {
  const on = span(t, at, until, 0.4);
  if (on <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 36, right: 36, top: 64, opacity: on, transform: `translateY(${(1 - fadeIn(t, at, 0.45)) * 14}px)` }}>
      <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 999, background: C.soft, color: C.accentText, fontSize: 14, fontWeight: 600 }}>{part}</span>
      <h1 style={{ margin: '12px 0 0', fontSize: 31, lineHeight: 1.28, fontWeight: 600, letterSpacing: -0.4, color: C.text }}>{title}</h1>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 16, lineHeight: 1.5, color: C.sub }}>{sub}</p>}
    </div>
  );
}

function Caption({ t, lines }: { t: number; lines: { at: number; until: number; text: string }[] }) {
  return <>{lines.map(line => {
    const on = span(t, line.at, line.until, 0.3);
    if (on <= 0) return null;
    return <p key={line.at} style={{ position: 'absolute', left: 40, right: 40, top: 876, margin: 0, textAlign: 'center', fontSize: 18.5, lineHeight: 1.45, fontWeight: 500, color: C.text, opacity: on, transform: `translateY(${(1 - fadeIn(t, line.at, 0.3)) * 8}px)` }}>{line.text}</p>;
  })}</>;
}

const PARTS = [{ label: 'เชื่อมต่อ', from: 3.6 }, { label: 'ทำงานอย่างไร', from: 20.6 }, { label: 'ทำอะไรได้บ้าง', from: 30 }];
function Progress({ t }: { t: number }) {
  const on = span(t, 3.6, 45, 0.4);
  if (on <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 36, right: 36, top: 26, display: 'flex', gap: 8, opacity: on }}>
      {PARTS.map((part, i) => {
        const end = PARTS[i + 1]?.from ?? 45;
        const fill = ramp(t, part.from, end);
        const active = t >= part.from && t < end;
        return (
          <div key={part.label} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}><div style={{ width: `${fill * 100}%`, height: '100%', background: C.primary }} /></div>
            <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: active ? 600 : 400, color: active ? C.accentText : C.sub }}>{i + 1}. {part.label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- scenes ---------- */

function Title({ t }: { t: number }) {
  const on = 1 - fadeIn(t, 3.2, 0.4);
  if (on <= 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: on, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ marginTop: 150, ...rise(t, 0.1, 0.6, 24) }}><Mascot mood="happy" action="hold-baht" animated={false} size={210} /></div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 12, ...rise(t, 0.35) }}><Wordmark size={34} /><span style={{ fontSize: 24, color: C.sub }}>×</span><LineBadge size={42} /></div>
      <h1 style={{ margin: '34px 36px 0', fontSize: 42, lineHeight: 1.22, fontWeight: 700, letterSpacing: -0.8, color: C.text, ...rise(t, 0.55) }}>เชื่อมต่อ LINE<br />กับกระรอกตุนเงิน</h1>
      <p style={{ margin: '16px 48px 0', fontSize: 19, lineHeight: 1.5, color: C.sub, ...rise(t, 0.8) }}>รับแจ้งเตือนเรื่องเงิน และบันทึกรายการได้จากแชท</p>
      <div style={{ marginTop: 30, display: 'flex', gap: 8, ...rise(t, 1.1) }}>
        {['เชื่อมต่ออย่างไร', 'ทำงานอย่างไร', 'ทำอะไรได้บ้าง'].map((label, i) => <span key={label} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.white, fontSize: 14.5, color: C.text, ...rise(t, 1.1 + i * 0.14) }}>{label}</span>)}
      </div>
      <p style={{ marginTop: 26, fontSize: 14, color: C.sub, ...rise(t, 1.6) }}>ฟีเจอร์สำหรับสมาชิก Pro</p>
    </div>
  );
}

function Connect({ t }: { t: number }) {
  if (t < 3.3 || t > 21) return null;
  const phoneOn = span(t, 3.6, 20.7, 0.4);
  return (
    <>
      <Heading t={t} at={3.6} until={11} part="ขั้นที่ 1" title="สร้างรหัสยืนยันในแอป" />
      <Heading t={t} at={11} until={14.6} part="ขั้นที่ 2" title="แอดเพื่อน LINE Official Account" />
      <Heading t={t} at={14.6} until={20.7} part="ขั้นที่ 3" title="ส่งรหัสเข้าแชท" />
      <Phone style={{ opacity: phoneOn, transform: `translateY(${(1 - fadeIn(t, 3.6, 0.5)) * 30}px)` }}>
        <Shots t={t} shots={[
          { name: '1-settings', from: 3.6, to: 5.2, ring: { x: 17, y: 374, w: 356, h: 78 }, tapAt: 4.85 },
          { name: '2-notifications', from: 5.2, to: 6.7, ring: { x: 17, y: 445, w: 356, h: 96 }, tapAt: 6.35 },
          { name: '3-line', from: 6.7, to: 8.1, ring: { x: 37, y: 383, w: 116, h: 40 }, tapAt: 7.75 },
          { name: '4-confirm', from: 8.1, to: 9.3, ring: { x: 298, y: 780, w: 66, h: 40 }, tapAt: 8.95 },
          { name: '5-code', from: 9.3, to: 11.2, ring: { x: 36, y: 598, w: 266, h: 48 } },
        ]} />
        {/* step 2: the official account's page in LINE (stand-in) */}
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 11, 0.35) * (1 - fadeIn(t, 14.4, 0.35)), background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT }}>
          <div style={{ width: '100%', height: 250, background: 'linear-gradient(160deg,#FFF8F3,#EAC9A7)' }} />
          <img src={AVATAR} alt="" style={{ width: 132, height: 132, borderRadius: '50%', marginTop: -66, border: '5px solid #fff', background: '#FDF6EC' }} />
          <p style={{ margin: '16px 0 0', fontSize: 24, fontWeight: 600, color: '#111' }}>กระรอกตุนเงิน</p>
          <p style={{ margin: '4px 0 0', fontSize: 16, color: '#6B7280', fontFamily: "'IBM Plex Sans', sans-serif" }}>@859mlugf</p>
          <div style={{ position: 'relative', marginTop: 34, width: 300, height: 54 }}>
            <div style={{ width: 300, height: 54, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, background: t < 13.15 ? C.line : '#EEF0F3', color: t < 13.15 ? '#fff' : '#111' }}>
              {t < 13.15 ? 'เพิ่มเพื่อน' : 'แชท'}
            </div>
            <Pointer t={t} rect={{ x: 0, y: 0, w: 300, h: 54 }} from={11.6} tapAt={13.1} until={13.4} />
          </div>
        </div>
        {/* step 3: the code goes into the chat; the reply is the bot's own text */}
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 14.4, 0.35) * (1 - fadeIn(t, 18.6, 0.35)) }}>
          <Chat t={t} messages={[
            { at: 16.1, from: 'me', text: SAMPLE_CODE, typeFrom: 14.9 },
            { at: 16.4, until: 17.2, from: 'typing' },
            { at: 17.2, from: 'bot', text: '✅ เชื่อมต่อบัญชีสำเร็จแล้วครับ!\nตอนนี้คุณจะได้รับแจ้งเตือนจากกระรอกตุนเงินผ่าน LINE นี้ รวมถึงพิมพ์เพิ่มงานหรือถามข้อมูลได้เลยครับ' },
          ]} />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 18.6, 0.35) }}>
          <img src="shots/7-line-linked.png" alt="" style={{ width: 390, display: 'block' }} />
          <Pointer t={t} rect={{ x: 98, y: 280, w: 108, h: 26 }} from={18.9} until={20.7} />
        </div>
      </Phone>
      <Caption t={t} lines={[
        { at: 3.9, until: 5.2, text: 'เปิด ตั้งค่า แล้วเลือก การแจ้งเตือน' },
        { at: 5.2, until: 6.7, text: 'เลือก LINE' },
        { at: 6.7, until: 9.3, text: 'กด “เชื่อมต่อ LINE” แล้วยืนยัน' },
        { at: 9.3, until: 11, text: 'ได้รหัสยืนยัน ใช้ได้ 5 นาที และใช้ได้ครั้งเดียว' },
        { at: 11.3, until: 14.5, text: 'ค้นหา @859mlugf หรือกดลิงก์ในหน้ารหัส แล้วเพิ่มเพื่อน' },
        { at: 14.8, until: 17.1, text: 'วางรหัสแล้วส่ง เพื่อยืนยันว่า LINE นี้เป็นของคุณ' },
        { at: 17.2, until: 18.7, text: 'บอตตอบกลับว่าเชื่อมต่อสำเร็จ' },
        { at: 18.9, until: 20.6, text: 'ในแอปจะขึ้นสถานะ “เชื่อมต่อแล้ว”' },
      ]} />
    </>
  );
}

function HowItWorks({ t }: { t: number }) {
  if (t < 20.3 || t > 30.4) return null;
  const diagram = span(t, 20.7, 24.6, 0.4);
  const node = (at: number, top: number, icon: React.ReactNode, title: string, sub: string) => (
    <div style={{ position: 'absolute', left: 60, right: 60, top, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 20, background: C.white, border: `1px solid ${C.border}`, boxShadow: '0 3px 8px rgba(60,40,28,.07)', ...rise(t, at, 0.5, 20) }}>
      <span style={{ flex: 'none', width: 56, height: 56, borderRadius: 16, background: C.soft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span><b style={{ display: 'block', fontSize: 18.5, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{title}</b><span style={{ display: 'block', marginTop: 3, fontSize: 15, lineHeight: 1.45, color: C.sub }}>{sub}</span></span>
    </div>
  );
  const arrow = (at: number, top: number) => <div style={{ position: 'absolute', left: W / 2 - 1.5, top, width: 3, height: 34 * fadeIn(t, at, 0.4), borderRadius: 2, background: C.peach }} />;
  return (
    <>
      <Heading t={t} at={20.7} until={30} part="ส่วนที่ 2" title="ทำงานอย่างไร" sub="ระบบดูวันครบกำหนดรับเงินให้ แล้วแจ้งทาง LINE" />
      <div style={{ position: 'absolute', inset: 0, opacity: diagram }}>
        {node(21.0, 262, <Mascot mood="happy" action="hold-baht" animated={false} size={44} viewBox={MARK_VIEWBOX} />, 'งานในแอป', 'ทุกงานมีวันครบกำหนดรับเงิน')}
        {arrow(21.5, 376)}
        {node(21.8, 420, <span style={{ fontSize: 17, fontWeight: 700, color: C.accentText, fontFamily: "'IBM Plex Sans', sans-serif" }}>08:00</span>, 'ทุกวันประมาณ 08:00 น.', 'ระบบตรวจงานที่ใกล้ครบกำหนด ครบวันนี้ และเลยกำหนด')}
        {arrow(22.3, 548)}
        {node(22.6, 592, <LineBadge size={40} />, 'แจ้งเตือนเข้า LINE', 'การ์ดสรุปงานที่ต้องติดตาม พร้อมยอดเงิน')}
        <div style={{ position: 'absolute', left: 60, right: 60, top: 730, padding: '14px 18px', borderRadius: 16, background: C.soft, border: `1px solid ${C.peach}`, fontSize: 15.5, lineHeight: 1.5, color: C.text, ...rise(t, 23.2, 0.5, 14) }}>
          และทุกวันที่ 1 ของเดือน ส่ง<b style={{ fontWeight: 600 }}>สรุปการเงินรายเดือน</b>ให้
        </div>
      </div>
      <Phone style={{ opacity: span(t, 24.6, 30, 0.4), transform: `translateY(${(1 - fadeIn(t, 24.6, 0.5)) * 30}px)` }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - fadeIn(t, 27.9, 0.35) }}>
          <Chat t={t} messages={[{ at: 25.0, until: 25.7, from: 'typing' }, { at: 25.7, from: 'bot', card: 'digest' }]}
            banner={{ at: 25.6, until: 27.2, text: CARDS.digest.altText }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 27.9, 0.35) }}>
          <img src="shots/6-notifications-linked.png" alt="" style={{ width: 390, display: 'block' }} />
          <Pointer t={t} rect={{ x: 17, y: 232, w: 356, h: 210 }} from={28.2} until={30} />
        </div>
      </Phone>
      <Caption t={t} lines={[
        { at: 24.9, until: 27.8, text: 'แจ้งก่อนครบกำหนด 1–2 วัน วันครบกำหนด และเมื่อเลยกำหนด' },
        { at: 28.1, until: 29.9, text: 'เปิดหรือปิดได้ที่ ตั้งค่า › การแจ้งเตือน' },
      ]} />
    </>
  );
}

const TILE = { add: [0.007, 0.011, 0.573, 0.653], pending: [0.587, 0.011, 0.994, 0.323], month: [0.587, 0.340, 0.994, 0.653] } as const;
function WhatItDoes({ t }: { t: number }) {
  if (t < 29.7 || t > 45.4) return null;
  const sub = (at: number, until: number, title: string) => <Heading t={t} at={at} until={until} part="ส่วนที่ 3 · ทำอะไรได้บ้าง" title={title} />;
  return (
    <>
      {sub(30, 34.6, 'ดูเงินที่ยังรอรับ')}
      {sub(34.6, 40, 'บันทึกรายการด้วยการพิมพ์')}
      {sub(40, 42.6, 'ดูสรุปของเดือน')}
      {sub(42.6, 45, 'ไปทำต่อในแอป')}
      <Phone style={{ opacity: span(t, 30, 45, 0.4), transform: `translateY(${(1 - fadeIn(t, 30, 0.5)) * 30}px)` }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - fadeIn(t, 34.4, 0.3) }}>
          <Chat t={t} menu={{ taps: [{ rect: TILE.pending, at: 31.3 }], hideAt: 31.7 }}
            messages={[{ at: 31.8, until: 32.5, from: 'typing' }, { at: 32.5, from: 'bot', card: 'unpaid' }]} />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 34.4, 0.3) * (1 - fadeIn(t, 39.8, 0.3)) }}>
          <Chat t={t} messages={[
            { at: 35.9, from: 'me', text: 'กาแฟ80', typeFrom: 35.0 },
            { at: 36.1, until: 36.8, from: 'typing' },
            { at: 36.8, from: 'bot', card: 'draftReview' },
            { at: 38.5, until: 39.0, from: 'typing' },
            { at: 39.0, from: 'bot', card: 'expenseSaved' },
          ]} />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 39.8, 0.3) * (1 - fadeIn(t, 42.4, 0.3)) }}>
          <Chat t={t} menu={{ taps: [{ rect: TILE.month, at: 40.6 }], hideAt: 40.9 }}
            messages={[{ at: 41.0, until: 41.5, from: 'typing' }, { at: 41.5, from: 'bot', card: 'monthly' }]} />
        </div>
        <div style={{ position: 'absolute', inset: 0, opacity: fadeIn(t, 42.4, 0.3) }}>
          <Chat t={t} quick={['เพิ่มรายการ', 'รอรับเงิน', 'สรุปเดือนนี้', 'งานเดือนนี้', 'กำลังดำเนินงาน', 'เมนูเพิ่มเติม']} quickTap={{ label: 'เมนูเพิ่มเติม', at: 43.0 }} quickScroll={{ from: 42.5, to: 42.9, px: 330 }}
            messages={[{ at: 43.2, from: 'me', text: 'เมนูเพิ่มเติม' }, { at: 43.3, until: 43.8, from: 'typing' }, { at: 43.8, from: 'bot', card: 'extras' }]} />
        </div>
      </Phone>
      <Caption t={t} lines={[
        { at: 30.3, until: 32.4, text: 'แตะ “รอรับเงิน” ในเมนู' },
        { at: 32.5, until: 34.5, text: 'ได้การ์ดงานที่ยังไม่ได้รับเงิน พร้อมยอดรวม' },
        { at: 34.8, until: 36.7, text: 'พิมพ์สั้น ๆ เช่น กาแฟ80' },
        { at: 36.8, until: 38.9, text: 'ตรวจรายละเอียด แล้วกดยืนยันก่อนบันทึกทุกครั้ง' },
        { at: 39.0, until: 39.9, text: 'บันทึกเข้าบัญชีเดียวกับในแอป' },
        { at: 40.2, until: 42.5, text: 'แตะ “สรุปเดือนนี้” เพื่อดูรับจริง รายจ่าย และคงเหลือ' },
        { at: 42.8, until: 44.9, text: 'คลังเอกสาร ใบ 50 ทวิ ออกเอกสาร และปฏิทินเงิน' },
      ]} />
    </>
  );
}

function Closing({ t }: { t: number }) {
  const on = fadeIn(t, 45, 0.5);
  if (on <= 0) return null;
  const steps = ['สร้างรหัสที่ ตั้งค่า › การแจ้งเตือน › LINE', 'แอดเพื่อน @859mlugf', 'ส่งรหัสเข้าแชทภายใน 5 นาที'];
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: on, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ marginTop: 120, ...rise(t, 45.1, 0.6, 20) }}><Mascot mood="celebrate" action="hold-baht" animated={false} size={170} /></div>
      <h1 style={{ margin: '18px 40px 0', fontSize: 36, lineHeight: 1.25, fontWeight: 700, letterSpacing: -0.6, color: C.text, ...rise(t, 45.3) }}>เชื่อมต่อครั้งเดียว<br />ใช้ได้ทันที</h1>
      <div style={{ marginTop: 30, width: 420, textAlign: 'left' }}>
        {steps.map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', marginTop: i ? 10 : 0, borderRadius: 16, background: C.white, border: `1px solid ${C.border}`, ...rise(t, 45.6 + i * 0.22, 0.45, 14) }}>
            <span style={{ flex: 'none', width: 34, height: 34, borderRadius: '50%', background: C.primary, color: '#1C1917', fontWeight: 700, fontSize: 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Sans', sans-serif" }}>{i + 1}</span>
            <span style={{ fontSize: 17.5, fontWeight: 500, color: C.text, lineHeight: 1.4 }}>{step}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 44, ...rise(t, 46.6) }}><Wordmark size={40} /></div>
      <p style={{ marginTop: 14, fontSize: 14, color: C.sub, ...rise(t, 46.9) }}>ฟีเจอร์ LINE สำหรับสมาชิก Pro</p>
    </div>
  );
}

function Clip({ t }: { t: number }) {
  return (
    <div style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: C.bg, fontFamily: FONT, color: C.text }}>
      <div style={{ position: 'absolute', left: -120, top: -160, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(243,176,140,.28), rgba(243,176,140,0) 70%)' }} />
      <div style={{ position: 'absolute', right: -160, bottom: -200, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,241,232,.9), rgba(255,241,232,0) 70%)' }} />
      <Progress t={t} />
      <Title t={t} />
      <Connect t={t} />
      <HowItWorks t={t} />
      <WhatItDoes t={t} />
      <Closing t={t} />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__seek = (t: number) => { flushSync(() => root.render(<Clip t={t} />)); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__DURATION = DURATION;
// Opened by hand (index.html?play): plays in real time for a quick look.
if (new URLSearchParams(location.search).has('play')) { const start = performance.now(); const tick = () => { const t = ((performance.now() - start) / 1000) % DURATION; root.render(<Clip t={t} />); requestAnimationFrame(tick); }; tick(); }
else root.render(<Clip t={Number(new URLSearchParams(location.search).get('t') || 0)} />);
