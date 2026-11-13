import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { DocumentFileError, documentFileKind, documentText } from '../shared/documentFileText';

// A Word or PowerPoint file sent in the LINE chat (owner, 2026-11-13: "ส่งไฟล์ Word / PowerPoint ใน LINE"): read on the
// server into the same text the app's chat makes on the device (shared/officeText.ts, personal data masked), then เลขา
// prepares its cards; an older .doc / .ppt is asked to be saved again; the vault keeps pictures and PDFs only.

Object.assign(process.env, { SUPABASE_URL: 'https://linedoc.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin', APP_URL: 'https://staging.krarok.com', LIFF_ID: 'LIFF-1' });
const { handleLineFileMessage, LINE_DOC_REQUEST } = await import('../backend/src/services/lineVaultChat');

const USER = '00000000-0000-4000-8000-000000000043';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${para(text)}</w:tc>`;
const docx = (body: string) => Buffer.from(zipSync({
  '[Content_Types].xml': strToU8('<Types/>'),
  'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
}));
const quotation = docx(para('ใบเสนอราคา') + para('ลูกค้า บริษัท แบรนด์เอ จำกัด โทร 081-234-5678')
  + `<w:tbl><w:tr>${cell('รายการ')}${cell('ราคา')}</w:tr><w:tr>${cell('ตัดต่อวิดีโอ &amp; ใส่ซับ')}${cell('5,000')}</w:tr></w:tbl>`);
const slide = (text: string) => strToU8(`<p:sld xmlns:p="p" xmlns:a="a"><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sld>`);
// Slides stored out of order: read as slide 1, 2, …, 10 by their number, not by name.
const pptx = Buffer.from(zipSync({ 'ppt/slides/slide10.xml': slide('สรุป'), 'ppt/slides/slide2.xml': slide('ราคา 12,000 บาท'), 'ppt/slides/slide1.xml': slide('ข้อเสนองานถ่ายภาพ'), 'ppt/presentation.xml': strToU8('<p/>') }));

test('the reader: Word paragraphs and table rows, PowerPoint slides in order, phone numbers masked', () => {
  const word = documentText('ใบเสนอราคา.docx', new Uint8Array(quotation));
  assert.match(word.text, /^ไฟล์ "ใบเสนอราคา.docx" \(Word ที่ส่งมาในแชท LINE อ่านออกมาเป็นข้อความ\)\nใบเสนอราคา\n/);
  assert.match(word.text, /รายการ \| ราคา\nตัดต่อวิดีโอ & ใส่ซับ \| 5,000/);
  assert.ok(!word.text.includes('081-234-5678'), 'a phone number never goes on');
  const slides = documentText('ข้อเสนอ.pptx', new Uint8Array(pptx));
  assert.equal(slides.slides, 3);
  assert.match(slides.text, /PowerPoint ที่ส่งมาในแชท LINE[\s\S]*สไลด์ 1\nข้อเสนองานถ่ายภาพ\n\nสไลด์ 2\nราคา 12,000 บาท\n\nสไลด์ 3\nสรุป$/);
  assert.deepEqual(['a.docx', 'b.PPTX', 'c.odt', 'd.odp', 'e.doc', 'f.ppt', 'g.pdf', 'h.xlsx'].map(documentFileKind), ['word', 'slides', 'odt', 'odp', 'old', 'old', null, null]);
  assert.throws(() => documentText('x.docx', new TextEncoder().encode('not a zip')), (error: unknown) => error instanceof DocumentFileError && error.code === 'type');
  assert.throws(() => documentText('x.docx', new Uint8Array(docx(para('   ')))), (error: unknown) => error instanceof DocumentFileError && error.code === 'empty');
  assert.throws(() => documentText('x.pptx', new Uint8Array(quotation)), (error: unknown) => error instanceof DocumentFileError && error.code === 'type', 'a Word file named .pptx');
});

function deps(file: Buffer) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      owner: async () => ({ user: { user_id: USER, notif_settings: {} }, auth: { id: USER } }),
      read: async () => file,
      store: async () => { calls.push('store'); return { id: 'x', fileName: 'x' }; },
      answer: async (_user: unknown, text: string, _history: unknown, files: { mimeType: string; name: string; data: string }[]) => {
        calls.push(`answer:${text}:${files.map(f => `${f.name}|${f.mimeType}`).join(',')}`);
        calls.push(Buffer.from(files[0].data, 'base64').toString('utf8'));
        return { messages: [{ type: 'text', text: 'เตรียมรายรับ 5,000 บาทให้แล้วครับ' }, { type: 'flex', altText: 'ยืนยัน', contents: {} }], text: 'เตรียมให้แล้ว', proposalIds: ['p_1'] };
      },
      saveHistory: async (_user: unknown, said: string) => { calls.push(`history:${said}`); },
      rateLimit: async (scope: string) => { calls.push(`limit:${scope}`); },
    } as any,
  };
}

test('LINE: a Word file is read for เลขา as masked text and answered with its cards; nothing goes to the vault', async () => {
  const d = deps(quotation);
  const reply = await handleLineFileMessage('Uline', { id: '43', type: 'file', fileName: 'ใบเสนอราคา.docx' }, 'token', d.deps) as any[];
  assert.deepEqual(reply.map(message => message.type), ['text', 'flex']);
  assert.ok(d.calls.includes(`answer:${LINE_DOC_REQUEST}:ใบเสนอราคา.docx|text/plain`));
  const sent = d.calls.find(call => call.startsWith('ไฟล์ "ใบเสนอราคา.docx"'))!;
  assert.match(sent, /ตัดต่อวิดีโอ & ใส่ซับ \| 5,000/);
  assert.ok(!sent.includes('081-234-5678'));
  assert.ok(d.calls.includes('limit:assistant-file'));
  assert.ok(d.calls.includes('history:[ส่งไฟล์] ใบเสนอราคา.docx'));
  assert.ok(!d.calls.includes('store'), 'the vault keeps pictures and PDFs only');
  const slides = deps(pptx);
  await handleLineFileMessage('Uline', { id: '44', type: 'file', fileName: 'ข้อเสนอ.pptx' }, 'token', slides.deps);
  assert.ok(slides.calls.some(call => /สไลด์ 2\nราคา 12,000 บาท/.test(call)));
});

test('LINE: an older .doc / .ppt is asked to be saved again; a broken or empty file says so; เลขา is not asked', async () => {
  const old = deps(Buffer.from('old'));
  const [said] = await handleLineFileMessage('Uline', { id: '43', type: 'file', fileName: 'สัญญา.doc' }, 'token', old.deps) as any[];
  assert.match(said.text, /\.docx และ PowerPoint แบบ \.pptx/);
  const broken = deps(Buffer.from('not a zip at all'));
  const [error] = await handleLineFileMessage('Uline', { id: '43', type: 'file', fileName: 'เสีย.docx' }, 'token', broken.deps) as any[];
  assert.match(error.text, /เปิดไฟล์นี้ไม่ได้/);
  const blank = deps(docx(para(' ')));
  const [empty] = await handleLineFileMessage('Uline', { id: '43', type: 'file', fileName: 'ว่าง.docx' }, 'token', blank.deps) as any[];
  assert.match(empty.text, /ไม่พบข้อความในไฟล์นี้/);
  assert.ok(![...old.calls, ...broken.calls, ...blank.calls].some(call => call.startsWith('answer:') || call === 'store'));
});
