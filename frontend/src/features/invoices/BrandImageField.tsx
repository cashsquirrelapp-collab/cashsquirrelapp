import React from 'react';
import { Upload } from 'lucide-react';
import { imageFileToDataUrl } from '../../services/images';
import { tr } from '../../i18n/tr';

// Upload box for the logo / signature images kept on the issuer profile. Exported so the
// business-profile editor on the Settings page (the only place that edits this profile now)
// can reuse it without duplicating the upload/crop/position UI.
export const BrandImageField: React.FC<{
  title: string;
  hint: string;
  emptyLabel: string;
  uploadLabel: string;
  removeLabel: string;
  value?: string;
  onChange: (value: string) => void;
  onError: (title: string, message: string) => void;
  size?: { label: string; value: number; min: number; max: number; onChange: (value: number) => void };
  extra?: React.ReactNode;
}> = ({ title, hint, emptyLabel, uploadLabel, removeLabel, value, onChange, onError, size, extra }) => (
  <div className="space-y-3">
    <div>
      <h4 className="text-[14px] font-medium text-brand-text">{title}</h4>
      <p className="mt-0.5 text-xs text-brand-muted">{hint}</p>
    </div>

    <div className="flex flex-col sm:flex-row gap-5 items-center">
      <div className="w-24 h-24 border border-dashed border-brand-border rounded-xl bg-white dark:bg-[#141518] flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
        ) : (
          <div className="text-center p-2 flex flex-col items-center gap-1">
            <Upload className="w-5 h-5 text-brand-muted" />
            <span className="text-[11px] text-brand-muted">{emptyLabel}</span>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-2 w-full">
        <div className="flex flex-wrap gap-2">
          <label className="px-3.5 py-2 bg-[#E65F2B] hover:bg-[#D35221] text-white text-[13px] font-medium rounded-xl cursor-pointer transition-colors flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploadLabel}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                input.value = ''; // picking the same file again must still fire onChange
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  onError(tr("ไฟล์มีขนาดใหญ่เกินไป"), tr("กรุณาอัปโหลดภาพที่มีขนาดไม่เกิน 2MB เพื่อประสิทธิภาพที่รวดเร็ว"));
                  return;
                }
                imageFileToDataUrl(file).then(onChange).catch(error => onError(tr("อัปโหลดภาพไม่สำเร็จ"), error.message));
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="px-3.5 py-2 border border-brand-border text-brand-text hover:bg-[#FDEEEE] hover:text-[#C43A3A] dark:hover:bg-[#F19A9A]/10 dark:hover:text-[#F19A9A] text-[13px] rounded-xl transition-colors cursor-pointer"
            >
              {removeLabel}
            </button>
          )}
        </div>
        {size && value ? (
          <label className="flex items-center gap-3 text-xs text-brand-muted">
            <span className="w-24 shrink-0">{tr("ขนาดบนเอกสาร")}</span>
            <input
              type="range"
              min={size.min}
              max={size.max}
              step={4}
              value={size.value}
              onChange={(e) => size.onChange(Number(e.target.value))}
              aria-label={size.label}
              className="w-full max-w-xs accent-[#E65F2B] cursor-pointer"
            />
            <span className="font-mono w-14 text-right">{size.value}px</span>
          </label>
        ) : null}
        {value ? extra : null}
        <p className="text-[11px] text-brand-muted leading-relaxed">
          {tr("* รองรับ PNG, JPEG และ WebP ไม่เกิน 2MB ระบบย่อภาพก่อนบันทึก")}</p>
      </div>
    </div>
  </div>
);
