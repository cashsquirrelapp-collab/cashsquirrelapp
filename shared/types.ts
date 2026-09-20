export interface StatusOption {
  id: string;
  label: string;
  behavior: 'done' | 'partial' | 'pending';
}

export interface Job {
  id: string;
  name: string;
  type: string; // 'Sponsored' | 'Video Production' | 'Digital Product' | 'Consulting' | 'Other' or custom
  client: string;
  value: number;
  received: number;
  pending: number;
  status: string; // can be 'pending', 'partial', 'done', or custom status ID
  creditTerm: number; // 0 | 30 | 45 | 50 | 60 | 90
  postDate?: string; // ISO date string (YYYY-MM-DD)
  startDate?: string; // ISO date string (YYYY-MM-DD) - Date received/started prep
  isPosted?: boolean; // Whether the deal is posted/aired yet
  payDate: string | null; // ISO date string
  dueDate?: string | null; // ISO date string (same as payDate for backward compatibility)
  paymentStatus?: 'paid' | 'partial' | 'unpaid' | string; // payment status flag (same as status behavior)
  note: string;
  hoursSpent?: number; // จำนวนชั่วโมงที่ใช้ทำงานชิ้นนี้ (สำหรับคำนวณ ฿/ชม.)
  whtRate?: number; // หัก ณ ที่จ่าย (%)
  whtAmount?: number; // หัก ณ ที่จ่าย (บาท)
  whtDocId?: string; // Reference to a withholding tax document in settings.whtDocuments
  excludeHolidays?: boolean; // ไม่นับวันหยุดราชการและเสาร์-อาทิตย์ ในการคำนวณวันดีล/เครดิตเทอม
  followUpCount?: number; // จำนวนครั้งที่ติดตามทวงถามเครดิตเทอม
  lastFollowUpDate?: string; // วันที่ติดตามล่าสุด (YYYY-MM-DD)
}

export interface TaxEvidence {
  id: string;
  year: number;
  title: string;
  taxAmount: number;
  note?: string;
  fileData?: string; // Base64 representation of image/document
  fileName?: string;
  fileType?: string;
  createdAt: string;
}

export interface WhtDocument {
  id: string;
  jobId?: string; // Optional reference to a specific Job
  client: string;
  whtAmount: number;
  whtRate: number; // e.g. 3
  fileData: string; // Base64 representation of 50 tawi image/document
  fileName: string;
  fileType: string;
  createdAt: string;
}

export interface GoalTransaction {
  id: string;
  type: 'deposit' | 'withdraw'; // 'deposit' = โอนเงินเข้า, 'withdraw' = ดึงเงินออก / หักค่าใช้จ่าย
  amount: number;
  date: string; // YYYY-MM-DD
  reason: string; // สาเหตุ / หักค่าอะไร / หมายเหตุ
  note?: string; // หมายเหตุเพิ่มเติม
  createdAt?: string; // ISO string
  relatedGoalId?: string; // if this transaction is one leg of a transfer between goals, the other goal's id
  relatedGoalName?: string; // snapshot of the other goal's name at the time of transfer (for display even if that goal is later renamed/deleted)
  deductedFromCash?: boolean; // set on a deposit funded from tracked income -- counted against cash-on-hand totals directly (never as a fake Expense, since a savings transfer isn't a real expense and would pollute tax/expense reports)
}

export interface Goal {
  id: string;
  name: string;
  type: 'save' | 'invest' | 'emergency' | 'buy';
  target: number;
  current: number;
  deadline: string; // YYYY-MM-DD
  emoji: string;
  bg: string; // Tailwind hex or class name
  acc: string; // Accent color hex or class name
  imageUrl?: string; // Custom image URL for the goal
  allocatedPercentage?: number; // percentage of net profit to allocate automatically (0-100)
  history?: GoalTransaction[]; // ประวัติรายการโอนเข้า & ดึงเงินออก
}

export interface FixedExpenseItem {
  id: string;
  name: string; // e.g. ค่าห้อง, ค่ารถ, ค่าเน็ต
  amount: number;
}

export interface AppSettings {
  monthlyExpense: number; // kept in sync as the sum of fixedExpenseItems whenever that list is edited
  fixedExpenseItems?: FixedExpenseItem[]; // itemized breakdown of the fixed monthly cost
  monthlyRevenueGoal: number;
  savingsPercentage: number; // e.g. 40
  taxEvidences?: TaxEvidence[];
  whtDocuments?: WhtDocument[];
  pitCategoryMapping?: Record<string, '40_1' | '40_2' | '40_8'>;
  customTaxInputs?: {
    deductionType?: 'standard' | 'custom';
    customExpense?: number;
    personalAllowance?: number;
    socialSecurity?: number;
    otherAllowances?: number;
  };
  accumulatedRemainder?: number; // stores leftover Bahts from calculations
  profileSetupCompleted?: boolean; // whether the first-time account setup wizard has been completed
  profileJobTypes?: string[]; // selected job type tags from the setup wizard (profile info only)
  profileJobTypeOther?: string; // free-text entry when 'other' job type is selected
  // Who the account is for -- drives which nav items default to the always-visible "core"
  // group vs the collapsible "เครื่องมือเพิ่มเติม" group. Every feature stays reachable either
  // way; this only changes what's shown by default so first-time users see less at once.
  userPersona?: 'school' | 'university' | 'freelance' | 'employee';
}

export interface PendingReminder {
  id: string; // unique reminder id, e.g. "rem-jobId-date"
  jobId: string;
  jobName: string;
  client: string;
  pendingAmount: number;
  dueDate: string;
  detectedDate: string; // YYYY-MM-DD
  status: 'pending' | 'sent' | 'skipped';
  sentDate?: string; // YYYY-MM-DD
}

export interface NotifSettings {
  enabled: boolean;
  alertEmail: string;
  serviceType: 'mailto' | 'emailjs';
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
  pendingQueue?: PendingReminder[];
  dailyDigestEnabled?: boolean; // Pro feature: opt-in to a daily email digest of overdue jobs, sent server-side by api/send-overdue-digest
  lastDigestSentDate?: string; // YYYY-MM-DD (Asia/Bangkok), dedupe guard so the digest cron never double-sends the same day
  monthlyReportEnabled?: boolean; // Pro feature: opt-in to an automated monthly financial summary email, sent server-side by api/send-monthly-report
  lastMonthlyReportSentMonth?: string; // YYYY-MM, dedupe guard so the monthly report cron never double-sends the same month
  lineUserId?: string | null; // set once the user links their LINE account via api/line-webhook.ts; explicitly null (not undefined -- see saveCloudData's merge RPC) when disconnected
  lineLinkCode?: string; // short-lived code shown in Settings, consumed by api/line-webhook.ts to link lineUserId
  lineLinkCodeExpiresAt?: string; // ISO timestamp; codes older than this are treated as expired
}

export interface CustomDialogState {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: 'text' | 'number';
  onConfirm: (value?: string) => void;
  onCancel?: () => void;
}

export interface Expense {
  id: string;
  name: string;
  category: string; // 'Fixed' | 'Equipment' | 'Marketing' | 'Tax' | 'Travel' | 'Other' or custom
  amount: number;
  date: string; // YYYY-MM-DD
  note?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

export interface InvoiceProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  bankName: string;
  bankAccount: string;
  bankAccountName: string;
  logoUrl?: string;
}

export interface Invoice {
  id: string;
  documentType: 'invoice' | 'receipt' | 'quotation';
  documentNo: string;
  createdDate: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  issuer: InvoiceProfile;
  client: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxId: string;
  };
  items: InvoiceItem[];
  vatRate: number; // 0 | 7
  whtRate: number; // 0 | 1 | 3 | 5
  note?: string;
  paymentTerm?: string; // เงื่อนไขการชำระเงิน
  deliveryTerm?: string; // ระยะเวลาการส่งมอบสินค้า/บริการ
  refNo?: string; // อ้างอิงเลขที่ใบเสนอราคา/ใบสั่งซื้อ
}



