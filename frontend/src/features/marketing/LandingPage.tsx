import React, { lazy, Suspense } from 'react';
import { tr } from '../../i18n/tr';
// The landing after the owner's 2026-10-20 reference. The previous editorial landing is kept in ./editorial.
const Landing = lazy(() => import('./saas/SaasLanding'));
export default function LandingPage(_props: { onNavigate: (path: string) => void }) {
  return <Suspense fallback={<div aria-label={tr("กำลังเปิดกระรอกตุนเงิน")} style={{minHeight:'100svh',background:'#FAF8F5'}} />}><Landing /></Suspense>;
}
