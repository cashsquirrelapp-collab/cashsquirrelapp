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

test('scheduled report outputs preserve a negative net cash flow', () => {
  const expected = '฿ -5,000';
  assert.match(buildReportHtml('กันยายน 2569', summary), new RegExp(expected));
  assert.match(buildReportLineText('กันยายน 2569', summary, null), new RegExp(expected));

  const flex = buildReportFlexMessage('กันยายน 2569', summary, null) as any;
  const netFlowRow = flex.contents.body.contents.find((item: any) => item.contents?.[0]?.text === 'กระแสเงินสดสุทธิ');
  assert.equal(netFlowRow.contents[1].text, expected);
  assert.equal(netFlowRow.contents[1].color, '#A63F1B');

  const workbook = XLSX.read(Buffer.from(buildMonthlyExcelBase64('กันยายน 2569', summary, [], []), 'base64'), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets['สรุปเดือน'], { header: 1 });
  assert.deepEqual(rows.find(row => row[0] === 'กระแสเงินสดสุทธิคงเหลือ'), ['กระแสเงินสดสุทธิคงเหลือ', -5_000]);
});

test('LINE assistant context and monthly summary card preserve the same shortfall', () => {
  const withMonth = { ...summary, monthKey: '2026-09' };
  const formatted = formatAssistantMonthlySummary(withMonth);
  assert.equal(formatted.กระแสเงินสดสุทธิหลังเผื่องบประจำ, '฿ -5,000');

  const card = buildMonthlySummaryMessage(withMonth) as any;
  const netFlowRow = card.contents.body.contents.find((item: any) => item.contents?.[0]?.text === 'เหลือหลังกันงบ');
  assert.equal(netFlowRow.contents[1].text, '฿ -5,000');
  assert.equal(netFlowRow.contents[1].color, '#A63F1B');
});
