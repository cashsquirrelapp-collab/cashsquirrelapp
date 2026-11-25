// Month tabs in our workbooks (owner, 2026-11-25: "Google Sheet อ่ะมึงทำแบบว่าแบ่งเป็นเดือนด้วยดิ ... มีก็ดีแต่ว่าควรแบ่ง
// เป็นเดือนด้วย", and picked one tab per month): ม.ค. to ธ.ค., each a read-only view the sheet fills itself from รายรับ and
// รายจ่าย. The year's tabs stay where every record is typed (and where the app reads and writes); a month tab only shows.
// Totals on top (รับแล้ว, จ่ายไป, คงเหลือ, ค้างรับ), the month's income on the left and its spending on the right, side by
// side so neither list ever runs into the other. A job received is in the month of วันที่รับเงิน; one not received yet in
// the month of วันนัดรับเงิน. The app adds the tabs once (backend sheetWrite.ts addMonthTabs) and never reads them.
import { MONTH_TAB_NAMES } from './paymentColumn.js';

const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
/** Row 2 of every month tab: says where to edit, and tells the app's reader the tab is one of these views. */
export const MONTH_NOTE = 'แท็บนี้ดึงรายการจากแท็บ รายรับ และ รายจ่าย ให้เอง แก้หรือเพิ่มรายการที่แท็บนั้น';

/** Column letters in รายรับ and รายจ่าย (null where the tab has no such column). */
export interface MonthSources {
  income: { tab: string; date: string; due: string | null; client: string | null; name: string | null; value: string; status: string | null; received: string | null; pending: string | null };
  expense: { tab: string; date: string; name: string | null; category: string | null; amount: string } | null;
}

/** Where things sit in a month tab (0-based rows and columns), for the formatting the Google side applies. */
export const MONTH_LAYOUT = {
  titleRow: 0, noteRow: 1, labelRow: 3, totalRow: 4, sectionRow: 6, headerRow: 7, firstRow: 8,
  incomeColumns: 8, expenseFrom: 9, expenseColumns: 4,
  /** Money and date columns of the lists. */
  money: [3, 5, 6, 12], dates: [0, 7, 9],
  widths: [104, 170, 200, 110, 110, 104, 104, 112, 24, 104, 200, 120, 110],
} as const;

const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;
const YEAR = `('ตั้งค่า'!$B$3-543)`;

/** The cells of month m (1–12): text and formulas, row by row, as the sheet takes them typed in. */
export function monthTabRows(m: number, at: MonthSources): string[][] {
  const start = `DATE(${YEAR},${m},1)`, end = `DATE(${YEAR},${m + 1},1)`;
  const inc = (letter: string) => `${quote(at.income.tab)}!${letter}2:${letter}`;
  const between = (range: string) => `(${range}>=${start})*(${range}<${end})`;
  const paid = `(${inc(at.income.date)}<>"")*${between(inc(at.income.date))}`;
  const due = at.income.due ? `+(${inc(at.income.date)}="")*${between(inc(at.income.due))}` : '';
  const incomeIn = `(${inc(at.income.value)}<>"")*((${paid})${due})`;
  const pick = (range: string, cond: string, empty = '') => `=IFERROR(FILTER(${range},${cond}),"${empty}")`;
  const incomeCols: [string, string | null][] = [
    ['วันที่รับเงิน', at.income.date], ['ผู้จ่ายเงิน', at.income.client], ['รายการ', at.income.name], ['ยอดก่อนหัก', at.income.value],
    ['การชำระ', at.income.status], ['รับแล้ว', at.income.received], ['ค้างรับ', at.income.pending], ['วันนัดรับเงิน', at.income.due],
  ];
  const ex = at.expense;
  const exp = (letter: string) => `${quote(ex!.tab)}!${letter}2:${letter}`;
  const expenseIn = ex ? `(${exp(ex.amount)}<>"")*${between(exp(ex.date))}` : '';
  const expenseCols: [string, string | null][] = ex ? [['วันที่จ่ายเงิน', ex.date], ['รายการ', ex.name], ['หมวด', ex.category], ['จำนวนเงิน', ex.amount]] : [];

  const L = MONTH_LAYOUT;
  const rows: string[][] = Array.from({ length: L.firstRow + 1 }, () => []);
  rows[L.titleRow][0] = `="${MONTH_NAMES[m - 1]} "&'ตั้งค่า'!$B$3`;
  rows[L.noteRow][0] = MONTH_NOTE;
  const first = L.firstRow + 1;
  ['รับแล้ว', 'จ่ายไป', 'คงเหลือ', 'ค้างรับ'].forEach((label, i) => { rows[L.labelRow][i] = label; });
  rows[L.totalRow][0] = at.income.received ? `=SUM(F${first}:F)` : '=0';
  rows[L.totalRow][1] = ex ? `=SUM(M${first}:M)` : '=0';
  rows[L.totalRow][2] = `=A${L.totalRow + 1}-B${L.totalRow + 1}`;
  rows[L.totalRow][3] = at.income.pending ? `=SUM(G${first}:G)` : '=0';
  rows[L.sectionRow][0] = 'รายรับเดือนนี้';
  incomeCols.forEach(([header, letter], i) => {
    rows[L.headerRow][i] = header;
    if (letter) rows[L.firstRow][i] = pick(inc(letter), incomeIn, i === 0 ? 'ยังไม่มีรายรับเดือนนี้' : '');
  });
  if (ex) {
    rows[L.sectionRow][L.expenseFrom] = 'รายจ่ายเดือนนี้';
    expenseCols.forEach(([header, letter], i) => {
      rows[L.headerRow][L.expenseFrom + i] = header;
      if (letter) rows[L.firstRow][L.expenseFrom + i] = pick(exp(letter), expenseIn, i === 0 ? 'ยังไม่มีรายจ่ายเดือนนี้' : '');
    });
  }
  return rows.map(row => Array.from({ length: row.length }, (_, i) => row[i] ?? ''));
}

export const monthTabs = (at: MonthSources) => MONTH_TAB_NAMES.map((title, i) => ({ title, rows: monthTabRows(i + 1, at) }));
