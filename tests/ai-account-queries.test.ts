import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_TOOLS, executeAccountTool, isAccountTool } from '../backend/src/ai/accountQueries';
import { executeFinancialTool } from '../backend/src/ai/financialQueries';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Synthetic snapshots only. No DB, model, fetch or paid calls.
const NOW = new Date('2026-10-24T04:00:00.000Z');
const SECRET = 'PRIVATE_FIELD_MUST_NOT_REACH_MODEL';
const profile = { name: 'Owner', address: 'Bangkok', phone: '01234', email: 'own@example.test', taxId: 'tax-own',
  bankName: 'Bank', bankAccount: 'own-account', bankAccountName: 'Owner', website: 'https://example.test', logoUrl: SECRET, signatureUrl: SECRET };
const job = (over: Record<string, unknown> = {}) => ({ id: 'job-a', name: 'Design', type: 'Design', client: 'Acme', value: 1000,
  received: 300, pending: 700, status: 'part', creditTerm: 30, postDate: '2026-10-01', startDate: '2026-09-01', isPosted: true,
  payDate: '2026-11-01', note: 'Follow agreed schedule', depositDate: '2026-09-20', depositAmount: 300, ...over });
function fixture(): UserRow {
  return {
    user_id: 'account-own', email: SECRET, avatar_data_url: SECRET, password_hash: SECRET,
    jobs: [job(), job({ id: 'job-b', name: 'Video', client: 'ACME', value: 2000, received: 1000, pending: 1000,
      postDate: '2026-10-24', isPosted: false, payDate: null, depositDate: null, depositAmount: undefined,
      remindAt: '2026-10-26', followUpCount: 2, lastFollowUpDate: '2026-10-22', whtDocId: 'wht-a',
      installments: [
        { id: 'part-1', label: 'First', amount: 600, status: 'paid', paidAt: '2026-10-01', dueDate: '2026-09-01', hidden: SECRET },
        { id: 'part-2', label: 'Second', amount: 400, status: 'paid', paidAt: null, dueDate: '2026-10-02' },
        { id: 'part-3', label: 'Final', amount: 1000, status: 'pending', paidAt: null, dueDate: '2026-10-31' },
      ], secret: SECRET }), job({ id: 'job-c', client: 'Beta', value: 50, received: 50, pending: 0,
        postDate: undefined, startDate: undefined, depositDate: undefined, depositAmount: undefined, payDate: '2026-10-31' })],
    statuses: [{ id: 'part', label: 'Paid partly', behavior: 'partial', secret: SECRET }],
    goals: [{ id: 'goal-a', name: 'Emergency', type: 'emergency', current: 400, target: 1000, deadline: '2027-01-01', imageUrl: SECRET,
      allocatedPercentage: 10, history: [
        { id: 'old', type: 'deposit', amount: 600, date: '2026-09-01', reason: 'Initial', deductedFromCash: true },
        { id: 'new', type: 'withdraw', amount: 200, date: '2026-10-01', reason: 'Repair', note: 'One item', balanceBefore: 600, hidden: SECRET },
      ] }, { id: 'goal-b', name: 'Camera', type: 'buy', current: 100, target: 2000, deadline: '2027-02-01' }],
    invoices: [{ id: 'doc-a', documentType: 'invoice', documentNo: 'INV001', createdDate: '2026-10-15', dueDate: '2026-11-15',
      issuer: profile, client: { name: 'Acme', address: 'Client address', email: 'client@example.test', taxId: 'tax-client', secret: SECRET },
      items: [{ id: 'item-1', description: 'Design', quantity: 2, price: 1000, discount: 100, detail: 'Details', fileData: SECRET },
        { id: 'item-2', description: 'Revision', quantity: 1, price: 500, discount: 0 }], vatRate: 7, whtRate: 3,
      paymentTerm: '30 days', linkedFromId: 'quote-a', fileData: SECRET },
      { id: 'doc-b', documentType: 'quotation', documentNo: 'QT002', createdDate: '2026-10-20', client: { name: 'Gamma' },
        issuer: profile, items: [], vatRate: 0, whtRate: 0 }],
    settings: { monthlyExpense: 1200, monthlyRevenueGoal: 10000, savingsPercentage: 20, userPersona: 'freelance', goalsFeatureEnabled: true,
      fixedExpenseItems: [{ id: 'rent', name: 'Rent', amount: 1000, secret: SECRET }, { id: 'phone', name: 'Phone', amount: 200 }],
      profileJobTypes: ['Design', 'Video'], profileJobTypeOther: 'Photo', cashOpening: { amount: 100, createdAt: '2026-01-01', secret: SECRET },
      whtDocuments: [{ id: 'wht-a', jobId: 'job-b', client: 'Acme', whtAmount: 30, whtRate: 3, fileName: 'certificate.pdf', fileType: 'application/pdf',
        createdAt: '2026-10-01T02:00:00.000Z', fileData: SECRET }], privateSettings: SECRET },
    job_types: ['Design', 'Video'], issuer_profile: profile,
    notif_settings: { enabled: true, alertEmail: 'alerts@example.test', dailyDigestEnabled: true, monthlyReportEnabled: true, wht50ReminderEnabled: true,
      serviceType: 'emailjs', lineUserId: SECRET, lineLinkCode: SECRET, lineLinkCodeExpiresAt: SECRET, emailjsPublicKey: SECRET,
      emailjsServiceId: SECRET, emailjsTemplateId: SECRET, pendingQueue: [{ secret: SECRET }], chatHistory: SECRET, pendingDraft: SECRET },
  } as unknown as UserRow;
}
const run = (args: Record<string, unknown>, user = fixture()) => executeAccountTool('account_data', args, user, NOW).result as any;

test('account reads reject unknown domains, ownership/SQL arguments and unbounded paging', () => {
  assert.deepEqual(ACCOUNT_TOOLS.map(tool => tool.name), ['account_data']);
  assert.equal(isAccountTool('account_data'), true);
  assert.equal(isAccountTool('execute_sql'), false);
  assert.equal((executeAccountTool('execute_sql', {}, fixture()).result as any).ok, false);
  for (const args of [ {}, { domain: 'everything' }, { domain: 'goals', user_id: 'other' }, { domain: 'goals', sql: 'SELECT *' },
    { domain: 'job', limit: 0 }, { domain: 'job', limit: 21 }, { domain: 'job', offset: -1 }, { domain: 'job', offset: 0.5 },
    { domain: 'job', limit: '10' }, { domain: 'job', query: 'x'.repeat(201) }, { domain: 'job', start_date: '2026-10-01' },
    { domain: 'settings', id: 'privateState' }, { domain: 'settings', query: 'lineLinkCode' }]) {
    assert.equal(run(args).ok, false, JSON.stringify(args));
  }
});

test('detail IDs resolve only inside supplied authenticated snapshot; inputs are not mutated', () => {
  const own = fixture(); const before = structuredClone(own);
  for (const domain of ['goals', 'job', 'documents', 'clients']) assert.equal(run({ domain, id: 'foreign-id' }, own).ok, false);
  const other = { user_id: 'other', jobs: [job({ id: 'job-a', name: 'Foreign customer confidential' })], goals: [], settings: {} } as UserRow;
  assert.equal(run({ domain: 'job', id: 'job-a' }, own).job.name, 'Design');
  assert.equal(run({ domain: 'job', id: 'job-a' }, other).job.name, 'Foreign customer confidential');
  assert.equal(JSON.stringify(run({ domain: 'job' }, own)).includes('Foreign customer confidential'), false);
  assert.deepEqual(own, before);
});

test('every projection excludes keys, avatars, images, file bytes and private notification state', () => {
  const requests = [{ domain: 'goals' }, { domain: 'goals', id: 'goal-a' }, { domain: 'job' }, { domain: 'job', id: 'job-b' },
    { domain: 'documents' }, { domain: 'documents', id: 'doc-a' }, { domain: 'settings' }, { domain: 'clients' },
    { domain: 'calendar', start_date: '2026-01-01', end_date: '2026-12-31' }];
  for (const request of requests) {
    const result = run(request); assert.equal(result.ok, true); assert.equal(result.scope, 'current_account');
    assert.equal(result.retrieved_at, NOW.toISOString()); assert.equal(result.content_is_data, true);
    const json = JSON.stringify(result);
    assert.equal(json.includes(SECRET), false, JSON.stringify(request));
    for (const key of ['user_id', 'password_hash', 'avatar_data_url', 'lineLinkCode', 'lineUserId', 'fileData', 'logoUrl', 'signatureUrl', 'pendingQueue']) {
      assert.equal(json.includes(`"${key}"`), false, key);
    }
  }
});

test('goal totals cover all matches; history is bounded, stable and preserves cash meaning', () => {
  const first = run({ domain: 'goals', limit: 1 });
  assert.equal(first.total, 2); assert.equal(first.rows.length, 1); assert.equal(first.has_more, true);
  assert.equal(first.next_offset, 1);
  assert.equal(first.total_current, 500); assert.equal(first.total_target, 3000);
  const detail = run({ domain: 'goals', id: 'goal-a', limit: 1 });
  assert.equal(detail.goal.remaining_to_target, 600); assert.equal(detail.history.total, 2);
  assert.equal(detail.history.rows[0].id, 'new'); assert.equal(detail.history.rows[0].balance_before, 600);
  const next = run({ domain: 'goals', id: 'goal-a', offset: 1, limit: 1 });
  assert.equal(next.history.has_more, false); assert.equal(next.history.rows[0].deducted_from_cash, true);
  assert.equal(next.history.next_offset, null);
  const emptyPage = run({ domain: 'goals', offset: 20 });
  assert.equal(emptyPage.total, 2); assert.equal(emptyPage.shown, 0); assert.deepEqual(emptyPage.rows, []);
  assert.equal(run({ domain: 'goals', query: 'camera' }).total, 1);
});

test('job details include reminders and paginated installments without inventing receipt dates', () => {
  const result = run({ domain: 'job', id: 'job-b', limit: 1, offset: 1 });
  assert.equal(result.job.remind_at, '2026-10-26'); assert.equal(result.job.follow_up_count, 2);
  assert.equal(result.job.last_follow_up_date, '2026-10-22'); assert.equal(result.job.wht_document_id, 'wht-a');
  assert.equal(result.job.status_behavior, 'partial'); assert.equal(result.job.delivered, false);
  assert.equal(result.installments.total, 3); assert.equal(result.installments.rows[0].id, 'part-2');
  assert.equal(result.received_entries.total, 2); assert.equal(result.received_entries.rows[0].date, null);
  assert.equal(result.undated_received_amount, 400);
  const partial = fixture(); partial.jobs = [job({ depositDate: null, depositAmount: undefined })] as UserRow['jobs'];
  assert.equal(run({ domain: 'job', id: 'job-a' }, partial).received_entries.rows[0].date, null, 'future due date is not actual receipt date');
});

test('document detail shares exact document calculations over all items independently of page', () => {
  const result = run({ domain: 'documents', id: 'doc-a', offset: 1, limit: 1 });
  assert.deepEqual(result.document.totals, { gross: 2500, discount: 100, subtotal: 2400, vatAmount: 168, total: 2568, whtAmount: 72, payable: 2496 });
  assert.equal(result.items.total, 2); assert.equal(result.items.rows.length, 1); assert.equal(result.items.rows[0].id, 'item-2');
  assert.equal(result.document.issuer.bank_account, 'own-account'); assert.equal(result.document.client.tax_id, 'tax-client');
  assert.equal(result.document.linked_from_id, 'quote-a');
  assert.equal(run({ domain: 'documents', query: 'ACME' }).rows[0].id, 'doc-a');
  assert.equal(run({ domain: 'documents', query: 'QT002' }).rows[0].id, 'doc-b');
  assert.equal(run({ domain: 'documents' }).rows[0].id, 'doc-b', 'newest first');
});

test('settings expose safe financial preferences and WHT metadata, not service credentials', () => {
  const result = run({ domain: 'settings', limit: 1 });
  assert.equal(result.settings.monthly_expense_budget, 1200); assert.equal(result.settings.cash_opening, 100);
  assert.equal(result.recurring_expense_items.total, 2); assert.equal(result.recurring_expense_items.rows[0].amount, 1000);
  assert.equal(result.job_types.total, 2); assert.equal(result.statuses.rows[0].label, 'Paid partly');
  assert.deepEqual(result.notification_preferences, { enabled: true, alert_email: 'alerts@example.test', daily_digest_enabled: true,
    monthly_report_enabled: true, wht50_reminder_enabled: true, line_connected: true, delivery_service: 'emailjs' });
  assert.equal(result.legacy_wht_documents.rows[0].file_name, 'certificate.pdf');
  assert.equal(result.legacy_wht_documents.rows[0].created_date, '2026-10-01');
});

test('calendar distinguishes actual receipts, delivery and unpaid due events across explicit range', () => {
  const result = run({ domain: 'calendar', start_date: '2026-10-01', end_date: '2026-10-31', limit: 1 });
  assert.equal(result.total, 5); assert.equal(result.rows.length, 1); assert.equal(result.has_more, true);
  assert.equal(result.received_total, 600); assert.equal(result.actual_received_through_today, 600); assert.equal(result.due_total, 1000);
  assert.equal(result.as_of, '2026-10-24'); assert.equal(result.future_recorded_receipts, 50); assert.equal(result.future_recorded_receipt_count, 1);
  assert.equal(result.undated_received_amount_excluded, 400);
  const full = run({ domain: 'calendar', start_date: '2026-10-01', end_date: '2026-10-31', limit: 20 });
  assert.equal(full.rows.filter((row: any) => row.kind === 'received').length, 2);
  assert.equal(full.rows.find((row: any) => row.kind === 'received' && row.job_id === 'job-c').future_dated, true);
  assert.equal(full.rows.find((row: any) => row.kind === 'received' && row.job_id === 'job-b').future_dated, false);
  assert.equal(full.rows.find((row: any) => row.kind === 'delivery' && row.job_id === 'job-b').delivered, false);
  assert.equal(run({ domain: 'calendar', start_date: '2026-09-20', end_date: '2026-09-20' }).received_total, 300);
  assert.equal(run({ domain: 'calendar', start_date: '2026-10-01', end_date: '2026-10-31', query: 'Beta' }).received_total, 0);
});

test('future paid single and installment receipts stay visible but agree with financial actual totals', () => {
  const user = fixture(); user.jobs = [job({ id: 'single', value: 500, received: 500, pending: 0, depositDate: undefined, depositAmount: undefined,
    payDate: '2026-10-31' }), job({ id: 'installment', value: 500, received: 500, pending: 0, installments: [
    { id: 'paid-future', label: 'Paid', amount: 500, status: 'paid', paidAt: '2026-10-31', dueDate: '2026-10-01' },
  ] })] as UserRow['jobs'];
  const args = { domain: 'calendar', start_date: '2026-10-01', end_date: '2026-10-31' };
  const calendar = run(args, user);
  const financial = executeFinancialTool('financial_summary', { start_date: args.start_date, end_date: args.end_date }, user, NOW).result as any;
  assert.equal(calendar.received_total, 0); assert.equal(calendar.received_total, financial.totals.received);
  assert.equal(calendar.actual_received_through_today, 0); assert.equal(calendar.future_recorded_receipts, 1000);
  assert.equal(calendar.future_recorded_receipt_count, 2);
  assert.equal(calendar.rows.filter((row: any) => row.kind === 'received' && row.future_dated).length, 2);
  const beforeBangkokMidnight = executeAccountTool('account_data', args, user, new Date('2026-10-30T16:59:59Z')).result as any;
  assert.equal(beforeBangkokMidnight.as_of, '2026-10-30'); assert.equal(beforeBangkokMidnight.received_total, 0);
  const onBangkokDay = executeAccountTool('account_data', args, user, new Date('2026-10-30T17:00:00Z')).result as any;
  assert.equal(onBangkokDay.as_of, '2026-10-31'); assert.equal(onBangkokDay.received_total, 1000); assert.equal(onBangkokDay.future_recorded_receipts, 0);
});

test('calendar rejects absent, impossible, reversed and overlong dates; allows leap day', () => {
  for (const args of [{}, { start_date: '2026-10-01' }, { start_date: '2026-02-30', end_date: '2026-03-01' },
    { start_date: '2026-10-31', end_date: '2026-10-01' }, { start_date: '2569-01-01', end_date: '2569-12-31' },
    { start_date: '2026-01-01', end_date: '2027-01-02' }, { start_date: '2026-10-01T00:00:00Z', end_date: '2026-10-31' },
    { start_date: '2026-10-01', end_date: '2026-10-31', id: 'job-a' }]) assert.equal(run({ domain: 'calendar', ...args }).ok, false);
  assert.equal(run({ domain: 'calendar', start_date: '2024-01-01', end_date: '2024-12-31' }).ok, true);
  assert.equal(run({ domain: 'calendar', start_date: '2024-02-29', end_date: '2024-02-29' }).ok, true);
});

test('client totals do not count documents as extra income and are not truncated by pagination', () => {
  const result = run({ domain: 'clients', limit: 1 });
  assert.equal(result.total, 3); assert.equal(result.total_received, 1350); assert.equal(result.total_pending, 1700);
  assert.equal(result.rows[0].name, 'Acme'); assert.equal(result.rows[0].job_count, 2); assert.equal(result.rows[0].document_count, 1);
  assert.equal(result.rows[0].contract_value, 3000); assert.equal(result.rows[0].received, 1300);
  const detail = run({ domain: 'clients', id: result.rows[0].id });
  assert.equal(detail.total, 1); assert.equal(detail.total_received, 1300);
  const docOnly = run({ domain: 'clients', query: 'gamma' });
  assert.equal(docOnly.rows[0].document_count, 1); assert.equal(docOnly.total_received, 0);
});

test('unsaved notification flags are unknown, while explicit false and disconnected are preserved', () => {
  const user = fixture(); user.notif_settings = {};
  let prefs = run({ domain: 'settings' }, user).notification_preferences;
  for (const key of ['enabled', 'daily_digest_enabled', 'monthly_report_enabled', 'wht50_reminder_enabled', 'line_connected']) assert.equal(prefs[key], null);
  user.notif_settings = { enabled: false, dailyDigestEnabled: false, lineUserId: null } as unknown as UserRow['notif_settings'];
  prefs = run({ domain: 'settings' }, user).notification_preferences;
  assert.equal(prefs.enabled, false); assert.equal(prefs.daily_digest_enabled, false); assert.equal(prefs.line_connected, false);
});

test('timestamps retain reminder time and long fields visibly mark truncation without merging client names', () => {
  const user = fixture();
  user.jobs = [job({ note: 'Long '.repeat(400), remindAt: '2026-10-26T09:30:00+07:00', lastActivityAt: '2026-10-24T04:00:00.123Z',
    client: 'Common'.repeat(40) + ' one' }), job({ id: 'second', client: 'Common'.repeat(40) + ' two' })] as UserRow['jobs'];
  const result = run({ domain: 'job', id: 'job-a' }, user);
  assert.equal(result.job.remind_at, '2026-10-26T09:30:00+07:00'); assert.equal(result.job.last_activity_at, '2026-10-24T04:00:00.123Z');
  assert.match(result.job.note, /ข้อความถูกตัด/); assert.ok(result.job.note.length < 1250);
  const clients = run({ domain: 'clients', query: ' two' }, user);
  assert.equal(clients.total, 1); assert.equal(clients.rows[0].job_count, 1); assert.equal(clients.rows[0].id, 'job:second');
  assert.match(clients.rows[0].name, /ข้อความถูกตัด/);
  assert.equal(run({ domain: 'job', query: ' two' }, user).total, 1, 'search uses original full string, not display truncation');
});
