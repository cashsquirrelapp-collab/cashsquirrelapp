import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion, useScroll, useMotionValueEvent } from 'motion/react';
import { ArrowDown, ArrowRight, Bell, Check, Download, FileText, Folder, Pause, Play, RotateCcw } from 'lucide-react';
import './graphic-stories.css';

/** Explanatory illustrations, not replicas of application UI. Nothing writes to an account. */
function useStory(count: number, duration = 3400) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: .45 });
  const reduce = useReducedMotion();
  const manual = useRef(false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start .88', 'end .25'] });
  useMotionValueEvent(scrollYProgress, 'change', value => {
    if (!manual.current && !reduce) setStep(Math.min(count - 1, Math.floor(Math.max(0, value - .08) / .75 * count)));
  });
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  useEffect(() => {
    const change = () => { setForeground(!document.hidden); if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    if (!visible) { setPlaying(false); return; }

  }, [visible, reduce, foreground]);
  useEffect(() => { if (reduce) { setPlaying(false); setStep(count - 1); } }, [reduce, count]);
  useEffect(() => {
    if (!playing || !visible || reduce || !foreground) return;
    const timer = window.setTimeout(() => {
      if (step === count - 1) setPlaying(false);
      else setStep(s => s + 1);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [playing, visible, reduce, foreground, step, count, duration]);
  return {
    ref, step, playing, reduce: !!reduce,
    select: (next: number) => { manual.current = true; setPlaying(false); setStep(next); },
    toggle: () => {
      manual.current = true;
      if (reduce) { setStep(s => (s + 1) % count); return; }
      if (step === count - 1) setStep(0);
      setPlaying(value => !value);
    },
  };
}
type Story = ReturnType<typeof useStory>;
function StoryControls({ story, labels, name }: { story: Story; labels: string[]; name: string }) {
  return <div className="graphic-controls">
    <div className="graphic-scenes" role="group" aria-label={name}>{labels.map((label, index) => <button key={label} type="button" onClick={() => story.select(index)} aria-pressed={story.step === index} aria-label={`ดูฉาก: ${label}`}><span className="scene-dot" /><span>{label}</span></button>)}</div>
    <button type="button" className="graphic-play" onClick={story.toggle} aria-label={story.reduce ? `ฉากถัดไปของ${name}` : story.playing ? `หยุด${name}` : `เล่น${name}`}>
      {story.reduce ? <ArrowRight size={16} /> : story.playing ? <Pause size={15} /> : story.step === labels.length - 1 ? <RotateCcw size={16} /> : <Play size={15} />}
    </button>
  </div>;
}
function Canvas({ children, className = '', height = 460, label }: { children: React.ReactNode; className?: string; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null); const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 600));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`graphic-canvas ${className}`} style={{ aspectRatio: `600 / ${height}` }} role="img" aria-label={label}><div className="graphic-stage" style={{ width: 600, height, transform: `scale(${scale})` }} aria-hidden="true">{children}</div></div>;
}
function Paper({ kind, title, sub, className = '' }: { kind: 'wht' | 'receipt' | 'bill' | 'job'; title: string; sub: string; className?: string }) {
  return <div className={`story-paper paper-${kind} ${className}`}><div className="paper-top"><span>กระรอกตุนเงิน</span><FileText size={16} /></div><div className="paper-title">{title}</div><div className="paper-sub">{sub}</div><div className="paper-lines"><i /><i /><i /></div><div className="paper-bottom"><span>{kind === 'wht' ? 'WITHHOLDING TAX' : kind === 'receipt' ? 'RECEIPT' : kind === 'job' ? 'PROJECT' : 'EXPENSE'}</span><span>2569</span></div></div>;
}

export function PaymentStory() {
  const story = useStory(3, 3200); const { step, reduce } = story;
  const transition = { duration: reduce ? 0 : .95, ease: [0.22, 1, 0.36, 1] as const };
  return <section id="workflow" className="payment-story graphic-section"><div id="credit" className="editorial-wrap story-split">
    <div className="story-copy"><p className="eyebrow">ส่งงานแล้ว</p><h2>รู้วันรับเงิน<br/><span className="soft-text">โดยไม่ต้องจำ</span></h2><p>วันส่งงาน + เครดิตเทอม<br/>กระรอกวางวันรับเงินให้</p></div>
    <div className="story-visual" ref={story.ref}>
      <Canvas className="payment-canvas" label={`ตัวอย่างงานรีวิวสินค้า 8,000 บาท ส่งวันที่ 1 ตุลาคม เครดิตเทอม 30 วัน คาดว่าจะรับวันที่ 31 ตุลาคม ตอนนี้แสดงฉาก${['ส่งงานแล้ว','รอเครดิตเทอม','เห็นวันรับเงิน'][step]}`}>
        <div className="graphic-halo" />
        <motion.div className="job-paper-wrap" animate={{ x: step === 0 ? 177 : 30, y: step === 0 ? 76 : 85, rotate: step === 0 ? -7 : -13, scale: step === 0 ? 1.12 : .84, opacity: step === 2 ? .4 : 1 }} transition={transition}>
          <Paper kind="job" title="รีวิวสินค้า" sub="Brand B" /><div className="job-paper-price">฿8,000</div><span className="delivered-stamp"><Check size={18} /> ส่งงานแล้ว <small>1 ต.ค. 2569</small></span>
        </motion.div>
        <motion.div className="tear-calendar" animate={{ x: step === 0 ? 330 : step === 1 ? 285 : 233, y: step === 0 ? 190 : 88, rotate: step === 0 ? 10 : 0, scale: step === 0 ? .65 : 1, opacity: step === 0 ? .3 : 1 }} transition={transition}>
          <div className="calendar-rings"><i /><i /></div><div className="calendar-month">ตุลาคม <span>2569</span></div><div className="calendar-number">{step < 2 ? '01' : '31'}</div><div className="calendar-rule" /><span>{step < 2 ? 'วันที่ส่งงาน' : 'คาดว่าจะได้รับเงิน'}</span>{step === 2 && <motion.b initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition}>฿8,000</motion.b>}
        </motion.div>
        <motion.div className="credit-ribbon" animate={{ opacity: step === 1 ? 1 : 0, scale: step === 1 ? 1 : .85, y: step === 1 ? 0 : 15 }} transition={transition}><span>Credit Term</span><b>30 <small>วัน</small></b><ArrowRight size={22} /></motion.div>
        <motion.div className="payment-punchline" animate={{ opacity: step === 2 ? 1 : 0, y: step === 2 ? 0 : 16 }} transition={transition}><Check size={17} /> วันรับเงินมีที่อยู่แล้ว</motion.div>
      </Canvas>
      <StoryControls story={story} labels={['ส่งงาน', 'รอ 30 วัน', 'เห็นวันรับเงิน']} name="เรื่องวันรับเงิน" />
      <p className="graphic-footnote">งานตัวอย่าง 8,000 บาท · วันรับเงินคาดการณ์</p>
    </div>
  </div></section>;
}

export function FollowupGraphic() {
  const reduce = useReducedMotion();
  return <Canvas className="followup-canvas" label="งานรีวิวสินค้าเดิม 8,000 บาท กำหนด 31 ตุลาคม เมื่อถึง 4 พฤศจิกายนยังไม่รับเงิน เกินกำหนด 4 วัน ควรติดตามลูกค้า">
    <div className="followup-orbit orbit-one" /><div className="followup-orbit orbit-two" />
    <motion.div className="late-paper" initial={reduce ? false : { y: 35, rotate: -2, opacity: 0 }} whileInView={{ y: 0, rotate: -8, opacity: 1 }} viewport={{ once: true, amount: .5 }} transition={{ duration: reduce ? 0 : .9 }}><Paper kind="job" title="รีวิวสินค้า" sub="Brand B · ฿8,000" /><span className="paper-due">กำหนดรับ 31 ต.ค.</span></motion.div>
    <motion.div className="followup-tag" initial={reduce ? false : { y: 35, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, amount: .5 }} transition={{ duration: reduce ? 0 : .8, delay: reduce ? 0 : .3 }}><span className="bell-medallion"><Bell size={28} /></span><div><span>ยังไม่รับเงิน</span><strong>เลยกำหนด <em>4 วัน</em></strong><small>งานนี้ควรตามได้แล้ว</small></div></motion.div>
    <div className="followup-date"><span>31 ต.ค.</span><div><i /><i /><i /><i /></div><b>4 พ.ย.</b><small>วันนี้ในตัวอย่าง</small></div>
  </Canvas>;
}

export function MissingDocumentGraphic() {
  const story = useStory(2, 3900); const { step, reduce } = story;
  return <div ref={story.ref}>
    <Canvas className="missing-canvas" label={step === 0 ? 'เงินเข้าแล้ว แต่ยังขาดใบ 50 ทวิของงาน ต้องติดตามจากผู้จ่ายเงิน' : 'เมื่อได้รับและแนบใบ 50 ทวิกับงานแล้ว สถานะจึงเปลี่ยนเป็นได้รับเอกสาร'}>
      <div className="graphic-halo" />
      <div className="received-money"><span className="received-check"><Check size={19} /></span><div>เงินเข้าแล้ว<strong>เอกสารล่ะ?</strong></div></div>
      <div className="missing-outline"><FileText size={27} /><b>50 ทวิ</b><span>ยังรอจากผู้จ่ายเงิน</span></div>
      <motion.div className="arriving-wht" animate={{ y: step ? 0 : 32, rotate: step ? 5 : -7, opacity: step ? 1 : 0 }} transition={{ duration: reduce ? 0 : .9, ease: [.22,1,.36,1] }}><Paper kind="wht" title="50 ทวิ" sub="หนังสือรับรองการหักภาษี ณ ที่จ่าย" /><span className="wht-filed"><Check size={15} /> ได้รับและแนบแล้ว</span></motion.div>
      <div className="missing-question">{step ? 'ครบแล้ว ไม่ต้องตามซ้ำ' : 'จำได้ทุกใบ ว่ายังขาดของงานไหน'}</div>
    </Canvas>
    <StoryControls story={story} labels={['ยังขาดอยู่', 'แนบแล้ว ครบแล้ว']} name="เรื่องใบ 50 ทวิ" />
  </div>;
}

const docs = [
  { kind: 'wht' as const, title: '50 ทวิ', sub: 'รีวิวสินค้า · Brand B', x: 38, y: 20, r: -14 },
  { kind: 'receipt' as const, title: 'ใบเสร็จ', sub: 'ถ่ายภาพสินค้า · Studio E', x: 220, y: -2, r: 4 },
  { kind: 'bill' as const, title: 'บิลค่าอุปกรณ์', sub: 'รายจ่าย · ตุลาคม', x: 390, y: 40, r: 15 },
];
export function VaultStory() {
  const story = useStory(3, 3900); const { step, reduce } = story;
  const transition = { duration: reduce ? 0 : 1.05, ease: [.22,1,.36,1] as const };
  return <section id="vault" className="vault-story graphic-section"><div className="editorial-wrap">
    <div className="vault-heading"><p className="eyebrow pro-eyebrow"><span>PRO</span></p><h2>เก็บวันนี้<br/><span className="soft-text">สิ้นปีก็พร้อม</span></h2><p>50 ทวิ บิล ใบเสร็จ — รวมเป็นชุดเดียว</p></div>
    <div className="vault-visual" ref={story.ref}>
      <Canvas height={510} className="vault-canvas" label={`ภาพอธิบายคลังเอกสาร: ${['เอกสาร 50 ทวิ ใบเสร็จ และบิล ยังแยกกันอยู่','แนบเอกสารไว้กับงานและรายจ่าย เปรียบเหมือนเก็บเข้าซองเดียวกัน','เลือกปีที่อัปโหลดแล้วดาวน์โหลด ZIP จัดโฟลเดอร์ตามงาน และรายจ่ายแยกตามเดือน'][step]}`}>
        <div className="vault-floor" />
        <motion.div className="envelope-group" animate={{ x: step === 2 ? -137 : 0, y: step === 2 ? 14 : 0, scale: step === 2 ? .7 : 1, rotate: step === 2 ? -7 : 0 }} transition={transition}>
          <div className="envelope-back" /><div className="envelope-open-flap" />
          {docs.map((doc, index) => <motion.div key={doc.kind} className="vault-paper" animate={{ x: step === 0 ? doc.x : 181 + index * 17, y: step === 0 ? doc.y : 191 + index * 5, rotate: step === 0 ? doc.r : (index - 1) * 7, scale: step === 0 ? .85 : .73 }} transition={{ ...transition, delay: reduce ? 0 : index * .09 }}><Paper {...doc} /></motion.div>)}
          <div className="envelope-front"><div className="envelope-fold" /><div className="envelope-label"><img src="/brand/logo01-v1/symbol-ci.svg" width="37" height="37" alt="" /><span>เอกสารของคุณ<strong>2569</strong></span></div><span className="envelope-imprint">A LITTLE TODAY. READY TOMORROW.</span></div>
          <motion.div className="envelope-seal" animate={{ opacity: step > 0 ? 1 : 0, scale: step > 0 ? 1 : .6 }} transition={{ ...transition, delay: reduce ? 0 : .5 }}><Check size={17} /></motion.div>
        </motion.div>
        <motion.div className="archive-output" animate={{ opacity: step === 2 ? 1 : 0, x: step === 2 ? 0 : 28, y: step === 2 ? 0 : 15 }} transition={{ ...transition, delay: reduce ? 0 : .22 }}>
          <div className="archive-file"><div className="archive-zipper"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><b /></div><span className="archive-year">2569</span><strong>เอกสารทั้งปี<span>.zip</span></strong><span className="zip-badge">ZIP</span><span className="archive-download"><Download size={20} /></span></div>
          <div className="archive-folders"><div><Folder size={25} /><span>รีวิวสินค้า<small>50 ทวิ.pdf</small></span></div><div><Folder size={25} /><span>ถ่ายภาพสินค้า<small>ใบเสร็จ.pdf</small></span></div><div><Folder size={25} /><span>รายจ่าย<small>2569-10 ตุลาคม / บิล.jpg</small></span></div></div>
        </motion.div>
        <motion.div className="vault-connector" animate={{ opacity: step === 2 ? 1 : 0 }} transition={transition}><ArrowRight size={26} /></motion.div>
        <motion.div className="filed-message" animate={{ opacity: step === 1 ? 1 : 0, y: step === 1 ? 0 : 10 }} transition={transition}><Check size={16} /> เก็บไว้กับงาน หาเจอเป็นเรื่อง</motion.div>
      </Canvas>
      <StoryControls story={story} labels={['ได้เอกสารมา', 'เก็บเข้าที่', 'สิ้นปี โหลดเป็นชุด']} name="เรื่องเก็บเอกสาร" />
      
      <p className="graphic-footnote">ภาพอธิบาย · แนบไฟล์ แล้วเลือกปีที่อัปโหลดเพื่อดาวน์โหลด ZIP</p>
    </div>
  </div></section>;
}

export function MoneyGraphic() {
  return <div className="money-illustration" role="img" aria-label="ตัวอย่างงานมูลค่า 8,000 บาท ยังไม่รับเงินจริง จึงมีเงินค้างรับ 8,000 บาท งานที่รับไม่เท่ากับเงินที่มีใช้">
    <div className="money-column"><span>รับงานไว้</span><div className="money-stack">{[0,1,2,3,4].map(i => <i key={i} style={{ bottom: i * 15 }} />)}<b>฿8,000</b></div><small>มูลค่างาน</small></div>
    <span className="money-not-equal">≠</span>
    <div className="money-column"><span>เงินในมือ</span><div className="money-stack empty"><i /><b>฿0</b></div><small>ยังไม่บันทึกรับเงิน</small></div>
    <div className="money-await"><span className="money-await-dot" />ยังรอรับ <b>฿8,000</b><small>ตัวอย่างงานเดียวกัน</small></div>
  </div>;
}
export function ExpenseGraphic() {
  return <Canvas className="expense-canvas" label="บิลค่าอุปกรณ์ ค่าเดินทาง และค่าจ้างงานต่อ รวมกันเป็นรายจ่ายที่ควรบันทึก เพื่อรู้ว่าเงินออกไปกับอะไร">
    <div className="graphic-halo" />
    {['ค่าอุปกรณ์', 'ค่าเดินทาง', 'จ้างงานต่อ'].map((text, index) => <div className={`expense-slip expense-slip-${index}`} key={text}><span>รายจ่าย</span><strong>{text}</strong><div className="paper-lines"><i /><i /><i /></div><div className="slip-barcode" /></div>)}
    <div className="expense-total"><ArrowDown size={22} /><span>ทีละนิด ที่รวมเป็นก้อน</span></div>
  </Canvas>;
}
