import type { KsIconName } from './icons';

import { tr, T } from '../../i18n/tr';
// Phone navigation in one place (owner's brief, 2026-10-20): the five slots of the bottom bar and the
// five sections of the "เมนู" screen. This file only decides WHERE things appear on a phone. Whether
// someone may open a page stays with the launch policy in shared/featureAvailability.ts (route guards
// and the sidebar use the same one) and with the backend; App filters every entry through it, so an
// entry listed here never shows to an account that cannot open it.
//
// Releasing a feature later: add it to PHASE_ONE_FEATURES in shared/featureAvailability.ts. If it
// belongs in one of the five sections, also move it out of ADVANCED_MOBILE_TOOLS below.

export type MobileTab = 'dashboard' | 'jobs' | 'calendar' | 'incomeExpense' | 'menu';

export type MobileBottomTab = { key: MobileTab; label: string; icon: KsIconName };

/**
 * Left and right of the add-job button. The fourth slot is ปฏิทิน (owner, 2026-10-20: "เอาเมนูปฏิทินมาแทน"
 * รอรับ, now that งาน shows the money still to come and receives it from each card); accounts without
 * the calendar get รับ–จ่าย. เงินรอรับ itself stays: the overview's card, the bell and the menu open it.
 */
export function mobileBottomTabs(canOpenCalendar: boolean): { left: MobileBottomTab[]; right: MobileBottomTab[] } {
  return {
    left: [
      { key: 'dashboard', label: tr("ภาพรวม"), icon: 'home' },
      { key: 'jobs', label: tr("งาน"), icon: 'briefcase' },
    ],
    right: [
      canOpenCalendar
        ? { key: 'calendar', label: tr("ปฏิทิน"), icon: 'calendar' }
        : { key: 'incomeExpense', label: tr("รับ–จ่าย"), icon: 'transfer' },
      { key: 'menu', label: tr("เมนู"), icon: 'grid' },
    ],
  };
}

/**
 * The "เมนู" screen's five sections, in order. Their entries are built in App, where the handlers live.
 * ปฏิทินและไทม์ไลน์ is not here (owner, 2026-10-20: "เป็นฟีเจอร์หลักของเราอยู่แล้วก็เอาออก"): ปฏิทิน is on
 * the bottom bar and ไทม์ไลน์ is the switch on that page. เงินรอรับ took its place, first.
 */
export const MOBILE_MENU_SECTIONS = [
  { id: 'receivables', number: '01', name: T("เงินรอรับ"), sub: T("ยอดตามวันครบกำหนด และเตือนตามเงิน"), icon: 'wallet' },
  { id: 'expenses', number: '02', name: T("รายจ่าย"), sub: T("บันทึกและดูรายการรายจ่าย"), icon: 'expense' },
  { id: 'documents', number: '03', name: T("เอกสาร"), sub: T("ใบเสนอราคาและใบเสร็จรับเงิน"), icon: 'document' },
  { id: 'line', number: '04', name: 'LINE AI Pro', sub: T("แพ็กเกจ Pro ผู้ช่วย LINE และการแจ้งเตือน"), icon: 'chat' },
  { id: 'account', number: '05', name: T("บัญชีและการตั้งค่า"), sub: T("โปรไฟล์ การแสดงผล และภาษา"), icon: 'settings' },
] as const satisfies readonly { id: string; number: string; name: string; sub: string; icon: KsIconName }[];

export type MobileMenuSectionId = typeof MOBILE_MENU_SECTIONS[number]['id'];

/**
 * Not released to everyone yet (phase 2 and 3). On a phone they sit together in one admin-only group
 * instead of among the five sections; accounts the launch policy keeps them from never see the group.
 */
export const ADVANCED_MOBILE_TOOLS = [
  { key: 'split', title: T("เป้าหมายการเงิน"), description: T("เป้าหมาย การแบ่งเงิน ฝาก ถอน โอน"), icon: 'target', search: 'ออม สัดส่วน จัดสรร' },
  { key: 'report', title: T("รายงาน"), description: T("รายรับ ลูกค้า ประเภท และจังหวะรับเงิน"), icon: 'chart', search: 'วิเคราะห์ กราฟ CSV' },
  { key: 'tax', title: T("ภาษี"), description: T("รายได้ ค่าใช้จ่าย ลดหย่อน และสรุป"), icon: 'receipt', search: 'ปี แบบประเมิน' },
  { key: 'vault', title: T("คลังไฟล์"), description: T("สัญญา สลิป และหลักฐานแนบงาน"), icon: 'folder', search: 'อัปโหลด รูป กล้อง คลังเอกสาร' },
  { key: 'wht50', title: T("ติดตาม 50 ทวิ"), description: T("ใบรับรองหัก ณ ที่จ่ายของแต่ละงาน"), icon: 'receipt', search: '50ทวิ wht ใบรับรอง' },
  { key: 'groups', title: T("ทีมและสมาชิก"), description: T("กลุ่ม คำเชิญ และบทบาท"), icon: 'users', search: 'กลุ่ม ทีม' },
  { key: 'adminDashboard', title: 'Admin Analytics', description: T("ภาพรวมผู้ใช้สำหรับผู้ดูแล"), icon: 'chart', search: 'admin' },
] as const satisfies readonly { key: string; title: string; description: string; icon: KsIconName; search: string }[];
