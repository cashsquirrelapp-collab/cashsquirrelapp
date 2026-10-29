import React, { lazy, Suspense } from 'react';
import { tr } from '../../i18n/tr';
// The landing since 2026-10-29: clean and white with liquid glass cards, moved by GSAP (./v5). The first own-style
// landing of the same day is kept in ./v4, the 2026-10-20 SaaS landing in ./saas and the editorial one in ./editorial.
const Landing = lazy(() => import('./v5/CleanLanding'));
export default function LandingPage(_props: { onNavigate: (path: string) => void }) {
  return <Suspense fallback={<div aria-label={tr("กำลังเปิดกระรอกตุนเงิน")} style={{minHeight:'100svh',background:'#FAF8F5'}} />}><Landing /></Suspense>;
}
