import { Job, FixedExpenseItem } from '../../shared/types';
import { currentLanguage } from './i18n/currentLanguage.js';
import { tr, trc } from './i18n/tr';
import { getOutstandingAmount } from '../../shared/installmentPayments';

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

export const toLocalDateKey = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const isReminderDue = (job: Job, todayKey = toLocalDateKey()): boolean =>
  !!job.remindAt && job.remindAt <= todayKey && getOutstandingAmount(job) > 0;

export const formatAxisBaht = (val: number, symbol = '฿'): string => {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs < 1000) return `${sign}${symbol}${Math.round(abs)}`;
  if (abs < 1_000_000) return `${sign}${symbol}${Number((abs / 1000).toFixed(1))}k`;
  return `${sign}${symbol}${Number((abs / 1_000_000).toFixed(1))}M`;
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
/** YYYY-MM of today, local time. */
export const currentMonthKeyNow = (): string => toLocalDateKey().slice(0, 7);

/**
 * Appends the month to a label: "รายจ่ายเดือนนี้" for the current month, "รายจ่าย ส.ค. 2569"
 * for any other, so dashboard labels stay true while viewing a past or future month.
 */
/**
 * An installment or payment label for display. Default labels are saved in Thai ("งวดที่ 2",
 * "รับมัดจำ") so data reads the same everywhere, LINE included; this shows them in the app language.
 * Anything the user typed is shown as typed.
 */
export const installmentLabel = (label: string): string => {
  const numbered = /^งวดที่\s*(\d+)$/.exec(label.trim());
  // "รับเงิน" / "รับมัดจำ" name a payment here ("Payment", "Deposit"), not the buttons of the same words.
  return numbered ? tr("งวดที่ {0}", numbered[1]) : trc("entry", label);
};

/** A Gregorian year as people read it: Buddhist Era in Thai (2569), Gregorian in English (2026). */
export const displayYear = (year: number): number => (currentLanguage === 'en' ? year : year + 543);

export const withMonth = (base: string, monthKey: string): string =>
  monthKey === currentMonthKeyNow() ? tr("{0}เดือนนี้", tr(base)) : `${tr(base)} ${formatMonthKey(monthKey)}`;

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

/**
 * One CSV cell. Text that starts like a formula (=, +, -, @, tab) gets a leading ' so spreadsheet
 * apps show it as text instead of running it: an imported job named "=HYPERLINK(...)" stays harmless
 * when exported again. Plain numbers and a lone "-" are written as they are.
 */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-$|^-?\d[\d,]*(\.\d+)?$/.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
};

// Download all jobs as a CSV file (UTF-8 BOM so Excel/Google Sheets read Thai text correctly).
// Returns false if there was nothing to export.
export const exportJobsToCSV = (jobs: Job[]): boolean => {
  if (!jobs || jobs.length === 0) return false;
  const csvContent = jobsCsvText(jobs);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', tr("โปรเจกต์รายรับ_กระรอกตุนเสบียง_{0}.csv", dateStr));
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};

/** The jobs CSV as text: one row per job, or per installment for jobs paid in parts. */
export const jobsCsvText = (jobs: Job[]): string => {
  const headers = [
    tr("ชื่อโปรเจกต์"),
    tr("ประเภทงาน"),
    tr("ลูกค้า"),
    tr("มูลค่ารวม (บาท)"),
    tr("หัก ณ ที่จ่าย (%)"),
    tr("จำนวนภาษีหัก ณ ที่จ่าย (บาท)"),
    tr("ยอดได้รับแล้ว (บาท)"),
    tr("ยอดค้างชำระ (บาท)"),
    tr("สถานะโครงการ"),
    tr("เครดิตเทอม (วัน)"),
    tr("วันเริ่มงาน"),
    tr("วันดีล/วันเผยแพร่"),
    tr("กำหนดชำระเงิน"),
    tr("งวดชำระ"),
    tr("สถานะงวด"),
    tr("วันรับเงินจริง"),
    tr("หมายเหตุ")
  ];

  const escapeCSV = csvCell;

  const rows = jobs.flatMap(j => {
    let statusText = j.status;
    if (j.status === 'done') statusText = tr("จ่ายแล้ว");
    else if (j.status === 'partial' || j.status === 'installment') statusText = j.status === 'installment' ? tr("แบ่งชำระเป็นงวด") : tr("มัดจำ/จ่ายบางส่วน");
    else if (j.status === 'pending') statusText = tr("ยังไม่จ่าย");

    const base = (installmentLabel: string, installmentStatus: string, paidAt: string, received: number, pending: number, contractValue: number, whtAmount: number, dueDate: string) => [
      escapeCSV(j.name),
      escapeCSV(tr(j.type || 'ทั่วไป')),
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
    // "วันรับเงินจริง" is when money actually came in: the pay date of a paid job, the deposit date of
    // a part-paid one, nothing for an unpaid one (it used to repeat the due date, which read as paid).
    const paidInFull = j.status === 'done' || j.paymentStatus === 'paid' || ((j.pending || 0) <= 0 && (j.received || 0) > 0);
    const paidOn = paidInFull ? j.payDate || '' : (j.received || 0) > 0 ? j.depositDate || '' : '';
    if (!j.installments?.length) return [base('', '', paidOn, j.received || 0, j.pending || 0, j.value || 0, j.whtAmount || 0, j.payDate || '')];
    const netTotal = Math.max(1, j.value - (j.whtAmount || 0));
    return j.installments.map((row, index) => {
      const allocatedWht = index === j.installments!.length - 1
        ? Math.max(0, (j.whtAmount || 0) - j.installments!.slice(0, -1).reduce((sum, item) => sum + Math.round((j.whtAmount || 0) * (item.amount / netTotal)), 0))
        : Math.round((j.whtAmount || 0) * (row.amount / netTotal));
      return base(installmentLabel(row.label), row.status === 'paid' ? tr("รับแล้ว") : tr("รอชำระ"), row.paidAt || '', row.status === 'paid' ? row.amount : 0, row.status === 'paid' ? 0 : row.amount, index === 0 ? j.value : 0, allocatedWht, row.dueDate || '');
    });
  });

  return '﻿' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
};
