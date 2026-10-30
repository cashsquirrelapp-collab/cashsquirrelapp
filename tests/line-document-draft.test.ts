import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentCreatedCard, buildDocumentDraftCard, buildLineDocumentRecord, decodeLineDocumentAction, documentIdFor, documentIssuer,
  documentMissing, isActiveDocumentDraft, newDocumentDraft, parseDocumentCommand, parseLineDocumentCreate, DOCUMENT_DRAFT_TTL_MS,
} from '../backend/src/services/lineDocumentDraft';
import { handleAssistantMessage, type LineAssistantDependencies, type UserRow } from '../backend/src/services/lineAssistant';
import { lineEventCommand } from '../backend/src/handlers/line-webhook';
import { createLiffSubmitHandler } from '../backend/src/handlers/liff-submit';
import { validateChanges } from '../shared/validation';

// Quotations and invoices from LINE as cards, with no model call (owner, 2026-10-30): a short request gets an empty
// draft card at once, details typed in one message fill it, the LINE form fills the rest, and สร้างเอกสาร saves it.

const saved = { APP_URL: process.env.APP_URL, LIFF_ID: process.env.LIFF_ID };
process.env.APP_URL = 'https://preview.example.test';
process.env.LIFF_ID = '1234567890-abcdefgh';
after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

const flex = (message: any) => JSON.stringify(message.contents);
const buttons = (message: any) => (JSON.stringify(message.contents.footer).match(/"label":"[^"]+"/g) || []).map(label => label.slice(9, -1));

test('a short request is a document to make; a name alone is still a search', () => {
  for (const text of ['ขอใบเสนอราคาหน่อย', 'สร้างใบเสนอราคาให้หน่อย', 'ทำใบเสนอราคาให้หน่อยครับ', 'ช่วยทำใบเสนอราคาให้หน่อย']) {
    assert.deepEqual(parseLineDocumentCreate(text), { type: 'quotation', client: {}, items: [], vatRate: 0, whtRate: 0 }, text);
  }
  assert.equal(parseLineDocumentCreate('ออกใบแจ้งหนี้')?.type, 'invoice');
  assert.equal(parseLineDocumentCreate('ทำใบวางบิล')?.type, 'invoice');
  for (const text of ['ขอใบเสนอราคา คุณเอ', 'ใบเสนอราคา คุณเอ', 'ขอใบเสนอราคา ล่าสุด', 'ดูใบเสนอราคา', 'ใบแจ้งหนี้', 'เปิดใบเสนอราคา QT-2569-001']) {
    assert.equal(parseLineDocumentCreate(text), null, text);
  }
});

test('details typed in one message fill the draft; what is unsure is left for the form', () => {
  assert.deepEqual(parseLineDocumentCreate('ทำใบเสนอราคาให้ บริษัท แบรนด์เอ ถ่ายรูปสินค้า 20 รูป รูปละ 300'), {
    type: 'quotation', client: { name: 'บริษัท แบรนด์เอ' }, items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }],
    vatRate: 0, whtRate: 0, heard: 'ให้ บริษัท แบรนด์เอ ถ่ายรูปสินค้า 20 รูป รูปละ 300' });
  const job = parseLineDocumentCreate('ทำใบเสนอราคา ถ่ายภาพ ให้ร้านดอกไม้ 12000')!;
  assert.deepEqual([job.client.name, job.items], ['ร้านดอกไม้', [{ description: 'ถ่ายภาพ', quantity: 1, price: 12000 }]]);
  // the competitor's example, word for word
  const paypers = parseLineDocumentCreate('ออกใบแจ้งหนี้ 12 Ngam ยอด 4,000 งานรื้อกะบะปลูก')!;
  assert.deepEqual([paypers.type, paypers.client.name, paypers.items], ['invoice', '12 Ngam', [{ description: 'งานรื้อกะบะปลูก', quantity: 1, price: 4000 }]]);
  const terms = parseLineDocumentCreate('ออกใบแจ้งหนี้ให้คุณบี ตัดต่อวิดีโอ 5 คลิป คลิปละ 1,500 เครดิต 30 วัน หัก 3%')!;
  assert.deepEqual([terms.client.name, terms.items[0], terms.creditTerm, terms.whtRate], ['คุณบี', { description: 'ตัดต่อวิดีโอ', quantity: 5, unit: 'คลิป', price: 1500 }, 30, 3]);
  const vat = parseLineDocumentCreate('ทำใบเสนอราคา บริษัท แบรนด์เอ จำกัด ออกแบบโลโก้ 8,000 บาท +VAT')!;
  assert.deepEqual([vat.client.name, vat.items[0].price, vat.vatRate], ['บริษัท แบรนด์เอ จำกัด', 8000, 7]);
  assert.deepEqual(parseLineDocumentCreate('สร้างใบเสนอราคา ๕๐๐๐')!.items, [{ description: '', quantity: 1, price: 5000 }]); // Thai digits
});

test('the empty card says what is missing and opens the form; nothing can be made yet', () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!);
  const card = buildDocumentDraftCard(stored, { name: 'สตูดิโอตัวอย่าง' }) as any;
  assert.equal(card.type, 'flex');
  assert.match(flex(card), /ยังไม่ได้กรอก/);
  assert.match(flex(card), /สตูดิโอตัวอย่าง/);
  assert.deepEqual(buttons(card), ['กรอกข้อมูล', 'ยกเลิก']);
  assert.match(flex(card), new RegExp(`https://liff.line.me/1234567890-abcdefgh\\?draftKind=document&draftKey=${stored.id}`));
  assert.match(flex(card), new RegExp(`doc:cancel:${stored.id}`));
  assert.doesNotMatch(flex(card), /doc:create/);
  assert.deepEqual(documentMissing(stored.draft, 'สตูดิโอตัวอย่าง'), ['ลูกค้า', 'รายการและราคา']);
  assert.deepEqual(documentMissing(stored.draft, ''), ['ผู้ออกเอกสาร', 'ลูกค้า', 'รายการและราคา']);
});

test('a complete draft offers สร้างเอกสาร first, the form to change it, and the total after taxes', () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ออกใบแจ้งหนี้ให้คุณบี ตัดต่อวิดีโอ 5 คลิป คลิปละ 1,500 เครดิต 30 วัน หัก 3%')!);
  const card = buildDocumentDraftCard(stored, { name: 'สตูดิโอตัวอย่าง' }) as any;
  assert.deepEqual(buttons(card), ['สร้างเอกสาร', 'แก้ไข / กรอกเพิ่ม', 'ยกเลิก']);
  assert.match(flex(card), new RegExp(`doc:create:${stored.id}`));
  assert.match(flex(card), /฿7,275\.00/); // 7,500 less 3% withheld
  assert.match(flex(card), /เครดิต/);
  assert.match(card.altText, /ใบแจ้งหนี้ แบบร่าง ฿7,275\.00/);
});

test('the saved document has the app เลขา draft shape: unsigned, numbered, dated, due after the credit days', () => {
  const draft = parseLineDocumentCreate('ออกใบแจ้งหนี้ให้คุณบี ตัดต่อวิดีโอ 5 คลิป คลิปละ 1,500 เครดิต 30 วัน หัก 3%')!;
  const issuer = documentIssuer({ name: 'สตูดิโอตัวอย่าง', taxId: '1234567890123', signatureUrl: 'data:image/png;base64,AAAA', logoUrl: 'https://x.test/logo.png' });
  const id = documentIdFor('0123456789abcdef');
  const record = buildLineDocumentRecord(draft, issuer, new Date('2026-10-30T08:00:00Z'), id);
  assert.equal(record.id, id);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(documentIdFor('0123456789abcdef'), id, 'the same draft always gives the same document');
  assert.equal(record.assistantDraft, true);
  assert.equal((record.issuer as any).signatureUrl, undefined, 'never the saved signature');
  assert.equal(record.issuer.logoUrl, 'https://x.test/logo.png');
  assert.match(record.documentNo, /^INV-2569-[0-9A-F]{8}$/);
  assert.deepEqual([record.createdDate, record.dueDate, record.paymentTerm, record.whtRate], ['2026-10-30', '2026-11-29', 'เครดิต 30 วัน', 3]);
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_invoices', id: record.id, op: 'set', version: null, data: record as any }]));
  const card = buildDocumentCreatedCard(record) as any;
  assert.match(flex(card), /สร้างใบแจ้งหนี้แล้ว/);
  assert.match(flex(card), new RegExp(record.documentNo));
  assert.match(flex(card), /ดูเอกสาร · ดาวน์โหลด PDF/);
  assert.match(flex(card), /openPath=%2Finvoice%3Ftype%3Dinvoice%26document%3D/);
});

test('buttons come back as the chat commands; drafts expire and belong to one card', () => {
  assert.equal(decodeLineDocumentAction('doc:create:0123456789abcdef'), 'สร้างเอกสาร 0123456789abcdef');
  assert.equal(decodeLineDocumentAction('doc:cancel:0123456789abcdef'), 'ยกเลิกเอกสาร 0123456789abcdef');
  assert.equal(decodeLineDocumentAction('doc:create:nothex'), null);
  assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data: 'doc:create:0123456789abcdef' } } as any), 'สร้างเอกสาร 0123456789abcdef');
  assert.deepEqual(parseDocumentCommand('สร้างเอกสาร 0123456789abcdef'), { action: 'create', key: '0123456789abcdef' });
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!, new Date('2026-10-30T08:00:00Z'));
  const at = Date.parse('2026-10-30T08:00:00Z');
  assert.equal(isActiveDocumentDraft(stored, stored.id, at + 1000), true);
  assert.equal(isActiveDocumentDraft(stored, 'ffffffffffffffff', at + 1000), false);
  assert.equal(isActiveDocumentDraft(stored, stored.id, at + DOCUMENT_DRAFT_TTL_MS), false);
});

const userId = '11111111-1111-4111-8111-111111111111';
function lineDeps(calls: string[], user: UserRow): LineAssistantDependencies {
  return {
    async findUserByLineId() { calls.push('find'); return user; },
    async checkLinkedAccountWriteAccess() { return { allowed: true as const }; },
    async isProUser() { return true; },
    async startDocument(_user, draft) { calls.push(`start:${draft.type}:${draft.client.name ?? ''}`); return { type: 'text', text: 'draft card' }; },
    async documentCommand(_user, command) { calls.push(`command:${command.action}:${command.key}`); return { type: 'text', text: 'done' }; },
    async findLineDocuments() { calls.push('search'); return { documents: [], hasMore: false }; },
    async assistantAnswer() { calls.push('ai'); return { messages: [{ type: 'text', text: 'ai' }], text: 'ai' }; },
  };
}

test('in LINE a document request never reaches the AI, and a search still searches', async () => {
  const user: UserRow = { user_id: userId, jobs: [], goals: [], settings: {}, expenses: [], statuses: [], notif_settings: {} };
  for (const [message, expected] of [
    ['ขอใบเสนอราคาหน่อย', 'start:quotation:'],
    ['ออกใบแจ้งหนี้ 12 Ngam ยอด 4,000 งานรื้อกะบะปลูก', 'start:invoice:12 Ngam'],
    ['สร้างเอกสาร 0123456789abcdef', 'command:create:0123456789abcdef'],
    ['ยกเลิกเอกสาร 0123456789abcdef', 'command:cancel:0123456789abcdef'],
    ['ขอใบเสนอราคา คุณเอ', 'search'],
  ] as const) {
    const calls: string[] = [];
    await handleAssistantMessage('Uline', message, `op-${message}`, lineDeps(calls, { ...user }));
    assert.ok(calls.includes(expected), `${message}: ${calls.join(', ')}`);
    assert.ok(!calls.includes('ai'), `${message} must not call the AI`);
  }
});

// The LINE form's server side (draftKind document).
function response() {
  const state = { status: 200, body: null as any };
  const res = { setHeader() {}, status(status: number) { state.status = status; return res; }, json(body: unknown) { state.body = body; return res; } };
  return { res: res as any, state };
}
const requestId = '22222222-2222-4222-8222-222222222222';
function formHandler(stored: any, account: { name: string }, calls: Record<string, any[]>, saveResult: boolean | Error = true) {
  return createLiffSubmitHandler({
    verifyLiffIdToken: async () => 'U-line-user',
    findUserByLineId: async () => ({ user_id: userId, jobs: [], goals: [], settings: {}, expenses: [], statuses: [], notif_settings: { pendingDocumentDraft: stored } }) as any,
    checkLinkedAccountWriteAccess: async () => ({ allowed: true as const }),
    rateLimit: async () => undefined,
    isProUser: async () => true,
    sendLineMessagePayload: async (_to: string, message: any) => { (calls.sent ||= []).push(message); return true; },
    loadDocumentAccount: async () => ({ issuer: documentIssuer(account), issuerVersion: 4 }),
    saveLineDocument: async (_owner: string, record: any, issuer: any) => { (calls.saved ||= []).push({ record, issuer }); if (saveResult instanceof Error) throw saveResult; return saveResult; },
    clearDocumentDraft: async () => { (calls.cleared ||= []).push(true); },
  } as any);
}
const form = { type: 'quotation', client: { name: 'บริษัท แบรนด์เอ', address: '', taxId: '', branch: '', phone: '' },
  items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }], vatRate: 0, whtRate: 0, creditTerm: 30, note: '' };

test('the form loads the current draft with the saved issuer, and an old card is refused', async () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!);
  const calls: Record<string, any[]> = {};
  const { res, state } = response();
  await formHandler(stored, { name: 'สตูดิโอตัวอย่าง' }, calls)({ method: 'POST', body: { idToken: 't', action: 'load-draft', draftKind: 'document', draftKey: stored.id } } as any, res);
  assert.equal(state.status, 200);
  assert.deepEqual([state.body.kind, state.body.draft.type, state.body.issuer.name], ['document', 'quotation', 'สตูดิโอตัวอย่าง']);
  const old = response();
  await formHandler(stored, { name: 'สตูดิโอตัวอย่าง' }, calls)({ method: 'POST', body: { idToken: 't', action: 'load-draft', draftKind: 'document', draftKey: 'ffffffffffffffff' } } as any, old.res);
  assert.equal(old.state.status, 409);
});

test('the form saves one document for its draft, clears the draft, and sends the created card', async () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!);
  const calls: Record<string, any[]> = {};
  const { res, state } = response();
  await formHandler(stored, { name: 'สตูดิโอตัวอย่าง' }, calls)({ method: 'POST', body: { idToken: 't', action: 'confirm-draft', draftKind: 'document', draftKey: stored.id, requestId, document: form } } as any, res);
  assert.equal(state.status, 200, JSON.stringify(state.body));
  assert.equal(state.body.ok, true);
  assert.match(state.body.documentNo, /^QT-\d{4}-[0-9A-F]{8}$/);
  const { record, issuer } = calls.saved[0];
  assert.equal(record.id, documentIdFor(stored.id));
  assert.deepEqual([record.client.name, record.items[0].quantity, record.items[0].price, record.paymentTerm], ['บริษัท แบรนด์เอ', 20, 300, 'เครดิต 30 วัน']);
  assert.equal(issuer, undefined, 'the saved issuer is kept as it is');
  assert.equal(calls.cleared.length, 1);
  assert.match(JSON.stringify(calls.sent[0].contents), /สร้างใบเสนอราคาแล้ว/);
});

test('with no saved issuer the form must name the user’s business, and it is kept for the next document', async () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!);
  const missing = response();
  await formHandler(stored, { name: '' }, {})({ method: 'POST', body: { idToken: 't', action: 'confirm-draft', draftKind: 'document', draftKey: stored.id, requestId, document: form } } as any, missing.res);
  assert.equal(missing.state.status, 400);
  const calls: Record<string, any[]> = {};
  const { res, state } = response();
  await formHandler(stored, { name: '' }, calls)({ method: 'POST', body: { idToken: 't', action: 'confirm-draft', draftKind: 'document', draftKey: stored.id, requestId,
    document: { ...form, issuer: { name: 'สตูดิโอใหม่', address: 'กรุงเทพฯ', taxId: '', phone: '' } } } } as any, res);
  assert.equal(state.status, 200);
  assert.equal(calls.saved[0].record.issuer.name, 'สตูดิโอใหม่');
  assert.deepEqual([calls.saved[0].issuer.profile.name, calls.saved[0].issuer.version], ['สตูดิโอใหม่', 4]);
});

test('the form refuses bad values, a changed type, and reports the Free plan limit as the app does', async () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!);
  for (const document of [{ ...form, items: [] }, { ...form, items: [{ ...form.items[0], price: 0 }] }, { ...form, vatRate: 10 }, { ...form, client: { ...form.client, name: '' } }, { ...form, type: 'invoice' }]) {
    const { res, state } = response();
    await formHandler(stored, { name: 'สตูดิโอตัวอย่าง' }, {})({ method: 'POST', body: { idToken: 't', action: 'confirm-draft', draftKind: 'document', draftKey: stored.id, requestId, document } } as any, res);
    assert.equal(state.status, 400, JSON.stringify(document));
  }
  const quota = Object.assign(new Error('ใช้สิทธิ์ออกเอกสารฟรีครบ 10 ใบในเดือนนี้แล้ว'), { status: 402 });
  const { res, state } = response();
  await formHandler(stored, { name: 'สตูดิโอตัวอย่าง' }, {}, quota)({ method: 'POST', body: { idToken: 't', action: 'confirm-draft', draftKind: 'document', draftKey: stored.id, requestId, document: form } } as any, res);
  assert.deepEqual([state.status, state.body.error], [402, quota.message]);
  const twice = response();
  await formHandler(stored, { name: 'สตูดิโอตัวอย่าง' }, {}, false)({ method: 'POST', body: { idToken: 't', action: 'confirm-draft', draftKind: 'document', draftKey: stored.id, requestId, document: form } } as any, twice.res);
  assert.deepEqual([twice.state.status, twice.state.body.duplicate], [200, true]);
});
