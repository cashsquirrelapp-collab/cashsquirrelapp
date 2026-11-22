import React from 'react';
import { Pipette, Plus } from 'lucide-react';
import { DOCUMENT_COLORS, documentColorOf } from '../../../../shared/documentColors';
import { tr } from '../../i18n/tr';
import './docColorPicker.css';

// Document colour, picked the way Canva's colour panel works (owner, 2026-11-22): a rainbow + for any colour, an
// eyedropper where the browser has one, the ready colours as big circles, and the colours of the business's own logo.

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** Up to four distinct, not-too-light colours that the logo is mostly made of. */
export async function logoColors(src: string | undefined): Promise<string[]> {
  if (!src || typeof document === 'undefined') return [];
  const image = new Image();
  image.crossOrigin = 'anonymous';
  const loaded = await new Promise<boolean>(resolve => { image.onload = () => resolve(true); image.onerror = () => resolve(false); image.src = src; });
  if (!loaded) return [];
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  try {
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    const counts = new Map<string, { n: number; rgb: number[] }>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      if (Math.min(...rgb) > 225) continue; // paper white around the mark
      const key = rgb.map(part => part >> 5).join(',');
      const bucket = counts.get(key) ?? { n: 0, rgb: [0, 0, 0] };
      bucket.n += 1; bucket.rgb = bucket.rgb.map((sum, at) => sum + rgb[at]);
      counts.set(key, bucket);
    }
    const picked: number[][] = [];
    for (const { n, rgb } of [...counts.values()].sort((a, b) => b.n - a.n)) {
      if (n < 6) break;
      const mean = rgb.map(sum => sum / n);
      if (picked.every(other => Math.hypot(...other.map((part, at) => part - mean[at])) > 60)) picked.push(mean);
      if (picked.length === 4) break;
    }
    return picked.map(rgb => `#${rgb.map(part => Math.round(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase());
  } catch {
    return []; // a logo from another site cannot be read back
  }
}

export const DocColorPicker: React.FC<{ value?: string; logoUrl?: string; onChange: (value: string) => void; large?: boolean; compact?: boolean }> = ({ value, logoUrl, onChange, large, compact }) => {
  const current = documentColorOf(value);
  const [fromLogo, setFromLogo] = React.useState<string[]>([]);
  React.useEffect(() => {
    let alive = true;
    void logoColors(logoUrl).then(colors => { if (alive) setFromLogo(colors); });
    return () => { alive = false; };
  }, [logoUrl]);
  const EyeDropper = typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined;
  const pickFromScreen = async () => {
    if (!EyeDropper) return;
    try { onChange((await new EyeDropper().open()).sRGBHex.toUpperCase()); } catch { /* closed without picking */ }
  };
  const customShown = current.custom && !fromLogo.includes(current.key);
  const dot = (key: string, color: string, label: string) => (
    <button key={key} type="button" role="radio" aria-checked={current.key === key} aria-label={label} title={label}
      className="dcp-dot" style={{ background: color }} onClick={() => onChange(key)} />
  );

  // One small row above the document preview (owner, 2026-11-22: "เปลี่ยนสีได้เลย ตรงแถวด้านบนใบเสนอราคา ตรงที่มันโล่ง ๆ").
  if (compact) return (
    <div className="dcp is-compact" role="radiogroup" aria-label={tr("สีเอกสาร")}>
      <span className="dcp-compact-label">{tr("สีเอกสาร")}</span>
      <label className="dcp-dot is-rainbow" title={tr("เลือกสีเอง")}>
        <span aria-hidden="true"><Plus size={12} strokeWidth={2.6} /></span>
        <input type="color" aria-label={tr("เลือกสีเอง")} value={current.custom ? current.key.toLowerCase() : current.accent.toLowerCase()}
          onChange={event => onChange(event.target.value.toUpperCase())} />
      </label>
      {customShown && dot(current.key, current.key, tr(current.name))}
      {DOCUMENT_COLORS.map(color => dot(color.key, color.accent, tr(color.name)))}
      {fromLogo.length > 0 && <span className="dcp-compact-sep" aria-hidden="true" />}
      {fromLogo.map(hex => dot(hex, hex, tr("สีจากโลโก้ของคุณ")))}
    </div>
  );

  return (
    <div className={`dcp${large ? ' is-large' : ''}`}>
      <div>
        <div className="dcp-row" role="radiogroup" aria-label={tr("สีเอกสาร")}>
          <label className="dcp-dot is-rainbow" title={tr("เลือกสีเอง")}>
            <span aria-hidden="true"><Plus size={large ? 20 : 17} strokeWidth={2.4} /></span>
            <input type="color" aria-label={tr("เลือกสีเอง")} value={current.custom ? current.key.toLowerCase() : current.accent.toLowerCase()}
              onChange={event => onChange(event.target.value.toUpperCase())} />
          </label>
          {EyeDropper && (
            <button type="button" className="dcp-dot is-tool" aria-label={tr("ดูดสีจากหน้าจอ")} title={tr("ดูดสีจากหน้าจอ")} onClick={() => void pickFromScreen()}>
              <Pipette size={large ? 20 : 17} aria-hidden="true" />
            </button>
          )}
          {customShown && dot(current.key, current.key, tr(current.name))}
          {DOCUMENT_COLORS.map(color => dot(color.key, color.accent, tr(color.name)))}
        </div>
      </div>
      {fromLogo.length > 0 && (
        <div>
          <p className="dcp-label">{tr("สีจากโลโก้ของคุณ")}</p>
          <div className="dcp-row" role="radiogroup" aria-label={tr("สีจากโลโก้ของคุณ")}>
            {fromLogo.map(hex => dot(hex, hex, tr("สีจากโลโก้ของคุณ")))}
          </div>
        </div>
      )}
      {current.custom && current.accent !== current.key && (
        <p className="dcp-note">{tr("สีนี้อ่อนเกินไปสำหรับตัวหนังสือบนกระดาษขาว แอปจึงปรับให้เข้มขึ้นเล็กน้อยบนเอกสาร")}</p>
      )}
    </div>
  );
};
