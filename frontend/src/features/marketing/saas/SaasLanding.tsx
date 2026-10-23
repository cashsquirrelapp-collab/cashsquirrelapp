import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Bell, Briefcase, CalendarDays, ChevronDown, CreditCard, FileText, LayoutDashboard,
  ListChecks, Menu, MessageCircle, PieChart, Receipt, RotateCcw, Wallet, X, Zap, type LucideIcon,
} from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import './saas.css';
import { PRO_PRICING, PRO_REGULAR_MONTHLY, formatBaht } from '../../../../../shared/proPricing';

import { tr, trc, T } from '../../../i18n/tr';
// Landing page after the owner's reference (2026-10-20): split hero with the real desktop and phone
// screens, a feature bar that drives a product showcase, current features, reminders, LINE AI Pro,
// pricing, FAQ and a closing call to action. Product images are screenshots of the real app with
// example data (public/landing-v3, captured by artifacts/landing-v3/capture.mjs). Every claim matches
// what works today; what does not is marked "เร็ว ๆ นี้". The previous landing stays in ../editorial.

const LOGIN = '/login';
const SOON = T("เร็ว ๆ นี้");
const EASE = [0.22, 1, 0.36, 1] as const;

type ShowcaseKey = 'overview' | 'jobs' | 'receivables' | 'expenses' | 'calendar' | 'documents';
const SHOWCASE: { key: ShowcaseKey; tab: string; title: string; text: string; image: string; alt: string }[] = [
  { key: 'overview', tab: T("ภาพรวม"), title: T("เห็นเงินทั้งเดือนในหน้าเดียว"), text: T("มูลค่างาน เงินที่รับจริง รายจ่าย และกำไรสุทธิ"), image: 'desktop-overview', alt: T("หน้าภาพรวมของกระรอกตุนเงิน") },
  { key: 'jobs', tab: T("งาน"), title: T("ทุกงาน ทุกลูกค้า อยู่ในรายการเดียว"), text: T("สถานะงาน การรับเงิน และเครดิตเทอมของแต่ละงาน"), image: 'desktop-jobs', alt: T("หน้ารายการงาน") },
  { key: 'receivables', tab: T("เงินรอรับ"), title: T("รู้ว่าเงินก้อนไหนยังไม่เข้า"), text: T("เรียงตามวันครบกำหนด รับเงินบางส่วนหรือทั้งหมดได้ทันที"), image: 'desktop-receivables', alt: T("หน้าเงินรอรับ") },
  { key: 'expenses', tab: T("รายจ่าย"), title: T("จดรายจ่ายตามหมวด"), text: T("ดูรายจ่ายทั้งเดือน รวมรายการประจำ"), image: 'desktop-expenses', alt: T("หน้ารายจ่าย") },
  { key: 'calendar', tab: T("ปฏิทิน"), title: T("วันส่งงานและวันรับเงินบนปฏิทิน"), text: T("ดูเป็นเดือนหรือไทม์ไลน์ เห็นเงินที่จะเข้าในแต่ละวัน"), image: 'desktop-calendar', alt: T("หน้าปฏิทิน") },
  { key: 'documents', tab: T("เอกสาร"), title: T("ใบเสนอราคาถึงใบเสร็จ ในไม่กี่คลิก"), text: T("ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษี พร้อม PDF"), image: 'desktop-documents', alt: T("หน้าเอกสาร") },
];

const FEATURE_BAR: { label: string; icon: LucideIcon; target: ShowcaseKey | 'reminders' }[] = [
  { label: T("ภาพรวมการเงิน"), icon: PieChart, target: 'overview' },
  { label: T("จัดการงาน"), icon: Briefcase, target: 'jobs' },
  { label: T("ติดตามเงินรอรับ"), icon: Wallet, target: 'receivables' },
  { label: T("รายจ่าย"), icon: Receipt, target: 'expenses' },
  { label: T("ปฏิทินและไทม์ไลน์"), icon: CalendarDays, target: 'calendar' },
  { label: T("ใบเสนอราคาและใบเสร็จ"), icon: FileText, target: 'documents' },
  { label: T("แจ้งเตือนกำหนดรับเงิน"), icon: Bell, target: 'reminders' },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: LayoutDashboard, title: T("ภาพรวมการเงิน"), text: T("มูลค่างาน รับจริง รายจ่าย กำไรสุทธิ") },
  { icon: Briefcase, title: T("บันทึกและจัดการงาน"), text: T("สถานะงาน ลูกค้า และเครดิตเทอม") },
  { icon: Wallet, title: T("ติดตามเงินที่ยังรอรับ"), text: T("รับบางส่วนหรือรับครบ บันทึกได้ทันที") },
  { icon: Receipt, title: T("บันทึกรายจ่าย"), text: T("แยกหมวด และรายจ่ายประจำ") },
  { icon: CalendarDays, title: T("ปฏิทินและไทม์ไลน์"), text: T("วันส่งงานและวันครบกำหนดรับเงิน") },
  { icon: FileText, title: T("ใบเสนอราคา"), text: T("สร้างและดาวน์โหลดเป็น PDF") },
  { icon: ListChecks, title: T("ใบเสร็จรับเงิน"), text: T("ออกต่อจากงานที่รับเงินแล้ว") },
  { icon: Bell, title: T("เตือนก่อนครบกำหนดรับเงิน"), text: T("เห็นงานที่ใกล้ถึงวันจ่าย") },
  { icon: Bell, title: T("เตือนเมื่อเลยกำหนด"), text: T("งานที่ยังไม่ได้เงินไม่หลุดสายตา") },
];

// What the LINE official account does today (the webhook, the rich menu, and the owner's LINE
// FEATURE-STATUS hand-off of 2026-10-14). Needs Pro or the Pro trial, and a linked LINE account.
const LINE_TILES: { icon: LucideIcon; label: string }[] = [
  { icon: MessageCircle, label: T("พิมพ์สั้น ๆ\nตรวจแล้วค่อยบันทึก") },
  { icon: Wallet, label: T("ดูเงินรอรับ\nและสรุปเดือนนี้") },
  { icon: FileText, label: T("เรียกดูเอกสาร\nเปิด PDF ต่อได้") },
  { icon: Bell, label: T("เตือนงาน\nใกล้ครบกำหนด") },
];

const FREE: string[] = [
  T("บันทึกงาน รายรับ และรายจ่าย"),
  T("ภาพรวม ปฏิทิน และไทม์ไลน์"),
  T("ติดตามเงินรอรับ พร้อมแจ้งเตือนในแอป"),
  T("ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี 10 ใบใหม่ต่อเดือน"),
];
const PRO: { text: string; soon?: boolean }[] = [
  { text: T("ทุกฟีเจอร์พื้นฐาน") },
  { text: T("ออกเอกสารไม่จำกัด ไม่มีลายน้ำ") },
  { text: T("บันทึกงานผ่านแชต LINE") },
  { text: T("ดูงานค้างจ่ายและสรุปเดือนนี้ใน LINE") },
  { text: T("แจ้งเตือนทาง LINE และอีเมลตามที่ตั้งค่า") },
  { text: T("ผู้ช่วยการเงิน AI ใน LINE"), soon: true },
  { text: T("ออกเอกสารผ่าน LINE"), soon: true },
];

const FAQ: { q: string; a: string }[] = [
  { q: T("กระรอกตุนเงินเหมาะกับใคร?"), a: T("ฟรีแลนซ์ ครีเอเตอร์ ติวเตอร์ และคนที่รับงานจากหลายลูกค้า แล้วอยากเห็นว่าเงินก้อนไหนเข้าแล้ว ก้อนไหนยังรอ") },
  { q: T("เริ่มใช้งานฟรีได้ไหม?"), a: T("ได้ สมัครด้วย Google, Facebook หรืออีเมล ไม่ต้องใช้บัตร") },
  { q: T("Pro ต่างจาก Free อย่างไร?"), a: T("Pro ออกเอกสารได้ไม่จำกัดและไม่มีลายน้ำ ใช้ผู้ช่วยใน LINE และรับแจ้งเตือนทาง LINE หรืออีเมลได้ ส่วน Free ออกเอกสารใหม่ได้ 10 ใบต่อเดือน") },
  { q: T("ออกใบเสนอราคาได้ไหม?"), a: T("ได้ทั้ง Free และ Pro พร้อมใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี และดาวน์โหลด PDF") },
  { q: T("เชื่อมต่อ LINE อย่างไร?"), a: T("สมัคร Pro แล้วไปที่ ตั้งค่า > LINE กดเชื่อมต่อ แล้วทำตามขั้นตอนใน LINE") },
  { q: T("ยกเลิก Pro ได้ไหม?"), a: T("ได้ทุกเมื่อจากหน้าแพ็กเกจ สิทธิ์ใช้ต่อได้ถึงสิ้นรอบที่ชำระแล้ว") },
];

function Reveal({ children, className, delay = 0, as = 'div', id }: { children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'section'; id?: string }) {
  const reduce = useReducedMotion();
  const Tag = as === 'section' ? motion.section : motion.div;
  return (
    <Tag id={id} className={className} initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }} transition={{ duration: 0.5, ease: EASE, delay }}>
      {children}
    </Tag>
  );
}

function Laptop({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="sl-laptop" aria-label={alt} role="img">
      <div className="sl-laptop-screen"><img src={src} alt="" width={1440} height={900} /></div>
      <div className="sl-laptop-base" aria-hidden="true" />
    </div>
  );
}

function Phone({ children, label, className = '' }: { children: React.ReactNode; label: string; className?: string }) {
  return <div className={`sl-phone ${className}`} role="img" aria-label={label}><div className="sl-phone-screen">{children}</div></div>;
}

export default function SaasLanding() {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<ShowcaseKey>('overview');
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const [petting, setPetting] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // The app may have left the dark class on <html>; this page is light only.
  useEffect(() => {
    const root = document.documentElement; const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => { if (wasDark) root.classList.add('dark'); };
  }, []);

  const goTo = (target: ShowcaseKey | 'reminders') => {
    if (target !== 'reminders') setTab(target);
    document.getElementById(target === 'reminders' ? 'reminders' : 'showcase')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const active = SHOWCASE.find(item => item.key === tab) ?? SHOWCASE[0];
  const step = (delta: number) => setTab(current => SHOWCASE[(SHOWCASE.findIndex(item => item.key === current) + delta + SHOWCASE.length) % SHOWCASE.length].key);
  const nav = [{ href: '#features', text: tr("ฟีเจอร์") }, { href: '#showcase', text: tr("วิธีใช้งาน") }, { href: '#pricing', text: trc("nav", "ราคา") }, { href: '#line-pro', text: 'Pro' }];
  const rise = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.58, ease: EASE, delay } });

  return (
    <div className="sl">
      <a className="sl-skip" href="#sl-main">{tr("ข้ามไปเนื้อหา")}</a>
      <header className={`sl-nav${scrolled ? ' is-scrolled' : ''}`}>
        <div className="sl-wrap sl-nav-row">
          <a href="#top" className="sl-logo" aria-label={tr("กระรอกตุนเงิน หน้าแรก")}><BrandLockup size={30} /></a>
          <nav className="sl-nav-links" aria-label={tr("เมนูหลัก")}>{nav.map(n => <a key={n.href} href={n.href}>{n.text}</a>)}</nav>
          <div className="sl-nav-actions">
            <a className="sl-login" href={LOGIN}>{tr("เข้าสู่ระบบ")}</a>
            <a className="sl-btn is-primary is-small" href={LOGIN}>{tr("เริ่มใช้งานฟรี")}{' '}<ArrowUpRight size={15} /></a>
            <button type="button" className="sl-menu-btn" aria-label={menuOpen ? tr("ปิดเมนู") : tr("เปิดเมนู")} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {menuOpen && <nav className="sl-mobile-links" aria-label={tr("เมนู")}>{nav.map(n => <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.text}<ArrowRight size={16} /></a>)}<a href={LOGIN}>{tr("เข้าสู่ระบบ")}<ArrowUpRight size={16} /></a></nav>}
      </header>

      <main id="sl-main">
        <section id="top" className="sl-hero">
          <div className="sl-wrap sl-hero-grid">
            <div className="sl-hero-copy">
              <motion.p className="sl-eyebrow" {...rise(0)}><span />YOUR PERSONAL FINANCE ASSISTANT</motion.p>
              <motion.h1 {...rise(0.06)}>{tr("เรื่องเงินของคุณ")}<br /><em>{tr("เราช่วยดูแล")}</em></motion.h1>
              <motion.p className="sl-lead" {...rise(0.14)}>{tr("บันทึกงาน ติดตามเงิน จัดการรายจ่าย")}<br />{tr("และเอกสาร ทั้งหมดในที่เดียว")}</motion.p>
              <motion.div className="sl-cta-row" {...rise(0.22)}>
                <a className="sl-btn is-primary" href={LOGIN}>{tr("เริ่มใช้งานฟรี")}{' '}<ArrowRight size={17} /></a>
                <a className="sl-btn is-ghost" href="#showcase">{tr("ดูวิธีใช้งาน")}</a>
              </motion.div>
            </div>
            <motion.div className="sl-hero-visual" initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.18 }}>
              <span className="sl-hero-glow" aria-hidden="true" />
              <Laptop src="/landing-v3/desktop-overview.webp" alt={tr("หน้าภาพรวมบนคอมพิวเตอร์")} />
              <Phone className="sl-hero-phone" label={tr("หน้าภาพรวมบนมือถือ")}><img src="/landing-v3/phone-overview.webp" alt="" width={1170} height={2532} /></Phone>
              <img className="sl-hero-mascot" src="/line/mascot-v6-working.png" alt="" width={1024} height={1024} />
              <p className="sl-shot-note">{tr("ภาพจากแอปจริง · ข้อมูลตัวอย่าง")}</p>
            </motion.div>
          </div>
        </section>

        <div className="sl-wrap">
          <nav className="sl-featurebar" aria-label={tr("ฟีเจอร์")}>
            {FEATURE_BAR.map(item => {
              const selected = item.target === tab;
              return (
                <button key={item.label} type="button" className={`sl-featurebar-item${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => goTo(item.target)}>
                  <i className="sl-featurebar-icon"><item.icon size={21} strokeWidth={1.7} /></i>
                  <span>{tr(item.label)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <Reveal as="section" id="showcase" className="sl-section sl-showcase">
          <div className="sl-wrap sl-showcase-grid">
            <div className="sl-showcase-copy">
              <p className="sl-eyebrow"><span />WORKSPACE</p>
              <h2>{tr("ทุกเรื่องการเงิน")}<br />{tr("ในมุมมองเดียว")}</h2>
              <p className="sl-lead">{tr("ดูงาน รายรับ รายจ่าย")}<br />{tr("และเงินที่ต้องติดตามได้ง่ายขึ้น")}</p>
              <div className="sl-tabs" role="tablist" aria-label={tr("เลือกหน้าที่อยากดู")}>
                {SHOWCASE.map(item => (
                  <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} aria-controls="sl-showcase-panel" className="sl-tab" onClick={() => setTab(item.key)}>{tr(item.tab)}</button>
                ))}
              </div>
              <div className="sl-tab-text" aria-live="polite">
                <motion.div key={active.key} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                  <h3>{tr(active.title)}</h3>
                  <p>{tr(active.text)}</p>
                </motion.div>
              </div>
              <div className="sl-stepper">
                <button type="button" aria-label={tr("หน้าก่อนหน้า")} onClick={() => step(-1)}><ArrowLeft size={18} /></button>
                <span className="sl-dots" aria-hidden="true">{SHOWCASE.map(item => <i key={item.key} className={item.key === tab ? 'is-active' : ''} />)}</span>
                <button type="button" aria-label={tr("หน้าถัดไป")} onClick={() => step(1)}><ArrowRight size={18} /></button>
              </div>
            </div>
            <div className="sl-showcase-stage">
            <div id="sl-showcase-panel" role="tabpanel" className="sl-browser">
              <div className="sl-browser-bar" aria-hidden="true"><i /><i /><i /></div>
              <div className="sl-browser-view">
                {SHOWCASE.map(item => (
                  <img key={item.key} className={item.key === tab ? 'is-active' : ''} src={`/landing-v3/${item.image}.webp`} alt={item.key === tab ? tr(item.alt) : ''}
                    aria-hidden={item.key !== tab} width={1440} height={900} loading={item.key === 'overview' ? 'eager' : 'lazy'} />
                ))}
              </div>
            </div>
            <Phone className="sl-showcase-phone" label={tr("หน้าภาพรวมบนมือถือ")}><img src="/landing-v3/phone-overview.webp" alt="" width={1170} height={2532} loading="lazy" /></Phone>
            <p className="sl-shot-note">{tr("ภาพจากแอปจริง · ข้อมูลตัวอย่าง")}</p>
            </div>
          </div>
        </Reveal>

        <Reveal as="section" id="features" className="sl-section">
          <div className="sl-wrap">
            <div className="sl-heading"><h2>{tr("ใช้ได้วันนี้")}</h2><p>{tr("ฟีเจอร์ที่เปิดให้ทุกบัญชี")}</p></div>
            <ul className="sl-feature-grid">
              {FEATURES.map(item => (
                <li key={item.title}><span className="sl-feature-icon"><item.icon size={20} strokeWidth={1.7} /></span><b>{tr(item.title)}</b><p>{tr(item.text)}</p></li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal as="section" id="reminders" className="sl-section sl-reminders">
          <div className="sl-wrap sl-reminders-grid">
            <div>
              <h2>{tr("เงินก้อนไหนต้องตาม")}<br /><em>{tr("กระรอกช่วยเตือน")}</em></h2>
              <p className="sl-lead">{tr("รู้ก่อนถึงกำหนดรับเงิน")}<br />{tr("และเมื่อมีงานที่เลยกำหนดแล้ว")}</p>
              <p className="sl-small">{tr("เห็นในแอปทุกบัญชี · Pro รับทาง LINE และอีเมลได้ตามที่ตั้งค่า")}</p>
            </div>
            <div className="sl-status-card" aria-label={tr("ตัวอย่างสถานะ")}>
              <img className="sl-status-mascot" src="/line/mascot-v6-reminder.png" alt="" width={1024} height={1024} loading="lazy" />
              {[
                { client: tr("ร้านกาแฟตัวอย่าง"), amount: tr("฿7,000"), state: tr("ใกล้ครบกำหนด"), detail: tr("อีก 4 วัน"), tone: 'soon' },
                { client: tr("แบรนด์ตัวอย่าง A"), amount: tr("฿6,500"), state: tr("เลยกำหนดรับเงิน"), detail: tr("เลยมา 2 วัน"), tone: 'late' },
                { client: tr("บริษัท ตัวอย่าง จำกัด"), amount: tr("฿18,000"), state: tr("รับเงินแล้ว"), detail: tr("14 ต.ค."), tone: 'paid' },
              ].map(row => (
                <div key={row.client} className="sl-status-row">
                  <span className="sl-grow"><b>{row.client}</b><small>{row.detail}</small></span>
                  <span className={`sl-chip is-${row.tone}`}>{row.state}</span>
                  <strong>{row.amount}</strong>
                </div>
              ))}
              <p className="sl-shot-note">{tr("ตัวอย่าง")}</p>
            </div>
          </div>
        </Reveal>

        <section id="line-pro" className="sl-line">
          <Reveal className="sl-wrap sl-line-grid">
            <div className="sl-line-copy">
              <span className="sl-pro-badge">Pro</span>
              <h2>{tr("เลขาการเงินของคุณ")}<br />{tr("อยู่ใน")}{' '}<span className="sl-line-word">LINE</span> {tr("ด้วย")}</h2>
              <p>{tr("คุยกับน้องกระรอกตุน บันทึกงาน")}<br />{tr("และเรียกดูข้อมูลการเงินได้ง่ายขึ้น")}</p>
              <a className="sl-btn is-light" href="#pricing">{tr("ดูรายละเอียด Pro")}{' '}<ArrowUpRight size={16} /></a>
              <p className="sl-line-terms">{tr("สำหรับ Pro หรือช่วงทดลองใช้ และบัญชีที่เชื่อม LINE แล้ว")}<br />{tr("ผู้ช่วย AI และการออกเอกสารผ่าน LINE · {0}", tr(SOON))}</p>
            </div>
            <motion.div className="sl-line-phones" initial={reduce ? false : { y: 12, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.55, ease: EASE, delay: 0.1 }}>
              <img className="sl-line-phone is-back" src="/landing-v3/line-phone-reminder.webp" alt={tr("การ์ดเตือนรับเงินใน LINE")} width={630} height={1480} loading="lazy" />
              <img className="sl-line-phone is-front" src="/landing-v3/line-phone-draft.webp" alt={tr("การ์ดตรวจรายการก่อนบันทึกใน LINE")} width={630} height={1480} loading="lazy" />
              <p className="sl-shot-note is-light">{tr("การ์ด LINE จริง · ข้อมูลตัวอย่าง")}</p>
            </motion.div>
            <ul className="sl-line-tiles">
              {LINE_TILES.map(item => (
                <li key={item.label}><span><item.icon size={22} strokeWidth={1.7} /></span><b>{tr(item.label).split('\n').map((line, i) => <React.Fragment key={line}>{i > 0 && <br />}{line}</React.Fragment>)}</b></li>
              ))}
            </ul>
          </Reveal>
        </section>

        <Reveal as="section" id="pricing" className="sl-section">
          <div className="sl-wrap">
            <div className="sl-heading"><h2>{tr("เริ่มฟรี")}<br /><em>{tr("พร้อมเมื่อไหร่ค่อยไปต่อ")}</em></h2></div>
            <div className="sl-plans">
              <article className="sl-plan">
                <p className="sl-plan-name">FREE</p>
                <p className="sl-plan-price"><strong>{tr("฿0")}</strong><span>{tr("/ เดือน")}</span></p>
                <ul>{FREE.map(text => <li key={text}>{tr(text)}</li>)}</ul>
                <a className="sl-btn is-ghost is-block" href={LOGIN}>{tr("เริ่มใช้งานฟรี")}{' '}<ArrowRight size={16} /></a>
              </article>
              <article className="sl-plan is-pro">
                <p className="sl-plan-name">PRO</p>
                <p className="sl-plan-price"><s className="sl-plan-was"><span className="sr-only">{tr("ราคาปกติ")}{' '}</span>{formatBaht(PRO_REGULAR_MONTHLY)}</s><strong>{formatBaht(PRO_PRICING.month.total)}</strong><span>{tr("/ เดือน")}</span></p>
                <ul>{PRO.map(item => <li key={item.text} className={item.soon ? 'is-soon' : ''}>{tr(item.text)}{item.soon && <em>{tr(SOON)}</em>}</li>)}</ul>
                <p>{tr("จ่ายครั้งเดียว · 6 เดือน {0} · 1 ปี {1}", formatBaht(PRO_PRICING.halfYear.total), formatBaht(PRO_PRICING.year.total))}</p>
                <a className="sl-btn is-primary is-block" href="/plans">{tr("เลือกแพ็กเกจ Pro")}{' '}<ArrowRight size={16} /></a>
              </article>
            </div>
          </div>
        </Reveal>

        <Reveal as="section" id="faq" className="sl-section">
          <div className="sl-wrap sl-faq-wrap">
            <h2>{tr("คำถามที่พบบ่อย")}</h2>
            <div className="sl-faq">
              {FAQ.map((item, index) => {
                const open = faqOpen === index;
                return (
                  <div key={item.q} className={`sl-faq-item${open ? ' is-open' : ''}`}>
                    <button type="button" aria-expanded={open} aria-controls={`sl-faq-${index}`} onClick={() => setFaqOpen(open ? null : index)}>{tr(item.q)}<ChevronDown size={18} /></button>
                    <div id={`sl-faq-${index}`} role="region" hidden={!open}><p>{tr(item.a)}</p></div>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <Reveal as="section" className="sl-section sl-final">
          <div className="sl-wrap sl-final-grid">
            <div className="sl-final-art">
              <button type="button" className={`sl-final-mascot${petting ? ' is-petting' : ''}`} aria-label={tr("ทักทายน้องกระรอก")}
                onClick={() => { setPetting(true); window.setTimeout(() => setPetting(false), 900); }}>
                <img src={petting ? '/line/mascot-v6-received.png' : '/line/mascot-v6-guide.png'} alt="" width={1024} height={1024} loading="lazy" />
              </button>
              <span className="sl-final-note" aria-hidden="true">{tr("ให้เรื่องเงิน")}<br />{tr("เป็นเรื่องง่ายขึ้น")}</span>
            </div>
            <div className="sl-final-copy">
              <h2>{tr("พร้อมให้เราช่วยดูแล")}<br /><em>{tr("เรื่องเงินของคุณแล้วหรือยัง?")}</em></h2>
              <a className="sl-btn is-primary is-wide" href={LOGIN}>{tr("เริ่มใช้งานฟรี")}{' '}<ArrowRight size={17} /></a>
              <ul className="sl-trust">
                <li><Zap size={16} />{tr("เริ่มใช้งานได้ทันที")}</li>
                <li><CreditCard size={16} />{tr("ไม่ต้องใช้บัตรเครดิต")}</li>
                <li><RotateCcw size={16} />{tr("ยกเลิก Pro ได้ทุกเมื่อ")}</li>
              </ul>
            </div>
          </div>
        </Reveal>
      </main>

      <footer className="sl-footer">
        <div className="sl-wrap sl-footer-row">
          <BrandLockup size={26} />
          <nav aria-label={tr("ลิงก์ท้ายหน้า")}>
            <a href="#features">{tr("ฟีเจอร์")}</a><a href="#pricing">{tr("ราคา")}</a><a href="#showcase">{tr("วิธีใช้งาน")}</a><a href="#line-pro">Pro</a>
            <a href="#faq">{tr("คำถามที่พบบ่อย")}</a><a href="/privacy#contact">{tr("ติดต่อเรา")}</a><a href="/terms">{tr("ข้อกำหนดการใช้งาน")}</a><a href="/privacy">{tr("นโยบายความเป็นส่วนตัว")}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
