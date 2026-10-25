/** Browser-side clipping for the provably zero-alpha edges of a simple vertical CSS mask.
 * Keep every partially painted pixel and leave unsupported masks unmodified. Self-contained
 * because the text-ink checker serializes this function into the browser. */
export function verticalMaskClip(element: Element, style: CSSStyleDeclaration): { top: number; bottom: number } | null {
  const image = style.maskImage || style.webkitMaskImage;
  if (!image || image === 'none' || !/^linear-gradient\(.+\)$/.test(image)) return null;
  if (!['auto', 'auto auto', '100% 100%'].includes(style.maskSize)
    || !['0% 0%', '0px 0px'].includes(style.maskPosition)
    || style.maskOrigin !== 'border-box' || style.maskClip !== 'border-box') return null;
  const split = (source: string, separator: 'comma' | 'space') => {
    const parts: string[] = []; let depth = 0; let start = 0;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth < 0) return [];
      if (depth === 0 && (separator === 'comma' ? char === ',' : /\s/.test(char))) {
        const part = source.slice(start, index).trim(); if (part) parts.push(part);
        start = index + 1;
      }
    }
    if (depth !== 0) return [];
    const last = source.slice(start).trim(); if (last) parts.push(last);
    return parts;
  };
  const parts = split(image.slice('linear-gradient('.length, -1), 'comma');
  let reverse = false;
  if (['to bottom', '180deg'].includes(parts[0])) parts.shift();
  else if (['to top', '0deg', '360deg'].includes(parts[0])) { reverse = true; parts.shift(); }
  // A missing direction defaults to down. Other directions fail the color parser below.
  const bounds = element.getBoundingClientRect();
  const height = bounds.height;
  if (!(height > 0)) return null;
  const position = (source: string): number | null => {
    let value = source.replace(/\s+/g, '');
    if (value.startsWith('calc(') && value.endsWith(')')) value = value.slice(5, -1);
    const terms = value.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px|%)?/g);
    if (!terms || terms.join('') !== value) return null;
    let total = 0;
    for (const term of terms) {
      const number = Number.parseFloat(term);
      if (term.endsWith('%')) total += number * height / 100;
      else if (term.endsWith('px') || number === 0) total += number;
      else return null;
    }
    return Number.isFinite(total) ? total : null;
  };
  const alpha = (color: string): number | null => {
    if (color === 'transparent') return 0;
    const match = /^rgba?\(([^)]+)\)$/.exec(color);
    if (!match) return null;
    const values = match[1].trim().split(/[,\s/]+/);
    if (values.length === 3) return 1;
    if (values.length !== 4) return null;
    const value = Number.parseFloat(values[3]) / (values[3].endsWith('%') ? 100 : 1);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  };
  const stops: { position: number; alpha: number }[] = [];
  for (const part of parts) {
    const tokens = split(part, 'space');
    if (tokens.length < 2 || tokens.length > 3) return null;
    const opacity = alpha(tokens[0]);
    if (opacity === null) return null;
    for (const token of tokens.slice(1)) {
      const at = position(token);
      if (at === null) return null;
      // CSS color-stop fixup clamps a later stop to the preceding stop's position.
      stops.push({ position: Math.max(at, stops.at(-1)?.position ?? -Infinity), alpha: opacity });
    }
  }
  if (stops.length < 2) return null;
  const firstPainted = stops.findIndex(stop => stop.alpha > 0);
  if (firstPainted === -1) return { top: bounds.bottom, bottom: bounds.top };
  let lastPainted = stops.length - 1;
  while (stops[lastPainted].alpha === 0) lastPainted--;
  const start = firstPainted === 0 ? 0 : Math.max(0, Math.min(height, stops[firstPainted - 1].position));
  const end = lastPainted === stops.length - 1 ? height : Math.max(0, Math.min(height, stops[lastPainted + 1].position));
  return reverse ? { top: bounds.top + height - end, bottom: bounds.top + height - start }
    : { top: bounds.top + start, bottom: bounds.top + end };
}
