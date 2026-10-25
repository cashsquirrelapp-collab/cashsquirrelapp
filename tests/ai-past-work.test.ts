import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox, toolsFor } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import { clientCore, executePastWork } from '../backend/src/ai/pastWork';
import { buildSystemPrompt } from '../backend/src/ai/prompt';

// Package C (owner, 2026-10-25: "ทำชุด C ต่อเลย"): work done before for the same client is the starting point for a new
// quotation, invoice or job: the saved client details, the usual VAT, withholding and credit term, the usual lines.
// It comes from the account's own records (work done without เลขา counts too); amounts are examples, payment status is
// never part of it. Synthetic data only.

const doc = (no: string, date: string, items: { description: string; quantity: number; price: number; unit?: string }[], extra: Record<string, unknown> = {}) => ({
  id: `d-${no}`, documentType: 'quotation', documentNo: no, createdDate: date, issuer: { name: 'ผู้ออกตัวอย่าง' },
  client: { name: 'บริษัท ตัวอย่าง มีเดีย จำกัด', address: '1 ถนนตัวอย่าง กรุงเทพฯ 10110', phone: '', email: '', taxId: '0000000000000', branch: 'สำนักงานใหญ่' },
  items: items.map((item, index) => ({ id: `i${index}`, ...item })), vatRate: 7, whtRate: 3, paymentTerm: 'ชำระภายใน 30 วัน', paidAmount: 9999, paidDate: '2026-09-30', ...extra });
const user = {
  user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {},
  invoices: [
    doc('QT-2569-001', '2026-08-01', [{ description: 'งานตัดต่อวิดีโอ', quantity: 4, price: 1500, unit: 'คลิป' }, { description: 'แก้ไข Draft', quantity: 1, price: 100 }]),
    doc('QT-2569-007', '2026-10-01', [{ description: 'งานตัดต่อวิดีโอ', quantity: 5, price: 1700, unit: 'คลิป' }]),
    { ...doc('QT-2569-008', '2026-10-05', [{ description: 'ออกแบบโลโก้', quantity: 1, price: 3000 }]), client: { name: 'ร้านอื่น', address: '', phone: '', email: '', taxId: '' } },
  ],
  jobs: [
    { id: 'j1', name: 'ตัดต่อคลิป ต.ค.', client: 'บจก. ตัวอย่าง มีเดีย', value: 8500, whtRate: 3, creditTerm: 30, type: 'ตัดต่อ', postDate: '2026-10-10', paymentStatus: 'paid', received: 8245 },
  ],
} as any;

test('past work for a client: saved details, the usual rates and terms, the usual lines with the latest unit price', () => {
  const result = executePastWork({ client: 'ตัวอย่างมีเดีย' }, user).result as any;
  assert.equal(result.found, true);
  assert.deepEqual(result.counts, { documents: 2, jobs: 1 });
  assert.deepEqual(result.names_in_records, ['บริษัท ตัวอย่าง มีเดีย จำกัด', 'บจก. ตัวอย่าง มีเดีย']);
  assert.deepEqual(result.client_details, { name: 'บริษัท ตัวอย่าง มีเดีย จำกัด', address: '1 ถนนตัวอย่าง กรุงเทพฯ 10110', tax_id: '0000000000000', branch: 'สำนักงานใหญ่', contact_name: null, phone: null });
  assert.deepEqual([result.usual.vat_rate, result.usual.withholding_rate, result.usual.credit_term_days, result.usual.payment_term], [7, 3, 30, 'ชำระภายใน 30 วัน']);
  assert.deepEqual(result.usual.lines, [
    { description: 'งานตัดต่อวิดีโอ', unit: 'คลิป', last_unit_price: 1700, times: 2 },
    { description: 'แก้ไข Draft', unit: null, last_unit_price: 100, times: 1 },
  ], 'the latest price, from the newest document');
  assert.equal(result.recent_documents[0].number, 'QT-2569-007', 'newest first');
  assert.match(result.note, /never as a fact/);
  // Payment is never part of it.
  const text = JSON.stringify(result);
  for (const word of ['paidAmount', 'paid_date', 'paidDate', 'received', 'paymentStatus', '9999', '8245']) assert.equal(text.includes(word), false, word);
  assert.equal(text.includes('ร้านอื่น'), false, 'another client never comes along');
});

test('names match by their core (บจก. / บริษัท … จำกัด, spaces); an unknown client says so; too short is refused', () => {
  assert.equal(clientCore('บริษัท ตัวอย่าง มีเดีย จำกัด'), clientCore('บจก. ตัวอย่าง มีเดีย'));
  assert.equal(clientCore('Example Media Co., Ltd.'), clientCore('example media'));
  const none = executePastWork({ client: 'ลูกค้าใหม่เอี่ยม' }, user).result as any;
  assert.deepEqual([none.ok, none.found], [true, false]);
  assert.match(none.note, /offer no past values/);
  assert.equal((executePastWork({ client: 'ก' }, user).result as any).ok, false);
});

test('the tool is offered in chat and action, reads only the signed-in account, and the rules say how to use it', async () => {
  for (const route of ['chat', 'action'] as const) assert.ok(toolsFor(route).some(tool => tool.name === 'past_work'), route);
  const outcome = await createToolbox({ user, ...memoryStores() })({ id: 'p', name: 'past_work', args: { client: 'ตัวอย่าง มีเดีย' } });
  assert.equal((outcome.result as any).counts.documents, 2);
  const refused = await createToolbox({ user, ...memoryStores() })({ id: 'p', name: 'past_work', args: { client: 'x', user_id: 'someone-else' } });
  assert.equal((refused.result as any).ok, false, 'no other account can be named');
  const prompt = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: '25 ต.ค. 2569 10:00' } as any);
  for (const rule of ['call past_work for that client', 'offer a past unit price as an option', 'Past\n  amounts and payment status are history']) assert.ok(prompt.includes(rule), rule);
});

// 2026-10-25 real-model test: "ร้านกาแฟตัวอย่าง" took the address and 3% withholding of "บริษัท ตัวอย่าง จำกัด".
test('a longer, more specific name never takes another client\'s records; a partial name of two clients asks which one', () => {
  const two = {
    ...user,
    invoices: [{ ...doc('QT-2569-010', '2026-10-02', [{ description: 'ออกแบบเว็บไซต์', quantity: 1, price: 30000 }]),
      client: { name: 'บริษัท ตัวอย่าง จำกัด', address: '1 ถนนตัวอย่าง กรุงเทพฯ 10110', phone: '', email: '', taxId: '1111111111111' } }],
    jobs: [{ id: 'j2', name: 'แบนเนอร์', client: 'ร้านกาแฟตัวอย่าง', value: 3500, whtRate: 0, creditTerm: 0, postDate: '2026-10-01' },
      { id: 'j3', name: 'ป้ายร้าน', client: 'ร้านอาหารตัวอย่าง', value: 2000, whtRate: 0, creditTerm: 0, postDate: '2026-09-01' }],
  } as any;
  const cafe = executePastWork({ client: 'ร้านกาแฟตัวอย่าง' }, two).result as any;
  assert.equal(cafe.client_details, null, 'no other client\'s address or tax ID');
  assert.deepEqual([cafe.usual.withholding_rate, cafe.names_in_records], [0, ['ร้านกาแฟตัวอย่าง']]);
  // The exact name wins over names that only contain it.
  const company = executePastWork({ client: 'ตัวอย่าง' }, two).result as any;
  assert.deepEqual([company.found, company.names_in_records, company.client_details.tax_id], [true, ['บริษัท ตัวอย่าง จำกัด'], '1111111111111']);
  // A partial name that fits two different clients: ask, offer nothing.
  const shop = executePastWork({ client: 'ร้าน' }, { ...two, invoices: [] }).result as any;
  assert.deepEqual([shop.found, shop.several_clients.sort()], [false, ['ร้านกาแฟตัวอย่าง', 'ร้านอาหารตัวอย่าง']]);
  // A partial name of one client still finds it.
  const partial = executePastWork({ client: 'กาแฟตัวอย่าง' }, two).result as any;
  assert.deepEqual([partial.found, partial.names_in_records], [true, ['ร้านกาแฟตัวอย่าง']]);
});
