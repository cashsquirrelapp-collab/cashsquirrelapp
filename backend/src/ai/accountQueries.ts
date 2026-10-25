import { z } from 'zod';
import { calculateDocumentTotals } from '../../../frontend/src/features/invoices/documentMath.js';
import { getJobPaymentEntries, getJobScheduledPendingEntries } from '../../../shared/installmentPayments.js';
import { isValidDateKey } from '../../../shared/incomeExport.js';
import type { InvoiceItem, Job } from '../../../shared/types.js';
import { roundMoney } from '../../../shared/wht.js';
import type { UserRow } from '../services/lineAssistant.js';
import type { ToolOutcome, ToolSpec } from './types.js';

// These reads only use the already authenticated account snapshot. Model arguments cannot select an owner,
// table, SQL, URL or filesystem path. Never serialize the snapshot: it also contains private notification state.
const DOMAINS = ['goals', 'job', 'documents', 'settings', 'calendar', 'clients'] as const;
const inputSchema = z.object({
  domain: z.enum(DOMAINS), query: z.string().trim().max(200).optional(), id: z.string().trim().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(1_000_000).default(0), limit: z.number().int().min(1).max(20).default(10),
  start_date: z.string().optional(), end_date: z.string().optional(),
}).strict();
type Input = z.infer<typeof inputSchema>;
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const records = (value: unknown): Row[] => Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)).map(record) : [];
const cleanText = (value: unknown): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
const text = (value: unknown, length = 200): string => {
  const full = cleanText(value);
  return full.length > length ? `${full.slice(0, length)}… [ข้อความถูกตัด]` : full;
};
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const optionalNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const optionalBoolean = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const date = (value: unknown): string | null => typeof value === 'string' && isValidDateKey(value.slice(0, 10)) ? value.slice(0, 10) : null;
const dateOrTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  if (value.length === 10 && isValidDateKey(value)) return value;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && isValidDateKey(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) ? value : null;
};
const normalize = (value: unknown) => cleanText(value).toLocaleLowerCase('th');
const matches = (row: Row, query: string, fields: string[]) => !query || fields.some(field => normalize(row[field]).includes(query));
const page = <T,>(rows: T[], input: Pick<Input, 'offset' | 'limit'>) => ({ total: rows.length, offset: input.offset, limit: input.limit,
  shown: Math.min(input.limit, Math.max(0, rows.length - input.offset)), has_more: rows.length > input.offset + input.limit,
  next_offset: rows.length > input.offset + input.limit ? input.offset + input.limit : null,
  rows: rows.slice(input.offset, input.offset + input.limit) });
const error = (message: string): ToolOutcome => ({ result: { ok: false, error: message } });
const byId = (a: Row, b: Row) => text(a.id).localeCompare(text(b.id));
const byNewest = (field: string) => (a: Row, b: Row) => text(b[field]).localeCompare(text(a[field])) || byId(a, b);

export const ACCOUNT_TOOLS: ToolSpec[] = [{
  name: 'account_data',
  description: 'Read the signed-in account: goals and their history; complete job details/installments/reminders; document items and totals; safe settings/profile; calendar events; or client totals. Use id from this account for details. Lists and nested details are paginated (offset/limit); totals cover every match, not just displayed rows. Calendar requires an exact start_date/end_date, inclusive, at most 366 days. Does not read file contents or modify anything. Financial period totals use the financial summary tool instead.',
  parameters: { type: 'object', properties: {
    domain: { type: 'string', enum: [...DOMAINS] },
    query: { type: 'string', description: 'Optional name/client/number keyword, plain text.' },
    id: { type: 'string', description: 'Exact goal/job/document/client identifier returned from this account. For detail, offset/limit page history, installments or document items.' },
    offset: { type: 'integer', description: 'Zero-based row offset, default 0.' },
    limit: { type: 'integer', description: 'Rows per page, 1–20; default 10.' },
    start_date: { type: 'string', description: 'Calendar only: inclusive YYYY-MM-DD in Gregorian years.' },
    end_date: { type: 'string', description: 'Calendar only: inclusive YYYY-MM-DD in Gregorian years.' },
  }, required: ['domain'] },
}];
export const isAccountTool = (name: string) => name === 'account_data';

function profile(input: unknown) {
  const row = record(input);
  return { name: text(row.name), address: text(row.address, 600), phone: text(row.phone, 80), email: text(row.email), tax_id: text(row.taxId, 80),
    bank_name: text(row.bankName), bank_account: text(row.bankAccount, 80), bank_account_name: text(row.bankAccountName), website: text(row.website) };
}
function jobSummary(row: Row, user: UserRow) {
  const status = (user.statuses ?? []).find(item => item.id === row.status);
  return { id: text(row.id), name: text(row.name), client: text(row.client), type: text(row.type),
    contract_value: roundMoney(number(row.value)), received: roundMoney(number(row.received)), pending: roundMoney(number(row.pending)),
    status: text(status?.label || row.status), status_behavior: ['done', 'partial', 'pending'].includes(String(status?.behavior)) ? status?.behavior : null,
    delivered: row.isPosted !== false, delivery_date: date(row.postDate), due_or_paid_date: date(row.payDate || row.dueDate) };
}
function goalSummary(row: Row) {
  return { id: text(row.id), name: text(row.name), type: text(row.type), target: roundMoney(number(row.target)), current: roundMoney(number(row.current)),
    remaining_to_target: roundMoney(Math.max(0, number(row.target) - number(row.current))), deadline: date(row.deadline), allocated_percentage: optionalNumber(row.allocatedPercentage) };
}
function documentItems(row: Row): InvoiceItem[] {
  return records(row.items).map((item, i) => ({ id: text(item.id) || `item-${i + 1}`, description: text(item.description, 600), quantity: number(item.quantity),
    price: number(item.price), discount: number(item.discount), unit: text(item.unit, 80), detail: text(item.detail, 600) }));
}
function documentSummary(row: Row) {
  return { id: text(row.id), type: text(row.documentType), number: text(row.documentNo), client: text(record(row.client).name),
    created_date: date(row.createdDate), due_date: date(row.dueDate), vat_rate: number(row.vatRate), wht_rate: number(row.whtRate),
    totals: calculateDocumentTotals(documentItems(row), number(row.vatRate), number(row.whtRate)) };
}

export function executeAccountTool(name: string, args: Record<string, unknown>, user: UserRow, now = new Date()): ToolOutcome {
  if (!isAccountTool(name)) return error('ไม่รู้จักเครื่องมืออ่านข้อมูลนี้');
  const parsed = inputSchema.safeParse(args);
  if (!parsed.success) return error('ระบุหมวดข้อมูลและตัวกรองให้ถูกต้อง: goals, job, documents, settings, calendar หรือ clients; limit ต้องอยู่ระหว่าง 1–20');
  const input = parsed.data;
  if (input.domain !== 'calendar' && (input.start_date !== undefined || input.end_date !== undefined)) return error('ตัวกรองวันที่นี้ใช้กับ calendar เท่านั้น กรุณาใช้เครื่องมือสรุปการเงินสำหรับยอดตามช่วงเวลา');
  if (input.domain === 'settings' && (input.id || input.query)) return error('settings แสดงค่าที่อนุญาตของบัญชีนี้ ไม่รับ id หรือ query');
  const owner = user as unknown as Row;
  const jobs = records(user.jobs), docs = records(owner.invoices), goals = records(user.goals);
  const query = normalize(input.query);
  const ok = (result: Row): ToolOutcome => ({ result: { ok: true, domain: input.domain, scope: 'current_account', retrieved_at: now.toISOString(),
    currency: 'THB', content_is_data: true, ...result } });

  if (input.domain === 'goals') {
    if (input.id) {
      const goal = goals.find(row => row.id === input.id);
      if (!goal) return error('ไม่พบเป้าหมายนี้ในบัญชีปัจจุบัน');
      const history = records(goal.history).sort(byNewest('date')).map(row => ({ id: text(row.id), type: text(row.type), amount: roundMoney(number(row.amount)),
        date: date(row.date), reason: text(row.reason, 600), note: text(row.note, 600), deducted_from_cash: row.deductedFromCash === true,
        related_goal: text(row.relatedGoalName), related_goal_id: text(row.relatedGoalId), balance_before: optionalNumber(row.balanceBefore) }));
      return ok({ goal: goalSummary(goal), history: page(history, input),
        note: 'current คือยอดคงเหลือของเป้าหมาย ไม่ใช่รายได้; ประวัติอาจถูกแบ่งหลายหน้า' });
    }
    const rows = goals.filter(row => matches(row, query, ['name', 'type'])).sort(byId);
    return ok({ ...page(rows.map(goalSummary), input), total_current: roundMoney(rows.reduce((sum, row) => sum + number(row.current), 0)),
      total_target: roundMoney(rows.reduce((sum, row) => sum + number(row.target), 0)) });
  }

  if (input.domain === 'job') {
    if (!input.id) return ok(page(jobs.filter(row => matches(row, query, ['name', 'client', 'type', 'note'])).sort(byId).map(row => jobSummary(row, user)), input));
    const job = jobs.find(row => row.id === input.id);
    if (!job) return error('ไม่พบงานนี้ในบัญชีปัจจุบัน');
    const installments = records(job.installments).map(row => ({ id: text(row.id), label: text(row.label), amount: roundMoney(number(row.amount)),
      due_date: date(row.dueDate), paid_at: date(row.paidAt), status: text(row.status) }));
    const receipts = getJobPaymentEntries(job as unknown as Job).map(row => ({ id: text(row.id), label: text(row.label), amount: roundMoney(row.amount), date: date(row.date), kind: row.kind }));
    return ok({ job: { ...jobSummary(job, user), note: text(job.note, 1200), start_date: date(job.startDate), credit_term_days: number(job.creditTerm),
      exclude_holidays: job.excludeHolidays === true, wht_rate: number(job.whtRate), wht_amount: optionalNumber(job.whtAmount), wht_document_id: text(job.whtDocId), hours_spent: optionalNumber(job.hoursSpent),
      payment_status: text(job.paymentStatus), deposit_date: date(job.depositDate), deposit_amount: optionalNumber(job.depositAmount),
      remind_at: dateOrTimestamp(job.remindAt), follow_up_count: number(job.followUpCount), last_follow_up_date: date(job.lastFollowUpDate),
      last_activity_at: dateOrTimestamp(job.lastActivityAt) },
      installments: page(installments, input), received_entries: page(receipts, input),
      undated_received_amount: roundMoney(receipts.filter(row => !row.date).reduce((sum, row) => sum + row.amount, 0)),
      note: 'วันที่รับเงินที่ไม่ทราบเป็น null; ห้ามใช้วันครบกำหนดหรือวันส่งงานแทนวันที่รับเงินจริง' });
  }

  if (input.domain === 'documents') {
    const selected = input.id ? docs.find(row => row.id === input.id) : undefined;
    if (input.id && !selected) return error('ไม่พบเอกสารนี้ในบัญชีปัจจุบัน');
    if (selected) {
      const client = record(selected.client);
      return ok({ document: { ...documentSummary(selected), issuer: profile(selected.issuer), client: {
        name: text(client.name), address: text(client.address, 600), phone: text(client.phone, 80), email: text(client.email), tax_id: text(client.taxId, 80),
        contact_name: text(client.contactName), code: text(client.code, 80), branch: text(client.branch),
      }, note: text(selected.note, 1200), payment_term: text(selected.paymentTerm, 600), delivery_term: text(selected.deliveryTerm, 600), reference: text(selected.refNo),
      paid_date: date(selected.paidDate), paid_amount: optionalNumber(selected.paidAmount), payment_method: text(selected.paymentMethod), response_date: date(selected.responseDate), linked_from_id: text(selected.linkedFromId) },
      items: page(documentItems(selected), input), note: 'รวมยอดจากทุกรายการแล้ว แม้รายการสินค้าแบ่งหลายหน้า; ไม่ได้อ่านเนื้อหารูป ลายเซ็น หรือไฟล์แนบ' });
    }
    const rows = docs.filter(row => matches(row, query, ['documentNo', 'documentType']) || normalize(record(row.client).name).includes(query)).sort(byNewest('createdDate'));
    return ok(page(rows.map(documentSummary), input));
  }

  if (input.domain === 'settings') {
    const settings = record(user.settings), notifications = record(user.notif_settings);
    return ok({ settings: { monthly_expense_budget: optionalNumber(settings.monthlyExpense), monthly_revenue_goal: optionalNumber(settings.monthlyRevenueGoal),
      savings_percentage: optionalNumber(settings.savingsPercentage), user_persona: text(settings.userPersona), goals_enabled: settings.goalsFeatureEnabled !== false,
      profile_job_types: page((Array.isArray(settings.profileJobTypes) ? settings.profileJobTypes : []).filter((item): item is string => typeof item === 'string').map(item => text(item)), input),
      profile_job_type_other: text(settings.profileJobTypeOther), cash_opening: optionalNumber(record(settings.cashOpening).amount) },
      recurring_expense_items: page(records(settings.fixedExpenseItems).map(row => ({ id: text(row.id), name: text(row.name), amount: roundMoney(number(row.amount)) })), input),
      statuses: page(records(user.statuses).map(row => ({ id: text(row.id), label: text(row.label), behavior: text(row.behavior) })), input),
      job_types: page((Array.isArray(owner.job_types) ? owner.job_types : []).filter((item): item is string => typeof item === 'string').map(item => text(item)), input),
      issuer_profile: profile(owner.issuer_profile),
      notification_preferences: { enabled: optionalBoolean(notifications.enabled), alert_email: text(notifications.alertEmail),
        daily_digest_enabled: optionalBoolean(notifications.dailyDigestEnabled), monthly_report_enabled: optionalBoolean(notifications.monthlyReportEnabled),
        wht50_reminder_enabled: optionalBoolean(notifications.wht50ReminderEnabled),
        line_connected: notifications.lineUserId === undefined ? null : Boolean(cleanText(notifications.lineUserId)),
        delivery_service: ['mailto', 'emailjs'].includes(String(notifications.serviceType)) ? notifications.serviceType : null },
      legacy_wht_documents: page(records(settings.whtDocuments).map(row => ({ id: text(row.id), job_id: text(row.jobId), client: text(row.client),
        wht_amount: optionalNumber(row.whtAmount), wht_rate: optionalNumber(row.whtRate), file_name: text(row.fileName), file_type: text(row.fileType, 80), created_date: date(row.createdAt) })), input),
      note: 'งบรายจ่ายประจำเป็นค่าที่ตั้งไว้ ไม่ใช่หลักฐานว่าจ่ายแล้ว; รายการไฟล์เป็นข้อมูลกำกับ ไม่ได้อ่านเนื้อหาไฟล์; ค่าการแจ้งเตือน null คือไม่มีค่าบันทึกไว้ ไม่ใช่การยืนยันว่าปิดอยู่' });
  }

  if (input.domain === 'calendar') {
    const from = input.start_date, to = input.end_date;
    if (input.id) return error('calendar ไม่รับ id; ใช้ query เพื่อกรองชื่องานหรือลูกค้า');
    if (!from || !to || !isValidDateKey(from) || !isValidDateKey(to) || !/^(19|20|21)\d{2}-/.test(from) || !/^(19|20|21)\d{2}-/.test(to)
      || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365) return error('ระบุ start_date และ end_date เป็นวันที่จริง YYYY-MM-DD ช่วงละไม่เกิน 366 วัน และวันเริ่มต้องไม่เกินวันสิ้นสุด');
    const today = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    const events: { date: string; kind: 'delivery' | 'received' | 'due'; job_id: string; job_name: string; client: string; label: string; amount: number | null; delivered?: boolean; future_dated: boolean }[] = [];
    let undatedReceipts = 0, undatedDue = 0;
    for (const row of jobs.filter(row => matches(row, query, ['name', 'client', 'type']))) {
      const job = row as unknown as Job;
      const add = (day: string | null, entry: Omit<(typeof events)[number], 'date' | 'job_id' | 'job_name' | 'client' | 'future_dated'>) => {
        if (day && day >= from && day <= to) events.push({ date: day, job_id: text(row.id), job_name: text(row.name), client: text(row.client), future_dated: day > today, ...entry });
      };
      add(date(job.postDate), { kind: 'delivery', label: job.isPosted === false ? 'กำหนดส่งงาน' : 'ส่งงานแล้ว', amount: null, delivered: job.isPosted !== false });
      for (const entry of getJobPaymentEntries(job)) {
        const day = date(entry.date); if (!day) undatedReceipts += entry.amount;
        add(day, { kind: 'received', label: text(entry.label), amount: roundMoney(entry.amount) });
      }
      for (const entry of getJobScheduledPendingEntries(job)) {
        const day = date(entry.dueDate); if (!day) undatedDue += entry.amount;
        add(day, { kind: 'due', label: text(entry.label), amount: roundMoney(entry.amount) });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.job_id.localeCompare(b.job_id));
    const actualReceived = roundMoney(events.filter(row => row.kind === 'received' && !row.future_dated).reduce((sum, row) => sum + (row.amount ?? 0), 0));
    const futureReceipts = events.filter(row => row.kind === 'received' && row.future_dated);
    return ok({ as_of: today, period: { from, to, timezone: 'Asia/Bangkok' }, ...page(events, input),
      received_total: actualReceived, actual_received_through_today: actualReceived,
      future_recorded_receipts: roundMoney(futureReceipts.reduce((sum, row) => sum + (row.amount ?? 0), 0)),
      future_recorded_receipt_count: futureReceipts.length,
      due_total: roundMoney(events.filter(row => row.kind === 'due').reduce((sum, row) => sum + (row.amount ?? 0), 0)),
      undated_received_amount_excluded: roundMoney(undatedReceipts), undated_due_amount_excluded: roundMoney(undatedDue),
      note: 'ยอดรวมคิดจากทุกเหตุการณ์ในช่วงวันที่ ไม่ใช่แค่หน้าที่แสดง; received_total และ actual_received_through_today นับรับเงินจริงถึง as_of เท่านั้น; รายการรับเงินลงวันที่อนาคตแสดง future_dated และแยกยอด future_recorded_receipts; ยอดไม่ทราบวันไม่ถูกใส่ในช่วงใด และยอดครบกำหนดไม่ใช่รายรับแล้ว' });
  }

  // Clients are names already present in this owner's jobs/documents, not a global customer search.
  const clients = new Map<string, { id: string; name: string; job_count: number; document_count: number; contract_value: number; received: number; pending: number }>();
  const client = (name: unknown, sourceId: string) => {
    const full = cleanText(name) || 'ไม่ระบุลูกค้า'; const label = text(full); const key = normalize(full);
    let result = clients.get(key);
    if (!result) { result = { id: sourceId, name: label, job_count: 0, document_count: 0, contract_value: 0, received: 0, pending: 0 }; clients.set(key, result); }
    return result;
  };
  for (const job of jobs.sort(byId)) { const row = client(job.client, `job:${text(job.id)}`); row.job_count++; row.contract_value += number(job.value); row.received += number(job.received); row.pending += number(job.pending); }
  for (const doc of docs.sort(byId)) client(record(doc.client).name, `document:${text(doc.id)}`).document_count++;
  if (input.id && ![...clients.values()].some(row => row.id === input.id)) return error('ไม่พบลูกค้านี้ในข้อมูลของบัญชีปัจจุบัน');
  const rows = [...clients.entries()].filter(([fullName, row]) => (!input.id || row.id === input.id) && (!query || fullName.includes(query))).map(([, row]) => row)
    .sort((a, b) => b.received - a.received || a.id.localeCompare(b.id)).map(row => ({ ...row,
      contract_value: roundMoney(row.contract_value), received: roundMoney(row.received), pending: roundMoney(row.pending) }));
  return ok({ ...page(rows, input), total_received: roundMoney(rows.reduce((sum, row) => sum + row.received, 0)),
    total_pending: roundMoney(rows.reduce((sum, row) => sum + row.pending, 0)),
    note: 'ยอดสะสมทุกช่วงเวลาจากงานในบัญชีนี้; จำนวนเอกสารไม่ใช่รายได้เพิ่มและไม่ถูกบวกซ้ำ; ลูกค้าที่ชื่อเหมือนกันถูกรวมเป็นกลุ่มเดียว' });
}
