import type { InvoiceItem } from '../../../../shared/types';

// Pure helpers for the accounting documents (kept free of React so they can be unit-tested).

// ---------------------------------------------------------------------------------------------

export const formatMoney = (value: number): string =>
  (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Buddhist-era dd/mm/yyyy, the way Thai business documents write dates
export const formatDocDate = (value?: string): string => {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${Number(match[1]) + 543}`;
};

export const thaiBahtText = (num: number): string => {
  try {
    if (!Number.isFinite(num)) return '';
    const numbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
    const [integerPart, decimalPart] = Math.abs(num).toFixed(2).split('.');
    if (Number(integerPart) === 0 && Number(decimalPart) === 0) return 'ศูนย์บาทถ้วน';

    const readGroup = (digits: string): string => {
      let out = '';
      const len = digits.length;
      for (let i = 0; i < len; i++) {
        const digit = Number(digits[i]);
        const pos = len - i - 1;
        if (digit === 0) continue;
        let name = numbers[digit];
        if (pos === 1) name = digit === 1 ? '' : digit === 2 ? 'ยี่' : name;
        else if (pos === 0 && digit === 1 && /[1-9]/.test(digits.slice(0, i))) name = 'เอ็ด';
        out += name + positions[pos];
      }
      return out;
    };

    // Split into 6-digit groups joined by "ล้าน" so values of a million and above read correctly
    let baht = '';
    let rest = integerPart.replace(/^0+/, '');
    const groups: string[] = [];
    while (rest.length > 0) {
      groups.unshift(rest.slice(-6));
      rest = rest.slice(0, -6);
    }
    groups.forEach((group, index) => {
      const text = readGroup(group.padStart(group.length, '0'));
      // a lone "1" in the units place of a non-leading group after ล้าน reads เอ็ด (e.g. 1,000,001)
      const fixed = index > 0 && group.replace(/^0+/, '') === '1' ? 'เอ็ด' : text;
      baht += fixed + (index < groups.length - 1 ? 'ล้าน' : '');
    });
    if (baht) baht += 'บาท';

    if (Number(decimalPart) === 0) return baht + 'ถ้วน';
    return baht + readGroup(decimalPart).replace(/^เอ็ด$/, 'หนึ่ง') + 'สตางค์';
  } catch {
    return '';
  }
};

export interface DocumentTotals {
  gross: number; // before line discounts
  discount: number;
  subtotal: number; // net of line discounts
  vatAmount: number;
  total: number; // subtotal + VAT (before withholding)
  whtAmount: number;
  payable: number; // total - withholding
}

export const calculateDocumentTotals = (items: InvoiceItem[], vatRate: number, whtRate: number): DocumentTotals => {
  const gross = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const subtotal = gross - discount;
  const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const vatAmount = vatRate > 0 ? round2(subtotal * (vatRate / 100)) : 0;
  const whtAmount = whtRate > 0 ? round2(subtotal * (whtRate / 100)) : 0;
  const total = subtotal + vatAmount;
  return { gross, discount, subtotal, vatAmount, total, whtAmount, payable: total - whtAmount };
};

