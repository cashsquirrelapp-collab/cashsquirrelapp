import React from 'react';
import { motion, type MotionValue } from 'motion/react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { EASE } from '../primitives';
import { SHOTS } from './shots.gen';
import { BEAT, CTA, DUE, HERO, LINE, SCREENS } from './content';
import { LINE_DIGEST, LINE_UNPAID } from './line.gen';
import { LineScreen } from './LineChat';
import { Fade, Layer, Pinned, Shot, centred, mix, ramp, useDerived, window4, type Keys, type Pose, type Size } from './stage';

// Chapters 1 to 3 on one stage, so nothing is cut between them: the loose job rows of the hero
// become the timeline screen, the screen opens into one job, and that job's screen steps back as
// the LINE menu comes forward. Every product picture is a screenshot of the running app (see
// shots.gen.ts); the stage only moves, crops, dims and labels them.

const CREAM = [250, 248, 245] as const;
const DARK = [31, 26, 22] as const;
const EN_FONT = "'IBM Plex Sans', var(--font-sans)";
const B = BEAT;

const hidden = (pose: Pose, dy = 0): Pose => ({ ...pose, y: pose.y + dy, o: 0 });

/** Every position on the stage, worked out from the stage's size. Wide screens put copy beside the picture; narrow ones put it above. */
function layout({ w: W, h: H }: Size) {
  const wide = W >= 1024;
  const screen = SHOTS[wide ? 'timeline' : 'narrow-timeline'];
  const rows = screen.rects;
  const names = (wide ? ['summary', 'logo', 'video2', 'video3', 'review', 'photo'] : ['summary', 'logo', 'video2', 'video3', 'review']) as (keyof typeof rows)[];

  // The app screen: peeking in at the bottom, then whole, then close on one job, then stepping back.
  const s1 = wide ? Math.min(W * 0.74, H * 0.76 * 1.6) / screen.w : Math.min((W - 40) / screen.w, (H - 104) / screen.h);
  const whole: Pose = wide ? centred(W / 2, H * 0.52, s1, screen.w, screen.h) : { x: (W - screen.w * s1) / 2, y: 88, s: s1, o: 1 };
  const s0 = wide ? s1 * 0.94 : s1;
  const peek: Pose = { x: (W - screen.w * s0) / 2, y: H - screen.h * s0 * (wide ? 0.33 : 0.25), s: s0, o: 1 };
  const focus = { x: rows.video2.x + rows.video2.w / 2, y: (rows.video2.y + rows.video3.y + rows.video3.h) / 2 };
  const aim = wide ? { x: W * 0.685, y: H * 0.47 } : { x: W / 2, y: H * 0.64 };
  // Close enough to read, and never so close that a row's amount runs off the stage.
  const s2 = wide ? (W * 0.575) / rows.video2.w : s1 * 1.2;
  const close: Pose = { x: aim.x - focus.x * s2, y: aim.y - focus.y * s2, s: s2, o: 1 };
  const behind: Pose = { x: aim.x - focus.x * s2 * 0.96, y: aim.y - focus.y * s2 * 0.96, s: s2 * 0.96, o: 0.3 };
  const ghost: Pose = wide ? centred(W * 0.2, H * 0.3, s1 * 0.44, screen.w, screen.h, 0.09) : { ...whole, o: 0 };
  const frame: Keys = [[0, peek], [B.seated, whole], [B.held, whole], [B.zoomed, close], [B.card - 0.04, close], [B.card, behind], [B.creditHeld, behind], [B.line - 0.03, ghost], [1, ghost]];

  // The loose rows of the hero, each on its way to the place it really has on that screen.
  const loose: Record<string, readonly [number, number, number]> = wide
    ? { summary: [0.5, 0.752, -1], logo: [0.27, 0.668, -3.5], video2: [0.735, 0.658, 3], video3: [0.29, 0.848, 2.5], review: [0.72, 0.842, -2.5], photo: [0.5, 0.93, 1] }
    : { summary: [0.5, 0.715, -1.5], logo: [0.36, 0.635, -4], video2: [0.64, 0.805, 3], video3: [0.37, 0.885, -2], review: [0.63, 0.965, 2] };
  const pieces = names.map((name, i) => {
    const r = rows[name];
    const [cx, cy, rot] = loose[name];
    const seat: Pose = { x: whole.x + r.x * s1, y: whole.y + r.y * s1, s: s1, o: 1, r: 0 };
    const keys: Keys = [[i * 0.004, centred(W * cx, H * cy, s0 * (wide ? 0.92 : 0.98), r.w, r.h, 1, rot)], [B.seated - (names.length - 1 - i) * 0.004, seat], [B.seated + 0.014, seat], [B.seated + 0.03, hidden(seat)]];
    return { name, w: r.w, h: r.h, radius: r.r ?? 14, keys };
  });

  // An outline around the two instalments while the screen is close.
  const ringBox = { x: rows.video2.x - 8, y: rows.video2.y - 8, w: rows.video2.w + 16, h: rows.video3.y + rows.video3.h - rows.video2.y + 16 };
  const ringAt: Pose = { x: close.x + ringBox.x * s2, y: close.y + ringBox.y * s2, s: s2, o: 1 };
  const ring: Keys = [[B.zoomed, hidden(ringAt)], [B.zoomed + 0.02, ringAt], [B.card - 0.06, ringAt], [B.card - 0.04, hidden(ringAt)]];

  // One job's card, opened from its row. It steps aside for the instalment sheet, then shows the saved result.
  const job = SHOTS['job-before'];
  const sC = wide ? Math.min(1.15, (H * 0.6) / job.h, (W * 0.3) / job.w) : Math.min(1, (W - 40) / job.w, (H * 0.44) / job.h);
  const rowCentre = { x: close.x + focus.x * s2, y: close.y + (rows.video2.y + rows.video2.h / 2) * s2 };
  const cardOpen = wide ? centred(W * 0.685, H * 0.52, sC, job.w, job.h) : centred(W / 2, H * 0.68, sC, job.w, job.h);
  const cardAside = wide ? centred(W * 0.56, H * 0.52, sC, job.w, job.h) : centred(W * 0.27, H * 0.46, sC * 0.46, job.w, job.h);
  const cardUp = wide ? centred(W * 0.685, H * 0.27, sC * 0.66, job.w, job.h) : centred(W / 2, H * 0.45, sC * 0.5, job.w, job.h);
  const card: Keys = [[B.zoomed + 0.025, centred(rowCentre.x, rowCentre.y, sC * 0.45, job.w, job.h, 0)], [B.card, cardOpen], [B.card + 0.025, cardOpen], [B.sheet, cardAside], [B.saved - 0.05, cardAside], [B.saved, cardOpen], [B.saved + 0.03, cardOpen], [B.credit, cardUp], [B.creditHeld, cardUp], [B.creditHeld + 0.05, hidden(cardUp, H * 0.12)]];

  const sheetShot = SHOTS.instalment;
  const sS = wide ? sC * 0.92 : Math.min(sC, (H * 0.48) / sheetShot.h);
  const sheetOpen = wide ? centred(W * 0.848, H * 0.53, sS, sheetShot.w, sheetShot.h) : centred(W / 2, H * 0.715, sS, sheetShot.w, sheetShot.h);
  const sheet: Keys = [[B.card + 0.03, hidden(sheetOpen, H * 0.7)], [B.sheet, sheetOpen], [B.saved - 0.06, sheetOpen], [B.saved - 0.02, hidden(sheetOpen, H * 0.7)]];

  // Two credit-term jobs, exactly as the receivables page lists them.
  const credit = SHOTS[wide ? 'credit-30' : 'ncredit-30'];
  const sK = wide ? Math.min(0.92, (W * 0.56) / credit.w) : Math.min(1, (W - 40) / credit.w);
  const k30 = wide ? centred(W * 0.685, H * 0.6, sK, credit.w, credit.h) : centred(W / 2, H * 0.655, sK, credit.w, credit.h);
  const k45: Pose = { ...k30, y: k30.y + credit.h * sK + (wide ? 14 : 10) };
  const credit30: Keys = [[B.saved + 0.035, hidden(k30, H * 0.5)], [B.credit - 0.02, k30], [B.creditHeld, k30], [B.creditHeld + 0.05, hidden(k30, H * 0.2)]];
  const credit45: Keys = [[B.saved + 0.05, hidden(k45, H * 0.5)], [B.credit, k45], [B.creditHeld, k45], [B.creditHeld + 0.06, hidden(k45, H * 0.2)]];

  // LINE: one phone. It rises as the web screen steps back, and stays put while the chat plays inside it.
  // Wide screens show it inside a phone. On a phone-sized screen the chat fills the width instead:
  // the reader is already holding the phone, and the cards stay large enough to read.
  const sP = wide ? Math.min(0.92, (H * 0.8) / 820) : Math.min(1.15, (W - 32) / 390);
  const PHONE = wide ? { w: 410, h: 820 } : { w: 390, h: Math.round((H * 0.64) / sP) };
  const phoneOpen = wide ? centred(W * 0.36, H * 0.535, sP, PHONE.w, PHONE.h) : centred(W / 2, H * 0.665, sP, PHONE.w, PHONE.h);
  const phone: Keys = [[B.creditHeld + 0.03, { ...phoneOpen, y: H * 1.05 }], [B.line, phoneOpen], [1, phoneOpen]];

  return { wide, W, H, screen, frame, pieces, ringBox, ring, job, card, sheet, sheetShot, credit, credit30, credit45, PHONE, phone };
}

const SHADOW = '0 0 0 1px #E7E0D8, 0 40px 90px -40px rgba(64, 40, 16, 0.35), 0 2px 8px rgba(64, 40, 16, 0.06)';
const LIFT = '0 26px 60px -22px rgba(48, 30, 12, 0.42), 0 2px 6px rgba(48, 30, 12, 0.08)';

function Stage({ p, size, onStart }: { p: MotionValue<number>; size: Size; onStart: () => void }) {
  const L = React.useMemo(() => layout(size), [size]);
  const { wide, W, H } = L;

  const background = useDerived(p, v => {
    const t = ramp(v, B.creditHeld + 0.01, B.line - 0.025);
    return `rgb(${CREAM.map((c, i) => Math.round(mix(c, DARK[i], t))).join(' ')})`;
  });
  const veil = useDerived(p, v => 0.8 * (1 - ramp(v, 0.045, B.seated)));
  const scrim = useDerived(p, v => window4(v, B.held + 0.01, B.zoomed - 0.02, B.creditHeld, B.creditHeld + 0.04));
  const after = useDerived(p, v => ramp(v, B.saved - 0.045, B.saved - 0.015));

  const enSize = wide ? Math.min(H * 0.104, W * 0.066) : Math.min(W * 0.118, 56);
  const column = wide ? Math.min(W * 0.31, 420) : W - 40;
  const subEn = wide ? Math.min(H * 0.07, W * 0.043, column / 7.9) : Math.min(W * 0.092, 44);
  const thHead = wide ? Math.max(24, Math.min(H * 0.036, 34)) : 21;
  const thSub = wide ? Math.max(19, Math.min(H * 0.031, 28, column / 14.6)) : 19;
  const body = wide ? 17 : 15.5;
  const side = wide ? Math.max(40, W * 0.06) : 20;

  return (
    <>
      <motion.div className="absolute inset-0" style={{ background }} />

      {/* The app's timeline screen. */}
      <Layer p={p} keys={L.frame} w={L.screen.w} h={L.screen.h} radius={wide ? 14 : 22} shadow={SHADOW} z={2} className="overflow-hidden bg-white">
        <Shot name={wide ? 'timeline' : 'narrow-timeline'} eager radius={0} />
        <motion.div className="absolute inset-0 bg-[#FAF8F5]" style={{ opacity: veil }} />
      </Layer>

      {L.pieces.map((piece, i) => (
        <Layer key={piece.name} p={p} keys={piece.keys} w={piece.w} h={piece.h} z={4}>
          <motion.div className="h-full w-full overflow-hidden bg-white" style={{ borderRadius: piece.radius, boxShadow: LIFT }}
            initial={{ opacity: 0, y: 26, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.15 + i * 0.07 }}>
            <Shot name={`${wide ? 'tl' : 'ntl'}-${piece.name}` as 'tl-logo'} eager />
          </motion.div>
        </Layer>
      ))}

      {/* A wash behind the copy so it reads over the enlarged screen. */}
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex: 5, opacity: scrim, background: wide ? 'linear-gradient(90deg, #FAF8F5 0%, #FAF8F5 27%, rgba(250,248,245,0.9) 33%, rgba(250,248,245,0) 39.5%)' : 'linear-gradient(180deg, #FAF8F5 0%, #FAF8F5 34%, rgba(250,248,245,0.9) 42%, rgba(250,248,245,0) 54%)' }} />

      <Layer p={p} keys={L.ring} w={L.ringBox.w} h={L.ringBox.h} radius={20} z={6} className="border-2 border-[#E65F2B]" />

      <Layer p={p} keys={L.credit30} w={L.credit.w} h={L.credit.h} radius={16} shadow={LIFT} z={7} className="overflow-hidden bg-white"><Shot name={wide ? 'credit-30' : 'ncredit-30'} /></Layer>
      <Layer p={p} keys={L.credit45} w={L.credit.w} h={L.credit.h} radius={16} shadow={LIFT} z={7} className="overflow-hidden bg-white"><Shot name={wide ? 'credit-45' : 'ncredit-45'} /></Layer>

      <Layer p={p} keys={L.card} w={L.job.w} h={L.job.h} radius={20} shadow={LIFT} z={8} className="overflow-hidden bg-white">
        <Shot name="job-before" radius={0} />
        <motion.div className="absolute inset-0" style={{ opacity: after }}><Shot name="job-after" radius={0} /></motion.div>
      </Layer>
      <Layer p={p} keys={L.sheet} w={L.sheetShot.w} h={L.sheetShot.h} radius={24} shadow={LIFT} z={9} className="overflow-hidden bg-white"><Shot name="instalment" radius={0} /></Layer>

      {/* LINE: a stand-in chat screen playing the app's real messages over the real menu */}
      <Layer p={p} keys={L.phone} w={L.PHONE.w} h={L.PHONE.h} radius={wide ? 54 : 24} shadow="0 50px 100px -30px rgba(0,0,0,0.7)" z={12} className={wide ? 'bg-[#0E0C0B] p-[10px]' : 'bg-[#0E0C0B]'}>
        <div className={`h-full w-full overflow-hidden ${wide ? 'rounded-[44px]' : 'rounded-[24px]'}`}><LineScreen p={p} /></div>
      </Layer>

      {/* Chapter 1 */}
      <Fade p={p} show={v => 1 - ramp(v, 0.008, 0.038)} shift={-46} className="absolute inset-x-0 text-center" style={{ zIndex: 20, top: wide ? Math.max(96, H * 0.118) : 86, paddingInline: side }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <h1 className="font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT, fontSize: enSize, lineHeight: 1.02, letterSpacing: '-0.035em' }}>
            {HERO.en.map(line => <span key={line} className="block">{line}</span>)}
          </h1>
          <p className="mx-auto font-semibold text-[#1C1917]" style={{ fontSize: thHead, lineHeight: 1.4, marginTop: wide ? 22 : 16, maxWidth: wide ? undefined : 340 }}>
            <span className={wide ? '' : 'block'}>{HERO.th[0]}</span>{wide ? ' ' : ''}<span className={wide ? '' : 'block'}>{HERO.th[1]}</span>
          </p>
          <p className="mx-auto text-[#57514B] [text-wrap:balance]" style={{ fontSize: body, lineHeight: 1.7, marginTop: wide ? 12 : 10, maxWidth: wide ? 600 : 344 }}>{HERO.support}</p>
          <div className={`flex items-center justify-center ${wide ? 'mt-7 gap-6' : 'mt-5 flex-col gap-3'}`}>
            <StartButton onClick={onStart} />
            <span className="inline-flex items-center gap-1.5 text-[14px] text-[#6B645D]"><ArrowDown className="h-4 w-4" aria-hidden="true" />{HERO.hint}</span>
          </div>
        </motion.div>
      </Fade>
      <Fade p={p} show={v => window4(v, B.seated - 0.01, B.seated + 0.012, B.held, B.held + 0.02)} shift={10}
        className="pointer-events-none absolute inset-x-0 flex justify-center px-5" style={{ zIndex: 20, bottom: wide ? Math.max(14, H * 0.03) : 18 }}>
        <p className="rounded-full bg-[#1C1917] px-4 py-2 text-center text-[14px] font-medium text-white shadow-lg">{HERO.reveal}</p>
      </Fade>

      {/* Chapter 2 */}
      <Fade p={p} show={v => window4(v, B.held + 0.02, B.zoomed - 0.01, B.creditHeld, B.creditHeld + 0.035)} shift={wide ? -24 : -14} axis={wide ? 'x' : 'y'}
        className={`absolute ${wide ? '' : 'text-center'}`} style={{ zIndex: 20, left: side, width: column, top: wide ? '50%' : 84 }}>
        <div style={wide ? { transform: 'translateY(-50%)' } : undefined}>
          <h2 className="whitespace-nowrap font-semibold text-[#1C1917]" style={{ fontFamily: EN_FONT, fontSize: subEn, lineHeight: 1.05, letterSpacing: '-0.03em' }}>{DUE.en[0]}</h2>
          <p className="font-semibold text-[#1C1917]" style={{ fontSize: thSub, lineHeight: 1.45, marginTop: wide ? 18 : 10 }}>
            {DUE.th.map(line => <span key={line} className={`block ${wide ? 'whitespace-nowrap' : ''}`}>{line}</span>)}
          </p>
          <StepText p={p} wide={wide} />
          {wide && <p className="mt-5 max-w-[26rem] text-[13.5px] leading-relaxed text-[#6B645D]">{DUE.note}</p>}
        </div>
      </Fade>

      {/* Chapter 3 */}
      <Fade p={p} show={v => ramp(v, B.line - 0.035, B.line)} shift={wide ? 24 : -14} axis={wide ? 'x' : 'y'}
        className={`absolute ${wide ? '' : 'text-center'}`} style={{ zIndex: 20, ...(wide ? { left: W * 0.655, width: Math.min(W * 0.3, 430), top: '50%' } : { left: side, width: column, top: 84 }) }}>
        <div style={wide ? { transform: 'translateY(-50%)' } : undefined}>
          <p className="inline-flex items-center rounded-full border border-[#E65F2B]/50 bg-[#E65F2B]/15 px-3 py-1 text-[13px] font-medium text-[#FFB48E]">{LINE.plan}</p>
          <h2 className="mt-4 font-semibold text-[#FBF7F2]" style={{ fontFamily: EN_FONT, fontSize: subEn, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
            {wide ? LINE.en.map(line => <span key={line} className="block">{line}</span>) : LINE.en.join(' ')}
          </h2>
          <p className="font-semibold text-[#FBF7F2]" style={{ fontSize: thSub, lineHeight: 1.45, marginTop: wide ? 18 : 10 }}>
            {wide ? LINE.th.map(line => <span key={line} className="block">{line}</span>) : LINE.th.join(' ')}
          </p>
          <div className="relative" style={{ marginTop: wide ? 18 : 8, minHeight: wide ? 92 : 46 }}>
            <Fade p={p} show={v => window4(v, B.line - 0.01, B.line + 0.01, B.reply + 0.05, B.reply + 0.07)} shift={8} className="absolute inset-x-0 top-0">
              <p className="text-[#F3EBE3] [text-wrap:pretty]" style={{ fontSize: wide ? 18 : 15.5, lineHeight: 1.6 }}>{LINE.check}</p>
            </Fade>
            <Fade p={p} show={v => ramp(v, B.reply + 0.07, B.reply + 0.09)} shift={8} className="absolute inset-x-0 top-0">
              <p className="text-[#F3EBE3] [text-wrap:pretty]" style={{ fontSize: wide ? 18 : 15.5, lineHeight: 1.6 }}>{LINE.notice}</p>
            </Fade>
          </div>
          {wide && <ul className="mt-5 space-y-1 text-[13.5px] leading-relaxed text-[#B8AEA4]">{LINE.notes.map(note => <li key={note}>{note}</li>)}</ul>}
        </div>
      </Fade>

    </>
  );
}

/** What chapter 2 is showing right now, one short line at a time. */
function StepText({ p, wide }: { p: MotionValue<number>; wide: boolean }) {
  const edges = [B.zoomed - 0.03, B.card - 0.035, B.sheet - 0.04, B.saved - 0.04, B.credit - 0.05, B.creditHeld + 0.04];
  return (
    <div className="relative" style={{ marginTop: wide ? 22 : 10, minHeight: wide ? 92 : 50 }}>
      {DUE.steps.map((text, i) => (
        <Fade key={text} p={p} show={v => window4(v, edges[i], edges[i] + 0.016, edges[i + 1] - (i === 4 ? 0 : 0.016), edges[i + 1] + (i === 4 ? 0.02 : 0))} shift={8}
          className="absolute inset-x-0 top-0">
          <p className="text-[#3A342F] [text-wrap:pretty]" style={{ fontSize: wide ? 18 : 15.5, lineHeight: 1.6 }}>{text}</p>
        </Fade>
      ))}
    </div>
  );
}

export function StartButton({ onClick, dark = false }: { onClick: () => void; dark?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`group inline-flex h-[52px] items-center justify-center gap-2 rounded-xl bg-[#E65F2B] px-7 text-[16px] font-semibold text-white transition-colors duration-200 hover:bg-[#D35221] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer ${dark ? 'focus-visible:outline-white' : 'focus-visible:outline-[#1C1917]'}`}>
      {CTA}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-[3px]" aria-hidden="true" />
    </button>
  );
}

/** What the pictures on the stage show, for people who cannot see them. */
function Described() {
  return (
    <div className="sr-only">
      <p>{SHOTS.timeline.alt}</p>
      <p>{DUE.steps.join(' ')} {DUE.note}</p>
      <p>{SHOTS['credit-30'].alt} {SHOTS['credit-45'].alt}</p>
      <p>{LINE.check} {LINE_UNPAID.altText} {LINE.notice} {LINE_DIGEST.altText} {LINE.notes.join(' ')}</p>
    </div>
  );
}

export function MoneyAct({ onStart }: { onStart: () => void }) {
  const travel = SCREENS.money - 1;
  return (
    <div className="relative">
      {/* Places the page can jump to inside the pinned story. */}
      <span id="due" className="absolute" style={{ top: `${B.zoomed * travel * 100}svh` }} />
      <span id="line" className="absolute" style={{ top: `${(B.line + 0.02) * travel * 100}svh` }} />
      <Pinned screens={SCREENS.money} label="ติดตามกำหนดรับเงินของแต่ละงาน และเช็กผ่าน LINE">
        {(p, size) => <Stage p={p} size={size} onStart={onStart} />}
      </Pinned>
      <Described />
    </div>
  );
}
