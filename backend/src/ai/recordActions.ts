import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyGoalTransaction, hasLinkedGoalTransactions } from '../../../shared/goalLedger.js';
import { saveOpening } from '../../../shared/cashBalance.js';
import { roundMoney } from '../../../shared/wht.js';
import type { Goal } from '../../../shared/types.js';
import type { ToolContext } from './tools.js';
import type { ToolOutcome, ToolSpec } from './types.js';
import { prepareProposal, type ProposalKind } from './proposals.js';

const text = z.string().trim().min(1).max(500);
const note = z.string().max(2000);
const money = z.number().finite().min(0).max(1e12);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => Number(s.slice(0, 4)) >= 1900 && Number(s.slice(0, 4)) <= 2200
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const id = z.string().min(1).max(128);
const expenseFields = { name: text, amount: money.positive(), category: text, date: day, note: note.optional() };
const goalFields = { name: text, target: money.positive(), type: z.enum(['save', 'invest', 'emergency', 'buy']), deadline: day };
const schemas = {
  propose_add_expense: z.object(expenseFields).strict(),
  propose_edit_expense: z.object({ expense_id: id, ...z.object(expenseFields).partial().shape }).strict().refine(v => Object.keys(v).length > 1),
  propose_delete_expense: z.object({ expense_id: id }).strict(),
  propose_add_goal: z.object(goalFields).strict(),
  propose_edit_goal: z.object({ goal_id: id, ...z.object(goalFields).partial().shape }).strict().refine(v => Object.keys(v).length > 1),
  propose_delete_goal: z.object({ goal_id: id }).strict(),
  propose_goal_transaction: z.object({ goal_id: id, type: z.enum(['deposit', 'withdraw']), amount: money.positive(), date: day, reason: text,
    source: z.enum(['external', 'goal_balance']) }).strict(),
  propose_update_preferences: z.object({ monthly_revenue_goal: money.optional(), savings_percentage: z.number().min(0).max(100).optional(),
    opening_cash: z.number().finite().min(-1e12).max(1e12).optional(),
    fixed_expenses: z.array(z.object({ name: text, amount: money }).strict()).max(100).optional() }).strict().refine(v => Object.keys(v).length > 0),
  propose_update_issuer: z.object({ name: text.optional(), address: note.optional(), phone: z.string().max(50).optional(),
    email: z.union([z.email(), z.literal('')]).optional(), tax_id: z.string().max(30).optional(), website: z.string().max(300).optional() }).strict().refine(v => Object.keys(v).length > 0),
  propose_update_notifications: z.object({ enabled: z.boolean().optional(), daily_digest: z.boolean().optional(),
    monthly_report: z.boolean().optional(), wht_reminder: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0),
};
type Name = keyof typeof schemas;
const descriptions: Record<Name, string> = {
  propose_add_expense: 'Prepare a recorded expense from supplied name, amount, category and date (YYYY-MM-DD CE). Ask for missing fields together. Does not pay anyone. Confirmation required.',
  propose_edit_expense: 'Prepare editing an existing expense_id returned by this account’s expense search. Only supplied fields change. Confirmation required.',
  propose_delete_expense: 'Prepare removing one own expense. The confirmation shows the amount removed from the ledger. Never accepts another account’s ID.',
  propose_add_goal: 'Prepare a new personal financial goal, starting at zero, with name, target, type and deadline. Only available where the goals feature is enabled. Confirmation required.',
  propose_edit_goal: 'Prepare changing own goal name/target/type/deadline, preserving balance and history. Does not allocate or transfer money.',
  propose_delete_goal: 'Prepare removing an empty own goal with no linked transfers. Nonzero balances must be resolved first. Confirmation required.',
  propose_goal_transaction: 'Prepare recording an external deposit into one own goal or a withdrawal from its recorded balance. This is a ledger record, never a bank transfer. source must be external for deposit or goal_balance for withdrawal. Allocation of tracked income between goals uses the goals screen.',
  propose_update_preferences: 'Prepare personal financial preferences: monthly revenue goal, savings percentage, recorded opening cash or complete recurring expense list. fixed_expenses REPLACES that list: read all existing items first, preserve untouched items and show the full replacement. Does not change account roles, subscriptions, passwords, API keys or send money.',
  propose_update_issuer: 'Prepare updating the account’s own document issuer profile (name/address/phone/email/tax ID/website) from explicit user data. Preserves bank, signature and logo settings; cannot alter them. Confirmation required.',
  propose_update_notifications: 'Prepare enabling/disabling own existing notification preferences only when explicitly requested. Does not change recipient addresses or connect another account/channel. Confirmation required.',
};

// Advertise the same small Schema subset as the existing Gemini declarations. Validation remains strict Zod
// on the server; JSON Schema dialect keys ($schema/additionalProperties/etc.) are not sent as OpenAPI fields.
function declarationSchema(input: Record<string, any>): Record<string, any> {
  if (input.anyOf) {
    const types = new Set(input.anyOf.map((item: Record<string, any>) => item.type));
    if (types.size === 1 && types.has('string')) return { type: 'string' }; // optional email or empty string
    throw new Error('Unsupported record action declaration union');
  }
  return {
    ...(input.type ? { type: input.type } : {}),
    ...(input.enum ? { enum: input.enum } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.properties ? { properties: Object.fromEntries(Object.entries(input.properties).map(([key, value]) => [key, declarationSchema(value as Record<string, any>)])) } : {}),
    ...(input.items ? { items: declarationSchema(input.items) } : {}),
    ...(input.required?.length ? { required: input.required } : {}),
  };
}
export const RECORD_ACTION_TOOLS: ToolSpec[] = Object.entries(schemas).map(([name, schema]) => ({
  name, description: descriptions[name as Name],
  parameters: declarationSchema(z.toJSONSchema(schema, { target: 'draft-7' })) as ToolSpec['parameters'],
}));
export const isRecordActionTool = (name: string): name is Name => Object.prototype.hasOwnProperty.call(schemas, name);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const fail = (error: string): ToolOutcome => ({ result: { ok: false, error } });
const baht = (amount: unknown) => `฿${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export async function executeRecordAction(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolOutcome> {
  if (!isRecordActionTool(name)) return fail('ไม่รู้จักคำสั่งนี้');
  const parsed = schemas[name].safeParse(args);
  if (!parsed.success) return { result: { ok: false, error: 'ระบุข้อมูลให้ครบและใช้วันที่จริง YYYY-MM-DD', missing: [...new Set(parsed.error.issues.map(i => i.path.join('.')))] } };
  const input = parsed.data as Record<string, unknown>;
  const user = context.user as unknown as Record<string, unknown>;
  const prepare = (kind: ProposalKind, key: string, value: Record<string, unknown> | null, title: string, changes: { label: string; value: string }[]) =>
    prepareProposal(context, { kind, id: key, record: value, title, changes });

  if (name.includes('expense') && name !== 'propose_update_preferences') {
    const old = records(user.expenses).find(row => row.id === input.expense_id);
    if (name !== 'propose_add_expense' && !old) return fail('ไม่พบรายจ่ายนี้ในบัญชีของคุณ');
    if (name === 'propose_delete_expense') return prepare('delete_expense', String(old!.id), null, 'ลบรายจ่าย', [
      { label: 'รายการ', value: String(old!.name) }, { label: 'ยอดที่จะลบ', value: baht(old!.amount) }]);
    const { expense_id: _ignored, ...fields } = input;
    const value: Record<string, unknown> = { ...(old || {}), ...fields, id: old?.id || randomUUID(), note: input.note ?? old?.note ?? '' };
    value.amount = roundMoney(Number(value.amount));
    return prepare(name === 'propose_add_expense' ? 'add_expense' : 'edit_expense', String(value.id), value, name === 'propose_add_expense' ? 'เพิ่มรายจ่าย' : 'แก้ไขรายจ่าย', [
      { label: 'รายการ', value: String(value.name) }, { label: 'จำนวนเงิน', value: baht(value.amount) },
      { label: 'หมวดหมู่', value: String(value.category) }, { label: 'วันที่', value: String(value.date) }, { label: 'หมายเหตุ', value: String(value.note) || '—' }]);
  }

  if (name.includes('goal')) {
    if (!context.isAdmin) return fail('ฟีเจอร์เป้าหมายยังไม่เปิดให้บัญชีนี้ใช้งาน');
    const goals = records(user.goals) as unknown as Goal[];
    const old = goals.find(row => row.id === input.goal_id);
    if (name !== 'propose_add_goal' && !old) return fail('ไม่พบเป้าหมายนี้ในบัญชีของคุณ');
    if (name === 'propose_delete_goal') {
      if (old!.current !== 0 || hasLinkedGoalTransactions(goals, old!.id)) return fail('เป้าหมายยังมีเงินหรือรายการเชื่อมโยง กรุณาจัดการยอดและรายการในหน้าเป้าหมายก่อนลบ');
      return prepare('delete_goal', old!.id, null, 'ลบเป้าหมาย', [{ label: 'เป้าหมาย', value: old!.name }, { label: 'ยอดคงเหลือ', value: baht(old!.current) }]);
    }
    if (name === 'propose_goal_transaction') {
      const kind = input.type as 'deposit' | 'withdraw';
      if ((kind === 'deposit' && input.source !== 'external') || (kind === 'withdraw' && input.source !== 'goal_balance')) return fail('ระบุแหล่งเงินให้ตรงกับรายการ การจัดสรรเงินรับจริงให้ทำในหน้าเป้าหมาย');
      if (kind === 'withdraw' && Number(input.amount) > old!.current) return fail('ยอดถอนมากกว่ายอดที่บันทึกไว้ในเป้าหมาย');
      const result = applyGoalTransaction(goals, old!.id, { id: randomUUID(), type: kind, amount: roundMoney(Number(input.amount)), date: String(input.date),
        reason: String(input.reason), createdAt: (context.now || new Date()).toISOString(), deductedFromCash: false });
      if (!result.ok) return fail('ไม่สามารถเตรียมรายการนี้ได้ กรุณาตรวจยอดเงิน');
      return prepare(kind === 'deposit' ? 'goal_deposit' : 'goal_withdraw', old!.id, result.goalAfter as unknown as Record<string, unknown>, 'บันทึกเงินในเป้าหมาย', [
        { label: 'เป้าหมาย', value: old!.name }, { label: kind === 'deposit' ? 'เงินเพิ่มจากภายนอก' : 'ถอนจากยอดบันทึก', value: baht(input.amount) },
        { label: 'ยอดหลังบันทึก', value: baht(result.goalAfter.current) }, { label: 'วันที่ / เหตุผล', value: `${input.date} · ${input.reason}` }, { label: 'การทำงาน', value: 'บันทึกในแอปเท่านั้น ไม่มีการโอนเงินจริง' }]);
    }
    const { goal_id: _ignored, ...fields } = input;
    const value: Record<string, unknown> = { ...(old || { id: randomUUID(), current: 0, emoji: '', icon: 'target', bg: '#fff7ed', acc: '#ea580c', history: [], allocatedPercentage: 0 }), ...fields };
    return prepare(name === 'propose_add_goal' ? 'add_goal' : 'edit_goal', String(value.id), value, name === 'propose_add_goal' ? 'เพิ่มเป้าหมาย' : 'แก้ไขเป้าหมาย', [
      { label: 'เป้าหมาย', value: String(value.name) }, { label: 'ประเภท', value: ({ save: 'ออมเงิน', invest: 'ลงทุน', emergency: 'ฉุกเฉิน', buy: 'ซื้อของ' } as Record<string, string>)[String(value.type)] || String(value.type) },
      { label: 'ยอดเป้าหมาย', value: baht(value.target) }, { label: 'กำหนด', value: String(value.deadline) }]);
  }

  if (name === 'propose_update_preferences') {
    const previous = record(user.settings);
    const next = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 0, ...previous } as Record<string, unknown>;
    const changes: { label: string; value: string }[] = [];
    if (input.monthly_revenue_goal !== undefined) { next.monthlyRevenueGoal = roundMoney(Number(input.monthly_revenue_goal)); changes.push({ label: 'เป้ารายรับต่อเดือน', value: baht(next.monthlyRevenueGoal) }); }
    if (input.savings_percentage !== undefined) { next.savingsPercentage = input.savings_percentage; changes.push({ label: 'สัดส่วนออม', value: `${input.savings_percentage}%` }); }
    if (input.opening_cash !== undefined) { next.cashOpening = saveOpening(Number(input.opening_cash), previous.cashOpening as Parameters<typeof saveOpening>[1], context.now); changes.push({ label: 'ยอดเงินตั้งต้นที่บันทึก', value: baht(input.opening_cash) }); }
    if (input.fixed_expenses !== undefined) {
      const rows = input.fixed_expenses as { name: string; amount: number }[];
      next.fixedExpenseItems = rows.map(row => ({ id: randomUUID(), name: row.name, amount: roundMoney(row.amount) }));
      next.monthlyExpense = roundMoney(rows.reduce((sum, row) => sum + roundMoney(row.amount), 0));
      changes.push({ label: 'รายการค่าใช้จ่ายประจำทั้งหมดหลังแก้', value: rows.map(row => `${row.name} ${baht(row.amount)}`).join('\n') || 'ไม่มีรายการ' }, { label: 'รวมต่อเดือน', value: baht(next.monthlyExpense) });
    }
    return prepare('edit_settings', 'settings', next, 'แก้ไขการตั้งค่าการเงิน', changes);
  }
  if (name === 'propose_update_issuer') {
    const previous = record(user.issuer_profile);
    const next = { name: '', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '', ...previous };
    const labels: Record<string, string> = { name: 'ชื่อผู้ออกเอกสาร', address: 'ที่อยู่', phone: 'โทรศัพท์', email: 'อีเมล', tax_id: 'เลขผู้เสียภาษี', website: 'เว็บไซต์' };
    const changes = Object.entries(input).map(([key, value]) => { (next as Record<string, unknown>)[key === 'tax_id' ? 'taxId' : key] = value; return { label: labels[key], value: String(value) || 'เว้นว่าง' }; });
    return prepare('edit_issuer_profile', 'issuer_profile', next, 'แก้ไขข้อมูลผู้ออกเอกสาร', changes);
  }
  if (name === 'propose_update_notifications') {
    // Copy only public preference fields; never round-trip server-private LINE tokens, pending actions or chat history.
    const previous = record(user.notif_settings);
    const next: Record<string, unknown> = {};
    for (const key of ['enabled', 'alertEmail', 'serviceType', 'emailjsServiceId', 'emailjsTemplateId', 'emailjsPublicKey', 'pendingQueue', 'dailyDigestEnabled', 'monthlyReportEnabled', 'wht50ReminderEnabled']) if (previous[key] !== undefined) next[key] = previous[key];
    const map = { enabled: ['enabled', 'การแจ้งเตือน'], daily_digest: ['dailyDigestEnabled', 'สรุปรายวัน'], monthly_report: ['monthlyReportEnabled', 'สรุปรายเดือน'], wht_reminder: ['wht50ReminderEnabled', 'เตือน 50 ทวิ'] } as const;
    const changes = Object.entries(input).map(([key, value]) => { const [field, label] = map[key as keyof typeof map]; next[field] = value; return { label, value: value ? 'เปิด' : 'ปิด' }; });
    return prepare('edit_notifications', 'notif_settings', next, 'แก้ไขการแจ้งเตือน', changes);
  }
  return fail('คำสั่งนี้ยังไม่รองรับ');
}
