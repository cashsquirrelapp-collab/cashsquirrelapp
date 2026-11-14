import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRow, evaluateRowFormula, shiftFormula } from '../shared/sheetFormula';

// สูตรของลูกค้า: what the customer's own formulas make of a new row, read by a fixed reader (never the AI). A formula it
// cannot read gives null and the card keeps "คำนวณเอง".

const row6 = (values: Record<string, number>) => (column: number) => values[String.fromCharCode(65 + column)] ?? null;

test('formula: copied from the row above, relative rows move, absolute ones stay', () => {
  assert.equal(shiftFormula('=D5-E5', 5, 6), '=D6-E6');
  assert.equal(shiftFormula('=D5*$H$1', 5, 6), '=D6*$H$1');
  assert.equal(shiftFormula('=ROUND(D5*3%,2)', 5, 6), '=ROUND(D6*3%,2)');
  assert.equal(shiftFormula('=SUM(A5:C5)', 5, 6), '=SUM(A6:C6)');
});

test('formula: the arithmetic a bookkeeping row has', () => {
  const v = row6({ D: 3000, E: 90 });
  assert.equal(evaluateRowFormula('=D6*3%', 6, v), 90);
  assert.equal(evaluateRowFormula('=D6*0.03', 6, v), 90);
  assert.equal(evaluateRowFormula('=D6-E6', 6, v), 2910);
  assert.equal(evaluateRowFormula('=ROUND(D6*1.5%,2)', 6, v), 45);
  assert.equal(evaluateRowFormula('=IF(D6>=1000,D6*3%,0)', 6, v), 90);
  assert.equal(evaluateRowFormula('=IF(D6>=1000;D6*3%;0)', 6, v), 90, 'a sheet in Thai writes ; between arguments');
  assert.equal(evaluateRowFormula('=SUM(D6:E6)', 6, v), 3090);
  assert.equal(evaluateRowFormula('=MAX(D6-E6,0)', 6, v), 2910);
  assert.equal(evaluateRowFormula('=(D6-E6)/2', 6, v), 1455);
});

test('formula: what it cannot read gives null', () => {
  const v = row6({ D: 3000 });
  assert.equal(evaluateRowFormula('=D5*3%', 6, v), null, 'another row');
  assert.equal(evaluateRowFormula("=VLOOKUP(C6,'ลูกค้า'!A:B,2,FALSE)", 6, v), null);
  assert.equal(evaluateRowFormula('=D6/0', 6, v), null);
  assert.equal(evaluateRowFormula('=E6*3%', 6, v), null, 'a cell with no number');
  assert.equal(evaluateRowFormula('=TODAY()', 6, v), null);
});

test('formula: a row worked out together, a formula using another formula, empty cells as 0', () => {
  const out = evaluateRow({ 4: '=D6*3%', 5: '=D6-E6' }, 6, { 3: 3000 });
  assert.deepEqual(out, { 4: 90, 5: 2910 });
  assert.deepEqual(evaluateRow({ 5: '=D6-E6' }, 6, { 3: 3000 }), { 5: 3000 }, 'E left empty counts as 0');
  assert.deepEqual(evaluateRow({ 5: '=D6-E6' }, 6, { 3: 3000, 4: null }), { 5: null }, 'E holds text');
});
