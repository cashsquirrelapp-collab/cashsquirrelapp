// ฟีเจอร์ทดลอง (owner, 2026-11-12: "เวลาดีพลอยเข้าพวกเซตติ้งนะ จะดูในนั้นเพื่อการทดลอง"; "UI ไม่จำเป็นต้องสร้างใหม่ ... อะไรที่
// ยังไม่มีมึงก็สร้างมันออกมา"). Every new feature of the sheet-assistant direction is built into the existing app and
// opened here first. The owner makes an account a tester (admin › ทีมงานและโทเคน); a tester sees Settings › ฟีเจอร์ทดลอง
// and turns each feature on or off for itself. The owner's own account is always a tester. Other accounts see nothing.
// Kept under `labs` in the account's cashflow_private_state row (server-only table, no SQL).

export interface LabFeature {
  id: string;
  /** What a tester sees in Settings (formal Thai, no vendor names beyond the customer's own Google Sheets). */
  th: string;
  desc: string;
  /** Built and safe to try. A feature still being built is listed with its switch locked. */
  ready: boolean;
}

export const LAB_FEATURES = [
  { id: 'sheets', th: 'เชื่อม Google Sheets', desc: 'เลือกไฟล์บัญชีจาก Google Drive ของคุณให้เลขากระรอกอ่าน', ready: true },
  { id: 'sheetMap', th: 'แผนที่ชีต', desc: 'เลขากระรอกบอกว่าแต่ละคอลัมน์ในชีตคืออะไร ให้ตรวจก่อนนำไปใช้', ready: true },
  { id: 'sheetWrite', th: 'บันทึกลงชีตของคุณ', desc: 'เลขากระรอกเพิ่มแถวในชีตของคุณ เมื่อกดยืนยันเท่านั้น', ready: false },
  { id: 'templates', th: 'สร้างชีตตามประเภทธุรกิจ', desc: 'ตอบคำถาม 6 ข้อ แล้วได้ไฟล์ Excel บัญชีที่ตรงกับธุรกิจของคุณ เปิดใน Google Sheets ได้', ready: true },
  { id: 'filingCalendar', th: 'ปฏิทินยื่นภาษี', desc: 'วันยื่น ภ.ง.ด. ภ.พ.30 และประกันสังคม ตามประเภทกิจการของคุณ พร้อมเตือนใน LINE', ready: true },
  { id: 'projects', th: 'โปรเจกต์และเงินทดรอง', desc: 'งบเทียบจ่ายจริงรายโปรเจกต์ เงินทดรอง และหัก ณ ที่จ่ายของทีมงาน', ready: false },
  { id: 'accountant', th: 'สำนักงานบัญชี', desc: 'ดูลูกค้าหลายรายในหน้าเดียว และรับเอกสารจากกลุ่ม LINE ของลูกค้า', ready: false },
] as const satisfies readonly LabFeature[];

export type LabFeatureId = typeof LAB_FEATURES[number]['id'];
export const LAB_IDS = LAB_FEATURES.map(feature => feature.id) as LabFeatureId[];
export const isLabId = (value: unknown): value is LabFeatureId => typeof value === 'string' && (LAB_IDS as string[]).includes(value);
export const labReady = (id: LabFeatureId) => LAB_FEATURES.some(feature => feature.id === id && feature.ready);

/** What is kept for one account. `tester` is set by the owner; `on` by the tester. */
export interface LabRecord { tester: boolean; on: LabFeatureId[]; at?: string }
/** What the app gets: the stored record with the owner always a tester, and only built features counted as on. */
export interface LabState { tester: boolean; on: LabFeatureId[] }
export const NO_LABS: LabState = { tester: false, on: [] };

/** A stored record; unknown shapes count as not a tester. */
export function readLabs(value: unknown): LabRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { tester: false, on: [] };
  const { tester, on, at } = value as Record<string, unknown>;
  const list = Array.isArray(on) ? [...new Set(on.filter(isLabId))] : [];
  return { tester: tester === true, on: list, ...(typeof at === 'string' ? { at } : {}) };
}

/** The account's state: the owner is always a tester; a feature counts as on only while the account is a tester and the
 *  feature is built, so turning someone off as a tester, or a feature not finished, never opens anything. */
export function labState(record: LabRecord, isOwner: boolean): LabState {
  const tester = isOwner || record.tester;
  return { tester, on: tester ? record.on.filter(labReady) : [] };
}

export const labOn = (state: LabState | null | undefined, id: LabFeatureId) => Boolean(state?.tester && state.on.includes(id));
