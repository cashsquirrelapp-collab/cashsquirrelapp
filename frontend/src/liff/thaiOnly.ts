// The translation helper for the LINE chat's document picture (documentImage.tsx): LINE documents are drawn in Thai,
// so the English dictionary is left out of that small bundle (scripts/build-liff-image.mjs swaps this in for i18n/tr).
function fill(text: string, args: unknown[]): string {
  if (!args.length) return text;
  const named = args.length === 1 && !/\{\d+\}/.test(text) && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] as Record<string, unknown> : null;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!named && /^\d+$/.test(key)) return Number(key) < args.length ? String(args[Number(key)]) : whole;
    return named && key in named ? String(named[key]) : whole;
  });
}
export const tr = (th: string, ...args: unknown[]) => fill(th, args);
export const trc = (_context: string, th: string, ...args: unknown[]) => fill(th, args);
export const trServer = (message: string) => message;
export const T = (th: string) => th;
