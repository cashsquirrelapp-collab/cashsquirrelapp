import { isThaiPublicHoliday } from './calendar.js';
import { hasSection40_5to8, templateFor, type BusinessProfile, type TemplateId } from './businessProfile.js';
import { columnLetter, type Cell, type CellStyle, type SheetSpec } from './xlsxWriter.js';

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

export const TEMPLATE_INFO: Record<TemplateId, { title: string; who: string; tabs: string[] }> = {
  freelance: { title: 'ฟรีแลนซ์ไม่จด VAT', who: 'โค้ช ครู นักศึกษารับงาน ครีเอเตอร์ ที่ยังไม่จด VAT', tabs: ['ตั้งค่า', 'รายรับ', 'รายจ่าย', 'ภาษีถูกหัก ณ ที่จ่าย', 'รายงานเงินสดรับ-จ่าย', 'สรุปภาษีรายปี'] },
  freelance_vat: { title: 'ฟรีแลนซ์จด VAT', who: 'บุคคลธรรมดาที่จดทะเบียนภาษีมูลค่าเพิ่มแล้ว', tabs: ['ตั้งค่า', 'รายรับ', 'รายจ่าย', 'ภาษีถูกหัก ณ ที่จ่าย', 'รายงานภาษีขาย', 'รายงานภาษีซื้อ', 'สรุป ภ.พ.30', 'สรุปภาษีรายปี'] },
  agency: { title: 'เอเจนซี่การตลาด / ครีเอทีฟ', who: 'บริษัทหรือห้างหุ้นส่วนจำกัดที่รับงานเป็นแคมเปญ', tabs: ['ตั้งค่า', 'โปรเจกต์', 'งบเทียบจริง', 'ค่าใช้จ่ายโปรเจกต์', 'วางบิลและรับเงิน', 'ทะเบียนหัก ณ ที่จ่าย', 'ส่งบัญชีประจำเดือน'] },
  production: { title: 'โปรดักชันเฮาส์', who: 'บริษัทหรือห้างหุ้นส่วนจำกัดที่รับงานถ่ายเป็นโปรเจกต์ มีทีมงานและเงินทดรอง', tabs: ['ตั้งค่า', 'งาน', 'งบโปรดักชัน', 'ทีมงานและนักแสดง', 'เงินทดรอง', 'เคลียร์เงิน', 'ค่าใช้จ่ายและเช่าอุปกรณ์', 'วางบิลและรับเงิน', 'ทะเบียนหัก ณ ที่จ่าย', 'ส่งบัญชีประจำเดือน'] },
  office: { title: 'สำนักงานบัญชี', who: 'ผู้รับทำบัญชีหรือสำนักงานที่ดูแลหลายกิจการ', tabs: ['ลูกค้า', 'เช็กลิสต์เอกสาร', 'ยื่นแบบรายเดือน', 'ติดตามเอกสาร', 'ปิดงบประจำปี', 'ตั้งค่า'] },
};

const ROWS = 200;
const LAST = ROWS + 1;
const BRICK = 'E65F2B';
const RATES = ['0%', '1%', '2%', '3%', '5%'];
const YES_NO = ['ใช่', 'ไม่ใช่'];
const q = (sheet: string) => `'${sheet}'`;
const col = (sheet: string, letter: string) => `${q(sheet)}!$${letter}$2:$${letter}$${LAST}`;
/** The tax / fiscal year typed in ตั้งค่า (B3, Buddhist era) as a Gregorian year for DATE(). */
const YEAR = `(${q('ตั้งค่า')}!$B$3-543)`;
/** A withholding rate cell: a number (Excel turns a picked "3%" into 0.03) or the text "3%" (Google Sheets keeps text). */
const rate = (ref: string) => `IF(ISNUMBER(${ref}),${ref},IFERROR(VALUE(SUBSTITUTE(${ref},"%",""))/100,0))`;
const sumMonth = (sheet: string, sumL: string, dateL: string, month: number, extra = '') =>
  `SUMIFS(${col(sheet, sumL)},${col(sheet, dateL)},">="&DATE(${YEAR},${month},1),${col(sheet, dateL)},"<"&DATE(${YEAR},${month + 1},1)${extra})`;
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

interface Col { h: string; w: number; s?: CellStyle; list?: string[]; f?: (r: number) => string }

/** A data tab: the header row, then 200 rows with the formula columns filled and the drop-downs set. */
function table(name: string, cols: Col[], rows: Cell[][], tabColor?: string): SheetSpec {
  const header: Cell[] = cols.map(c => ({ v: c.h, s: 'header' }));
  const body: Cell[][] = [];
  for (let i = 0; i < ROWS; i += 1) {
    const r = i + 2;
    const given = rows[i];
    if (!given && !cols.some(c => c.f)) break;
    body.push(cols.map((c, j) => (c.f ? { f: c.f(r), s: c.s ?? 'money' } : given?.[j] ?? null)));
  }
  const columnStyles: Record<number, CellStyle> = {};
  cols.forEach((c, j) => { if (c.s && !c.f) columnStyles[j] = c.s; });
  return {
    name, rows: [header, ...body], widths: cols.map(c => c.w), freezeRows: 1, columnStyles, tabColor,
    validations: cols.flatMap((c, j) => (c.list ? [{ range: `${columnLetter(j)}2:${columnLetter(j)}${LAST}`, list: c.list }] : [])),
  };
}

/** A label / value tab (ตั้งค่า): the title in A1, the year always in B3. */
function settingsTab(title: string, pairs: [string, Cell][], extra: Cell[][] = []): SheetSpec {
  return {
    name: 'ตั้งค่า', tabColor: BRICK, widths: [34, 36, 4, 26, 16, 16, 30],
    rows: [[{ v: title, s: 'title' }], [{ v: 'กรอกช่องสีขาวด้านขวา ตัวเลขในแท็บอื่นใช้ข้อมูลจากหน้านี้', s: 'note' }], ...pairs.map(([label, value]) => [{ v: label, s: 'label' }, value] as Cell[]), ...extra],
  };
}

function howTo(info: { title: string; who: string }, lines: string[]): SheetSpec {
  return {
    name: 'วิธีใช้', widths: [100], tabColor: BRICK,
    rows: [
      [{ v: `ชีตบัญชี: ${info.title}`, s: 'title' }],
      [{ v: `สำหรับ ${info.who} สร้างโดยกระรอกตุนเงิน`, s: 'note' }],
      [null],
      ...lines.map(line => [line] as Cell[]),
      [null],
      [{ v: 'ชีตนี้ช่วยจดและสรุปตัวเลข ไม่ได้ยื่นแบบแทนคุณ ตัวเลขภาษีเป็นประมาณการ ตรวจกับนักบัญชีหรือกรมสรรพากรก่อนยื่นจริง', s: 'note' }],
    ],
  };
}

const today = (now: Date) => now.toISOString().slice(0, 10);

// ── 1–2 Freelancers ───────────────────────────────────────────────────────────────────────────────────────────────
const INCOME_TYPES = ['40(2)', '40(6)', '40(8)', 'อื่น ๆ'];
const EXPENSE_CATEGORIES = ['ซื้อสินค้า', 'อุปกรณ์', 'ซอฟต์แวร์', 'เดินทาง', 'ค่าจ้างช่วง', 'ค่าสถานที่', 'โทรศัพท์-เน็ต', 'อื่น ๆ'];
const EVIDENCE = ['ใบกำกับภาษีเต็มรูป', 'ใบกำกับภาษีอย่างย่อ', 'ใบเสร็จ', 'ไม่มี'];

function freelance(profile: BusinessProfile, year: number, vat: boolean, data: TemplateData | null, now: Date): SheetSpec[] {
  const info = TEMPLATE_INFO[vat ? 'freelance_vat' : 'freelance'];
  const cash = !vat && hasSection40_5to8(profile);
  // รายรับ: one row per payment received.
  const incomeCols: Col[] = vat ? [
    { h: 'วันที่รับเงิน', w: 13, s: 'date' }, { h: 'เลขที่ใบกำกับภาษี', w: 16 }, { h: 'ผู้ซื้อ / ผู้จ่ายเงิน', w: 28 }, { h: 'เลขผู้เสียภาษีผู้ซื้อ', w: 18 },
    { h: 'รายการ', w: 26 }, { h: 'ประเภทเงินได้', w: 12, list: INCOME_TYPES }, { h: 'มูลค่าก่อน VAT', w: 15, s: 'money' },
    { h: 'VAT 7%', w: 12, f: r => `IF(G${r}="","",ROUND(G${r}*0.07,2))` }, { h: 'อัตราหัก', w: 9, list: RATES },
    { h: 'ภาษีถูกหัก', w: 12, f: r => `IF(G${r}="","",ROUND(G${r}*${rate(`I${r}`)},2))` },
    { h: 'เงินเข้าจริง', w: 14, f: r => `IF(G${r}="","",G${r}+H${r}-J${r})` },
    { h: 'ได้ 50 ทวิ แล้ว', w: 14, list: ['ได้แล้ว', 'ยังไม่ได้', 'ไม่ต้องใช้'] }, { h: 'หมายเหตุ', w: 26 },
  ] : [
    { h: 'วันที่รับเงิน', w: 13, s: 'date' }, { h: 'ผู้จ่ายเงิน', w: 28 }, { h: 'เลขผู้เสียภาษีผู้จ่าย', w: 18 }, { h: 'รายการ', w: 26 },
    { h: 'ประเภทเงินได้', w: 12, list: INCOME_TYPES }, { h: 'ยอดก่อนหัก', w: 14, s: 'money' }, { h: 'อัตราหัก', w: 9, list: RATES },
    { h: 'ภาษีถูกหัก', w: 12, f: r => `IF(F${r}="","",ROUND(F${r}*${rate(`G${r}`)},2))` },
    { h: 'เงินเข้าจริง', w: 14, f: r => `IF(F${r}="","",F${r}-H${r})` },
    { h: 'หลักฐานการหัก', w: 14, list: ['50 ทวิ', 'e-WHT', 'ไม่ถูกหัก'] }, { h: 'ได้ 50 ทวิ แล้ว', w: 14, list: ['ได้แล้ว', 'ยังไม่ได้', 'ไม่ต้องใช้'] }, { h: 'หมายเหตุ', w: 26 },
  ];
  const incomeRows: Cell[][] = data?.income.length
    ? data.income.map(row => vat
      ? [{ date: row.date }, '', row.payer, '', row.item, '', row.gross, null, `${Math.round(row.whtRate * 100)}%`, null, null, row.whtRate > 0 ? 'ยังไม่ได้' : 'ไม่ต้องใช้', row.received ? '' : 'ยังไม่ได้รับเงิน']
      : [{ date: row.date }, row.payer, '', row.item, '', row.gross, `${Math.round(row.whtRate * 100)}%`, null, null, row.whtRate > 0 ? '50 ทวิ' : 'ไม่ถูกหัก', row.whtRate > 0 ? 'ยังไม่ได้' : 'ไม่ต้องใช้', row.received ? '' : 'ยังไม่ได้รับเงิน'])
    : vat ? [
      [{ date: `${year}-02-05` }, 'INV-001', 'บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)', '0000000000101', 'รีวิวสินค้า 2 คลิป', '40(2)', 40000, null, '3%', null, null, 'ได้แล้ว', ''],
      [{ date: `${year}-03-20` }, 'INV-002', 'ร้านสมมติการค้า (ตัวอย่าง)', '0000000000102', 'ออกแบบโลโก้', '40(8)', 15000, null, '0%', null, null, 'ไม่ต้องใช้', 'ผู้จ่ายเป็นบุคคล ไม่ได้หัก'],
    ] : [
      [{ date: `${year}-02-05` }, 'บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)', '0000000000101', 'รีวิวสินค้า 2 คลิป', '40(2)', 12000, '3%', null, null, '50 ทวิ', 'ได้แล้ว', ''],
      [{ date: `${year}-03-20` }, 'สถาบันสมมติการเรียนรู้ (ตัวอย่าง)', '0000000000102', 'สอนเวิร์กช็อป 1 วัน', '40(2)', 8500, '0%', null, null, 'ไม่ถูกหัก', 'ไม่ต้องใช้', 'ไม่ถูกหัก แต่ยังนับเป็นเงินได้'],
      [{ date: `${year}-01-14` }, 'บริษัท ทดลองดีไซน์ จำกัด (ตัวอย่าง)', '0000000000103', 'ออกแบบโลโก้', '40(8)', 20000, '1%', null, null, 'e-WHT', 'ไม่ต้องใช้', ''],
    ];
  // Column letters in รายรับ that the other tabs read.
  const I = vat ? { date: 'A', type: 'F', gross: 'G', wht: 'J', got: 'L' } : { date: 'A', type: 'E', gross: 'F', wht: 'H', got: 'K' };

  const expenseCols: Col[] = vat ? [
    { h: 'วันที่จ่ายเงิน', w: 13, s: 'date' }, { h: 'ผู้ขาย / ผู้รับเงิน', w: 26 }, { h: 'เลขผู้เสียภาษีผู้ขาย', w: 18 }, { h: 'รายการ', w: 26 },
    { h: 'หมวด', w: 14, list: EXPENSE_CATEGORIES }, { h: 'มูลค่าก่อน VAT', w: 15, s: 'money' }, { h: 'ภาษีซื้อ', w: 12, s: 'money' },
    { h: 'ขอคืนภาษีซื้อได้', w: 14, list: YES_NO }, { h: 'หลักฐาน', w: 18, list: EVIDENCE }, { h: 'ลิงก์ไฟล์', w: 22 },
  ] : [
    { h: 'วันที่จ่ายเงิน', w: 13, s: 'date' }, { h: 'ผู้ขาย / ผู้รับเงิน', w: 26 }, { h: 'รายการ', w: 26 }, { h: 'หมวด', w: 14, list: EXPENSE_CATEGORIES },
    { h: 'ใช้เพื่องาน', w: 11, list: ['ใช่', 'ใช้ร่วม', 'ส่วนตัว'] }, { h: 'สัดส่วนใช้งาน', w: 12, s: 'percent' }, { h: 'จำนวนเงิน', w: 14, s: 'money' },
    { h: 'หลักฐาน', w: 18, list: EVIDENCE },
    { h: 'นับเป็นค่าใช้จ่ายได้', w: 16, f: r => `IF(G${r}="","",IF(OR(H${r}="ไม่มี",E${r}="ส่วนตัว"),0,ROUND(G${r}*IF(E${r}="ใช้ร่วม",IF(F${r}="",1,F${r}),1),2)))` },
    { h: 'ลิงก์ไฟล์', w: 22 },
  ];
  const expenseRows: Cell[][] = data?.expenses.length
    ? data.expenses.map(row => vat
      ? [{ date: row.date }, row.vendor, '', row.item, mapCategory(row.category), row.amount, 0, 'ไม่ใช่', '', '']
      : [{ date: row.date }, row.vendor, row.item, mapCategory(row.category), 'ใช่', 1, row.amount, '', null, ''])
    : vat ? [
      [{ date: `${year}-02-10` }, 'ร้านกล้องสมมติ (ตัวอย่าง)', '0000000000201', 'ไมโครโฟนไร้สาย', 'อุปกรณ์', 3261.68, 228.32, 'ใช่', 'ใบกำกับภาษีเต็มรูป', ''],
    ] : [
      [{ date: `${year}-02-10` }, 'ร้านกล้องสมมติ (ตัวอย่าง)', 'ไมโครโฟนไร้สาย', 'อุปกรณ์', 'ใช่', 1, 3490, 'ใบกำกับภาษีเต็มรูป', null, ''],
      [{ date: `${year}-03-15` }, 'ปั๊มน้ำมันสมมติ (ตัวอย่าง)', 'น้ำมันรถไปถ่ายงาน', 'เดินทาง', 'ใช้ร่วม', 0.5, 1200, 'ใบกำกับภาษีอย่างย่อ', null, ''],
    ];

  // ภาษีถูกหัก ณ ที่จ่าย: by month, from รายรับ.
  const whtRows: Cell[][] = [[{ v: 'เดือน', s: 'header' }, { v: 'เงินได้รวม', s: 'header' }, { v: 'ภาษีถูกหักรวม', s: 'header' }, { v: '50 ทวิ ที่ยังไม่ได้ (ใบ)', s: 'header' }]];
  MONTHS.forEach((name, i) => {
    const m = i + 1;
    whtRows.push([name, { f: sumMonth('รายรับ', I.gross, I.date, m) }, { f: sumMonth('รายรับ', I.wht, I.date, m) },
      { f: `COUNTIFS(${col('รายรับ', I.date)},">="&DATE(${YEAR},${m},1),${col('รายรับ', I.date)},"<"&DATE(${YEAR},${m + 1},1),${col('รายรับ', I.got)},"ยังไม่ได้")`, s: 'text' }]);
  });
  whtRows.push([{ v: 'รวมทั้งปี', s: 'label' }, { f: 'SUM(B2:B13)', s: 'total' }, { f: 'SUM(C2:C13)', s: 'total' }, { f: 'SUM(D2:D13)', s: 'total' }]);
  whtRows.push([null], [{ v: 'ภาษีที่ถูกหักไว้ใช้เป็นเครดิตตอนยื่น ภ.ง.ด.90 (และ ภ.ง.ด.94 สำหรับเงินได้ 40(5)–(8)) เก็บ 50 ทวิ ให้ครบทุกใบ', s: 'note' }]);

  const sheets: SheetSpec[] = [
    howTo(info, [
      '1. กรอกแท็บ ตั้งค่า ก่อน (ชื่อ เลขประจำตัวผู้เสียภาษี ปีภาษี)',
      '2. ทุกครั้งที่เงินเข้า เพิ่มหนึ่งแถวในแท็บ รายรับ ใช้วันที่เงินเข้าจริง ภาษีถูกหักและเงินเข้าจริงคำนวณให้เอง',
      '3. ทุกครั้งที่จ่ายเงินเพื่องาน เพิ่มหนึ่งแถวในแท็บ รายจ่าย และเก็บใบเสร็จหรือใบกำกับภาษีไว้ แถวที่ไม่มีหลักฐานจะไม่ถูกนับ',
      '4. แท็บ ภาษีถูกหัก ณ ที่จ่าย บอกว่าแต่ละเดือนถูกหักไปเท่าไร และยังขาด 50 ทวิ กี่ใบ',
      ...(cash ? ['5. แท็บ รายงานเงินสดรับ-จ่าย คือสรุปรายเดือนของรายงานที่กฎหมายบังคับ (เงินได้ 40(5)–(8) และไม่จด VAT) ลงรายการภายใน 3 วันทำการ'] : []),
      ...(vat ? ['5. จด VAT แล้ว: ภาษีขายคิดจากแท็บรายรับ ภาษีซื้อจากแท็บรายจ่าย แท็บ สรุป ภ.พ.30 บอกยอดที่ต้องชำระทุกเดือน แม้ไม่มียอดขาย ต้องยื่น'] : []),
      'ช่องสีส้มคือหัวตาราง ช่องที่มีลูกศรให้เลือกจากรายการ อย่าพิมพ์ทับช่องที่เป็นสูตร',
    ]),
    settingsTab('ตั้งค่า', [
      ['ปีภาษี (พ.ศ.)', { v: year + 543, s: 'text' }],
      ['ชื่อผู้ประกอบกิจการ', ''], ['เลขประจำตัวผู้เสียภาษี', ''], ['ชื่อสถานประกอบการ (ถ้ามี)', ''],
      ['สถานะ VAT', vat ? 'จดแล้ว' : 'ยังไม่จด'],
      ['ประเภทเงินได้หลัก', profile.income === 'per_job' ? '40(2)' : profile.income === 'profession' ? '40(6)' : profile.income === 'own_business' ? '40(8)' : 'หลายประเภท'],
      ['กันเงินไว้จ่ายภาษี (%)', { v: 0.05, s: 'percent' }],
    ]),
    table('รายรับ', incomeCols, incomeRows),
    table('รายจ่าย', expenseCols, expenseRows),
    { name: 'ภาษีถูกหัก ณ ที่จ่าย', rows: whtRows, widths: [16, 18, 18, 22], freezeRows: 1 },
  ];

  if (cash) {
    const cashRows: Cell[][] = [[{ v: 'เดือน', s: 'header' }, { v: 'รายรับ 40(5)–(8)', s: 'header' }, { v: 'รายจ่าย ซื้อสินค้า', s: 'header' }, { v: 'รายจ่าย ค่าใช้จ่ายอื่น ๆ', s: 'header' }, { v: 'กำไร', s: 'header' }]];
    MONTHS.forEach((name, i) => {
      const m = i + 1; const r = i + 2;
      cashRows.push([name,
        { f: `${sumMonth('รายรับ', I.gross, I.date, m, `,${col('รายรับ', I.type)},"40(6)"`)}+${sumMonth('รายรับ', I.gross, I.date, m, `,${col('รายรับ', I.type)},"40(8)"`)}` },
        { f: sumMonth('รายจ่าย', 'I', 'A', m, `,${col('รายจ่าย', 'D')},"ซื้อสินค้า"`) },
        { f: `${sumMonth('รายจ่าย', 'I', 'A', m)}-C${r}` },
        { f: `B${r}-C${r}-D${r}` }]);
    });
    cashRows.push([{ v: 'รวมทั้งปี', s: 'label' }, { f: 'SUM(B2:B13)', s: 'total' }, { f: 'SUM(C2:C13)', s: 'total' }, { f: 'SUM(D2:D13)', s: 'total' }, { f: 'SUM(E2:E13)', s: 'total' }]);
    cashRows.push([null], [{ v: 'รายงานเงินสดรับ-จ่ายตามประกาศอธิบดีฯ (ฉบับที่ 161): บุคคลธรรมดาที่ไม่จด VAT และมีเงินได้ 40(5)–(8) ต้องลงรายการภายใน 3 วันทำการ รายการละเอียดอยู่ในแท็บรายรับและรายจ่าย แท็บนี้สรุปเป็นรายเดือน', s: 'note' }]);
    sheets.push({ name: 'รายงานเงินสดรับ-จ่าย', rows: cashRows, widths: [16, 18, 18, 22, 16], freezeRows: 1 });
  }

  if (vat) {
    const sales: Col[] = [
      { h: 'ลำดับ', w: 7, f: r => `IF('รายรับ'!A${r}="","",ROW()-1)`, s: 'text' },
      { h: 'วันที่ใบกำกับ', w: 13, f: r => `IF('รายรับ'!A${r}="","",'รายรับ'!A${r})`, s: 'date' },
      { h: 'เลขที่', w: 14, f: r => `IF('รายรับ'!A${r}="","",'รายรับ'!B${r})`, s: 'text' },
      { h: 'ชื่อผู้ซื้อ', w: 28, f: r => `IF('รายรับ'!A${r}="","",'รายรับ'!C${r})`, s: 'text' },
      { h: 'เลขผู้เสียภาษีผู้ซื้อ', w: 18, f: r => `IF('รายรับ'!A${r}="","",'รายรับ'!D${r})`, s: 'text' },
      { h: 'มูลค่า', w: 14, f: r => `IF('รายรับ'!A${r}="","",'รายรับ'!G${r})` },
      { h: 'ภาษีขาย', w: 12, f: r => `IF('รายรับ'!A${r}="","",'รายรับ'!H${r})` },
    ];
    const purchases: Col[] = [
      { h: 'ลำดับ', w: 7, f: r => `IF(OR('รายจ่าย'!A${r}="",'รายจ่าย'!H${r}<>"ใช่"),"",ROW()-1)`, s: 'text' },
      { h: 'วันที่ใบกำกับ', w: 13, f: r => `IF(OR('รายจ่าย'!A${r}="",'รายจ่าย'!H${r}<>"ใช่"),"",'รายจ่าย'!A${r})`, s: 'date' },
      { h: 'ชื่อผู้ขาย', w: 26, f: r => `IF(OR('รายจ่าย'!A${r}="",'รายจ่าย'!H${r}<>"ใช่"),"",'รายจ่าย'!B${r})`, s: 'text' },
      { h: 'เลขผู้เสียภาษีผู้ขาย', w: 18, f: r => `IF(OR('รายจ่าย'!A${r}="",'รายจ่าย'!H${r}<>"ใช่"),"",'รายจ่าย'!C${r})`, s: 'text' },
      { h: 'มูลค่า', w: 14, f: r => `IF(OR('รายจ่าย'!A${r}="",'รายจ่าย'!H${r}<>"ใช่"),"",'รายจ่าย'!F${r})` },
      { h: 'ภาษีซื้อ', w: 12, f: r => `IF(OR('รายจ่าย'!A${r}="",'รายจ่าย'!H${r}<>"ใช่"),"",'รายจ่าย'!G${r})` },
    ];
    sheets.push(table('รายงานภาษีขาย', sales, []), table('รายงานภาษีซื้อ', purchases, []));
    const pp30: Cell[][] = [['เดือนภาษี', 'ยอดขาย', 'ภาษีขาย', 'ยอดซื้อที่ขอคืนได้', 'ภาษีซื้อ', 'ต้องชำระ (+) / ชำระเกิน (−)', 'กำหนดยื่น กระดาษ', 'กำหนดยื่น ออนไลน์'].map(v => ({ v, s: 'header' as const }))];
    MONTHS.forEach((name, i) => {
      const m = i + 1; const r = i + 2;
      pp30.push([name, { f: sumMonth('รายรับ', 'G', 'A', m) }, { f: sumMonth('รายรับ', 'H', 'A', m) },
        { f: sumMonth('รายจ่าย', 'F', 'A', m, `,${col('รายจ่าย', 'H')},"ใช่"`) }, { f: sumMonth('รายจ่าย', 'G', 'A', m, `,${col('รายจ่าย', 'H')},"ใช่"`) },
        { f: `C${r}-E${r}` }, { f: `WORKDAY(DATE(${YEAR},${m + 1},15)-1,1)`, s: 'date' }, { f: `WORKDAY(DATE(${YEAR},${m + 1},23)-1,1)`, s: 'date' }]);
    });
    pp30.push([null], [{ v: 'ภ.พ.30 ต้องยื่นทุกเดือนแม้ไม่มียอดขาย วันยื่นเลื่อนเฉพาะเสาร์-อาทิตย์ในชีตนี้ ปฏิทินยื่นภาษีในแอปเลื่อนวันหยุดราชการให้ด้วย ส่วนขยายยื่นออนไลน์ใช้ได้กับงวดที่ครบกำหนดถึง 31 ม.ค. 2570', s: 'note' }]);
    sheets.push({ name: 'สรุป ภ.พ.30', rows: pp30, widths: [14, 15, 13, 17, 13, 22, 16, 16], freezeRows: 1 });
  }

  // สรุปภาษีรายปี: by income type, split at June for ภ.ง.ด.94.
  const half = (type: string, from: number, to: number) => `SUMIFS(${col('รายรับ', I.gross)},${col('รายรับ', I.type)},"${type}",${col('รายรับ', I.date)},">="&DATE(${YEAR},${from},1),${col('รายรับ', I.date)},"<"&DATE(${YEAR},${to},1))`;
  const yearRows: Cell[][] = [['ประเภทเงินได้', 'เงินได้ ม.ค.–มิ.ย.', 'เงินได้ ก.ค.–ธ.ค.', 'รวมทั้งปี', 'ภาษีถูกหักรวม'].map(v => ({ v, s: 'header' as const }))];
  ['40(2)', '40(6)', '40(8)', 'อื่น ๆ'].forEach((type, i) => {
    const r = i + 2;
    yearRows.push([type, { f: half(type, 1, 7) }, { f: half(type, 7, 13) }, { f: `B${r}+C${r}` },
      { f: `SUMIFS(${col('รายรับ', I.wht)},${col('รายรับ', I.type)},"${type}",${col('รายรับ', I.date)},">="&DATE(${YEAR},1,1),${col('รายรับ', I.date)},"<"&DATE(${YEAR}+1,1,1))` }]);
  });
  yearRows.push([{ v: 'รวม', s: 'label' }, { f: 'SUM(B2:B5)', s: 'total' }, { f: 'SUM(C2:C5)', s: 'total' }, { f: 'SUM(D2:D5)', s: 'total' }, { f: 'SUM(E2:E5)', s: 'total' }]);
  yearRows.push([null], [{ v: 'เฝ้าเกณฑ์ VAT', s: 'label' }, { f: 'D6', s: 'total' }, { f: vat ? '"จด VAT แล้ว"' : 'IF(D6>=1800000,"เกิน 1.8 ล้าน ต้องจด VAT ภายใน 30 วัน",IF(D6>=1500000,"ใกล้เกณฑ์ 1.8 ล้าน","ปกติ"))', s: 'text' }]);
  yearRows.push([null], [{ v: 'ตัวเลขประมาณการเพื่อเตรียมตัว ไม่ใช่การยื่นแบบ ค่าใช้จ่ายและค่าลดหย่อนให้นักบัญชีหรือโปรแกรมของกรมสรรพากรคำนวณ', s: 'note' }]);
  sheets.push({ name: 'สรุปภาษีรายปี', rows: yearRows, widths: [16, 18, 18, 16, 16], freezeRows: 1 });
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
    { h: 'วันที่จ่าย', w: 13, s: 'date' }, { h: projectHeader, w: 13 }, { h: 'หมวด', w: 16, list: categories }, { h: 'ผู้รับเงิน', w: 24 },
    { h: 'ประเภทผู้รับ', w: 12, list: PAYEE_TYPES }, { h: 'รายการ', w: 24 }, { h: 'ก่อน VAT', w: 14, s: 'money' }, { h: 'VAT', w: 11, s: 'money' },
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
  const rows: Cell[][] = [['เดือน', 'ภ.ง.ด.3 (บุคคล)', 'ภ.ง.ด.53 (นิติบุคคล)', 'ภ.ง.ด.54 (ต่างประเทศ)', 'กำหนดยื่น กระดาษ', 'กำหนดยื่น ออนไลน์'].map(v => ({ v, s: 'header' as const }))];
  const sum = (formName: string, m: number) => sources.map(src => src.fixedForm
    ? (src.fixedForm === formName ? sumMonth(src.sheet, src.tax, src.date, m) : '0')
    : sumMonth(src.sheet, src.tax, src.date, m, `,${col(src.sheet, src.form!)},"${formName}"`)).join('+');
  MONTHS.forEach((name, i) => {
    const m = i + 1;
    rows.push([name, { f: sum('ภ.ง.ด.3', m) }, { f: sum('ภ.ง.ด.53', m) }, { f: sum('ภ.ง.ด.54', m) },
      { f: `WORKDAY(DATE(${YEAR},${m + 1},7)-1,1)`, s: 'date' }, { f: `WORKDAY(DATE(${YEAR},${m + 1},15)-1,1)`, s: 'date' }]);
  });
  rows.push([{ v: 'รวมทั้งปี', s: 'label' }, { f: 'SUM(B2:B13)', s: 'total' }, { f: 'SUM(C2:C13)', s: 'total' }, { f: 'SUM(D2:D13)', s: 'total' }]);
  rows.push([null], [{ v: 'ยื่นเฉพาะเดือนที่หักภาษีไว้ ส่งให้นักบัญชีพร้อมสำเนา 50 ทวิ ส่วนขยายยื่นออนไลน์ใช้ได้กับงวดที่ครบกำหนดถึง 31 ม.ค. 2570', s: 'note' }]);
  return { name: 'ทะเบียนหัก ณ ที่จ่าย', rows, widths: [14, 17, 19, 19, 16, 16], freezeRows: 1 };
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
    { h: 'รหัสโปรเจกต์', w: 13 }, { h: 'ชื่อแคมเปญ', w: 26 }, { h: 'ลูกค้า', w: 24 }, { h: 'เลขผู้เสียภาษีลูกค้า', w: 18 },
    { h: 'ค่าบริการก่อน VAT', w: 16, s: 'money' }, { h: 'ค่าสื่อแทนจ่าย (ประมาณ)', w: 18, s: 'money' },
    { h: 'สถานะ', w: 12, list: ['เสนอราคา', 'กำลังทำ', 'ส่งงานแล้ว', 'ปิดงาน'] }, { h: 'วันเริ่ม', w: 12, s: 'date' }, { h: 'วันส่งงาน', w: 12, s: 'date' },
    { h: 'ต้นทุนจริง (ไม่รวมค่าสื่อ)', w: 20, f: r => `IF(A${r}="","",SUMIFS(${col('ค่าใช้จ่ายโปรเจกต์', 'G')},${col('ค่าใช้จ่ายโปรเจกต์', 'B')},A${r})-SUMIFS(${col('ค่าใช้จ่ายโปรเจกต์', 'G')},${col('ค่าใช้จ่ายโปรเจกต์', 'B')},A${r},${col('ค่าใช้จ่ายโปรเจกต์', 'C')},"ค่าสื่อแทนจ่าย"))` },
    { h: 'กำไรขั้นต้น', w: 14, f: r => `IF(A${r}="","",E${r}-J${r})` },
  ], [['PRJ-2569-001', 'เปิดตัวสินค้าใหม่ (ตัวอย่าง)', 'บริษัท สมมติเครื่องดื่ม จำกัด (ตัวอย่าง)', '0000000000301', 85000, 120000, 'กำลังทำ', { date: `${year}-03-01` }, { date: `${year}-04-15` }, null, null]]);
  const budget = table('งบเทียบจริง', [
    { h: 'รหัสโปรเจกต์', w: 13 }, { h: 'หมวด', w: 18, list: CATS }, { h: 'รายการ', w: 28 }, { h: 'งบ', w: 14, s: 'money' },
    { h: 'ใช้จริง', w: 14, f: r => `IF(A${r}="","",SUMIFS(${col('ค่าใช้จ่ายโปรเจกต์', 'G')},${col('ค่าใช้จ่ายโปรเจกต์', 'B')},A${r},${col('ค่าใช้จ่ายโปรเจกต์', 'C')},B${r}))` },
    { h: 'ส่วนต่าง', w: 14, f: r => `IF(A${r}="","",D${r}-E${r})` },
  ], [['PRJ-2569-001', 'โปรดักชัน', 'ถ่ายวิดีโอ 1 วัน', 45000, null, null], ['PRJ-2569-001', 'KOL', 'อินฟลูเอนเซอร์ 3 คน', 30000, null, null]]);
  return [
    howTo(TEMPLATE_INFO.agency, [
      '1. กรอกแท็บ ตั้งค่า (ชื่อกิจการ เลขผู้เสียภาษี ปีบัญชี)',
      '2. เปิดหนึ่งแถวในแท็บ โปรเจกต์ ต่อหนึ่งแคมเปญ ใช้รหัสโปรเจกต์เดียวกันในทุกแท็บ',
      '3. งบเทียบจริงดึงยอดใช้จริงจากแท็บ ค่าใช้จ่ายโปรเจกต์ ตามรหัสและหมวด',
      '4. ค่าสื่อที่จ่ายแทนลูกค้า เลือกหมวด “ค่าสื่อแทนจ่าย” เพื่อแยกออกจากกำไรของเอเจนซี่',
      '5. แบบที่ต้องยื่น (ภ.ง.ด.3 / 53 / 54) ขึ้นให้เองจากประเภทผู้รับและอัตราหัก ทะเบียนหัก ณ ที่จ่ายสรุปเป็นรายเดือน',
      '6. ทุกต้นเดือน ใช้แท็บ ส่งบัญชีประจำเดือน เช็กเอกสารก่อนส่งนักบัญชี (ควรส่งก่อนวันที่ 5)',
    ]),
    companySettings('ตั้งค่ากิจการ', year), projects, budget,
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
    { h: 'รหัสงาน', w: 13 }, { h: 'ชื่องาน', w: 24 }, { h: 'ลูกค้า', w: 24 }, { h: 'ประเภทงาน', w: 12, list: ['TVC', 'ออนไลน์', 'ภาพนิ่ง', 'อีเวนต์', 'MV'] },
    { h: 'วันถ่ายแรก', w: 12, s: 'date' }, { h: 'จำนวนวันถ่าย', w: 12, s: 'text' }, { h: 'มูลค่างานก่อน VAT', w: 16, s: 'money' },
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
    howTo(TEMPLATE_INFO.production, [
      '1. กรอกแท็บ ตั้งค่า แล้วเปิดหนึ่งแถวในแท็บ งาน ต่อหนึ่งงาน ใช้รหัสงานเดียวกันทุกแท็บ',
      '2. งบโปรดักชัน = คน × วัน × ราคาต่อหน่วย ใช้จริงดึงจากทีมงาน เคลียร์เงิน และค่าใช้จ่าย ตามรหัสงานและหมวด',
      '3. ค่าตัวทีมงานและนักแสดง: เลือกประเภทเงินได้และอัตราหัก ภาษีหักและจ่ายสุทธิคำนวณให้ ออก 50 ทวิ ให้ทุกคนที่ถูกหัก',
      '4. เงินทดรอง: หนึ่งใบเบิกต่อหนึ่งก้อน ใส่วันที่ต้องเคลียร์ แล้วลงหลักฐานทุกใบในแท็บ เคลียร์เงิน ด้วยเลขที่ใบเบิกเดียวกัน',
      '5. ทะเบียนหัก ณ ที่จ่ายสรุป ภ.ง.ด.3 และ 53 รายเดือนให้นักบัญชี',
      '6. ทุกต้นเดือน ใช้แท็บ ส่งบัญชีประจำเดือน เช็กเอกสารก่อนส่งนักบัญชี (ควรส่งก่อนวันที่ 5)',
    ]),
    companySettings('ตั้งค่ากิจการ', year), jobs, budget, crew, advances, clearing,
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
  const H = `${q('ตั้งค่า')}!$F$7:$F$${6 + days.length}`;
  const rule = (formRef: string, colL: string) => `INDEX(${q('ตั้งค่า')}!$${colL}$7:$${colL}$11,MATCH(${formRef},${q('ตั้งค่า')}!$A$7:$A$11,0))`;
  const settings = settingsTab('ตั้งค่าสำนักงาน', [['ปี (พ.ศ.)', { v: year + 543, s: 'text' }], ['ชื่อสำนักงาน', ''], ['ผู้ทำบัญชี', '']]);
  settings.rows.push(['แบบ', 'วันกระดาษ (ของเดือนถัดไป)', null, 'วันออนไลน์', 'หมายเหตุ', 'วันหยุดราชการ'].map(v => (v ? { v, s: 'header' as const } : null)));
  const rules: [string, number, number, string][] = [['ภ.ง.ด.1', 7, 15, 'ส่วนขยายออนไลน์ถึงงวดที่ครบกำหนด 31 ม.ค. 2570'], ['ภ.ง.ด.3', 7, 15, ''], ['ภ.ง.ด.53', 7, 15, ''], ['ภ.พ.30', 15, 23, 'ยื่นทุกเดือนแม้ไม่มียอด'], ['สปส.1-10', 15, 15, 'ออนไลน์ได้เพิ่ม 7 วันทำการ ตรวจกับ สปส.']];
  const longest = Math.max(rules.length, days.length);
  for (let i = 0; i < longest; i += 1) {
    const ruleRow = rules[i];
    settings.rows.push([ruleRow?.[0] ?? null, ruleRow ? { v: ruleRow[1], s: 'text' } : null, null, ruleRow ? { v: ruleRow[2], s: 'text' } : null, ruleRow?.[3] ?? null, days[i] ? { date: days[i] } : null]);
  }
  // The rules table and the holidays start at row 7 (title, note, three settings, header): the formulas above read them there.
  const clients = table('ลูกค้า', [
    { h: 'รหัสลูกค้า', w: 11 }, { h: 'ชื่อกิจการ', w: 26 }, { h: 'ประเภทกิจการ', w: 14, list: ['บุคคลธรรมดา', 'ห้างหุ้นส่วนจำกัด', 'บริษัทจำกัด'] },
    { h: 'เลขผู้เสียภาษี', w: 16 }, { h: 'จด VAT', w: 9, list: YES_NO }, { h: 'มีลูกจ้าง', w: 9, list: YES_NO }, { h: 'วันสิ้นรอบบัญชี', w: 14, s: 'date' },
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
    { h: 'วันตามกฎ', w: 13, s: 'date', f: r => `IF(OR(A${r}="",B${r}="",D${r}=""),"",DATE(A${r}-543,B${r}+1,IF(E${r}="กระดาษ",${rule(`D${r}`, 'B')},${rule(`D${r}`, 'D')})))` },
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
    howTo(TEMPLATE_INFO.office, [
      '1. แท็บ ลูกค้า: หนึ่งแถวต่อลูกค้า ใช้รหัสลูกค้าเดียวกันในทุกแท็บ',
      '2. เช็กลิสต์เอกสาร: หนึ่งแถวต่อลูกค้าต่อเดือน กำหนดส่งเอกสารคือวันที่ 5 ของเดือนถัดไป (เลื่อนวันหยุดให้)',
      '3. ยื่นแบบรายเดือน: เลือกแบบและวิธียื่น วันตามกฎและกำหนดส่งหลังเลื่อนวันหยุดคำนวณจากตารางในแท็บ ตั้งค่า',
      '4. ติดตามเอกสาร: จดเรื่องที่ขาด และวันที่ขอให้ลูกค้าส่ง ก่อนถึงกำหนดยื่นของแบบที่ได้รับผลกระทบ',
      '5. ปิดงบประจำปี: กำหนดส่งงบ DBD และ ภ.ง.ด.50 คำนวณจากประเภทกิจการ วันปิดบัญชี และวันประชุม',
      '6. เมื่อกฎเปลี่ยน (เช่น ส่วนขยายยื่นออนไลน์) แก้ตารางในแท็บ ตั้งค่า จุดเดียว',
    ]),
    clients, checklist, filings, followUps, closing, settings,
  ];
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
