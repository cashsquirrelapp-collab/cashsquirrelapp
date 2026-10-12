import React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { Check } from 'lucide-react';
import { Reveal } from '../primitives';
import { FREE, type BentoCard } from './content';
import { SHOTS } from './shots.gen';
import { Crop } from './stage';
import { StartButton } from './MoneyAct';

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

function Plan({ name, badge, price, per, priceNote, items, terms, pro = false }: { name: string; badge?: string; price: string; per?: string; priceNote?: readonly string[]; items: readonly string[]; terms?: readonly string[]; pro?: boolean }) {
  return (
    <div className={`rounded-[28px] border p-6 text-left sm:p-8 ${pro ? 'border-[#E65F2B]/45 bg-[#FFF6EF]' : 'border-[#EBE3D9] bg-white'}`}>
      <p className="text-[15px] font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT }}>{name}</p>
      {badge && <p className="mt-2 inline-flex items-center rounded-full bg-[#FDE8DD] px-3 py-1 text-[12.5px] font-semibold text-[#C24A16]">{badge}</p>}
      <p className="mt-2 font-mono text-[40px] font-semibold leading-none tracking-tight text-[#1C1917]">{price}{per && <span className="ml-2 font-sans text-[16px] font-normal tracking-normal text-[#6B645D]">{per}</span>}</p>
      {priceNote && <p className="mt-2 text-[15px] leading-relaxed text-[#57514B]"><span className="block font-semibold text-[#C24A16]">{priceNote[0]}</span>{priceNote[1]}</p>}
      <ul className="mt-6 space-y-3 text-[15.5px] leading-relaxed text-[#3A342F]">
        {items.map(item => <li key={item} className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-[#18A66A]" aria-hidden="true" />{item}</li>)}
      </ul>
      {terms && <ul className="mt-6 space-y-1.5 border-t border-[#F0D9C8] pt-5 text-[14.5px] leading-relaxed text-[#57514B]">{terms.map(term => <li key={term}>{term}</li>)}</ul>}
    </div>
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

        <Reveal className="mt-[clamp(4rem,3rem+4vw,7rem)]">
          <h3 className="text-center text-[clamp(1.5rem,1.2rem+1.4vw,2.25rem)] font-semibold leading-snug text-[#1C1917]">อะไรอยู่ใน Free อะไรอยู่ใน Pro</h3>
          <div className="mx-auto mt-8 grid max-w-[940px] grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
            <Plan name={free.name} price={free.price} items={free.items} />
            <Plan name={pro.name} badge={pro.badge} price={pro.price} per={pro.per} priceNote={pro.priceNote} items={pro.items} terms={pro.terms} pro />
          </div>
          <div className="mt-10 flex justify-center"><StartButton onClick={onStart} /></div>
        </Reveal>
      </div>
    </section>
  );
}
