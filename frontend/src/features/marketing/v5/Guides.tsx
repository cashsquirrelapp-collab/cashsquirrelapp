import React from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, Check, FileText, MessageCircleHeart, Percent } from 'lucide-react';
import { BrandLockup, BrandLogo } from '../../../components/brand/BrandLogo';
import { useLanguage } from '../../../i18n/LanguageContext';
import { tr } from '../../../i18n/tr';
import { GUIDES, GUIDES_INDEX, GUIDES_PATH, guideByPath, type Guide, type GuideBlock } from '../../../../../shared/guides';
import { SEO_PAGES } from '../../../../../shared/seo';
import { useLightOnly } from './lightOnly';
import './founder.css';
import './guides.css';

// Guides (owner, 2026-10-31: "ทำต่อเลย"): /guides lists them, /guides/<slug> is one guide. The words live in
// shared/guides.ts, so the Worker's search head (shared/seo.ts) and the page say the same thing. Light like the landing,
// built on the founder page's bar and type. Thai only: the topics are Thai tax and Thai business.

const ICONS: Record<string, typeof FileText> = { quotation: FileText, 'wht-50-tawi': Percent, receivables: CalendarClock };

/** The owner's **bold** words, kept bold. */
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, at) => (at % 2 ? <strong key={at}>{part}</strong> : <React.Fragment key={at}>{part}</React.Fragment>))}</>;
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'p': return <p className="fs-p"><Rich text={block.text} /></p>;
    case 'list': {
      const items = block.items.map((item, at) => <li key={at}><Rich text={item} /></li>);
      return block.ordered ? <ol className="gd-list">{items}</ol> : <ul className="gd-list">{items}</ul>;
    }
    case 'table': return (
      <div className="gd-table-wrap">
        <table className="gd-table">
          <thead><tr><th scope="col">{block.head[0]}</th><th scope="col">{block.head[1]}</th></tr></thead>
          <tbody>{block.rows.map(([name, value]) => <tr key={name}><td>{name}</td><td>{value}</td></tr>)}</tbody>
        </table>
        {block.note && <p className="gd-note">{block.note}</p>}
      </div>
    );
    case 'example': return (
      <figure className="gd-example">
        <figcaption>{block.title}</figcaption>
        {block.lines.map((line, at) => <p key={at}>{line}</p>)}
      </figure>
    );
    case 'krarok': return (
      <aside className="gd-krarok" aria-label={tr('ทำได้ในกระรอกตุนเงิน')}>
        <p className="gd-krarok-head"><BrandLogo size={24} />{tr('ทำได้ในกระรอกตุนเงิน')}</p>
        <ul>{block.items.map((item, at) => <li key={at}><Check size={18} strokeWidth={2.6} aria-hidden="true" /><span><Rich text={item} /></span></li>)}</ul>
      </aside>
    );
    case 'note': return <p className="gd-disclaimer">{block.text}</p>;
  }
}

function GuideCard({ guide }: { guide: Guide }) {
  const Icon = ICONS[guide.slug] || BookOpen;
  return (
    <a className="gd-card" href={guide.path}>
      <span className="gd-card-icon" aria-hidden="true"><Icon size={22} strokeWidth={2.2} /></span>
      <h2>{guide.title}</h2>
      <p>{guide.summary}</p>
      <span className="gd-card-more">{tr('อ่านบทความ')}<ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" /></span>
    </a>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  return (
    <div className="fs gd">
      <header className="fs-bar">
        <a href="/" className="fs-brand"><BrandLockup size={30} /></a>
        <nav className="fs-bar-links">
          <a href="/" className="fs-back" aria-label={tr('กลับหน้าแรก')}><ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" /><span className="fs-back-text">{tr('กลับหน้าแรก')}</span></a>
          <a href="/login" className="fs-start">{tr('เริ่มใช้ฟรี')}</a>
        </nav>
      </header>
      <main id="gd-main" lang="th">
        {language === 'en' && <p className="gd-en">{tr('คู่มือเหล่านี้เขียนสำหรับประเทศไทย จึงเป็นภาษาไทย')}</p>}
        {children}
        <section className="fs-cta" aria-labelledby="gd-cta-title">
          <h2 id="gd-cta-title">{tr('ลองใช้กระรอกตุนเงิน แล้วบอกเราว่าอะไรช่วยคุณได้')}</h2>
          <div className="fs-cta-actions">
            <a href="/login" className="fs-start is-big">{tr('เริ่มใช้ฟรี')}<ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" /></a>
            <a href="/#cl-help" className="fs-ghost"><MessageCircleHeart size={18} strokeWidth={2.2} aria-hidden="true" />{tr('ส่งความคิดเห็นถึงเรา')}</a>
          </div>
        </section>
      </main>
      <footer className="fs-foot"><span>© 2026 Krarok</span><a href={GUIDES_PATH}>{tr('ความรู้เรื่องงานและเงิน')}</a><a href="/founder">{tr('อ่านเรื่องราวจากผู้ก่อตั้ง')}</a><a href="/privacy">{tr('นโยบายความเป็นส่วนตัว')}</a><a href="/terms">{tr('ข้อกำหนดการใช้งาน')}</a></footer>
    </div>
  );
}

function GuideList() {
  return (
    <Shell>
      <header className="gd-head">
        <p className="fs-eyebrow">KRAROK GUIDES</p>
        <h1>{GUIDES_INDEX.title}</h1>
        <p className="gd-lead">{GUIDES_INDEX.lead}</p>
      </header>
      <div className="gd-cards">{GUIDES.map(guide => <GuideCard key={guide.slug} guide={guide} />)}</div>
    </Shell>
  );
}

function GuidePage({ guide }: { guide: Guide }) {
  return (
    <Shell>
      <header className="gd-head">
        <nav className="gd-crumbs" aria-label={tr('ตำแหน่งของหน้านี้')}>
          <a href={GUIDES_PATH}>{tr('ความรู้เรื่องงานและเงิน')}</a><span aria-hidden="true">›</span><span aria-current="page">{guide.title}</span>
        </nav>
        <h1>{guide.title}</h1>
        <p className="gd-lead">{guide.lead}</p>
        <p className="gd-updated">{tr('อัปเดตล่าสุด {0}', guide.updated)}</p>
      </header>
      <article className="fs-article">
        {guide.sections.map((section, at) => (
          <section key={section.title} className="fs-section" aria-labelledby={`gd-s${at}`}>
            <header className="fs-section-head"><h2 id={`gd-s${at}`}>{section.title}</h2></header>
            {section.blocks.map((block, index) => <Block key={index} block={block} />)}
          </section>
        ))}
      </article>
      <section className="gd-related" aria-labelledby="gd-related-title">
        <h2 id="gd-related-title">{tr('อ่านต่อ')}</h2>
        <div className="gd-cards">{GUIDES.filter(other => other.slug !== guide.slug).map(other => <GuideCard key={other.slug} guide={other} />)}</div>
      </section>
    </Shell>
  );
}

export default function Guides() {
  useLightOnly();
  const path = window.location.pathname.replace(/\/+$/, '') || GUIDES_PATH;
  const guide = guideByPath(path);
  React.useEffect(() => {
    const before = document.title;
    document.title = SEO_PAGES[guide ? guide.path : GUIDES_PATH].title;
    return () => { document.title = before; };
  }, [guide]);
  return guide ? <GuidePage guide={guide} /> : <GuideList />;
}
