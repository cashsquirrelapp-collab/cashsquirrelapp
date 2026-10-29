import React, { lazy, Suspense } from 'react';
import { tr } from '../../i18n/tr';
// The landing since 2026-10-29, in Krarok's own style (./v4). The 2026-10-20 SaaS landing is kept in ./saas and the
// editorial one in ./editorial.
const Landing = lazy(() => import('./v4/GenLanding'));
export default function LandingPage(_props: { onNavigate: (path: string) => void }) {
  return <Suspense fallback={<div aria-label={tr("กำลังเปิดกระรอกตุนเงิน")} style={{minHeight:'100svh',background:'#FAF8F5'}} />}><Landing /></Suspense>;
}
