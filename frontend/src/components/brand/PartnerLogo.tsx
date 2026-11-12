import React from 'react';

// The real Google Sheets and Microsoft Excel icons (owner, 2026-11-13: "เอาโลโก้ชีตของจริงกับโลโก้ Excel จริงมาใส่"), kept in
// /brand/partners as fetched from Google (gstatic.com) and Microsoft (cdn.office.net), never redrawn or recoloured. Shown
// beside the product's name wherever Krarok connects to it.

export const PARTNER_LOGOS = {
  sheets: '/brand/partners/google-sheets.png',
  excel: '/brand/partners/excel.svg',
} as const;
export type PartnerKind = keyof typeof PARTNER_LOGOS;

export function PartnerLogo({ kind, size = 20, className }: { kind: PartnerKind; size?: number; className?: string }) {
  return <img src={PARTNER_LOGOS[kind]} alt="" aria-hidden="true" width={size} height={size} className={className} draggable={false}
    style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }} />;
}
