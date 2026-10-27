/** How much of the token allowance is left, as a ring (the full chat's top bar and the floating window's corner). */
export function TokenRing({ share, size, stroke, level }: { share: number; size: number; stroke: number; level: 'ok' | 'low' | 'empty' }) {
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  return (
    <svg className={`asx-ring is-${level}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="asx-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle className="asx-ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={length} strokeDashoffset={length * (1 - Math.max(0, Math.min(1, share)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}
