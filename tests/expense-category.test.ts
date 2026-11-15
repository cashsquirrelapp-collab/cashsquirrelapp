import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPENSE_CATEGORY, guessExpenseCategory } from '../shared/expenseCategory';
import { parseLineQuickDraft } from '../backend/src/services/lineQuickDraft';

// Owner, 2026-11-15: "จ่ายกะเพรา 50 บาท มันก็มีคำถามมาว่ากะเพราอยู่หมวดไหนครับ ... มันเป็นความรู้พื้นฐานไหมที่มึงต้องรู้ว่าอะไร
// คืออาหาร อะไรคืออุปกรณ์". Everyday names say their category; a name no rule knows is still asked about in LINE.

test('everyday names say their category, by the words in them', () => {
  const cases: [string, string | null][] = [
    ['กะเพรา', EXPENSE_CATEGORY.food], ['กระเพราหมูสับ', EXPENSE_CATEGORY.food], ['ค่าข้าวมันไก่', EXPENSE_CATEGORY.food], ['ชาไข่มุก', EXPENSE_CATEGORY.food],
    ['ก๋วยเตี๋ยวเรือ', EXPENSE_CATEGORY.food], ['ปลาหมึกย่าง', EXPENSE_CATEGORY.food], ['Starbucks', EXPENSE_CATEGORY.food], ['GrabFood', EXPENSE_CATEGORY.food], ['เลี้ยงลูกค้า', EXPENSE_CATEGORY.food],
    ['ค่าแท็กซี่', EXPENSE_CATEGORY.travel], ['Grab ไปกองถ่าย', EXPENSE_CATEGORY.travel], ['ค่าน้ำมัน', EXPENSE_CATEGORY.travel], ['ค่าทางด่วน', EXPENSE_CATEGORY.travel], ['BTS', EXPENSE_CATEGORY.travel],
    ['ค่าไฟ', EXPENSE_CATEGORY.service], ['ค่าน้ำ', EXPENSE_CATEGORY.service], ['ค่าเน็ต', EXPENSE_CATEGORY.service], ['ค่าส่งของ', EXPENSE_CATEGORY.service],
    ['ค่าเช่ากล้อง', EXPENSE_CATEGORY.equipment], ['สายชาร์จ', EXPENSE_CATEGORY.equipment], ['Adobe', EXPENSE_CATEGORY.equipment], ['หมึกพิมพ์', EXPENSE_CATEGORY.equipment], ['เมาส์', EXPENSE_CATEGORY.equipment],
    ['ยิงแอดเฟซบุ๊ก', EXPENSE_CATEGORY.ads], ['boost โพสต์', EXPENSE_CATEGORY.ads],
    ['ค่าจ้างตัดต่อ', EXPENSE_CATEGORY.outsource], ['ค่าตัวนางแบบ', EXPENSE_CATEGORY.outsource],
    ['ภาษีป้าย', EXPENSE_CATEGORY.tax], ['ค่าธรรมเนียมธนาคาร', EXPENSE_CATEGORY.tax],
    ['ค่าเขียนเนื้อหา', null], ['ค่าคอม', null], ['ตั๋วหนัง', null], ['ของขวัญ', null], ['', null],
  ];
  for (const [name, category] of cases) assert.equal(guessExpenseCategory(name), category, name);
});

test('LINE: "จ่ายกะเพรา 50 บาท" is food at once, no question about its category', () => {
  assert.equal(parseLineQuickDraft('จ่ายกะเพรา 50 บาท')?.expenseCategory, EXPENSE_CATEGORY.food);
  assert.equal(parseLineQuickDraft('จ่ายค่าข้าวมันไก่ 60')?.expenseCategory, EXPENSE_CATEGORY.food);
  assert.equal(parseLineQuickDraft('ค่าแท็กซี่ 120')?.expenseCategory, EXPENSE_CATEGORY.travel);
  // A name no rule knows: no category, so LINE asks as before.
  const unknown = parseLineQuickDraft('จ่ายของขวัญ 300 บาท');
  assert.equal(unknown?.expenseName, 'ของขวัญ');
  assert.equal(unknown?.expenseCategory, undefined);
  // A name answered later (the "จ่ายค่าอะไรครับ" question) is read the same way before the category is asked.
  assert.match(readFileSync(new URL('../backend/src/services/lineAssistant.ts', import.meta.url), 'utf8'),
    /if \(!draft\.category && draft\.name\) \{ const guessed = guessExpenseCategory\(draft\.name\); if \(guessed\) draft\.category = guessed; \}/);
});
