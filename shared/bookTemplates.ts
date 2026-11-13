import { isThaiPublicHoliday } from './calendar.js';
import { hasSection40_5to8, templateFor, type BusinessProfile, type TemplateId } from './businessProfile.js';
import { columnLetter, isListValidation, type Cell, type CellStyle, type SheetSpec, type Validation } from './xlsxWriter.js';
import type { SheetMap } from './googleSheets.js';

// สร้างชีตตามประเภทธุรกิจ (owner, 2026-11-12, plan phase 1; research report "เทมเพลตบัญชีตามประเภทธุรกิจ 2568"). Five
// bookkeeping workbooks, picked from the six business questions (businessProfile.templateFor):
//   freelance       ฟรีแลนซ์ไม่จด VAT    รายรับ · รายจ่าย · ภาษีถูกหัก ณ ที่จ่าย · รายงานเงินสดรับ-จ่าย (40(5)–(8)) · สรุปภาษีรายปี
//   freelance_vat   ฟรีแลนซ์จด VAT       the same with VAT columns + รายงานภาษีขาย · รายงานภาษีซื้อ · สรุป ภ.พ.30
//   agency          เอเจนซี่              โปรเจกต์ · งบเทียบจริง · ค่าใช้จ่ายโปรเจกต์ · วางบิลและรับเงิน · ทะเบียนหัก ณ ที่จ่าย · ส่งบัญชีประจำเดือน
//   production      โปรดักชันเฮาส์         งาน · งบโปรดักชัน · ทีมงานและนักแสดง · เงินทดรอง · เคลียร์เงิน · ค่าใช้จ่ายและเช่าอุปกรณ์ · ...
//   office          สำนักงานบัญชี          ลูกค้า · เช็กลิสต์เอกสาร · ยื่นแบบรายเดือน · ติดตามเอกสาร · ปิดงบประจำปี · ตั้งค่า
// The tabs the law requires come first. Each amount is typed once; withheld tax, net received, budgets against actuals and
// monthly totals are formulas (SUMIFS, INDEX/MATCH, WORKDAY: Excel and Google Sheets both have them), ready for 200 rows.
// Example rows are invented and say so. With the app's own records the examples give way to them.

export interface TemplateIncome { date: string; payer: string; item: string; gross: number; whtRate: number; received: boolean }
export interface TemplateExpense { date: string; vendor: string; item: string; category: string; amount: number }
export interface TemplateData { income: TemplateIncome[]; expenses: TemplateExpense[] }

/** writes: the tabs เลขา adds a job / an expense to when the sheet was made from this template (สร้างชีตใหม่ให้ maps
 *  them at once; the budget and report tabs are never written into). The office workbook keeps no personal records. */
export const TEMPLATE_INFO: Record<TemplateId, { title: string; who: string; tabs: string[]; writes: { job?: string; expense?: string } }> = {
  freelance: { title: 'ฟรีแลนซ์ไม่จด VAT', who: 'โค้ช ครู นักศึกษารับงาน ครีเอเตอร์ ที่ยังไม่จด VAT', tabs: ['ตั้งค่า', 'รายรับ', 'รายจ่าย', 'ภาษีถูกหัก ณ ที่จ่าย', 'รายงานเงินสดรับ-จ่าย', 'สรุปภาษีรายปี'], writes: { job: 'รายรับ', expense: 'รายจ่าย' } },
  freelance_vat: { title: 'ฟรีแลนซ์จด VAT', who: 'บุคคลธรรมดาที่จดทะเบียนภาษีมูลค่าเพิ่มแล้ว', tabs: ['ตั้งค่า', 'รายรับ', 'รายจ่าย', 'ภาษีถูกหัก ณ ที่จ่าย', 'รายงานภาษีขาย', 'รายงานภาษีซื้อ', 'สรุป ภ.พ.30', 'สรุปภาษีรายปี'], writes: { job: 'รายรับ', expense: 'รายจ่าย' } },
  agency: { title: 'เอเจนซี่การตลาด / ครีเอทีฟ', who: 'บริษัทหรือห้างหุ้นส่วนจำกัดที่รับงานเป็นแคมเปญ', tabs: ['ตั้งค่า', 'โปรเจกต์', 'งบเทียบจริง', 'ค่าใช้จ่ายโปรเจกต์', 'วางบิลและรับเงิน', 'ทะเบียนหัก ณ ที่จ่าย', 'ส่งบัญชีประจำเดือน'], writes: { job: 'โปรเจกต์', expense: 'ค่าใช้จ่ายโปรเจกต์' } },
  production: { title: 'โปรดักชันเฮาส์', who: 'บริษัทหรือห้างหุ้นส่วนจำกัดที่รับงานถ่ายเป็นโปรเจกต์ มีทีมงานและเงินทดรอง', tabs: ['ตั้งค่า', 'งาน', 'งบโปรดักชัน', 'ทีมงานและนักแสดง', 'เงินทดรอง', 'เคลียร์เงิน', 'ค่าใช้จ่ายและเช่าอุปกรณ์', 'วางบิลและรับเงิน', 'ทะเบียนหัก ณ ที่จ่าย', 'ส่งบัญชีประจำเดือน'], writes: { job: 'งาน', expense: 'ค่าใช้จ่ายและเช่าอุปกรณ์' } },
  office: { title: 'สำนักงานบัญชี', who: 'ผู้รับทำบัญชีหรือสำนักงานที่ดูแลหลายกิจการ', tabs: ['ลูกค้า', 'เช็กลิสต์เอกสาร', 'ยื่นแบบรายเดือน', 'ติดตามเอกสาร', 'ปิดงบประจำปี', 'ตั้งค่า'], writes: {} },
};

const ROWS = 1000;
const LAST = ROWS + 1;
/** How far totals and look-ups read: well past the 200 ruled rows, so rows added below them are never left out. */
const END = 5000;
const BRICK = 'E65F2B';
/** Tab colours: brick where to start (วิธีใช้, ตั้งค่า), dark grey for tabs to fill in, light grey for reports. */
const TAB = { start: BRICK, input: '57534E', report: 'C9C5C0' };
const RATES = ['0%', '1%', '2%', '3%', '5%'];
const YES_NO = ['ใช่', 'ไม่ใช่'];
const q = (sheet: string) => `'${sheet}'`;
const col = (sheet: string, letter: string) => `${q(sheet)}!$${letter}$2:$${letter}$${END}`;
/** The tax / fiscal year typed in ตั้งค่า (B3, Buddhist era) as a Gregorian year for DATE(). */
const YEAR = `(${q('ตั้งค่า')}!$B$3-543)`;
/** A withholding rate cell: a number (Excel turns a picked "3%" into 0.03) or the text "3%" (Google Sheets keeps text). */
const rate = (ref: string) => `IF(ISNUMBER(${ref}),${ref},IFERROR(VALUE(SUBSTITUTE(${ref},"%",""))/100,0))`;
const sumMonth = (sheet: string, sumL: string, dateL: string, month: number, extra = '') =>
  `SUMIFS(${col(sheet, sumL)},${col(sheet, dateL)},">="&DATE(${YEAR},${month},1),${col(sheet, dateL)},"<"&DATE(${YEAR},${month + 1},1)${extra})`;
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
/** Lines of wrapped text a cell this wide needs (Thai, roughly 1.15 characters per width unit), as a row height. */
const tall = (text: string, width: number, line = 17) => Math.max(1, Math.ceil(text.length / (width * 1.15))) * line + 8;

// What is typed is checked as it is typed (owner, 2026-11-13, from the international template research). A tax ID is 13
// digits whose last one is the check digit (the civil registry formula the Revenue Department uses: the first twelve
// weighted 13 down to 2, eleven minus the sum mod 11, mod 10); a wrong one is asked about, never refused, since a
// foreign client has none. A branch code is 5 digits (00000 = head office). A date must fall in 2000–2100, so a
// Buddhist-era year typed as 13/11/2569 is refused with the way to fix it: SUMIFS by month and year need real dates.
const taxIdRule = (ref: string) => {
  const digit = (n: number) => `MID(${ref},${n},1)`;
  const weighted = Array.from({ length: 12 }, (_, i) => `${digit(i + 1)}*${13 - i}`).join('+');
  return `IFERROR(AND(LEN(${ref})=13,ISNUMBER(--${ref}),MOD(11-MOD(${weighted},11),10)=--${digit(13)}),FALSE())`;
};
const branchRule = (ref: string) => `IFERROR(AND(LEN(${ref})=5,ISNUMBER(--${ref})),FALSE())`;
export const TAX_ID_CHECK = { title: 'ตรวจเลขผู้เสียภาษี', error: 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก และหลักสุดท้ายต้องตรงกับเลขตรวจสอบ ตรวจกับใบกำกับภาษีหรือบัตรอีกครั้ง' };
const BRANCH_CHECK = { title: 'รหัสสาขา', error: 'รหัสสาขาเป็นตัวเลข 5 หลัก เช่น 00000 สำนักงานใหญ่ หรือ 00001 สาขาที่ 1' };
export const DATE_CHECK = { title: 'วันที่', error: 'กรอกวันที่เป็นปี ค.ศ. เช่น 13/11/2026 (ปี พ.ศ. ลบ 543) ชีตจึงรวมยอดตามเดือนได้ถูก' };
const DATE_RANGE = { from: '2000-01-01', to: '2100-12-31' };
const taxIdCheck = (range: string, ref: string): Validation => ({ range, custom: taxIdRule(ref), ...TAX_ID_CHECK, warn: true });

/** id: a tax ID or branch code column (text, keeps leading zeros). t: what the column means to เลขา when it adds a row
 *  (a sheet-map target such as date, name, amount); any other column is left alone. */
interface Col { h: string; w: number; s?: CellStyle; list?: string[]; f?: (r: number) => string; id?: boolean; t?: string }
/** What a formula column looks like: grey, so nobody types over it. */
const CALC: Partial<Record<CellStyle, CellStyle>> = { money: 'calc', text: 'calcText', date: 'calcDate', percent: 'calc' };
const columnStyle = (c: Col): CellStyle => (c.f ? CALC[c.s ?? 'money'] ?? 'calc' : c.id ? 'idText' : c.list ? 'choice' : c.s === 'text' ? 'choice' : c.s ?? 'cell');
/** A worked-out column says so in its header too, not by grey alone (accessibility: colour is never the only cue). */
export const CALC_MARK = ' (คำนวณ)';

/** A data tab like a printed ledger: the brick header row (frozen, printed on every page), then 1,000 ruled rows with the
 *  formula columns filled in grey and the drop-downs set. The header stays in row 1: เลขา writes the rows below it. */
function table(name: string, cols: Col[], rows: Cell[][], tabColor = TAB.input): SheetSpec {
  const styles = cols.map(columnStyle);
  const header: Cell[] = cols.map(c => ({ v: c.f ? `${c.h}${CALC_MARK}` : c.h, s: 'header' }));
  const body: Cell[][] = [];
  for (let i = 0; i < ROWS; i += 1) {
    const r = i + 2;
    const given = rows[i];
    body.push(cols.map((c, j) => {
      if (c.f) return { f: c.f(r), s: styles[j] };
      const cell = given?.[j] ?? null;
      // A value given as plain text keeps the column's look (lines, centring).
      return cell && typeof cell === 'object' && 'v' in cell && cell.s === 'text' ? { v: cell.v, s: styles[j] } : cell;
    }));
  }
  return {
    name, rows: [header, ...body], widths: cols.map(c => c.w), freezeRows: 1, columnStyles: Object.fromEntries(styles.map((s, j) => [j, s])), tabColor,
    targets: cols.map(c => (c.f ? 'keep' : c.t ?? 'keep')),
    heights: { 0: 34 }, defaultHeight: 21, gridlines: false, print: { landscape: true, repeatHeader: true },
    validations: cols.flatMap((c, j): Validation[] => {
      const letter = columnLetter(j); const range = `${letter}2:${letter}${END}`; const ref = `${letter}2`;
      if (c.list) return [{ range, list: c.list }];
      if (c.id && /ผู้เสียภาษี/.test(c.h)) return [taxIdCheck(range, ref)];
      if (c.id && /สาขา/.test(c.h)) return [{ range, custom: branchRule(ref), ...BRANCH_CHECK, warn: true }];
      if (!c.f && c.s === 'date') return [{ range, date: DATE_RANGE, ...DATE_CHECK }];
      return [];
    }),
  };
}

/** ตั้งค่า as a form: the title in A1, labels on grey, white boxes to fill in; the year always in B3. */
function settingsTab(title: string, pairs: [string, Cell][], extra: Cell[][] = []): SheetSpec {
  const box = (value: Cell): Cell => (value && typeof value === 'object' && 'v' in value
    ? { v: value.v, s: value.s === 'percent' ? 'inputPercent' : 'input' } : typeof value === 'string' ? { v: value, s: 'input' } : value ?? { v: '', s: 'input' });
  const idBox = (label: string, value: Cell): Cell => (/เลข.*ผู้เสียภาษี/.test(label) ? { v: typeof value === 'string' ? value : '', s: 'inputText' } : box(value));
  const heights: Record<number, number> = { 0: 34, 1: 22 };
  pairs.forEach((_, i) => { heights[i + 2] = 26; });
  const checks = pairs.flatMap(([label], i): Validation[] => (/เลข.*ผู้เสียภาษี/.test(label) ? [taxIdCheck(`B${i + 3}`, `B${i + 3}`)] : []));
  return {
    name: 'ตั้งค่า', tabColor: TAB.start, widths: [32, 40, 4, 26, 16, 16, 30], gridlines: false, heights, defaultHeight: 21,
    ...(checks.length ? { validations: checks } : {}),
    rows: [[{ v: title, s: 'title' }], [{ v: 'กรอกช่องสีขาว ตัวเลขในแท็บอื่นใช้ข้อมูลจากหน้านี้', s: 'subtitle' }],
      ...pairs.map(([label, value]) => [{ v: label, s: 'label' }, idBox(label, value)] as Cell[]), ...extra],
  };
}

/** What each tab is for and when it is filled in, for the cover page. */
const TAB_GUIDE: Record<string, [string, string]> = {
  'ตั้งค่า': ['ชื่อ เลขผู้เสียภาษี และปี ทุกแท็บอ่านจากหน้านี้', 'ครั้งแรกครั้งเดียว'],
  'รายรับ': ['เงินเข้าแต่ละครั้ง ภาษีถูกหักและเงินเข้าจริงคำนวณให้', 'ทุกครั้งที่เงินเข้า'],
  'รายจ่าย': ['จ่ายเพื่องานแต่ละครั้ง พร้อมหลักฐาน', 'ทุกครั้งที่จ่าย'],
  'ภาษีถูกหัก ณ ที่จ่าย': ['ถูกหักเดือนละเท่าไร และยังขาด 50 ทวิ กี่ใบ', 'ดูอย่างเดียว'],
  'รายงานเงินสดรับ-จ่าย': ['รายงานที่กฎหมายบังคับ สรุปเป็นรายเดือน', 'ดูอย่างเดียว'],
  'รายงานภาษีขาย': ['ตามแบบกรมสรรพากร เลือกเดือนภาษีแล้วพิมพ์เก็บ', 'ทุกเดือน'],
  'รายงานภาษีซื้อ': ['ตามแบบกรมสรรพากร เฉพาะใบที่ขอคืนภาษีซื้อได้', 'ทุกเดือน'],
  'สรุป ภ.พ.30': ['ภาษีที่ต้องชำระและวันยื่นของแต่ละเดือน', 'ดูอย่างเดียว'],
  'สรุปภาษีรายปี': ['เงินได้แยกประเภท ครึ่งปีและทั้งปี เฝ้าเกณฑ์ VAT', 'ดูอย่างเดียว'],
  'โปรเจกต์': ['หนึ่งแถวต่อแคมเปญ ต้นทุนและกำไรคำนวณให้', 'เมื่อได้งานใหม่'],
  'งบเทียบจริง': ['งบแต่ละหมวด เทียบกับที่ใช้จริง', 'ตอนวางงบ'],
  'ค่าใช้จ่ายโปรเจกต์': ['จ่ายแต่ละครั้ง ภาษีหักและแบบที่ต้องยื่นขึ้นให้', 'ทุกครั้งที่จ่าย'],
  'วางบิลและรับเงิน': ['ใบแจ้งหนี้ ยอดที่ควรได้ และค้างกี่วัน', 'เมื่อวางบิลหรือรับเงิน'],
  'ทะเบียนหัก ณ ที่จ่าย': ['ภ.ง.ด.3 / 53 / 54 รายเดือน และวันยื่น', 'ดูอย่างเดียว'],
  'ส่งบัญชีประจำเดือน': ['เช็กเอกสารก่อนส่งนักบัญชี', 'ต้นเดือน'],
  'งาน': ['หนึ่งแถวต่องาน งบ ใช้จริง และกำไร', 'เมื่อได้งานใหม่'],
  'งบโปรดักชัน': ['คน × วัน × ราคา เทียบกับที่ใช้จริง', 'ตอนวางงบ'],
  'ทีมงานและนักแสดง': ['ค่าตัว ภาษีหัก และจ่ายสุทธิ', 'ทุกครั้งที่จ่ายค่าตัว'],
  'เงินทดรอง': ['ใบเบิกแต่ละก้อน และวันที่ต้องเคลียร์', 'เมื่อเบิกเงิน'],
  'เคลียร์เงิน': ['หลักฐานทุกใบของแต่ละใบเบิก', 'หลังใช้เงิน'],
  'ค่าใช้จ่ายและเช่าอุปกรณ์': ['จ่ายตรง เช่าอุปกรณ์ และมัดจำ', 'ทุกครั้งที่จ่าย'],
  'ลูกค้า': ['หนึ่งแถวต่อลูกค้า', 'เมื่อรับลูกค้าใหม่'],
  'เช็กลิสต์เอกสาร': ['เอกสารแต่ละเดือนของลูกค้าแต่ละราย', 'ทุกเดือน'],
  'ยื่นแบบรายเดือน': ['แบบที่ต้องยื่น และกำหนดส่งหลังเลื่อนวันหยุด', 'ทุกเดือน'],
  'ติดตามเอกสาร': ['เรื่องที่ขาด และวันที่ขอให้ลูกค้าส่ง', 'เมื่อพบเอกสารขาด'],
  'ปิดงบประจำปี': ['กำหนดส่งงบ DBD และ ภ.ง.ด.50', 'ปีละครั้ง'],
};

/** The cover page (วิธีใช้): the workbook's name and year, its tabs, the steps, what the colours mean. */
function howTo(info: { title: string; who: string }, tabs: string[], lines: string[], yearLabel: string): SheetSpec {
  // No joined cells (owner, 2026-11-13, from the research: they break sorting, copying and screen readers): a long line
  // wraps inside column B, the widest one.
  const rows: Cell[][] = []; const heights: Record<number, number> = {};
  const add = (row: Cell[], height?: number) => {
    if (height) heights[rows.length] = height;
    rows.push(row);
  };
  const section = (title: string) => { add([null], 14); add([{ v: title, s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }], 28); add([null], 8); };
  add([{ v: '', s: 'bar' }, { v: '', s: 'bar' }, { v: '', s: 'bar' }], 5);
  add([null], 14);
  add([{ v: 'กระรอกตุนเงิน · ชีตบัญชี', s: 'kicker' }], 18);
  add([{ v: info.title, s: 'title' }], 36);
  add([{ v: `สำหรับ${info.who}`, s: 'subtitle' }], 20);
  add([{ f: `"${yearLabel} "&${q('ตั้งค่า')}!$B$3`, s: 'subtitle' }], 20);
  section('แท็บในไฟล์นี้');
  add([{ v: 'แท็บ', s: 'header' }, { v: 'ใช้ทำอะไร', s: 'header' }, { v: 'กรอกเมื่อไร', s: 'header' }], 28);
  for (const tab of tabs) {
    const [what, when] = TAB_GUIDE[tab] ?? ['', ''];
    add([{ v: tab, s: 'label' }, { v: what, s: 'cellWrap' }, { v: when, s: 'choice' }], 24);
  }
  section('เริ่มใช้งาน');
  lines.forEach((line, i) => {
    const text = line.replace(/^\d+\.\s*/, '');
    add([{ v: i + 1, s: 'step' }, { v: text, s: 'text' }], tall(text, 62));
  });
  section('สีในชีต');
  ([['ช่องสีขาว', 'choice', 'กรอกเองได้'], ['ช่องสีเทา', 'calcText', 'ชีตคำนวณให้ อย่าพิมพ์ทับ'], ['หัวตาราง', 'header', 'ชื่อคอลัมน์ เลขากระรอกใช้หาช่องที่จะลงรายการ ไม่ควรแก้'], ['มีลูกศร ▾', 'choice', 'คลิกแล้วเลือกจากรายการ']] as const)
    .forEach(([sample, style, meaning]) => add([{ v: sample, s: style }, { v: meaning, s: 'text' }], Math.max(26, tall(meaning, 62))));
  add([null], 18);
  const disclaimer = 'ชีตนี้ช่วยจดและสรุปตัวเลข ไม่ได้ยื่นแบบแทนคุณ ตัวเลขภาษีเป็นประมาณการ ตรวจกับนักบัญชีหรือกรมสรรพากรก่อนยื่นจริง';
  add([null, { v: disclaimer, s: 'note' }], tall(disclaimer, 62, 15));
  add([null, { v: 'สร้างโดยกระรอกตุนเงิน · krarok.com', s: 'note' }], 18);
  return { name: 'วิธีใช้', widths: [20, 62, 22], tabColor: TAB.start, gridlines: false, heights, defaultHeight: 21, rows, print: {} };
}

// The header of a report, as on the Revenue Department's forms: who keeps it and their tax ID, the place of business and
// head office or branch, the year. Blank settings show a dotted line, like a paper form.
const SET = q('ตั้งค่า');
const filled = (ref: string) => `IF(${SET}!${ref}="","..............................",${SET}!${ref})`;
/** ผู้ประกอบการ and เลขประจำตัวผู้เสียภาษีอากร (ตั้งค่า B4, B5 in every workbook). */
const whoLine = () => `"ชื่อผู้ประกอบการ  "&${filled('$B$4')}&"      เลขประจำตัวผู้เสียภาษีอากร  "&${filled('$B$5')}`;
/** สถานประกอบการ and สำนักงานใหญ่ / สาขา: a person's B6 (else the name) and B7; a company's name and B6. */
const placeLine = (who: 'person' | 'company') => (who === 'person'
  ? `"สถานประกอบการ  "&IF(${SET}!$B$6="",${filled('$B$4')},${SET}!$B$6)&"      "&${filled('$B$7')}`
  : `"สถานประกอบการ  "&${filled('$B$4')}&"      "&${filled('$B$6')}`);

/** First data row of a report tab: row 1 title, rows 2–3 who and where, row 4 space, row 5 the header. */
const R0 = 6;
/** A report tab (worked out from the others): its title, the official header lines, the table, the notes under it. */
function report(name: string, title: string, yearLabel: string, header: string[], body: Cell[][], widths: number[], notes: string[], landscape = false, who: 'person' | 'company' = 'person'): SheetSpec {
  const last = columnLetter(header.length - 1);
  const rows: Cell[][] = [
    [{ v: title, s: 'title' }],
    [{ f: whoLine(), s: 'subtitle' }],
    [{ f: `${placeLine(who)}&"      ${yearLabel} "&${SET}!$B$3`, s: 'subtitle' }],
    [null],
    header.map(v => ({ v, s: 'header' as const })),
    ...body,
  ];
  const heights: Record<number, number> = { 0: 34, 1: 22, 2: 22, 3: 10, 4: 34 };
  const merges: string[] = [];
  const width = widths.reduce((sum, w) => sum + w, 0);
  for (const note of notes) {
    rows.push([null]); heights[rows.length - 1] = 10;
    rows.push([{ v: note, s: 'note' }]); heights[rows.length - 1] = tall(note, width, 15);
    merges.push(`A${rows.length}:${last}${rows.length}`);
  }
  return { name, rows, widths, tabColor: TAB.report, gridlines: false, heights, merges, defaultHeight: 22, print: { landscape } };
}
/** A month row's first cell, and a totals row. */
const monthCell = (name: string): Cell => ({ v: name, s: 'cell' });
const totals = (label: string, letters: string[], from = R0, to = R0 + 11): Cell[] =>
  [{ v: label, s: 'totalLabel' }, ...letters.map(l => ({ f: `SUM(${l}${from}:${l}${to})`, s: 'total' as const }))];

const today = (now: Date) => now.toISOString().slice(0, 10);

/** The month picked on a VAT report (C4), and the ลำดับในรายงาน formula of a รายรับ / รายจ่าย row: its place among the
 *  month's tax invoices (a running count), or blank when it is not one of them. */
const vatMonth = (report: string) => `VALUE(${q(report)}!$C$4&"")`;
function inMonth(report: string, r: number, value: string, skip = '', more = ''): string {
  const m = vatMonth(report);
  const from = `DATE(${YEAR},${m},1)`; const to = `DATE(${YEAR},${m}+1,1)`;
  return `IF(OR($A${r}="",$${value}${r}=""${skip ? `,${skip}` : ''}),"",IF(AND($A${r}>=${from},$A${r}<${to}),COUNTIFS($A$2:$A${r},">="&${from},$A$2:$A${r},"<"&${to},$${value}$2:$${value}${r},"<>"${more}),""))`;
}
const VAT_SLOTS = 100;
/** รายงานภาษีขาย / ภาษีซื้อ in the Revenue Department's layout (ประกาศอธิบดีฯ VAT ฉบับที่ 89, columns per ฉบับที่ 197 and 202;
 *  a spreadsheet is allowed, ข้อ 10): the header (ผู้ประกอบการ, เลขประจำตัว, สถานประกอบการ, สาขา, เดือนภาษี picked in C4),
 *  one line per tax invoice of that month in the order entered, the total. Dates in พ.ศ. */
function vatReport(kind: 'ขาย' | 'ซื้อ', month = 1): SheetSpec {
  const name = `รายงานภาษี${kind}`;
  const src = kind === 'ขาย' ? 'รายรับ' : 'รายจ่าย';
  const seq = kind === 'ขาย' ? 'O' : 'M';
  const first = 7; const last = first + VAT_SLOTS - 1;
  const pick = (letter: string, r: number) => `INDEX(${q(src)}!$${letter}$2:$${letter}$${END},MATCH($A${r},${q(src)}!$${seq}$2:$${seq}$${END},0))`;
  const shown = (r: number, inner: string) => `IF($A${r}="","",${inner})`;
  const buddhist = (r: number) => { const d = pick('A', r); return `TEXT(DAY(${d}),"00")&"/"&TEXT(MONTH(${d}),"00")&"/"&(YEAR(${d})+543)`; };
  const party = kind === 'ขาย' ? 'ผู้ซื้อสินค้า / ผู้รับบริการ' : 'ผู้ขายสินค้า / ผู้ให้บริการ';
  const header = ['ลำดับที่', 'วัน เดือน ปี', 'เลขที่ / เล่มที่', `ชื่อ${party}`, `เลขประจำตัวผู้เสียภาษีอากรของ${kind === 'ขาย' ? 'ผู้ซื้อ' : 'ผู้ขาย'}`,
    'สำนักงานใหญ่ / สาขาที่', 'มูลค่าสินค้าหรือบริการ', 'จำนวนเงินภาษีมูลค่าเพิ่ม'];
  const rows: Cell[][] = [
    [{ v: name, s: 'title' }],
    [{ f: whoLine(), s: 'subtitle' }],
    [{ f: placeLine('person'), s: 'subtitle' }],
    [null, { v: 'เดือนภาษี', s: 'label' }, { v: month, s: 'input' }, { f: `CHOOSE(VALUE($C$4&""),${MONTHS.map(m => `"${m}"`).join(',')})&"  พ.ศ. "&${SET}!$B$3`, s: 'calcText' }],
    [null],
    header.map(v => ({ v, s: 'header' as const })),
  ];
  for (let r = first; r <= last; r += 1) {
    rows.push([
      { f: `IF(COUNT(${q(src)}!$${seq}$2:$${seq}$${END})>=ROW()-${first - 1},ROW()-${first - 1},"")`, s: 'choice' },
      { f: shown(r, buddhist(r)), s: 'choice' }, { f: shown(r, pick('B', r)), s: 'cell' }, { f: shown(r, pick('C', r)), s: 'cell' },
      { f: shown(r, pick('D', r)), s: 'idText' }, { f: shown(r, pick('E', r)), s: 'idText' },
      { f: shown(r, pick('H', r)), s: 'figure' }, { f: shown(r, pick('I', r)), s: 'figure' },
    ]);
  }
  rows.push([{ v: 'รวม', s: 'totalLabel' }, ...Array.from({ length: 5 }, (): Cell => ({ v: '', s: 'totalLabel' })),
    { f: `SUM(G${first}:G${last})`, s: 'total' }, { f: `SUM(H${first}:H${last})`, s: 'total' }]);
  const notes = [
    'ทำตามประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีมูลค่าเพิ่ม (ฉบับที่ 89) และแบบตามฉบับที่ 202: เลือกเดือนภาษีที่ช่องสีขาวด้านบน ลงรายการภายใน 3 วันทำการ แยกรายงานแต่ละสถานประกอบการ แล้วพิมพ์หรือบันทึกเป็น PDF เก็บทุกเดือน',
    ...(kind === 'ซื้อ' ? ['ลงใบกำกับภาษีซื้อทีละใบ เฉพาะใบที่ขอคืนภาษีซื้อได้ (แท็บรายจ่าย ช่อง ขอคืนภาษีซื้อได้ = ใช่)'] : []),
    'สาขาของคู่ค้าใส่เป็นเลข 5 หลัก 00000 คือสำนักงานใหญ่ 00001 คือสาขาที่ 1 รายงานนี้แสดงได้ 100 ใบต่อเดือน',
  ];
  const heights: Record<number, number> = { 0: 34, 1: 22, 2: 22, 3: 26, 4: 10, 5: 50 };
  const merges: string[] = [];
  for (const note of notes) {
    rows.push([null]); heights[rows.length - 1] = 10;
    rows.push([{ v: note, s: 'note' }]); heights[rows.length - 1] = tall(note, 134, 15);
    merges.push(`A${rows.length}:H${rows.length}`);
  }
  return {
    name, rows, widths: [8, 13, 16, 30, 20, 13, 17, 17], tabColor: TAB.report, gridlines: false, heights, merges, defaultHeight: 21, freezeRows: 6,
    print: { landscape: true, repeatHeader: true }, validations: [{ range: 'C4:C4', list: MONTHS.map((_, i) => String(i + 1)) }],
  };
}

// ── 1–2 Freelancers ───────────────────────────────────────────────────────────────────────────────────────────────
const INCOME_TYPES = ['40(2)', '40(5)', '40(6)', '40(7)', '40(8)', 'อื่น ๆ'];
const EXPENSE_CATEGORIES = ['ซื้อสินค้า', 'อุปกรณ์', 'ซอฟต์แวร์', 'เดินทาง', 'ค่าจ้างช่วง', 'ค่าสถานที่', 'โทรศัพท์-เน็ต', 'อื่น ๆ'];
const EVIDENCE = ['ใบกำกับภาษีเต็มรูป', 'ใบกำกับภาษีอย่างย่อ', 'ใบเสร็จ', 'ไม่มี'];

function freelance(profile: BusinessProfile, year: number, vat: boolean, data: TemplateData | null, now: Date): SheetSpec[] {
  const info = TEMPLATE_INFO[vat ? 'freelance_vat' : 'freelance'];
  const cash = !vat && hasSection40_5to8(profile);
  // รายรับ: one row per payment received.
  const incomeCols: Col[] = vat ? [
    { h: 'วันที่รับเงิน', w: 13, s: 'date', t: 'paidDate' }, { h: 'เลขที่ใบกำกับภาษี', w: 16 }, { h: 'ผู้ซื้อ / ผู้จ่ายเงิน', w: 28, t: 'client' }, { h: 'เลขผู้เสียภาษีผู้ซื้อ', w: 18, id: true },
    { h: 'สาขาผู้ซื้อ', w: 11, id: true }, { h: 'รายการ', w: 26, t: 'name' }, { h: 'ประเภทเงินได้', w: 12, list: INCOME_TYPES }, { h: 'มูลค่าก่อน VAT', w: 15, s: 'money', t: 'value' },
    { h: 'VAT 7%', w: 12, f: r => `IF(H${r}="","",ROUND(H${r}*0.07,2))` }, { h: 'อัตราหัก', w: 9, list: RATES, t: 'whtRate' },
    { h: 'ภาษีถูกหัก', w: 12, f: r => `IF(H${r}="","",ROUND(H${r}*${rate(`J${r}`)},2))` },
    { h: 'เงินเข้าจริง', w: 14, f: r => `IF(H${r}="","",H${r}+I${r}-K${r})` },
    { h: 'ได้ 50 ทวิ แล้ว', w: 14, list: ['ได้แล้ว', 'ยังไม่ได้', 'ไม่ต้องใช้'] }, { h: 'หมายเหตุ', w: 26, t: 'note' },
    { h: 'ลำดับในรายงานภาษีขาย', w: 14, s: 'text', f: r => inMonth('รายงานภาษีขาย', r, 'H') },
  ] : [
    { h: 'วันที่รับเงิน', w: 13, s: 'date', t: 'paidDate' }, { h: 'ผู้จ่ายเงิน', w: 28, t: 'client' }, { h: 'เลขผู้เสียภาษีผู้จ่าย', w: 18, id: true }, { h: 'รายการ', w: 26, t: 'name' },
    { h: 'ประเภทเงินได้', w: 12, list: INCOME_TYPES }, { h: 'ยอดก่อนหัก', w: 14, s: 'money', t: 'value' }, { h: 'อัตราหัก', w: 9, list: RATES, t: 'whtRate' },
    { h: 'ภาษีถูกหัก', w: 12, f: r => `IF(F${r}="","",ROUND(F${r}*${rate(`G${r}`)},2))` },
    { h: 'เงินเข้าจริง', w: 14, f: r => `IF(F${r}="","",F${r}-H${r})` },
    { h: 'หลักฐานการหัก', w: 14, list: ['50 ทวิ', 'e-WHT', 'ไม่ถูกหัก'] }, { h: 'ได้ 50 ทวิ แล้ว', w: 14, list: ['ได้แล้ว', 'ยังไม่ได้', 'ไม่ต้องใช้'] }, { h: 'หมายเหตุ', w: 26, t: 'note' },
  ];
  const incomeRows: Cell[][] = data?.income.length
    ? data.income.map(row => vat
      ? [{ date: row.date }, '', row.payer, '', '', row.item, '', row.gross, null, `${Math.round(row.whtRate * 100)}%`, null, null, row.whtRate > 0 ? 'ยังไม่ได้' : 'ไม่ต้องใช้', row.received ? '' : 'ยังไม่ได้รับเงิน', null]
      : [{ date: row.date }, row.payer, '', row.item, '', row.gross, `${Math.round(row.whtRate * 100)}%`, null, null, row.whtRate > 0 ? '50 ทวิ' : 'ไม่ถูกหัก', row.whtRate > 0 ? 'ยังไม่ได้' : 'ไม่ต้องใช้', row.received ? '' : 'ยังไม่ได้รับเงิน'])
    : vat ? [
      [{ date: `${year}-02-05` }, 'INV-001', 'บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)', '0000000000101', '00000', 'รีวิวสินค้า 2 คลิป', '40(2)', 40000, null, '3%', null, null, 'ได้แล้ว', '', null],
      [{ date: `${year}-03-20` }, 'INV-002', 'ร้านสมมติการค้า (ตัวอย่าง)', '0000000000102', '00000', 'ออกแบบโลโก้', '40(8)', 15000, null, '0%', null, null, 'ไม่ต้องใช้', 'ผู้จ่ายเป็นบุคคล ไม่ได้หัก', null],
    ] : [
      [{ date: `${year}-02-05` }, 'บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)', '0000000000101', 'รีวิวสินค้า 2 คลิป', '40(2)', 12000, '3%', null, null, '50 ทวิ', 'ได้แล้ว', ''],
      [{ date: `${year}-03-20` }, 'สถาบันสมมติการเรียนรู้ (ตัวอย่าง)', '0000000000102', 'สอนเวิร์กช็อป 1 วัน', '40(2)', 8500, '0%', null, null, 'ไม่ถูกหัก', 'ไม่ต้องใช้', 'ไม่ถูกหัก แต่ยังนับเป็นเงินได้'],
      [{ date: `${year}-01-14` }, 'บริษัท ทดลองดีไซน์ จำกัด (ตัวอย่าง)', '0000000000103', 'ออกแบบโลโก้', '40(8)', 20000, '1%', null, null, 'e-WHT', 'ไม่ต้องใช้', ''],
    ];
  // Column letters in รายรับ that the other tabs read.
  const I = vat ? { date: 'A', type: 'G', gross: 'H', wht: 'K', got: 'M' } : { date: 'A', type: 'E', gross: 'F', wht: 'H', got: 'K' };

  const expenseCols: Col[] = vat ? [
    { h: 'วันที่จ่ายเงิน', w: 13, s: 'date', t: 'date' }, { h: 'เลขที่ใบกำกับภาษี', w: 16 }, { h: 'ผู้ขาย / ผู้รับเงิน', w: 26 }, { h: 'เลขผู้เสียภาษีผู้ขาย', w: 18, id: true },
    { h: 'สาขาผู้ขาย', w: 11, id: true }, { h: 'รายการ', w: 26, t: 'name' }, { h: 'หมวด', w: 14, list: EXPENSE_CATEGORIES, t: 'category' }, { h: 'มูลค่าก่อน VAT', w: 15, s: 'money', t: 'amount' },
    { h: 'ภาษีซื้อ', w: 12, s: 'money' }, { h: 'ขอคืนภาษีซื้อได้', w: 14, list: YES_NO }, { h: 'หลักฐาน', w: 18, list: EVIDENCE }, { h: 'ลิงก์ไฟล์', w: 22 },
    { h: 'ลำดับในรายงานภาษีซื้อ', w: 14, s: 'text', f: r => inMonth('รายงานภาษีซื้อ', r, 'H', `$J${r}<>"ใช่"`, `,$J$2:$J${r},"ใช่"`) },
  ] : [
    { h: 'วันที่จ่ายเงิน', w: 13, s: 'date', t: 'date' }, { h: 'ผู้ขาย / ผู้รับเงิน', w: 26 }, { h: 'รายการ', w: 26, t: 'name' }, { h: 'หมวด', w: 14, list: EXPENSE_CATEGORIES, t: 'category' },
    { h: 'ใช้เพื่องาน', w: 11, list: ['ใช่', 'ใช้ร่วม', 'ส่วนตัว'] }, { h: 'สัดส่วนใช้งาน', w: 12, s: 'percent' }, { h: 'จำนวนเงิน', w: 14, s: 'money', t: 'amount' },
    { h: 'หลักฐาน', w: 18, list: EVIDENCE },
    { h: 'นับเป็นค่าใช้จ่ายได้', w: 16, f: r => `IF(G${r}="","",IF(OR(H${r}="ไม่มี",E${r}="ส่วนตัว"),0,ROUND(G${r}*IF(E${r}="ใช้ร่วม",IF(F${r}="",1,F${r}),1),2)))` },
    { h: 'ลิงก์ไฟล์', w: 22 },
  ];
  const expenseRows: Cell[][] = data?.expenses.length
    ? data.expenses.map(row => vat
      ? [{ date: row.date }, '', row.vendor, '', '', row.item, mapCategory(row.category), row.amount, 0, 'ไม่ใช่', '', '', null]
      : [{ date: row.date }, row.vendor, row.item, mapCategory(row.category), 'ใช่', 1, row.amount, '', null, ''])
    : vat ? [
      [{ date: `${year}-02-10` }, 'IV6902-0425', 'ร้านกล้องสมมติ (ตัวอย่าง)', '0000000000201', '00000', 'ไมโครโฟนไร้สาย', 'อุปกรณ์', 3261.68, 228.32, 'ใช่', 'ใบกำกับภาษีเต็มรูป', '', null],
    ] : [
      [{ date: `${year}-02-10` }, 'ร้านกล้องสมมติ (ตัวอย่าง)', 'ไมโครโฟนไร้สาย', 'อุปกรณ์', 'ใช่', 1, 3490, 'ใบกำกับภาษีเต็มรูป', null, ''],
      [{ date: `${year}-03-15` }, 'ปั๊มน้ำมันสมมติ (ตัวอย่าง)', 'น้ำมันรถไปถ่ายงาน', 'เดินทาง', 'ใช้ร่วม', 0.5, 1200, 'ใบกำกับภาษีอย่างย่อ', null, ''],
    ];

  // ภาษีถูกหัก ณ ที่จ่าย: by month, from รายรับ.
  const whtBody: Cell[][] = MONTHS.map((name, i) => {
    const m = i + 1;
    return [monthCell(name), { f: sumMonth('รายรับ', I.gross, I.date, m), s: 'figure' }, { f: sumMonth('รายรับ', I.wht, I.date, m), s: 'figure' },
      { f: `COUNTIFS(${col('รายรับ', I.date)},">="&DATE(${YEAR},${m},1),${col('รายรับ', I.date)},"<"&DATE(${YEAR},${m + 1},1),${col('รายรับ', I.got)},"ยังไม่ได้")`, s: 'choice' }];
  });
  whtBody.push(totals('รวมทั้งปี', ['B', 'C', 'D']));
  const tabs = info.tabs.filter(tab => cash || tab !== 'รายงานเงินสดรับ-จ่าย');

  const sheets: SheetSpec[] = [
    howTo(info, tabs, [
      '1. กรอกแท็บ ตั้งค่า ก่อน (ชื่อ เลขประจำตัวผู้เสียภาษี ปีภาษี)',
      '2. ทุกครั้งที่เงินเข้า เพิ่มหนึ่งแถวในแท็บ รายรับ ใช้วันที่เงินเข้าจริง ภาษีถูกหักและเงินเข้าจริงคำนวณให้เอง',
      '3. ทุกครั้งที่จ่ายเงินเพื่องาน เพิ่มหนึ่งแถวในแท็บ รายจ่าย และเก็บใบเสร็จหรือใบกำกับภาษีไว้ แถวที่ไม่มีหลักฐานจะไม่ถูกนับ',
      '4. แท็บ ภาษีถูกหัก ณ ที่จ่าย บอกว่าแต่ละเดือนถูกหักไปเท่าไร และยังขาด 50 ทวิ กี่ใบ',
      ...(cash ? ['5. แท็บ รายงานเงินสดรับ-จ่าย คือสรุปรายเดือนของรายงานที่กฎหมายบังคับ (เงินได้ 40(5)–(8) และไม่จด VAT) ลงรายการภายใน 3 วันทำการ'] : []),
      ...(vat ? ['5. จด VAT แล้ว: ภาษีขายคิดจากแท็บรายรับ ภาษีซื้อจากแท็บรายจ่าย แท็บ สรุป ภ.พ.30 บอกยอดที่ต้องชำระทุกเดือน แม้ไม่มียอดขาย ต้องยื่น',
        '6. รายงานภาษีขายและภาษีซื้อทำตามแบบของกรมสรรพากร เลือกเดือนภาษีที่ช่องสีขาวในแท็บนั้น แล้วพิมพ์หรือบันทึกเป็น PDF เก็บทุกเดือน ใส่สาขาของคู่ค้าเป็นเลข 5 หลัก (00000 คือสำนักงานใหญ่)'] : []),
    ], 'ปีภาษี'),
    settingsTab('ข้อมูลผู้ประกอบกิจการ', [
      ['ปีภาษี (พ.ศ.)', { v: year + 543, s: 'text' }],
      ['ชื่อผู้ประกอบกิจการ', ''], ['เลขประจำตัวผู้เสียภาษี', ''], ['ชื่อสถานประกอบการ (ถ้ามี)', ''], ['สำนักงานใหญ่ / สาขา', 'สำนักงานใหญ่'],
      ['สถานะ VAT', vat ? 'จดแล้ว' : 'ยังไม่จด'],
      ['ประเภทเงินได้หลัก', profile.income === 'per_job' ? '40(2)' : profile.income === 'profession' ? '40(6)' : profile.income === 'own_business' ? '40(8)' : 'หลายประเภท'],
      ['กันเงินไว้จ่ายภาษี (%)', { v: 0.05, s: 'percent' }],
    ]),
    table('รายรับ', incomeCols, incomeRows),
    table('รายจ่าย', expenseCols, expenseRows),
    report('ภาษีถูกหัก ณ ที่จ่าย', 'ภาษีถูกหัก ณ ที่จ่าย', 'ปีภาษี', ['เดือน', 'เงินได้รวม', 'ภาษีถูกหักรวม', '50 ทวิ ที่ยังไม่ได้ (ใบ)'], whtBody, [18, 20, 20, 22],
      ['ภาษีที่ถูกหักไว้ใช้เป็นเครดิตตอนยื่น ภ.ง.ด.90 (และ ภ.ง.ด.94 สำหรับเงินได้ 40(5)–(8)) เก็บ 50 ทวิ ให้ครบทุกใบ']),
  ];

  if (cash) {
    const cashBody: Cell[][] = MONTHS.map((name, i) => {
      const m = i + 1; const r = i + R0;
      return [monthCell(name),
        { f: ['40(5)', '40(6)', '40(7)', '40(8)'].map(type => sumMonth('รายรับ', I.gross, I.date, m, `,${col('รายรับ', I.type)},"${type}"`)).join('+'), s: 'figure' },
        { f: sumMonth('รายจ่าย', 'I', 'A', m, `,${col('รายจ่าย', 'D')},"ซื้อสินค้า"`), s: 'figure' },
        { f: `${sumMonth('รายจ่าย', 'I', 'A', m)}-C${r}`, s: 'figure' },
        { f: `B${r}-C${r}-D${r}`, s: 'figure' }];
    });
    cashBody.push(totals('รวมทั้งปี', ['B', 'C', 'D', 'E']));
    sheets.push(report('รายงานเงินสดรับ-จ่าย', 'รายงานเงินสดรับ-จ่าย', 'ปีภาษี', ['เดือน', 'รายรับ 40(5)–(8)', 'รายจ่าย ซื้อสินค้า', 'รายจ่าย ค่าใช้จ่ายอื่น ๆ', 'กำไร'], cashBody, [18, 20, 20, 22, 18],
      ['รายงานเงินสดรับ-จ่ายตามประกาศอธิบดีฯ (ฉบับที่ 161): บุคคลธรรมดาที่ไม่จด VAT และมีเงินได้ 40(5)–(8) ต้องลงรายการภายใน 3 วันทำการ รายการละเอียดอยู่ในแท็บรายรับและรายจ่าย แท็บนี้สรุปเป็นรายเดือน']));
  }

  if (vat) {
    // Opens on this month when the workbook is for this year.
    const month = now.getFullYear() === year ? now.getMonth() + 1 : 1;
    sheets.push(vatReport('ขาย', month), vatReport('ซื้อ', month));
    const pp30: Cell[][] = MONTHS.map((name, i) => {
      const m = i + 1; const r = i + R0;
      return [monthCell(name), { f: sumMonth('รายรับ', 'H', 'A', m), s: 'figure' }, { f: sumMonth('รายรับ', 'I', 'A', m), s: 'figure' },
        { f: sumMonth('รายจ่าย', 'H', 'A', m, `,${col('รายจ่าย', 'J')},"ใช่"`), s: 'figure' }, { f: sumMonth('รายจ่าย', 'I', 'A', m, `,${col('รายจ่าย', 'J')},"ใช่"`), s: 'figure' },
        { f: `C${r}-E${r}`, s: 'figureStrong' }, { f: `WORKDAY(DATE(${YEAR},${m + 1},15)-1,1)`, s: 'date' }, { f: `WORKDAY(DATE(${YEAR},${m + 1},23)-1,1)`, s: 'date' }];
    });
    sheets.push(report('สรุป ภ.พ.30', 'สรุป ภ.พ.30', 'ปีภาษี', ['เดือนภาษี', 'ยอดขาย', 'ภาษีขาย', 'ยอดซื้อที่ขอคืนได้', 'ภาษีซื้อ', 'ต้องชำระ (+) / ชำระเกิน (−)', 'กำหนดยื่น กระดาษ', 'กำหนดยื่น ออนไลน์'], pp30,
      [16, 16, 14, 18, 14, 22, 16, 16],
      ['ภ.พ.30 ต้องยื่นทุกเดือนแม้ไม่มียอดขาย วันยื่นเลื่อนเฉพาะเสาร์-อาทิตย์ในชีตนี้ ปฏิทินยื่นภาษีในแอปเลื่อนวันหยุดราชการให้ด้วย ส่วนขยายยื่นออนไลน์ใช้ได้กับงวดที่ครบกำหนดถึง 31 ม.ค. 2570'], true));
  }

  // สรุปภาษีรายปี: by income type, split at June for ภ.ง.ด.94.
  const half = (type: string, from: number, to: number) => `SUMIFS(${col('รายรับ', I.gross)},${col('รายรับ', I.type)},"${type}",${col('รายรับ', I.date)},">="&DATE(${YEAR},${from},1),${col('รายรับ', I.date)},"<"&DATE(${YEAR},${to},1))`;
  const yearBody: Cell[][] = INCOME_TYPES.map((type, i) => {
    const r = i + R0;
    return [{ v: type, s: 'cell' }, { f: half(type, 1, 7), s: 'figure' }, { f: half(type, 7, 13), s: 'figure' }, { f: `B${r}+C${r}`, s: 'figure' },
      { f: `SUMIFS(${col('รายรับ', I.wht)},${col('รายรับ', I.type)},"${type}",${col('รายรับ', I.date)},">="&DATE(${YEAR},1,1),${col('รายรับ', I.date)},"<"&DATE(${YEAR}+1,1,1))`, s: 'figure' }];
  });
  const sum = `D${R0 + INCOME_TYPES.length}`;
  yearBody.push(totals('รวม', ['B', 'C', 'D', 'E'], R0, R0 + INCOME_TYPES.length - 1), [null],
    [{ v: 'เฝ้าเกณฑ์ VAT', s: 'label' }, { f: sum, s: 'figure' }, { f: vat ? '"จด VAT แล้ว"' : `IF(${sum}>=1800000,"เกิน 1.8 ล้าน ต้องจด VAT ภายใน 30 วัน",IF(${sum}>=1500000,"ใกล้เกณฑ์ 1.8 ล้าน","ปกติ"))`, s: 'choice' }]);
  sheets.push(report('สรุปภาษีรายปี', 'สรุปภาษีรายปี', 'ปีภาษี', ['ประเภทเงินได้', 'เงินได้ ม.ค.–มิ.ย.', 'เงินได้ ก.ค.–ธ.ค.', 'รวมทั้งปี', 'ภาษีถูกหักรวม'], yearBody, [18, 20, 20, 18, 18],
    ['ตัวเลขประมาณการเพื่อเตรียมตัว ไม่ใช่การยื่นแบบ ค่าใช้จ่ายและค่าลดหย่อนให้นักบัญชีหรือโปรแกรมของกรมสรรพากรคำนวณ']));
  void now;
  return sheets;
}

/** The app's expense categories, in the template's words. */
function mapCategory(category: string): string {
  const c = category.toLowerCase();
  if (/equip|อุปกรณ์|กล้อง/.test(c)) return 'อุปกรณ์';
  if (/soft|ซอฟต์|โปรแกรม|subscription/.test(c)) return 'ซอฟต์แวร์';
  if (/travel|เดินทาง|น้ำมัน|transport/.test(c)) return 'เดินทาง';
  if (/outsource|จ้าง/.test(c)) return 'ค่าจ้างช่วง';
  if (/rent|สถานที่|เช่า/.test(c)) return 'ค่าสถานที่';
  if (/phone|internet|เน็ต|โทร/.test(c)) return 'โทรศัพท์-เน็ต';
  if (/stock|สินค้า|inventory/.test(c)) return 'ซื้อสินค้า';
  return 'อื่น ๆ';
}

// ── 3–4 Agencies and production houses ────────────────────────────────────────────────────────────────────────────
const PAYEE_TYPES = ['บุคคล', 'นิติบุคคล', 'ต่างประเทศ'];
const form = (typeRef: string, rateRef: string) => `IF(${rate(rateRef)}=0,"",IF(${typeRef}="บุคคล","ภ.ง.ด.3",IF(${typeRef}="นิติบุคคล","ภ.ง.ด.53","ภ.ง.ด.54")))`;

function companySettings(title: string, year: number): SheetSpec {
  return settingsTab(title, [
    ['ปีบัญชี (พ.ศ.)', { v: year + 543, s: 'text' }],
    ['ชื่อกิจการ', ''], ['เลขประจำตัวผู้เสียภาษี', ''], ['สำนักงานใหญ่ / สาขา', 'สำนักงานใหญ่'],
    ['จด VAT', 'จดแล้ว'], ['รอบบัญชี', 'ม.ค.–ธ.ค.'], ['ผู้ทำบัญชี / สำนักงานบัญชี', ''],
  ]);
}

function billing(projectHeader: string, data: TemplateData | null, year: number, sample: string): SheetSpec {
  const cols: Col[] = [
    { h: 'เลขที่ใบแจ้งหนี้', w: 16 }, { h: projectHeader, w: 13 }, { h: 'วันที่วางบิล', w: 13, s: 'date' }, { h: 'ก่อน VAT', w: 14, s: 'money' },
    { h: 'VAT 7%', w: 12, f: r => `IF(D${r}="","",ROUND(D${r}*0.07,2))` }, { h: 'ลูกค้าหัก', w: 9, list: RATES },
    { h: 'ยอดที่ลูกค้าหัก', w: 13, f: r => `IF(D${r}="","",ROUND(D${r}*${rate(`F${r}`)},2))` },
    { h: 'ควรได้รับ', w: 14, f: r => `IF(D${r}="","",D${r}+E${r}-G${r})` },
    { h: 'ครบกำหนด', w: 13, s: 'date' }, { h: 'วันที่รับเงิน', w: 13, s: 'date' },
    { h: 'ได้ 50 ทวิ จากลูกค้า', w: 16, list: ['ได้แล้ว', 'ยังไม่ได้', 'ไม่ต้องใช้'] },
    { h: 'ค้างกี่วัน', w: 10, s: 'text', f: r => `IF(OR(I${r}="",J${r}<>""),"",MAX(0,TODAY()-I${r}))` },
  ];
  const rows: Cell[][] = data?.income.length
    ? data.income.map(row => ['', '', { date: row.date }, row.gross, null, `${Math.round(row.whtRate * 100)}%`, null, null, '', row.received ? { date: row.date } : '', row.whtRate > 0 ? 'ยังไม่ได้' : 'ไม่ต้องใช้', null])
    : [['INV-2569-001', sample, { date: `${year}-03-01` }, 85000, null, '3%', null, null, { date: `${year}-03-31` }, '', 'ยังไม่ได้', null]];
  return table('วางบิลและรับเงิน', cols, rows);
}

function payments(name: string, projectHeader: string, categories: string[], data: TemplateData | null, year: number, sample: string, deposit: boolean): SheetSpec {
  const cols: Col[] = [
    { h: 'วันที่จ่าย', w: 13, s: 'date', t: 'date' }, { h: projectHeader, w: 13 }, { h: 'หมวด', w: 16, list: categories, t: 'category' }, { h: 'ผู้รับเงิน', w: 24 },
    { h: 'ประเภทผู้รับ', w: 12, list: PAYEE_TYPES }, { h: 'รายการ', w: 24, t: 'name' }, { h: 'ก่อน VAT', w: 14, s: 'money', t: 'amount' }, { h: 'VAT', w: 11, s: 'money' },
    { h: 'อัตราหัก', w: 9, list: RATES }, { h: 'ภาษีหัก', w: 12, f: r => `IF(G${r}="","",ROUND(G${r}*${rate(`I${r}`)},2))` },
    { h: 'จ่ายสุทธิ', w: 14, f: r => `IF(G${r}="","",G${r}+IF(H${r}="",0,H${r})-J${r})` },
    { h: 'แบบที่ต้องยื่น', w: 12, s: 'text', f: r => `IF(G${r}="","",${form(`E${r}`, `I${r}`)})` },
    { h: 'เลขที่ 50 ทวิ', w: 13 },
    ...(deposit ? [{ h: 'มัดจำอุปกรณ์', w: 13, s: 'money' as const }, { h: 'วันคืนอุปกรณ์', w: 13, s: 'date' as const }] : []),
  ];
  const rows: Cell[][] = data?.expenses.length
    ? data.expenses.map(row => [{ date: row.date }, '', categories[categories.length - 1], row.vendor, 'นิติบุคคล', row.item, row.amount, 0, '0%', null, null, null, ''])
    : [
      [{ date: `${year}-03-05` }, sample, categories[0], 'บริษัท สมมติเช่ากล้อง จำกัด (ตัวอย่าง)', 'นิติบุคคล', 'เช่ากล้อง 2 วัน', 18000, 1260, '5%', null, null, null, '', ...(deposit ? [10000, { date: `${year}-03-08` }] : [])],
      [{ date: `${year}-03-06` }, sample, categories[1], 'นาย ตัวอย่าง ช่างไฟ (ตัวอย่าง)', 'บุคคล', 'ค่าตัวช่างไฟ', 4500, '', '3%', null, null, null, '', ...(deposit ? ['', ''] : [])],
    ];
  return table(name, cols, rows);
}

function withholdingRegister(sources: { sheet: string; date: string; tax: string; form?: string; fixedForm?: string }[]): SheetSpec {
  const sum = (formName: string, m: number) => sources.map(src => src.fixedForm
    ? (src.fixedForm === formName ? sumMonth(src.sheet, src.tax, src.date, m) : '0')
    : sumMonth(src.sheet, src.tax, src.date, m, `,${col(src.sheet, src.form!)},"${formName}"`)).join('+');
  const body: Cell[][] = MONTHS.map((name, i) => {
    const m = i + 1;
    return [monthCell(name), { f: sum('ภ.ง.ด.3', m), s: 'figure' }, { f: sum('ภ.ง.ด.53', m), s: 'figure' }, { f: sum('ภ.ง.ด.54', m), s: 'figure' },
      { f: `WORKDAY(DATE(${YEAR},${m + 1},7)-1,1)`, s: 'date' }, { f: `WORKDAY(DATE(${YEAR},${m + 1},15)-1,1)`, s: 'date' }];
  });
  body.push(totals('รวมทั้งปี', ['B', 'C', 'D']));
  return report('ทะเบียนหัก ณ ที่จ่าย', 'ทะเบียนภาษีหัก ณ ที่จ่าย', 'ปีบัญชี', ['เดือน', 'ภ.ง.ด.3 (บุคคล)', 'ภ.ง.ด.53 (นิติบุคคล)', 'ภ.ง.ด.54 (ต่างประเทศ)', 'กำหนดยื่น กระดาษ', 'กำหนดยื่น ออนไลน์'], body,
    [16, 18, 20, 20, 16, 16], ['ยื่นเฉพาะเดือนที่หักภาษีไว้ ส่งให้นักบัญชีพร้อมสำเนา 50 ทวิ ส่วนขยายยื่นออนไลน์ใช้ได้กับงวดที่ครบกำหนดถึง 31 ม.ค. 2570'], true, 'company');
}

function monthlyChecklist(extra: string[]): SheetSpec {
  const items = ['ใบแจ้งหนี้ / ใบกำกับภาษีขาย', 'ใบกำกับภาษีซื้อเต็มรูป', 'ใบเสร็จค่าใช้จ่ายอื่น', 'Statement ธนาคารทุกบัญชี', 'สำเนา 50 ทวิ ที่ออกให้คนอื่น', '50 ทวิ ที่ได้รับจากลูกค้า', 'ทะเบียนหัก ณ ที่จ่าย', ...extra];
  return table('ส่งบัญชีประจำเดือน', [
    { h: 'เดือน', w: 12 }, { h: 'รายการเอกสาร', w: 40 }, { h: 'จำนวน', w: 10, s: 'text' }, { h: 'ครบแล้ว', w: 10, list: ['ครบ', 'ยังไม่ครบ'] }, { h: 'ที่เก็บไฟล์', w: 26 }, { h: 'หมายเหตุ', w: 26 },
  ], items.map(item => ['', item, '', '', '', '']));
}

function agency(year: number, data: TemplateData | null): SheetSpec[] {
  const CATS = ['กลยุทธ์-ครีเอทีฟ', 'โปรดักชัน', 'KOL', 'ค่าสื่อแทนจ่าย', 'ค่าธรรมเนียมสื่อ', 'อีเวนต์', 'อื่น ๆ'];
  const projects = table('โปรเจกต์', [
    { h: 'รหัสโปรเจกต์', w: 13 }, { h: 'ชื่อแคมเปญ', w: 26, t: 'name' }, { h: 'ลูกค้า', w: 24, t: 'client' }, { h: 'เลขผู้เสียภาษีลูกค้า', w: 18, id: true },
    { h: 'ค่าบริการก่อน VAT', w: 16, s: 'money', t: 'value' }, { h: 'ค่าสื่อแทนจ่าย (ประมาณ)', w: 18, s: 'money' },
    { h: 'สถานะ', w: 12, list: ['เสนอราคา', 'กำลังทำ', 'ส่งงานแล้ว', 'ปิดงาน'] }, { h: 'วันเริ่ม', w: 12, s: 'date', t: 'date' }, { h: 'วันส่งงาน', w: 12, s: 'date' },
    { h: 'ต้นทุนจริง (ไม่รวมค่าสื่อ)', w: 20, f: r => `IF(A${r}="","",SUMIFS(${col('ค่าใช้จ่ายโปรเจกต์', 'G')},${col('ค่าใช้จ่ายโปรเจกต์', 'B')},A${r})-SUMIFS(${col('ค่าใช้จ่ายโปรเจกต์', 'G')},${col('ค่าใช้จ่ายโปรเจกต์', 'B')},A${r},${col('ค่าใช้จ่ายโปรเจกต์', 'C')},"ค่าสื่อแทนจ่าย"))` },
    { h: 'กำไรขั้นต้น', w: 14, f: r => `IF(A${r}="","",E${r}-J${r})` },
  ], [['PRJ-2569-001', 'เปิดตัวสินค้าใหม่ (ตัวอย่าง)', 'บริษัท สมมติเครื่องดื่ม จำกัด (ตัวอย่าง)', '0000000000301', 85000, 120000, 'กำลังทำ', { date: `${year}-03-01` }, { date: `${year}-04-15` }, null, null]]);
  const budget = table('งบเทียบจริง', [
    { h: 'รหัสโปรเจกต์', w: 13 }, { h: 'หมวด', w: 18, list: CATS }, { h: 'รายการ', w: 28 }, { h: 'งบ', w: 14, s: 'money' },
    { h: 'ใช้จริง', w: 14, f: r => `IF(A${r}="","",SUMIFS(${col('ค่าใช้จ่ายโปรเจกต์', 'G')},${col('ค่าใช้จ่ายโปรเจกต์', 'B')},A${r},${col('ค่าใช้จ่ายโปรเจกต์', 'C')},B${r}))` },
    { h: 'ส่วนต่าง', w: 14, f: r => `IF(A${r}="","",D${r}-E${r})` },
  ], [['PRJ-2569-001', 'โปรดักชัน', 'ถ่ายวิดีโอ 1 วัน', 45000, null, null], ['PRJ-2569-001', 'KOL', 'อินฟลูเอนเซอร์ 3 คน', 30000, null, null]]);
  return [
    howTo(TEMPLATE_INFO.agency, TEMPLATE_INFO.agency.tabs, [
      '1. กรอกแท็บ ตั้งค่า (ชื่อกิจการ เลขผู้เสียภาษี ปีบัญชี)',
      '2. เปิดหนึ่งแถวในแท็บ โปรเจกต์ ต่อหนึ่งแคมเปญ ใช้รหัสโปรเจกต์เดียวกันในทุกแท็บ',
      '3. งบเทียบจริงดึงยอดใช้จริงจากแท็บ ค่าใช้จ่ายโปรเจกต์ ตามรหัสและหมวด',
      '4. ค่าสื่อที่จ่ายแทนลูกค้า เลือกหมวด “ค่าสื่อแทนจ่าย” เพื่อแยกออกจากกำไรของเอเจนซี่',
      '5. แบบที่ต้องยื่น (ภ.ง.ด.3 / 53 / 54) ขึ้นให้เองจากประเภทผู้รับและอัตราหัก ทะเบียนหัก ณ ที่จ่ายสรุปเป็นรายเดือน',
      '6. ทุกต้นเดือน ใช้แท็บ ส่งบัญชีประจำเดือน เช็กเอกสารก่อนส่งนักบัญชี (ควรส่งก่อนวันที่ 5)',
    ], 'ปีบัญชี'),
    companySettings('ข้อมูลกิจการ', year), projects, budget,
    payments('ค่าใช้จ่ายโปรเจกต์', 'รหัสโปรเจกต์', CATS, data, year, 'PRJ-2569-001', false),
    billing('รหัสโปรเจกต์', data, year, 'PRJ-2569-001'),
    withholdingRegister([{ sheet: 'ค่าใช้จ่ายโปรเจกต์', date: 'A', tax: 'J', form: 'L' }]),
    monthlyChecklist([]),
  ];
}

function production(year: number, data: TemplateData | null): SheetSpec[] {
  const CATS = ['ทีมงาน', 'นักแสดง', 'อุปกรณ์', 'สถานที่', 'อาหาร', 'เดินทาง', 'อาร์ต', 'ตัดต่อ', 'อื่น ๆ'];
  const job = 'MV-2569-001';
  const crewCost = (ref: string, cat?: string) => `SUMIFS(${col('ทีมงานและนักแสดง', 'G')},${col('ทีมงานและนักแสดง', 'A')},${ref}${cat ? `,${col('ทีมงานและนักแสดง', 'N')},${cat}` : ''})`;
  const clearCost = (ref: string, cat?: string) => `SUMIFS(${col('เคลียร์เงิน', 'F')},${col('เคลียร์เงิน', 'J')},${ref}${cat ? `,${col('เคลียร์เงิน', 'E')},${cat}` : ''})`;
  const directCost = (ref: string, cat?: string) => `SUMIFS(${col('ค่าใช้จ่ายและเช่าอุปกรณ์', 'G')},${col('ค่าใช้จ่ายและเช่าอุปกรณ์', 'B')},${ref}${cat ? `,${col('ค่าใช้จ่ายและเช่าอุปกรณ์', 'C')},${cat}` : ''})`;
  const jobs = table('งาน', [
    { h: 'รหัสงาน', w: 13 }, { h: 'ชื่องาน', w: 24, t: 'name' }, { h: 'ลูกค้า', w: 24, t: 'client' }, { h: 'ประเภทงาน', w: 12, list: ['TVC', 'ออนไลน์', 'ภาพนิ่ง', 'อีเวนต์', 'MV'] },
    { h: 'วันถ่ายแรก', w: 12, s: 'date', t: 'date' }, { h: 'จำนวนวันถ่าย', w: 12, s: 'text' }, { h: 'มูลค่างานก่อน VAT', w: 16, s: 'money', t: 'value' },
    { h: 'งบรวม', w: 14, f: r => `IF(A${r}="","",SUMIFS(${col('งบโปรดักชัน', 'G')},${col('งบโปรดักชัน', 'A')},A${r}))` },
    { h: 'ใช้จริง', w: 14, f: r => `IF(A${r}="","",${crewCost(`A${r}`)}+${clearCost(`A${r}`)}+${directCost(`A${r}`)})` },
    { h: 'กำไร', w: 14, f: r => `IF(A${r}="","",G${r}-I${r})` },
    { h: 'สถานะ', w: 12, list: ['เสนอราคา', 'เตรียมถ่าย', 'ถ่ายแล้ว', 'ส่งงานแล้ว', 'ปิดงาน'] },
  ], [[job, 'MV วงตัวอย่าง (ตัวอย่าง)', 'ค่ายเพลงสมมติ จำกัด (ตัวอย่าง)', 'MV', { date: `${year}-03-06` }, '2', 250000, null, null, null, 'เตรียมถ่าย']]);
  const budget = table('งบโปรดักชัน', [
    { h: 'รหัสงาน', w: 13 }, { h: 'หมวด', w: 12, list: CATS }, { h: 'รายการ', w: 24 }, { h: 'คน / ชิ้น', w: 9, s: 'text' }, { h: 'วัน', w: 7, s: 'text' }, { h: 'ราคาต่อหน่วย', w: 13, s: 'money' },
    { h: 'งบ', w: 13, f: r => `IF(F${r}="","",IF(D${r}="",1,D${r})*IF(E${r}="",1,E${r})*F${r})` },
    { h: 'ใช้จริง', w: 13, f: r => `IF(A${r}="","",${crewCost(`A${r}`, `B${r}`)}+${clearCost(`A${r}`, `B${r}`)}+${directCost(`A${r}`, `B${r}`)})` },
    { h: 'ส่วนต่าง', w: 13, f: r => `IF(G${r}="","",G${r}-H${r})` },
  ], [[job, 'ทีมงาน', 'ช่างภาพ + ผู้ช่วย', '2', '2', 6000, null, null, null], [job, 'อุปกรณ์', 'เช่ากล้องและไฟ', '1', '2', 9000, null, null, null], [job, 'อาหาร', 'อาหารกอง', '20', '2', 150, null, null, null]]);
  const crew = table('ทีมงานและนักแสดง', [
    { h: 'รหัสงาน', w: 13 }, { h: 'ชื่อ-สกุล', w: 22 }, { h: 'ตำแหน่ง', w: 14 }, { h: 'เรทต่อวัน', w: 12, s: 'money' }, { h: 'วัน', w: 7, s: 'text' }, { h: 'OT', w: 10, s: 'money' },
    { h: 'รวมก่อนหัก', w: 13, f: r => `IF(D${r}="","",D${r}*IF(E${r}="",1,E${r})+IF(F${r}="",0,F${r}))` },
    { h: 'ประเภทเงินได้', w: 12, list: ['40(2)', '40(8)'] }, { h: 'อัตราหัก', w: 9, list: RATES },
    { h: 'ภาษีหัก', w: 12, f: r => `IF(G${r}="","",ROUND(G${r}*${rate(`I${r}`)},2))` },
    { h: 'จ่ายสุทธิ', w: 13, f: r => `IF(G${r}="","",G${r}-J${r})` }, { h: 'วันที่จ่าย', w: 12, s: 'date' }, { h: 'เลขที่ 50 ทวิ', w: 13 },
    { h: 'หมวด', w: 10, list: ['ทีมงาน', 'นักแสดง'] },
  ], [[job, 'นาย ตัวอย่าง ช่างภาพ (ตัวอย่าง)', 'ช่างภาพ', 6000, '2', 0, null, '40(2)', '3%', null, null, { date: `${year}-03-10` }, '', 'ทีมงาน']]);
  const advances = table('เงินทดรอง', [
    { h: 'เลขที่ใบเบิก', w: 14 }, { h: 'วันที่เบิก', w: 12, s: 'date' }, { h: 'รหัสงาน', w: 13 }, { h: 'ผู้เบิก', w: 18 }, { h: 'วัตถุประสงค์', w: 24 }, { h: 'ยอดเบิก', w: 13, s: 'money' },
    { h: 'ต้องเคลียร์ภายใน', w: 14, s: 'date' },
    { h: 'ใช้จริง', w: 13, f: r => `IF(A${r}="","",SUMIFS(${col('เคลียร์เงิน', 'F')},${col('เคลียร์เงิน', 'A')},A${r}))` },
    { h: 'คืน (+) / จ่ายเพิ่ม (−)', w: 18, f: r => `IF(A${r}="","",F${r}-H${r})` },
    { h: 'สถานะ', w: 20, s: 'text', f: r => `IF(A${r}="","",IF(H${r}=0,IF(AND(G${r}<>"",TODAY()>G${r}),"เลยกำหนดเคลียร์","ยังไม่เคลียร์"),IF(I${r}>0,"ต้องคืนบริษัท",IF(I${r}<0,"บริษัทจ่ายเพิ่ม","เคลียร์ครบ"))))` },
  ], [['ADV-2569-001', { date: `${year}-03-04` }, job, 'นางสาว ตัวอย่าง โปรดิวเซอร์ (ตัวอย่าง)', 'ค่าอาหารและเดินทางกอง', 15000, { date: `${year}-03-13` }, null, null, null]]);
  const clearing = table('เคลียร์เงิน', [
    { h: 'เลขที่ใบเบิก', w: 14 }, { h: 'วันที่ในหลักฐาน', w: 14, s: 'date' }, { h: 'ร้าน / ผู้รับเงิน', w: 22 }, { h: 'รายการ', w: 22 }, { h: 'หมวด', w: 12, list: CATS },
    { h: 'ยอดรวม', w: 12, s: 'money' }, { h: 'VAT', w: 10, s: 'money' }, { h: 'ประเภทหลักฐาน', w: 18, list: EVIDENCE }, { h: 'ลิงก์รูป', w: 18 },
    { h: 'รหัสงาน', w: 13, s: 'text', f: r => `IF(A${r}="","",IFERROR(INDEX(${col('เงินทดรอง', 'C')},MATCH(A${r},${col('เงินทดรอง', 'A')},0)),""))` },
  ], [
    ['ADV-2569-001', { date: `${year}-03-06` }, 'ร้านอาหารสมมติ (ตัวอย่าง)', 'อาหารกลางวันกอง 20 ที่', 'อาหาร', 3000, 0, 'ใบเสร็จ', '', null],
    ['ADV-2569-001', { date: `${year}-03-06` }, 'ปั๊มน้ำมันสมมติ (ตัวอย่าง)', 'น้ำมันรถตู้', 'เดินทาง', 2400, 157.01, 'ใบกำกับภาษีอย่างย่อ', '', null],
  ]);
  return [
    howTo(TEMPLATE_INFO.production, TEMPLATE_INFO.production.tabs, [
      '1. กรอกแท็บ ตั้งค่า แล้วเปิดหนึ่งแถวในแท็บ งาน ต่อหนึ่งงาน ใช้รหัสงานเดียวกันทุกแท็บ',
      '2. งบโปรดักชัน = คน × วัน × ราคาต่อหน่วย ใช้จริงดึงจากทีมงาน เคลียร์เงิน และค่าใช้จ่าย ตามรหัสงานและหมวด',
      '3. ค่าตัวทีมงานและนักแสดง: เลือกประเภทเงินได้และอัตราหัก ภาษีหักและจ่ายสุทธิคำนวณให้ ออก 50 ทวิ ให้ทุกคนที่ถูกหัก',
      '4. เงินทดรอง: หนึ่งใบเบิกต่อหนึ่งก้อน ใส่วันที่ต้องเคลียร์ แล้วลงหลักฐานทุกใบในแท็บ เคลียร์เงิน ด้วยเลขที่ใบเบิกเดียวกัน',
      '5. ทะเบียนหัก ณ ที่จ่ายสรุป ภ.ง.ด.3 และ 53 รายเดือนให้นักบัญชี',
      '6. ทุกต้นเดือน ใช้แท็บ ส่งบัญชีประจำเดือน เช็กเอกสารก่อนส่งนักบัญชี (ควรส่งก่อนวันที่ 5)',
    ], 'ปีบัญชี'),
    companySettings('ข้อมูลกิจการ', year), jobs, budget, crew, advances, clearing,
    payments('ค่าใช้จ่ายและเช่าอุปกรณ์', 'รหัสงาน', CATS, data, year, job, true),
    billing('รหัสงาน', data, year, job),
    withholdingRegister([
      { sheet: 'ทีมงานและนักแสดง', date: 'L', tax: 'J', fixedForm: 'ภ.ง.ด.3' },
      { sheet: 'ค่าใช้จ่ายและเช่าอุปกรณ์', date: 'A', tax: 'J', form: 'L' },
    ]),
    monthlyChecklist(['ใบเคลียร์เงินทดรอง + หลักฐานทุกใบ', 'ใบจ่ายค่าตัวทีมงานและนักแสดง']),
  ];
}

// ── 5 Accounting offices ──────────────────────────────────────────────────────────────────────────────────────────
/** Public holidays for WORKDAY(), from the app's own holiday list (2569–2570). */
function holidays(year: number): string[] {
  const out: string[] = [];
  for (let y = year; y <= year + 1; y += 1) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d = new Date(d.getTime() + 86_400_000)) {
      if (isThaiPublicHoliday(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) out.push(d.toISOString().slice(0, 10));
    }
  }
  return out;
}

function office(year: number): SheetSpec[] {
  const FORMS = ['ภ.ง.ด.1', 'ภ.ง.ด.3', 'ภ.ง.ด.53', 'ภ.พ.30', 'สปส.1-10'];
  const days = holidays(year);
  const H = `${q('ตั้งค่า')}!$E$8:$E$${7 + days.length}`;
  const rule = (formRef: string, colL: string) => `INDEX(${q('ตั้งค่า')}!$${colL}$8:$${colL}$12,MATCH(${formRef},${q('ตั้งค่า')}!$A$8:$A$12,0))`;
  const settings = settingsTab('ข้อมูลสำนักงาน', [['ปี (พ.ศ.)', { v: year + 543, s: 'text' }], ['ชื่อสำนักงาน', ''], ['ผู้ทำบัญชี', '']]);
  settings.widths = [32, 40, 18, 40, 16];
  settings.rows.push([null]);
  settings.heights![settings.rows.length - 1] = 16;
  settings.rows.push(['แบบ', 'วันกระดาษ (ของเดือนถัดไป)', 'วันออนไลน์', 'หมายเหตุ', 'วันหยุดราชการ'].map(v => ({ v, s: 'header' as const })));
  settings.heights![settings.rows.length - 1] = 34;
  const rules: [string, number, number, string][] = [['ภ.ง.ด.1', 7, 15, 'ส่วนขยายออนไลน์ถึงงวดที่ครบกำหนด 31 ม.ค. 2570'], ['ภ.ง.ด.3', 7, 15, ''], ['ภ.ง.ด.53', 7, 15, ''], ['ภ.พ.30', 15, 23, 'ยื่นทุกเดือนแม้ไม่มียอด'], ['สปส.1-10', 15, 15, 'ออนไลน์ได้เพิ่ม 7 วันทำการ ตรวจกับ สปส.']];
  const longest = Math.max(rules.length, days.length);
  for (let i = 0; i < longest; i += 1) {
    const ruleRow = rules[i];
    settings.rows.push([ruleRow ? { v: ruleRow[0], s: 'cell' } : null, ruleRow ? { v: ruleRow[1], s: 'choice' } : null, ruleRow ? { v: ruleRow[2], s: 'choice' } : null,
      ruleRow ? { v: ruleRow[3], s: 'cellWrap' } : null, days[i] ? { date: days[i] } : null]);
    if (ruleRow?.[3]) settings.heights![settings.rows.length - 1] = tall(ruleRow[3], 40, 16);
  }
  // The rules table and the holidays start at row 8 (title, note, three settings, a space, header): the formulas above read them there.
  const clients = table('ลูกค้า', [
    { h: 'รหัสลูกค้า', w: 11 }, { h: 'ชื่อกิจการ', w: 26 }, { h: 'ประเภทกิจการ', w: 14, list: ['บุคคลธรรมดา', 'ห้างหุ้นส่วนจำกัด', 'บริษัทจำกัด'] },
    { h: 'เลขผู้เสียภาษี', w: 16, id: true }, { h: 'จด VAT', w: 9, list: YES_NO }, { h: 'มีลูกจ้าง', w: 9, list: YES_NO }, { h: 'วันสิ้นรอบบัญชี', w: 14, s: 'date' },
    { h: 'ผู้รับผิดชอบ', w: 16 }, { h: 'ค่าบริการต่อเดือน', w: 15, s: 'money' },
  ], [['C001', 'บริษัท สมมติโปรดักชัน จำกัด (ตัวอย่าง)', 'บริษัทจำกัด', '0000000000401', 'ใช่', 'ใช่', { date: `${year}-12-31` }, '', 3500]]);
  const checklist = table('เช็กลิสต์เอกสาร', [
    { h: 'ปี (พ.ศ.)', w: 9, s: 'text' }, { h: 'เดือน (1–12)', w: 10, s: 'text' }, { h: 'รหัสลูกค้า', w: 11 },
    { h: 'กำหนดส่งเอกสาร', w: 15, s: 'date', f: r => `IF(OR(A${r}="",B${r}=""),"",WORKDAY(DATE(A${r}-543,B${r}+1,5)-1,1,${H}))` },
    { h: 'ใบกำกับขาย', w: 11, s: 'text' }, { h: 'ใบกำกับซื้อ', w: 11, s: 'text' }, { h: 'ใบเสร็จค่าใช้จ่าย', w: 14, s: 'text' }, { h: 'Statement ครบ', w: 13, list: YES_NO },
    { h: 'ครบแล้ว', w: 10, list: ['ครบ', 'ยังไม่ครบ'] }, { h: 'หมายเหตุ', w: 24 },
  ], [[{ v: year + 543, s: 'text' }, { v: 3, s: 'text' }, 'C001', null, '12', '30', '18', 'ใช่', 'ยังไม่ครบ', 'รอใบกำกับซื้อค่าเช่ากล้อง']]);
  const filings = table('ยื่นแบบรายเดือน', [
    { h: 'ปี (พ.ศ.)', w: 9, s: 'text' }, { h: 'เดือน (1–12)', w: 10, s: 'text' }, { h: 'รหัสลูกค้า', w: 11 }, { h: 'แบบ', w: 11, list: FORMS }, { h: 'วิธียื่น', w: 10, list: ['ออนไลน์', 'กระดาษ'] },
    { h: 'วันตามกฎ', w: 13, s: 'date', f: r => `IF(OR(A${r}="",B${r}="",D${r}=""),"",DATE(A${r}-543,B${r}+1,IF(E${r}="กระดาษ",${rule(`D${r}`, 'B')},${rule(`D${r}`, 'C')})))` },
    { h: 'กำหนดส่ง (เลื่อนวันหยุด)', w: 18, s: 'date', f: r => `IF(F${r}="","",WORKDAY(F${r}-1,1,${H}))` },
    { h: 'ยอดภาษี / เงินสมทบ', w: 16, s: 'money' }, { h: 'ยื่นแล้ว', w: 9, list: ['ยื่นแล้ว', 'ยังไม่ยื่น'] }, { h: 'วันที่ยื่น', w: 12, s: 'date' }, { h: 'เลขอ้างอิง', w: 16 },
  ], [[{ v: year + 543, s: 'text' }, { v: 3, s: 'text' }, 'C001', 'ภ.ง.ด.53', 'ออนไลน์', null, null, 1260, 'ยังไม่ยื่น', '', ''],
    [{ v: year + 543, s: 'text' }, { v: 3, s: 'text' }, 'C001', 'ภ.พ.30', 'ออนไลน์', null, null, 4200, 'ยังไม่ยื่น', '', '']]);
  const followUps = table('ติดตามเอกสาร', [
    { h: 'เลขที่', w: 9 }, { h: 'วันที่พบ', w: 12, s: 'date' }, { h: 'รหัสลูกค้า', w: 11 }, { h: 'งวด', w: 12 }, { h: 'รายการที่ขาด', w: 30 }, { h: 'ยอดเงิน', w: 12, s: 'money' },
    { h: 'ขอให้ส่งภายใน', w: 14, s: 'date' }, { h: 'ตามแล้ว (ครั้ง)', w: 12, s: 'text' }, { h: 'สถานะ', w: 12, list: ['รอเอกสาร', 'ได้แล้ว', 'ยกเลิก'] },
  ], [['F-001', { date: `${year}-04-02` }, 'C001', `มี.ค. ${year + 543}`, 'ใบกำกับภาษีซื้อค่าเช่ากล้อง', 19260, { date: `${year}-04-05` }, '1', 'รอเอกสาร']]);
  const closing = table('ปิดงบประจำปี', [
    { h: 'ปีบัญชี (พ.ศ.)', w: 12, s: 'text' }, { h: 'รหัสลูกค้า', w: 11 },
    { h: 'ประเภทกิจการ', w: 16, s: 'text', f: r => `IF(B${r}="","",IFERROR(INDEX(${col('ลูกค้า', 'C')},MATCH(B${r},${col('ลูกค้า', 'A')},0)),""))` },
    { h: 'วันปิดบัญชี', w: 13, s: 'date' }, { h: 'วันประชุม AGM', w: 14, s: 'date' },
    { h: 'กำหนดส่งงบ DBD', w: 16, s: 'date', f: r => `IF(D${r}="","",WORKDAY(IF(C${r}="บริษัทจำกัด",IF(E${r}="",EDATE(D${r},5),EDATE(E${r},1)),EDATE(D${r},5))-1,1,${H}))` },
    { h: 'กำหนด ภ.ง.ด.50', w: 15, s: 'date', f: r => `IF(OR(D${r}="",C${r}="บุคคลธรรมดา"),"",WORKDAY(D${r}+150-1,1,${H}))` },
    { h: 'สถานะ', w: 14, list: ['ยังไม่เริ่ม', 'กำลังทำ', 'ส่งตรวจ', 'ยื่นแล้ว'] },
  ], [[{ v: year + 542, s: 'text' }, 'C001', null, { date: `${year - 1}-12-31` }, { date: `${year}-04-28` }, null, null, 'กำลังทำ']]);
  return [
    howTo(TEMPLATE_INFO.office, TEMPLATE_INFO.office.tabs, [
      '1. แท็บ ลูกค้า: หนึ่งแถวต่อลูกค้า ใช้รหัสลูกค้าเดียวกันในทุกแท็บ',
      '2. เช็กลิสต์เอกสาร: หนึ่งแถวต่อลูกค้าต่อเดือน กำหนดส่งเอกสารคือวันที่ 5 ของเดือนถัดไป (เลื่อนวันหยุดให้)',
      '3. ยื่นแบบรายเดือน: เลือกแบบและวิธียื่น วันตามกฎและกำหนดส่งหลังเลื่อนวันหยุดคำนวณจากตารางในแท็บ ตั้งค่า',
      '4. ติดตามเอกสาร: จดเรื่องที่ขาด และวันที่ขอให้ลูกค้าส่ง ก่อนถึงกำหนดยื่นของแบบที่ได้รับผลกระทบ',
      '5. ปิดงบประจำปี: กำหนดส่งงบ DBD และ ภ.ง.ด.50 คำนวณจากประเภทกิจการ วันปิดบัญชี และวันประชุม',
      '6. เมื่อกฎเปลี่ยน (เช่น ส่วนขยายยื่นออนไลน์) แก้ตารางในแท็บ ตั้งค่า จุดเดียว',
    ], 'ปี'),
    clients, checklist, filings, followUps, closing, settings,
  ];
}

const SAMPLE_PROFILES: Record<TemplateId, BusinessProfile> = (() => {
  const base = { version: 'biz-v1' as const, vat: 'no' as const, pays: [], revenue: 'under_1m' as const, updated_at: '2026-01-01T00:00:00Z', income: 'per_job' as const };
  return {
    freelance: { ...base, entity: 'individual', work: 'other' }, freelance_vat: { ...base, entity: 'individual', vat: 'yes', work: 'other' },
    agency: { ...base, entity: 'company', work: 'agency' }, production: { ...base, entity: 'company', work: 'production' },
    office: { ...base, entity: 'accounting_office', work: 'other' },
  };
})();
let shapes: { id: TemplateId; tabs: { name: string; headers: string[]; targets: string[]; choices: Record<number, string[]> }[] }[] | null = null;
/** The tabs เลขา writes into, for each workbook: their headers and what each column means. */
export function templateShapes() {
  shapes ??= (Object.keys(SAMPLE_PROFILES) as TemplateId[]).map(id => {
    const writes = TEMPLATE_INFO[id].writes;
    const sheets = buildBookTemplate(SAMPLE_PROFILES[id], { year: 2026, now: new Date('2026-01-01T00:00:00Z') }).sheets;
    const tabs = [writes.job, writes.expense].filter((name): name is string => Boolean(name)).map(name => {
      const sheet = sheets.find(item => item.name === name)!;
      // The category column's drop-down, so เลขา writes one of its words.
      const choices: Record<number, string[]> = {};
      for (const validation of (sheet.validations ?? []).filter(isListValidation)) {
        const at = /^([A-Z]+)\d/.exec(validation.range)?.[1];
        const index = at ? [...at].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : -1;
        if (index >= 0 && sheet.targets?.[index] === 'category') choices[index] = validation.list;
      }
      return { name, headers: sheet.rows[0].map(cell => String((cell as { v: string }).v)), targets: sheet.targets ?? [], choices };
    });
    return { id, tabs };
  });
  return shapes;
}
/** One of our workbooks, recognised by its job and expense tabs having our headers (columns added after them are fine). */
export function matchTemplate(tabs: { name: string; headers: string[] }[]): { id: TemplateId; targets: Record<string, string[]>; choices: Record<string, Record<number, string[]>> } | null {
  for (const shape of templateShapes()) {
    if (!shape.tabs.length) continue;
    const fits = shape.tabs.every(tab => {
      const found = tabs.find(item => item.name === tab.name);
      return found && tab.headers.every((header, i) => (found.headers[i] ?? '').trim() === header);
    });
    if (fits) return { id: shape.id, targets: Object.fromEntries(shape.tabs.map(tab => [tab.name, tab.targets])), choices: Object.fromEntries(shape.tabs.map(tab => [tab.name, tab.choices])) };
  }
  return null;
}

const bare = (header: string) => header.replace(CALC_MARK, '').replace(/\s+/g, ' ').trim();
/**
 * A sheet connected before the templates said what each column means (owner, 2026-11-13: "ชีตที่เชื่อมไว้ก่อนหน้า ให้ใช้
 * ระบบใหม่"): when its job and expense tabs carry most of one template's headers (70%, so a file from an older version of
 * the template still counts), they are written the way the template means them, column by column by header, with the
 * category drop-down; budget, report and cover tabs are no longer written into. Maps saved with the choices already
 * (made today) and anyone else's sheet stay exactly as they are. Nothing is stored: it is applied every time it is read.
 */
export function upgradeTemplateMap(map: SheetMap): SheetMap {
  if (map.tabs.some(tab => tab.columns.some(column => column.choices?.length))) return map;
  for (const shape of templateShapes()) {
    if (!shape.tabs.length) continue;
    const fits = shape.tabs.every(want => {
      const tab = map.tabs.find(item => item.name === want.name);
      if (!tab) return false;
      const have = new Set(tab.columns.map(column => bare(column.header)));
      return want.headers.filter(header => have.has(bare(header))).length / want.headers.length >= 0.7;
    });
    if (!fits) continue;
    const writes = TEMPLATE_INFO[shape.id].writes;
    return {
      ...map,
      tabs: map.tabs.map(tab => {
        const want = shape.tabs.find(item => item.name === tab.name);
        if (!want) return { ...tab, use: false };
        const at = new Map(want.headers.map((header, index) => [bare(header), index]));
        return {
          ...tab, use: true, kind: tab.name === writes.job ? 'jobs' as const : 'expenses' as const,
          columns: tab.columns.map(column => {
            const index = at.get(bare(column.header));
            // A column the person added keeps what it had; a formula column is never written into anyway.
            if (index === undefined || column.formula) return column;
            const choices = want.choices[index];
            return { ...column, target: want.targets[index] ?? 'keep', ...(choices ? { choices } : {}) };
          }),
        };
      }),
    };
  }
  return map;
}

/** The workbook for this business: its tabs, ready for buildXlsx(). */
export function buildBookTemplate(profile: BusinessProfile, options: { year: number; data?: TemplateData | null; now?: Date }): { id: TemplateId; sheets: SheetSpec[]; fileName: string } {
  const id = templateFor(profile);
  const data = options.data && (options.data.income.length || options.data.expenses.length) ? options.data : null;
  const now = options.now ?? new Date();
  const sheets = id === 'freelance' || id === 'freelance_vat' ? freelance(profile, options.year, id === 'freelance_vat', data, now)
    : id === 'agency' ? agency(options.year, data) : id === 'production' ? production(options.year, data) : office(options.year);
  return { id, sheets, fileName: `ชีตบัญชี_${TEMPLATE_INFO[id].title.replace(/[\s/]+/g, '')}_${options.year + 543}_${today(now).slice(5).replace('-', '')}.xlsx` };
}
