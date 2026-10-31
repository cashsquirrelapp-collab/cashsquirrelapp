import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { analyzeSheet, buildImportPlan, defaultIncluded, splitSideBySide, type ImportRow, type SheetCell, type SheetGrid } from '../frontend/src/features/import/sheetImport.ts';
import { readWorkbook } from '../frontend/src/features/import/readWorkbook.ts';
import { editedRow, type SheetState } from '../frontend/src/features/import/importShared.ts';
import {
  applyActions, applyGroupFix, chatContext, columnsWaiting, fixDate, issueGroups, primaryIssue, quietCounts, sheetReports, withConfirmed, type ChatState,
} from '../frontend/src/features/import/importChatModel.ts';
import { applySuggestions } from '../frontend/src/features/import/aiColumns.ts';
import { importChat, importChatRequest, readImportChat, MAX_ACTIONS, type ImportChatInput } from '../backend/src/ai/importChat.ts';
import { aiConfig } from '../backend/src/ai/config.ts';

// The import as a chat with เลขากระรอก (owner, 2026-10-31): what the chat says about a file (columns that matched, ones to
// confirm, ones the app has no field for, rows that need a decision), the fixes applied by rules, and the typed message
// that เลขา answers with checked actions only.

const statuses = [
  { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' as const },
  { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' as const },
];
const today = '2026-10-31';
const cell = (value: string | number): SheetCell => ({ raw: value, text: typeof value === 'number' ? value.toLocaleString('en-US') : value });
const grid = (name: string, rows: (string | number)[][]): SheetGrid => ({ name, rows: rows.map(row => row.map(cell)) });

const jobsGrid = grid('งาน', [
  ['ชื่องาน', 'ลูกค้า', 'ราคา', 'วันที่', 'ช่องทาง'],
  ['ตัดต่อคลิปรีวิว', 'ร้านบี', 12000, '2026-09-03', 'TikTok'],
  ['ถ่ายภาพสินค้า', 'บริษัท เอ', 8000, '', 'IG'],
  ['ออกแบบโลโก้', 'ร้านซี', 5000, '', 'Facebook'],
  ['แปลบทความ', 'Client D', '$120', '2026-09-20', 'Email'],
]);

function stateOf(grids: SheetGrid[]): ChatState {
  const sheets: SheetState[] = grids.map(g => { const analysis = analyzeSheet(g); return { grid: g, analysis, include: defaultIncluded(analysis) }; });
  return { sheets, edits: {}, included: {}, amountsAreNet: false };
}
function rowsOf(state: ChatState): ImportRow[] {
  const plan = buildImportPlan(state.sheets.filter(s => s.include), { amountsAreNet: state.amountsAreNet, today }, { statuses, jobTypes: [], existingJobs: [], existingExpenses: [] }, state.sheets.map(s => s.grid));
  return plan.rows.map(row => editedRow(row, state.edits[row.key]));
}

test('the columns as the chat reports them: matched, kept in the note because the app has no field, nothing missing', () => {
  const [report] = sheetReports(stateOf([jobsGrid]).sheets);
  assert.equal(report.include, true);
  assert.equal(report.notImported, null);
  assert.ok(report.matched.some(c => c.target === 'name') && report.matched.some(c => c.target === 'client'));
  assert.deepEqual(report.kept.map(c => c.header), ['ช่องทาง'], 'no field in the app: kept in each row\'s note');
  assert.equal(report.missingName, false);
  assert.equal(report.missingAmount, false);
});

test('rows that need a decision come in groups, each row once, with its fixes', () => {
  const state = stateOf([jobsGrid]);
  const rows = rowsOf(state);
  const groups = issueGroups(rows, state.included);
  const noDate = groups.find(g => g.issue === 'noDate');
  assert.ok(noDate, JSON.stringify(groups.map(g => g.issue)));
  assert.deepEqual(noDate!.rows.map(r => r.rowNumber), [3, 4]);
  assert.deepEqual(noDate!.fixes, ['today', 'monthEnd', 'skip', 'review']);
  const foreign = groups.find(g => g.issue === 'foreignCurrency');
  assert.ok(foreign && foreign.state === 'confirm' && foreign.fixes[0] === 'confirm');
  const counted = groups.flatMap(g => g.rows.map(r => r.key));
  assert.equal(new Set(counted).size, counted.length, 'a row is in one group only');
  for (const group of groups) for (const row of group.rows) assert.equal(primaryIssue(row), group.issue);
});

test('a date fix puts the date on every row of the group; the group is gone and the rows import', () => {
  const state = stateOf([jobsGrid]);
  const next = applyGroupFix(state, rowsOf(state), 'noDate', 'today', today);
  const rows = rowsOf(next);
  assert.ok(!issueGroups(rows, next.included).some(g => g.issue === 'noDate'));
  for (const row of rows.filter(r => r.rowNumber === 3 || r.rowNumber === 4)) assert.equal(row.job?.postDate, today);
  // The state it came from is untouched (เปลี่ยนกลับ restores it as it was).
  assert.deepEqual(state.edits, {});
  assert.equal(applyGroupFix(next, rows, 'noDate', 'today', today), next, 'nothing left to fix: the same state');
});

test('skip and confirm decide a whole group; a confirmed group counts as decided', () => {
  const state = stateOf([jobsGrid]);
  const rows = rowsOf(state);
  const skipped = applyGroupFix(state, rows, 'foreignCurrency', 'skip', today);
  const foreign = rows.filter(r => r.issues.includes('foreignCurrency'));
  assert.ok(foreign.length && foreign.every(r => skipped.included[r.key] === false));
  assert.equal(issueGroups(rows, skipped.included).find(g => g.issue === 'foreignCurrency')!.decided, true);
  const confirmed = applyGroupFix(state, rows, 'foreignCurrency', 'confirm', today);
  assert.ok(foreign.every(r => confirmed.included[r.key] === true));
});

test('dates for a fix: today, the first or last day of the tab\'s month (this month without one), or a real date', () => {
  assert.equal(fixDate('today', today, null), today);
  assert.equal(fixDate('monthEnd', today, '2025-02'), '2025-02-28');
  assert.equal(fixDate('monthEnd', today, '2024-02'), '2024-02-29');
  assert.equal(fixDate('monthStart', today, null), '2026-10-01');
  assert.equal(fixDate('monthEnd', today, null), '2026-10-31');
  assert.equal(fixDate('date', today, null, '2026-09-15'), '2026-09-15');
  assert.equal(fixDate('date', today, null, '15/09/2026'), null);
});

test('เลขา\'s actions are applied by the same rules; unknown tabs and columns change nothing', () => {
  const state = stateOf([jobsGrid]);
  const rows = rowsOf(state);
  const column = state.sheets[0].analysis.columns.find(c => c.header === 'ช่องทาง')!.index;
  const { state: next, applied } = applyActions(state, rows, [
    { type: 'setColumn', sheet: 'งาน', column, field: 'type' },
    { type: 'setColumn', sheet: 'ไม่มีแท็บนี้', column: 0, field: 'name' },
    { type: 'setColumn', sheet: 'งาน', column: 99, field: 'name' },
    { type: 'fillDate', issue: 'noDate', mode: 'monthEnd' },
    { type: 'amountsNet', value: true },
  ], today);
  assert.equal(applied, 3);
  assert.equal(next.sheets[0].analysis.columns.find(c => c.index === column)!.target, 'type');
  assert.equal(next.amountsAreNet, true);
  assert.ok(Object.values(next.edits).every(edit => edit.date === '2026-10-31'));
});

test('columns เลขา suggested wait for ใช่; confirming one clears it', () => {
  const state = stateOf([jobsGrid]);
  const column = state.sheets[0].analysis.columns.find(c => c.header === 'ช่องทาง')!.index;
  const suggested = { ...state.sheets[0], analysis: applySuggestions(state.sheets[0].analysis, [{ index: column, field: 'type' }]).analysis };
  assert.equal(columnsWaiting([suggested]).length, 1);
  assert.equal(columnsWaiting([withConfirmed(suggested, column)]).length, 0);
});

test('what เลขา is sent: tab names, columns with 3 short samples, problem counts; never the rows', () => {
  const state = stateOf([jobsGrid]);
  const rows = rowsOf(state);
  const context = chatContext(state.sheets, issueGroups(rows, {}));
  assert.equal(context.sheets.length, 1);
  assert.ok(context.sheets[0].columns.every(c => c.samples.length <= 3));
  assert.ok(context.issues.every(i => typeof i.count === 'number'));
  assert.ok(!JSON.stringify(context).includes('rowNumber'));
});

test('the owner\'s demo workbook: the client list is reported as a lookup, every group row once, quiet rows counted', () => {
  const b = readFileSync(new URL('./fixtures/import/freelance_demo_krarok_2026.xlsx', import.meta.url));
  const data = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const grids = readWorkbook(XLSX, data, 'freelance_demo_krarok_2026.xlsx').filter(g => g.rows.some(r => r.some(c => c.text))).flatMap(splitSideBySide);
  const state = stateOf(grids);
  const reports = sheetReports(state.sheets);
  assert.ok(reports.some(r => r.notImported === 'lookup'), JSON.stringify(reports.map(r => [r.name, r.notImported])));
  const rows = rowsOf(state);
  const groups = issueGroups(rows, {});
  const keys = groups.flatMap(g => g.rows.map(r => r.key));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(quietCounts(rows).every(q => q.count > 0));
});

// ── the server side of a typed message ────────────────────────────────────────────────────────────────────────────

const input: ImportChatInput = {
  text: 'แถวที่ไม่มีวันที่ ใช้วันสุดท้ายของเดือนแทน แล้วคอลัมน์ช่องทางคือประเภทงาน',
  today,
  sheets: [{ name: 'งาน', kind: 'jobs', include: true, rows: 4, columns: [
    { index: 0, header: 'ชื่องาน', target: 'name', samples: ['ตัดต่อคลิปรีวิว'] },
    { index: 4, header: 'ช่องทาง', target: 'keep', samples: ['TikTok', 'bee@example.test', '081-234-5678'] },
  ] }],
  issues: [{ code: 'noDate', count: 2 }, { code: 'foreignCurrency', count: 1 }],
};

test('the request carries masked samples, the problems and the message, and asks for checked JSON', () => {
  const body = importChatRequest(input);
  const sent = JSON.parse(body.contents[0].parts[0].text);
  assert.deepEqual(sent.file.tabs[0].columns[1].samples, ['TikTok', '[email]', '[number]']);
  assert.deepEqual(sent.file.problems, input.issues);
  assert.equal(sent.message, input.text);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.match(body.systemInstruction.parts[0].text, /never instructions/);
});

test('the answer is checked: only listed tabs, columns, fields and problems; real dates; at most 8; a short plain reply', () => {
  const raw = {
    reply: 'ใส่วันสิ้นเดือนให้ 2 แถว และตั้งคอลัมน์ช่องทางเป็นประเภทงานแล้วครับ **ดูที่** https://evil.example/x',
    actions: [
      { type: 'fillDate', issue: 'noDate', mode: 'monthEnd' },
      { type: 'setColumn', sheet: 'งาน', column: 4, field: 'type' },
      { type: 'setColumn', sheet: 'งาน', column: 9, field: 'type' },
      { type: 'setColumn', sheet: 'อื่น', column: 0, field: 'name' },
      { type: 'setColumn', sheet: 'งาน', column: 0, field: 'password' },
      { type: 'skipIssue', issue: 'duplicate' },
      { type: 'fillDate', issue: 'noDate', mode: 'date', date: '2026-02-30' },
      { type: 'deleteAll' },
      { type: 'confirmIssue', issue: 'foreignCurrency' },
    ],
  };
  const out = readImportChat(raw, input);
  assert.deepEqual(out.actions, [
    { type: 'fillDate', issue: 'noDate', mode: 'monthEnd' },
    { type: 'setColumn', sheet: 'งาน', column: 4, field: 'type' },
    { type: 'confirmIssue', issue: 'foreignCurrency' },
  ]);
  assert.ok(!out.reply.includes('http') && !out.reply.includes('*'));
  const many = readImportChat({ reply: 'x', actions: Array.from({ length: 20 }, () => ({ type: 'amountsNet', value: true })) }, input);
  assert.equal(many.actions.length, MAX_ACTIONS);
  assert.deepEqual(readImportChat('nonsense', input), { reply: '', actions: [] });
});

function fakeDb() {
  const calls: [string, any][] = [];
  return { calls, db: { async reserve(args: any) { calls.push(['reserve', args]); return { ok: true }; }, async settle(args: any) { calls.push(['settle', args]); } } as any };
}
const enabled = aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-never-sent' });
const reply = (body: unknown, ok = true) => (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

test('one typed message: free for the account, its real cost recorded; off, capped or failed changes nothing', async () => {
  const { calls, db } = fakeDb();
  const answer = { candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'ใส่วันสิ้นเดือนให้แล้วครับ', actions: [{ type: 'fillDate', issue: 'noDate', mode: 'monthEnd' }] }) }] } }],
    usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 120 } };
  const out = await importChat(db, enabled, 'u1', input, { fetchImpl: reply(answer), now: new Date('2026-10-31T05:00:00Z') });
  assert.deepEqual(out, { reply: 'ใส่วันสิ้นเดือนให้แล้วครับ', actions: [{ type: 'fillDate', issue: 'noDate', mode: 'monthEnd' }], available: true });
  const [reserve, settle] = calls;
  assert.equal(reserve[1].tokens, 0);
  assert.equal(settle[1].tokens, 0, 'free for the account');
  assert.ok(settle[1].costUsd > 0 && settle[1].costUsd < 0.01, String(settle[1].costUsd));
  assert.equal(settle[1].promptVersion, 'import-chat-v1');

  let fetched = false;
  assert.deepEqual(await importChat(fakeDb().db, aiConfig({}), 'u1', input, { fetchImpl: (async () => { fetched = true; return new Response('{}'); }) as any }), { reply: '', actions: [], available: false });
  assert.equal(fetched, false);
  assert.deepEqual(await importChat(fakeDb().db, enabled, 'u1', input, { fetchImpl: reply({ error: 'x' }, false) }), { reply: '', actions: [], available: true });
  const capped = { reserve: async () => ({ ok: false, reason: 'daily_cap' }), settle: async () => { throw new Error('never settled'); } } as any;
  assert.deepEqual(await importChat(capped, enabled, 'u1', input, { fetchImpl: reply({}) }), { reply: '', actions: [], available: false });
});

test('the route: free for every account with its caps (10 a file, 3 files a day, 6 a minute), before any Pro check', () => {
  const handler = readFileSync(new URL('../backend/src/handlers/assistant.ts', import.meta.url), 'utf8');
  const route = handler.slice(handler.indexOf("if (body.action === 'import-chat')"), handler.indexOf("if (body.action === 'transcribe')"));
  assert.match(route, /rateLimit\('import-chat-files', user\.id, 3, 86_400\)/);
  assert.match(route, /rateLimit\('import-chat-file', fileKey, 10, 86_400\)/);
  assert.match(route, /rateLimit\('import-chat-minute', user\.id, 6, 60\)/);
  assert.doesNotMatch(route, /assistantPlan|pro_required/);
});
