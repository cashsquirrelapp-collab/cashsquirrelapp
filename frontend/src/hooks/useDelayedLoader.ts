import { useEffect, useRef, useState } from 'react';

interface DelayedLoaderOptions {
  /** Don't show the loader at all if `active` resolves before this many ms (default 400). */
  showDelay?: number;
  /** Once shown, keep the loader visible at least this long to avoid a flash (default 600). */
  minVisible?: number;
}

/**
 * Debounces a raw "is this thing loading" boolean into "should the full-page loader actually be
 * shown right now" -- per the loading-system spec: skip the loader entirely for fast (<400ms)
 * operations, and once it does appear, never let it flash for less than ~600ms.
 */
export function useDelayedLoader(active: boolean, options: DelayedLoaderOptions = {}): boolean {
  const { showDelay = 400, minVisible = 600 } = options;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      const showTimer = window.setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showDelay);
      return () => window.clearTimeout(showTimer);
    }

    if (!visible) return;
    const elapsed = shownAtRef.current ? Date.now() - shownAtRef.current : minVisible;
    const remaining = Math.max(0, minVisible - elapsed);
    const hideTimer = window.setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => window.clearTimeout(hideTimer);
  }, [active, showDelay, minVisible]);

  return visible;
}
