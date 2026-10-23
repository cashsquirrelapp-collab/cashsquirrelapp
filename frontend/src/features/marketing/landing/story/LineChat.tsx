import React from 'react';
import { motion, type MotionValue } from 'motion/react';
import { BEAT, LINE, LINE_TAP } from './content';
import { LINE_DIGEST, LINE_UNPAID } from './line.gen';
import { SHOTS } from './shots.gen';
import { easeInOut, ramp, useDerived, window4 } from './stage';

// A stand-in for the LINE chat screen, at the owner's request, so the two things that really
// happen there can be played: tapping "รอรับเงิน" and getting the bot's card, and an overdue
// notice arriving by itself. The frame, the typing dots and the banner are presentation. What is
// said is not: both cards are the messages the app's own builders produce (line.gen.ts), drawn
// from their Flex definition, and the menu is cut from a screenshot of the real one.

const B = BEAT;
const SIZE: Record<string, number> = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29 };
const GAP: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const px = (value: unknown) => (typeof value === 'string' && value.endsWith('px') ? parseFloat(value) : typeof value === 'string' ? GAP[value] : undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

function gradient(bg: Node): string | undefined {
  if (bg?.type !== 'linearGradient') return undefined;
  return `linear-gradient(${bg.angle}, ${bg.startColor}${bg.centerColor ? `, ${bg.centerColor} ${bg.centerPosition || '50%'}` : ''}, ${bg.endColor})`;
}

/** Draws the parts of a LINE Flex message that the app's cards use: boxes, text, image, separator, button. */
function Flex({ node, row = false }: { node: Node; row?: boolean }) {
  const margin = node.margin ? { [row ? 'marginLeft' : 'marginTop']: px(node.margin) } : {};
  const flex = node.flex === 0 || node.width ? { flex: 'none' } : row ? { flex: `${node.flex ?? 1} 1 0`, minWidth: 0 } : {};
  // A component can be pinned inside its box (the mascot in the card header is).
  const pinned: React.CSSProperties = node.position === 'absolute' ? { position: 'absolute', top: px(node.offsetTop) ?? 0, left: px(node.offsetStart) ?? 0 } : {};
  if (node.type === 'text') {
    return <p style={{ ...margin, ...flex, fontSize: SIZE[node.size] ?? 16, fontWeight: node.weight === 'bold' ? 700 : 400, color: node.color, textAlign: node.align === 'end' ? 'right' : undefined, lineHeight: 1.45, whiteSpace: node.wrap ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.text}</p>;
  }
  if (node.type === 'separator') return <div style={{ ...margin, height: 1, background: node.color }} />;
  if (node.type === 'image') {
    const side = px(node.size) ?? 100;
    return <img src={node.url} alt="" width={side} height={side} loading="lazy" decoding="async" draggable={false} style={{ ...margin, ...flex, ...pinned, width: side, height: side, maxWidth: 'none', objectFit: 'contain', alignSelf: node.gravity === 'bottom' ? 'flex-end' : undefined }} />;
  }
  if (node.type === 'button') {
    return <div style={{ ...margin, background: node.color, color: '#fff', borderRadius: 8, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{node.action?.label}</div>;
  }
  const horizontal = node.layout === 'horizontal';
  const all = px(node.paddingAll) ?? 0;
  return (
    <div style={{
      ...margin, ...flex, ...pinned, position: pinned.position ?? 'relative', width: px(node.width), height: px(node.height),
      display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap: px(node.spacing) ?? 0,
      paddingTop: px(node.paddingTop) ?? all, paddingBottom: px(node.paddingBottom) ?? all, paddingLeft: px(node.paddingStart) ?? all, paddingRight: px(node.paddingEnd) ?? all,
      background: gradient(node.background) ?? node.backgroundColor, borderRadius: px(node.cornerRadius),
      border: node.borderColor ? `${px(node.borderWidth) ?? 1}px solid ${node.borderColor}` : undefined,
      justifyContent: node.justifyContent === 'center' ? 'center' : undefined, alignItems: horizontal ? 'flex-start' : undefined,
    }}>
      {(node.contents || []).map((child: Node, i: number) => <Flex key={i} node={child} row={horizontal} />)}
    </div>
  );
}

/** One bot card, exactly as its Flex definition lays it out. */
export function LineCard({ message, width = 300 }: { message: Node; width?: number }) {
  const bubble = message.contents;
  return (
    <div className="overflow-hidden rounded-[18px] bg-white" style={{ width, fontFamily: 'var(--font-sans)' }} role="img" aria-label={message.altText}>
      {bubble.header && <div style={{ background: bubble.styles?.header?.backgroundColor, overflow: 'hidden' }}><Flex node={bubble.header} /></div>}
      <Flex node={bubble.body} />
      {bubble.footer && <Flex node={bubble.footer} />}
    </div>
  );
}

function Typing({ p, from, to }: { p: MotionValue<number>; from: number; to: number }) {
  const height = useDerived(p, v => window4(v, from, from + 0.006, to - 0.004, to) * 46);
  const opacity = useDerived(p, v => window4(v, from, from + 0.006, to - 0.006, to));
  return (
    <motion.div className="shrink-0 overflow-hidden" style={{ height, opacity }}>
      <div className="mb-2 ml-11 inline-flex h-9 items-center gap-1.5 rounded-[18px] bg-[#2C2C2E] px-4">
        {[0, 1, 2].map(i => <motion.span key={i} className="h-2 w-2 rounded-full bg-[#9A9A9E]" animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.16 }} />)}
      </div>
    </motion.div>
  );
}

function Arrives({ p, at, children }: { p: MotionValue<number>; at: number; children: React.ReactNode }) {
  // Grows from nothing so everything above it is pushed up, the way a chat scrolls.
  const maxHeight = useDerived(p, v => easeInOut(ramp(v, at, at + 0.028)) * 760);
  const opacity = useDerived(p, v => ramp(v, at + 0.004, at + 0.022));
  return (
    <motion.div className="shrink-0 overflow-hidden" style={{ maxHeight, opacity }}>
      <div className="mb-3 flex items-end gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FDF6EC]"><img src="/line/mascot-peek-v1.png" alt="" width={36} height={36} loading="lazy" className="h-full w-full object-cover" /></span>
        {children}
      </div>
    </motion.div>
  );
}

/** The phone's screen, 390 by 800, driven by the same scroll clock as the rest of the act. */
export function LineScreen({ p }: { p: MotionValue<number> }) {
  const menu = SHOTS['line-menu'];
  const menuHeight = 390 * (menu.h / menu.w);
  const typing1 = [B.tap + 0.012, B.reply - 0.028] as const;
  const typing2 = [B.notice - 0.05, B.notice - 0.028] as const;
  const collapse = useDerived(p, v => (1 - easeInOut(ramp(v, B.tap + 0.004, B.tap + 0.022))) * menuHeight);
  const tap = useDerived(p, v => window4(v, B.tap - 0.014, B.tap - 0.006, B.tap + 0.002, B.tap + 0.008));
  const press = useDerived(p, v => 1 + window4(v, B.tap - 0.014, B.tap - 0.006, B.tap + 0.002, B.tap + 0.008) * 0.12);
  const banner = useDerived(p, v => (1 - window4(v, B.notice - 0.03, B.notice - 0.016, B.notice + 0.03, B.notice + 0.045)) * -84);
  const [l, t, r, b] = LINE_TAP;
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#1B1B1D] text-white" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="flex h-[52px] shrink-0 items-center gap-3 bg-[#111113] px-4">
        <span className="text-[20px] leading-none text-[#D8D8DC]">‹</span>
        <span className="text-[17px] font-semibold">{LINE.title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end px-3 pt-3">
        <Typing p={p} from={typing1[0]} to={typing1[1]} />
        <Arrives p={p} at={B.reply - 0.028}><LineCard message={LINE_UNPAID} /></Arrives>
        <Typing p={p} from={typing2[0]} to={typing2[1]} />
        <Arrives p={p} at={B.notice - 0.028}><LineCard message={LINE_DIGEST} /></Arrives>
      </div>
      <motion.div className="relative shrink-0 overflow-hidden" style={{ height: collapse }}>
        <img src={menu.file} alt="" width={390} height={Math.round(menuHeight)} loading="lazy" decoding="async" draggable={false} className="block w-full" style={{ height: menuHeight }} />
        <motion.span className="absolute rounded-[14px] border-[3px] border-[#E65F2B] bg-[#E65F2B]/15" style={{ left: `${l * 100}%`, top: t * menuHeight, width: `${(r - l) * 100}%`, height: (b - t) * menuHeight, opacity: tap, scale: press }} />
      </motion.div>
      <div className="flex h-[44px] shrink-0 items-center justify-center bg-[#111113] text-[14px] font-medium text-[#E8E8EA]">เมนูตุนเงิน ▾</div>
      {/* The notice as it shows at the top of the phone: the message's own summary line. */}
      <motion.div className="absolute inset-x-2 top-2 flex items-center gap-3 rounded-2xl bg-[#2C2C2E] px-3 py-2.5 shadow-xl" style={{ y: banner }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-[#FDF6EC]"><img src="/line/mascot-peek-v1.png" alt="" width={36} height={36} loading="lazy" className="h-full w-full object-cover" /></span>
        <span className="min-w-0"><span className="block text-[13.5px] font-semibold">{LINE.title}</span><span className="block truncate text-[13px] text-[#D8D8DC]">{LINE_DIGEST.altText}</span></span>
      </motion.div>
    </div>
  );
}
