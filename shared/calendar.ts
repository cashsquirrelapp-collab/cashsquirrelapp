const currentLanguage: string = 'th';
export const DEFAULT_JOB_TYPES = [
  'Sponsored Post',
  'Video Production',
  'Digital Product',
  'Consulting / Advisory',
  'งานทั่วไปอื่นๆ'
];

// Sum an itemized fixed-expense list (rent, car, internet, etc.) into the single total
// that the rest of the app's profit/cashflow math consumes.
// Thai fixed annual public holidays (MM-DD format)
const THAI_FIXED_HOLIDAYS = [
  '01-01', // วันขึ้นปีใหม่
  '04-06', // วันจักรี
  '04-13', // วันสงกรานต์
  '04-14', // วันสงกรานต์
  '04-15', // วันสงกรานต์
  '05-01', // วันแรงงานแห่งชาติ
  '05-04', // วันฉัตรมงคล
  '06-03', // วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี
  '07-28', // วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว
  '08-12', // วันแม่แห่งชาติ
  '10-13', // วันคล้ายวันสวรรคต ร.9
  '10-23', // วันปิยมหาราช
  '12-05', // วันพ่อแห่งชาติ
  '12-10', // วันรัฐธรรมนูญ
  '12-31', // วันสิ้นปี
];

// Thai movable/Buddhist holidays and major extra holidays for 2024-2027
const THAI_MOVABLE_HOLIDAYS = new Set([
  // 2024
  '2024-02-24', '2024-02-26', '2024-05-10', '2024-05-22', '2024-07-20', '2024-07-21', '2024-07-22',
  // 2025
  '2025-02-12', '2025-05-09', '2025-05-11', '2025-05-12', '2025-07-10', '2025-07-11',
  // 2026
  '2026-03-03', '2026-05-14', '2026-05-30', '2026-06-01', '2026-07-29', '2026-07-30',
  // 2027
  '2027-02-21', '2027-02-22', '2027-05-10', '2027-05-19', '2027-07-18', '2027-07-19'
]);

export const isThaiPublicHoliday = (date: Date): boolean => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const yyyymmdd = `${y}-${mmdd}`;

  // Check if it's in the movable holiday list
  if (THAI_MOVABLE_HOLIDAYS.has(yyyymmdd)) {
    return true;
  }

  // Check if it's a fixed holiday
  if (THAI_FIXED_HOLIDAYS.includes(mmdd)) {
    return true;
  }

  // Substitution holiday check:
  // If date is a Monday (day 1):
  // check if yesterday (Sunday) or day before yesterday (Saturday) was a fixed holiday.
  if (date.getDay() === 1) {
    // Yesterday (Sunday)
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestMmDd = `${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    // Day before yesterday (Saturday)
    const sat = new Date(date);
    sat.setDate(sat.getDate() - 2);
    const satMmDd = `${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;

    if (THAI_FIXED_HOLIDAYS.includes(yestMmDd) || THAI_FIXED_HOLIDAYS.includes(satMmDd)) {
      return true;
    }
  }

  return false;
};

// Helper to format a Date object to YYYY-MM-DD in local timezone
export const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
};

// Calculate payDate based on postDate and creditTerm, with option to exclude weekends and public holidays
export const calculatePayDate = (
  postDateStr: string | undefined | null, 
  creditTerm: number, 
  excludeHolidays?: boolean
): string | null => {
  if (!postDateStr) return null;
  if (creditTerm === 0) return postDateStr;
  
  const date = new Date(postDateStr + 'T00:00:00');
  
  if (!excludeHolidays) {
    date.setDate(date.getDate() + creditTerm);
    return formatLocalDate(date);
  } else {
    let countedDays = 0;
    while (countedDays < creditTerm) {
      date.setDate(date.getDate() + 1);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
      const isHoliday = isThaiPublicHoliday(date);
      
      if (!isWeekend && !isHoliday) {
        countedDays++;
      }
    }
    return formatLocalDate(date);
  }
};

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
