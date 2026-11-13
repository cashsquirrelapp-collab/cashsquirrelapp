import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { buildBookTemplate, TEMPLATE_INFO } from '../shared/bookTemplates';
import { BUSINESS_VERSION, type BusinessProfile } from '../shared/businessProfile';
import { buildXlsx, STYLE_DEFS, type Cell, type SheetSpec } from '../shared/xlsxWriter';
import { forTemplate, mapOf, readTabs } from '../frontend/src/features/labs/sheetMap';
import { chooseTab } from '../shared/sheetRow';
import type { LiveTab } from '../shared/googleSheets';

// The workbooks' formal look (owner, 2026-11-13: "เทมเพลต…สวยๆ เป็นทางการ"): a cover page, ตั้งค่า as a form, ledger tabs
// with the header in row 1 (เลขา writes below it), grey formula cells, report tabs with a title. And a sheet made from a
// template (สร้างชีตใหม่ให้) is written only into the tabs the template names.

const base = { version: BUSINESS_VERSION, vat: 'no' as const, pays: [] as BusinessProfile['pays'], revenue: 'under_1m' as const, updated_at: '2026-11-13T00:00:00Z' };
const PROFILES: Record<keyof typeof TEMPLATE_INFO, BusinessProfile> = {
  freelance: { ...base, entity: 'individual', work: 'teacher', income: 'both' } as BusinessProfile,
  freelance_vat: { ...base, entity: 'individual', vat: 'yes', work: 'design', income: 'own_business' } as BusinessProfile,
  agency: { ...base, entity: 'company', work: 'agency', income: 'per_job' } as BusinessProfile,
  production: { ...base, entity: 'company', work: 'production', income: 'per_job' } as BusinessProfile,
  office: { ...base, entity: 'accounting_office', work: 'other', income: 'per_job' } as BusinessProfile,
};
const styleOf = (cell: Cell) => (cell && typeof cell === 'object' ? cell.s : undefined);
/** The workbook as the Google Sheets reader would hand it over (formula results unknown, so empty). */
const live = (sheets: SheetSpec[]): LiveTab[] => sheets.map(sheet => ({ name: sheet.name, truncated: false, rows: sheet.rows.map(row => row.map(cell => {
  if (cell === null || cell === undefined || cell === '') return { raw: null, text: '' };
  if (typeof cell === 'string') return { raw: cell, text: cell };
  if (typeof cell === 'number') return { raw: cell, text: String(cell) };
  if ('f' in cell) return { raw: '', text: '', formula: true as const };
  if ('date' in cell) { const [y, m, d] = cell.date.split('-'); return { raw: `${d}/${m}/${y}`, text: `${d}/${m}/${y}`, date: cell.date }; }
  return { raw: cell.v, text: String(cell.v) };
})) }));

test('every workbook: a cover page naming each tab, ตั้งค่า as a form, ledger tabs with the header in row 1', () => {
  for (const [id, profile] of Object.entries(PROFILES)) {
    const { sheets } = buildBookTemplate(profile, { year: 2026 });
    const cover = sheets[0];
    assert.equal(cover.name, 'วิธีใช้');
    const coverText = JSON.stringify(cover.rows);
    for (const sheet of sheets.slice(1)) assert.ok(coverText.includes(`"v":"${sheet.name}","s":"label"`), `${id}: the cover names ${sheet.name}`);
    assert.ok(coverText.includes('ช่องสีเทา') && coverText.includes(`ตั้งค่า'!$B$3`), `${id}: the colour key and the year from ตั้งค่า`);
    assert.equal(cover.gridlines, false);
    const settings = sheets.find(sheet => sheet.name === 'ตั้งค่า')!;
    assert.equal(styleOf(settings.rows[2][0]), 'label');
    assert.equal((settings.rows[2][1] as { v: number }).v, 2569, `${id}: the year the formulas read stays in B3`);
    assert.match(String(styleOf(settings.rows[2][1])), /^input/);
    for (const sheet of sheets.filter(s => s.freezeRows === 1)) {
      assert.ok(sheet.rows[0].every(cell => styleOf(cell) === 'header'), `${id}/${sheet.name}: brick header in row 1`);
      assert.equal(sheet.rows.length, 201, `${id}/${sheet.name}: 200 ruled rows`);
      assert.equal(sheet.gridlines, false);
      assert.deepEqual(sheet.print, { landscape: true, repeatHeader: true });
      // Formula columns are grey (never typed over); the others are ruled white cells.
      sheet.rows[1].forEach((cell, j) => {
        if (cell && typeof cell === 'object' && 'f' in cell) assert.match(String(cell.s), /^calc/, `${id}/${sheet.name} col ${j}`);
        else assert.ok(['cell', 'choice', 'money', 'date', 'percent'].includes(String(sheet.columnStyles?.[j])), `${id}/${sheet.name} col ${j}: ${sheet.columnStyles?.[j]}`);
      });
    }
  }
});

test('report tabs: title, who and which year, then the table from row 4, totals over the twelve months, no colour from cream', () => {
  const { sheets } = buildBookTemplate(PROFILES.freelance, { year: 2026 });
  for (const name of ['ภาษีถูกหัก ณ ที่จ่าย', 'รายงานเงินสดรับ-จ่าย', 'สรุปภาษีรายปี']) {
    const sheet = sheets.find(s => s.name === name)!;
    assert.equal(styleOf(sheet.rows[0][0]), 'title');
    assert.match(String((sheet.rows[1][0] as { f: string }).f), /ปีภาษี.*ตั้งค่า'!\$B\$3.*ตั้งค่า'!\$B\$4/);
    assert.ok(sheet.rows[3].every(cell => styleOf(cell) === 'header'), `${name}: header in row 4`);
  }
  const cash = sheets.find(s => s.name === 'รายงานเงินสดรับ-จ่าย')!;
  assert.equal(styleOf(cash.rows[4][0]), 'cell');
  assert.equal((cash.rows[4][4] as { f: string }).f, 'B5-C5-D5', 'January is row 5');
  assert.equal((cash.rows[16][1] as { f: string }).f, 'SUM(B5:B16)', 'the year total adds rows 5–16');
  const year = sheets.find(s => s.name === 'สรุปภาษีรายปี')!;
  assert.equal((year.rows[8][1] as { f: string }).f, 'SUM(B5:B8)');
  assert.equal((year.rows[10][1] as { f: string }).f, 'D9', 'the VAT watch reads the year total');
  const fills = Object.values(STYLE_DEFS).map(def => def.fill).filter(Boolean);
  assert.ok(!fills.includes('FDEEE6'), 'no peach (owner: cream and peach look old)');
});

test('สร้างชีตใหม่ให้: a sheet made from a template is written only into its income and expense tabs', () => {
  for (const [id, profile] of Object.entries(PROFILES) as [keyof typeof TEMPLATE_INFO, BusinessProfile][]) {
    const { sheets } = buildBookTemplate(profile, { year: 2026 });
    const writes = TEMPLATE_INFO[id].writes;
    for (const tab of [writes.job, writes.expense].filter(Boolean)) assert.ok(sheets.some(sheet => sheet.name === tab), `${id}: ${tab} exists`);
    const map = mapOf('f', forTemplate(readTabs(live(sheets)), writes));
    assert.equal(chooseTab(map, 'job')?.name, writes.job, `${id}: jobs`);
    assert.equal(chooseTab(map, 'expense')?.name, writes.expense, `${id}: expenses`);
    assert.deepEqual(map.tabs.filter(tab => tab.use).map(tab => tab.name).sort(), [writes.job, writes.expense].filter(Boolean).sort(), `${id}: nothing else counted`);
  }
  // Read without the template's names, the budget tabs would have taken the expenses.
  const loose = mapOf('f', readTabs(live(buildBookTemplate(PROFILES.production, { year: 2026 }).sheets)));
  assert.notEqual(chooseTab(loose, 'expense')?.name, TEMPLATE_INFO.production.writes.expense);
});

test('xlsx: the look is in the file — fonts by destination, no grid lines, joined cells, header printed on every page', () => {
  const built = buildBookTemplate(PROFILES.production, { year: 2026 });
  const excel = unzipSync(buildXlsx(built.sheets));
  const google = unzipSync(buildXlsx(built.sheets, { font: 'Sarabun' }));
  assert.match(strFromU8(excel['xl/styles.xml']), /<name val="Tahoma"\/>/);
  assert.match(strFromU8(google['xl/styles.xml']), /<name val="Sarabun"\/>/);
  const styles = strFromU8(excel['xl/styles.xml']);
  assert.match(styles, /FFE65F2B/);
  assert.match(styles, /<bottom style="double">/, 'a double rule under totals');
  assert.match(styles, /formatCode="#,##0.00;-#,##0.00;&quot;–&quot;"/, 'a dash for nothing in worked-out figures');
  const cover = strFromU8(excel['xl/worksheets/sheet1.xml']);
  assert.match(cover, /showGridLines="0"/);
  assert.match(cover, /<mergeCells count="\d+"><mergeCell ref="B\d+:C\d+"\/>/);
  assert.match(cover, /<row r="1" ht="5" customHeight="1">/);
  const workbook = strFromU8(excel['xl/workbook.xml']);
  assert.match(workbook, /<definedName name="_xlnm.Print_Titles" localSheetId="2">'งาน'!\$1:\$1<\/definedName>/);
  const jobs = strFromU8(excel['xl/worksheets/sheet3.xml']);
  assert.match(jobs, /<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
  assert.match(jobs, /<c r="B200" s="\d+"\/>/, 'empty ruled rows down to 200');
});
