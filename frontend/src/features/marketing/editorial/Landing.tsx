import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Expand, Menu, Moon, Pause, Play, Sun, X } from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import { ClosingAct } from '../landing/story/ClosingAct';
import ApprovedDocuments from './ApprovedDocuments';
import LineShowcase from './LineShowcase';
import OpeningAct from './OpeningAct';
import ProOverview from './ProOverview';
import Pricing from './Pricing';
import { PUBLIC_PHASE_ONE } from './publicPhase';
import PainBridge, { MotionVisual } from './MotionScenes';
import { PaymentStory, FollowupGraphic, MissingDocumentGraphic, VaultStory, MoneyGraphic, ExpenseGraphic } from './GraphicStories';
import './editorial.css';
import './editorial-refinement.css';
import './global-story.css';

const LOGIN = '/login';
type Theme = 'light' | 'dark';
function useReduced() {
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const q = matchMedia('(prefers-reduced-motion: reduce)'); const fn = () => setReduce(q.matches); q.addEventListener('change', fn); return () => q.removeEventListener('change', fn); }, []);
  return reduce;
}
function Label({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) { return <p className={`eyebrow ${pro ? 'pro-eyebrow' : ''}`}>{pro && <span>PRO</span>}{children}</p>; }
function Feature({ id, index, dark = false, reverse = false, children, visual }: { id: string; index: string; dark?: boolean; reverse?: boolean; children: React.ReactNode; visual: React.ReactNode }) {
  return <section id={id} className={`feature-section ${dark ? 'night-section' : ''}`}><div className={`editorial-wrap feature-grid ${reverse ? 'reverse' : ''}`}><div className="feature-copy">{children}</div><MotionVisual className="feature-visual">{visual}</MotionVisual></div></section>;
}
const fullAudience = [
  { key: 'freelancer', label: 'Freelancer', th: 'ฟรีแลนซ์', title: <>หลายงาน หลายลูกค้า<br />หลายวันจ่าย</>, description: 'รวมทุกงานไว้ด้วยกัน เห็นทั้งยอดที่รอและวันที่ควรได้เงิน', path: '/receivables/demo', scene: 'เงินค้างรับ', target: '#receivables' },
  { key: 'creator', label: 'Creator', th: 'ครีเอเตอร์ / อินฟลูเอนเซอร์', title: <>หลายแบรนด์ที่ร่วมงาน<br />จ่ายกันคนละวัน</>, description: 'เก็บรายละเอียดงาน พร้อมเอกสารและใบ 50 ทวิของแต่ละแบรนด์', path: '/jobs/demo', scene: 'งาน', target: '#wht50' },
  { key: 'tutor', label: 'Tutor', th: 'ติวเตอร์ / โค้ช', title: <>หลายคลาสที่สอน<br />หลายรอบที่ต้องรับเงิน</>, description: 'บันทึกงานแต่ละรอบ แล้วดูวันส่งงานและวันรับเงินในปฏิทิน', path: '/calendar/demo', scene: 'ปฏิทิน', target: '#credit' },
  { key: 'student', label: 'Student', th: 'นักศึกษาที่รับงาน', title: <>เรียนไป รับงานไป<br />เรื่องเงินก็เห็นภาพ</>, description: 'แยกมูลค่างานกับเงินที่รับจริง ดูรายจ่ายและเป้าหมายของตัวเอง', path: '/dashboard/demo', scene: 'ภาพรวม', target: '#dashboard' },
  { key: 'office-side-hustler', label: 'Side Hustler', th: 'พนักงานประจำที่มีงานเสริม', title: <>เงินจากงานเสริม<br />ไม่ได้เข้าพร้อมเงินเดือน</>, description: 'เห็นกำหนดรับเงินของแต่ละงาน เพื่อวางแผนเดือนถัดไป', path: '/calendar/demo?view=timeline', scene: 'ไทม์ไลน์', target: '#credit' },
];

const audience = PUBLIC_PHASE_ONE ? [
  { ...fullAudience[0], description: 'รวมรายละเอียดแต่ละงาน ดูยอดรายรับและวันรับเงินในปฏิทิน', path: '/jobs/demo', scene: 'งาน', target: '#credit' },
  { ...fullAudience[1], description: 'บันทึกงานของแต่ละแบรนด์ พร้อมออกใบแจ้งหนี้และใบเสร็จให้ลูกค้า', target: '#documents' },
  fullAudience[2],
  { ...fullAudience[3], description: 'แยกมูลค่างานกับเงินที่รับจริง ดูรายรับและรายจ่ายของตัวเอง' },
  fullAudience[4],
] : fullAudience;


export default function Landing() {
  const [theme, setTheme] = useState<Theme>('light'); const [menuOpen, setMenuOpen] = useState(false); const [person, setPerson] = useState(0);
  const reduced = useReduced();
  useEffect(() => {
    const original = document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    return () => { document.documentElement.classList.toggle('dark', original); };
  }, [theme]);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const who = audience[person];
  const nav = [{ href: '#credit', text: 'การทำงาน' }, { href: '#audience', text: 'เหมาะกับใคร' }, { href: '#plans', text: 'แพ็กเกจ' }, PUBLIC_PHASE_ONE ? { href: '#documents', text: 'เอกสาร' } : { href: '#pro', text: 'Pro มีอะไรบ้าง' }];
  return <div className={`editorial-landing ${theme === 'dark' ? 'dark' : ''}`}>
    <a className="skip-link" href="#main">ข้ามไปเนื้อหา</a>
    <header className="editorial-nav"><div className="nav-pill"><a href="#top" aria-label="กระรอกตุนเงิน หน้าแรก"><BrandLockup size={30} /></a><nav aria-label="เมนูหลัก">{nav.map(n => <a key={n.href} href={n.href}>{n.text}</a>)}</nav><div className="nav-actions"><button className="icon-button" aria-label={theme === 'light' ? 'ดูโหมดมืด' : 'ดูโหมดสว่าง'} onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button><a className="login-link" href={LOGIN}>เข้าสู่ระบบ</a><a className="nav-start" href={LOGIN}>เริ่มใช้งานฟรี <ArrowUpRight size={15} /></a><button className="mobile-menu icon-button" aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div></div>{menuOpen && <nav className="mobile-links" aria-label="เมนูมือถือ">{nav.map(n => <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.text}<ArrowRight size={16} /></a>)}<a href={LOGIN}>เข้าสู่ระบบ<ArrowUpRight size={16} /></a></nav>}</header>
    <main id="main">
      <section id="top" className="editorial-hero has-opening"><OpeningAct login={LOGIN} reduced={reduced} /></section>
      <PainBridge />
      <PaymentStory />

      {!PUBLIC_PHASE_ONE && <Feature id="receivables" index="02" visual={<FollowupGraphic />}><h2>งานจบแล้ว<br/><span className="soft-text">เรื่องตามเงิน<br/>ยังมีคนช่วยจำ</span></h2><p>เห็นงานที่เลยกำหนด ก่อนหลุดจากความจำ</p><a className="text-link" href="#line">ให้ LINE ช่วยเตือน <ArrowRight size={17}/></a></Feature>}

      {!PUBLIC_PHASE_ONE && <Feature id="wht50" index="03" reverse visual={<MissingDocumentGraphic />}><Label pro>ครบทั้งเงินและเอกสาร</Label><h2>เงินเข้าแล้ว<br/><span className="soft-text">ใบ 50 ทวิ<br/>ก็ไม่หลุด</span></h2><p>รู้ว่าใบไหนยังรอ แนบแล้วก็รู้ว่าครบ</p></Feature>}

      {!PUBLIC_PHASE_ONE && <VaultStory />}

      <ApprovedDocuments />

      {!PUBLIC_PHASE_ONE && <ProOverview />}
      {!PUBLIC_PHASE_ONE && <LineShowcase />}

      <section id="audience" className="audience-section"><div className="editorial-wrap"><div className="section-heading"><h2>งานไม่เหมือนใคร<br/><span className="soft-text">เรื่องเงินก็มีตัวช่วย</span></h2></div><div className="audience-tabs" role="tablist" aria-label="เลือกอาชีพ">{audience.map((a, i) => <button key={a.key} id={`audience-tab-${i}`} role="tab" aria-selected={person === i} aria-controls="audience-panel" tabIndex={person === i ? 0 : -1} onClick={() => setPerson(i)} onKeyDown={e => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 4 : (i + (e.key === 'ArrowRight' ? 1 : 4)) % 5; setPerson(next); document.getElementById(`audience-tab-${next}`)?.focus(); } }}>{a.label}</button>)}</div><div id="audience-panel" className="audience-panel" role="tabpanel" aria-labelledby={`audience-tab-${person}`}><figure className="audience-photo"><img key={who.key} src={`/editorial/${who.key}.webp`} width="1536" height="1024" alt={`ภาพประกอบบุคคลสมมติ: ${who.th}`} loading="lazy" /><figcaption>ภาพประกอบบุคคลสมมติ สร้างด้วย AI</figcaption></figure><div className="audience-story"><p className="eyebrow">{who.th}</p><h3>{who.title}</h3><p>{who.description}</p><a className="text-link" href={who.target}>ดูว่ากระรอกช่วยยังไง <ArrowRight size={17} /></a></div></div></div></section>

      <section id="dashboard" className="dashboard-section"><div className="editorial-wrap"><div className="dashboard-heading"><div><h2>รับงานไว้เท่าไหร่<br/><span className="soft-text">มีใช้จริงเท่าไหร่</span></h2></div><p>แยกให้เห็น ไม่ต้องคิดในหัว</p></div><MotionVisual><MoneyGraphic /></MotionVisual></div></section>

      <Feature id="expenses" index="05" reverse visual={<ExpenseGraphic />}><h2>ทีละนิด<br/><span className="soft-text">รู้ว่าเงินไปไหน</span></h2><p>จดตามหมวด เห็นรายจ่ายทั้งเดือน</p></Feature>

      {!PUBLIC_PHASE_ONE && <section id="team" className="team-section"><div className="editorial-wrap team-grid"><div><Label>COMING SOON · เร็ว ๆ นี้</Label><h2>Group &amp; Team<br /><span className="soft-text">กำลังมา</span></h2><p>แชร์ Workspace<br />และจัดการงานร่วมกันได้ง่ายขึ้น</p></div><div className="team-concept" role="img" aria-label="ภาพแนวคิดการทำงานร่วมกัน ฟีเจอร์เร็ว ๆ นี้"><svg viewBox="0 0 500 280" aria-hidden="true"><path d="M90 76 Q245 15 410 76 M90 76 Q95 240 250 218 M410 76 Q395 240 250 218" /></svg><img className="team-person one" src="/editorial/freelancer.webp" alt="" loading="lazy" /><img className="team-person two" src="/editorial/creator.webp" alt="" loading="lazy" /><div className="team-brand"><img src="/brand/logo01-v1/symbol-ci.svg" alt="" /></div><span className="concept-label">ภาพแนวคิด · ยังไม่เปิดใช้งาน</span></div></div></section>}

      <Pricing login={LOGIN} />
    </main>
    <div id="final-cta"><ClosingAct onStart={() => { location.href = LOGIN; }} onLogin={() => { location.href = LOGIN; }} /></div>
  </div>;
}
