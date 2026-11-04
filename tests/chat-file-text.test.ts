import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readFileText, textFileType, rtfText, htmlText, TEXT_MAX_CHARS } from '../frontend/src/features/assistant/fileText';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { checkAttachments, checkHistoryFiles, storedAttachment } from '../backend/src/ai/attachment';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Spreadsheets, Word, PowerPoint and text in the เลขากระรอก chat (owner, 2026-11-04: "user ที่ชอบจดใน Word ใน Excel ... โยนลงใน
// แชทเลย ... รองรับไฟล์แทบจะทุกไฟล์"). The device reads the file into text (fileText.ts); the server takes only that text and
// the models get it as text. Every file here is made in the test: no real account, no network, no cost.

const load = async () => XLSX;
const buffer = (data: Uint8Array | Buffer) => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
function workbook(sheets: Record<string, unknown[][]>, bookType: XLSX.BookType = 'xlsx'): ArrayBuffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return buffer(XLSX.write(book, { type: 'buffer', bookType }) as Buffer);
}
function zip(files: Record<string, string>): ArrayBuffer {
  const container = XLSX.CFB.utils.cfb_new();
  for (const [path, text] of Object.entries(files)) XLSX.CFB.utils.cfb_add(container, `/${path}`, Buffer.from(text, 'utf8'));
  return buffer(XLSX.CFB.write(container, { type: 'buffer', fileType: 'zip' }) as Buffer);
}

test('which files the chat reads as text, which it asks to save again, which it leaves to pictures and PDF', () => {
  for (const name of ['บัญชี.xlsx', 'a.xls', 'a.xlsm', 'a.ods', 'a.numbers', 'a.csv', 'a.tsv']) assert.equal((textFileType(name) as { kind: string }).kind, 'sheet', name);
  for (const name of ['สัญญา.docx', 'a.odt', 'a.rtf']) assert.equal((textFileType(name) as { kind: string }).kind, 'doc', name);
  for (const name of ['a.pptx', 'a.odp']) assert.equal((textFileType(name) as { kind: string }).kind, 'slides', name);
  for (const name of ['a.txt', 'a.md', 'a.json', 'a.html', 'a.xml']) assert.equal((textFileType(name) as { kind: string }).kind, 'text', name);
  for (const name of ['a.doc', 'a.ppt', 'a.pages', 'a.key']) assert.equal(textFileType(name), 'old', name);
  for (const name of ['slip.jpg', 'ใบเสร็จ.pdf', 'setup.exe', 'a.heic']) assert.equal(textFileType(name), null, name);
  // A pasted file with no extension goes by its type.
  assert.equal((textFileType('file', 'text/csv') as { label: string }).label, 'CSV');
});

test('Excel: every tab as rows, dates as shown, and the totals of the money columns worked out (rows saying รวม left out)', async () => {
  const data = workbook({
    'รายรับ': [['ลำดับ', 'วันที่', 'ลูกค้า', 'ยอดเงิน', 'หัก ณ ที่จ่าย', 'เลขผู้เสียภาษี'],
      [1, '2026-10-01', 'ร้านกาแฟ', 10000, 300, 1234567890123], [2, '2026-10-15', 'บริษัท ก', 25000.5, 750, 1234567890124], ['รวม', '', '', 35000.5, 1050, '']],
    'รายจ่าย': [['รายการ', 'จำนวนเงิน'], ['ค่าเช่า', 5000], ['ค่าไฟ', '1,250']],
  });
  const read = await readFileText(load, 'ไฟล์ตัวอย่างนำเข้า_กระรอก.xlsx', data);
  assert.equal(read.kind, 'sheet');
  assert.equal(read.sheets, 2);
  assert.match(read.text, /^ไฟล์ "ไฟล์ตัวอย่างนำเข้า_กระรอก\.xlsx" \(Excel อ่านออกมาเป็นข้อความบนเครื่องของผู้ใช้\)/);
  assert.match(read.text, /แท็บ "รายรับ" · 4 แถว\nลำดับ,วันที่,ลูกค้า,ยอดเงิน/);
  assert.match(read.text, /ยอดเงิน = 35,000\.5 \(2 แถว\) · หัก ณ ที่จ่าย = 1,050 \(2 แถว\)/);
  // A rate or a credit term is not added up.
  const rates = await readFileText(load, 'a.xlsx', workbook({ 'งาน': [['ชื่องาน', 'มูลค่างาน (บาท)', 'หัก ณ ที่จ่าย (%)', 'เครดิต (วัน)'], ['ก', 5000, 3, 15], ['ข', 8000, 3, 30]] }));
  assert.match(rates.text, /มูลค่างาน \(บาท\) = 13,000 \(2 แถว\)$/m);
  assert.doesNotMatch(rates.text, /\(%\) =|\(วัน\) =/);
  // Order numbers and tax IDs are not money.
  assert.doesNotMatch(read.text, /ลำดับ =|เลขผู้เสียภาษี =/);
  // A number typed as text with a comma still counts.
  assert.match(read.text, /แท็บ "รายจ่าย"[\s\S]*จำนวนเงิน = 6,250 \(2 แถว\)/);
  assert.doesNotMatch(read.text, /ย้ายข้อมูลเข้าแอป/);
});

test('a long sheet is cut with a note saying so, and never points to another page', async () => {
  const rows: unknown[][] = [['รายการ', 'ยอดเงิน', 'หมายเหตุ']];
  for (let i = 1; i <= 2500; i += 1) rows.push([`งานที่ ${i}`, i * 10, 'รายละเอียดงานยาวพอสมควรเพื่อให้ข้อความยาวเกินกำหนด']);
  const read = await readFileText(load, 'ทั้งปี.xlsx', workbook({ 'Sheet1': rows }));
  // The chat never sends the person to another page (owner, 2026-11-04): no note about the import page any more.
  assert.doesNotMatch(read.text, /หน้างาน|นำเข้าจาก Excel/);
  assert.equal(read.truncated, true);
  assert.ok(read.text.length < TEXT_MAX_CHARS + 600);
  assert.match(read.text, /…\(ตัดเหลือ 30,000 ตัวอักษรแรก จากทั้งหมด [\d,]+ ตัวอักษร\)$/);
});

test('CSV in the Thai Windows encoding older Excel saves, and OpenDocument spreadsheets', async () => {
  const thai = new TextEncoder().encode('รายการ,ยอดเงิน\nค่าออกแบบ,5000\nค่าตัดต่อ,3000\n');
  // windows-874 bytes for the same text: Thai letters move from U+0E01.. to 0xA1..
  const legacy = Buffer.from([...'รายการ,ยอดเงิน\nค่าออกแบบ,5000\nค่าตัดต่อ,3000\n'].map(ch => (ch.charCodeAt(0) >= 0x0e01 ? ch.charCodeAt(0) - 0x0e01 + 0xa1 : ch.charCodeAt(0))));
  for (const bytes of [thai, legacy]) {
    const read = await readFileText(load, 'บันทึก.csv', buffer(bytes));
    assert.match(read.text, /ค่าออกแบบ,5000/);
    assert.match(read.text, /ยอดเงิน = 8,000 \(2 แถว\)/);
  }
  const ods = await readFileText(load, 'a.ods', workbook({ 'แผ่น1': [['รายการ', 'ยอด'], ['ก', 100], ['ข', 200]] }, 'ods'));
  assert.match(ods.text, /ยอด = 300 \(2 แถว\)/);
});

test('Word: paragraphs and tables as lines, deleted tracked text and field codes left out', async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>ใบเสนอราคา</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">ลูกค้า: </w:t></w:r><w:r><w:t>ร้านกาแฟ &amp; ขนม</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>รายการ</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ราคา</w:t></w:r></w:p></w:tc></w:tr>'
    + '<w:tr><w:tc><w:p><w:r><w:t>ออกแบบโลโก้</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>5,000</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:r><w:delText>ลบแล้ว</w:delText></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:t>รวม</w:t><w:tab/><w:t>5,000</w:t></w:r></w:p></w:body></w:document>';
  const read = await readFileText(load, 'ใบเสนอราคา.docx', zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': xml }));
  assert.equal(read.kind, 'doc');
  assert.match(read.text, /\nใบเสนอราคา\nลูกค้า: ร้านกาแฟ & ขนม\nรายการ \| ราคา\nออกแบบโลโก้ \| 5,000\nรวม\t5,000$/);
  assert.doesNotMatch(read.text, /ลบแล้ว|PAGE/);
});

test('PowerPoint slides in order, OpenDocument text and slides', async () => {
  const slide = (text: string) => `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`;
  const pptx = await readFileText(load, 'สรุป.pptx', zip({ 'ppt/slides/slide10.xml': slide('สุดท้าย'), 'ppt/slides/slide2.xml': slide('สอง'), 'ppt/slides/slide1.xml': slide('หนึ่ง') }));
  assert.equal(pptx.slides, 3);
  assert.match(pptx.text, /สไลด์ 1\nหนึ่ง\n\nสไลด์ 2\nสอง\n\nสไลด์ 3\nสุดท้าย$/);
  const odt = await readFileText(load, 'a.odt', zip({ 'content.xml': '<office:text><text:h>หัวข้อ</text:h><text:p>ค่าจ้าง<text:tab/>2,000</text:p><table:table><table:table-row><table:table-cell><text:p>ก</text:p></table:table-cell><table:table-cell><text:p>1</text:p></table:table-cell></table:table-row></table:table></office:text>' }));
  assert.match(odt.text, /หัวข้อ\nค่าจ้าง\t2,000\nก \| 1$/);
  const odp = await readFileText(load, 'a.odp', zip({ 'content.xml': '<office:presentation><draw:page draw:name="1"><text:p>แรก</text:p></draw:page><draw:page><text:p>ที่สอง</text:p></draw:page></office:presentation>' }));
  assert.match(odp.text, /สไลด์ 1\nแรก\n\nสไลด์ 2\nที่สอง$/);
});

test('RTF, HTML and plain text: only the words', async () => {
  assert.equal(rtfText('{\\rtf1\\ansi{\\fonttbl{\\f0 Tahoma;}}{\\colortbl;\\red0;}\\f0 \\u3588?\\u3656?\\u3634?\\u3592?\\u3657?\\u3634?\\u3591? 5,000\\par \\\'a1\\\'d2\\\'c3\\tab ok}'), 'ค่าจ้าง 5,000\nการ\tok');
  assert.equal(htmlText('<html><head><title>x</title><style>p{}</style></head><body><p>สวัสดี&nbsp;ครับ</p><table><tr><td>ก</td><td>1</td></tr></table><script>alert(1)</script></body></html>'), 'สวัสดี ครับ\nก | 1');
  const md = await readFileText(load, 'จด.md', buffer(new TextEncoder().encode('# งานเดือนนี้\n- ออกแบบ 3,000\r\n- ตัดต่อ 2,000\n\n\n\n')));
  assert.match(md.text, /# งานเดือนนี้\n- ออกแบบ 3,000\n- ตัดต่อ 2,000$/);
});

test('what cannot be read says so: an old Word file, a program renamed .txt, an empty sheet, a broken zip', async () => {
  await assert.rejects(readFileText(load, 'a.doc', new ArrayBuffer(8)), /old/);
  await assert.rejects(readFileText(load, 'a.txt', buffer(Buffer.from([0x4d, 0x5a, 0, 0, 1, 2]))), /type/);
  await assert.rejects(readFileText(load, 'a.xlsx', workbook({ 'ว่าง': [] })), /empty|type/);
  await assert.rejects(readFileText(load, 'a.docx', buffer(Buffer.from('not a zip'))), /type/);
  await assert.rejects(readFileText(load, 'a.csv', new ArrayBuffer(16 * 1024 * 1024)), /big/);
});

// ── The server ───────────────────────────────────────────────────────────────────────────────────────────────
const text64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const textFile = (name: string, text: string) => ({ name, mimeType: 'text/plain', data: text64(text) });

test('the server takes text only as valid UTF-8 without NUL, 128 KB a file and 256 KB a request; history keeps the kind', () => {
  const [ok] = checkAttachments([textFile('บัญชี.xlsx', 'ไฟล์ "บัญชี.xlsx"\nรายการ,ยอด')]);
  assert.equal(ok.mimeType, 'text/plain');
  assert.deepEqual(storedAttachment([ok]), { name: 'บัญชี.xlsx', kind: 'text' });
  assert.throws(() => checkAttachments([{ name: 'a.txt', mimeType: 'text/plain', data: Buffer.from([0xff, 0xfe, 0x41]).toString('base64') }]), (error: { code?: string }) => error.code === 'ai_file_type');
  assert.throws(() => checkAttachments([textFile('a.txt', 'a\u0000b')]), (error: { code?: string }) => error.code === 'ai_file_type');
  assert.throws(() => checkAttachments([textFile('a.txt', 'ก'.repeat(50_000))]), (error: { code?: string }) => error.code === 'ai_file_too_long');
  assert.throws(() => checkAttachments([0, 1, 2].map(i => textFile(`a${i}.txt`, 'x'.repeat(100 * 1024)))), (error: { code?: string }) => error.code === 'ai_files_too_long');
  // A picture still has to be a picture.
  assert.throws(() => checkAttachments([{ name: 'a.jpg', mimeType: 'image/jpeg', data: text64('hello') }]), (error: { code?: string }) => error.code === 'ai_file_type');
  // An earlier message brings back text only, within the same 256 KB as this message's files.
  const history = checkHistoryFiles([{}, { attachments: [textFile('บัญชี.xlsx', 'รายการ,ยอด')] }], []);
  assert.deepEqual(history.map(files => files.length), [0, 1]);
  assert.throws(() => checkHistoryFiles([{ attachments: [{ name: 'a.jpg', mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 1]).toString('base64') }] }], []), (error: { code?: string }) => error.code === 'ai_file_invalid');
  assert.throws(() => checkHistoryFiles([{ attachments: [textFile('a.txt', 'x'.repeat(100 * 1024))] }], checkAttachments([textFile('b.txt', 'x'.repeat(100 * 1024)), textFile('c.txt', 'x'.repeat(60 * 1024))])), (error: { code?: string }) => error.code === 'ai_files_too_long');
});

const A = '77777777-7777-4777-8777-777777777777';
const user = (): UserRow => ({ user_id: A, statuses: [], goals: [], settings: {}, jobs: [], expenses: [] } as unknown as UserRow);
function fakeProviders(text: string) {
  const bodies: { claude: boolean; body: any }[] = [];
  const tools: string[][] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const claude = String(input).includes('anthropic');
    bodies.push({ claude, body });
    tools.push(claude ? (body.tools || []).map((tool: { name: string }) => tool.name) : (body.tools?.[0]?.functionDeclarations || []).map((tool: { name: string }) => tool.name));
    const reply = claude
      ? { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 60, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      : { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } };
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
  return { bodies, tools, fetchImpl };
}

test('the models get the file as text (Claude and Gemini), and a spreadsheet never becomes a vault attach card', async () => {
  const sheet = 'ไฟล์ "บัญชี.xlsx" (Excel อ่านออกมาเป็นข้อความบนเครื่องของผู้ใช้)\nแท็บ "Sheet1" · 3 แถว\nรายการ,ยอด\nก,100\nข,200';
  const files = checkAttachments([textFile('บัญชี.xlsx', sheet)]);
  const smart = fakeProviders('รวม 300 บาทครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'รวมเท่าไร', attachments: files },
    { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' }), ...memoryStores(), fetchImpl: smart.fetchImpl });
  const claude = smart.bodies.find(item => item.claude)!.body;
  const content = claude.messages.at(-1).content as any[];
  assert.deepEqual(content.map(block => block.type), ['text', 'text']);
  assert.equal(content[0].text, sheet);
  assert.equal(content[1].text, 'รวมเท่าไร');
  assert.ok(!smart.tools[0].includes('attach_file'));

  const light = fakeProviders('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'สรุปให้หน่อย', attachments: files },
    { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), ...memoryStores(), fetchImpl: light.fetchImpl });
  const parts = light.bodies[0].body.contents.at(-1).parts as any[];
  assert.deepEqual(parts.map(part => part.text), [sheet, 'สรุปให้หน่อย']);
  assert.ok(!parts.some(part => part.inlineData));

  // A later message: the earlier turn brings the text back, and attach_file is still not offered for it.
  const later = fakeProviders('ได้ครับ');
  await runAssistant({ user: user(), plan: 'pro', text: 'เฉพาะรายการ ก เท่าไร', history: [
    { role: 'user', text: 'รวมเท่าไร [แนบไฟล์: บัญชี.xlsx]', attachments: files }, { role: 'assistant', text: 'รวม 300 บาทครับ' }] },
    { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), ...memoryStores(), fetchImpl: later.fetchImpl });
  const turns = later.bodies[0].body.contents as any[];
  assert.equal(turns[0].parts[0].text, sheet);
  assert.ok(!later.tools[0].includes('attach_file'));
});
