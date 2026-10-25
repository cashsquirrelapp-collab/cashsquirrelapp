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
// total expenses and net profit (4,000 − 8,000 = −4,000), the loss in the card's header. The email and the Excel file
// keep the net cash flow after the money moved to savings goals (−5,000). Either way a loss stays negative.
const headerRow = (card: any, label: string) => card.contents.header.contents.flatMap((item: any) => item.contents ?? [])
  .find((item: any) => item.contents?.[0]?.text === label);

test('scheduled report outputs preserve a negative net cash flow', () => {
  const expected = '฿ -5,000';
  assert.match(buildReportHtml('กันยายน 2569', summary), new RegExp(expected));
  assert.match(buildReportLineText('กันยายน 2569', summary, null), /กำไรสุทธิ: −฿ 4,000/);

  const flex = buildReportFlexMessage('กันยายน 2569', summary, null) as any;
  assert.equal(headerRow(flex, 'กำไรสุทธิ').contents[1].text, '−฿ 4,000');

  const workbook = XLSX.read(Buffer.from(buildMonthlyExcelBase64('กันยายน 2569', summary, [], []), 'base64'), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets['สรุปเดือน'], { header: 1 });
  assert.deepEqual(rows.find(row => row[0] === 'กระแสเงินสดสุทธิคงเหลือ'), ['กระแสเงินสดสุทธิคงเหลือ', -5_000]);
});

test('LINE assistant context and monthly summary card preserve the same shortfall', () => {
  const withMonth = { ...summary, monthKey: '2026-09' };
  const formatted = formatAssistantMonthlySummary(withMonth);
  assert.equal(formatted.กระแสเงินสดสุทธิหลังเผื่องบประจำ, '฿ -5,000');

  assert.equal(formatted.กำไรสุทธิเดือนนี้_ก่อนแบ่งออม, '฿ -4,000');
  const card = buildMonthlySummaryMessage(withMonth) as any;
  assert.equal(headerRow(card, 'กำไรสุทธิ').contents[1].text, '−฿ 4,000');
});
