import assert from 'node:assert/strict';
import test from 'node:test';
import { allExpenseCategories, APP_EXPENSE_CATEGORIES, ownCategories, withCategory } from '../shared/expenseCategory';
import { EXPENSE_CATEGORIES, answerExpenseQuestion, expenseQuestionMessage } from '../backend/src/services/lineJobQuestions';
import { categoryOptions } from '../backend/src/ai/tools';
import { answerQuestions, parseEntries, questionsFor } from '../backend/src/ai/batchEntries';
import { entryTurn } from '../backend/src/ai/batchTurn';
import { validateChanges } from '../shared/validation';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Expense categories of the account's own (owner, 2026-11-16: "รายจ่ายให้ทุกคนสามารถเพิ่มประเภทได้"): kept in Settings and
// offered after the app's in the expense form, its filter, LINE's questions, เลขา's cards and the pasted-records questions.

const settings = { expenseCategories: ['ฟิตเนส', ' ค่าดูแลสัตว์เลี้ยง ', 'ฟิตเนส', 'อื่นๆ', '', 'ค่าเดินทาง/น้ำมัน'] };

test('the list: cleaned, no repeats, never the app\'s own; added once; "อื่นๆ" stays last', () => {
  assert.deepEqual(ownCategories(settings), ['ฟิตเนส', 'ค่าดูแลสัตว์เลี้ยง']);
  assert.deepEqual(allExpenseCategories(settings), [...APP_EXPENSE_CATEGORIES.slice(0, -1), 'ฟิตเนส', 'ค่าดูแลสัตว์เลี้ยง', 'อื่นๆ']);
  assert.deepEqual(withCategory(settings, 'ค่าเรียนออนไลน์'), ['ฟิตเนส', 'ค่าดูแลสัตว์เลี้ยง', 'ค่าเรียนออนไลน์']);
  assert.deepEqual(withCategory(settings, 'ฟิตเนส'), ['ฟิตเนส', 'ค่าดูแลสัตว์เลี้ยง'], 'already there');
  assert.deepEqual(withCategory(settings, 'อาหาร/รับรองลูกค้า'), ['ฟิตเนส', 'ค่าดูแลสัตว์เลี้ยง'], 'the app has it');
  assert.deepEqual(withCategory(null, '  '), []);
  assert.deepEqual(ownCategories({ expenseCategories: 'x' }), []);
  // The saved settings accept the list (and refuse a name too long for it).
  const base = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40 };
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: { ...base, expenseCategories: ['ฟิตเนส'] } }]));
  assert.throws(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: 1, data: { ...base, expenseCategories: ['x'.repeat(61)] } }]));
});

test('LINE asks with the account\'s own categories as taps too, and takes one as the answer', () => {
  const message = expenseQuestionMessage('category', { name: 'ค่าฟิตเนส', amount: 1200 }, { today: '2026-11-16', ownCategories: ownCategories(settings) }) as { quickReply: { items: { action: { label: string; text: string } }[] } };
  const labels = message.quickReply.items.map(item => item.action.text);
  assert.ok(labels.includes('หมวด ฟิตเนส'));
  assert.ok(labels.includes('หมวด ค่าดูแลสัตว์เลี้ยง'));
  assert.equal(labels.at(-1), 'หมวด อื่นๆ', '"อื่นๆ" last');
  assert.ok(message.quickReply.items.length <= 13);
  assert.deepEqual(answerExpenseQuestion('category', 'หมวด ฟิตเนส', { name: 'ค่าฟิตเนส', amount: 1200 }, ownCategories(settings)), { category: 'ฟิตเนส' });
  assert.equal(answerExpenseQuestion('category', 'หมวด ฟิตเนส', { name: 'ค่าฟิตเนส', amount: 1200 }), null, 'unknown without the list');
  // Many own categories: still at most 13 taps, "อื่นๆ" kept.
  const many = Array.from({ length: 20 }, (_, at) => `หมวด${at}`);
  const crowded = expenseQuestionMessage('category', { name: 'x', amount: 1 }, { today: '2026-11-16', ownCategories: many }) as { quickReply: { items: { action: { text: string } }[] } };
  assert.equal(crowded.quickReply.items.length, 13);
  assert.equal(crowded.quickReply.items.at(-1)!.action.text, 'หมวด อื่นๆ');
  assert.equal(EXPENSE_CATEGORIES.length, 8);
});

test('เลขา\'s expense card offers them, and a paste puts a matching expense in one without asking', async () => {
  const user = { user_id: 'u', settings, expenses: [], jobs: [], notif_settings: {} } as unknown as UserRow;
  assert.ok(categoryOptions('', user).includes('ฟิตเนส'));
  const batch = parseEntries('วันนี้จ่ายค่าฟิตเนส 1200\nวันนี้ซื้อของขวัญ 500', '2026-11-16', new Date('2026-11-16T05:00:00Z'))!;
  const [question] = questionsFor(batch, [], 5, allExpenseCategories(settings));
  assert.ok(question.options.includes('ค่าดูแลสัตว์เลี้ยง'));
  assert.equal(answerQuestions(batch, [question], 'ค่าดูแลสัตว์เลี้ยง', [], allExpenseCategories(settings))!.entries[0].category, 'ค่าดูแลสัตว์เลี้ยง');
  const turn = await entryTurn({ text: 'วันนี้จ่ายค่าฟิตเนส 1200\nวันนี้ซื้อของขวัญ 500', user, now: new Date('2026-11-16T05:00:00Z'), channel: 'app',
    execute: async () => ({ result: { ok: true } }) });
  assert.ok(turn && !('cleared' in turn));
  assert.equal(turn.batch.entries[0].category, 'ฟิตเนส', '"ค่าฟิตเนส" goes to the account\'s "ฟิตเนส"');
  assert.deepEqual(turn.questions.map(item => item.lines), [[2]], 'only the gift is asked about');
});
