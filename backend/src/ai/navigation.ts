import { z } from 'zod';
import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import type { AssistantCard, ToolOutcome, ToolSpec } from './types.js';
import type { ToolContext } from './tools.js';

// The model selects a feature, never a URL, workspace, origin or account ID.
export const FEATURES = {
  dashboard: ['ภาพรวม', '/dashboard'], incomeExpense: ['รายรับรายจ่าย', '/incomeExpense'],
  jobs: ['งาน', '/jobs'], calendar: ['ปฏิทิน', '/calendar'], receivables: ['เงินรอรับ', '/receivables'],
  invoice: ['เอกสาร', '/invoice'], quotation: ['ใบเสนอราคา', '/invoice?type=quotation'],
  expenses: ['รายจ่าย', '/incomeExpense'], feedback: ['แจ้งปัญหา', '/feedback'],
  settings: ['ตั้งค่า', '/settings'], notifications: ['การแจ้งเตือน', '/settings?view=notif'],
  line: ['เชื่อมต่อ LINE', '/settings?view=line'], plans: ['การสมัครสมาชิก', '/plans'],
  split: ['เป้าหมายการเงิน', '/split'], report: ['รายงาน', '/report'], tax: ['ภาษี', '/tax'],
  vault: ['คลังเอกสาร', '/vault'], wht50: ['เอกสาร 50 ทวิ', '/wht50'], insight: ['วิเคราะห์ลูกค้า', '/insight'],
} as const;
const keys = Object.keys(FEATURES) as [keyof typeof FEATURES, ...(keyof typeof FEATURES)[]];
const schema = z.object({ feature: z.enum(keys) }).strict();
const aliases: Record<string, keyof typeof FEATURES> = { documents: 'invoice', goals: 'split', clients: 'insight', import: 'jobs', cash: 'dashboard' };

export const NAVIGATION_TOOLS: ToolSpec[] = [{
  name: 'navigate_to_feature',
  description: 'Provide a clickable named destination in this signed-in personal account. Call when asked to open/show/go to a feature or where it is. The app chooses manual click or automatic navigation from the user’s mode. Does not perform writes, export files or change settings. Never takes a URL or user ID.',
  parameters: { type: 'object', properties: { feature: { type: 'string', enum: keys } }, required: ['feature'] },
}];
export const isNavigationTool = (name: string) => name === 'navigate_to_feature';

export function featureNavigation(feature: string, context: Pick<ToolContext, 'isAdmin' | 'requestText'>, requested = false): AssistantCard | undefined {
  const key = (Object.prototype.hasOwnProperty.call(FEATURES, feature) ? feature : aliases[feature]) as keyof typeof FEATURES | undefined;
  if (!key) return;
  const gate = key === 'expenses' ? 'incomeExpense' : key;
  if (!isPhaseOneFeatureAvailable(gate, false)) return;
  const [label, path] = FEATURES[key];
  // A lookup or instructions embedded in a record cannot make the browser navigate on their own.
  const request = context.requestText || '';
  const declinedNavigation = /(?:อย่า|ห้าม|ไม่ต้อง|ยังไม่|ไม่อยาก|ไม่ให้|ไม่)\s*(?:เปิด|พา|ไป|แสดง|นำทาง)|\b(?:do not|don't|dont|never|stop|without|no)\b.{0,40}\b(?:open|opening|navigate|navigating|go|take|show|redirect)\b/i.test(request);
  const explicitNavigation = !declinedNavigation && /เปิด|พา(?:ไป|ดู|เข้า)|ไป(?:หน้า|ดู|ที่)|อยู่(?:ตรง|ที่)?ไหน|ดูหน้า|แสดงหน้า|\b(?:open|navigate|go to|take me|show me|where)\b/i.test(request);
  return { kind: 'navigation', label, path, autoOpen: requested && explicitNavigation };
}

export function executeNavigationTool(name: string, args: Record<string, unknown>, context: ToolContext): ToolOutcome {
  const input = schema.safeParse(args);
  if (!isNavigationTool(name) || !input.success) return { result: { ok: false, error: 'เลือกชื่อหน้าที่รองรับ ไม่รับลิงก์หรือบัญชีอื่น' } };
  const card = featureNavigation(input.data.feature, context, true);
  if (!card || card.kind !== 'navigation') return { result: { ok: false, error: 'หน้านี้ยังไม่เปิดให้บัญชีนี้ใช้งาน' } };
  return { result: { ok: true, feature: input.data.feature, label: card.label, destination_shown: true, note: `ใช้คำ **${card.label}** ในคำตอบ แอปทำให้กดเปิดหน้าได้ การเปิดอัตโนมัติขึ้นกับโหมดของผู้ใช้ ไม่ใช่การแก้ข้อมูล` }, card };
}
