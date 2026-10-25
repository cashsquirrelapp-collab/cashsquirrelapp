import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import { systemRole } from '../repositories/roles.js';

// LINE offers what the account's website shows (owner, 2026-10-24: "ขอจำกัดความไว้แค่ฟีเจอร์ที่มันมีบนเว็บไซต์ของ
// ยูสเซอร์ธรรมดาที่ไม่ใช่แอดมินก่อน ... ใบทวิ50 ... เอาเก็บไว้ก่อน"). An area that is not launched yet (the launch policy
// in shared/featureAvailability.ts) stays for system admins, as on the website, and opens for everyone with it.

export type LineArea = 'vault' | 'wht50';
export const NOT_OPEN_TEXT = 'ส่วนนี้ยังไม่เปิดให้ใช้งานในตอนนี้ครับ';

const isSystemAdmin = async (userId: string) => (await systemRole(userId)) === 'admin';

/** Whether this account may use the area in LINE. A failed role read keeps it closed. */
export async function lineAreaOpen(area: LineArea, userId: string, isAdmin: (userId: string) => Promise<boolean> = isSystemAdmin): Promise<boolean> {
  if (isPhaseOneFeatureAvailable(area, false)) return true;
  try { return await isAdmin(userId); } catch { return false; }
}
