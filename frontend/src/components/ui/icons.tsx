import React from 'react';

interface IconProps {
  className?: string;
}

function Svg({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || 'w-4 h-4'}
    >
      {children}
    </svg>
  );
}

export const IconTarget = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconWarning = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.5 L21 19.5 L3 19.5 Z" />
    <path d="M12 9.5 V14" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconAlertDot = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5 V13" />
    <circle cx="12" cy="16.2" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSpark = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 2 L13.6 9.6 L21 12 L13.6 14.4 L12 22 L10.4 14.4 L3 12 L10.4 9.6 Z" />
  </Svg>
);

export const IconBurst = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 4.5 V2" />
    <path d="M12 22 V19.5" />
    <path d="M4.5 12 H2" />
    <path d="M22 12 H19.5" />
    <path d="M6.5 6.5 L4.8 4.8" />
    <path d="M19.2 19.2 L17.5 17.5" />
    <path d="M6.5 17.5 L4.8 19.2" />
    <path d="M19.2 4.8 L17.5 6.5" />
  </Svg>
);

export const IconCoin = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5 V16.5" />
    <path d="M9.3 15.2 c0 1.1 1.2 1.8 2.7 1.8 s2.7-0.7 2.7-1.8 c0-1-0.9-1.5-2.7-1.9 c-1.8-0.4-2.7-0.9-2.7-1.9 c0-1.1 1.2-1.8 2.7-1.8 s2.7 0.7 2.7 1.8" />
  </Svg>
);

export const IconCoinOut = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="10" cy="14" r="6.5" />
    <path d="M10 11 V17" />
    <path d="M8 16 c0 0.9 0.9 1.4 2 1.4 s2-0.5 2-1.4 c0-0.8-0.7-1.1-2-1.4 c-1.3-0.3-2-0.6-2-1.4 c0-0.9 0.9-1.4 2-1.4 s2 0.5 2 1.4" />
    <path d="M15 9 L21 3" />
    <path d="M21 7.5 V3 H16.5" />
  </Svg>
);

export const IconCheck = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 12.5 L9.5 18 L20 5" />
  </Svg>
);

export const IconClose = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 5 L19 19" />
    <path d="M19 5 L5 19" />
  </Svg>
);

export const IconBolt = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" />
  </Svg>
);

export const IconTrash = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4.5 7 H19.5" />
    <path d="M9 7 V4.5 H15 V7" />
    <path d="M6.5 7 L7.3 20 H16.7 L17.5 7" />
    <path d="M10.5 11 V16.5" />
    <path d="M13.5 11 V16.5" />
  </Svg>
);

export const IconCamera = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 8 H8 L9.5 5.5 H14.5 L16 8 H21 V19 H3 Z" />
    <circle cx="12" cy="13.2" r="3.6" />
  </Svg>
);

export const IconGem = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 4 H18 L22 9.5 L12 21 L2 9.5 Z" />
    <path d="M2 9.5 H22" />
    <path d="M9 4 L6.5 9.5 L12 21 L17.5 9.5 L15 4" />
  </Svg>
);

export const IconPiggy = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 13 c0-4 3.6-7 8-7 s8 3 8 7 c0 3.6-3 6.2-6.5 6.8 V22 h-3 v-2.1 A8.5 8.5 0 0 1 4 13 Z" />
    <path d="M12 6 V3.5" />
    <circle cx="15.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
    <path d="M4.5 12.5 L2.5 11 V15 Z" />
  </Svg>
);

export const IconPalette = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.5 c-5 0-8.5 3.6-8.5 8 c0 3.6 2.4 5.7 5 5.7 c1 0 1.4-0.6 1.4-1.3 c0-0.6-0.4-1-0.4-1.7 c0-1 0.9-1.7 2-1.7 h2.3 c2.9 0 5.2-2 5.2-5 C19 6.5 16.4 3.5 12 3.5 Z" />
    <circle cx="8.2" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="11.5" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconGraduation = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M2 9.5 L12 5 L22 9.5 L12 14 Z" />
    <path d="M6.5 11.7 V16.5 c0 1.4 2.4 2.5 5.5 2.5 s5.5-1.1 5.5-2.5 V11.7" />
    <path d="M22 9.5 V15.5" />
  </Svg>
);

export const IconPencil = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M14.5 4.5 L19.5 9.5 L8 21 H3 V16 Z" />
    <path d="M12.3 6.7 L17.3 11.7" />
  </Svg>
);

export const IconCalendar = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
    <path d="M3.5 10 H20.5" />
    <path d="M8 3.5 V7.5" />
    <path d="M16 3.5 V7.5" />
    <circle cx="12" cy="15" r="0.7" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconBulb = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M8 10.5 c0-2.5 1.8-4.5 4-4.5 s4 2 4 4.5 c0 1.8-1 2.8-1.8 3.7 c-0.5 0.6-0.7 1-0.7 1.8 H10.5 c0-0.8-0.2-1.2-0.7-1.8 C9 13.3 8 12.3 8 10.5 Z" />
    <path d="M10.3 18.5 H13.7" />
    <path d="M10.7 20.5 H13.3" />
  </Svg>
);

export const IconNote = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
    <path d="M7.5 8.5 H16.5" />
    <path d="M7.5 12 H16.5" />
    <path d="M7.5 15.5 H13" />
  </Svg>
);

export const IconAcorn = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 9 c0-2.8 2.7-4.5 6-4.5 s6 1.7 6 4.5 c0 0.9-0.6 1.4-1.6 1.6" />
    <path d="M7.6 10.6 C6 11 5 12.7 5 14.6 c0 3 3.1 5.4 7 5.4 s7-2.4 7-5.4 c0-1.9-1-3.6-2.6-4" />
    <path d="M9.5 6.2 c1 -0.6 2.2 -0.9 2.5 -1.7" />
  </Svg>
);

export const IconArrowRight = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 12 H20" />
    <path d="M14 6 L20 12 L14 18" />
  </Svg>
);

export const IconArrowLeft = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M20 12 H4" />
    <path d="M10 6 L4 12 L10 18" />
  </Svg>
);

export const IconArrowUpRight = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 18 L18 6" />
    <path d="M9 6 H18 V15" />
  </Svg>
);

export const IconArrowUp = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 20 V4" />
    <path d="M6 10 L12 4 L18 10" />
  </Svg>
);

export const IconBarChart = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 20 V13" />
    <path d="M12 20 V7" />
    <path d="M19 20 V10" />
    <path d="M3 20 H21" />
  </Svg>
);

export const IconTrendUp = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 16 L9.5 9.5 L13.5 13.5 L21 6" />
    <path d="M15 6 H21 V12" />
  </Svg>
);

export const IconClear = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 19 L15 9" />
    <path d="M13.5 7.5 L16.5 4.5 L19.5 7.5 L16.5 10.5" />
    <path d="M4 20 H10" />
  </Svg>
);

export const IconDot = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className || 'w-2.5 h-2.5'}>
    <circle cx="12" cy="12" r="9" fill="currentColor" />
  </svg>
);

export const IconTool = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M14.5 6.5 a4 4 0 0 1 5 5 L21 13 L18.5 15.5 L16 13 l-1.5 1.5 a4 4 0 0 1-5-5 L4 5 L6.5 2.5 Z" />
    <path d="M5 16.5 L7.5 19" />
  </Svg>
);

export const IconCar = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4.5 16 V12 L6.5 7.5 H17.5 L19.5 12 V16" />
    <path d="M4.5 16 H19.5" />
    <circle cx="7.5" cy="16.5" r="1.8" />
    <circle cx="16.5" cy="16.5" r="1.8" />
  </Svg>
);

export const IconRing = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="15" r="5.5" />
    <path d="M9 9.5 L12 4 L15 9.5" />
  </Svg>
);

export const IconHome = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 11 L12 4 L20 11" />
    <path d="M6 10 V20 H18 V10" />
    <path d="M10 20 V14.5 H14 V20" />
  </Svg>
);

export const IconTent = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 4 L21 20 H3 Z" />
    <path d="M12 4 V20" />
    <path d="M9.5 20 L12 12 L14.5 20" />
  </Svg>
);

export const IconGuitar = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="9" cy="16" r="4.2" />
    <circle cx="10.5" cy="12.5" r="2.3" />
    <path d="M11.8 10.7 L18 4" />
    <rect x="17" y="2.3" width="3.2" height="3" rx="0.6" transform="rotate(45 18.6 3.8)" />
  </Svg>
);

export const IconGift = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="4" y="10" width="16" height="10" rx="1" />
    <path d="M4 14 H20" />
    <path d="M12 10 V20" />
    <path d="M12 10 c0-3-2-5-3.5-5 c-1.4 0-2 1.1-1 2.4 C8.3 8.7 10 10 12 10 Z" />
    <path d="M12 10 c0-3 2-5 3.5-5 c1.4 0 2 1.1 1 2.4 C15.7 8.7 14 10 12 10 Z" />
  </Svg>
);

export const IconPlane = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 12.5 L21 4 L13.5 22 L11 14 Z" />
    <path d="M11 14 L3 12.5" />
  </Svg>
);

export const IconScale = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.5 V20" />
    <path d="M6 20 H18" />
    <path d="M4 7 H20" />
    <path d="M4 7 L1.5 12.5 a2.6 2.6 0 0 0 5 0 Z" />
    <path d="M20 7 L17.5 12.5 a2.6 2.6 0 0 0 5 0 Z" />
  </Svg>
);

export const IconFolder = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3.5 6.5 h5.5 l1.5 2 h9.5 v11 h-16.5 Z" />
  </Svg>
);

export const IconCrown = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 18 L3 8 L8.5 12 L12 5 L15.5 12 L21 8 L20 18 Z" />
    <path d="M4 18 H20" />
  </Svg>
);

export const IconClapper = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 10 L4 6 L19 6 L20 10" />
    <path d="M3 10 H20.5 V19 H3 Z" />
    <path d="M6.5 6 L8 9.7" />
    <path d="M11 6 L12.5 9.7" />
    <path d="M15.5 6 L17 9.7" />
  </Svg>
);

export const IconHourglass = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6.5 3.5 H17.5" />
    <path d="M6.5 20.5 H17.5" />
    <path d="M7.5 3.5 V6 c0 2 1.8 3.5 4.5 5.5 c2.7-2 4.5-3.5 4.5-5.5 V3.5" />
    <path d="M7.5 20.5 V18 c0-2 1.8-3.5 4.5-5.5 c2.7 2 4.5 3.5 4.5 5.5 v2.5" />
  </Svg>
);

export const IconSleep = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M17 3 A7 7 0 1 0 21 12 A5.4 5.4 0 0 1 17 3 Z" />
    <path d="M14 15 H17.5 L14 18.5 H17.5" />
  </Svg>
);

export const IconBriefcase = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="8" width="18" height="11" rx="1.5" />
    <path d="M8.5 8 V6 a1.5 1.5 0 0 1 1.5-1.5 h4 a1.5 1.5 0 0 1 1.5 1.5 v2" />
    <path d="M3 13 H21" />
  </Svg>
);

export const IconHeart = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 20 C6 16 3 12.6 3 9 a4.5 4.5 0 0 1 9-1.1 A4.5 4.5 0 0 1 21 9 c0 3.6-3 7-9 11 Z" />
  </Svg>
);

export const IconPin = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 21 c4-4.6 7-8.3 7-11.5 A7 7 0 0 0 5 9.5 C5 12.7 8 16.4 12 21 Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </Svg>
);

export const IconBell = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6 16 V11 a6 6 0 0 1 12 0 v5 l1.5 2.5 h-15 Z" />
    <path d="M10 19.5 a2 2 0 0 0 4 0" />
  </Svg>
);

export const IconMail = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
    <path d="M3.5 6.5 L12 13 L20.5 6.5" />
  </Svg>
);

export const IconBag = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M6.5 8 H17.5 L18.5 20 H5.5 Z" />
    <path d="M9 8 V6.5 a3 3 0 0 1 6 0 V8" />
  </Svg>
);

export const IconPackage = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 8 L12 4 L20 8 V16 L12 20 L4 16 Z" />
    <path d="M4 8 L12 12 L20 8" />
    <path d="M12 12 V20" />
  </Svg>
);

export const IconMegaphone = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 10.5 V15.5 H6 L15 19.5 V6.5 L6 10.5 Z" />
    <path d="M6 15.5 L7.5 20" />
    <path d="M15 9 a3.4 3.4 0 0 1 0 8" />
  </Svg>
);

export const IconSave = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 3.5 H16 L19.5 7 V20.5 H5 Z" />
    <rect x="8" y="3.5" width="7" height="5" />
    <rect x="7.5" y="13.5" width="9" height="6.5" />
  </Svg>
);

export const IconCloud = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M7 18 a4 4 0 0 1-0.5-8 a5.5 5.5 0 0 1 10.7-1.8 A4.2 4.2 0 0 1 17.5 18 Z" />
  </Svg>
);

export const IconSquirrel = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 20 c-1.5-3.5-0.5-8 3-10.5" />
    <circle cx="12" cy="9" r="3.6" />
    <path d="M15.5 7.5 c2.5-1.5 5.5 0.5 5.5 3.5 c0 3-2.5 4-4.5 4 c-1 0-1.5 0.6-1.5 1.5 V20" />
    <circle cx="13.2" cy="8" r="0.5" fill="currentColor" stroke="none" />
    <path d="M9 20 c0-2.5 1.3-4 3-4 s3 1.5 3 4" />
  </Svg>
);

export const IconLoop = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4.5 11 a7.5 7.5 0 0 1 13-5" />
    <path d="M14 3.5 H17.5 V7" />
    <path d="M19.5 13 a7.5 7.5 0 0 1-13 5" />
    <path d="M10 20.5 H6.5 V17" />
  </Svg>
);

export const IconLaptop = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="4.5" y="5" width="15" height="10" rx="1.2" />
    <path d="M2.5 19 H21.5" />
    <path d="M2.5 19 L4.5 15.5 H19.5 L21.5 19" />
  </Svg>
);

export const IconRocket = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 2.5 c3 1.8 4.5 5.3 4.5 9 c0 2.5-0.8 4.6-1.6 6 h-5.8 c-0.8-1.4-1.6-3.5-1.6-6 c0-3.7 1.5-7.2 4.5-9 Z" />
    <circle cx="12" cy="10" r="1.7" />
    <path d="M9.1 15 L6 17.5 L7 13.5" />
    <path d="M14.9 15 L18 17.5 L17 13.5" />
    <path d="M10.3 17.5 L10 21.5 L12 19.5 L14 21.5 L13.7 17.5" />
  </Svg>
);
