import type { CSSProperties } from 'react';
import { Mascot } from '../mascot/Mascot';

const Block = ({ className = '', style }: { className?: string; style?: CSSProperties }) => (
  <div aria-hidden="true" className={`app-skeleton-block ${className}`} style={style} />
);

export function ContentLoadingSkeleton() {
  return (
    <div className="app-skeleton-content" aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-3">
          <Block className="h-7 w-44 sm:w-60" />
          <Block className="h-3 w-52 sm:w-80" />
        </div>
        <Block className="h-10 w-32 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="app-skeleton-card space-y-5">
            <div className="flex items-center justify-between">
              <Block className="h-11 w-11 rounded-2xl" />
              <Block className="h-3 w-16" />
            </div>
            <Block className="h-3 w-24" />
            <Block className="h-8 w-3/4" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="app-skeleton-card min-h-72 space-y-6">
          <div className="flex items-center justify-between">
            <Block className="h-5 w-36" />
            <Block className="h-8 w-20 rounded-xl" />
          </div>
          <div className="flex h-44 items-end gap-3 pt-4">
            {[48, 72, 58, 90, 65, 82, 54].map((height, index) => (
              <Block key={index} className="flex-1 rounded-t-xl" style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="flex gap-5">
            <Block className="h-3 w-24" />
            <Block className="h-3 w-28" />
          </div>
        </div>

        <div className="app-skeleton-card min-h-72 space-y-5">
          <Block className="h-5 w-32" />
          {[0, 1, 2, 3].map(item => (
            <div key={item} className="flex items-center gap-3">
              <Block className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Block className="h-3 w-3/5" />
                <Block className="h-2.5 w-2/5" />
              </div>
              <Block className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppLoadingSkeleton() {
  return (
    <div className="app-shell flex min-h-screen bg-brand-bg" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่</span>

      <aside className="app-sidebar hidden w-68 shrink-0 border-r border-brand-border/40 p-6 lg:block">
        <div className="mb-9 flex items-center gap-3 px-2">
          <Mascot mood="happy" size={38} animated />
          <div className="space-y-2">
            <Block className="h-4 w-28" />
            <Block className="h-2.5 w-20" />
          </div>
        </div>
        <div className="space-y-3">
          {[76, 62, 70, 58].map((width, index) => (
            <div key={index} className="flex items-center gap-3 rounded-2xl px-3 py-3">
              <Block className="h-9 w-9 shrink-0 rounded-xl" />
              <Block className="h-3.5" style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
        <div className="my-7 h-px bg-brand-border/60" />
        <div className="space-y-4 px-3">
          <Block className="h-3 w-20" />
          <Block className="h-3.5 w-32" />
          <Block className="h-3.5 w-28" />
          <Block className="h-3.5 w-36" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-topbar flex h-18 items-center justify-between border-b border-brand-border/40 px-4 sm:px-7">
          <div className="flex items-center gap-3 lg:hidden">
            <Mascot mood="happy" size={34} animated />
            <Block className="h-4 w-28" />
          </div>
          <div className="hidden space-y-2 lg:block">
            <Block className="h-4 w-36" />
            <Block className="h-2.5 w-24" />
          </div>
          <div className="flex items-center gap-3">
            <Block className="hidden h-9 w-28 rounded-full sm:block" />
            <Block className="h-10 w-10 rounded-2xl" />
          </div>
        </header>

        <main className="w-full max-w-7xl flex-1 self-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
          <ContentLoadingSkeleton />
        </main>
      </div>
    </div>
  );
}
