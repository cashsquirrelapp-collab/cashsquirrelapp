import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDocumentAction } from '../backend/src/ai/documentActions.js';
import { applyWithDocumentQuota } from '../backend/src/ai/documentQuota.js';
import { proposalBaseVersion, proposalChanges, proposalVersionKey, type Proposal } from '../backend/src/ai/proposals.js';
import { applyDocumentBranding, issuerForDocumentEdit } from '../shared/documentBranding.js';
import { confirmProposal, type AssistantDb, type StoredProposal } from '../backend/src/ai/service.js';
import type { ToolContext } from '../backend/src/ai/tools.js';
import type { Invoice, InvoiceProfile } from '../shared/types.js';
import { HttpError } from '../backend/src/http/guard.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const issuer: InvoiceProfile = { name: 'ร้านเจ้าของบัญชี', address: 'กรุงเทพฯ', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '', signatureUrl: 'data:image/png;base64,c2lnbg==' };
const args = { document_type: 'quotation', client: { name: 'ลูกค้า ก' }, items: [
  { description: 'ออกแบบ', quantity: 2, price: 1000, discount: 100 }, { description: 'แก้ไข', quantity: 1, price: 300 },
], vat_rate: 7, wht_rate: 3 };
function fixture(invoices: Invoice[] = [], profile = issuer) {
  const saved: Proposal[] = [];
  const context: ToolContext = { user: { user_id: owner, jobs: [], invoices, issuer_profile: profile } as ToolContext['user'],
    now: new Date('2026-10-23T18:00:00Z'), proposals: { async save(proposal) { saved.push(proposal); } }, memory: { async remember() {} } };
  return { context, saved };
}
const errorCode = (code: string) => (error: unknown) => error instanceof HttpError && error.code === code;

test('quotation prepares the app record with exact line-discount, VAT and WHT totals; no document is applied before confirm', async () => {
  const f = fixture();
  const reply = await executeDocumentAction('propose_add_document', args, f.context);
  assert.equal((reply.result as any).saved, false);
  assert.equal(reply.card?.kind, 'confirm');
  assert.equal(f.saved.length, 1);
  const p = f.saved[0], doc = p.record as unknown as Invoice;
  assert.equal(p.userId, owner);
  assert.equal(p.kind, 'add_document');
  assert.equal(doc.createdDate, '2026-10-24', 'default date follows Bangkok, not UTC');
  assert.match(doc.documentNo, /^QT-2569-[A-F0-9]{8}$/);
  assert.equal(doc.issuer.name, issuer.name);
  assert.equal(doc.issuer.signatureUrl, undefined);
  assert.equal(doc.assistantDraft, true);
  assert.equal(applyDocumentBranding(doc, issuer).issuer.signatureUrl, undefined, 'opening the document cannot attach the saved signature');
  assert.equal(applyDocumentBranding({ ...doc, assistantDraft: false }, issuer).issuer.signatureUrl, issuer.signatureUrl, 'ordinary manual documents keep their existing branding behavior');
  assert.equal(issuerForDocumentEdit({ ...doc, issuer: { ...doc.issuer, name: 'ผู้ออกที่ระบุเฉพาะเอกสาร' } }, issuer).name, 'ผู้ออกที่ระบุเฉพาะเอกสาร');
  assert.equal(issuerForDocumentEdit(doc, issuer).signatureUrl, undefined, 'editing must not copy the signature into the saved record');
  assert.equal(doc.paidAmount, undefined);
  assert.equal(doc.paidDate, undefined);
  assert.equal(doc.client.address, '');
  assert.equal(doc.items.length, 2);
  assert.ok(doc.items.every(item => item.id));
  assert.equal(p.changes.find(change => change.label === 'รวมก่อนภาษี')?.value, '฿2,200.00');
  assert.equal(p.changes.find(change => change.label === 'VAT 7%')?.value, '฿154.00');
  assert.equal(p.changes.find(change => change.label === 'หัก ณ ที่จ่าย 3%')?.value, '฿66.00');
  assert.equal(p.changes.find(change => change.label === 'ยอดชำระสุทธิ')?.value, '฿2,288.00');
  assert.deepEqual(proposalChanges(p, null).map(change => [change.table, change.op, change.version]), [['cashflow_invoices', 'set', null]]);
});

test('missing details are returned together, while optional tax IDs and addresses need not be invented', async () => {
  const f = fixture([], { ...issuer, name: '' });
  const result = await executeDocumentAction('propose_add_document', { document_type: 'invoice' }, f.context);
  assert.equal((result.result as any).missing.length, 3);
  assert.equal(f.saved.length, 0);
  const complete = await executeDocumentAction('propose_add_document', { ...args, issuer: { name: 'ชื่อที่ผู้ใช้บอก' }, vat_rate: 0, wht_rate: 0 }, f.context);
  assert.equal((complete.result as any).ok, true);
  assert.equal((f.saved[0].record as any).issuer.taxId, '');
});

test('malformed money, dates, receipt/posting/signature fields and owner injection cannot create a proposal', async () => {
  const f = fixture();
  const bad = [
    { ...args, user_id: other }, { ...args, table: 'cashflow_jobs' }, { ...args, document_type: 'receipt' },
    { ...args, paid_amount: 100 }, { ...args, issuer: { signatureUrl: 'secret' } },
    { ...args, created_date: '2026-02-30' }, { ...args, due_date: '2569-01-01' },
    { ...args, items: [{ description: 'x', quantity: 1, price: 10, discount: 11 }] },
    { ...args, items: [{ description: 'x', quantity: -1, price: 10 }] },
    { ...args, items: [{ description: 'x', quantity: 1e12, price: 1e12 }] },
  ];
  for (const input of bad) assert.equal((await executeDocumentAction('propose_add_document', input, f.context)).card, undefined);
  assert.equal(f.saved.length, 0);
});

test('edit and delete resolve documents only in the current account; edits preserve omitted details', async () => {
  const initial = fixture();
  await executeDocumentAction('propose_add_document', args, initial.context);
  const doc = initial.saved[0].record as unknown as Invoice;
  const f = fixture([doc]);
  assert.equal((await executeDocumentAction('propose_edit_document', { document_id: 'other-owner-document', note: 'x' }, f.context)).card, undefined);
  assert.equal((await executeDocumentAction('propose_delete_document', { document_id: 'other-owner-document' }, f.context)).card, undefined);
  await executeDocumentAction('propose_edit_document', { document_id: doc.id, note: 'ส่งภายใน 7 วัน' }, f.context);
  assert.equal(f.saved[0].kind, 'edit_document');
  assert.deepEqual((f.saved[0].record as any).items, doc.items);
  assert.equal((f.saved[0].record as any).note, 'ส่งภายใน 7 วัน');
  assert.equal(proposalVersionKey('edit_document', doc.id), `cashflow_invoices:${doc.id}`);
  assert.throws(() => proposalChanges(f.saved[0], null), /Missing proposal version/);
  assert.equal(proposalChanges(f.saved[0], 8)[0].version, 8);
});

test('signed existing documents cannot have their content changed by AI, including current-profile signatures', async () => {
  const initial = fixture(); await executeDocumentAction('propose_add_document', args, initial.context);
  const doc = initial.saved[0].record as unknown as Invoice;
  for (const signed of [
    { ...doc, issuer: { ...doc.issuer, signatureUrl: 'data:image/png;base64,c2lnbg==' } },
    { ...doc, assistantDraft: false }, // The normal app overlays the signature from the current profile.
  ]) {
    const f = fixture([signed]);
    const outcome = await executeDocumentAction('propose_edit_document', { document_id: doc.id, note: 'เปลี่ยนข้อความ' }, f.context);
    assert.equal(outcome.card, undefined);
    assert.equal((outcome.result as any).ok, false);
    assert.match((outcome.result as any).error, /ลายเซ็น/);
    assert.equal(f.saved.length, 0);
  }
});

test('fixed singletons can insert only after their absence was proven by an account snapshot', () => {
  const proposal: Proposal = { id: 'p_test', userId: owner, kind: 'edit_issuer_profile', jobId: 'issuer_profile', record: issuer as unknown as Record<string, unknown>, title: 'profile', changes: [], createdAt: 0 };
  assert.throws(() => proposalBaseVersion(proposal, {}), /Missing proposal version/);
  assert.throws(() => proposalBaseVersion(proposal, {}, ['cashflow_documents:settings']), /Missing proposal version/);
  assert.equal(proposalBaseVersion(proposal, {}, ['cashflow_documents:issuer_profile']), null);
  assert.equal(proposalChanges(proposal, null)[0].version, null);
  assert.equal(proposalBaseVersion(proposal, { 'cashflow_documents:issuer_profile': 9 }, ['cashflow_documents:issuer_profile']), 9);
  assert.throws(() => proposalBaseVersion({ ...proposal, kind: 'edit_document', jobId: 'foreign' }, {}, ['cashflow_invoices:foreign']), /Missing proposal version/);
});

test('party detail, item detail and explicit clearing remain visible in the confirmation review', async () => {
  const f = fixture();
  await executeDocumentAction('propose_add_document', { ...args, issuer: { phone: '' }, client: { name: 'ก', address: 'ที่อยู่ ก', tax_id: '12345', branch: 'สำนักงานใหญ่', contact_name: 'คุณ ก', code: 'C001' }, items: [{ description: 'บริการ', quantity: 1, price: 100, detail: 'ขอบเขตงานที่ตกลง' }] }, f.context);
  const values = f.saved[0].changes.map(change => change.value);
  for (const expected of ['ที่อยู่ ก', '12345', 'สำนักงานใหญ่', 'คุณ ก', 'C001', 'ขอบเขตงานที่ตกลง', 'เว้นว่างตามที่ระบุ']) assert.ok(values.includes(expected), expected);
});

test('confirm is owner-bound, non-replayable and returns the saved document destination', async () => {
  const f = fixture();
  await executeDocumentAction('propose_add_document', args, f.context);
  const proposal = { ...f.saved[0], baseVersion: null } satisfies StoredProposal;
  let status = 'pending'; const writes: any[] = [];
  const db = {
    async claimProposal(userId: string) { if (userId !== owner || status !== 'pending') return null; status = 'applying'; return proposal; },
    async finishProposal(_owner: string, _id: string, value: string) { status = value; },
    async applyChanges(userId: string, changes: unknown[]) { writes.push({ userId, changes }); return true; },
  } as unknown as AssistantDb;
  await assert.rejects(confirmProposal(db, other, proposal.id), errorCode('ai_proposal_gone'));
  assert.equal(writes.length, 0);
  const done = await confirmProposal(db, owner, proposal.id);
  assert.equal(done.documentId, proposal.jobId);
  assert.equal(done.path, `/invoice?type=quotation&document=${proposal.jobId}`);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].userId, owner);
  assert.equal(writes[0].changes[0].table, 'cashflow_invoices');
  await assert.rejects(confirmProposal(db, owner, proposal.id), errorCode('ai_proposal_gone'));
  assert.equal(writes.length, 1);
  const poisoned = { ...db, async claimProposal() { return { ...proposal, userId: other }; } };
  await assert.rejects(confirmProposal(poisoned, owner, proposal.id), errorCode('ai_account_mismatch'));
  assert.equal(writes.length, 1);
});

test('stale or invalid stored proposals never overwrite a record or change their target table', async () => {
  const f = fixture(); await executeDocumentAction('propose_add_document', args, f.context);
  let proposal: StoredProposal = { ...f.saved[0], kind: 'edit_document', baseVersion: 4 };
  let finished = ''; let writes = 0;
  const db = { async claimProposal() { return proposal; }, async finishProposal(_user: string, _id: string, value: string) { finished = value; },
    async applyChanges(_user: string, changes: any[]) { writes++; assert.equal(changes[0].version, 4); return false; } } as unknown as AssistantDb;
  await assert.rejects(confirmProposal(db, owner, proposal.id), errorCode('ai_proposal_stale'));
  assert.equal(finished, 'stale');
  proposal = { ...proposal, kind: 'edit_settings', jobId: 'issuer_profile' };
  await assert.rejects(confirmProposal(db, owner, proposal.id), errorCode('ai_proposal_invalid'));
  assert.equal(writes, 1);
  proposal = { ...proposal, kind: 'drop_database' as any };
  await assert.rejects(confirmProposal(db, owner, proposal.id), errorCode('ai_proposal_invalid'));
  assert.equal(writes, 1);
});

test('new documents enforce quota before apply, return reserved slots on conflict/failure and leave edits uncharged', async () => {
  const f = fixture(); await executeDocumentAction('propose_add_document', args, f.context);
  const changes = proposalChanges(f.saved[0], null);
  let allowed = false, slots: string[] | null = ['slot-10'], applied = true, failure = false;
  let calls = 0, claims = 0, entitlementReads = 0; const released: string[][] = [];
  const deps = {
    async unlimited(userId: string) { assert.equal(userId, owner); entitlementReads++; return allowed; },
    async claim(userId: string, count: number) { assert.equal(userId, owner); assert.equal(count, 1); claims++; return slots; },
    async release(keys: string[]) { released.push(keys); },
    async apply(userId: string) { assert.equal(userId, owner); calls++; if (failure) throw new Error('transaction failed'); return applied; },
  };
  slots = null;
  await assert.rejects(applyWithDocumentQuota(owner, changes, deps), errorCode('document_quota_exceeded'));
  assert.equal(calls, 0);
  slots = ['slot-10']; applied = false;
  assert.equal(await applyWithDocumentQuota(owner, changes, deps), false);
  assert.deepEqual(released, [['slot-10']]);
  failure = true;
  await assert.rejects(applyWithDocumentQuota(owner, changes, deps), /transaction failed/);
  assert.deepEqual(released, [['slot-10'], ['slot-10']]);
  failure = false; applied = true;
  assert.equal(await applyWithDocumentQuota(owner, changes, deps), true);
  assert.equal(released.length, 2, 'successful save retains its document slot');
  const oldClaims = claims, oldReads = entitlementReads;
  assert.equal(await applyWithDocumentQuota(owner, [{ ...changes[0], version: 1 }], deps), true);
  assert.equal(claims, oldClaims); assert.equal(entitlementReads, oldReads);
  allowed = true;
  assert.equal(await applyWithDocumentQuota(owner, changes, deps), true);
  assert.equal(claims, oldClaims, 'Pro and trial use the app entitlement and consume no free-document slot');
  await assert.rejects(applyWithDocumentQuota(owner, changes, { ...deps, async unlimited() { throw new Error('entitlement unavailable'); } }), /entitlement unavailable/);
});
