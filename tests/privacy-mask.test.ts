import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASK, maskPersonalLines, maskPersonalText, maskSamples, maskTable } from '../shared/privacyMask.js';

// Owner, 2026-11-04 (a customer's report): "ส่วนของอัปโหลดไฟล์ที่บอกว่าปิด email กับเบอร์โทร ไม่ได้ปิดจริง ... มึงควรปิดให้หมด
// อย่าให้มี". Nothing personal may leave for an outside AI service; the bookkeeping in the file must still read.

test('emails, links and handles are masked', () => {
  assert.equal(maskPersonalText('ติดต่อ somchai.j+work@gmail.com'), `ติดต่อ ${MASK.email}`);
  assert.equal(maskPersonalText('ส่งที่ SOMCHAI@Example.CO.TH ด่วน'), `ส่งที่ ${MASK.email} ด่วน`);
  assert.equal(maskPersonalText('ดูที่ https://drive.google.com/x?id=1 และ www.example.com/a'), `ดูที่ ${MASK.link} และ ${MASK.link}`);
  assert.equal(maskPersonalText('ไลน์ @somchai.design'), `ไลน์ ${MASK.handle}`);
});

test('phone, ID, tax and bank numbers are masked whatever separates the digits', () => {
  for (const phone of ['0812345678', '081-234-5678', '081 234 5678', '(081) 234 5678', '081.234.5678', '+66 81 234 5678', '+66812345678', '02-123-4567', '02 123 4567']) {
    assert.equal(maskPersonalText(`โทร ${phone}`), `โทร ${MASK.number}`, phone);
  }
  assert.equal(maskPersonalText('เลขบัตร 1-2345-67890-12-3'), `เลขบัตร ${MASK.number}`);
  assert.equal(maskPersonalText('เลขผู้เสียภาษี 0105556123456'), `เลขผู้เสียภาษี ${MASK.number}`);
  assert.equal(maskPersonalText('บัญชี 123-4-56789-0 กสิกร'), `บัญชี ${MASK.number} กสิกร`);
  assert.equal(maskPersonalText('บัตร 4111 1111 1111 1111'), `บัตร ${MASK.number}`);
});

test('amounts, dates and short numbers stay', () => {
  for (const kept of ['12,000', '1,250,000.50', '12000', '12500000.50', '15/10/2567', '2024-10-15', '10/2567', 'งวด 3 ของ 12', 'โทร 1234-5678', 'ราคา 25,000 บาท หัก 3%', 'INV-2567-0012']) {
    assert.equal(maskPersonalText(kept), kept, kept);
  }
});

test('names with a title are masked; words that only start the same way stay', () => {
  assert.equal(maskPersonalText('นายสมชาย ใจดี'), MASK.person);
  assert.equal(maskPersonalText('ลูกค้า: นางสาว มณี รักดี'), `ลูกค้า: ${MASK.person}`);
  assert.equal(maskPersonalText('คุณสมหญิง'), MASK.person);
  assert.equal(maskPersonalText('ผู้ติดต่อ Mr. John Smith'), `ผู้ติดต่อ ${MASK.person}`);
  assert.equal(maskPersonalText('Ms Jane Doe'), MASK.person);
  for (const kept of ['ค่านายหน้า', 'งานถ่ายนางแบบ', 'ตรวจคุณภาพงาน', 'นายจ้างจ่ายแล้ว', 'Mission Impossible', 'งานถ่ายนายแบบ? ไม่ใช่']) {
    assert.ok(!maskPersonalText(kept).includes(MASK.person), kept);
  }
});

test('an address is masked whole; a job line with one place word stays', () => {
  assert.equal(maskPersonalText('123/45 หมู่ที่ 5 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540'), MASK.address);
  assert.equal(maskPersonalText('99/9 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110'), MASK.address);
  assert.equal(maskPersonalText('เลขที่ 8 ซอยลาดพร้าว 101'), MASK.address);
  for (const kept of ['ถ่ายวิดีโอ งานวัด ถนนคนเดิน', 'ค่าเช่า 10/2567', 'ส่งงาน 15 ต.ค. 2567', 'จ.ส.อ. จ่ายแล้ว']) {
    assert.equal(maskPersonalText(kept), kept, kept);
  }
});

test('a table: contact columns masked whole, people in the client column masked, companies and money kept', () => {
  const rows = [
    ['บัญชีงานปี 2567'],
    ['วันที่', 'ชื่องาน', 'ลูกค้า', 'อีเมลลูกค้า', 'เบอร์โทร', 'ที่อยู่จัดส่ง', 'ราคา'],
    ['15/10/2567', 'รีวิวสินค้า', 'บริษัท ตัวอย่าง จำกัด', 'brand@example.com', '0812345678', 'กรุงเทพ', '12,000'],
    ['20/10/2567', 'ถ่ายภาพแคมเปญ', 'สมชาย ใจดี', 'somchai@gmail.com', '089 999 8888', 'เชียงใหม่', '8,000'],
    ['21/10/2567', 'ตัดต่อวิดีโอ', 'Bluebird Digital', '', '', '', '5,000'],
    ['22/10/2567', 'ออกแบบโลโก้', 'John Smith', 'note: call 0812223333', '', '', '3,500'],
  ];
  const masked = maskTable(rows);
  assert.deepEqual(masked[1], rows[1], 'the header row stays');
  assert.deepEqual(masked[2], ['15/10/2567', 'รีวิวสินค้า', 'บริษัท ตัวอย่าง จำกัด', MASK.column, MASK.column, MASK.column, '12,000']);
  assert.deepEqual(masked[3], ['20/10/2567', 'ถ่ายภาพแคมเปญ', MASK.person, MASK.column, MASK.column, MASK.column, '8,000']);
  assert.deepEqual(masked[4], ['21/10/2567', 'ตัดต่อวิดีโอ', 'Bluebird Digital', '', '', '', '5,000']);
  assert.equal(masked[5][2], MASK.person);
  assert.equal(masked[5][3], MASK.column);
  const flat = JSON.stringify(masked);
  for (const secret of ['example.com', 'gmail', '0812345678', '089 999 8888', 'สมชาย', 'John', '0812223333']) assert.ok(!flat.includes(secret), secret);
});

test('column samples for the import: none for a contact column, masked for the rest', () => {
  assert.deepEqual(maskSamples('Email', ['a@b.co', 'c@d.co']), []);
  assert.deepEqual(maskSamples('มือถือ', ['0812345678']), []);
  assert.deepEqual(maskSamples('ชื่อลูกค้า', ['สมชาย ใจดี', 'บริษัท ตัวอย่าง จำกัด']), [MASK.person, 'บริษัท ตัวอย่าง จำกัด']);
  assert.deepEqual(maskSamples('หมายเหตุ', ['โทรหา 081-234-5678 ก่อนส่ง', 'TikTok']), [`โทรหา ${MASK.number} ก่อนส่ง`, 'TikTok']);
});

test('a document is masked line by line', () => {
  const text = 'ใบเสนอราคา\nเรียน คุณสมศรี มีสุข\nโทร 0899998888 อีเมล somsri@mail.com\nค่าออกแบบ 15,000 บาท';
  assert.equal(maskPersonalLines(text), `ใบเสนอราคา\nเรียน ${MASK.person}\nโทร ${MASK.number} อีเมล ${MASK.email}\nค่าออกแบบ 15,000 บาท`);
});

test('a CSV line keeps its other cells when one cell is an address; place words in different cells are not an address', () => {
  assert.equal(maskPersonalText('15/10/2567,ส่งของ,99/9 ถนนสุขุมวิท แขวงคลองเตย,"12,000"'), `15/10/2567,ส่งของ,${MASK.address},"12,000"`);
  assert.equal(maskPersonalText('ถ่ายงานถนนคนเดิน,ร้านซอยหนึ่ง,5000'), 'ถ่ายงานถนนคนเดิน,ร้านซอยหนึ่ง,5000');
  assert.equal(maskPersonalText('งาน | ลูกค้า | 99/9 หมู่ที่ 4 ต.บางพลี | 3,000'), `งาน | ลูกค้า | ${MASK.address} | 3,000`);
});
