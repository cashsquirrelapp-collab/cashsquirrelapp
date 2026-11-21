// Document colour (owner, 2026-11-22: a production client wanted documents in their own look; "เปลี่ยนได้แค่สีก็โอเค").
// One accent for titles, rules and labels, and one light tint for the summary boxes. Saved on the issuer profile as a
// preset key or a #rrggbb picked by hand (owner, 2026-11-22: a picker like Canva's). Old documents and unknown values
// stay orange.
export const DOCUMENT_COLORS = [
  { key: 'orange', name: 'ส้ม', accent: '#E65F2B', tint: '#FCE9DD' },
  { key: 'brick', name: 'แดงอิฐ', accent: '#A63D27', tint: '#F5E2DC' },
  { key: 'navy', name: 'น้ำเงิน', accent: '#1F3F73', tint: '#E3E9F4' },
  { key: 'teal', name: 'เขียวหัวเป็ด', accent: '#1D6B66', tint: '#DDEFEC' },
  { key: 'green', name: 'เขียว', accent: '#2F6B3B', tint: '#E2F0E4' },
  { key: 'plum', name: 'ม่วง', accent: '#673A70', tint: '#F0E5F2' },
  { key: 'graphite', name: 'เทา', accent: '#3D434A', tint: '#ECEDEF' },
  { key: 'black', name: 'ดำ', accent: '#1F1B18', tint: '#EDEBE9' },
] as const;

export type DocumentColorKey = typeof DOCUMENT_COLORS[number]['key'];
export type DocumentColor = { key: string; name: string; accent: string; tint: string; custom: boolean };
export const DOCUMENT_COLOR_KEYS = DOCUMENT_COLORS.map(color => color.key) as [DocumentColorKey, ...DocumentColorKey[]];
export const DEFAULT_DOCUMENT_COLOR: DocumentColorKey = 'orange';
export const CUSTOM_COLOR_NAME = 'สีที่เลือกเอง';
const HEX = /^#[0-9a-f]{6}$/i;

export const isDocumentColorValue = (value: unknown): value is string =>
  typeof value === 'string' && (HEX.test(value) || (DOCUMENT_COLOR_KEYS as readonly string[]).includes(value));

const rgbOf = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
const hexOf = (rgb: number[]) => `#${rgb.map(part => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map(part => { const c = part / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Contrast of a colour against white paper. */
export const contrastOnWhite = (hex: string) => 1.05 / (luminance(rgbOf(hex)) + 0.05);

/** A hand-picked colour as it prints: darkened until small bold text in it still reads on white (3:1), tint at 12%. */
export function customDocumentColor(hex: string): DocumentColor {
  let rgb = rgbOf(hex);
  for (let step = 0; step < 30 && contrastOnWhite(hexOf(rgb)) < 3; step++) rgb = rgb.map(part => part * 0.9);
  const accent = hexOf(rgb);
  const tint = hexOf(rgbOf(accent).map(part => 255 - (255 - part) * 0.12));
  return { key: hex.toUpperCase(), name: CUSTOM_COLOR_NAME, accent, tint, custom: true };
}

export function documentColorOf(value: string | undefined | null): DocumentColor {
  if (value && HEX.test(value)) return customDocumentColor(value);
  const preset = DOCUMENT_COLORS.find(color => color.key === value) ?? DOCUMENT_COLORS[0];
  return { ...preset, custom: false };
}
