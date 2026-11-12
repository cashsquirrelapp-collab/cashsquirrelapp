import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { googleStatus, readGoogleRecord, serialToDate, sheetMapSchema, type LiveTab } from '../shared/googleSheets';

// ฟีเจอร์ทดลอง, phase 2 (owner, 2026-11-12): the person's own Google Sheets. Google's permission is drive.file only; the
// refresh token is kept encrypted; Google's answer is taken only for the account that asked; the sheet is read into the
// importer's cells with dates and formulas; the map and overview come from the same reading as the Excel import.

process.env.APP_URL = 'https://staging.krarok.com';
process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret-not-real';
process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64');

const google = await import('../backend/src/services/googleSheets');
const { readTabs, mapOf, overviewOf, setTarget, setUse, formulaColumns } = await import('../frontend/src/features/labs/sheetMap');

type Call = { url: string; init?: RequestInit };
function mockFetch(answers: ((call: Call) => Response)[]) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected fetch ${url}`);
    return answer(call);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const idToken = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

test('google: the refresh token is sealed with the server key; a changed or foreign value opens to nothing', () => {
  const sealed = google.encryptToken('1//refresh-token');
  assert.notEqual(sealed, '1//refresh-token');
  assert.equal(google.decryptToken(sealed), '1//refresh-token');
  const bytes = Buffer.from(sealed, 'base64url'); bytes[bytes.length - 1] ^= 1;
  assert.equal(google.decryptToken(bytes.toString('base64url')), null, 'tampered');
  assert.equal(google.decryptToken('short'), null);
  assert.notEqual(google.encryptToken('same'), google.encryptToken('same'), 'a fresh IV each time');
});

test('google: the sign-in state is signed for one account and ten minutes', () => {
  const now = Date.UTC(2026, 10, 12, 10);
  const state = google.makeState('user-1', now);
  assert.equal(google.readState(state, now + 60_000), 'user-1');
  assert.equal(google.readState(state, now + 11 * 60_000), null, 'old');
  const [body, signature] = state.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'user-2', e: now + 60_000, n: 'x' })).toString('base64url');
  assert.equal(google.readState(`${forged}.${signature}`, now), null, 'another account with the old signature');
  assert.equal(google.readState(`${body}.${signature}x`, now), null);
  assert.equal(google.readState(`${body}`, now), null);
  assert.equal(google.readState(`${state}.extra`, now), null);
});

test('google: the sign-in address asks for the Drive file permission only, offline, back to the main address', () => {
  const url = new URL(google.authUrl('user-1'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://staging.krarok.com/api/google/callback');
  assert.equal(google.readState(url.searchParams.get('state')!), 'user-1');
  assert.doesNotMatch(url.toString(), /client_secret|test-secret/);
});

test('google: the code exchange keeps the refresh token and e-mail; without the Drive permission it keeps nothing and gives the token back', async () => {
  const ok = mockFetch([() => json({ refresh_token: 'r1', access_token: 'a1', scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file', id_token: idToken({ email: 'shop@example.com' }) })]);
  try {
    assert.deepEqual(await google.exchangeCode('code-1'), { refreshToken: 'r1', accessToken: 'a1', email: 'shop@example.com' });
    const sent = new URLSearchParams(String(ok.calls[0].init?.body));
    assert.equal(sent.get('grant_type'), 'authorization_code');
    assert.equal(sent.get('redirect_uri'), 'https://staging.krarok.com/api/google/callback');
  } finally { ok.restore(); }

  const unticked = mockFetch([() => json({ refresh_token: 'r2', access_token: 'a2', scope: 'openid email' }), () => new Response('', { status: 200 })]);
  try {
    await assert.rejects(google.exchangeCode('code-2'), (error: unknown) => (error as { code?: string }).code === 'scope');
    assert.equal(unticked.calls[1].url, 'https://oauth2.googleapis.com/revoke');
  } finally { unticked.restore(); }
});

test('google: a refused refresh token means connect again; a picked file must be a Google Sheet', async () => {
  const refused = mockFetch([() => json({ error: 'invalid_grant' }, 400)]);
  try { await assert.rejects(google.accessToken('old'), (error: unknown) => (error as { code?: string }).code === 'reconnect'); }
  finally { refused.restore(); }

  const files = mockFetch([
    () => json({ id: 'file-12345678', name: 'บัญชี 2569', mimeType: 'application/vnd.google-apps.spreadsheet', webViewLink: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' }),
    () => json({ id: 'file-12345678', name: 'slip.pdf', mimeType: 'application/pdf' }),
    () => json({ error: {} }, 404),
    () => json({ error: {} }, 403),
  ]);
  try {
    assert.deepEqual(await google.driveFile('tok', 'file-12345678'), { id: 'file-12345678', name: 'บัญชี 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' });
    assert.match(files.calls[0].url, /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/file-12345678\?fields=/);
    assert.equal((files.calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer tok');
    await assert.rejects(google.driveFile('tok', 'file-12345678'), (error: unknown) => (error as { code?: string }).code === 'notSheet');
    await assert.rejects(google.driveFile('tok', 'file-12345678'), (error: unknown) => (error as { code?: string }).code === 'notFound');
    await assert.rejects(google.driveFile('tok', 'file-12345678'), (error: unknown) => (error as { code?: string }).code === 'denied');
  } finally { files.restore(); }
});

test('google: cells come back in the importer\'s shape, with real dates and formula marks; empty ends are trimmed', () => {
  assert.deepEqual(google.liveCell({ formattedValue: '1/11/2569', effectiveValue: { numberValue: 46327 }, effectiveFormat: { numberFormat: { type: 'DATE' } } }),
    { raw: 46327, text: '1/11/2569', date: '2026-11-01' });
  assert.deepEqual(google.liveCell({ formattedValue: '1,500.00', effectiveValue: { numberValue: 1500 }, userEnteredValue: { formulaValue: '=B2*C2' } }),
    { raw: 1500, text: '1,500.00', formula: true });
  assert.deepEqual(google.liveCell(undefined), { raw: null, text: '' });
  assert.equal(serialToDate(45658), '2025-01-01');
  assert.equal(serialToDate(-3), null);
  const rows = google.liveRows({ data: [{ rowData: [{ values: [{ formattedValue: 'a' }, { formattedValue: '' }] }, { values: [] }, { values: [{ formattedValue: '' }] }] }] });
  assert.deepEqual(rows, [[{ raw: null, text: 'a' }]]);
});

test('google: reading a sheet skips hidden tabs and asks for each visible tab by its quoted name', async () => {
  const mock = mockFetch([
    () => json({ sheets: [
      { properties: { title: "รายรับ '69", sheetType: 'GRID', gridProperties: { rowCount: 1000 } } },
      { properties: { title: 'ซ่อน', hidden: true, sheetType: 'GRID' } },
      { properties: { title: 'กราฟ', sheetType: 'OBJECT' } },
    ] }),
    () => json({ sheets: [{ properties: { title: "รายรับ '69" }, data: [{ rowData: [{ values: [{ formattedValue: 'วันที่' }, { formattedValue: 'ยอดเงิน' }] }] }] }] }),
  ]);
  try {
    const tabs = await google.readSpreadsheet('tok', 'file-12345678');
    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].name, "รายรับ '69");
    assert.equal(tabs[0].truncated, false);
    const ranges = new URL(mock.calls[1].url).searchParams.getAll('ranges');
    assert.deepEqual(ranges, ["'รายรับ ''69'!A1:AN400"]);
  } finally { mock.restore(); }
});

test('google: a new Google Sheet is uploaded as one multipart request that asks Google to convert the workbook', async () => {
  const mock = mockFetch([() => json({ id: 'new-file-123456', name: 'ชีตบัญชี', webViewLink: 'https://docs.google.com/spreadsheets/d/new-file-123456/edit' })]);
  try {
    const file = await google.createSpreadsheet('tok', 'ชีตบัญชี', new Uint8Array([0x50, 0x4b, 3, 4]));
    assert.equal(file.id, 'new-file-123456');
    const call = mock.calls[0];
    assert.match(call.url, /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=multipart/);
    const type = (call.init?.headers as Record<string, string>)['Content-Type'];
    const boundary = type.match(/boundary=(.+)$/)![1];
    const body = Buffer.from(call.init!.body as Uint8Array).toString('latin1');
    assert.ok(body.startsWith(`--${boundary}\r\nContent-Type: application/json`));
    assert.match(Buffer.from(call.init!.body as Uint8Array).toString('utf8'), /"mimeType":"application\/vnd\.google-apps\.spreadsheet"/);
    assert.ok(body.includes('PK\u0003\u0004'));
    assert.ok(body.endsWith(`--${boundary}--`));
  } finally { mock.restore(); }
});

test('google: the kept record is read strictly, and the app never sees the token or another file\'s map', () => {
  assert.equal(readGoogleRecord({ email: 'a@example.com' }), null);
  assert.equal(readGoogleRecord('x'), null);
  const file = { id: 'file-12345678', name: 'บัญชี', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
  const map = { fileId: 'file-12345678', at: '2026-11-12T10:00:00.000Z', tabs: [] };
  const record = readGoogleRecord({ email: 'a@example.com', enc: 'x'.repeat(40), at: '2026-11-12T10:00:00.000Z', file, map })!;
  assert.ok(record);
  const status = googleStatus(record, true);
  assert.deepEqual(status, { configured: true, connected: true, email: 'a@example.com', file, map });
  assert.equal(JSON.stringify(status).includes('xxxx'), false, 'no token');
  assert.equal(googleStatus({ ...record, map: { ...map, fileId: 'other-file-1234' } }, true).map, null);
  assert.deepEqual(googleStatus(null, false), { configured: false, connected: false, file: null, map: null });
  assert.equal(sheetMapSchema.safeParse({ ...map, tabs: [{ name: 'A', headerRow: 0, kind: 'jobs', use: true, columns: [{ index: 0, header: 'x', target: 'ชื่อ' }] }] }).success, false, 'targets are field ids');
});

const cell = (text: string, extra: Record<string, unknown> = {}) => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text || null, text, ...extra });
const SHEET: LiveTab = {
  name: 'รายรับ',
  truncated: false,
  rows: [
    [cell('วันที่'), cell('ลูกค้า'), cell('รายละเอียด'), cell('ยอดเงิน'), cell('สถานะ'), cell('หัก ณ ที่จ่าย')],
    [cell('3/10/2026', { date: '2026-10-03' }), cell('บริษัท ก'), cell('ถ่ายรูปสินค้า'), cell('10,000'), cell('ได้รับเงินแล้ว'), cell('300', { formula: true })],
    [cell('20/10/2026', { date: '2026-10-20' }), cell('บริษัท ข'), cell('ตัดต่อวิดีโอ'), cell('5,000'), cell('ยังไม่จ่าย'), cell('150', { formula: true })],
  ],
};
const EXPENSES: LiveTab = {
  name: 'รายจ่าย',
  truncated: false,
  rows: [
    [cell('วันที่'), cell('รายการ'), cell('หมวดหมู่'), cell('ยอดเงิน')],
    [cell('5/10/2026', { date: '2026-10-05' }), cell('ค่าเช่ากล้อง'), cell('อุปกรณ์'), cell('1,200')],
    [cell('8/11/2026', { date: '2026-11-08' }), cell('ค่าเดินทาง'), cell('เดินทาง'), cell('300')],
  ],
};

test('sheet map: the sheet is read like an import, formula columns are marked, and a saved choice wins', () => {
  const [income, spent] = readTabs([SHEET, EXPENSES]);
  assert.equal(income.analysis.headerRow, 0);
  assert.equal(income.analysis.kind, 'jobs');
  assert.equal(spent.analysis.kind, 'expenses');
  assert.equal(income.use, true);
  assert.deepEqual([...formulaColumns(SHEET, income.analysis)], [5]);
  const amount = income.analysis.columns.find(column => column.header === 'ยอดเงิน')!;
  assert.ok(['amount', 'value', 'received'].includes(amount.target), amount.target);

  const changed = setUse(setTarget(income, 2, 'note'), false);
  const map = mapOf('file-12345678', [changed, spent]);
  assert.equal(sheetMapSchema.safeParse(map).success, true);
  assert.equal(map.tabs[0].use, false);
  assert.deepEqual(map.tabs[0].columns.find(column => column.index === 5), { index: 5, header: 'หัก ณ ที่จ่าย', target: map.tabs[0].columns[5].target, formula: true });

  const again = readTabs([SHEET, EXPENSES], map);
  assert.equal(again[0].use, false);
  assert.equal(again[0].analysis.columns[2].target, 'note');
  assert.equal(again[0].analysis.columns[2].reason, 'person');
  // A column whose header changed in the sheet is read afresh, not given the old choice.
  const renamed = { ...SHEET, rows: [[...SHEET.rows[0].slice(0, 2), cell('งาน'), ...SHEET.rows[0].slice(3)], ...SHEET.rows.slice(1)] };
  assert.notEqual(readTabs([renamed], map)[0].analysis.columns[2].reason, 'person');
});

test('sheet map: the overview counts the tabs ticked, money received by the month it arrived, and expenses by date', () => {
  const readings = readTabs([SHEET, EXPENSES]);
  const overview = overviewOf(readings, 2026);
  assert.equal(overview.jobs, 2);
  assert.equal(overview.expenses, 2);
  assert.equal(overview.expenseAmount, 1500);
  assert.equal(overview.value, 15000);
  assert.equal(overview.pending, 4850, '5,000 less the 150 withheld');
  assert.equal(overview.months[9].spent, 1200);
  assert.equal(overview.months[10].spent, 300);
  assert.ok(overview.months[9].received > 0, 'October has the paid job');
  assert.equal(overview.months[10].received, 0);
  assert.ok(overview.years.includes(2026));
  const withoutExpenses = overviewOf([readings[0], setUse(readings[1], false)], 2026);
  assert.equal(withoutExpenses.expenses, 0);
  assert.equal(withoutExpenses.expenseAmount, 0);
});

test('excel: a workbook is read on the device into the same tabs a Google Sheet gives, formula cells marked', async () => {
  const XLSX = await import('xlsx');
  const { buildXlsx } = await import('../shared/xlsxWriter');
  const { excelTabs, ExcelReadError } = await import('../frontend/src/features/labs/excelSource');
  const bytes = buildXlsx([
    { name: 'รายรับ', rows: [['วันที่', 'ลูกค้า', 'ยอดเงิน', 'หัก ณ ที่จ่าย'], [{ date: '2026-10-03' }, 'บริษัท ก', 10000, { f: 'C2*3%' }], [{ date: '2026-10-20' }, 'บริษัท ข', 5000, { f: 'C3*3%' }]] },
    { name: 'ว่าง', rows: [] },
  ]);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const tabs = excelTabs(XLSX, data, 'บัญชี.xlsx');
  assert.deepEqual(tabs.map(tab => tab.name), ['รายรับ'], 'the empty tab is left out');
  assert.equal(tabs[0].rows.length, 3);
  assert.equal(tabs[0].rows[1][0].date, '2026-10-03');
  assert.equal(tabs[0].rows[1][2].raw, 10000);
  assert.equal(tabs[0].rows[1][3].formula, true);
  assert.equal(tabs[0].rows[0][3].formula, undefined);
  const [reading] = readTabs(tabs);
  assert.deepEqual([...reading.formulas], [3]);

  const csv = new TextEncoder().encode('วันที่,รายการ,ยอดเงิน\n5/10/2569,ค่าเช่ากล้อง,1200\n');
  const csvTabs = excelTabs(XLSX, csv.buffer as ArrayBuffer, 'รายจ่าย.csv');
  assert.equal(csvTabs[0].name, 'รายจ่าย');
  assert.equal(csvTabs[0].rows[1][1].text, 'ค่าเช่ากล้อง');

  assert.throws(() => excelTabs(XLSX, new TextEncoder().encode('MZ not a workbook').buffer as ArrayBuffer, 'virus.xlsx'), (error: unknown) => error instanceof ExcelReadError && error.code === 'type');
  const empty = buildXlsx([{ name: 'A', rows: [] }]);
  assert.throws(() => excelTabs(XLSX, empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) as ArrayBuffer, 'empty.xlsx'), (error: unknown) => error instanceof ExcelReadError && error.code === 'empty');
});

test('excel: a confirmed map is kept on the device by file name, or found by the same tabs under a new name', async () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
  const { excelMapFor, keepExcelMap } = await import('../frontend/src/features/labs/excelSource');
  const map = mapOf('excel-local-file', readTabs([SHEET, EXPENSES]));
  assert.equal(excelMapFor('บัญชี ต.ค.xlsx', [SHEET, EXPENSES]), null);
  assert.equal(keepExcelMap('บัญชี ต.ค.xlsx', map), true);
  assert.deepEqual(excelMapFor('บัญชี ต.ค.xlsx', [SHEET]), map, 'by name');
  assert.deepEqual(excelMapFor('บัญชี พ.ย.xlsx', [EXPENSES, SHEET]), map, 'same tabs, new name');
  assert.equal(excelMapFor('อื่น.xlsx', [SHEET]), null);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
