import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Bell, CalendarDays, ChevronLeft, Menu, Pause, PencilLine, Play, RotateCcw, Send, Signal, Wifi, BatteryFull, Plus, Check } from 'lucide-react';
import './line-showcase.css';

type View = 'home' | 'entry' | 'draft' | 'saved' | 'cancelled' | 'month' | 'reminder' | 'unpaid' | 'summary' | 'wip' | 'app';
const CARDS: Partial<Record<View, { file: string; alt: string; command?: string }>> = {
  entry: { file: 'entry-help.png', alt: 'วิธีเพิ่มรายการจากการ์ดทางการของกระรอกตุนเงิน', command: 'เพิ่มรายการ' },
  draft: { file: 'draft-expense-complete.webp', alt: 'ตรวจรายจ่ายกาแฟ 80 บาท ก่อนยืนยันบันทึก', command: 'กาแฟ80' },
  saved: { file: 'saved-expense.webp', alt: 'บันทึกตัวอย่างรายจ่ายกาแฟ 80 บาทแล้ว คงเหลือในตัวอย่าง 14,920 บาท', command: 'กาแฟ80' },
  reminder: { file: 'reminder-combined.webp', alt: 'การ์ดแจ้งเตือนงานเลยกำหนด วันนี้ และใกล้ครบกำหนด' },
  month: { file: 'report-month-jobs.webp', alt: 'การ์ดงานเดือนนี้: รอรับเงิน รับครบแล้ว และกำลังดำเนินงาน', command: 'งานเดือนนี้' },
  unpaid: { file: 'report-unpaid.png', alt: 'การ์ดงานที่รอรับเงินจากชุดตัวอย่างทางการ', command: 'รอรับเงิน' },
  summary: { file: 'report-monthly.png', alt: 'การ์ดสรุปรายรับรายจ่ายเดือนนี้จากชุดตัวอย่างทางการ', command: 'สรุปเดือนนี้' },
  wip: { file: 'report-wip.png', alt: 'การ์ดงานที่กำลังดำเนินงานจากชุดตัวอย่างทางการ', command: 'กำลังดำเนินงาน' },
};
const TOUR: { view: View; tap?: string; caption: string; duration: number }[] = [
  { view: 'home', tap: 'month', caption: 'แตะ “งานเดือนนี้” จากเมนูในแชต', duration: 1600 },
  { view: 'month', caption: 'กระรอกรวมงานทั้งเดือนมาให้', duration: 2800 },
  { view: 'home', tap: 'entry', caption: 'นึกค่าใช้จ่ายได้ ก็แตะเพิ่มรายการ', duration: 1600 },
  { view: 'entry', tap: 'send', caption: 'ลองพิมพ์สั้น ๆ ว่า “กาแฟ80”', duration: 2200 },
  { view: 'draft', tap: 'confirm', caption: 'ตรวจรายการ แล้วแตะยืนยัน', duration: 3100 },
  { view: 'saved', caption: 'บันทึกแล้ว พร้อมเห็นยอดที่เหลือ', duration: 1800 },
];
const MENU = [
  { id:'entry', label:'เพิ่มรายการ', className:'menu-add' },
  { id:'unpaid', label:'รอรับเงิน', className:'menu-unpaid' },
  { id:'summary', label:'สรุปเดือนนี้', className:'menu-summary' },
  { id:'month', label:'งานเดือนนี้', className:'menu-month' },
  { id:'wip', label:'กำลังดำเนินงาน', className:'menu-wip' },
  { id:'app', label:'เปิดแอป', className:'menu-app' },
] as const;

/** Interactive presentation: exact owner-supplied cards/menu in a phone mockup. No LINE requests or account writes. */
export default function LineShowcase() {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(true);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [foreground, setForeground] = useState(!document.hidden);
  const started = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inView = useInView(stage, { amount: .4 });
  const reduced = useReducedMotion();
  const card = CARDS[view];
  const tour = TOUR[step];
  const tap = playing ? tour.tap : undefined;
  useEffect(() => {
    const update = () => { setForeground(!document.hidden); if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!inView || reduced) { setPlaying(false); return; }
    if (!started.current && foreground) { started.current = true; setPlaying(true); }
  }, [inView, reduced, foreground]);
  useEffect(() => {
    if (!playing || !inView || !foreground || reduced) return;
    const next = TOUR[step];
    setView(next.view); setMenuOpen(next.view === 'home'); setInput(next.view === 'entry' ? 'กาแฟ80' : ''); setNotice('');
    const timer = window.setTimeout(() => {
      if (step === TOUR.length - 1) setPlaying(false);
      else setStep(s => s + 1);
    }, next.duration);
    return () => window.clearTimeout(timer);
  }, [playing, step, inView, foreground, reduced]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (chat.current) chat.current.scrollTop = view === 'draft' || view === 'saved' ? chat.current.scrollHeight : 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [view, menuOpen]);
  const stop = () => { started.current = true; setPlaying(false); };
  const choose = (next: View) => { stop(); if (next === 'app') { window.location.assign('/login'); return; } setView(next); setMenuOpen(next === 'home'); setInput(''); setNotice(''); };
  const send = () => {
    stop(); const value = input.replace(/\s/g, '');
    if (value === 'กาแฟ80') { setView('draft'); setMenuOpen(false); setNotice(''); setInput(''); }
    else { const target = MENU.find(item => item.label.replace(/\s/g, '') === value); if (target) choose(target.id); else setNotice('เดโมนี้ลองพิมพ์ “กาแฟ80” หรือเลือกเมนูด้านล่างได้เลย'); }
  };
  const startTour = () => {
    started.current = true;
    if (reduced) { setView('home'); setMenuOpen(true); return; }
    setStep(0); setView('home'); setMenuOpen(true); setPlaying(true); setNotice('');
  };
  const currentCaption = playing ? tour.caption : view === 'saved' ? 'ยืนยันแล้ว · ลองเมนูอื่นต่อได้เลย' : view === 'draft' ? 'แตะ “ยืนยันบันทึก” บนการ์ดได้เลย' : view === 'app' ? 'แอปจริงพร้อมข้อมูลตัวอย่าง · ลองแตะเมนูได้' : 'ลองแตะปุ่มบนมือถือได้เลย';
  return <section id="line" className="line-showcase" aria-labelledby="line-showcase-heading"><div className="editorial-wrap line-showcase-layout">
    <div className="line-showcase-copy">
      <p className="line-showcase-badge">PRO · LINE</p>
      <h2 id="line-showcase-heading">ผู้ช่วยเรื่องเงิน<br/><span className="soft-text">ในแชตที่คุ้นเคย</span></h2>
      <p className="line-showcase-support">จด ดูงาน ให้เตือน — ลองแตะได้เลย</p>
      <div className="line-story-choices" role="group" aria-label="เลือกลองใช้งาน LINE">
        <button type="button" aria-pressed={view === 'reminder'} onClick={() => choose('reminder')}><Bell size={18}/><span>ถึงเวลา กระรอกเตือน</span><ArrowRight size={16}/></button>
        <button type="button" aria-pressed={view === 'month'} onClick={() => choose('month')}><CalendarDays size={18}/><span>งานเดือนนี้ มีอะไรบ้าง</span><ArrowRight size={16}/></button>
        <button type="button" aria-pressed={['entry','draft','saved'].includes(view)} onClick={() => { choose('entry'); setInput('กาแฟ80'); }}><PencilLine size={18}/><span>นึกได้ตอนนี้ ก็จดได้เลย</span><ArrowRight size={16}/></button>
      </div>
      <div className="line-demo-actions"><button type="button" className="solid-button" onClick={startTour}>{playing ? <RotateCcw size={16}/> : <Play size={16}/>}ดูตัวอย่างการใช้งาน</button><button type="button" className="text-link" onClick={() => choose('home')}>ลองกดเอง <ArrowUpRight size={16}/></button></div>
      <p className="line-showcase-condition">สำหรับ Pro · เชื่อมบัญชี LINE ก่อนใช้งาน<br />เดโมนี้ใช้ข้อมูลตัวอย่าง ไม่บันทึกเข้าบัญชี</p>
    </div>
    <div className="phone-presentation" ref={stage}>
      <div className="phone-aura" aria-hidden="true"/><div className="phone-ground" aria-hidden="true"/>
      <div className="line-phone" aria-label="มือถือสาธิตการใช้งานกระรอกตุนเงินผ่าน LINE">
        <div className="phone-side side-left"/><div className="phone-side side-right"/>
        <div className="phone-screen">
          <div className="phone-status" aria-hidden="true"><span>9:41</span><i/><span><Signal size={13}/><Wifi size={13}/><BatteryFull size={17}/></span></div>
          <div className="phone-chat-header"><button type="button" aria-label="กลับเมนู LINE" onClick={() => choose('home')}><ChevronLeft size={23}/></button><img src="/brand/logo01-v1/symbol-ci.svg" width="26" height="26" alt=""/><div>กระรอกตุนเงิน<small>{view === 'app' ? 'แอปตัวอย่าง' : 'LINE Official Account'}</small></div><button type="button" aria-label="เปิดเมนูในมือถือ" aria-expanded={menuOpen} onClick={() => { stop(); if(view === 'app') setView('home'); setMenuOpen(v=>!v); }}><Menu size={19}/></button></div>
          <>
            <div className="phone-chat" ref={chat}>
              <span className="chat-day">วันนี้</span>
              {card?.command && <div className="phone-sent">{card.command}<small>อ่านแล้ว</small></div>}
              {view === 'home' && <div className="phone-welcome"><img src="/mascots/character-full.svg" width="52" height="52" alt=""/><strong>วันนี้ให้กระรอกช่วยอะไรดี?</strong><p>เลือกเมนูด้านล่าง<br />หรือลองพิมพ์ “กาแฟ80”</p></div>}
              {view === 'cancelled' && <div className="phone-local-notice"><Check size={19}/><p>ยกเลิกร่างแล้ว<br /><span>รายการนี้ยังไม่ได้บันทึก</span></p><button type="button" onClick={()=>{choose('entry');setInput('กาแฟ80');}}>ลองใหม่</button></div>}
              {card && <div className="phone-reply"><img className="chat-avatar" src="/mascots/character-full.svg" alt=""/><div className="phone-flex-card"><img src={`/line-source/${card.file}`} alt={card.alt} draggable={false} onLoad={()=>{if(chat.current&&(view==='draft'||view==='saved'))chat.current.scrollTop=chat.current.scrollHeight;}}/>
                {view === 'draft' && <><button type="button" className={`card-hotspot confirm-hotspot ${tap === 'confirm' ? 'tap-active' : ''}`} aria-label="ยืนยันบันทึกกาแฟ 80 บาทในเดโม" onClick={() => choose('saved')}><span className="tap-ring"/></button><button type="button" className="card-hotspot edit-hotspot" aria-label="แก้ไขร่างรายการในเดโม" onClick={()=>{choose('entry');setInput('กาแฟ80');inputRef.current?.focus();}}/><button type="button" className="card-hotspot cancel-hotspot" aria-label="ยกเลิกร่างรายการในเดโม" onClick={()=>choose('cancelled')}/></>}
              </div></div>}
              {view === 'entry' && <button type="button" className="phone-example" onClick={()=>{stop();setInput('กาแฟ80');inputRef.current?.focus();}}>ลองจด “กาแฟ80” <ArrowRight size={13}/></button>}
              {view === 'saved' && <div className="phone-demo-success"><Check size={13}/>บันทึกตัวอย่างแล้ว</div>}
              {notice && <p className="phone-input-hint" role="status">{notice}</p>}
            </div>
            {menuOpen && <div className="phone-rich-menu"><img src="/line-source/rich-menu.webp" width="2500" height="1686" alt="เมนูทางการของกระรอกตุนเงิน"/>{MENU.map(item=><button key={item.id} type="button" className={`${item.className} ${tap === item.id ? 'tap-active' : ''}`} aria-label={`${item.label} ในมือถือ`} onClick={()=>choose(item.id)}><span className="tap-ring"/></button>)}</div>}
            <form className="phone-composer" onSubmit={e=>{e.preventDefault();send();}}><button type="button" aria-label={menuOpen?'ซ่อนเมนูในมือถือ':'แสดงเมนูในมือถือ'} aria-expanded={menuOpen} onClick={()=>{stop();setMenuOpen(v=>!v);}}><Menu size={19}/></button><button type="button" aria-label="เพิ่มรายการในมือถือ" onClick={()=>choose('entry')}><Plus size={19}/></button><input ref={inputRef} value={input} onChange={e=>{stop();setInput(e.target.value);}} onFocus={()=>{stop();setMenuOpen(false);}} placeholder="ลองพิมพ์ กาแฟ80" aria-label="ข้อความทดลองส่งถึงกระรอก"/><button type="submit" aria-label="ส่งข้อความในเดโม" disabled={!input.trim()} className={tap === 'send'?'tap-active':''}><Send size={17}/><span className="tap-ring"/></button></form>
          </>
          <div className="phone-home-bar" aria-hidden="true"><i/></div>
        </div>
      </div>
      <div className="phone-caption"><span aria-live="polite">{currentCaption}</span><button type="button" aria-label={playing?'หยุดสาธิตมือถือ':'เล่นสาธิตมือถือ'} onClick={()=>playing?stop():startTour()}>{playing?<Pause size={14}/>:<RotateCcw size={14}/>}</button></div>
      <p className="line-showcase-provenance">ม็อคอัพโต้ตอบ · การ์ดและเมนูจากชุด LINE ของกระรอกตุนเงิน</p>
    </div>
  </div></section>;
}
