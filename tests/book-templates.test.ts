import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';
import { buildBookTemplate, DATE_CHECK, TAX_ID_CHECK, TEMPLATE_INFO, upgradeTemplateMap } from '../shared/bookTemplates';
import { BUSINESS_VERSION, type BusinessProfile } from '../shared/businessProfile';
import { buildXlsx, columnLetter, STYLE_DEFS, type Cell, type RuleValidation, type SheetSpec } from '../shared/xlsxWriter';
import { forTemplate, mapOf, readTabs, templateReadings } from '../frontend/src/features/labs/sheetMap';
import { chooseCategory, chooseTab, rowCells } from '../shared/sheetRow';
import { sheetMapSchema } from '../shared/googleSheets';
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
      assert.equal(sheet.rows.length, 1001, `${id}/${sheet.name}: 1,000 ruled rows`);
      assert.equal(sheet.gridlines, false);
      assert.deepEqual(sheet.print, { landscape: true, repeatHeader: true });
      // Formula columns are grey (never typed over); the others are ruled white cells.
      sheet.rows[1].forEach((cell, j) => {
        if (cell && typeof cell === 'object' && 'f' in cell) assert.match(String(cell.s), /^calc/, `${id}/${sheet.name} col ${j}`);
        else assert.ok(['cell', 'choice', 'money', 'date', 'percent', 'idText'].includes(String(sheet.columnStyles?.[j])), `${id}/${sheet.name} col ${j}: ${sheet.columnStyles?.[j]}`);
      });
    }
  }
});

test('report tabs: title, the official header lines (who, tax ID, place, year), the table from row 5, totals over the months', () => {
  const { sheets } = buildBookTemplate(PROFILES.freelance, { year: 2026 });
  for (const name of ['ภาษีถูกหัก ณ ที่จ่าย', 'รายงานเงินสดรับ-จ่าย', 'สรุปภาษีรายปี']) {
    const sheet = sheets.find(s => s.name === name)!;
    assert.equal(styleOf(sheet.rows[0][0]), 'title');
    assert.match(String((sheet.rows[1][0] as { f: string }).f), /ชื่อผู้ประกอบการ.*\$B\$4.*เลขประจำตัวผู้เสียภาษีอากร.*\$B\$5/);
    assert.match(String((sheet.rows[2][0] as { f: string }).f), /สถานประกอบการ.*\$B\$6.*\$B\$7.*ปีภาษี.*\$B\$3/);
    assert.ok(sheet.rows[4].every(cell => styleOf(cell) === 'header'), `${name}: header in row 5`);
  }
  const cash = sheets.find(s => s.name === 'รายงานเงินสดรับ-จ่าย')!;
  assert.equal(styleOf(cash.rows[5][0]), 'cell');
  assert.equal((cash.rows[5][4] as { f: string }).f, 'B6-C6-D6', 'January is row 6');
  assert.equal((cash.rows[17][1] as { f: string }).f, 'SUM(B6:B17)', 'the year total adds rows 6–17');
  const year = sheets.find(s => s.name === 'สรุปภาษีรายปี')!;
  assert.deepEqual(year.rows.slice(5, 11).map(row => (row[0] as { v: string }).v), ['40(2)', '40(5)', '40(6)', '40(7)', '40(8)', 'อื่น ๆ']);
  assert.equal((year.rows[11][1] as { f: string }).f, 'SUM(B6:B11)');
  assert.equal((year.rows[13][1] as { f: string }).f, 'D12', 'the VAT watch reads the year total');
  const cashFormula = String((cash.rows[5][1] as { f: string }).f);
  for (const type of ['40(5)', '40(6)', '40(7)', '40(8)']) assert.ok(cashFormula.includes(`"${type}"`), `the cash report counts ${type}`);
  assert.ok(!cashFormula.includes('"40(2)"'));
  const settings = sheets.find(s => s.name === 'ตั้งค่า')!;
  assert.deepEqual([settings.rows[5][0], settings.rows[6][0]].map(cell => (cell as { v: string }).v), ['ชื่อสถานประกอบการ (ถ้ามี)', 'สำนักงานใหญ่ / สาขา'], 'B6 and B7 feed the header');
  const fills = Object.values(STYLE_DEFS).map(def => def.fill).filter(Boolean);
  assert.ok(!fills.includes('FDEEE6'), 'no peach (owner: cream and peach look old)');
});

test('VAT reports follow the Revenue Department layout: header, เดือนภาษี, branch, one line per invoice of the month, พ.ศ.', () => {
  const { sheets } = buildBookTemplate(PROFILES.freelance_vat, { year: 2026 });
  const income = sheets.find(s => s.name === 'รายรับ')!;
  const expense = sheets.find(s => s.name === 'รายจ่าย')!;
  assert.deepEqual(income.rows[0].map(cell => (cell as { v: string }).v).slice(0, 5), ['วันที่รับเงิน', 'เลขที่ใบกำกับภาษี', 'ผู้ซื้อ / ผู้จ่ายเงิน', 'เลขผู้เสียภาษีผู้ซื้อ', 'สาขาผู้ซื้อ']);
  assert.deepEqual(expense.rows[0].map(cell => (cell as { v: string }).v).slice(0, 5), ['วันที่จ่ายเงิน', 'เลขที่ใบกำกับภาษี', 'ผู้ขาย / ผู้รับเงิน', 'เลขผู้เสียภาษีผู้ขาย', 'สาขาผู้ขาย']);
  assert.equal((income.rows[0][14] as { v: string }).v, 'ลำดับในรายงานภาษีขาย (คำนวณ)');
  assert.match(String((income.rows[1][14] as { f: string }).f), /COUNTIFS\(\$A\$2:\$A2,">="&DATE\(.*VALUE\('รายงานภาษีขาย'!\$C\$4&""\)/);
  assert.match(String((expense.rows[1][12] as { f: string }).f), /\$J2<>"ใช่".*\$J\$2:\$J2,"ใช่"/, 'purchases: only claimable invoices');
  assert.match(String((income.rows[1][8] as { f: string }).f), /ROUND\(H2\*0.07,2\)/, 'VAT 7% moved with the new column');
  for (const [name, party] of [['รายงานภาษีขาย', 'ผู้ซื้อ'], ['รายงานภาษีซื้อ', 'ผู้ขาย']]) {
    const report = sheets.find(s => s.name === name)!;
    assert.equal((report.rows[0][0] as { v: string }).v, name);
    assert.equal((report.rows[3][1] as { v: string }).v, 'เดือนภาษี');
    assert.deepEqual(report.validations, [{ range: 'C4:C4', list: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }]);
    assert.deepEqual(report.rows[5].map(cell => (cell as { v: string }).v), ['ลำดับที่', 'วัน เดือน ปี', 'เลขที่ / เล่มที่', `ชื่อ${party === 'ผู้ซื้อ' ? 'ผู้ซื้อสินค้า / ผู้รับบริการ' : 'ผู้ขายสินค้า / ผู้ให้บริการ'}`,
      `เลขประจำตัวผู้เสียภาษีอากรของ${party}`, 'สำนักงานใหญ่ / สาขาที่', 'มูลค่าสินค้าหรือบริการ', 'จำนวนเงินภาษีมูลค่าเพิ่ม']);
    assert.match(String((report.rows[6][1] as { f: string }).f), /YEAR\(INDEX\(.*\)\+543/, 'dates in พ.ศ.');
    const total = report.rows[6 + 100];
    assert.equal((total[0] as { v: string }).v, 'รวม');
    assert.equal((total[6] as { f: string }).f, 'SUM(G7:G106)');
  }
  const pp30 = sheets.find(s => s.name === 'สรุป ภ.พ.30')!;
  assert.match(String((pp30.rows[5][1] as { f: string }).f), /'รายรับ'!\$H\$2:\$H\$5000/, 'ภ.พ.30 reads the value from its new column');
  assert.match(String((pp30.rows[5][4] as { f: string }).f), /'รายจ่าย'!\$I\$2:\$I\$5000.*'รายจ่าย'!\$J\$2:\$J\$5000,"ใช่"/);
  // Tax IDs and branch codes are text: 0105… and 00000 keep their zeros, typed or written by เลขา.
  for (const j of [3, 4]) { assert.equal(income.columnStyles?.[j], 'idText'); assert.equal(expense.columnStyles?.[j], 'idText'); }
  const settingsTab = sheets.find(s => s.name === 'ตั้งค่า')!;
  assert.equal(styleOf(settingsTab.rows[4][1]), 'inputText', 'the tax ID box in ตั้งค่า');
});

test('words on brick pass WCAG AA: the header is the deep brick #C24A16 (white on it 4.9:1)', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  assert.equal(STYLE_DEFS.header.fill, 'C24A16');
  assert.ok(ratio(STYLE_DEFS.header.fill!, STYLE_DEFS.header.color!) >= 4.5);
  for (const style of ['step', 'kicker'] as const) assert.ok(ratio(STYLE_DEFS[style].color!, 'FFFFFF') >= 4.5, style);
  assert.ok(ratio('E65F2B', 'FFFFFF') < 4.5, 'the bright brick stays for bars and lines only');
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

test('a worked-out column says so in its header, not by grey alone; totals read far past the 1,000 ruled rows', () => {
  for (const profile of Object.values(PROFILES)) {
    for (const sheet of buildBookTemplate(profile, { year: 2026 }).sheets.filter(s => s.freezeRows === 1)) {
      sheet.rows[1].forEach((cell, j) => {
        const header = String((sheet.rows[0][j] as { v: string }).v);
        assert.equal(header.endsWith(' (คำนวณ)'), Boolean(cell && typeof cell === 'object' && 'f' in cell), `${sheet.name}: ${header}`);
      });
    }
  }
  const text = JSON.stringify(buildBookTemplate(PROFILES.agency, { year: 2026 }).sheets);
  assert.ok(!/\$[A-Z]+\$(201|1001)\b/.test(text), 'no range stops at the last ruled row');
});

test('our own sheets are read the way the template means them: an expense row gets its date, nothing lands in a tax ID', () => {
  const cellsOf = (id: keyof typeof PROFILES, kind: 'job' | 'expense', record: Record<string, unknown>, samples: Record<number, string[]> = {}) => {
    const readings = templateReadings(readTabs(live(buildBookTemplate(PROFILES[id], { year: 2026 }).sheets)));
    assert.ok(readings, `${id} is recognised`);
    const tab = chooseTab(mapOf('f', readings!), kind)!;
    return Object.fromEntries(rowCells(tab, kind, record, samples).filter(cell => cell.value !== null).map(cell => [cell.header, cell.value]));
  };
  const coffee = { name: 'ค่ากาแฟ', amount: 60, category: 'อาหาร', date: '2026-11-13' };
  assert.deepEqual(cellsOf('freelance', 'expense', coffee), { 'วันที่จ่ายเงิน': '2026-11-13', 'รายการ': 'ค่ากาแฟ', 'หมวด': 'อื่น ๆ', 'จำนวนเงิน': 60 }, 'no food choice on a freelancer sheet');
  assert.deepEqual(cellsOf('freelance_vat', 'expense', coffee), { 'วันที่จ่ายเงิน': '2026-11-13', 'รายการ': 'ค่ากาแฟ', 'หมวด': 'อื่น ๆ', 'มูลค่าก่อน VAT': 60 });
  assert.deepEqual(cellsOf('production', 'expense', coffee), { 'วันที่จ่าย': '2026-11-13', 'หมวด': 'อาหาร', 'รายการ': 'ค่ากาแฟ', 'ก่อน VAT': 60 });
  const job = { name: 'ตัดต่อคลิป', client: 'บริษัท ก จำกัด', value: 10000, whtRate: 3, payDate: '2026-11-10', paymentStatus: 'paid' };
  assert.deepEqual(cellsOf('freelance', 'job', job, { 6: ['3%'] }),
    { 'วันที่รับเงิน': '2026-11-10', 'ผู้จ่ายเงิน': 'บริษัท ก จำกัด', 'รายการ': 'ตัดต่อคลิป', 'ยอดก่อนหัก': 10000, 'อัตราหัก': '3%' });
  assert.deepEqual(cellsOf('agency', 'job', { ...job, postDate: '2026-11-01' }),
    { 'ชื่อแคมเปญ': 'ตัดต่อคลิป', 'ลูกค้า': 'บริษัท ก จำกัด', 'ค่าบริการก่อน VAT': 10000, 'วันเริ่ม': '2026-11-01' });
  // Someone else's sheet is not taken for ours; ours with a column added after the last one still is.
  assert.equal(templateReadings(readTabs([{ name: 'รายรับ', truncated: false, rows: [[{ raw: 'วันที่', text: 'วันที่' }, { raw: 'ยอด', text: 'ยอด' }]] }])), null);
  const sheets = buildBookTemplate(PROFILES.freelance, { year: 2026 }).sheets;
  const extended = live(sheets).map(tab => (tab.name === 'รายจ่าย' ? { ...tab, rows: [[...tab.rows[0], { raw: 'โปรเจกต์', text: 'โปรเจกต์' }], ...tab.rows.slice(1)] } : tab));
  assert.ok(templateReadings(readTabs(extended)));
  assert.equal(templateReadings(readTabs(live(buildBookTemplate(PROFILES.office, { year: 2026 }).sheets))), null, 'the office workbook keeps no personal records');
});

test('the app\'s expense categories become one of the sheet\'s own choices: the item name first, then the category', () => {
  const freelance = ['ซื้อสินค้า', 'อุปกรณ์', 'ซอฟต์แวร์', 'เดินทาง', 'ค่าจ้างช่วง', 'ค่าสถานที่', 'โทรศัพท์-เน็ต', 'อื่น ๆ'];
  const production = ['ทีมงาน', 'นักแสดง', 'อุปกรณ์', 'สถานที่', 'อาหาร', 'เดินทาง', 'อาร์ต', 'ตัดต่อ', 'อื่น ๆ'];
  const agency = ['กลยุทธ์-ครีเอทีฟ', 'โปรดักชัน', 'KOL', 'ค่าสื่อแทนจ่าย', 'ค่าธรรมเนียมสื่อ', 'อีเวนต์', 'อื่น ๆ'];
  const cases: [string, string, string[], string][] = [
    ['ค่าอุปกรณ์/ซอฟต์แวร์', 'เช่ากล้อง 2 วัน', freelance, 'อุปกรณ์'],
    ['ค่าอุปกรณ์/ซอฟต์แวร์', 'Adobe รายเดือน', freelance, 'ซอฟต์แวร์'],
    ['ค่าอุปกรณ์/ซอฟต์แวร์', 'ซื้อของ', freelance, 'อุปกรณ์'],
    ['ค่าเดินทาง/น้ำมัน', 'เติมน้ำมัน', freelance, 'เดินทาง'],
    ['จ้างงานต่อ (Outsource)', 'จ้างช่างไฟ', production, 'ทีมงาน'],
    ['จ้างงานต่อ (Outsource)', 'จ้างกราฟิก', freelance, 'ค่าจ้างช่วง'],
    ['อาหาร/รับรองลูกค้า', 'ข้าวกล่องกอง', production, 'อาหาร'],
    ['อาหาร/รับรองลูกค้า', 'ค่ากาแฟ', freelance, 'อื่น ๆ'],
    ['ค่าโฆษณา/ยิงแอด', 'ยิงแอด Facebook', agency, 'ค่าสื่อแทนจ่าย'],
    ['อื่นๆ', 'จ้างอินฟลูรีวิว', agency, 'KOL'],
    ['ค่าบริการ/สาธารณูปโภค', 'ค่าไฟฟ้า', production, 'อื่น ๆ'],
    ['ค่าบริการ/สาธารณูปโภค', 'ค่าเน็ตบ้าน', freelance, 'โทรศัพท์-เน็ต'],
    ['อุปกรณ์', 'อะไรก็ได้', freelance, 'อุปกรณ์'],
  ];
  for (const [category, name, choices, expected] of cases) assert.equal(chooseCategory(category, name, choices), expected, `${name} / ${category}`);
  assert.equal(chooseCategory('อะไรสักอย่าง', 'ไม่รู้', ['A', 'B']), 'อะไรสักอย่าง', 'no อื่น ๆ: the app word stays');
  // The choices ride in the saved map (only on the category column), survive the check and come back when it is read again.
  const sheets = buildBookTemplate(PROFILES.production, { year: 2026 }).sheets;
  const map = mapOf('file-1234567890', templateReadings(readTabs(live(sheets)))!);
  assert.ok(sheetMapSchema.safeParse(map).success);
  const expenses = map.tabs.find(tab => tab.name === 'ค่าใช้จ่ายและเช่าอุปกรณ์')!;
  assert.deepEqual(expenses.columns.filter(column => column.choices).map(column => column.header), ['หมวด']);
  assert.deepEqual(expenses.columns.find(column => column.choices)!.choices, production);
  const again = mapOf('file-1234567890', readTabs(live(sheets), map));
  assert.deepEqual(again.tabs.find(tab => tab.name === 'ค่าใช้จ่ายและเช่าอุปกรณ์')!.columns.find(column => column.target === 'category')!.choices, production);
});

test('a sheet connected before (an older map) is written the way today\'s template means it; other sheets are left alone', () => {
  /** The map an older version saved: the reader's guesses, no choices. */
  const oldMap = (tabs: LiveTab[]) => mapOf('file-1234567890', readTabs(tabs));
  const coffee = { name: 'ข้าวกล่องกอง', amount: 900, category: 'อาหาร/รับรองลูกค้า', date: '2026-11-13' };
  const write = (map: ReturnType<typeof oldMap>, kind: 'job' | 'expense', record: Record<string, unknown>) => {
    const tab = chooseTab(map, kind)!;
    return { tab: tab.name, cells: Object.fromEntries(rowCells(tab, kind, record).filter(cell => cell.value !== null).map(cell => [cell.header, cell.value])) };
  };
  // Production: the old map sent expenses into the budget tab; upgraded, they go to the expense tab with a date and a category.
  const production = oldMap(live(buildBookTemplate(PROFILES.production, { year: 2026 }).sheets));
  assert.equal(chooseTab(production, 'expense')?.name, 'งบโปรดักชัน', 'what the old map did');
  const fixed = upgradeTemplateMap(production);
  assert.deepEqual(write(fixed, 'expense', coffee), { tab: 'ค่าใช้จ่ายและเช่าอุปกรณ์', cells: { 'วันที่จ่าย': '2026-11-13', 'หมวด': 'อาหาร', 'รายการ': 'ข้าวกล่องกอง', 'ก่อน VAT': 900 } });
  assert.deepEqual(fixed.tabs.filter(tab => tab.use).map(tab => tab.name).sort(), ['ค่าใช้จ่ายและเช่าอุปกรณ์', 'งาน']);
  assert.deepEqual(upgradeTemplateMap(fixed), fixed, 'applying it again changes nothing');
  // A file from the version before (no "(คำนวณ)" in the headers) still counts.
  const before = live(buildBookTemplate(PROFILES.freelance, { year: 2026 }).sheets).map(tab => ({ ...tab, rows: [tab.rows[0].map(cell => ({ ...cell, text: cell.text.replace(' (คำนวณ)', ''), raw: typeof cell.raw === 'string' ? cell.raw.replace(' (คำนวณ)', '') : cell.raw })), ...tab.rows.slice(1)] }));
  assert.deepEqual(write(upgradeTemplateMap(oldMap(before)), 'expense', coffee).cells, { 'วันที่จ่ายเงิน': '2026-11-13', 'รายการ': 'ข้าวกล่องกอง', 'หมวด': 'อื่น ๆ', 'จำนวนเงิน': 900 });
  // A VAT file from before the invoice-number and branch columns: matched header by header.
  const vat = live(buildBookTemplate(PROFILES.freelance_vat, { year: 2026 }).sheets).map(tab => {
    if (tab.name !== 'รายจ่าย') return tab;
    const drop = new Set([1, 4, 12]);
    return { ...tab, rows: tab.rows.map(row => row.filter((_, index) => !drop.has(index))) };
  });
  assert.deepEqual(write(upgradeTemplateMap(oldMap(vat)), 'expense', coffee).cells, { 'วันที่จ่ายเงิน': '2026-11-13', 'รายการ': 'ข้าวกล่องกอง', 'หมวด': 'อื่น ๆ', 'มูลค่าก่อน VAT': 900 });
  // Someone else's sheet, and a map saved today with its choices, come back exactly as they were.
  const other = oldMap([{ name: 'รายจ่าย', truncated: false, rows: [[{ raw: 'วันที่', text: 'วันที่' }, { raw: 'รายการ', text: 'รายการ' }, { raw: 'ยอด', text: 'ยอด' }], [{ raw: '1/11/2026', text: '1/11/2026', date: '2026-11-01' }, { raw: 'กาแฟ', text: 'กาแฟ' }, { raw: 60, text: '60' }]] }]);
  assert.equal(upgradeTemplateMap(other), other);
  const today = mapOf('file-1234567890', templateReadings(readTabs(live(buildBookTemplate(PROFILES.agency, { year: 2026 }).sheets)))!);
  assert.equal(upgradeTemplateMap(today), today);
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
  assert.match(styles, /formatCode="#,##0.00;\(#,##0.00\);&quot;–&quot;"/, 'negatives in brackets, a dash for nothing in worked-out figures');
  assert.match(styles, /formatCode="#,##0.00;\(#,##0.00\)"/, 'negatives in brackets in typed amounts');
  const cover = strFromU8(excel['xl/worksheets/sheet1.xml']);
  assert.match(cover, /showGridLines="0"/);
  assert.ok(!cover.includes('<mergeCells'), 'no joined cells on the cover: long lines wrap in column B');
  assert.match(cover, /<row r="1" ht="5" customHeight="1">/);
  const workbook = strFromU8(excel['xl/workbook.xml']);
  assert.match(workbook, /<definedName name="_xlnm.Print_Titles" localSheetId="2">'งาน'!\$1:\$1<\/definedName>/);
  const jobs = strFromU8(excel['xl/worksheets/sheet3.xml']);
  assert.match(jobs, /<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
  assert.match(jobs, /<c r="B1001" s="\d+"\/>/, 'empty ruled rows down to 1,000');
  assert.match(styles, /<xf numFmtId="49"/, 'a text format for tax IDs');
});

test('what is typed is checked: tax IDs by their check digit, branch codes, and Gregorian dates only', () => {
  const sheets = buildBookTemplate(PROFILES.freelance_vat, { year: 2026 }).sheets;
  const income = sheets.find(sheet => sheet.name === 'รายรับ')!;
  const rules = (income.validations ?? []).filter(v => !('list' in v)) as RuleValidation[];
  const at = (header: string) => columnLetter(income.rows[0].findIndex(cell => String((cell as { v: string }).v) === header));
  const date = rules.find(v => v.range === `${at('วันที่รับเงิน')}2:${at('วันที่รับเงิน')}5000`)!;
  assert.deepEqual([date.date, date.warn, date.title], [{ from: '2000-01-01', to: '2100-12-31' }, undefined, DATE_CHECK.title], 'a Buddhist-era year is refused');
  assert.match(date.error, /ปี ค\.ศ\. เช่น 13\/11\/2026/);
  for (const v of rules.filter(rule => rule.custom)) {
    assert.ok(v.warn, `${v.range}: asked about, never refused`);
    assert.match(v.custom!, /^IFERROR\(AND\(LEN\([A-Z]+2\)=(13|5),/);
  }
  const settings = sheets.find(sheet => sheet.name === 'ตั้งค่า')!;
  const id = settings.validations!.find(v => !('list' in v)) as RuleValidation;
  assert.equal(id.title, TAX_ID_CHECK.title);
  assert.match(String((settings.rows[Number(id.range.replace(/\D/g, '')) - 1][0] as { v: string }).v), /เลข.*ผู้เสียภาษี/, 'the check sits on the tax ID box');
  // The weights 13 down to 2 and the check digit, as the formula reads them.
  assert.match(id.custom!, /MID\(B\d+,1,1\)\*13\+MID\(B\d+,2,1\)\*12\+.*MID\(B\d+,12,1\)\*2,11\),10\)=--MID\(B\d+,13,1\)/);
  const xml = strFromU8(unzipSync(buildXlsx(sheets))['xl/worksheets/sheet3.xml']);
  assert.match(xml, /<dataValidation type="date" operator="between" allowBlank="1" showErrorMessage="1" errorStyle="stop" errorTitle="วันที่" error="[^"]+" sqref="A2:A5000"><formula1>36526<\/formula1><formula2>73415<\/formula2><\/dataValidation>/);
  assert.match(xml, /<dataValidation type="custom" allowBlank="1" showErrorMessage="1" errorStyle="warning"/);
});
