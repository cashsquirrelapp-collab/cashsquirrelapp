import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { Bell, CalendarDays, FileText, ArrowDown } from 'lucide-react';
import { PUBLIC_PHASE_ONE } from './publicPhase';

/** The scroll position moves illustrations; reading and page scrolling remain native. */
export function MotionVisual({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, .4, 1], [48, 0, -24]);
  const scale = useTransform(scrollYProgress, [0, .45, 1], [.94, 1, 1.015]);
  return <div ref={ref} className={`motion-visual ${className}`}><motion.div style={reduced ? undefined : { y, scale }}>{children}</motion.div></div>;
}
const questions = [
  { icon: CalendarDays, small: 'วันรับเงิน', title: <>งานนี้<br/>เงินเข้าวันไหน?</>, detail: 'Credit Term 30 วัน', x: -340, y: 0, angle: -13, cls: 'calendar-question' },
  { icon: Bell, small: PUBLIC_PHASE_ONE ? 'รายละเอียดงาน' : 'งานที่ต้องตาม', title: PUBLIC_PHASE_ONE ? <>หลายงานพร้อมกัน<br/>งานไหนถึงขั้นไหน?</> : <>ส่งไปแล้ว<br/>ใครยังไม่จ่าย?</>, detail: 'อีกเรื่องที่ต้องคอยจำ', x: 0, y: 54, angle: 6, cls: 'payment-question' },
  { icon: FileText, small: 'เอกสารของงาน', title: PUBLIC_PHASE_ONE ? <>ใบแจ้งหนี้<br/>พร้อมส่งหรือยัง?</> : <>ใบ 50 ทวิ<br/>เก็บไว้ที่ไหน?</>, detail: PUBLIC_PHASE_ONE ? 'รับเงินแล้ว ออกใบเสร็จต่อ' : 'ถึงสิ้นปี ค่อยหาอีกที?', x: 340, y: -18, angle: 13, cls: 'document-question' },
];
function QuestionCard({ item, progress, reduced }: { item: typeof questions[number]; progress: MotionValue<number>; reduced: boolean }) {
  const x = useTransform(progress, [0, .35, .78, 1], [item.x * 1.28, item.x, item.x * .45, item.x * .35]);
  const y = useTransform(progress, [0, .35, .78, 1], [120 + item.y, item.y, item.y * .5 + 30, 90]);
  const rotate = useTransform(progress, [0, .35, .85, 1], [item.angle * 1.5, item.angle, item.angle * .45, item.angle * .4]);
  const scale = useTransform(progress, [0, .35, 1], [.82, 1, .9]);
  const Icon = item.icon;
  return <motion.div className={`question-paper ${item.cls}`} style={reduced ? { x:item.x, y:item.y, rotate:item.angle } : { x,y,rotate,scale }}><div className="question-paper-top"><Icon size={21}/><span>{item.small}</span></div><strong>{item.title}</strong><span className="question-paper-detail">{item.detail}</span><i/><i/></motion.div>;
}
export default function PainBridge() {
  const ref = useRef<HTMLElement>(null);
  const reduced = !!useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end','end start'] });
  return <section ref={ref} id="less-to-remember" className={`memory-bridge ${reduced?'motion-still':''}`} aria-labelledby="memory-heading"><div className="memory-scene">
    <div className="memory-heading"><p>เคยไหม…</p><h2 id="memory-heading">งานก็เต็มมือแล้ว<br/><span>ยังต้องจำอีกกี่เรื่อง?</span></h2></div>
    <div className="question-stage" aria-label={PUBLIC_PHASE_ONE ? 'ต้องจำวันรับเงิน รายละเอียดงาน และเอกสารที่ต้องออกให้ลูกค้า' : 'ต้องจำวันรับเงิน งานที่ยังไม่จ่าย และเอกสารที่ยังหาไม่เจอ'}>{questions.map(item=><QuestionCard key={item.cls} item={item} progress={scrollYProgress} reduced={reduced}/>)}</div>
    <a href="#credit" className="memory-answer">เรื่องเงิน ให้กระรอกช่วยจำ <ArrowDown size={17}/></a>
  </div></section>;
}
