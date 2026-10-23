import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { Check } from 'lucide-react';
import { Reveal } from '../primitives';
import { CTA, FREE, type BentoCard } from './content';
import { SHOTS } from './shots.gen';
import { Crop } from './stage';

// Chapter 5. What a Free account really gets, shown with screenshots taken from a Free account.
// Each card arrives as an empty shell first, then its picture fills in. Documents and LINE are not
// in these cards; the plan table underneath says what each plan includes.

const EN_FONT = "'IBM Plex Sans', var(--font-sans)";
const SPAN: Record<BentoCard['span'], string> = {
  wide: 'md:col-span-8',
  tall: 'md:col-span-4 md:row-span-2',
  small: 'md:col-span-3',
  mid: 'md:col-span-5',
  full: 'md:col-span-12',
};

function Card({ card, index }: { card: BentoCard; index: number }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 96%', 'start 52%'] });
  const shell = useTransform(scrollYProgress, [0, 0.45], [0, 1]);
  const lift = useTransform(scrollYProgress, [0, 0.45], [44, 0]);
  const grow = useTransform(scrollYProgress, [0, 0.45], [0.955, 1]);
  const fill = useTransform(scrollYProgress, [0.38, 1], [0, 1]);
  const rise = useTransform(scrollYProgress, [0.38, 1], [22, 0]);
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const read = () => setNarrow(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);
  const source = narrow && card.narrow ? card.narrow : card.wide;
  const shot = SHOTS[source.shot];
  const whole = card.span === 'tall' || card.span === 'small';
  return (
    <motion.article ref={ref} className={`flex flex-col overflow-hidden rounded-[28px] border border-[#EBE3D9] bg-white p-5 sm:p-6 ${SPAN[card.span]}`}
      style={reduce ? undefined : { opacity: shell, y: lift, scale: grow }} data-bento={index}>
      <h3 className="text-[17px] font-semibold leading-snug text-[#1C1917] sm:text-[19px]">{card.title}</h3>
      <motion.div className={`mt-4 ${whole ? 'flex flex-1 items-start justify-center' : ''}`} style={reduce ? undefined : { opacity: fill, y: rise }}>
        {whole ? (
          <img src={shot.file} alt={shot.alt} width={Math.round(shot.w)} height={Math.round(shot.h)} loading="lazy" decoding="async" draggable={false}
            className="h-auto w-full rounded-[14px] border border-[#EFE8DF] shadow-[0_14px_36px_-18px_rgba(60,40,20,0.35)]" style={{ maxWidth: shot.w }} />
        ) : (
          <Crop name={source.shot} view={source.view} alt={shot.alt} className="w-full rounded-[14px] border border-[#EFE8DF] bg-[#FAF8F5]" style={{ aspectRatio: `${source.view.w} / ${source.view.h}` }} />
        )}
      </motion.div>
    </motion.article>
  );
}

type LongPeriod = { name: string; price: string; per: string; average: string; badge: string };

function Plan({ name, badge, regularPrice, price, per, priceNote, longPeriods, items, terms, pro = false, onStart }: {
  name: string; badge?: string; regularPrice?: string; price: string; per?: string; priceNote?: readonly string[]; longPeriods?: readonly LongPeriod[];
  items: readonly string[]; terms?: readonly string[]; pro?: boolean; onStart: () => void;
}) {
  // Quiet hierarchy: plan name, then the price, then what you get. Pro stands out by a warm
  // surface and one accent line, not by size.
  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-[32px] p-7 text-left sm:p-10 ${pro
      ? 'bg-[#FFF9F4] shadow-[0_0_0_1.5px_#F0C9B0,0_1px_2px_rgba(60,40,28,0.05),0_30px_60px_-34px_rgba(190,80,30,0.38)]'
      : 'bg-white shadow-[0_0_0_1px_#EAE2D8,0_1px_2px_rgba(60,40,28,0.04),0_24px_50px_-36px_rgba(60,40,28,0.3)]'}`}>
      {pro && <span aria-hidden="true" className="absolute inset-x-10 top-0 h-[3px] rounded-b-full bg-[#E65F2B]" />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[19px] font-semibold tracking-[-0.01em] text-[#1C1917]" style={{ fontFamily: EN_FONT }}>{name}</p>
        {badge && <p className="rounded-full bg-[#FDE8DD] px-3 py-1 text-[12.5px] font-semibold text-[#C24A16]">{badge}</p>}
      </div>
      <p className="mt-6 flex items-baseline gap-2 text-[#1C1917]">
        {regularPrice && <s className="font-mono text-[22px] text-[#8A8178] decoration-[1.5px]"><span className="sr-only">ราคาปกติ </span>{regularPrice}</s>}
        <span className="font-mono text-[clamp(2.75rem,2.2rem+1.6vw,3.75rem)] font-semibold leading-none tracking-[-0.03em]">{price}</span>
        {per && <span className="text-[16px] text-[#6B645D]">{per}</span>}
      </p>
      <p className="mt-3 min-h-[3rem] text-[15px] leading-relaxed text-[#57514B]">
        {priceNote ? <><span className="block font-semibold text-[#C24A16]">{priceNote[0]}</span>{priceNote[1]}</> : 'ใช้งานได้ต่อเนื่อง ไม่มีค่าใช้จ่าย'}
      </p>
      <div className="mt-7"><PlanButton onClick={onStart} pro={pro} /></div>
      {longPeriods && (
        <ul aria-label="แพ็กเกจระยะยาว" className="mt-4 divide-y divide-[#EFE6DC] rounded-2xl border border-[#EFE6DC] bg-white/70">
          {longPeriods.map(period => (
            <li key={period.name} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold text-[#1C1917]">
                  {period.name}
                  <span className="rounded-full bg-[#FDE8DD] px-2 py-0.5 text-[12px] font-semibold text-[#C24A16]">{period.badge}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-[#6B645D]">{period.average}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-[16px] font-semibold text-[#1C1917]">{period.price}<span className="font-sans text-[13px] font-normal text-[#6B645D]"> {period.per}</span></p>
                <span className="mt-1 inline-block rounded-full bg-[#F1ECE6] px-2 py-0.5 text-[12px] font-semibold text-[#6B645D]">เร็ว ๆ นี้</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-8 space-y-3.5 border-t border-[#EFE6DC] pt-7 text-[15.5px] leading-relaxed text-[#2B2622]">
        {items.map(item => <li key={item} className="flex gap-3"><Check className={`mt-[5px] h-4 w-4 shrink-0 ${pro ? 'text-[#E65F2B]' : 'text-[#1C1917]'}`} strokeWidth={2.4} aria-hidden="true" />{item}</li>)}
      </ul>
      {terms && <ul className="mt-auto space-y-1.5 pt-8 text-[14px] leading-relaxed text-[#57514B]">{terms.map(term => <li key={term}>{term}</li>)}</ul>}
    </div>
  );
}

function PlanButton({ onClick, pro }: { onClick: () => void; pro: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-12 w-full items-center justify-center rounded-xl text-[15.5px] font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1C1917] cursor-pointer ${pro
        ? 'bg-[#E65F2B] text-white hover:bg-[#D35221]' : 'bg-[#1C1917] text-white hover:bg-black'}`}>
      {CTA}
    </button>
  );
}

export function FreeAct({ onStart }: { onStart: () => void }) {
  const { free, pro } = FREE.plans;
  return (
    <section id="plans" className="bg-[#F6F0E8] py-[clamp(5rem,3.5rem+6vw,10rem)]">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <Reveal className="text-center">
          <h2 className="font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT, fontSize: 'clamp(2.6rem, 1.4rem + 5vw, 5.5rem)', lineHeight: 1.02, letterSpacing: '-0.035em' }}>{FREE.en[0]}</h2>
          <p className="mt-5 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.75rem)', lineHeight: 1.45 }}>
            <span className="block sm:inline">{FREE.th[0]}</span><span className="block sm:inline">{FREE.th[1]}</span>
          </p>
          <p className="mt-3 text-[15px] text-[#57514B]">{FREE.support}</p>
        </Reveal>
        <div className="mt-[clamp(2.5rem,2rem+2vw,4rem)] grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-5">
          {FREE.cards.map((card, i) => <Card key={card.key} card={card} index={i} />)}
        </div>

        <div className="mt-[clamp(4.5rem,3rem+5vw,8rem)]">
          <Reveal>
            <h3 className="text-center text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] font-semibold leading-snug tracking-[-0.01em] text-[#1C1917]">เริ่มที่ Free แล้วค่อยขยับเมื่อพร้อม</h3>
          </Reveal>
          <div className="mx-auto mt-10 grid max-w-[1000px] grid-cols-1 items-stretch gap-5 md:grid-cols-2 md:gap-6">
            <Reveal className="h-full"><Plan name={free.name} price={free.price} items={free.items} onStart={onStart} /></Reveal>
            <Reveal className="h-full" delay={0.12}><Plan name={pro.name} badge={pro.badge} regularPrice={pro.regularPrice} price={pro.price} per={pro.per} priceNote={pro.priceNote} longPeriods={pro.longPeriods} items={pro.items} terms={pro.terms} pro onStart={onStart} /></Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
