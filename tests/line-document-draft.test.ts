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
  // สร้างเอกสาร opens the form to create at once, so the page can be sent as a picture too
  assert.match(flex(card), new RegExp(`draftKind=document&draftKey=${stored.id}&create=1`));
  const liff = process.env.LIFF_ID; delete process.env.LIFF_ID;
  try { assert.match(flex(buildDocumentDraftCard(stored, { name: 'สตูดิโอตัวอย่าง' })), new RegExp(`doc:create:${stored.id}`)); } // no form: a postback
  finally { process.env.LIFF_ID = liff; }
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
function formHandler(stored: any, account: { name: string }, calls: Record<string, any[]>, saveResult: boolean | Error = true, owned = true) {
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
    ownDocumentSummary: async (_owner: string, id: string) => { (calls.owned ||= []).push(id); return owned ? { documentNo: 'QT-2569-ABCDEF12' } : null; },
    storeDocumentImage: async (_owner: string, id: string, bytes: Uint8Array) => { (calls.stored ||= []).push({ id, size: bytes.length }); return `https://storage.example.test/${id}.jpg?token=x`; },
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
  assert.equal(state.body.document.id, record.id, 'the saved document goes back to be drawn as a picture');
});

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString('base64');
test('the picture of the new document goes into the chat, only for this draft’s own document and only as a real JPEG', async () => {
  const key = '0123456789abcdef';
  const calls: Record<string, any[]> = {};
  const { res, state } = response();
  await formHandler(undefined, { name: 'สตูดิโอตัวอย่าง' }, calls)({ method: 'POST', body: { idToken: 't', action: 'document-image', draftKind: 'document', draftKey: key, image: jpeg } } as any, res);
  assert.deepEqual([state.status, state.body.imageSent], [200, true], JSON.stringify(state.body));
  assert.deepEqual(calls.owned, [documentIdFor(key)]);
  assert.equal(calls.stored[0].id, documentIdFor(key));
  assert.deepEqual(calls.sent[0], { type: 'image', originalContentUrl: `https://storage.example.test/${documentIdFor(key)}.jpg?token=x`, previewImageUrl: `https://storage.example.test/${documentIdFor(key)}.jpg?token=x` });
  for (const image of ['not-base64!', Buffer.from('GIF89a' + 'x'.repeat(200)).toString('base64'), Buffer.alloc(1_100_000, 0xff).toString('base64')]) {
    const bad = response();
    await formHandler(undefined, { name: 'x' }, {})({ method: 'POST', body: { idToken: 't', action: 'document-image', draftKind: 'document', draftKey: key, image } } as any, bad.res);
    assert.equal(bad.state.status, 400);
  }
  const other = response();
  await formHandler(undefined, { name: 'x' }, {}, true, false)({ method: 'POST', body: { idToken: 't', action: 'document-image', draftKind: 'document', draftKey: key, image: jpeg } } as any, other.res);
  assert.equal(other.state.status, 404, 'not this account’s document');
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

// Jobs in LINE (owner, 2026-10-30): a card every time, even when everything is there; nothing missing is asked as a
// question (the card's form takes it); details typed afterwards fill the draft.
import { parseLineJobRequest, parseLineQuickDraft } from '../backend/src/services/lineQuickDraft';
import { applyDocumentFollowUp, splitClientWork } from '../backend/src/services/lineDocumentDraft';

test('a job in everyday words becomes a draft; several jobs or a date stay with เลขา', () => {
  assert.deepEqual(parseLineJobRequest('บันทึกงาน ถ่ายรูปให้ร้านบี 8,000 เครดิต 30 วัน หัก 3%'),
    { intent: 'add_job', freshDraft: true, jobCreditTerm: 30, jobWhtRate: 3, jobValue: 8000, jobName: 'ถ่ายรูป', jobClient: 'ร้านบี' });
  assert.deepEqual(parseLineJobRequest('รับงาน ออกแบบโลโก้ 5 ชิ้น ชิ้นละ 1,500 ยังไม่ได้รับเงิน'),
    { intent: 'add_job', freshDraft: true, jobPaymentStatus: 'pending', jobValue: 7500, jobName: 'ออกแบบโลโก้ 5 ชิ้น' });
  assert.deepEqual(parseLineJobRequest('จดงาน รีวิวสินค้า บริษัท แบรนด์เอ ยอด 5,000 รับเงินแล้ว'),
    { intent: 'add_job', freshDraft: true, jobPaymentStatus: 'paid', jobValue: 5000, jobName: 'รีวิวสินค้า', jobClient: 'บริษัท แบรนด์เอ' });
  assert.deepEqual(parseLineJobRequest('ได้งาน ตัดต่อ ให้คุณเอ 6000 มัดจำ 2000'),
    { intent: 'add_job', freshDraft: true, jobReceivedAmount: 2000, jobValue: 6000, jobPaymentStatus: 'partial', jobName: 'ตัดต่อ', jobClient: 'คุณเอ' });
  assert.deepEqual(parseLineJobRequest('มีงานใหม่ ตัดต่อวิดีโอ ให้คุณบี'), { intent: 'add_job', freshDraft: true, jobName: 'ตัดต่อวิดีโอ', jobClient: 'คุณบี' });
  assert.deepEqual(parseLineQuickDraft('บันทึกงานหน่อย'), { intent: 'add_job', freshDraft: true }, 'a bare request is the empty card, not a job named หน่อย');
  for (const text of ['บันทึกงาน รีวิว 2 งาน งานละ 5,000', 'บันทึกงาน รีวิวพรุ่งนี้ 5000', 'มีงานไหม', 'วันนี้มีอะไรบ้าง']) assert.equal(parseLineJobRequest(text), null, text);
  assert.deepEqual(splitClientWork('ให้คำปรึกษาการตลาด'), { client: '', work: 'ให้คำปรึกษาการตลาด' }, 'ให้ inside a word is not a client');
});

test('details typed after the job card fill its draft', () => {
  const pendingJob = { name: 'ถ่ายรูป', value: 8000 } as any;
  assert.deepEqual(parseLineQuickDraft('เครดิต 30 วัน', { pendingJob }), { intent: 'add_job', jobCreditTerm: 30, freshDraft: false });
  assert.deepEqual(parseLineQuickDraft('หัก 3%', { pendingJob }), { intent: 'add_job', jobWhtRate: 3, freshDraft: false });
  assert.deepEqual(parseLineQuickDraft('ให้ร้านบี', { pendingJob }), { intent: 'add_job', jobClient: 'ร้านบี', freshDraft: false });
  assert.deepEqual(parseLineQuickDraft('มัดจำ 2000', { pendingJob }), { intent: 'add_job', jobPaymentStatus: 'partial', jobReceivedAmount: 2000, freshDraft: false });
  assert.equal(parseLineQuickDraft('มัดจำ 9000', { pendingJob }), null, 'a deposit over the value is unclear');
  assert.deepEqual(parseLineQuickDraft('ยอด 6000 ยังไม่ได้รับเงิน', { pendingJob: { name: 'ตัดต่อวิดีโอ' } as any }),
    { intent: 'add_job', jobValue: 6000, jobPaymentStatus: 'pending', freshDraft: false });
  assert.equal(parseLineQuickDraft('เครดิต 30 วัน'), null, 'with no job open, credit words stay away from new records');
});

test('details typed after the document card fill the draft; other messages are left alone', () => {
  let draft = parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!;
  for (const text of ['ลูกค้า บริษัท แบรนด์เอ จำกัด', 'ที่อยู่ 88 ถนนพระราม 9 กรุงเทพฯ', 'เลขผู้เสียภาษี 0105-56123-4567', 'รายการ ถ่ายรูปสินค้า 20 รูป รูปละ 300', 'รายการ รีทัช 1000', 'VAT', 'หัก 3%', 'เครดิต 30 วัน']) {
    const next = applyDocumentFollowUp(draft, text);
    assert.ok(next, text); draft = next!;
  }
  assert.deepEqual(draft, { type: 'quotation', vatRate: 7, whtRate: 3, creditTerm: 30,
    client: { name: 'บริษัท แบรนด์เอ จำกัด', address: '88 ถนนพระราม 9 กรุงเทพฯ', taxId: '0105561234567' },
    items: [{ description: 'ถ่ายรูปสินค้า', quantity: 20, unit: 'รูป', price: 300 }, { description: 'รีทัช', quantity: 1, price: 1000 }] });
  assert.equal(applyDocumentFollowUp(draft, 'สวัสดีครับ'), null);
  assert.equal(applyDocumentFollowUp(draft, 'ยอด 500'), null, 'every line has a price already: unclear');
  const priced = applyDocumentFollowUp(parseLineDocumentCreate('ทำใบเสนอราคา ออกแบบโลโก้ ให้คุณบี')!, 'ยอด 8000')!;
  assert.equal(priced.items[0].price, 8000, 'an amount alone prices the one open line');
});

test('in LINE a typed detail goes to the newest draft card; a job request gets its card, not the AI', async () => {
  const stored = newDocumentDraft(parseLineDocumentCreate('ขอใบเสนอราคาหน่อย')!, new Date(Date.now() - 60_000));
  const user: UserRow = { user_id: userId, jobs: [], goals: [], settings: {}, expenses: [], statuses: [], notif_settings: { pendingDocumentDraft: stored } };
  const calls: string[] = [];
  const deps = { ...lineDeps(calls, user), async updateDocument(_user: UserRow, _stored: any, draft: any) { calls.push(`update:${draft.client.name}`); return { type: 'text' as const, text: 'card' }; } };
  await handleAssistantMessage('Uline', 'ลูกค้า ร้านบี', 'op-doc-follow', deps);
  assert.deepEqual(calls.filter(call => call.startsWith('update') || call === 'ai'), ['update:ร้านบี']);
  // a job draft started after the document takes the typed details instead
  const later = { ...user, notif_settings: { pendingDocumentDraft: stored, pendingJobDraft: { createdAt: new Date(Date.now() - 1000).toISOString(), draft: { name: 'ถ่ายรูป', value: 8000 } } } } as UserRow;
  const jobCalls: string[] = [];
  await handleAssistantMessage('Uline', 'ลูกค้า ร้านบี', 'op-job-follow', { ...lineDeps(jobCalls, later), async updateDocument() { jobCalls.push('update'); return { type: 'text' as const, text: 'card' }; },
    async saveJobDraft(u: UserRow, draft: any) { jobCalls.push(`job:${draft.client}`); u.notif_settings = { ...u.notif_settings, pendingJobDraft: { createdAt: new Date().toISOString(), draft } }; } } as any);
  assert.ok(jobCalls.includes('job:ร้านบี') && !jobCalls.includes('update'), jobCalls.join(', '));
  const aiCalls: string[] = [];
  await handleAssistantMessage('Uline', 'บันทึกงาน ถ่ายรูปให้ร้านบี 8,000 เครดิต 30 วัน', 'op-job', { ...lineDeps(aiCalls, { ...user, notif_settings: {} }),
    async saveJobDraft(u: UserRow, draft: any) { aiCalls.push(`job:${draft.name}:${draft.client}:${draft.value}:${draft.creditTerm}`); u.notif_settings = { ...u.notif_settings, pendingJobDraft: { createdAt: new Date().toISOString(), draft } }; } } as any);
  assert.ok(aiCalls.includes('job:ถ่ายรูป:ร้านบี:8000:30') && !aiCalls.includes('ai'), aiCalls.join(', '));
});
