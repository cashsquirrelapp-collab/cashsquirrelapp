import React, { useEffect, useMemo, useState } from 'react';
import { motion, type MotionValue } from 'motion/react';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { SHOTS, type ShotName } from '../landing/story/shots.gen';
import { Fade, Layer, Pinned, Shot, centred, ramp, useDerived, type Keys, type Pose, type Size } from '../landing/story/stage';
import { PUBLIC_PHASE_ONE } from './publicPhase';

// Restore only MoneyAct's original opening: authentic cropped rows return to their
// exact positions in the same timeline capture. The old instalment/LINE acts stay out.
const SHADOW = '0 0 0 1px #E7E0D8, 0 40px 90px -40px rgba(64,40,16,.35), 0 2px 8px rgba(64,40,16,.06)';
const LIFT = '0 26px 60px -22px rgba(48,30,12,.42), 0 2px 6px rgba(48,30,12,.08)';

function OpeningHeading({ login }: { login: string }) {
  return <div className="hero-heading opening-heading">
    <p className="eyebrow">เลขาการเงินที่เกิดมาเพื่อคนรับงาน</p>
    {PUBLIC_PHASE_ONE ? <h1>งานและเงิน<br /><span>เห็นภาพไปกับกระรอก</span></h1> : <h1>เรื่องตามเงิน<br /><span>ปล่อยให้กระรอกจัดการ</span></h1>}
    <p className="hero-support">ตั้งแต่รับงาน จนถึงวันที่เงินจริงเข้า</p>
    <div className="hero-actions"><a className="solid-button" href={login}>เริ่มใช้งานฟรี <ArrowUpRight size={18} /></a></div>
  </div>;
}

function openingLayout({ w: W, h: H }: Size) {
  const wide = W >= 1024;
  const screenName: 'timeline' | 'narrow-timeline' = wide ? 'timeline' : 'narrow-timeline';
  const sourceScreen = SHOTS[screenName];
  // The existing desktop capture includes menus outside the public launch.
  // Crop its sidebar while retaining the authentic calendar and row animations.
  const sidebarCrop = PUBLIC_PHASE_ONE && wide ? 240 : 0;
  const screen = { ...sourceScreen, w: sourceScreen.w - sidebarCrop };
  const rows = screen.rects;
  const names = (wide ? ['summary', 'logo', 'video2', 'video3', 'review', 'photo'] : ['summary', 'logo', 'video2', 'video3', 'review']) as (keyof typeof rows)[];
  const scale = wide ? Math.min(W * .74, H * .70 * (screen.w / screen.h)) / screen.w : Math.min((W - 40) / screen.w, (H - 230) / screen.h);
  const whole: Pose = wide ? centred(W / 2, H * .49, scale, screen.w, screen.h) : { x: (W - screen.w * scale) / 2, y: 100, s: scale, o: 1 };
  const startScale = wide ? scale * .94 : scale;
  const peek: Pose = { x: (W - screen.w * startScale) / 2, y: H - screen.h * startScale * (wide ? .33 : .25), s: startScale, o: 1 };
  const frame: Keys = [[0, peek], [.65, whole], [1, whole]];
  const loose: Record<string, readonly [number, number, number]> = wide
    ? { summary: [.5, .752, -1], logo: [.27, .668, -3.5], video2: [.735, .658, 3], video3: [.29, .848, 2.5], review: [.72, .842, -2.5], photo: [.5, .93, 1] }
    : { summary: [.5, .715, -1.5], logo: [.36, .635, -4], video2: [.64, .805, 3], video3: [.37, .885, -2], review: [.63, .965, 2] };
  const pieces = names.map((name, i) => {
    const rect = rows[name]; const [cx, cy, rotate] = loose[name];
    const seat: Pose = { x: whole.x + (rect.x - sidebarCrop) * scale, y: whole.y + rect.y * scale, s: scale, o: 1, r: 0 };
    const keys: Keys = [[i * .015, centred(W * cx, H * cy, startScale * (wide ? .92 : .98), rect.w, rect.h, 1, rotate)], [.65 - (names.length - 1 - i) * .015, seat], [.67, seat], [.70, { ...seat, o: 0 }]];
    return { name, rect, keys, shot: `${wide ? 'tl' : 'ntl'}-${name}` as ShotName };
  });
  const review = rows.review;
  const highlight: Pose = { x: whole.x + (review.x - sidebarCrop - 5) * scale, y: whole.y + (review.y - 5) * scale, s: scale, o: 1 };
  const focus: Keys = [[.76, { ...highlight, o: 0 }], [.84, highlight], [1, highlight]];
  return { screen, sourceScreen, sidebarCrop, screenName, frame, pieces, focus, review };
}

function OpeningStage({ p, size, login }: { p: MotionValue<number>; size: Size; login: string }) {
  const layout = useMemo(() => openingLayout(size), [size]);
  const veil = useDerived(p, v => .82 * (1 - ramp(v, .12, .64)));
  return <>
    <Layer p={p} keys={layout.frame} w={layout.screen.w} h={layout.screen.h} radius={14} shadow={SHADOW} z={1} className="overflow-hidden bg-white">
      {layout.sidebarCrop > 0 ? <div style={{ width: layout.sourceScreen.w, height: layout.sourceScreen.h, transform: `translateX(-${layout.sidebarCrop}px)` }}><Shot name={layout.screenName} eager radius={0} /></div> : <Shot name={layout.screenName} eager radius={0} />}
      <motion.div className="opening-veil" style={{ opacity: veil }} />
    </Layer>
    {layout.pieces.map(piece => <Layer key={piece.name} p={p} keys={piece.keys} w={piece.rect.w} h={piece.rect.h} radius={piece.rect.r ?? 14} shadow={LIFT} z={3} className="overflow-hidden bg-white"><Shot name={piece.shot} eager /></Layer>)}
    <Layer p={p} keys={layout.focus} w={layout.review.w + 10} h={layout.review.h + 10} radius={18} z={4} className="opening-review-focus" />
    <Fade p={p} show={v => 1 - ramp(v, .025, .26)} shift={-32} className="opening-copy"><OpeningHeading login={login} /></Fade>
    <Fade p={p} show={v => ramp(v, .7, .83)} shift={12} className="opening-connection">
      <p>หลายงาน หลายวันรับเงิน <span>รวมอยู่ในภาพเดียว</span></p>
      <a href="#less-to-remember">แต่ก่อนจะมีภาพนี้…เคยต้องจำทั้งหมดเองไหม? <ArrowDown size={16} /></a>
    </Fade>
    <Fade p={p} show={v => ramp(v, .65, .78)} className="opening-source">ภาพไทม์ไลน์จากแอปจริง · ข้อมูลตัวอย่าง</Fade>
  </>;
}

export default function OpeningAct({ login, reduced }: { login: string; reduced: boolean }) {
  const [short, setShort] = useState(() => window.innerHeight < 650);
  useEffect(() => {
    const query = matchMedia('(max-height: 649px)'); const update = () => setShort(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  if (reduced || short) return <div className="opening-static editorial-wrap">
    <OpeningHeading login={login} />
    <picture className={PUBLIC_PHASE_ONE ? 'opening-phase-one-static' : undefined}><source media="(max-width:1023px)" srcSet={SHOTS['narrow-timeline'].file} /><img src={SHOTS.timeline.file} width={1440} height={900} alt={SHOTS.timeline.alt} /></picture>
    <p className="opening-static-note">หลายงาน หลายวันรับเงิน รวมอยู่ในภาพเดียว · ข้อมูลตัวอย่าง</p>
    <a className="text-link" href="#less-to-remember">เคยต้องจำวันรับเงินทั้งหมดเองไหม? <ArrowDown size={16} /></a>
  </div>;
  return <Pinned className="opening-act" screens={2.25} label="งานแต่ละรายการค่อย ๆ รวมเป็นไทม์ไลน์กำหนดรับเงิน" background="var(--page)">
    {(p, size) => <OpeningStage p={p} size={size} login={login} />}
  </Pinned>;
}
