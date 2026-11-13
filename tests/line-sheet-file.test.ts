import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx } from '../shared/xlsxWriter';
import { decodeSheetText, parseCsv, readXlsxTabs, SheetFileError, sheetFileKind, spreadsheetText } from '../shared/sheetFileText';

// A spreadsheet sent in the LINE chat (owner, 2026-11-13: "รับไฟล์ Excel ทางแชท"): read on the server into the same text the
// app's chat makes on the device (masked, column totals), then เลขา prepares cards; a long file goes to the app's import.

Object.assign(process.env, { SUPABASE_URL: 'https://linesheet.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin', APP_URL: 'https://staging.krarok.com', LIFF_ID: 'LIFF-1' });
const { handleLineFileMessage, LINE_SHEET_REQUEST, LINE_SHEET_ROWS } = await import('../backend/src/services/lineVaultChat');

const USER = '00000000-0000-4000-8000-000000000042';
const book = (rows: number) => Buffer.from(buildXlsx([
  { name: 'รายจ่าย', rows: [['วันที่', 'รายการ', 'ผู้ขาย', 'เบอร์โทร', 'ยอดเงิน'],
    ...Array.from({ length: rows }, (_, i) => [{ date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }, `ค่ากาแฟ ${i + 1}`, 'ร้านกาแฟ', '081-234-5678', 60 + i]),
    ['รวม', '', '', '', 9999]] },
  { name: 'ว่าง', rows: [] },
]));

test('the reader: tabs, dates as YYYY-MM-DD, numbers, shared and inline strings; phones masked; totals leave out the รวม row', () => {
  const tabs = readXlsxTabs(new Uint8Array(book(3)));
  assert.deepEqual(tabs.map(tab => tab.name), ['รายจ่าย', 'ว่าง']);
  assert.deepEqual(tabs[0].rows[1], ['2026-10-01', 'ค่ากาแฟ 1', 'ร้านกาแฟ', '081-234-5678', '60']);
  const read = spreadsheetText('ค่าใช้จ่าย.xlsx', new Uint8Array(book(3)));
  assert.equal(read.tabs, 1, 'the empty tab is left out');
  assert.equal(read.dataRows, 4);
  assert.match(read.text, /^ไฟล์ "ค่าใช้จ่าย.xlsx" \(Excel ที่ส่งมาในแชท LINE อ่านออกมาเป็นข้อความ\)\nแท็บ "รายจ่าย" · 5 แถว\nวันที่,รายการ,ผู้ขาย,เบอร์โทร,ยอดเงิน\n2026-10-01,ค่ากาแฟ 1,ร้านกาแฟ,/);
  assert.ok(!read.text.includes('081-234-5678'), 'a phone number never goes on');
  assert.match(read.text, /ยอดเงิน = 183 \(3 แถว\)/, '60 + 61 + 62, without the รวม row');
});

test('CSV: quotes, line breaks in a cell, tabs or semicolons, and the Thai Windows encoding older programs save', () => {
  assert.deepEqual(parseCsv('วันที่,รายการ,ยอด\n1/10/2569,"ค่าเช่า, กล้อง",1200\n2/10/2569,"บรรทัด\nสอง",50'), [['วันที่', 'รายการ', 'ยอด'], ['1/10/2569', 'ค่าเช่า, กล้อง', '1200'], ['2/10/2569', 'บรรทัด\nสอง', '50']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  const tis620 = new Uint8Array([0xa1, 0xd2, 0xe1, 0xbf, 0x2c, 0x36, 0x30]); // กาแฟ,60
  assert.equal(decodeSheetText(tis620), 'กาแฟ,60');
  assert.match(spreadsheetText('รายจ่าย.csv', new TextEncoder().encode('﻿รายการ,ยอด\nค่ากาแฟ,60\nค่ารถ,40')).text, /CSV ที่ส่งมาในแชท LINE[\s\S]*ยอด = 100 \(2 แถว\)/);
  assert.deepEqual(['a.xlsx', 'b.CSV', 'c.xls', 'd.numbers', 'e.pdf'].map(sheetFileKind), ['xlsx', 'csv', 'old', 'old', null]);
  assert.throws(() => spreadsheetText('x.xlsx', new TextEncoder().encode('not a zip')), (error: unknown) => error instanceof SheetFileError && error.code === 'type');
  assert.throws(() => spreadsheetText('x.csv', new TextEncoder().encode(' \n ,, \n')), (error: unknown) => error instanceof SheetFileError && error.code === 'empty');
});

function deps(file: Buffer) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      owner: async () => ({ user: { user_id: USER, notif_settings: {} }, auth: { id: USER } }),
      read: async () => file,
      store: async () => { calls.push('store'); return { id: 'x', fileName: 'x' }; },
      answer: async (_user: unknown, text: string, _history: unknown, files: { mimeType: string; name: string; data: string }[]) => {
        calls.push(`answer:${text}:${files.map(f => `${f.name}|${f.mimeType}`).join(',')}`);
        calls.push(Buffer.from(files[0].data, 'base64').toString('utf8'));
        return { messages: [{ type: 'text', text: 'เตรียมรายจ่าย 3 รายการให้แล้วครับ' }, { type: 'flex', altText: 'บันทึกทั้งหมด', contents: {} }], text: 'เตรียมให้แล้ว', proposalIds: ['p_1'] };
      },
      saveHistory: async (_user: unknown, said: string) => { calls.push(`history:${said}`); },
      rateLimit: async (scope: string) => { calls.push(`limit:${scope}`); },
    } as any,
  };
}

test('LINE: a short spreadsheet is read for เลขา as masked text and answered with its cards; nothing goes to the vault', async () => {
  const d = deps(book(3));
  const reply = await handleLineFileMessage('Uline', { id: '42', type: 'file', fileName: 'ค่าใช้จ่าย.xlsx' }, 'token', d.deps) as any[];
  assert.deepEqual(reply.map(message => message.type), ['text', 'flex']);
  assert.ok(d.calls.includes(`answer:${LINE_SHEET_REQUEST}:ค่าใช้จ่าย.xlsx|text/plain`));
  const sent = d.calls.find(call => call.startsWith('ไฟล์ "ค่าใช้จ่าย.xlsx"'))!;
  assert.match(sent, /ค่ากาแฟ 3/);
  assert.ok(!sent.includes('081-234-5678'));
  assert.ok(d.calls.includes('limit:assistant-file'));
  assert.ok(d.calls.includes('history:[ส่งไฟล์] ค่าใช้จ่าย.xlsx'));
  assert.ok(!d.calls.includes('store'), 'the vault keeps pictures and PDFs only');
});

test('LINE: a long spreadsheet goes to the app\'s import (no tokens spent); .xls is asked to be saved as .xlsx; a broken file says so', async () => {
  const long = deps(book(LINE_SHEET_ROWS + 5));
  const [card] = await handleLineFileMessage('Uline', { id: '42', type: 'file', fileName: 'ทั้งปี.xlsx' }, 'token', long.deps) as any[];
  assert.equal(card.type, 'flex');
  assert.match(card.altText, /ไฟล์ ทั้งปี.xlsx มี 26 แถว นำเข้าทีเดียวได้ที่ เมนู งาน › นำเข้าจาก Excel/);
  assert.match(JSON.stringify(card), /openPath=%2Fjobs/);
  assert.ok(!long.calls.some(call => call.startsWith('answer:')), 'เลขา is not asked');
  const old = deps(Buffer.from('old'));
  const [said] = await handleLineFileMessage('Uline', { id: '42', type: 'file', fileName: 'บัญชีเก่า.xls' }, 'token', old.deps) as any[];
  assert.match(said.text, /\.xlsx และ \.csv/);
  const broken = deps(Buffer.from('not a zip at all'));
  const [error] = await handleLineFileMessage('Uline', { id: '42', type: 'file', fileName: 'เสีย.xlsx' }, 'token', broken.deps) as any[];
  assert.match(error.text, /เปิดไฟล์นี้ไม่ได้/);
  assert.ok(![...old.calls, ...broken.calls].some(call => call.startsWith('answer:') || call === 'store'));
});
