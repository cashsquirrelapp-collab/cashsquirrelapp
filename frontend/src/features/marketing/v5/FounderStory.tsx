import React from 'react';
import { ArrowLeft, ArrowRight, Camera, MessageCircleHeart } from 'lucide-react';
import { BrandLockup } from '../../../components/brand/BrandLogo';
import { useLanguage } from '../../../i18n/LanguageContext';
import { tr } from '../../../i18n/tr';
import { HERO, PHOTOS, SECTIONS, SIGN, type Lang, type PhotoSlot, type Text } from '../../../../../shared/founderStory';
import { useLightOnly } from './lightOnly';
import './founder.css';

// "Behind Krarok" (owner, 2026-10-31): the founder's story as a page of its own (/founder), and a short part of it on the
// landing that leads here. The words are the owner's (shared/founderStory.ts). Photos come later: each has a marked space that
// says what goes there, its shape and its size, until the file is set.

const PHOTO_NUMBER: Record<string, number> = Object.fromEntries(Object.keys(PHOTOS).map((id, at) => [id, at + 1]));

/** A Thai title in its phrases (split at its spaces), so a line breaks between them on wider screens. */
function Phrases({ text, lang }: { text: string; lang: Lang }) {
  if (lang === 'en') return <>{text}</>;
  const parts = text.split(' ');
  return <>{parts.map((part, at) => <React.Fragment key={at}>{at > 0 && ' '}<span className="fs-chunk">{part}</span></React.Fragment>)}</>;
}

/** The owner's **bold** words, kept bold. */
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, at) => (at % 2 ? <strong key={at}>{part}</strong> : <React.Fragment key={at}>{part}</React.Fragment>))}</>;
}

/** A photo, or until it comes, a marked space saying which photo goes here. */
export function PhotoFrame({ slot, lang, compact = false, className = '' }: { slot: PhotoSlot; lang: Lang; compact?: boolean; className?: string }) {
  const number = PHOTO_NUMBER[slot.id];
  if (slot.src) return <img className={`fs-photo ${className}`} src={slot.src} alt={slot.title[lang]} style={{ aspectRatio: slot.ratio }} loading="lazy" />;
  return (
    <div className={`fs-slot${compact ? ' is-compact' : ''} ${className}`} style={{ aspectRatio: slot.ratio }} role="img"
      aria-label={tr('พื้นที่สำหรับรูปที่ {0}: {1}', number, slot.title[lang])} data-photo-slot={slot.id}>
      <span className="fs-slot-no">{tr('รูปที่ {0}', number)}</span>
      <span className="fs-slot-icon" aria-hidden="true"><Camera size={compact ? 18 : 24} strokeWidth={2} /></span>
      {!compact && <>
        <b>{slot.title[lang]}</b>
        <small>{slot.hint[lang]}</small>
        <em>{slot.size[lang]}</em>
      </>}
    </div>
  );
}

function useReveal(root: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-reveal]')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      items.forEach(item => item.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, [root]);
}

/** How far down the story the reader is, as a line under the bar. */
function useProgress() {
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0);
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => { removeEventListener('scroll', update); removeEventListener('resize', update); };
  }, []);
  return progress;
}

const t = (text: Text, lang: Lang) => text[lang];

export default function FounderStory() {
  const { language } = useLanguage();
  const lang: Lang = language === 'en' ? 'en' : 'th';
  const root = React.useRef<HTMLDivElement>(null);
  // Light, as the landing: in the app's dark mode the logo's words turned white on this white page (owner, 2026-10-31).
  useLightOnly();
  useReveal(root);
  const progress = useProgress();
  React.useEffect(() => {
    const before = document.title;
    document.title = lang === 'en' ? 'Behind Krarok · A story from the founder' : 'เรื่องราวจากผู้ก่อตั้ง · กระรอกตุนเงิน';
    return () => { document.title = before; };
  }, [lang]);

  return (
    <div ref={root} className={`fs${lang === 'en' ? ' is-en' : ''}`}>
      <header className="fs-bar">
        <a href="/" className="fs-brand"><BrandLockup size={30} /></a>
        <nav className="fs-bar-links">
          <a href="/" className="fs-back" aria-label={tr('กลับหน้าแรก')}><ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" /><span className="fs-back-text">{tr('กลับหน้าแรก')}</span></a>
          <a href="/login" className="fs-start">{tr('เริ่มใช้ฟรี')}</a>
        </nav>
        <span className="fs-progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
      </header>

      <main id="fs-main">
        <section className="fs-hero" aria-labelledby="fs-title">
          <div className="fs-hero-text" data-reveal>
            <p className="fs-eyebrow">{HERO.eyebrow}</p>
            <h1 id="fs-title"><Phrases text={t(HERO.title, lang)} lang={lang} /></h1>
            <blockquote className="fs-lead"><p>{t(HERO.lead, lang)}</p></blockquote>
            <p className="fs-hello">{t(HERO.hello, lang)}</p>
          </div>
          <div className="fs-hero-photo" data-reveal><PhotoFrame slot={PHOTOS.portrait} lang={lang} /></div>
        </section>

        <article className="fs-article">
          {SECTIONS.map(section => (
            <section key={section.n} className="fs-section" aria-labelledby={`fs-s${section.n}`}>
              <header className="fs-section-head" data-reveal>
                <span className="fs-num">{section.n}</span>
                <h2 id={`fs-s${section.n}`}>{t(section.title, lang)}</h2>
              </header>
              {section.blocks.map((block, at) => {
                if (block.kind === 'quote') return <blockquote key={at} className="fs-quote" data-reveal><p><Rich text={t(block.text, lang)} /></p></blockquote>;
                if (block.kind === 'photo') return <figure key={at} className="fs-figure" data-reveal><PhotoFrame slot={block.slot} lang={lang} /></figure>;
                return <p key={at} className="fs-p" data-reveal><Rich text={t(block.text, lang)} /></p>;
              })}
            </section>
          ))}

          <footer className="fs-sign" data-reveal>
            <PhotoFrame slot={PHOTOS.sign} lang={lang} compact className="fs-sign-photo" />
            <div>
              <p className="fs-sign-with">{t(SIGN.with, lang)}</p>
              <p className="fs-sign-name">{t(SIGN.name, lang)}</p>
              <p className="fs-sign-role">{SIGN.role}</p>
            </div>
          </footer>
          <p className="fs-tagline" data-reveal>{SIGN.tagline}</p>
        </article>

        <section className="fs-cta" aria-labelledby="fs-cta-title" data-reveal>
          <h2 id="fs-cta-title">{tr('ลองใช้กระรอกตุนเงิน แล้วบอกเราว่าอะไรช่วยคุณได้')}</h2>
          <div className="fs-cta-actions">
            <a href="/login" className="fs-start is-big">{tr('เริ่มใช้ฟรี')}<ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" /></a>
            <a href="/#cl-help" className="fs-ghost"><MessageCircleHeart size={18} strokeWidth={2.2} aria-hidden="true" />{tr('ส่งความคิดเห็นถึงเรา')}</a>
          </div>
        </section>
      </main>
      <footer className="fs-foot"><span>© 2026 Krarok</span><a href="/privacy">{tr('นโยบายความเป็นส่วนตัว')}</a><a href="/terms">{tr('ข้อกำหนดการใช้งาน')}</a></footer>
    </div>
  );
}

/** The landing's part of the story: the photo, the title, the founder's first words and the way to the whole story. */
export function FounderTeaser() {
  const { language } = useLanguage();
  const lang: Lang = language === 'en' ? 'en' : 'th';
  return (
    <section id="cl-founder" className="cl-founder" aria-labelledby="cl-founder-title">
      <div className="cl-founder-photo" data-rise><PhotoFrame slot={PHOTOS.portrait} lang={lang} /></div>
      <div className="cl-founder-text">
        <span className="cl-eyebrow">BEHIND KRAROK</span>
        <h2 id="cl-founder-title"><Phrases text={t(HERO.title, lang)} lang={lang} /></h2>
        <blockquote><p>{t(HERO.lead, lang)}</p></blockquote>
        <p className="cl-founder-by">{t(SIGN.name, lang)} · {SIGN.role}</p>
        <a href="/founder" className="cl-founder-link">{tr('อ่านเรื่องราวจากผู้ก่อตั้ง')}<ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
