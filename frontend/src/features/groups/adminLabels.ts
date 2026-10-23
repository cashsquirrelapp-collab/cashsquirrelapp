import type { AccountPersona, AccountPlanStatus } from '../../../../shared/adminAnalytics';
import type { UsageFeatureKey } from '../../../../shared/usageAnalytics';

// Labels shared by the admin dashboard's computer/iPad and phone layouts: [Thai, English].
export const featureLabels: Record<UsageFeatureKey, [string, string]> = {
  dashboard: ['ภาพรวมกระแสเงินสด', 'Cash flow overview'],
  adminDashboard: ['แดชบอร์ดแอดมิน', 'Admin dashboard'],
  jobs: ['งานและโปรเจกต์', 'Jobs and projects'],
  tax: ['คำนวณภาษี', 'Tax planning'],
  split: ['จัดสรรเงินและเป้าหมาย', 'Splits and goals'],
  report: ['รายงาน', 'Reports'],
  settings: ['ตั้งค่า', 'Settings'],
  invoice: ['เอกสารและใบแจ้งหนี้', 'Documents and invoices'],
  insight: ['วิเคราะห์รายได้', 'Income insights'],
  plans: ['หน้าอัปเกรด', 'Upgrade'],
  groups: ['ทีมและสมาชิก', 'Groups and members'],
  clients: ['ลูกค้า', 'Clients'],
  calendar: ['ปฏิทินงาน', 'Calendar'],
  receivables: ['รายการรอรับเงิน', 'Receivables'],
  incomeExpense: ['รายรับและรายจ่าย', 'Income and expenses'],
};

export const personaLabels: Record<AccountPersona, [string, string]> = {
  freelance: ['ฟรีแลนซ์', 'Freelancer'],
  employee: ['พนักงานประจำ', 'Employee'],
  university: ['นักศึกษา', 'University'],
  school: ['นักเรียน', 'School'],
  unknown: ['ยังไม่ระบุ', 'Not specified'],
};

export const planLabels: Record<AccountPlanStatus, [string, string]> = {
  pro: ['Pro แบบชำระเงิน', 'Paid Pro'],
  admin: ['Pro ที่แอดมินให้', 'Admin-granted Pro'],
  trial: ['กำลังทดลอง', 'Trial'],
  free: ['Free', 'Free'],
  expired: ['Pro หมดอายุ', 'Expired Pro'],
};
