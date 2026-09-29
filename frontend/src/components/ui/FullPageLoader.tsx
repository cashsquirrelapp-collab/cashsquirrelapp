import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LoadingMascot } from '../mascot/LoadingMascot';

const DEFAULT_MESSAGES = [
  'กำลังเช็กเงินที่ต้องติดตาม',
  'กำลังดู Credit Term',
  'กำลังสรุปกระแสเงินสด',
  'กำลังเตรียมข้อมูลของคุณ',
];

interface FullPageLoaderProps {
  /** Main headline -- keep this the same across contexts per the loading-system spec. */
  title?: string;
  /** Secondary line(s), cycled every ~1.8s. Override per context (e.g. Tax: "กำลังคำนวณข้อมูลภาษี"). */
  messages?: string[];
}

function LoadingDots() {
  const reduceMotion = useReducedMotion();
  const dots = [0, 0.12, 0.24];
  return (
    <div className="mt-1 flex items-center gap-1.5">
      {dots.map((delay, i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[#F36A2D]"
          animate={reduceMotion ? { opacity: [0.4, 0.8, 0.4] } : { scale: [0.65, 1, 0.65] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut', delay }}
        />
      ))}
    </div>
  );
}

/**
 * Full-screen loading moment -- reserved for the handful of cases the loading-system spec calls
 * out (first app open, session init, a major workspace switch, first Dashboard load). Everything
 * else uses a skeleton instead; see useDelayedLoader for the show-delay/min-visible gating that
 * keeps this from flashing on fast loads.
 */
export function FullPageLoader({ title = 'กำลังเปิดคลังกระรอก…', messages = DEFAULT_MESSAGES }: FullPageLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = window.setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [messages]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-2.5 bg-brand-bg px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingMascot state="loading-spin" mood="happy" size={104} />
      <p className="mt-1 text-sm font-semibold text-brand-text">{title}</p>
      <p className="text-xs text-brand-muted" aria-live="off">{messages[messageIndex]}</p>
      <LoadingDots />
      <span className="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่</span>
    </div>
  );
}
