import { Job, FixedExpenseItem } from '../../shared/types';
import { currentLanguage } from './i18n/currentLanguage.js';

// The built-in job type chips every account starts with. Anything a user adds via
// "เขียนประเภทงานเอง..." is a custom type, kept separate in the picker so it can be removed.
export const DEFAULT_JOB_TYPES = [
  'Sponsored Post',
  'Video Production',
  'Digital Product',
  'Consulting / Advisory',
  'งานทั่วไปอื่นๆ'
];

// Sum an itemized fixed-expense list (rent, car, internet, etc.) into the single total
// that the rest of the app's profit/cashflow math consumes.
export const sumFixedExpenseItems = (items: FixedExpenseItem[]): number => {
  return items.reduce((sum, item) => sum + (item.amount || 0), 0);
};

// Format currency beautifully
export const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val).replace('THB', '฿');
};

// Add thousand-separator commas to a raw numeric string as the user types (e.g. "12000" -> "12,000")
export const formatNumberWithCommas = (raw: string): string => {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
};

// Strip commas/invalid characters from a formatted number input, keeping digits and a single decimal point
export const stripNumberInput = (input: string): string => {
  const cleaned = input.replace(/,/g, '').replace(/[^\d.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex === -1) return cleaned;
  return cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
};

export { calculatePayDate, isThaiPublicHoliday, formatLocalDate } from '../../shared/calendar';
import { calculatePayDate } from '../../shared/calendar';
// Get name of month in Thai
export const getThaiMonthName = (monthIndex: number, short = false): string => {
  const fullMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const shortMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  return short ? shortMonths[monthIndex] : fullMonths[monthIndex];
};

const ENGLISH_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Get relative days text (e.g., "อีก 5 วัน" / "in 5 days", "เลยกำหนด 2 วัน" / "2 days overdue")
export const getRelativeDaysText = (dateStr: string | null | undefined): { text: string; isOverdue: boolean; daysCount: number } => {
  const isEn = currentLanguage === 'en';
  if (!dateStr) return { text: isEn ? 'No date set' : 'ยังไม่ระบุวัน', isOverdue: false, daysCount: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr + 'T00:00:00');

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { text: isEn ? 'Today' : 'วันนี้', isOverdue: false, daysCount: 0 };
  } else if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return { text: isEn ? `${n} day${n === 1 ? '' : 's'} overdue` : `เลยกำหนด ${n} วัน`, isOverdue: true, daysCount: diffDays };
  } else {
    return { text: isEn ? `in ${diffDays} day${diffDays === 1 ? '' : 's'}` : `อีก ${diffDays} วัน`, isOverdue: false, daysCount: diffDays };
  }
};

// Parse a date string to get month key (e.g. "2026-06"). Jobs/expenses with no date at all
// return "" so they simply don't match any month filter, instead of silently attaching
// themselves to whatever month happens to be "today" when the app is opened.
export const getMonthKey = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '';
  return dateStr.substring(0, 7);
};

// Get list of 4 forecast month keys starting from current month
export const getForecastMonths = (baseDate = new Date()): string[] => {
  const months: string[] = [];
  const temp = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  for (let i = 0; i < 4; i++) {
    const y = temp.getFullYear();
    const m = String(temp.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    temp.setMonth(temp.getMonth() + 1);
  }
  return months;
};

// Format month key to a display label -- Thai month + Buddhist Era year in Thai ("ก.ย. 2569"),
// Gregorian month + year in English ("Sep 2026") -- each reads naturally to its own audience.
export const formatMonthKey = (key: string): string => {
  const [yearStr, monthStr] = key.split('-');
  const monthIdx = parseInt(monthStr) - 1;
  if (currentLanguage === 'en') {
    return `${ENGLISH_MONTHS_SHORT[monthIdx]} ${yearStr}`;
  }
  const yearTh = parseInt(yearStr) + 543; // Buddhist Era
  return `${getThaiMonthName(monthIdx, true)} ${yearTh}`;
};

// The locale to format dates in for the current language -- 'th-TH' renders a Buddhist Era
// year (e.g. 2569); 'en-US' stays Gregorian. Shared by safeFormatThaiDate below and every
// other .toLocaleDateString(...) call site across the app that needs to follow the language
// toggle instead of always rendering Thai.
export const dateLocale = (): string => (currentLanguage === 'en' ? 'en-US' : 'th-TH');

// Format date string safely, returning a "not set" placeholder if empty or invalid. Locale
// follows the current app language (see dateLocale) despite the name -- kept for the many
// existing call sites rather than renaming every one of them.
export const safeFormatThaiDate = (dateStr: string | undefined | null, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string => {
  const notSet = currentLanguage === 'en' ? 'Not set' : 'ยังไม่ระบุ';
  if (!dateStr) return notSet;
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return notSet;
    return date.toLocaleDateString(dateLocale(), options);
  } catch (e) {
    return notSet;
  }
};

// Download all jobs as a CSV file (UTF-8 BOM so Excel/Google Sheets read Thai text correctly).
// Returns false if there was nothing to export.
export const exportJobsToCSV = (jobs: Job[]): boolean => {
  if (!jobs || jobs.length === 0) return false;

  const headers = [
    'ชื่อโปรเจกต์',
    'ประเภทงาน',
    'ลูกค้า',
    'มูลค่ารวม (บาท)',
    'หัก ณ ที่จ่าย (%)',
    'จำนวนภาษีหัก ณ ที่จ่าย (บาท)',
    'ยอดได้รับแล้ว (บาท)',
    'ยอดค้างชำระ (บาท)',
    'สถานะโครงการ',
    'เครดิตเทอม (วัน)',
    'วันเริ่มงาน',
    'วันดีล/วันเผยแพร่',
    'กำหนดชำระเงิน',
    'งวดชำระ',
    'สถานะงวด',
    'วันรับเงินจริง',
    'หมายเหตุ'
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  };

  const rows = jobs.flatMap(j => {
    let statusText = j.status;
    if (j.status === 'done') statusText = 'จ่ายแล้ว';
    else if (j.status === 'partial' || j.status === 'installment') statusText = j.status === 'installment' ? 'แบ่งชำระเป็นงวด' : 'มัดจำ/จ่ายบางส่วน';
    else if (j.status === 'pending') statusText = 'ยังไม่จ่าย';

    const base = (installmentLabel: string, installmentStatus: string, paidAt: string, received: number, pending: number, contractValue: number, whtAmount: number, dueDate: string) => [
      escapeCSV(j.name),
      escapeCSV(j.type || 'ทั่วไป'),
      escapeCSV(j.client || '-'),
      contractValue,
      j.whtRate || 0,
      whtAmount,
      received,
      pending,
      escapeCSV(statusText),
      j.creditTerm || 0,
      escapeCSV(j.startDate || '-'),
      escapeCSV(j.postDate || '-'),
      escapeCSV(dueDate || '-'),
      escapeCSV(installmentLabel || '-'),
      escapeCSV(installmentStatus || '-'),
      escapeCSV(paidAt || '-'),
      escapeCSV(j.note || '')
    ];
    if (!j.installments?.length) return [base('', '', j.payDate || '', j.received || 0, j.pending || 0, j.value || 0, j.whtAmount || 0, j.payDate || '')];
    const netTotal = Math.max(1, j.value - (j.whtAmount || 0));
    return j.installments.map((row, index) => {
      const allocatedWht = index === j.installments!.length - 1
        ? Math.max(0, (j.whtAmount || 0) - j.installments!.slice(0, -1).reduce((sum, item) => sum + Math.round((j.whtAmount || 0) * (item.amount / netTotal)), 0))
        : Math.round((j.whtAmount || 0) * (row.amount / netTotal));
      return base(row.label, row.status === 'paid' ? 'รับแล้ว' : 'รอชำระ', row.paidAt || '', row.status === 'paid' ? row.amount : 0, row.status === 'paid' ? 0 : row.amount, index === 0 ? j.value : 0, allocatedWht, row.dueDate || '');
    });
  });

  const csvContent = '﻿' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `โปรเจกต์รายรับ_กระรอกตุนเสบียง_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
};
