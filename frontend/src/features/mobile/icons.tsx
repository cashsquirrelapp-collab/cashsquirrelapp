import React from 'react';

// The icon set of the owner's mobile design (kraroktunngern-Numeric-Value.html), path for path:
// 24-unit grid, 1.65 stroke, round caps and joins. Kept separate from the lucide icons the desktop
// layout uses so the mobile shell matches its design exactly.
const PATHS = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a21 21 0 0 0 18 0M10 12v3h4v-3"/>',
  wallet: '<path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14V8H6a2 2 0 0 1 0-4"/><path d="M20 12h-5a3 3 0 0 0 0 6h5"/><circle cx="16" cy="15" r=".6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3"/>',
  document: '<path d="M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h6"/>',
  chart: '<path d="M3 3v18h18M7 15V9m5 6V5m5 10v-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m4 0h2m-8 3h2"/>',
  expense: '<path d="M11 3H5a2 2 0 0 0-2 2v13a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-7M3 7h8"/><path d="M21 12h-4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h4"/><circle cx="18.5" cy="5.5" r="4.5"/><path d="M16.5 5.5h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 8-8M16 4h4v4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6"/>',
  folder: '<path d="M3 6V4h7l3 3h8v14H3Z"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-4a7 5 0 0 1 14 0v4M17 4a3 3 0 0 1 0 6m2 4c3 1 3 4 3 7"/>',
  settings: '<path d="m10 2-1 3-3 1-3-1-1 4 2 2v3l-2 2 2 4 3-1 3 1 1 2 4-1 1-3 3-1 3 1 1-4-2-2V9l2-2-2-3-3 1-3-1-1-2Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="m15 4 5 5M3 21l1-6L17 2l5 5L9 20ZM4 15l5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  logout: '<path d="M9 3H3v18h6M9 12h12m-5-5 5 5-5 5"/>',
} as const;

export type KsIconName = keyof typeof PATHS;

export function KsIcon({ name, size = 22, className = '' }: { name: KsIconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
  );
}

/** The squirrel's head in silhouette with a plus sign: the centre button of the bottom bar, as drawn in the design. */
export function SquirrelAdd() {
  return (
    <svg viewBox="27 17 46 58" fill="currentColor" aria-hidden="true">
      <path d="M38 35C35 25 39 18 42 18C45 18 45 27 42 35" />
      <path d="M62 35C65 25 61 18 58 18C55 18 55 27 58 35" />
      <circle cx="50" cy="52" r="22" />
      <path d="M50 44v15m-7.5-7.5h15" fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
