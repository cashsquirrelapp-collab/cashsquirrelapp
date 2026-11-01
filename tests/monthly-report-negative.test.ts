import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import type { MonthlySummary } from '../shared/monthlySummary';
import {
  buildMonthlyExcelBase64,
  buildReportFlexMessage,
  buildReportHtml,
  buildReportLineText,
} from '../backend/src/handlers/send-monthly-report';
import {
  buildMonthlySummaryMessage,
  formatAssistantMonthlySummary,
} from '../backend/src/services/lineAssistant';

const summary: MonthlySummary = {
  income: 4_000,
  received: 4_000,
  variableExpense: 5_000,
  cashGoalDeductions: 1_000,
  fixedExpenseCalculated: 3_000,
  netFlow: -5_000,
  receivedAfterVariableExpense: 0,
  actualSavings: 0,
};

// LINE shows the same three numbers as the app's overview since package 26 (formal cards, 2026-10-22): received,
// total expenses and net profit (4,000 − 8,000 = −4,000), the loss in the card's header. Since 2026-11-01 the email and
// the Excel file show those same numbers too (they used to show the cash flow after goal transfers, −5,000, which did
// not match the LINE card). A loss stays negative everywhere.
const headerRow = (card: any, label: string) => card.contents.header.contents.flatMap((item: any) => item.contents ?? [])
  .find((item: any) => item.contents?.[0]?.text === label);

test('scheduled report outputs show the same negative net profit everywhere', () => {
  const html = buildReportHtml('กันยายน 2569', summary);
  assert.match(html, /กำไรสุทธิ[\s\S]*−฿ 4,000/);
  assert.match(html, /รายรับ[\s\S]*฿ 4,000/);
  assert.match(html, /รายจ่ายรวม[\s\S]*−?฿ 8,000/);
  assert.doesNotMatch(html, /-5,000|−฿ 5,000|NET CASH FLOW|ยอดออม/);
  assert.match(buildReportLineText('กันยายน 2569', summary, null), /กำไรสุทธิ: −฿ 4,000/);

  const flex = buildReportFlexMessage('กันยายน 2569', summary, null) as any;
  assert.equal(headerRow(flex, 'กำไรสุทธิ').contents[1].text, '−฿ 4,000');

  const workbook = XLSX.read(Buffer.from(buildMonthlyExcelBase64('กันยายน 2569', summary, [], []), 'base64'), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets['สรุปเดือน'], { header: 1 });
  assert.deepEqual(rows.slice(1), [
    ['รายรับ', 4_000],
    ['รายจ่ายประจำ', 3_000],
    ['รายจ่ายทั่วไป', 5_000],
    ['รายจ่ายรวม', 8_000],
    ['กำไรสุทธิ (รายรับ − รายจ่าย)', -4_000],
  ]);
});

test('LINE assistant context and monthly summary card preserve the same shortfall', () => {
  const withMonth = { ...summary, monthKey: '2026-09' };
  const formatted = formatAssistantMonthlySummary(withMonth);
  assert.equal(formatted.กระแสเงินสดสุทธิหลังเผื่องบประจำ, '฿ -5,000');

  assert.equal(formatted.กำไรสุทธิเดือนนี้_ก่อนแบ่งออม, '฿ -4,000');
  const card = buildMonthlySummaryMessage(withMonth) as any;
  assert.equal(headerRow(card, 'กำไรสุทธิ').contents[1].text, '−฿ 4,000');
});
