import React from 'react';
import { motion, useTransform } from 'motion/react';
import { KsIcon, type KsIconName } from './icons';
import { useCollapsingCard, useLeadSettle, useScrollTop, type ScrollerGetter } from './useCollapsingCard';
import { useFitFigures } from './useFitFigures';

import { tr } from '../../i18n/tr';
// A page's header on phones, in one piece with the terracotta top bar, the way the overview's is
// (owner, 2026-10-20: "จุดเชื่อมแบบสมูทไม่มีจุดตัด"). As the page scrolls:
// - the way back, the title and anything else in the lead fade out before they reach the bar, so no
//   text is ever cut by the bar's edge;
// - the summary box, when the page has one, closes into a one-line bar pinned under the top bar
//   (useCollapsingCard, the overview's own hook); without a box, a short rounded strip of terracotta
//   stays pinned instead. Either way the bar always ends in the same soft terracotta edge.
// Styles are in mobile.css (.ksm-toolhero); this file loads no CSS, so pages that unit tests import
// for their pure functions can use it.

export type MobileHeroBox = {
  /** The first line; it stays in the closed bar, with the amount beside it. */
  label: React.ReactNode;
  icon?: KsIconName;
  amount: string;
  /** Lines under the amount; they fade as the box closes. */
  detail?: React.ReactNode;
  /** Outside the box's clipped area, top right (a month picker whose list must open over the page). */
  aside?: React.ReactNode;
  /** The box as a button (e.g. to the page with the list behind the amount). */
  onOpen?: () => void;
  openLabel?: string;
  /** Names the box as a region. */
  region?: string;
};

/** How far the terracotta runs below the box, and the strip left pinned on a page without a box. */
const BELOW_BOX = 16;
const STRIP = 18;

export function MobilePageHero({ title, sub, onBack, backLabel = 'เมนู', actions, box, children, scroller }: {
  title: string;
  /** One quiet line under the title. */
  sub?: string;
  /** Back to the menu; App passes it to the pages that draw their own header. */
  onBack?: () => void;
  /** Where the back link goes (a settings page goes back to ตั้งค่า). */
  backLabel?: string;
  /** The page's buttons beside the title (tools, add, a view switch, a year). */
  actions?: React.ReactNode;
  box?: MobileHeroBox;
  /** Shown under the title and scrolled away with it (the menu's profile box). */
  children?: React.ReactNode;
  /** The scroll container, when it is not #main-content (the menu layer). */
  scroller?: ScrollerGetter;
}) {
  const card = useCollapsingCard<HTMLDivElement>(scroller);
  const scrollTop = useScrollTop(scroller);
  const sectionRef = React.useRef<HTMLElement>(null);
  const heroRef = React.useRef<HTMLDivElement>(null);
  // The page around the header is what must stay tall enough for the box to close all the way.
  React.useLayoutEffect(() => { card.rootRef.current = (sectionRef.current?.parentElement as HTMLDivElement | null) ?? null; });
  useFitFigures(heroRef, `${box?.amount ?? ''}`);
  useLeadSettle(!box, card.lead, card.rootRef, scroller);

  const leadOpacity = useTransform([scrollTop, card.leadValue], ([y, lead]: number[]) => (lead ? Math.max(0, 1 - y / (lead * 0.6)) : 1));
  const detailOpacity = useTransform(card.progress, [0, 0.35], [1, 0]);
  const asideOpacity = useTransform(card.progress, [0.2, 0.5], [1, 0]);
  const asidePointer = useTransform(card.progress, p => (p > 0.4 ? 'none' : 'auto'));
  const radius = useTransform(card.progress, [0, 1], [20, 18]);
  const backdrop = useTransform([card.height, card.leadValue], ([h, lead]: number[]) => (box ? lead + 8 + h + BELOW_BOX : lead + STRIP + 10));

  const lead = card.lead;
  const height = box ? (card.expanded ? lead + 8 + card.expanded + BELOW_BOX : undefined) : (lead ? lead + STRIP + 10 : undefined);
  const content = box && (
    <>
      <div className="ksm-hero-row" ref={card.labelRef}>
        <div className="ksm-hero-label">{box.icon && <KsIcon name={box.icon} size={17} />}<span>{box.label}</span></div>
      </div>
      <div className="ksm-hero-figure">
        <motion.div ref={card.amountRef} className="ksm-net" style={{ x: card.amountX, y: card.amountY, scale: card.amountScale, transformOrigin: '0 0' }}>
          <strong data-metric="work" key={box.amount}>{box.amount}</strong>
        </motion.div>
      </div>
      {box.detail && <motion.div className="ksm-hero-detail" style={{ opacity: detailOpacity }}>{box.detail}</motion.div>}
    </>
  );
  return (
    <section ref={sectionRef} className="ksm ksm-summary ksm-pagehero ksm-toolhero" aria-label={title}
      style={height ? { height, top: -(10 + lead) } : undefined}>
      <motion.div className="ksm-hero-backdrop" aria-hidden="true" style={{ height: backdrop }} />
      <motion.div className="ksm-pagehero-lead" ref={card.leadRef} style={{ opacity: leadOpacity }}>
        {onBack && (
          <button type="button" className="ksm-hero-back" onClick={onBack} aria-label={tr("กลับไปที่{0}", tr(backLabel))}>
            <KsIcon name="left" size={17} />{tr(backLabel)}
          </button>
        )}
        <div className="ksm-pagehero-title">
          <div className="ksm-grow"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          {actions}
        </div>
        {children}
      </motion.div>
      {box && (
        <div className="ksm-hero" ref={heroRef} style={{ top: lead + 8 }} role={box.region ? 'region' : undefined} aria-label={box.region}>
          <motion.div className="ksm-hero-clip" style={{ height: card.expanded ? card.height : undefined, borderRadius: radius }}
            onClick={event => { if (!box.onOpen && card.progress.get() > 0.5 && !(event.target as HTMLElement).closest('button')) card.open(); }}>
            {box.onOpen ? (
              <button type="button" className="ksm-hero-inner ksm-hero-open" ref={card.innerRef as unknown as React.Ref<HTMLButtonElement>}
                onClick={() => (card.progress.get() > 0.5 ? card.open() : box.onOpen?.())} aria-label={box.openLabel}>
                {content}
                <motion.span className="ksm-hero-go" aria-hidden="true" style={{ opacity: detailOpacity }}><KsIcon name="chevron" size={18} /></motion.span>
              </button>
            ) : (
              <div className="ksm-hero-inner" ref={card.innerRef}>{content}</div>
            )}
          </motion.div>
          {box.aside && <motion.div className="ksm-hero-month" style={{ opacity: asideOpacity, pointerEvents: asidePointer }}>{box.aside}</motion.div>}
        </div>
      )}
    </section>
  );
}
