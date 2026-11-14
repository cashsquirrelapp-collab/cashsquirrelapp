import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { SheetMap, SheetMapTab } from '../shared/googleSheets';
import type { RowCell } from '../shared/sheetRow';

// ยอดสุทธิ → ยอดก่อนหัก (owner's plan for the customer's formulas: "ลูกค้าพิมพ์ในแชทว่า ได้โอนมา 9,700 แต่ชีตเขากรอกค่าจ้าง
// ก่อนหัก → เลขาคิดย้อนให้ว่าค่าจ้างคือ 10,000 แล้วถามก่อน"; built 2026-11-15). The figure comes from the sheet's own
// formula, worked out by the fixed reader and checked both ways; nothing is offered when the app already withholds, for an
// installment plan, or for a formula that is not simply a share of the amount.

process.env.APP_URL = 'https://staging.krarok.com';
process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret-not-real';
process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64');

const { grossOffer, planRow, previewOf } = await import('../backend/src/services/sheetWrite');
type SheetOps = import('../backend/src/services/googleSheets').SheetOps;

const cell = (index: number, header: string, target: string, value: string | number | null, formula = false): RowCell => ({ index, header, target, formula, value });
const ROW = 5;
// D ค่าจ้าง (typed), F หัก 3% (formula), G โอนจริง (formula).
const cells = (amount: number) => [cell(2, 'งาน', 'name', 'ตัดต่อคลิป'), cell(3, 'ค่าจ้าง', 'value', amount), cell(5, 'หัก 3%', 'whtAmount', null, true), cell(6, 'โอนจริง', 'keep', null, true)];
const offer = (formulas: Record<number, string>, record: Record<string, unknown> = {}, amount = 9700, list = cells(amount)) =>
  grossOffer({ cells: list, formulas, row: ROW, typed: { 3: amount }, record: { value: amount, whtRate: 0, ...record } });

test('ยอดก่อนหัก: 9,700 that came in after the sheet\'s 3% is 10,000 before it; the sheet then shows 9,700 transferred', () => {
  const got = offer({ 5: '=D5*3%', 6: '=D5-F5' });
  assert.deepEqual(got, { value: 10000, rate: 3, wht: 300, net: 9700, valueIndex: 3, valueHeader: 'ค่าจ้าง',
    netColumn: { index: 6, header: 'โอนจริง', sheet: 9700 }, whtColumn: { index: 5, header: 'หัก 3%', sheet: 300 } });
  // An amount that does not divide evenly: the app's own withholding of it leaves exactly what was typed.
  const odd = offer({ 5: '=D5*3%', 6: '=D5-F5' }, {}, 3000)!;
  assert.equal(odd.value, 3092.78);
  assert.equal(Math.round((odd.value - odd.wht) * 100) / 100, 3000);
});

test('ยอดก่อนหัก: a sheet with only a "transferred" column (97% of the amount) is read the same; a 1% rate too', () => {
  const list = [cell(3, 'ค่าจ้าง', 'value', 9900), cell(6, 'โอนจริง', 'keep', null, true)];
  const got = offer({ 6: '=ROUND(D5*0.99,2)' }, {}, 9900, list);
  assert.equal(got?.value, 10000);
  assert.equal(got?.rate, 1);
  assert.equal(got?.netColumn?.sheet, 9900);
});

test('ยอดก่อนหัก: nothing is offered when the app withholds already, for installments, or when the formula is not a plain share', () => {
  const formulas = { 5: '=D5*3%', 6: '=D5-F5' };
  assert.equal(offer(formulas, { whtRate: 3 }), null, 'the app already withholds');
  assert.equal(offer(formulas, { installments: [{ amount: 5000 }] }), null, 'an installment plan is changed in the app');
  assert.equal(offer({ 5: '=D5*3%+10', 6: '=D5-F5' }), null, 'a fixed part');
  assert.equal(offer({ 6: '=D5' }), null, 'the sheet withholds nothing');
  assert.equal(offer({ 5: '=D5/30', 6: '=D5-F5' }), null, 'a rate the app cannot keep (3.333…%)');
  assert.equal(offer({ 5: "=VLOOKUP(B5,'ลูกค้า'!A:C,3,FALSE)*D5" }), null, 'a formula the reader cannot follow');
  // "3% from 1,000 up": the probes pass, but 515.46 is under the threshold, so the sheet would not withhold: nothing offered.
  assert.equal(offer({ 5: '=IF(D5>=1000,D5*3%,0)', 6: '=D5-F5' }, {}, 500), null);
  assert.equal(offer({ 5: '=IF(D5>=1000,D5*3%,0)', 6: '=D5-F5' })?.value, 10000, 'above the threshold it holds');
});

const INCOME: SheetMapTab = { name: 'รายรับ', headerRow: 0, kind: 'jobs', use: true, columns: [
  { index: 0, header: 'วันที่โอน', target: 'paidDate' }, { index: 1, header: 'ลูกค้า', target: 'client' }, { index: 2, header: 'งาน', target: 'name' },
  { index: 3, header: 'ค่าจ้าง', target: 'value' }, { index: 4, header: 'หัก 3%', target: 'whtAmount', formula: true }, { index: 5, header: 'โอนจริง', target: 'keep', formula: true },
] };
const MAP: SheetMap = { fileId: 'file-12345678', at: '2026-11-14T03:00:00.000Z', tabs: [INCOME] };

test('ยอดก่อนหัก on the card: the preview offers 10,000 shown the way the column shows money, and the edit it makes', async () => {
  const sheet = [['วันที่โอน', 'ลูกค้า', 'งาน', 'ค่าจ้าง', 'หัก 3%', 'โอนจริง'], ['2/11/2569', 'บริษัท ก', 'ถ่ายภาพ', '20,000.00', '600.00', '19,400.00']];
  const ops = {
    async lastRow() { return 2; },
    async readRows() { return sheet.slice(1, 2); },
    async formulaColumns(_tab: string, row: number, columns: number[]) { return new Set(row === 2 ? columns : []); },
    async formulaTexts(_tab: string, row: number, columns: number[]) { return row === 2 ? Object.fromEntries(columns.map(column => [column, column === 4 ? '=D2*3%' : '=D2-E2'])) : {}; },
    async write() { return []; }, async copyFormulas() { return []; }, async clear() {}, async tabId() { return 0; },
  } as unknown as SheetOps;
  const job = { name: 'ตัดต่อคลิป', client: 'บริษัท ข', value: 9700, received: 9700, pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-11-14', whtRate: 0 };
  const plan = (await planRow(ops, MAP, 'job', job))!;
  const preview = previewOf(plan, { name: 'งานลูกค้า 2569', url: 'x' });
  assert.deepEqual(preview.gross, { value: 10000, rate: 3, valueText: '10,000.00', netText: '9,700.00', whtText: '300.00', valueHeader: 'ค่าจ้าง', netHeader: 'โอนจริง', sheetNet: '9,700.00' });
  // The app's own record with 3% withheld: nothing more to offer.
  const withheld = (await planRow(ops, MAP, 'job', { ...job, value: 10000, whtRate: 3 }))!;
  assert.equal(previewOf(withheld, { name: 'งานลูกค้า 2569', url: 'x' }).gross, undefined);
  // An expense is never offered this.
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../backend/src/services/sheetWrite.ts', import.meta.url), 'utf8'), /if \(kind === 'job'\) gross = grossOffer/);
});
