import { BrandLockup } from '../../../components/brand/BrandLogo';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Menu, Pause, Play, Plus, X } from 'lucide-react';
import './kinetic.css';

type Props = { onNavigate?: (path: string) => void; loginHref?: string };
const screens = [
  { en: 'Overview', th: 'ภาพรวม', title: 'เห็นเงินชัด ก่อนตัดสินใจ', description: 'แยกมูลค่างาน เงินที่รับแล้ว ยอดที่ยังรอ และรายจ่าย ดูภาพรวมได้โดยไม่ต้องรวมเลขเอง', file: '/landing/dashboard.webp', alt: 'หน้าภาพรวมจริงของกระรอกตุนเงิน แสดงมูลค่างาน เงินรับจริง รอรับเงิน รายจ่าย และกำไรสุทธิ', note: 'เงินที่รับแล้ว ≠ มูลค่างานทั้งหมด', number: '01' },
  { en: 'Jobs', th: 'งาน', title: 'หลายงาน ก็จัดการไหว', description: 'เก็บลูกค้า มูลค่างาน สถานะ และกำหนดรับเงินไว้ด้วยกัน กลับมาดูเมื่อไหร่ก็รู้ว่างานไหนถึงขั้นตอนไหน', file: '/landing/jobs.webp', alt: 'หน้างานจริงของกระรอกตุนเงิน แสดงรายการงาน ลูกค้า ยอดเงิน และสถานะ', note: 'ทุกงาน ทุกลูกค้า อยู่ในที่เดียว', number: '02' },
  { en: 'Calendar', th: 'ปฏิทิน', title: 'วันส่งงาน กับวันเงินเข้า', description: 'เห็นกำหนดของแต่ละงานบนปฏิทิน วางแผนเวลาและเงินล่วงหน้าได้ แม้ลูกค้าจะจ่ายคนละวัน', file: '/landing/calendar.webp', alt: 'หน้าปฏิทินจริงของกระรอกตุนเงิน พร้อมกำหนดงานและวันรับเงิน', note: 'วางแผนวันนี้ มองเห็นวันถัดไป', number: '03' },
  { en: 'Expenses', th: 'รายจ่ายรวม', title: 'รู้ว่าเงินออกไปกับอะไร', description: 'บันทึกรายจ่าย แล้วดูยอดรวมเทียบกับเงินที่รับจริงในหน้าภาพรวม เห็นว่าเดือนนี้เหลือเท่าไหร่', file: '/landing/dashboard.webp', alt: 'หน้าภาพรวมจริง แสดงยอดรายจ่ายรวมและกำไรสุทธิของเดือน จากข้อมูลตัวอย่าง', note: 'ยอดรายจ่ายรวมในหน้าภาพรวม', number: '04' },
];
const people = [
  { en: 'Freelancers', th: 'ฟรีแลนซ์', text: 'หลายลูกค้า หลายวันจ่าย ก็เห็นเงินแต่ละงานชัด', image: 'freelancer' },
  { en: 'Creators', th: 'ครีเอเตอร์', text: 'ทำคอนเทนต์ให้เต็มที่ แล้วกลับมาดูเงินที่เดียว', image: 'creator' },
  { en: 'Side hustlers', th: 'คนมีงานเสริม', text: 'แยกให้ออกว่างานเสริมทำเงินให้เท่าไหร่', image: 'office-side-hustler' },
  { en: 'Students', th: 'นักศึกษารับงาน', text: 'เรียนไป รับงานไป เริ่มจัดการเงินของตัวเอง', image: 'student' },
];
const questions = [
  ['กระรอกตุนเงินช่วยอะไรบ้าง?', 'ช่วยรวมข้อมูลงานและเงินของคุณ ตั้งแต่บันทึกงาน ดูวันส่งงานและวันรับเงิน จดรายจ่าย ไปจนถึงดูภาพรวมว่าได้เงินแล้วเท่าไหร่ ยังรอเท่าไหร่ และเหลือจริงเท่าไหร่'],
  ['ต่างจากแอปจดรายรับ–รายจ่ายยังไง?', 'เริ่มได้ตั้งแต่ตอนรับงาน ก่อนเงินจะเข้าบัญชี คุณจึงเห็นทั้งมูลค่างาน ยอดที่รอรับ และวันรับเงิน พร้อมดูรายจ่ายและเงินที่รับแล้วในภาพเดียวกัน'],
  ['ต้องมีความรู้บัญชีก่อนไหม?', 'ไม่จำเป็นครับ เริ่มจากข้อมูลที่รู้ เช่น ชื่องาน ลูกค้า จำนวนเงิน และกำหนดรับเงิน แล้วค่อยอัปเดตเมื่อมีการรับเงินหรือรายจ่ายเกิดขึ้น'],
  ['ใช้บนมือถือได้ไหม?', 'ได้ครับ เปิดผ่านเว็บเบราว์เซอร์บนมือถือ แท็บเล็ต หรือคอมพิวเตอร์ได้ โดยหน้าแอปจะปรับตามขนาดหน้าจอ'],
  ['เริ่มใช้งานอย่างไร?', 'กด “เริ่มใช้งานฟรี” เพื่อไปหน้าสมัครหรือเข้าสู่ระบบ จากนั้นเพิ่มงานแรกของคุณได้เลย รายละเอียดแพ็กเกจและสิทธิ์การใช้งานดูได้ในแอป'],
];

function Brand() {
  return <BrandLockup size={32} />;
}
function Star({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M50 0 60 32 85 15 68 40 100 50 68 60 85 85 60 68 50 100 40 68 15 85 32 60 0 50 32 40 15 15 40 32Z" fill="currentColor" /></svg>;
}

export default function KineticLanding({ onNavigate, loginHref = '/login' }: Props) {
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);
  const [imageFailed, setImageFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const screen = screens[active];
  const stopMotion = paused || reduced;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync(); query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll('[data-reveal]');
    if (!nodes || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('ks-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); document.getElementById('ks-menu-toggle')?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);

  const start = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) { event.preventDefault(); onNavigate('/login'); }
  };
  const jump = (id: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault(); setMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: stopMotion ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(window.history.state, '', `#${id}`);
  };
  const selectScreen = (index: number) => { setImageFailed(false); setActive(index); };
  const cta = (label: string, className = 'ks-button') => <a className={className} href={loginHref} onClick={start}>{label}<ArrowUpRight size={20} aria-hidden="true" /></a>;

  return <div ref={root} className={`ks-landing ${stopMotion ? 'ks-paused' : ''}`}>
    <a className="ks-skip" href="#ks-main">ข้ามไปเนื้อหา</a>
    <header className="ks-header">
      <a href="#ks-top" onClick={event => jump('ks-top', event)} aria-label="กระรอกตุนเงิน หน้าแรก"><Brand /></a>
      <nav className="ks-desktop-nav" aria-label="เมนูหลัก"><a href="#ks-product" onClick={event => jump('ks-product', event)}>รู้จักกระรอก</a><a href="#ks-audience" onClick={event => jump('ks-audience', event)}>เหมาะกับใคร</a><a href="#ks-faq" onClick={event => jump('ks-faq', event)}>คำถามที่พบบ่อย</a></nav>
      <div className="ks-header-actions"><a className="ks-login" href={loginHref} onClick={start}>เข้าสู่ระบบ</a>{cta('เริ่มใช้ฟรี', 'ks-button ks-button-small')}<button className="ks-menu-button" id="ks-menu-toggle" aria-label={menu ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menu} aria-controls="ks-mobile-nav" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button></div>
      {menu && <nav id="ks-mobile-nav" className="ks-mobile-nav" aria-label="เมนูมือถือ">{[['ks-product','รู้จักกระรอก'],['ks-audience','เหมาะกับใคร'],['ks-faq','คำถามที่พบบ่อย']].map(([id,label]) => <a key={id} href={`#${id}`} onClick={event => jump(id,event)}>{label}<ArrowUpRight size={18}/></a>)}<a href={loginHref} onClick={start}>เข้าสู่ระบบ<ArrowUpRight size={18}/></a></nav>}
    </header>

    <main id="ks-main">
      <section className="ks-hero" id="ks-top" aria-labelledby="ks-headline">
        <div className="ks-hero-copy">
          <p className="ks-eyebrow"><span className="ks-dot"/> FOR INDEPENDENT MINDS</p>
          <h1 id="ks-headline"><span>YOUR WORK.</span><span>YOUR <em>MONEY.</em></span></h1>
          <h2>งานเยอะแค่ไหน <span>ก็เห็นเงินชัด</span></h2>
          <p className="ks-hero-description">เลขาการเงินสำหรับคนทำงานอิสระ<br/>รวมงาน เงินที่รอรับ และรายจ่ายไว้ในที่เดียว</p>
          <div className="ks-hero-ctas">{cta('เริ่มใช้งานฟรี')}<a href="#ks-product" className="ks-text-link" onClick={event => jump('ks-product', event)}>ดูการทำงาน<ArrowDown size={17} /></a></div>
          <p className="ks-small-note">เริ่มจากงานแรกของคุณ แล้วค่อย ๆ ตุนไปด้วยกัน</p>
        </div>
        <figure className="ks-orbit-card ks-orbit-left" aria-label="ตัวอย่างหน้าจองาน"><div className="ks-orbit-image"><img src="/landing/jobs.webp" alt="หน้ารายการงานจริง ข้อมูลตัวอย่าง" width="1996" height="1248" /></div><figcaption><span>Everything in its place</span><small>หน้าจอจริง · ข้อมูลตัวอย่าง</small></figcaption></figure>
        <figure className="ks-orbit-card ks-orbit-right" aria-label="ตัวอย่างหน้าจอปฏิทิน"><div className="ks-orbit-image"><img src="/landing/calendar.webp" alt="หน้าปฏิทินจริง ข้อมูลตัวอย่าง" width="1996" height="1248" /></div><figcaption><span>Good things, on schedule</span><small>หน้าจอจริง · ข้อมูลตัวอย่าง</small></figcaption></figure>
        <div className="ks-hero-bottom"><span className="ks-hand-note">เรื่องเงิน<br/>ให้น้องช่วยจำ <svg viewBox="0 0 90 45" aria-hidden="true"><path d="M5 5Q10 40 73 26M61 18l14 8-10 11"/></svg></span><img className="ks-hero-mascot" src="/line/mascot-v6-guide.png" alt="น้องกระรอกตุนเงินถือเหรียญ สวมแว่นกันแดด" width="1024" height="1024"/><a href="#ks-product" className="ks-scroll-cue" onClick={event => jump('ks-product', event)}>MEET YOUR MONEY SIDEKICK<ArrowDown size={18}/></a></div>
        <Star className="ks-star ks-star-one"/><Star className="ks-star ks-star-two"/>
      </section>

      <div className="ks-ticker" aria-label="งานเป็นระบบ เงินเป็นภาพ ชีวิตเป็นของคุณ"><div className="ks-ticker-track">{[0,1,2,3].map(i => <div key={i} aria-hidden={i > 0}><span>LESS MONEY MESS</span><Star/><span>MORE ROOM TO CREATE</span><Star/></div>)}</div></div>

      <section className="ks-intro ks-wrap" data-reveal>
        <p className="ks-eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
        <div className="ks-intro-grid"><h2>รับงานเก่งแล้ว<br/>เรื่องเงินก็<span className="ks-orange">เอาอยู่</span></h2><div className="ks-intro-detail"><p>รับงานหลายที่ เงินเข้าคนละวัน<br/>จดไว้หลายแอป จนเริ่มไม่แน่ใจว่า<br/><strong>“ตกลงเดือนนี้เหลือเท่าไหร่?”</strong></p><p className="ks-muted">กระรอกช่วยรวมภาพให้ชัด<br/>คุณจะได้มีเวลาให้กับงานที่รัก</p></div></div>
        <div className="ks-principles"><span><Check size={17}/> มองเห็นเงินที่ยังรอ</span><span><Check size={17}/> รู้วันส่งงานและวันรับเงิน</span><span><Check size={17}/> เข้าใจเงินที่เหลือจริง</span></div>
      </section>

      <section className="ks-product" id="ks-product" aria-labelledby="ks-product-title">
        <div className="ks-wrap"><div className="ks-section-heading" data-reveal><div><p className="ks-eyebrow">SMALL HABITS. BIG PICTURE.</p><h2 id="ks-product-title">เรื่องงาน เรื่องเงิน<br/><span className="ks-orange">เห็นภาพเดียวกัน</span></h2></div><p>เริ่มง่าย ๆ กับสิ่งที่ใช้ทุกวัน<br/>เลือกดูแต่ละมุมของกระรอกได้เลย</p></div>
        <div className="ks-tabs" role="tablist" aria-label="สำรวจฟีเจอร์">{screens.map((item, index) => <button key={item.en} id={`ks-tab-${index}`} role="tab" aria-selected={active===index} aria-controls="ks-screen-panel" tabIndex={active===index?0:-1} onClick={() => selectScreen(index)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4; selectScreen(next); document.getElementById(`ks-tab-${next}`)?.focus(); } }}><span className="ks-tab-number">0{index+1}</span><span>{item.th}<small>{item.en}</small></span><ArrowUpRight size={18}/></button>)}</div>
        <div id="ks-screen-panel" className="ks-screen-panel" role="tabpanel" aria-labelledby={`ks-tab-${active}`} tabIndex={0}>
          <div className="ks-screen-caption" key={screen.en}><div><h3>{screen.title}</h3><p>{screen.description}</p></div><span>{screen.number} / 04</span></div>
          <figure className={`ks-product-frame ${active===3?'ks-expense-screen':''}`}><div className="ks-window-bar"><span><i/><i/><i/></span><small>THE CASH SQUIRREL / {screen.en.toUpperCase()}</small><span className="ks-demo-tag">ข้อมูลตัวอย่าง</span></div>{imageFailed?<div className="ks-image-fallback">โหลดภาพไม่สำเร็จ <button onClick={() => setImageFailed(false)}>ลองอีกครั้ง</button></div>:<div className="ks-screen-scroll"><img key={screen.file} src={screen.file} alt={screen.alt} width="1996" height="1248" loading="lazy" onError={() => setImageFailed(true)}/></div>}<figcaption><span><span className="ks-dot"/> {screen.note}</span><span>หน้าจอแอปจริง · ข้อมูลตัวอย่าง</span></figcaption></figure>
          <p className="ks-mobile-screen-note">เลื่อนภาพซ้าย–ขวาเพื่อดูรายละเอียดหน้าจอเดสก์ท็อป</p>
        </div>
        </div>
      </section>

      <section className="ks-how ks-wrap" data-reveal><div className="ks-how-heading"><p className="ks-eyebrow">HOW WE KEEP IT SIMPLE</p><h2>เริ่มนิดเดียว<br/>เห็นภาพมากขึ้น</h2><img src="/line/mascot-v6-working.png" alt="น้องกระรอกกำลังทำงาน" width="150" height="150" loading="lazy"/></div><div className="ks-steps">{[['01','เพิ่มงานที่รับ','ใส่ชื่องาน ลูกค้า จำนวนเงิน และวันรับเงิน'],['02','อัปเดตเมื่อเงินขยับ','รับเงินแล้วก็บันทึก มีรายจ่ายก็จดไว้'],['03','กลับมาดูภาพรวม','รู้ว่าได้เงินเท่าไหร่ ยังรออะไร และเหลือเท่าไหร่']].map(([n,title,text])=><div className="ks-step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div><ArrowDown size={22}/></div>)}</div></section>

      <section className="ks-audience" id="ks-audience"><div className="ks-wrap"><div className="ks-section-heading" data-reveal><div><p className="ks-eyebrow">YOU DO YOU. WE DO THE NUMBERS.</p><h2>อิสระในแบบคุณ<br/><span>มีตัวช่วยเรื่องเงิน</span></h2></div><p>ไม่ว่ารับงานเต็มเวลา<br/>หรือเริ่มจากงานเล็ก ๆ หลังเลิกเรียน</p></div><div className="ks-people-grid">{people.map((person,index)=><article key={person.en} className="ks-person" data-reveal><div className="ks-person-photo"><img src={`/editorial/${person.image}.webp`} alt={`ภาพประกอบบุคคลสมมติ: ${person.th}`} width="1536" height="1024" loading="lazy"/><span>0{index+1}</span></div><div className="ks-person-copy"><p>{person.en}</p><h3>{person.th}</h3><span>{person.text}</span></div></article>)}</div><p className="ks-photo-note">ภาพประกอบบุคคลสมมติ สร้างด้วย AI</p></div></section>

      <section className="ks-faq ks-wrap" id="ks-faq" data-reveal><div><p className="ks-eyebrow">A FEW GOOD QUESTIONS</p><h2>สงสัยนิดนึง?</h2><p>ก่อนเริ่มตุน มาคุยกันก่อน</p><Star className="ks-faq-star"/></div><div className="ks-questions">{questions.map(([question,answer],index)=><div className="ks-question" key={question}><h3><button aria-expanded={openQuestion===index} aria-controls={`ks-answer-${index}`} id={`ks-question-${index}`} onClick={()=>setOpenQuestion(openQuestion===index?null:index)}>{question}<Plus size={21} className={openQuestion===index?'ks-plus-open':''}/></button></h3><div id={`ks-answer-${index}`} role="region" aria-labelledby={`ks-question-${index}`} hidden={openQuestion!==index}><p>{answer}</p></div></div>)}</div></section>

      <section className="ks-closing"><div className="ks-wrap"><div className="ks-closing-copy" data-reveal><p className="ks-eyebrow">MAKE SPACE FOR WHAT YOU LOVE</p><h2>DO YOUR THING.<br/><span>WE'RE HERE.</span></h2><p>คุณดูแลงานที่รัก<br/>ให้กระรอกช่วยดูภาพรวมเงิน</p>{cta('เริ่มตุนไปด้วยกัน', 'ks-button ks-button-cream')}</div><img src="/line/mascot-v6-saving.png" className="ks-closing-mascot" width="1024" height="1024" loading="lazy" alt="น้องกระรอกกับเงินออม"/><Star className="ks-closing-star"/></div></section>
    </main>
    <footer className="ks-footer"><div className="ks-wrap"><a href="#ks-top" aria-label="กลับด้านบน" onClick={event=>jump('ks-top',event)}><Brand/></a><p>A little squirrel. A clearer picture.</p><nav aria-label="ข้อมูลเว็บไซต์"><a href="/privacy.html">ความเป็นส่วนตัว</a><a href="/terms.html">ข้อตกลงการใช้งาน</a></nav><small>© {new Date().getFullYear()} The Cash Squirrel</small></div></footer>
    <button className="ks-motion-toggle" onClick={()=>setPaused(!paused)} aria-pressed={stopMotion} aria-label={stopMotion?'เปิดภาพเคลื่อนไหว':'หยุดภาพเคลื่อนไหว'} disabled={reduced} title={reduced?'ลดการเคลื่อนไหวตามการตั้งค่าอุปกรณ์':undefined}>{stopMotion?<Play size={14}/>:<Pause size={14}/>}<span>{stopMotion?'Motion off':'Motion on'}</span></button>
  </div>;
}
