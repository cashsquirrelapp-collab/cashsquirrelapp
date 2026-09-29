import type { CSSProperties } from 'react';

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

