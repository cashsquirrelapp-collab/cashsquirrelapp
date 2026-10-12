import React from 'react';
import { motion, type MotionValue } from 'motion/react';
import { Reveal } from '../primitives';
import { DOCS, SCREENS, type DocSlide } from './content';
import { SHOTS } from './shots.gen';
import { Crop, Fade, Pinned, easeInOut, ramp, useDerived, type Size } from './stage';

// Chapter 4. Four real pictures in one pinned frame: the quotation in the app, the PDF the app
// made from it, the vault with its year filter, the 50 ทวิ tracker. Between them the outgoing
// picture folds down to a strip while the next one unfolds beside it and the copy changes side.
// The fold is a clipping window: the screenshot inside never changes its proportions.
//
// Making a document and keeping documents are separate things in the app, so the copy names the
// part ("ออกเอกสาร" / "เก็บเอกสาร") on every slide and nothing is shown travelling between them.

const EN_FONT = "'IBM Plex Sans', var(--font-sans)";
const N = DOCS.slides.length;
const HALF = 0.05; // half the length of a fold, as a share of the act

/** How open slide i's window is at v (0 = folded away, 1 = fully open), and which edge it is folded against. */
function fold(i: number, v: number, wide: boolean) {
  const start = i / N, end = (i + 1) / N;
  const entering = i > 0 && v < (start + end) / 2;
  const open = Math.min(
    i === 0 ? 1 : easeInOut(ramp(v, start - HALF * 0.4, start + HALF)),
    i === N - 1 ? 1 : 1 - easeInOut(ramp(v, end - HALF, end + HALF * 0.4)),
  );
  // Beside each other on wide screens, both pictures fold against the same edge of the stage, so the
  // old one closes outward and the new one opens from the middle. Stacked in one place on narrow
  // screens, they fold against opposite edges so two strips pass each other.
  const boundary = entering ? i : i + 1;
  const right = wide ? boundary % 2 === 1 : entering ? boundary % 2 === 1 : boundary % 2 === 0;
  return { open, right };
}

function Slide({ p, slide, index, size }: { p: MotionValue<number>; slide: DocSlide; index: number; size: Size }) {
  const { w: W, h: H } = size;
  const wide = W >= 1024;
  const margin = wide ? Math.max(40, W * 0.06) : 20;
  const pw = wide ? Math.min(W * 0.54, 820) : W - 40;
  const ph = wide ? Math.min(H * 0.72, pw * 0.75) : Math.min(H * 0.5, pw * 1.2);
  const panelRight = wide && index % 2 === 0;
  const px = wide ? (panelRight ? W - margin - pw : margin) : 20;
  const py = wide ? (H - ph) / 2 + 12 : 82;
  const textWidth = wide ? Math.min(W * 0.28, 390) : W - 40;
  const textX = wide ? (panelRight ? margin : margin + pw + W * 0.055) : 20;
  const source = wide ? slide.wide : slide.narrow;
  const mark = slide.mark && (wide ? slide.mark.wide : slide.mark.narrow);
  const paper = slide.key === 'pdf';

  const clip = useDerived(p, v => {
    const { open, right } = fold(index, v, wide);
    const cut = (1 - open) * 100;
    return `inset(0% ${right ? 0 : cut}% 0% ${right ? cut : 0}% round 28px)`;
  });
  const drift = useDerived(p, v => { const { open, right } = fold(index, v, wide); return (1 - open) * (right ? -36 : 36); });
  const visibility = useDerived(p, v => (fold(index, v, wide).open < 0.012 ? 'hidden' : 'visible') as 'hidden' | 'visible');
  const start = index / N, end = (index + 1) / N;
  const shown = (delay: number) => (v: number) => Math.min(index === 0 ? 1 : ramp(v, start + HALF * 0.3 + delay, start + HALF * 1.3 + delay), index === N - 1 ? 1 : 1 - ramp(v, end - HALF * 1.2, end - HALF * 0.3));

  return (
    <>
      <motion.div aria-hidden="true" className="absolute overflow-hidden bg-[#EFE8DF]" style={{ left: px, top: py, width: pw, height: ph, clipPath: clip, visibility }}>
        <motion.div className="absolute inset-0" style={{ x: drift, padding: paper ? (wide ? '44px 64px 0' : '26px 22px 0') : wide ? 18 : 10 }}>
          <Crop name={source.shot} view={source.view} className={`h-full w-full ${paper ? 'rounded-t-[4px] bg-white shadow-[0_18px_50px_-12px_rgba(60,40,20,0.35)]' : 'rounded-[14px] bg-[#FAF8F5] shadow-[0_0_0_1px_rgba(60,40,20,0.08)]'}`}>
            {(scale, offset) => mark && (
              <Fade p={p} show={v => ramp(v, start + HALF * 1.6, start + HALF * 2.4)} className="absolute" style={{ left: mark.x * scale + offset.x, top: mark.y * scale + offset.y, width: mark.w * scale, height: mark.h * scale }}>
                <span className="absolute inset-0 rounded-full border-2 border-[#E65F2B]" />
                <span className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-full bg-[#1C1917] px-3 py-1 text-[13px] font-medium text-white">{slide.mark!.label}</span>
              </Fade>
            )}
          </Crop>
        </motion.div>
      </motion.div>

      <div className="absolute" style={wide ? { left: textX, width: textWidth, top: '50%' } : { left: textX, width: textWidth, top: py + ph + 22 }}>
        <div style={wide ? { transform: 'translateY(-50%)' } : undefined}>
          <Fade p={p} show={shown(0)} shift={14}>
            <p className="flex items-center gap-2.5 text-[14px] font-medium text-[#C24A16]">
              <span className="font-mono text-[#1C1917]">{String(index + 1).padStart(2, '0')}</span>
              <span className="h-px w-6 bg-[#D9CFC5]" />{slide.part}
            </p>
          </Fade>
          <Fade p={p} show={shown(0.006)} shift={18}>
            <h3 className="mt-3 font-semibold text-[#1C1917] [text-wrap:balance]" style={{ fontSize: wide ? Math.max(28, Math.min(H * 0.046, 40)) : 24, lineHeight: 1.25 }}>{slide.title}</h3>
          </Fade>
          <Fade p={p} show={shown(0.012)} shift={22}>
            <p className="mt-3 text-[#57514B] [text-wrap:pretty]" style={{ fontSize: wide ? 17 : 15.5, lineHeight: 1.7 }}>{slide.body}</p>
            {slide.note && <p className="mt-3 text-[13.5px] leading-relaxed text-[#6B645D]">{slide.note}</p>}
          </Fade>
        </div>
      </div>
    </>
  );
}

export function DocsAct() {
  return (
    <section id="documents" className="relative z-10 -mt-8 rounded-t-[32px] bg-[#FAF8F5]">
      <div className="mx-auto max-w-[1200px] px-5 pb-4 pt-[clamp(4.5rem,3rem+6vw,8rem)] text-center sm:px-8">
        <Reveal>
          <p className="inline-flex items-center rounded-full border border-[#E65F2B]/40 bg-[#FFF1E8] px-3 py-1 text-[13px] font-medium text-[#C24A16]">{DOCS.plan}</p>
          <h2 className="mt-5 font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT, fontSize: 'clamp(2.3rem, 1.2rem + 4.4vw, 4.75rem)', lineHeight: 1.04, letterSpacing: '-0.035em' }}>
            {DOCS.en.map(line => <span key={line} className="block">{line}</span>)}
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-5 font-semibold text-[#1C1917]" style={{ fontSize: 'clamp(1.2rem, 1rem + 0.9vw, 1.75rem)', lineHeight: 1.45 }}>
            <span className="block sm:inline">{DOCS.th[0]}</span>{' '}<span className="block sm:inline">{DOCS.th[1]}</span>
          </p>
        </Reveal>
      </div>
      <Pinned screens={SCREENS.docs} label="ออกเอกสารจากงาน และเก็บเอกสารที่ได้รับ">
        {(p, size) => DOCS.slides.map((slide, i) => <Slide key={slide.key} p={p} slide={slide} index={i} size={size} />)}
      </Pinned>
      <div className="sr-only">
        {DOCS.slides.map(slide => <p key={slide.key}>{SHOTS[(slide.wide.shot)].alt}</p>)}
      </div>
    </section>
  );
}
