import React from 'react';

// The background of Welcome Onboarding, option 2 "กราฟโตขึ้น" (owner, 2026-10-28: "ชอบแบบที่2", after asking that it
// stay with the finance CI rather than space): graph-paper dots, a rising line chart that draws itself once, a light
// at its end, small coins drifting up like money being saved, and soft CI glows (orange, caramel, rust). Decoration
// only: hidden from screen readers, never takes a click, and still when the device asks for reduced motion (the line
// is drawn at once, the coins are not shown).

type Coin = { left: string; bottom: number; size: number; duration: string; delay: string };

/** The same coins every time (a seeded sequence), so nothing jumps between renders or screenshots. */
function coins(count: number, seed: number): Coin[] {
  let value = seed;
  const next = () => (value = (value * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => ({
    left: `${(4 + next() * 92).toFixed(1)}%`, bottom: Math.round(-20 + next() * 160), size: Number((6 + next() * 5).toFixed(1)),
    duration: `${(10 + next() * 5).toFixed(1)}s`, delay: `${(-next() * 14).toFixed(1)}s`,
  }));
}

// The chart in each device's own proportions; "slice" scales it to cover the screen without stretching.
// The chart rises under the name field (the greeting keeps the upper half), ending clear of the field and the sides.
const PHONE = {
  box: '0 0 390 844', end: [356, 574] as const,
  line: 'M-10 792 C 30 784, 50 752, 90 756 S 150 720, 185 712 S 240 666, 280 654 S 326 606, 356 574',
  floor: 'L356 844 L-10 844 Z',
};
const WIDE = {
  box: '0 0 1440 900', end: [1330, 560] as const,
  line: 'M-20 862 C 80 854, 150 814, 260 820 S 420 774, 520 764 S 700 714, 820 706 S 1000 648, 1120 634 S 1250 594, 1330 560',
  floor: 'L1330 900 L-20 900 Z',
};

export function OnboardingBackdrop({ phone, still }: { phone: boolean; still: boolean }) {
  const drift = React.useMemo(() => coins(phone ? 9 : 16, phone ? 7 : 9), [phone]);
  const chart = phone ? PHONE : WIDE;
  return (
    <div className="wob-backdrop" aria-hidden="true">
      <i className="wob-glow is-1" />
      <i className="wob-glow is-2" />
      <i className="wob-glow is-3" />
      <i className="wob-grid-dots" />
      <svg className="wob-chart" viewBox={chart.box} preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="wob-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="wob-chart-fill-top" />
            <stop offset="1" className="wob-chart-fill-bottom" />
          </linearGradient>
          <linearGradient id="wob-chart-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" className="wob-chart-stroke-start" />
            <stop offset="1" className="wob-chart-stroke-end" />
          </linearGradient>
          {/* The shade under the line fades out before the line's end, so it has no hard edge there. */}
          <linearGradient id="wob-chart-fade-x" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={chart.end[0]} y2={0}>
            <stop offset="0" stopColor="#fff" stopOpacity={1} />
            <stop offset="0.6" stopColor="#fff" stopOpacity={1} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <mask id="wob-chart-fade" maskUnits="userSpaceOnUse" x={-40} y={0} width={chart.end[0] + 80} height={2000}>
            <rect x={-40} y={0} width={chart.end[0] + 80} height={2000} fill="url(#wob-chart-fade-x)" />
          </mask>
        </defs>
        <path className="wob-chart-area" d={`${chart.line} ${chart.floor}`} mask="url(#wob-chart-fade)" />
        <path className="wob-chart-line" d={chart.line} pathLength={1} />
        <circle className="wob-chart-pulse" cx={chart.end[0]} cy={chart.end[1]} r={5} />
        <circle className="wob-chart-end" cx={chart.end[0]} cy={chart.end[1]} r={4.5} />
      </svg>
      {!still && drift.map((coin, index) => (
        <i key={index} className="wob-coin"
          style={{ left: coin.left, bottom: coin.bottom, width: coin.size, height: coin.size, animationDuration: coin.duration, animationDelay: coin.delay }} />
      ))}
    </div>
  );
}
