import React from 'react';

// Large amounts on the phone overview card (owner, 2026-10-20: hundreds of thousands, millions and
// tens of millions must stay readable). The owner chose to keep the card exactly as designed and show
// every digit, only smaller: no figure is cut off with "…".
// - The work value keeps its place beside the trend pill and shrinks to fit the room left there.
// - The three figures under it share one size, the largest at which all three fit their columns, so
//   they stay aligned.
// Text widths come from an off-screen copy, so the card's transforms (it shrinks into a bar) and the
// width of its boxes never skew them. Sizes go to CSS variables on the card (mobile.css).

const FIGURE_MIN = 16;
const METRIC_MIN = 9;

/** Width of `el`'s text on one line at `size` px, in the element's own font. */
function textWidth(el: HTMLElement, size: number) {
  const css = getComputedStyle(el);
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;';
  probe.style.fontFamily = css.fontFamily;
  probe.style.fontWeight = css.fontWeight;
  probe.style.letterSpacing = css.letterSpacing;
  probe.style.fontVariantNumeric = css.fontVariantNumeric;
  probe.style.fontSize = `${size}px`;
  probe.textContent = el.textContent;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return Math.max(1, width);
}

/** `key` changes whenever a figure or its text changes, so the card is fitted again. */
export function useFitFigures(heroRef: React.RefObject<HTMLElement | null>, key: string) {
  React.useLayoutEffect(() => {
    const hero = heroRef.current;
    const inner = hero?.querySelector<HTMLElement>('.ksm-hero-inner');
    if (!hero || !inner) return;
    const fit = () => {
      const heroCss = getComputedStyle(hero);
      const px = (name: string, fallback: number) => parseFloat(heroCss.getPropertyValue(name)) || fallback;
      const innerCss = getComputedStyle(inner);
      const width = inner.clientWidth - (parseFloat(innerCss.paddingLeft) || 0) - (parseFloat(innerCss.paddingRight) || 0);
      if (width <= 0) return;

      const figure = hero.querySelector<HTMLElement>('[data-metric="work"]');
      if (figure) {
        const base = px('--ksm-figure-base', 42);
        // Whatever shares the figure's line: the trend pill, or anything marked data-fit-beside.
        const beside = [...hero.querySelectorAll<HTMLElement>('.ksm-trend, [data-fit-beside]')];
        const room = width - beside.reduce((sum, el) => sum + el.offsetWidth + 10, 0);
        const size = Math.min(base, (base * room) / textWidth(figure, base));
        hero.style.setProperty('--ksm-figure-size', `${Math.max(FIGURE_MIN, Math.floor(size * 10) / 10)}px`);
      }

      const values = [...hero.querySelectorAll<HTMLElement>('.ksm-hero-metrics b')];
      if (values.length) {
        const base = px('--ksm-metric-base', 19);
        const pad = px('--ksm-metric-pad', 10);
        // Equal columns; each loses its side padding and the 1px divider.
        const column = width / values.length - pad * 2 - 1;
        const size = Math.min(base, ...values.map(value => (base * column) / textWidth(value, base)));
        hero.style.setProperty('--ksm-metric-size', `${Math.max(METRIC_MIN, Math.floor(size * 10) / 10)}px`);
      }
    };
    fit();
    // A new width (rotation, a larger text setting) fits again; changing sizes never changes the width.
    const observer = new ResizeObserver(fit);
    observer.observe(inner);
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) fit(); });
    return () => { alive = false; observer.disconnect(); };
  }, [heroRef, key]);
}
