import { randomUUID } from 'node:crypto';
import { validateChanges } from '../../../shared/validation.js';
import { isValidWhtRate, whtAmountFor, roundMoney } from '../../../shared/wht.js';
import { calculatePayDate } from '../../../shared/calendar.js';
import { jobsInMonth, monthlyProfitSummary } from '../../../shared/monthlySummary.js';
import { buildDataSnapshot, formatAssistantMonthlySummary, type UserRow } from '../services/lineAssistant.js';
import { knowledgeSnippets, lookupKnowledge } from './knowledge.js';
import { launched } from './knowledgeBase.js';
import { moneyChartDisplay, moneyChartFrom } from './moneyChart.js';
import { mergePairs, pairsFromEdit, type LearnPair } from './learning.js';
import { executePastWork, isPastWorkTool, PAST_WORK_TOOLS } from './pastWork.js';
import { checkMemory, isMemoryKind, MEMORY_KINDS, MEMORY_LIMIT, memoryRefs, USER_KINDS, type MemoryRow } from './memory.js';
import type { AssistantCard, EditField, Route, ToolCall, ToolOutcome, ToolSpec } from './types.js';
import { ACCOUNT_TOOLS, executeAccountTool, isAccountTool } from './accountQueries.js';
import { FINANCIAL_TOOLS, executeFinancialTool, isFinancialTool } from './financialQueries.js';
import { VAULT_TOOLS, executeVaultTool, isVaultTool, type VaultLoader } from './vaultQueries.js';
import { DOCUMENT_ACTION_TOOLS, executeDocumentAction, isDocumentActionTool } from './documentActions.js';
import { RECORD_ACTION_TOOLS, executeRecordAction, isRecordActionTool } from './recordActions.js';
import { NAVIGATION_TOOLS, executeNavigationTool, isNavigationTool, featureNavigation } from './navigation.js';
import { prepareProposal, type Proposal, type ProposalKind } from './proposals.js';
import { calculateJobFinancialEdit } from './jobFinancialEdit.js';
import type { AskKind, AskQuestion } from '../../../shared/askQuestions.js';
import { CREDIT_TERM_PRESETS } from '../../../shared/creditTerms.js';
export type { Proposal, ProposalKind } from './proposals.js';

// The tools the models may call. Reads come from the account's own data through the same calculations the app
// uses (buildDataSnapshot, so numbers match the screens). Changes are only *proposed* here: each propose_* tool
// validates against the app's rules and returns a confirmation card; nothing is written until the user confirms
// and the app commits the proposal (see the gateway). No tool takes a user id from the model.

const MAX_ROWS = 10;

export interface ProposalStore { save(proposal: Proposal): Promise<void> }
export interface MemoryStore {
  /** Save (or replace) one memory; the store decides what it replaces and what goes over the limit. */
  remember(userId: string, kind: string, value: string): Promise<void | { ok: true; replaced?: boolean } | { ok: false; error: string }>;
  /** This user's memories, newest first (recall_memories, forget_memory). */
  list?(userId: string): Promise<MemoryRow[]>;
  /** Delete these memories of this user; how many went. */
  forget?(userId: string, rows: MemoryRow[]): Promise<number>;
}

/** ฿12,500 or ฿1,250.50 — the way the chat writes money (no space after ฿). */
export const baht = (amount: number) => `฿${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiDate = (iso?: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${Number(match[1]) + 543}` : '-';
};
const todayBangkok = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

type Job = NonNullable<UserRow['jobs']>[number] & Record<string, any>;

// Same rule as buildDataSnapshot (statusBehavior in lineAssistant.ts), so a job the overview counts as unpaid is unpaid here too.
function behavior(user: UserRow, statusId: string): 'done' | 'partial' | 'pending' {
  return (user.statuses || []).find(status => status.id === statusId)?.behavior || 'pending';
}
const isWorking = (job: Job) => job.isPosted === false;
const isUnpaid = (user: UserRow, job: Job) => (job.pending || 0) > 0 && behavior(user, job.status || '') !== 'done';
const netOf = (job: Job) => roundMoney((job.value || 0) - whtAmountFor(job.value || 0, job.whtRate || 0));

/** A job as the models see it: enough to answer and to pick the right one, nothing more. */
const jobRow = (user: UserRow, job: Job) => ({
  job_id: job.id, name: job.name, client: job.client || '', value: baht(job.value || 0), pending: baht(job.pending || 0),
  stage: isWorking(job) ? 'กำลังทำ' : 'ส่งงานแล้ว', payment: isUnpaid(user, job) ? ((job.received || 0) > 0 ? 'รับบางส่วน' : 'ยังไม่รับเงิน') : 'รับครบแล้ว',
  delivery_date: thaiDate(job.postDate), pay_date: thaiDate(job.payDate || job.dueDate),
});
const capped = <T,>(rows: T[], args: Record<string, unknown> = {}) => {
  const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? MAX_ROWS);
  const page = rows.slice(offset, offset + limit);
  return { total: rows.length, offset, shown: page.length, next_offset: offset + limit < rows.length ? offset + limit : null, rows: page };
};
const pageArgs = { offset: { type: 'integer', minimum: 0, description: 'Use next_offset to read the next page' }, limit: { type: 'integer', minimum: 1, maximum: 25 } };

const obj = (properties: Record<string, unknown>, required: string[] = []): ToolSpec['parameters'] => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const str = (description: string) => ({ type: 'string', description });
const numArg = (description: string) => ({ type: 'number', description });
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const READ_TOOLS: ToolSpec[] = [
  { name: 'feature_lookup', description: 'Look up what the Krarok app can do: a feature, where it is, how to use it, its plan rights and whether it is live. Use before answering any question about the app.', parameters: obj({ query: str('What the user asks about, in their words') }, ['query']) },
  { name: 'money_summary', description: "This or last month's dashboard figures, including recurring budgets. For a year, another month, actual receipts or a date range use financial_summary instead.", parameters: obj({ month: { type: 'string', enum: ['this', 'last'], description: 'This month or last month' } }) },
  { name: 'receivables', description: 'Money clients still owe: overdue, due today, due within 10 days, and every unpaid job. Lists have pagination and complete counts.', parameters: obj(pageArgs) },
  { name: 'search_jobs', description: 'Find own jobs by name, client or type, stage, calendar year or month using the app’s receipt/due-date membership. Full-match totals are CONTRACT values and outstanding balances, not received income. For receipts use financial_summary/search_receipts. Returns job_id for detail, never show raw IDs.', parameters: obj({ query: str('Words from job name/client/type'), status: { type: 'string', enum: ['all', 'working', 'unpaid', 'closed'], description: 'working = not delivered; unpaid = still owed; closed = delivered and fully paid' }, month: str('all, this, last, or YYYY-MM (CE)'), year: { type: 'integer', description: 'Calendar year CE or BE, mutually exclusive with month' }, ...pageArgs }) },
  { name: 'get_job', description: 'One job in detail by job_id (from search_jobs).', parameters: obj({ job_id: str('job_id from search_jobs') }, ['job_id']) },
];
const DOCUMENT_TOOLS: ToolSpec[] = [
  { name: 'search_documents', description: 'Find the account\'s documents (ใบเสนอราคา, ใบแจ้งหนี้, ใบเสร็จ, ใบกำกับภาษี) by client, number or type, newest first. The top matches are shown to the user as document cards with an open button, so do not repeat every field; use a table only for more than three.', parameters: obj({
    query: str('Client name or document number (optional)'),
    type: { type: 'string', enum: ['all', 'quotation', 'invoice', 'receipt', 'taxInvoice', 'receiptTaxInvoice'], description: 'quotation = ใบเสนอราคา, invoice = ใบแจ้งหนี้, receipt = ใบเสร็จ, taxInvoice = ใบกำกับภาษี, receiptTaxInvoice = ใบเสร็จ/ใบกำกับภาษี' },
    start_date: str('Optional created-date range start YYYY-MM-DD'), end_date: str('Optional created-date range end YYYY-MM-DD'), ...pageArgs,
  }) },
];
const CHAT_ONLY: ToolSpec[] = [
  { name: 'route_to_action', description: 'Hand over a supported account change: jobs/payments, quotation/invoice drafts, expenses, permitted goals or safe personal settings. The action tools prepare a review card and save only after confirmation. Imports, external sending and signatures have no write tool.', parameters: obj({ summary: str('One line: what the user wants done') }, ['summary']) },
];
// Questions the user answers with a tap (owner, 2026-10-24: "ให้กูติ๊ก ... โดยที่กูไม่ต้องพิมพ์ตอบใหม่").
const ASK_TOOLS: ToolSpec[] = [
  // Owner, 2026-10-24: a client's details in a picture were asked for again two messages later. The file goes to the
  // model with its own message only; this note goes with every later message of the chat.
  { name: 'note_from_file', description: 'A picture or PDF is attached to this message: call this once, in your first step together with the other tools you need (ask_user, a search, a proposal), never as a step of its own, and write down everything useful it shows: names in full exactly as written, addresses, tax IDs, phone numbers, items with quantity, unit and price, dates, amounts, and what the user said the file is for. Later messages include only this note, never the file, so leave nothing useful out.', parameters: obj({
    facts: str('What the file shows, as short lines, e.g. "ลูกค้า: มูลนิธิตัวอย่าง\nที่อยู่: ...\nเลขผู้เสียภาษี: ...\nรายการ: ตัดคลิปวิดีโอ 2 คลิป × 1,700"'),
  }, ['facts']) },
  { name: 'ask_user', description: 'Ask what you still need as tap-to-answer questions instead of a typed list: up to 5 questions. kind choice (the default) has up to 6 short options (e.g. "ส่งแล้ววันนี้" / "ยังไม่ส่ง", "ไม่หัก" / "1%" / "3%"); allow_text lets the user type an answer only they know, such as a client name; still offer the likely ones from the account as options. kind date shows a calendar. kind payment asks when the client pays: the card shows "ชำระวันไหน" with a calendar and "มีเครดิตเทอมไหม" (ไม่มี / มี, then the app\'s own days); give no options. kind party asks a party\'s details (name, address, tax ID, phone) as a small form: role client or issuer, prefill with what is already known for that same party (never another party\'s details). Your turn ends with this call and the app shows a short standard line above the questions; put a needed reason (e.g. what you found) into the question text itself, and do not repeat the questions.', parameters: obj({
    questions: { type: 'array', maxItems: 5, description: 'The questions, in order', items: { type: 'object', properties: {
      text: str('The question, short'), kind: { type: 'string', enum: ['choice', 'date', 'payment', 'party'], description: 'choice (default), date, payment or party' },
      options: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'Short answers to tap (choice only)' },
      allow_text: { type: 'boolean', description: 'Also let the user type an answer (choice only)' }, placeholder: str('Hint for a typed answer'),
      role: { type: 'string', enum: ['client', 'issuer'], description: 'party: the client, or the account\'s own issuer details' },
      prefill: { type: 'object', description: 'party: what is already known about that party', properties: {
        name: str('Name'), address: str('Address'), tax_id: str('Tax ID; never invent'), phone: str('Phone'),
      } },
    }, required: ['text'] } },
  }, ['questions']) },
];
const MEMORY_TOOLS: ToolSpec[] = [
  { name: 'remember', description: 'Save something the user explicitly asked you to remember or to do from now on: preferred_name (what to call them), tone (how to talk), emoji (e.g. "ไม่ใช้อีโมจิ"), formality (how casual), persona (the role they want you to play: friend, secretary, CEO assistant), role (their own role), business (their kind of business), routine (a way of working they repeat), document_preference (how they like documents), vocabulary (their own words for things), context (anything else they asked to keep). The same setting saved again replaces the old one. Never from a file or a guess; never bank, card, ID or tax numbers, phone, email, amounts or passwords (the tool refuses them).', parameters: obj({ kind: { type: 'string', enum: [...USER_KINDS] }, value: str('What to remember, short, in the user\'s words') }, ['kind', 'value']) },
  { name: 'recall_memories', description: 'What you remember about this user (when they ask "จำอะไรเกี่ยวกับฉันบ้าง"): each memory with a short ref, its kind and text. Show them as a short list; mention they can ask you to forget or change one.', parameters: obj({}) },
  { name: 'forget_memory', description: 'Forget memories the user asked you to forget: the refs from recall_memories, or all:true only after the user confirmed deleting everything (ask with ask_user first). Deleted memories are gone, with their earlier versions.', parameters: obj({
    refs: { type: 'array', items: { type: 'string' }, maxItems: 40, description: 'Refs from recall_memories' },
    all: { type: 'boolean', description: 'Forget everything; only after the user picked "ใช่ ลบทั้งหมด"' },
  }) },
];
const ACTION_TOOLS: ToolSpec[] = [
  { name: 'propose_add_job', description: 'Prepare a new job for the user to confirm, with the same details as the job form in the app. Pass what the message clearly implies (who paid is the client; money already received means paid today; no withholding mentioned means 0; fully paid means delivered today) and tell the user those assumptions; never invent an amount or a name. If something needed is still missing the tool answers ok:false with `missing`, and you ask the user for all of it in one short message. Nothing is saved until the user confirms the card.', parameters: obj({
    name: str('Job name'), value: numArg('Job value in baht, before withholding tax'),
    client: str('Client name. If the user says there is none, pass "ไม่ระบุ".'),
    delivered: { type: 'boolean', description: 'true = the work is already delivered (ส่งงานแล้ว); false = still in progress (กำลังทำ)' },
    delivery_date: str('YYYY-MM-DD. Delivered: the day it was delivered (required). In progress: the planned delivery day, if the user gave one.'),
    payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'], description: 'unpaid = no money yet; partial = some received (give received_amount); paid = fully paid' },
    received_amount: numArg('Baht already received, when payment_status is partial'),
    paid_date: str('YYYY-MM-DD the money arrived, when payment_status is paid (default today)'),
    credit_term_days: numArg('Credit term: days after delivery until payment is due (เครดิตเทอม), e.g. 0, 7, 15, 30, 45, 60, 90'),
    pay_date: str('YYYY-MM-DD the client must pay by, if the user gave a date instead of a credit term'),
    wht_rate: numArg('Withholding tax percent (หัก ณ ที่จ่าย), usually 0, 1, 3 or 5; 0 if the user says there is none'),
    installments: { type: 'array', maxItems: 24, description: 'Payment in installments (งวด), as the app job form does: one entry per installment in order. Leave amount out when the user did not say it: the unpaid rest is split equally. With installments, payment_status, credit term and pay_date are not needed.',
      items: { type: 'object', properties: { amount: numArg('Baht for this installment (after withholding, optional)'), due_date: str('YYYY-MM-DD the installment is due'), paid: { type: 'boolean', description: 'true = already received' }, paid_date: str('YYYY-MM-DD it was received (paid ones; default today)') } } },
    type: str('Job type (optional)'), note: str('Note (optional)'),
  }, ['name', 'value']) },
  { name: 'propose_record_payment', description: 'Prepare recording money received for a job: in full, or a partial amount. For a job paid in installments (งวด), partial with the installment\'s amount ticks that installment as received, and full ticks every one left. Needs job_id (from search_jobs). Nothing is saved until the user confirms.', parameters: obj({
    job_id: str('job_id from search_jobs'), mode: { type: 'string', enum: ['full', 'partial'] }, amount: numArg('Amount received, for partial'), date: str('Date received, YYYY-MM-DD (optional, default today)'),
  }, ['job_id', 'mode']) },
  { name: 'propose_edit_job', description: "Prepare all requested changes to one own job in ONE confirmation card: names, dates, value, withholding and payment status can be combined. For 'no withholding and already fully paid', pass wht_rate:0 and payment_status:'paid' together. Never changes money received just to change a calendar event. Installment financial corrections need the job editor. Nothing is saved until the user confirms.", parameters: obj({
    job_id: str('job_id from search_jobs'), name: str('New name'), client: str('New client'), value: numArg('New value in baht'), pay_date: str('New payment due date, YYYY-MM-DD'), note: str('New note'),
    wht_rate: numArg('New withholding tax percent; 0 when the user says no withholding'),
    payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'], description: 'Only if the user explicitly changes payment status. paid = fully received after the requested value/withholding changes; does not mean the work was delivered.' },
    received_amount: numArg('Cumulative amount actually received, only for payment_status partial; not an additional payment'),
    paid_date: str('Actual receipt date YYYY-MM-DD; preserve known dates, default today only for a newly recorded receipt'),
    delivery_date: str('Delivery/planned delivery date YYYY-MM-DD'), remind_date: str('Reminder YYYY-MM-DD, or empty string to clear'),
    delivered: { type: 'boolean', description: 'Whether the job has actually been delivered; true requires a known delivery date' },
    type: str('Job type'), credit_term_days: { type: 'integer', minimum: 0, maximum: 3650, description: 'Credit days from delivery; recalculates the unpaid due date using the existing holiday preference' },
  }, ['job_id']) },
  { name: 'propose_delete_job', description: 'Prepare deleting one job. Needs job_id. The card tells the user what disappears; nothing is deleted until they confirm.', parameters: obj({ job_id: str('job_id from search_jobs') }, ['job_id']) },
];

// Tools for areas customers cannot see yet stay off for everyone (owner, 2026-10-24: "เอาแค่จำกัดความที่มีใน
// เว็บไซต์"); each returns by itself the day its area joins the launch policy (shared/featureAvailability.ts).
const HIDDEN_TOOLS = new Set([
  ...(launched('vault') ? [] : ['search_vault']),
  ...(launched('wht50') ? [] : ['wht_tracking']),
  ...(launched('tax') ? [] : ['tax_year_summary']),
  ...(launched('split') ? [] : ['propose_add_goal', 'propose_edit_goal', 'propose_delete_goal', 'propose_goal_transaction']),
]);
/** account_data without the goals domain while the goals page is hidden; cash_position without "cash held in goals". */
function openSpec(spec: ToolSpec): ToolSpec {
  if (spec.name === 'navigate_to_feature') {
    const properties = spec.parameters.properties as Record<string, { enum?: string[] }>;
    return { ...spec, parameters: { ...spec.parameters, properties: { ...properties,
      feature: { ...properties.feature, enum: (properties.feature.enum || []).filter(feature => launched(feature === 'expenses' ? 'incomeExpense' : feature)) },
    } } };
  }
  if (launched('split')) return spec;
  if (spec.name === 'cash_position') return { ...spec, description: spec.description.replace(', and cash held in goals', '') };
  if (spec.name !== 'account_data') return spec;
  const properties = spec.parameters.properties as Record<string, { enum?: string[]; description?: string }>;
  return { ...spec,
    description: spec.description.replace('goals and their history; ', ''),
    parameters: { ...spec.parameters, properties: { ...properties,
      domain: { ...properties.domain, enum: (properties.domain.enum || []).filter(domain => domain !== 'goals') },
      id: { ...properties.id, description: 'Exact job/document/client identifier returned from this account. For detail, offset/limit page installments or document items.' },
    } } };
}
const openTools = (specs: ToolSpec[]) => specs.filter(spec => !HIDDEN_TOOLS.has(spec.name)).map(openSpec);

export function toolsFor(route: Route): ToolSpec[] {
  const read = openTools([...READ_TOOLS, ...DOCUMENT_TOOLS, ...FINANCIAL_TOOLS, ...ACCOUNT_TOOLS, ...PAST_WORK_TOOLS, ...VAULT_TOOLS, ...NAVIGATION_TOOLS]);
  return route === 'chat' ? [...read, ...CHAT_ONLY, ...MEMORY_TOOLS, ...ASK_TOOLS] : openTools([...read, ...MEMORY_TOOLS, ...ASK_TOOLS, ...ACTION_TOOLS, ...DOCUMENT_ACTION_TOOLS, ...RECORD_ACTION_TOOLS]);
}

/** Only coverage and freshness enter the prompt; period-specific figures are retrieved on demand. */
export function accountContext(user: UserRow, now = new Date(), access?: { period_end: string | null; tokens_reset_at: string | null; token_limit: number | null }): string {
  // The owner's own saved names (issuer, bank account holder, LINE name), so a slip's sides can be told apart
  // (owner, 2026-10-24). Names only, never account numbers.
  const issuer = (user as UserRow & { issuer_profile?: Record<string, unknown> }).issuer_profile;
  const ownNames = [...new Set([issuer?.name, issuer?.bankAccountName, user.notif_settings?.userName]
    .map(value => (typeof value === 'string' ? value.trim().slice(0, 80) : '')).filter(Boolean))];
  return JSON.stringify({
    scope: 'signed_in_personal_account', snapshot_read_at: now.toISOString(),
    ...(ownNames.length ? { own_names: ownNames } : {}),
    ...(access ? { subscription_cycle: access } : {}),
    record_counts: { jobs: user.jobs?.length || 0, expenses: user.expenses?.length || 0, ...(launched('split') ? { goals: user.goals?.length || 0 } : {}), documents: (user as UserRow & { invoices?: unknown[] }).invoices?.length || 0 },
    note: `Fresh saved data for this account only; unsaved browser edits are not included. Query the exact requested period with financial_summary (calendar year, month, range or all_time). Details through account_data, search_jobs, search_documents${launched('vault') ? '; separate stored file metadata through search_vault/wht_tracking' : ''}. Never infer absence of data from a short page.`,
  });
}

export interface ToolContext { user: UserRow; proposals: ProposalStore; memory: MemoryStore; loadVaultFiles?: VaultLoader; now?: Date; isAdmin?: boolean; requestText?: string; hasAttachment?: boolean;
  /** Lessons from fields the user changed on a card (reviseProposal only); saved with the card, learned on confirm. */
  learn?: LearnPair[] }

const fail = (message: string): ToolOutcome => ({ result: { ok: false, error: message } });

// Fields a confirmation card lets the user change before confirming, per proposal tool (owner, 2026-10-24).
// A quotation or invoice card edits both document parties, up to five lines, VAT, withholding and the date.
// These are this document's party details, never an instruction to update the account's issuer profile.
const DOCUMENT_ITEM_EDITS = 5;
const DOCUMENT_PARTY_FIELDS = { name: 'name', address: 'address', phone: 'phone', email: 'email', tax_id: 'taxId' } as const;
const DOCUMENT_PARTIES = ['issuer', 'client'] as const;
const DOCUMENT_PARTY_EDITS = DOCUMENT_PARTIES.flatMap(party => Object.keys(DOCUMENT_PARTY_FIELDS).map(field => `${party}_${field}`));
function documentPartyEdit(field: string) {
  const match = /^(issuer|client)_(name|address|phone|email|tax_id)$/.exec(field);
  return match ? { party: match[1] as typeof DOCUMENT_PARTIES[number], field: match[2] as keyof typeof DOCUMENT_PARTY_FIELDS } : null;
}
export const EDITABLE_FIELDS: Record<string, string[]> = {
  propose_add_job: ['name', 'client', 'value', 'wht_rate', 'delivery_date', 'paid_date'],
  propose_record_payment: ['amount', 'date'],
  propose_add_expense: ['name', 'amount', 'category', 'date'],
  propose_add_document: [...DOCUMENT_PARTY_EDITS, 'created_date', 'vat_rate', 'wht_rate',
    ...Array.from({ length: DOCUMENT_ITEM_EDITS }, (_, index) => [`item_${index + 1}_description`, `item_${index + 1}_quantity`, `item_${index + 1}_price`]).flat()],
};
/** A card field's value in the call that prepared it (or the prepared record), before the user changes it. */
export function cardValue(tool: string, args: Record<string, unknown>, record: Record<string, unknown> | null, field: string): unknown {
  if (tool === 'propose_add_document') {
    const party = documentPartyEdit(field);
    if (party) return (args[party.party] as Record<string, unknown> | undefined)?.[party.field]
      ?? (record?.[party.party] as Record<string, unknown> | undefined)?.[DOCUMENT_PARTY_FIELDS[party.field]];
    const line = /^item_(\d)_(description|quantity|price)$/.exec(field);
    if (line) {
      const index = Number(line[1]) - 1;
      return (args.items as Record<string, unknown>[] | undefined)?.[index]?.[line[2]] ?? (record?.items as Record<string, unknown>[] | undefined)?.[index]?.[line[2]];
    }
  }
  if (tool === 'propose_add_job' && field === 'wht_rate') return args.wht_rate ?? record?.whtRate ?? 0;
  return args[field] ?? record?.[field];
}
/** One field changed on a card, put back into the call that prepared it (the tool then checks everything again). */
export function applyCardEdit(tool: string, args: Record<string, unknown>, field: string, raw: string): void {
  const number = (text: string) => Number(text.replace(/[,฿\s]/g, ''));
  if (tool === 'propose_add_document') {
    const party = documentPartyEdit(field);
    if (party) { args[party.party] = { ...((args[party.party] as Record<string, unknown>) || {}), [party.field]: raw }; return; }
    const line = /^item_(\d)_(description|quantity|price)$/.exec(field);
    if (line) {
      const items = (Array.isArray(args.items) ? args.items as Record<string, unknown>[] : []).map(item => ({ ...item }));
      const index = Number(line[1]) - 1;
      if (!items[index]) return;
      items[index][line[2]] = line[2] === 'description' ? raw : number(raw);
      args.items = items;
      return;
    }
    args[field] = field === 'vat_rate' || field === 'wht_rate' ? number(raw) : raw;
    return;
  }
  args[field] = ['value', 'amount', 'wht_rate'].includes(field) ? number(raw) : raw;
}
// The app's expense categories (frontend ExpenseDrawer EXPENSE_CATEGORIES; a test keeps the two lists the same).
export const APP_EXPENSE_CATEGORIES = ['ค่าอุปกรณ์/ซอฟต์แวร์', 'ค่าโฆษณา/ยิงแอด', 'ค่าเดินทาง/น้ำมัน', 'อาหาร/รับรองลูกค้า', 'จ้างงานต่อ (Outsource)', 'ภาษี/ธรรมเนียม', 'ค่าบริการ/สาธารณูปโภค', 'อื่นๆ'];
/** A category on an expense card is picked from the app's list and the account's own categories (owner, 2026-10-25). */
export function categoryOptions(current: string, user?: UserRow): string[] {
  const own = ((user?.expenses ?? []) as { category?: unknown }[]).map(row => String(row.category ?? '').trim()).filter(Boolean);
  const custom = [...new Set(own)].filter(category => !APP_EXPENSE_CATEGORIES.includes(category)).slice(0, 6);
  return [...new Set([...APP_EXPENSE_CATEGORIES, ...custom, ...(current ? [current] : [])])];
}
/**
 * A waiting proposal's card as it was first shown, with its editable fields, to show it again in the other channel
 * (package E, 2026-10-25): confirming or editing it there goes through the same proposal.
 */
export function cardForStoredProposal(proposal: Proposal, user?: UserRow): AssistantCard {
  const card: AssistantCard = { kind: 'confirm', id: proposal.id, title: proposal.title, changes: proposal.changes };
  if (!proposal.tool || !proposal.args || !EDITABLE_FIELDS[proposal.tool]) return card;
  const fields = editFields(proposal.tool, proposal.args, proposal.record, user);
  return fields?.length ? { ...card, edit: fields } : card;
}

function editFields(tool: string, args: Record<string, unknown>, record: Record<string, unknown> | null, user?: UserRow): EditField[] | undefined {
  const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));
  if (tool === 'propose_add_job' && record) {
    const split = Array.isArray(record.installments) && record.installments.length > 0;
    return [
      { field: 'name', label: 'ชื่องาน', type: 'text', value: text(record.name) },
      { field: 'client', label: 'ลูกค้า', type: 'text', value: text(record.client) },
      // An installment plan is checked against the value, so the value and its dates are changed in the app.
      ...(split ? [] : [
        { field: 'value', label: 'มูลค่า (บาท)', type: 'money' as const, value: text(record.value) },
        { field: 'wht_rate', label: 'หัก ณ ที่จ่าย (%)', type: 'choice' as const, value: text(record.whtRate ?? 0), options: ['0', '1', '2', '3', '5'] },
        ...(record.isPosted ? [{ field: 'delivery_date', label: 'วันที่ส่งงาน', type: 'date' as const, value: text(record.postDate) }] : []),
        ...(record.paymentStatus === 'paid' ? [{ field: 'paid_date', label: 'วันที่รับเงิน', type: 'date' as const, value: text(record.payDate) }] : []),
      ]),
    ];
  }
  if (tool === 'propose_record_payment') {
    const split = Array.isArray(record?.installments) && (record!.installments as unknown[]).length > 0;
    return [
      ...(args.mode === 'partial' && !split ? [{ field: 'amount', label: 'ยอดที่ได้รับ (บาท)', type: 'money' as const, value: text(args.amount) }] : []),
      { field: 'date', label: 'วันที่รับเงิน', type: 'date', value: text(args.date) || todayBangkok() },
    ];
  }
  if (tool === 'propose_add_document' && record) {
    const doc = record as { issuer?: Record<string, unknown>; client?: Record<string, unknown>; items?: { description?: string; quantity?: number; price?: number }[]; vatRate?: number; whtRate?: number; createdDate?: string };
    const items = doc.items ?? [];
    const one = items.length === 1;
    const partyLabels = { issuer: 'ผู้ออก', client: 'ลูกค้า' };
    const fieldLabels = { name: 'ชื่อ', address: 'ที่อยู่', phone: 'โทรศัพท์', email: 'อีเมล', tax_id: 'เลขผู้เสียภาษี' };
    return [
      ...DOCUMENT_PARTIES.flatMap(party => (Object.keys(DOCUMENT_PARTY_FIELDS) as (keyof typeof DOCUMENT_PARTY_FIELDS)[]).map(field => ({
        field: `${party}_${field}`, label: `${partyLabels[party]} · ${fieldLabels[field]}`, type: 'text' as const,
        value: text(doc[party]?.[DOCUMENT_PARTY_FIELDS[field]]),
      }))),
      ...(items.length <= DOCUMENT_ITEM_EDITS ? items.flatMap((item, index) => {
        const of = one ? '' : ` (รายการที่ ${index + 1})`;
        return [
          { field: `item_${index + 1}_description`, label: one ? 'รายการ' : `รายการที่ ${index + 1}`, type: 'text' as const, value: text(item.description) },
          { field: `item_${index + 1}_quantity`, label: `จำนวน${of}`, type: 'money' as const, value: text(item.quantity) },
          { field: `item_${index + 1}_price`, label: `ราคาต่อหน่วย (บาท)${of}`, type: 'money' as const, value: text(item.price) },
        ];
      }) : []),
      { field: 'vat_rate', label: 'VAT (%)', type: 'choice', value: text(doc.vatRate ?? 0), options: ['0', '7'] },
      { field: 'wht_rate', label: 'หัก ณ ที่จ่าย (%)', type: 'choice', value: text(doc.whtRate ?? 0), options: ['0', '1', '2', '3', '5'] },
      { field: 'created_date', label: 'วันที่เอกสาร', type: 'date', value: text(doc.createdDate) },
    ];
  }
  if (tool === 'propose_add_expense') {
    return [
      { field: 'name', label: 'รายการ', type: 'text', value: text(args.name) },
      { field: 'amount', label: 'จำนวนเงิน (บาท)', type: 'money', value: text(args.amount) },
      { field: 'category', label: 'หมวดหมู่', type: 'choice', value: text(args.category), options: categoryOptions(text(args.category), user) },
      { field: 'date', label: 'วันที่', type: 'date', value: text(args.date) },
    ];
  }
  return undefined;
}

export function createToolbox(context: ToolContext) {
  // Each saved proposal keeps the call that prepared it (tool and arguments), so its card can be edited later.
  let current: { name: string; args: Record<string, unknown> } | null = null;
  let lastSaved: Proposal | null = null;
  const store = context.proposals;
  context = { ...context, proposals: { save: proposal => {
    const saved = current ? { ...proposal, tool: current.name, args: current.args } : proposal;
    lastSaved = saved;
    return store.save(saved);
  } } };
  const { user } = context;
  const jobs = () => (user.jobs || []) as Job[];
  const findJob = (id: unknown) => jobs().find(job => job.id === id);
  // Reuse the same read within one answer. A failed read remains an error, never an empty list.
  let vaultRead: ReturnType<VaultLoader> | undefined;
  const loadVaultFiles = context.loadVaultFiles ? () => (vaultRead ??= context.loadVaultFiles!()) : undefined;

  const propose = async (kind: ProposalKind, job: Job, record: Record<string, unknown> | null, title: string, changes: Proposal['changes']): Promise<ToolOutcome> => {
    if (record) {
      // Older jobs can lack fields the app now requires; fill them the way the app's job form does.
      record.type ??= 'ยังไม่ระบุ';
      record.note ??= '';
      try { validateChanges([{ table: 'cashflow_jobs', id: job.id, op: 'set', version: null, data: record }]); }
      catch (error) {
        const fields = Array.isArray((error as any)?.issues) ? (error as any).issues.map((issue: any) => (issue.path || []).join('.')).filter(Boolean) : [];
        return fail(`ข้อมูลไม่ผ่านการตรวจของแอป${fields.length ? ` (${[...new Set(fields)].join(', ')})` : ''}`);
      }
    }
    return prepareProposal(context, { kind, id: job.id, record, title, changes });
  };

  const execute = async (call: ToolCall): Promise<ToolOutcome> => {
    // Lessons are put on a card only here, from the server's own comparison; a model's arguments never carry them.
    const { __learn: _fromModel, ...plain } = (call.args || {}) as Record<string, unknown>;
    void _fromModel;
    const lessons = mergePairs(context.learn ?? [], pairsFromEdit(call.name, plain, user));
    current = { name: call.name, args: { ...plain, ...(lessons.length ? { __learn: lessons } : {}) } };
    lastSaved = null;
    const outcome = await run({ ...call, args: plain });
    const card = outcome.card;
    if (card?.kind === 'confirm' && lastSaved && (lastSaved as Proposal).id === card.id && EDITABLE_FIELDS[call.name]) {
      const fields = editFields(call.name, current.args, (lastSaved as Proposal).record, user);
      if (fields?.length) return { ...outcome, card: { ...card, edit: fields } };
    }
    return outcome;
  };
  return execute;

  async function run(call: ToolCall): Promise<ToolOutcome> {
    const args = call.args || {};
    const spec = [...toolsFor('chat'), ...toolsFor('action')].find(tool => tool.name === call.name);
    if (!spec) return fail('ไม่รู้จักเครื่องมือนี้');
    if (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !Object.prototype.hasOwnProperty.call(spec.parameters.properties, key))) return fail('ตัวกรองไม่ถูกต้อง เครื่องมืออ่านได้เฉพาะบัญชีที่เข้าสู่ระบบ');
    if (isFinancialTool(call.name)) {
      const outcome = executeFinancialTool(call.name, args, user, context.now);
      // Several months: the chat draws them as a chart card from these exact figures (2026-10-25).
      const chart = call.name === 'financial_summary' ? moneyChartFrom(outcome.result) : null;
      if (!chart) return outcome;
      return { result: { ...(outcome.result as Record<string, unknown>), display: moneyChartDisplay(chart),
        card_shown: 'A chart card with รายรับ, รายจ่าย and คงเหลือ for each month is drawn under your answer from these exact figures. Write one or two lines: the trend, the strongest or weakest month, a month still in progress. Quote amounts only from display. Never draw a chart with characters and never add a table of the same months.' }, card: chart };
    }
    if (isAccountTool(call.name) && args.domain === 'goals' && !launched('split')) return fail('ส่วนนี้ยังไม่เปิดให้ใช้งาน');
    if (isAccountTool(call.name)) {
      const outcome = executeAccountTool(call.name, args, user, context.now);
      // Settings for areas not open to every account (goals, the monthly income target) stay out of sight.
      const settings = (outcome.result as { settings?: Record<string, unknown> } | null)?.settings;
      if (args.domain === 'settings' && settings && !launched('split')) {
        for (const field of ['monthly_revenue_goal', 'savings_percentage', 'goals_enabled', 'user_persona']) delete settings[field];
      }
      return outcome;
    }
    if (isVaultTool(call.name)) return executeVaultTool(call.name, args, user, loadVaultFiles, context.now);
    if (isPastWorkTool(call.name)) return executePastWork(args, user);
    if (isDocumentActionTool(call.name)) return executeDocumentAction(call.name, args, context);
    if (isRecordActionTool(call.name)) return executeRecordAction(call.name, args, context);
    if (isNavigationTool(call.name)) return executeNavigationTool(call.name, args, context);
    if (['search_jobs', 'search_documents', 'receivables'].includes(call.name) &&
      ((args.offset !== undefined && (!Number.isInteger(args.offset) || Number(args.offset) < 0 || Number(args.offset) > 100_000)) ||
      (args.limit !== undefined && (!Number.isInteger(args.limit) || Number(args.limit) < 1 || Number(args.limit) > 25)))) return fail('หน้ารายการไม่ถูกต้อง ใช้ limit 1–25 และ offset ตั้งแต่ 0');
    switch (call.name) {
      case 'feature_lookup': {
        const features = lookupKnowledge(String(args.query || ''), 3);
        return { result: knowledgeSnippets(features), extraCards: features.features.map(feature => featureNavigation(feature.id, context)).filter((card): card is NonNullable<typeof card> => Boolean(card)) };
      }
      case 'money_summary': {
        if (args.month !== undefined && !['this', 'last'].includes(String(args.month))) return fail('เครื่องมือนี้รองรับเฉพาะเดือนนี้/เดือนก่อน ใช้ financial_summary สำหรับปีหรือช่วงวันที่');
        const snapshot = buildDataSnapshot(user);
        const month = args.month === 'last' ? snapshot.lastMonth : snapshot.thisMonth;
        // The chat draws the month's money as its summary card (same figures as the overview), so the answer
        // can stay to a line or two.
        const profit = monthlyProfitSummary(month);
        const [y, m] = month.monthKey.split('-').map(Number);
        const card: AssistantCard = { kind: 'summary', period: `${MONTHS[m - 1]} ${y + 543}`, income: baht(profit.received), expense: baht(profit.totalExpense), balance: baht(profit.netProfit) };
        return { result: { ...formatAssistantMonthlySummary(month), card_shown: 'A summary card with รายรับ, รายจ่าย and เงินคงเหลือ is shown under your answer; do not repeat all of it.' }, card };
      }
      case 'receivables': {
        const snapshot = buildDataSnapshot(user);
        return { result: {
          total_owed: baht(snapshot.totalPendingAllTime),
          overdue: capped(snapshot.overdue.map(row => ({ name: row.name, client: row.client, pending: baht(row.pending), when: row.overdueText })), args),
          due_today: capped(snapshot.dueToday.map(row => ({ name: row.name, client: row.client, pending: baht(row.pending) })), args),
          due_within_10_days: capped(snapshot.dueSoon.map(row => ({ name: row.name, client: row.client, pending: baht(row.pending), when: row.dueText })), args),
          all_unpaid: capped(snapshot.unpaid.map(row => ({ name: row.name, client: row.client, pending: baht(row.pending), due: thaiDate(row.dueDate), when: row.dueText })), args),
        } };
      }
      case 'search_jobs': {
        const query = String(args.query || '').trim().toLowerCase();
        const status = String(args.status || 'all');
        if (!['all', 'working', 'unpaid', 'closed'].includes(status)) return fail('สถานะงานไม่ถูกต้อง');
        if (args.month !== undefined && !['all', 'this', 'last'].includes(String(args.month)) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(args.month))) return fail('เดือนต้องเป็น YYYY-MM หรือ all/this/last');
        if (args.year !== undefined && (args.month !== undefined || !Number.isInteger(args.year))) return fail('เลือกปีหรือเดือนอย่างใดอย่างหนึ่ง');
        const year = args.year === undefined ? undefined : Number(args.year) >= 2400 ? Number(args.year) - 543 : Number(args.year);
        if (year !== undefined && (year < 1900 || year > 2200)) return fail('ปีไม่ถูกต้อง');
        const local = new Date((context.now?.getTime() ?? Date.now()) + 7 * 3600_000);
        const monthKey = args.month === 'this' ? local.toISOString().slice(0, 7)
          : args.month === 'last' ? new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
          : /^\d{4}-\d{2}$/.test(String(args.month || '')) ? String(args.month) : null;
        const months = year !== undefined ? Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`) : monthKey ? [monthKey] : [];
        const inMonth = months.length ? new Set(months.flatMap(month => jobsInMonth(jobs() as any, month).map(job => job.id))) : null;
        const rows = jobs().filter(job => (!inMonth || inMonth.has(job.id)) &&
          (!query || `${job.name} ${job.client || ''} ${job.type || ''}`.toLowerCase().includes(query))
          && (status === 'all' || (status === 'working' && isWorking(job)) || (status === 'unpaid' && isUnpaid(user, job))
            || (status === 'closed' && !isWorking(job) && !isUnpaid(user, job))));
        return { result: {
          ...capped(rows.map(job => jobRow(user, job)), args),
          ...(monthKey ? { month: monthKey } : {}),
          ...(year !== undefined ? { year } : {}),
          basis: 'unique_job_contracts_with_receipt_or_due_in_period_not_received_income',
          total_value: baht(rows.reduce((sum, job) => sum + (job.value || 0), 0)),
          total_pending: baht(rows.reduce((sum, job) => sum + (isUnpaid(user, job) ? job.pending || 0 : 0), 0)),
        } };
      }
      case 'search_documents': {
        const LABEL: Record<string, string> = { quotation: 'ใบเสนอราคา', invoice: 'ใบแจ้งหนี้', receipt: 'ใบเสร็จรับเงิน', taxInvoice: 'ใบกำกับภาษี', receiptTaxInvoice: 'ใบเสร็จ / ใบกำกับภาษี' };
        type Doc = { id: string; documentType: string; documentNo?: string; createdDate?: string; dueDate?: string; client?: { name?: string }; items?: { quantity?: number; price?: number; discount?: number }[]; vatRate?: number };
        const query = String(args.query || '').trim().toLowerCase();
        const type = String(args.type || 'all');
        if (type !== 'all' && !LABEL[type]) return fail('ประเภทเอกสารไม่ถูกต้อง');
        if ((args.start_date !== undefined && !validDate(args.start_date)) || (args.end_date !== undefined && !validDate(args.end_date)) ||
          (args.start_date && args.end_date && String(args.start_date) > String(args.end_date))) return fail('ช่วงวันที่เอกสารไม่ถูกต้อง');
        // Same total as the documents page (documentMath.calculateDocumentTotals): lines less discounts, plus VAT.
        const totalOf = (doc: Doc) => {
          const subtotal = (doc.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0) - (Number(item.discount) || 0), 0);
          return subtotal + (doc.vatRate ? Math.round((subtotal * doc.vatRate / 100 + Number.EPSILON) * 100) / 100 : 0);
        };
        const docs = (((user as unknown as { invoices?: Doc[] }).invoices) || [])
          .filter(doc => LABEL[doc.documentType] && (type === 'all' || doc.documentType === type)
            && (!args.start_date || (validDate(doc.createdDate) && doc.createdDate >= String(args.start_date)))
            && (!args.end_date || (validDate(doc.createdDate) && doc.createdDate <= String(args.end_date)))
            && (!query || `${doc.documentNo || ''} ${doc.client?.name || ''}`.toLowerCase().includes(query)))
          .sort((a, b) => String(b.createdDate || '').localeCompare(String(a.createdDate || '')));
        const rows = docs.map(doc => ({ document_id: doc.id, type: LABEL[doc.documentType], number: doc.documentNo || '-', client: doc.client?.name || '-', date: thaiDate(doc.createdDate), amount: baht(totalOf(doc)), ...(doc.dueDate ? { due: thaiDate(doc.dueDate) } : {}) }));
        const offset = Number(args.offset || 0);
        const cards: AssistantCard[] = docs.slice(offset, offset + Math.min(3, Number(args.limit || MAX_ROWS))).map(doc => {
          const tab = doc.documentType === 'receiptTaxInvoice' ? 'taxInvoice' : doc.documentType;
          return { kind: 'document', docType: LABEL[doc.documentType], number: doc.documentNo || '-', client: doc.client?.name || '-', amount: baht(totalOf(doc)), path: `/invoice?${new URLSearchParams({ type: tab, document: doc.id })}` };
        });
        const result = { ...capped(rows, args), cards_shown: cards.length, note: cards.length ? 'The first matches on this page are shown as document cards under your answer. Use account_data domain documents with document_id as id for items and details.' : docs.length ? 'No rows on this page; use a smaller offset.' : 'No matching document.' };
        // One card per document; the gateway shows all cards from a request, so hand back the first and keep the rest on the result.
        return { result, ...(cards[0] ? { card: cards[0] } : {}), ...(cards.length > 1 ? { extraCards: cards.slice(1) } : {}) } as ToolOutcome;
      }
      case 'get_job': {
        return executeAccountTool('account_data', { domain: 'job', id: args.job_id }, user, context.now);
      }
      case 'remember': {
        const checked = checkMemory(String(args.kind || ''), args.value, { requestText: context.requestText, hasAttachment: context.hasAttachment });
        if (!checked.ok) return fail(checked.error);
        const saved = await context.memory.remember(user.user_id, checked.kind, checked.value);
        if (saved && saved.ok === false) return fail(saved.error);
        return { result: { ok: true, remembered: `${MEMORY_KINDS[checked.kind].label}: ${checked.value}`, replaced_earlier: Boolean(saved && saved.ok && saved.replaced) } };
      }
      case 'recall_memories': {
        const rows = (await context.memory.list?.(user.user_id)) ?? [];
        const refs = memoryRefs(rows);
        return { result: { ok: true, count: rows.length, memories: rows.slice(0, MEMORY_LIMIT).map(row => ({ ref: refs.get(row.id),
          kind: isMemoryKind(row.kind) ? MEMORY_KINDS[row.kind].label : row.kind, text: row.value, updated: row.updated_at?.slice(0, 10) ?? row.created_at?.slice(0, 10) ?? null })),
          ...(rows.length ? {} : { note: 'Nothing is remembered yet; say so in one line and how to ask you to remember something.' }) } };
      }
      case 'forget_memory': {
        if (!context.memory.forget || !context.memory.list) return fail('ตอนนี้ลบความจำไม่ได้ ลองใหม่อีกครั้ง');
        const rows = await context.memory.list(user.user_id);
        const all = args.all === true;
        // Everything only when the user's own message confirms it (the questions card answer says ทั้งหมด).
        if (all && !/ทั้งหมด|\ball\b|everything/i.test(context.requestText || '')) return fail('ถามผู้ใช้ก่อนด้วย ask_user ว่าจะลบความจำทั้งหมดใช่ไหม');
        // Exactly the refs recall_memories showed (or a full id): a partial ref could match more than one.
        const known = memoryRefs(rows);
        const asked = new Set((Array.isArray(args.refs) ? args.refs : []).map(ref => String(ref).replace(/[^0-9a-f]/gi, '').toLowerCase()).filter(Boolean));
        const chosen = all ? rows : rows.filter(row => asked.has(known.get(row.id)!) || asked.has(row.id.replace(/-/g, '').toLowerCase()));
        if (!chosen.length) return fail(rows.length ? 'ไม่พบความจำนั้น เรียก recall_memories เพื่อดู ref ก่อน' : 'ยังไม่ได้จำอะไรไว้');
        const count = await context.memory.forget(user.user_id, chosen);
        return { result: { ok: true, forgotten: count, left: rows.length - count } };
      }
      case 'note_from_file': {
        if (!context.hasAttachment) return fail('ไม่มีไฟล์แนบในข้อความนี้');
        const facts = String(args.facts || '').trim().slice(0, 1500);
        if (!facts) return fail('ไม่มีข้อมูลให้จด');
        return { result: { ok: true, kept: true, note: 'Kept for the rest of this chat. Now answer the user.' }, memo: facts };
      }
      case 'ask_user': {
        const list = Array.isArray(args.questions) ? (args.questions as Record<string, unknown>[]).slice(0, 5) : [];
        const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
        const questions = list.map((question, index): AskQuestion => {
          const id = `q${index + 1}`;
          const text = clip(question.text, 140);
          const kind = ['date', 'payment', 'party'].includes(String(question.kind)) ? question.kind as AskKind : 'choice';
          // A payment question always offers the app's own credit terms, whatever the model listed (owner: all of them).
          if (kind === 'payment') return { id, text: text || 'การชำระเงิน', kind, options: [], allowText: false, terms: [...CREDIT_TERM_PRESETS] };
          if (kind === 'date') return { id, text, kind, options: [], allowText: false };
          if (kind === 'party') {
            const given = question.prefill && typeof question.prefill === 'object' ? question.prefill as Record<string, unknown> : {};
            const prefill = Object.fromEntries(([['name', 'name', 200], ['address', 'address', 500], ['taxId', 'tax_id', 30], ['phone', 'phone', 50]] as const)
              .map(([key, arg, max]) => [key, clip(given[arg], max)]).filter(([, value]) => value));
            return { id, text, kind, options: [], allowText: false, role: question.role === 'issuer' ? 'issuer' : 'client', ...(Object.keys(prefill).length ? { prefill } : {}) };
          }
          const options = (Array.isArray(question.options) ? question.options : []).map(option => String(option).trim().slice(0, 40)).filter(Boolean).slice(0, 6);
          return { id, text, options, allowText: question.allow_text === true || options.length === 0,
            ...(question.placeholder ? { placeholder: clip(question.placeholder, 60) } : {}) };
        }).filter(question => question.text);
        if (!questions.length) return fail('ต้องมีคำถามอย่างน้อย 1 ข้อ');
        return { result: { ok: true, shown: questions.length, note: 'The user now sees these as tap-to-answer questions; the turn has ended. Do not list the questions again.' },
          card: { kind: 'questions', id: `ask_${randomUUID()}`, questions }, endTurn: true };
      }
      case 'route_to_action':
        return { result: { ok: true, handed_over: true }, handoff: String(args.summary || '').trim().slice(0, 300) || 'The user wants something done (see their last message).' };
      case 'propose_add_job': {
        // The same details the app's job form asks for (JobFormDrawer). Anything the payment schedule depends on
        // must come from the user, never from a default: the tool lists what is missing for the model to ask.
        const value = Number(args.value);
        const name = String(args.name || '').trim();
        const isDate = (raw: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(raw || ''));
        const missing: string[] = [];
        if (!name) missing.push('ชื่องาน');
        if (!Number.isFinite(value) || value <= 0) missing.push('มูลค่างาน');
        const client = String(args.client ?? '').trim();
        if (!client) missing.push('ลูกค้า (หรือ "ไม่ระบุ")');
        const delivered = typeof args.delivered === 'boolean' ? args.delivered : null;
        if (delivered === null) missing.push('ส่งงานแล้วหรือยังกำลังทำ');
        if (delivered === true && !isDate(args.delivery_date)) missing.push('วันที่ส่งงาน');
        // Installments (owner, 2026-10-24: "เรามีฟีเจอร์งวดแต่มันไม่ไปแบ่งเป็นงวด"), the same rules as the job form:
        // every installment above 0, together exactly the amount after withholding.
        const plan = Array.isArray(args.installments) && args.installments.length > 0 ? (args.installments as Record<string, unknown>[]).slice(0, 24) : null;
        if (plan && plan.length < 2) missing.push('จำนวนงวด (อย่างน้อย 2 งวด)');
        if (plan?.some(row => !row.paid && !isDate(row.due_date))) missing.push('วันครบกำหนดของแต่ละงวดที่ยังไม่ได้รับ');
        const payment = plan ? 'installment' as const : ['unpaid', 'partial', 'paid'].includes(String(args.payment_status)) ? String(args.payment_status) as 'unpaid' | 'partial' | 'paid' : null;
        if (!payment) missing.push('สถานะการชำระ (ยังไม่จ่าย / จ่ายบางส่วน / จ่ายครบแล้ว / แบ่งงวด)');
        if (payment === 'partial' && !(Number(args.received_amount) > 0)) missing.push('ยอดที่ได้รับแล้ว');
        const hasTerm = args.credit_term_days !== undefined && args.credit_term_days !== null && Number.isFinite(Number(args.credit_term_days));
        if (payment !== 'paid' && payment !== 'installment' && !hasTerm && !isDate(args.pay_date)) missing.push('เครดิตเทอม (กี่วันหลังส่งงาน) หรือวันครบกำหนดรับเงิน');
        const whtGiven = args.wht_rate !== undefined && args.wht_rate !== null && String(args.wht_rate) !== '';
        if (!whtGiven) missing.push('หัก ณ ที่จ่ายกี่ % (ไม่มีก็ได้)');
        if (missing.length) {
          return { result: { ok: false, missing, note: 'Not prepared. Fill what the message clearly implies (see the prompt) and ask only for the rest, all in ONE ask_user call, then call again.' } };
        }
        const wht = Number(args.wht_rate);
        if (!isValidWhtRate(wht)) return fail('อัตราหัก ณ ที่จ่ายไม่ถูกต้อง');
        const today = todayBangkok();
        const postDate = isDate(args.delivery_date) ? String(args.delivery_date) : '';
        let creditTerm = hasTerm ? Math.max(0, Math.round(Number(args.credit_term_days))) : 0;
        if (!hasTerm && isDate(args.pay_date) && postDate) creditTerm = Math.max(0, Math.round((Date.parse(String(args.pay_date)) - Date.parse(postDate)) / 86400000));
        const whtAmount = whtAmountFor(value, wht);
        const net = roundMoney(value - whtAmount);
        let installments: { id: string; label: string; amount: number; dueDate: string | null; paidAt: string | null; status: 'pending' | 'paid' }[] = [];
        if (plan) {
          const given = plan.map(row => (row.amount === undefined || row.amount === null || row.amount === '' ? null : roundMoney(Number(row.amount))));
          if (given.some(amount => amount !== null && !(amount > 0))) return fail('ทุกงวดต้องมียอดมากกว่า 0 บาท');
          const fixed = roundMoney(given.reduce<number>((sum, amount) => sum + (amount ?? 0), 0));
          const open = given.filter(amount => amount === null).length;
          if (open === 0 && Math.abs(fixed - net) > 0.01) return fail(`ยอดรวมทุกงวด ${baht(fixed)} ไม่เท่ายอดสุทธิของงาน ${baht(net)} (หลังหัก ณ ที่จ่าย) กรุณาบอกยอดแต่ละงวดให้ครบ`);
          if (open > 0 && fixed >= net) return fail(`ยอดงวดที่ระบุ ${baht(fixed)} เท่ากับหรือเกินยอดสุทธิ ${baht(net)} แล้ว`);
          const share = open ? Math.floor(((net - fixed) / open) * 100) / 100 : 0;
          let left = roundMoney(net - fixed - share * open);
          installments = plan.map((row, index) => {
            let amount = given[index];
            if (amount === null) { amount = roundMoney(share + left); left = 0; }
            const paid = row.paid === true;
            return { id: randomUUID(), label: `งวดที่ ${index + 1}`, amount, dueDate: isDate(row.due_date) ? String(row.due_date) : null,
              paidAt: paid ? (isDate(row.paid_date) ? String(row.paid_date) : today) : null, status: paid ? 'paid' : 'pending' };
          });
        }
        const received = payment === 'installment' ? roundMoney(installments.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0))
          : payment === 'paid' ? net : payment === 'partial' ? roundMoney(Math.min(Number(args.received_amount), net)) : 0;
        if (payment === 'partial' && received >= net) return fail('ยอดที่ได้รับเท่ากับหรือเกินยอดที่ต้องรับ ให้ใช้สถานะจ่ายครบแล้วแทน');
        const behaviorFor = payment === 'paid' ? 'done' : payment === 'partial' ? 'partial' : 'pending';
        const statuses = (user.statuses || []) as { id: string; behavior: string }[];
        const status = payment === 'installment' ? 'installment' : statuses.find(item => item.id === behaviorFor && item.behavior === behaviorFor)?.id
          ?? statuses.find(item => item.behavior === behaviorFor && item.id !== 'installment')?.id ?? behaviorFor;
        const nextDue = installments.filter(row => row.status !== 'paid' && row.dueDate).map(row => row.dueDate as string).sort()[0];
        const payDate = payment === 'installment' ? (nextDue || null)
          : payment === 'paid' ? (isDate(args.paid_date) ? String(args.paid_date) : today)
          : isDate(args.pay_date) ? String(args.pay_date)
          : postDate ? calculatePayDate(postDate, creditTerm, false) : null;
        const job = {
          id: randomUUID(), name, type: args.type ? String(args.type).trim() : 'ยังไม่ระบุ', client: client === 'ไม่ระบุ' ? '' : client,
          value, received, pending: roundMoney(Math.max(0, net - received)), status, creditTerm, postDate, startDate: today,
          isPosted: Boolean(delivered), payDate, note: args.note ? String(args.note) : '', whtRate: wht, whtAmount, excludeHolidays: false, installments,
          paymentStatus: payment === 'paid' || (payment === 'installment' && received >= net) ? 'paid' : payment === 'partial' || (payment === 'installment' && received > 0) ? 'partial' : 'unpaid',
          ...(payment === 'partial' ? { depositDate: today, depositAmount: received } : {}),
        } as unknown as Job;
        return propose('add_job', job, job as unknown as Record<string, unknown>, 'เพิ่มงานใหม่ 1 งาน', [
          { label: 'งาน', value: name }, { label: 'ลูกค้า', value: client }, { label: 'มูลค่า', value: baht(value) },
          { label: 'สถานะงาน', value: delivered ? `ส่งงานแล้ว ${thaiDate(postDate)}` : postDate ? `กำลังทำ · จะส่ง ${thaiDate(postDate)}` : 'กำลังทำ' },
          { label: 'การชำระ', value: payment === 'installment' ? `แบ่ง ${installments.length} งวด · รับแล้ว ${baht(received)} · ค้าง ${baht(net - received)}` : payment === 'paid' ? `จ่ายครบแล้ว ${thaiDate(payDate)}` : payment === 'partial' ? `รับแล้ว ${baht(received)} · ค้าง ${baht(net - received)}` : 'ยังไม่จ่าย' },
          ...installments.map(row => ({ label: row.label, value: `${baht(row.amount)} · ${row.status === 'paid' ? `รับแล้ว ${thaiDate(row.paidAt)}` : row.dueDate ? `ครบกำหนด ${thaiDate(row.dueDate)}` : 'ยังไม่กำหนดวัน'}` })),
          ...(payment !== 'paid' && payment !== 'installment' ? [{ label: 'ครบกำหนดรับเงิน', value: payDate ? `${thaiDate(payDate)} (เครดิต ${creditTerm} วัน)` : `เครดิต ${creditTerm} วันหลังส่งงาน` }] : []),
          { label: 'หัก ณ ที่จ่าย', value: wht ? `${wht}% (${baht(whtAmount)})` : 'ไม่มี' },
        ]);
      }
      case 'propose_record_payment': {
        const job = findJob(args.job_id);
        if (!job) return fail('ไม่พบงานนี้ในบัญชี');
        if (!isUnpaid(user, job)) return fail('งานนี้รับเงินครบแล้ว');
        const net = netOf(job);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? String(args.date) : todayBangkok();
        // A job paid in installments: tick installments as the app's planner does, never a deposit (owner, 2026-10-24).
        if (job.installments?.length) {
          const rows = job.installments.map(row => ({ ...row }));
          const open = rows.filter(row => row.status !== 'paid').sort((x, y) => String(x.dueDate || '9999').localeCompare(String(y.dueDate || '9999')));
          if (!open.length) return fail('งานนี้รับครบทุกงวดแล้ว');
          let ticked = open;
          if (args.mode === 'partial') {
            const amount = roundMoney(Number(args.amount));
            const match = open.find(row => Math.abs(row.amount - amount) <= 0.01);
            if (!match) return fail(`งานนี้แบ่งชำระเป็นงวด ยอด ${baht(amount)} ไม่ตรงกับงวดที่ยังไม่ได้รับ (${open.map(row => `${row.label} ${baht(row.amount)}`).join(', ')}) ถามว่าเป็นงวดไหน หรือให้แก้ยอดงวดในหน้างาน`);
            ticked = [match];
          }
          for (const row of ticked) { row.status = 'paid'; row.paidAt = date; }
          const receivedNow = roundMoney(rows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0));
          const left = rows.filter(row => row.status !== 'paid');
          const nextDue = left.filter(row => row.dueDate).map(row => row.dueDate as string).sort()[0] || null;
          const done = left.length === 0 || receivedNow >= net;
          const record = { ...job, installments: rows, received: receivedNow, pending: roundMoney(Math.max(0, net - receivedNow)), payDate: nextDue,
            paymentStatus: done ? 'paid' : 'partial', lastActivityAt: new Date().toISOString() };
          return propose('record_payment', job, record, done ? 'บันทึกรับเงินครบทุกงวด' : `บันทึกรับ${ticked.map(row => row.label).join(' ')}`, [
            { label: 'งาน', value: job.name }, { label: 'ลูกค้า', value: job.client || '-' },
            ...ticked.map(row => ({ label: `รับ${row.label}`, value: `${baht(row.amount)} · ${thaiDate(date)}` })),
            { label: 'คงเหลือ', value: done ? 'รับครบทุกงวด' : `${left.length} งวด ${baht(roundMoney(net - receivedNow))}${nextDue ? ` · งวดถัดไป ${thaiDate(nextDue)}` : ''}` },
          ]);
        }
        // Money already received (a deposit) stays: the app keeps one deposit, then the rest as paid in full.
        const already = roundMoney(Math.max(0, Number(job.received) || 0));
        if (args.mode === 'partial' && already > 0) return fail(`งานนี้รับเงินไว้แล้ว ${baht(already)} ถ้ายอดนี้คือส่วนที่เหลือทั้งหมด ให้บันทึกเป็นรับครบ ถ้ายังไม่ครบ ให้แก้ยอดในหน้างาน เพื่อไม่ให้ยอดที่รับไว้เดิมหาย`);
        if (args.mode === 'partial') {
          const amount = roundMoney(Number(args.amount));
          if (!Number.isFinite(amount) || amount <= 0) return fail('ต้องระบุยอดที่ได้รับ');
          if (amount >= net) return fail('ยอดนี้เท่ากับหรือเกินยอดที่ต้องรับ ให้บันทึกเป็นรับครบแทน');
          const record = { ...job, status: 'partial', received: amount, pending: roundMoney(Math.max(0, net - amount)), paymentStatus: 'partial', depositDate: date, depositAmount: amount, lastActivityAt: new Date().toISOString() };
          return propose('record_payment', job, record, 'บันทึกรับเงินบางส่วน', [{ label: 'งาน', value: job.name }, { label: 'รับแล้ว', value: baht(amount) }, { label: 'คงเหลือ', value: baht(record.pending) }, { label: 'วันที่รับ', value: thaiDate(date) }]);
        }
        const record = { ...job, status: 'done', received: net, pending: 0, paymentStatus: 'paid', payDate: date, lastActivityAt: new Date().toISOString() };
        // The slip shows this receipt; a deposit received earlier is listed apart (2026-10-24: "ยอดรับ ฿29,100" for a ฿19,100 slip).
        const money = already > 0
          ? [{ label: 'รับครั้งนี้', value: baht(roundMoney(net - already)) }, { label: 'รับรวมทั้งงาน', value: `${baht(net)} (รับไว้ก่อน ${baht(already)})` }]
          : [{ label: 'ยอดรับ', value: baht(net) }];
        return propose('record_payment', job, record, 'บันทึกรับเงินครบ', [{ label: 'งาน', value: job.name }, { label: 'ลูกค้า', value: job.client || '-' }, ...money, { label: 'วันที่รับ', value: thaiDate(date) }]);
      }
      case 'propose_edit_job': {
        const job = findJob(args.job_id);
        if (!job) return fail('ไม่พบงานนี้ในบัญชี');
        const record: Record<string, unknown> = { ...job, lastActivityAt: new Date().toISOString() };
        const changes: Proposal['changes'] = [{ label: 'งาน', value: job.name }];
        if (job.installments?.length && ['value', 'pay_date', 'credit_term_days'].some(key => args[key] !== undefined)) return fail('งานนี้แบ่งชำระเป็นงวด กรุณาแก้จำนวนเงินและกำหนดแต่ละงวดในหน้าแก้ไขงาน');
        if (typeof args.name === 'string' && args.name.trim()) { record.name = args.name.trim(); changes.push({ label: 'ชื่อใหม่', value: record.name as string }); }
        if (typeof args.client === 'string') { record.client = args.client.trim(); changes.push({ label: 'ลูกค้า', value: (record.client as string) || '-' }); }
        const financial = calculateJobFinancialEdit(job, user.statuses || [], args,
          new Date((context.now?.getTime() ?? Date.now()) + 7 * 3600_000).toISOString().slice(0, 10));
        if (!financial.ok) return { result: { ok: false, error: financial.error, ...(financial.missing ? { missing: financial.missing } : {}) } };
        Object.assign(record, financial.patch);
        changes.push(...financial.changes);
        if (args.pay_date !== undefined) {
          if (!validDate(args.pay_date)) return fail('วันที่ต้องเป็นวันที่จริง YYYY-MM-DD');
          if (args.payment_status === 'paid') return fail('เมื่อบันทึกรับครบ ให้ระบุวันที่รับเงินจริง ไม่ต้องเปลี่ยนวันครบกำหนดรับเงิน');
          if (!isUnpaid(user, job) && (job.received || 0) > 0) return fail('งานนี้รับเงินครบแล้ว วันที่รับเงินจริงให้ตรวจและแก้ในหน้าแก้ไขงาน');
          record.payDate = String(args.pay_date);
          changes.push({ label: 'ครบกำหนดรับเงิน', value: `${thaiDate(job.payDate)} → ${thaiDate(record.payDate as string)}` });
        }
        if (args.delivery_date !== undefined) {
          if (!validDate(args.delivery_date)) return fail('วันที่ส่งงานต้องเป็นวันที่จริง YYYY-MM-DD');
          record.postDate = args.delivery_date;
          changes.push({ label: 'วันที่ส่งงาน / แผนส่ง', value: `${thaiDate(job.postDate)} → ${thaiDate(args.delivery_date)}` });
        }
        if (args.delivered !== undefined) {
          if (typeof args.delivered !== 'boolean') return fail('สถานะส่งงานต้องเป็น true หรือ false');
          if (args.delivered && !validDate(record.postDate)) return fail('ระบุวันที่ส่งงานก่อนเปลี่ยนเป็นส่งงานแล้ว');
          record.isPosted = args.delivered;
          changes.push({ label: 'สถานะงาน', value: args.delivered ? 'ส่งงานแล้ว' : 'กำลังทำ' });
        }
        if (args.remind_date !== undefined) {
          if (args.remind_date !== '' && !validDate(args.remind_date)) return fail('วันที่เตือนต้องเป็นวันที่จริง YYYY-MM-DD');
          record.remindAt = args.remind_date || null;
          changes.push({ label: 'วันที่เตือนติดตาม', value: args.remind_date ? thaiDate(String(args.remind_date)) : 'ล้างวันที่เตือน' });
        }
        if (args.type !== undefined) {
          if (typeof args.type !== 'string' || !args.type.trim()) return fail('ระบุประเภทงาน');
          record.type = args.type.trim(); changes.push({ label: 'ประเภทงาน', value: record.type as string });
        }
        if (args.credit_term_days !== undefined) {
          if (!Number.isInteger(args.credit_term_days) || Number(args.credit_term_days) < 0 || Number(args.credit_term_days) > 3650) return fail('เครดิตเทอมต้องเป็นจำนวนเต็ม 0–3650 วัน');
          record.creditTerm = args.credit_term_days;
          changes.push({ label: 'เครดิตเทอม', value: `${args.credit_term_days} วัน` });
        }
        if (args.pay_date === undefined && record.paymentStatus !== 'paid' && (args.delivery_date !== undefined || args.credit_term_days !== undefined) && !job.installments?.length && isUnpaid(user, job) && validDate(record.postDate)) {
          record.payDate = calculatePayDate(record.postDate, Number(record.creditTerm || 0), Boolean(record.excludeHolidays));
          changes.push({ label: 'กำหนดรับเงินตามเครดิต', value: thaiDate(String(record.payDate)) });
        }
        if (typeof args.note === 'string') { record.note = args.note; changes.push({ label: 'บันทึก', value: args.note || '-' }); }
        if (changes.length === 1) return fail('ไม่มีอะไรให้เปลี่ยน');
        return propose('edit_job', job, record, 'แก้ไขงาน', changes);
      }
      case 'propose_delete_job': {
        const job = findJob(args.job_id);
        if (!job) return fail('ไม่พบงานนี้ในบัญชี');
        return propose('delete_job', job, null, 'ลบงาน 1 งาน', [
          { label: 'งาน', value: job.name }, { label: 'ลูกค้า', value: job.client || '-' }, { label: 'มูลค่า', value: baht(job.value || 0) },
          { label: 'ผลกระทบ', value: 'งานนี้จะหายจากรายการ รายงาน และเงินค้างรับ' },
        ]);
      }
      default:
        return fail(`ไม่มีเครื่องมือ ${call.name}`);
    }
  };
}
