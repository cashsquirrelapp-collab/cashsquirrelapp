// Office and text files for เลขากระรอก (owner, 2026-11-04: "user ที่ชอบจดใน Word ใน Excel ... โยนลงในแชทเลย ... รองรับไฟล์แทบจะ
// ทุกไฟล์"). The models read pictures and PDFs only, so a spreadsheet, a Word or PowerPoint file, RTF, HTML or plain text is
// turned into text on the person's own device and sent as text: the file itself never leaves the browser. SheetJS (already
// used by the import) reads the spreadsheets and opens the zip of Word, OpenDocument and PowerPoint files; nothing is run
// from the file (no formulas, no macros). Kept free of the page so tests can call it with the SheetJS module.

import type * as XLSXModule from 'xlsx';

type XLSX = typeof XLSXModule;
export type TextKind = 'sheet' | 'doc' | 'slides' | 'text';

/** The file picked may be larger than what is sent: only its text goes. */
export const TEXT_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
/** Text sent for one file; longer text is cut with a note saying so (the server allows 128 KB). */
export const TEXT_MAX_CHARS = 30_000;
const SHEET_MAX_ROWS = 3000;
const TOTAL_COLUMNS_MAX = 12;
/** More rows than this: the note tells เลขา that the import page brings in every row at once. */
const IMPORT_HINT_ROWS = 40;

const EXTENSIONS: { kind: TextKind; label: string; test: RegExp }[] = [
  { kind: 'sheet', label: 'Excel', test: /\.(xlsx|xlsm|xlsb|xls|xltx|xltm)$/i },
  { kind: 'sheet', label: 'CSV', test: /\.(csv|tsv)$/i },
  { kind: 'sheet', label: 'OpenDocument', test: /\.(ods|fods)$/i },
  { kind: 'sheet', label: 'Numbers', test: /\.numbers$/i },
  { kind: 'doc', label: 'Word', test: /\.(docx|docm|dotx)$/i },
  { kind: 'doc', label: 'OpenDocument', test: /\.odt$/i },
  { kind: 'doc', label: 'RTF', test: /\.rtf$/i },
  { kind: 'slides', label: 'PowerPoint', test: /\.(pptx|pptm|ppsx)$/i },
  { kind: 'slides', label: 'OpenDocument', test: /\.odp$/i },
  { kind: 'text', label: 'HTML', test: /\.html?$/i },
  { kind: 'text', label: 'JSON', test: /\.json$/i },
  { kind: 'text', label: 'Markdown', test: /\.(md|markdown)$/i },
  { kind: 'text', label: 'TXT', test: /\.(txt|text|log|xml)$/i },
];
/** Older binary formats and Apple's own documents, which cannot be read here: the person is told to save them again. */
const OLD = /\.(doc|dot|ppt|pps|pot|pages|key|wps|wpd)$/i;
const MIME_KINDS: Record<string, string> = {
  'text/csv': '.csv', 'text/tab-separated-values': '.tsv', 'text/plain': '.txt', 'text/markdown': '.md', 'text/html': '.html',
  'application/json': '.json', 'application/rtf': '.rtf', 'text/rtf': '.rtf', 'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods', 'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.presentation': '.odp', 'application/msword': '.doc', 'application/vnd.ms-powerpoint': '.ppt',
};

/** What a file is to the chat, by its name (or its type when the name has no extension); null: not a text file. */
export function textFileType(name: string, mimeType = ''): { kind: TextKind; label: string } | 'old' | null {
  const named = /\.[a-z0-9]{1,8}$/i.test(name) ? name : `${name}${MIME_KINDS[mimeType.split(';')[0].trim().toLowerCase()] ?? ''}`;
  if (OLD.test(named)) return 'old';
  const found = EXTENSIONS.find(entry => entry.test.test(named));
  return found ? { kind: found.kind, label: found.label } : null;
}

export interface FileText { kind: TextKind; label: string; text: string; chars: number; truncated: boolean; sheets?: number; rows?: number; slides?: number }

/** Text of a text-like file: UTF-8 (or UTF-16 with its mark), else the Thai Windows encoding older programs save. */
export function decodeText(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); } catch { /* not UTF-8 */ }
  try { return new TextDecoder('windows-874').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}
/** Lines trimmed, no run of more than one empty line. */
function tidy(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[ \t]+$/g, '').replace(/(\s*\|\s*)+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}
const stripTags = (xml: string) => decodeEntities(xml.replace(/<[^>]+>/g, ''));

// ── Word, OpenDocument and PowerPoint: XML inside a zip ─────────────────────────────────────────────────────────
type Zip = { FullPaths: string[]; FileIndex: { content?: unknown }[] };
function openZip(xlsx: XLSX, data: ArrayBuffer): Zip {
  const bytes = new Uint8Array(data);
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error('type');
  try { return xlsx.CFB.read(bytes, { type: 'array' }) as unknown as Zip; } catch { throw new Error('type'); }
}
function zipText(zip: Zip, test: RegExp): { path: string; text: string }[] {
  return zip.FullPaths.map((path, index) => ({ path: path.replace(/^Root Entry\//, ''), content: zip.FileIndex[index]?.content }))
    .filter(entry => test.test(entry.path) && entry.content)
    .map(entry => ({ path: entry.path, text: new TextDecoder('utf-8').decode(entry.content as Uint8Array) }));
}

/** A table cell's paragraphs on one line, cells apart with " | ", one row per line. */
function cellsFlat(xml: string, cell: RegExp, paragraphEnd: RegExp): string {
  return xml.replace(cell, inner => `${stripTags(inner.replace(paragraphEnd, ' ')).replace(/\s+/g, ' ').trim()} | `);
}
export function wordXmlText(xml: string): string {
  const body = xml.replace(/<w:(instrText|delText)\b[^>]*>[\s\S]*?<\/w:\1>/g, '');
  const flat = cellsFlat(body, /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, /<\/w:p>/g)
    .replace(/<\/w:tr>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:(br|cr)\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n');
  return tidy(stripTags(flat));
}
export function openDocumentXmlText(xml: string): string {
  const body = xml.replace(/<office:annotation\b[\s\S]*?<\/office:annotation>/g, '');
  const flat = cellsFlat(body, /<table:table-cell(?:\s[^>]*)?>[\s\S]*?<\/table:table-cell>/g, /<\/text:(p|h)>/g)
    .replace(/<\/table:table-row>/g, '\n').replace(/<text:tab\s*\/>/g, '\t').replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<text:s(?:\s[^>]*)?\/>/g, ' ').replace(/<\/text:(p|h)>/g, '\n');
  return tidy(stripTags(flat));
}
export function slideXmlText(xml: string): string {
  return tidy(stripTags(xml.replace(/<a:br\b[^>]*\/>/g, '\n').replace(/<\/a:p>/g, '\n')));
}
export function htmlText(html: string): string {
  const body = html.replace(/<(script|style|head|noscript|template)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const flat = body.replace(/<\/(td|th)>/gi, ' | ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|ul|ol)>/gi, '\n');
  return tidy(stripTags(flat).replace(/[ \t]{2,}/g, ' '));
}

// ── RTF: only the words; fonts, colours, pictures and hidden groups are left out ─────────────────────────────────
const RTF_SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|header[lrf]?|footer[lrf]?|object|themedata|datastore|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|latentstyles|mmathPr|filetbl|revtbl|bkmkstart|bkmkend|fldinst)$/;
export function rtfText(source: string): string {
  let out = '';
  let skip = false;
  let skipFallback = 1;
  const stack: { skip: boolean; uc: number }[] = [];
  let bytes: number[] = [];
  const flush = () => { if (bytes.length) { out += decodeText(new Uint8Array(bytes)); bytes = []; } };
  for (let at = 0; at < source.length;) {
    const ch = source[at];
    if (ch === '{') { flush(); stack.push({ skip, uc: skipFallback }); at += 1; continue; }
    if (ch === '}') { flush(); const top = stack.pop(); if (top) { skip = top.skip; skipFallback = top.uc; } at += 1; continue; }
    if (ch === '\r' || ch === '\n') { at += 1; continue; }
    if (ch !== '\\') { flush(); if (!skip) out += ch; at += 1; continue; }
    const next = source[at + 1];
    if (next === "'") { if (!skip) bytes.push(parseInt(source.slice(at + 2, at + 4), 16) || 0x3f); at += 4; continue; }
    flush();
    if (next === '*') { skip = true; at += 2; continue; }
    if (next === '\\' || next === '{' || next === '}') { if (!skip) out += next; at += 2; continue; }
    if (next === '~') { if (!skip) out += ' '; at += 2; continue; }
    if (next === '\n' || next === '\r') { if (!skip) out += '\n'; at += 2; continue; }
    const word = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(source.slice(at + 1, at + 46));
    if (!word) { at += 2; continue; }
    at += 1 + word[0].length;
    const [, name, number] = word;
    if (RTF_SKIP.test(name)) { skip = true; continue; }
    if (name === 'uc') { skipFallback = Number(number ?? 1); continue; }
    if (skip) continue;
    if (name === 'par' || name === 'line' || name === 'row' || name === 'sect' || name === 'page') out += '\n';
    else if (name === 'tab') out += '\t';
    else if (name === 'cell') out += ' | ';
    else if (name === 'u' && number) {
      out += String.fromCharCode(Number(number) < 0 ? Number(number) + 65536 : Number(number));
      // The plain-text stand-in that follows \u is not read twice.
      for (let left = skipFallback; left > 0 && at < source.length; left -= 1) {
        if (source[at] === '\\' && source[at + 1] === "'") at += 4;
        else if (source[at] === '{' || source[at] === '}' || source[at] === '\\') break;
        else at += 1;
      }
    }
  }
  flush();
  return tidy(out);
}

// ── Spreadsheets: each tab as CSV, with the totals of its number columns worked out here ──────────────────────
// \b does not work after Thai letters, so the end of a word is "not followed by a Latin letter".
const TOTAL_ROW = /^(รวม|ยอดรวม|total|grand total|subtotal|sum)(?![a-z])/i;
// Not money: order numbers, IDs, phones, years, and percentages or days (a withholding rate, a credit term).
const NOT_AMOUNT = /(ลำดับ|^no\.?$|^#$|^เลข|รหัส|โทร|เบอร์|ผู้เสียภาษี|tax ?id|phone|^id$|^ปี(ที่)?$|^year$|account no|%|เปอร์เซ็นต์|ร้อยละ|อัตรา|percent|rate|\(วัน\)|จำนวนวัน|เครดิต|credit|days?\b)/i;
function cellNumber(xlsx: XLSX, cell: XLSXModule.CellObject | undefined): number | null {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.t === 'n' && typeof cell.v === 'number') {
    if (cell.z && xlsx.SSF.is_date(String(cell.z))) return null;
    // A long whole number is an ID (a tax ID, a phone, an account), not money.
    if (Number.isInteger(cell.v) && Math.abs(cell.v) >= 1e9) return null;
    return Number.isFinite(cell.v) ? cell.v : null;
  }
  if (cell.t === 's' && typeof cell.v === 'string') {
    const plain = cell.v.trim().replace(/^฿|บาท$/g, '').replace(/[,\s]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(plain) || /^-?\d{10,}$/.test(plain)) return null;
    return Number(plain);
  }
  return null;
}
const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** "ยอดเงิน = 125,400 (32 แถว)" for each column of numbers under a heading, leaving out rows that say รวม. */
export function columnTotals(xlsx: XLSX, sheet: XLSXModule.WorkSheet): string {
  const ref = sheet['!ref'];
  if (!ref) return '';
  const range = xlsx.utils.decode_range(ref);
  const text = (r: number, c: number) => String((sheet[xlsx.utils.encode_cell({ r, c })] as XLSXModule.CellObject | undefined)?.w ?? (sheet[xlsx.utils.encode_cell({ r, c })] as XLSXModule.CellObject | undefined)?.v ?? '').trim();
  let head = range.s.r;
  while (head <= range.e.r && ![...Array(range.e.c - range.s.c + 1)].some((_, i) => text(head, range.s.c + i))) head += 1;
  const totals: string[] = [];
  for (let c = range.s.c; c <= range.e.c && totals.length < TOTAL_COLUMNS_MAX; c += 1) {
    const heading = text(head, c) || xlsx.utils.encode_col(c);
    if (NOT_AMOUNT.test(heading)) continue;
    let sum = 0;
    let count = 0;
    for (let r = head + 1; r <= range.e.r; r += 1) {
      const rowText = [...Array(Math.min(4, range.e.c - range.s.c + 1))].map((_, i) => text(r, range.s.c + i));
      if (rowText.some(value => TOTAL_ROW.test(value))) continue;
      const value = cellNumber(xlsx, sheet[xlsx.utils.encode_cell({ r, c })] as XLSXModule.CellObject | undefined);
      if (value !== null) { sum += value; count += 1; }
    }
    if (count >= 2) totals.push(`${heading} = ${money(Math.round(sum * 100) / 100)} (${count} แถว)`);
  }
  return totals.join(' · ');
}

function sheetText(xlsx: XLSX, data: ArrayBuffer, name: string): { text: string; sheets: number; rows: number } {
  const csv = /\.(csv|tsv)$/i.test(name);
  const options = { sheetRows: SHEET_MAX_ROWS + 1, cellFormula: false, cellHTML: false, bookVBA: false, cellNF: true, cellText: true, cellDates: false } as const;
  let book: XLSXModule.WorkBook;
  try {
    book = csv
      ? xlsx.read(decodeText(data), { type: 'string', raw: true, ...options })
      : xlsx.read(new Uint8Array(data), { type: 'array', ...options });
  } catch { throw new Error('type'); }
  const parts: string[] = [];
  let rows = 0;
  let sheets = 0;
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;
    const body = xlsx.utils.sheet_to_csv(sheet, { blankrows: false, strip: true }).replace(/^(,*\n)+/, '').trim();
    if (!body.replace(/[,\s]/g, '')) continue;
    const count = body.split('\n').length;
    const full = sheet['!fullref'] ? xlsx.utils.decode_range(sheet['!fullref']).e.r + 1 : 0;
    const cut = full > SHEET_MAX_ROWS ? ` (แสดง ${SHEET_MAX_ROWS.toLocaleString('en-US')} แถวแรกจาก ${full.toLocaleString('en-US')} แถว)` : '';
    const totals = columnTotals(xlsx, sheet);
    sheets += 1;
    rows += count;
    parts.push(`แท็บ "${sheetName}" · ${count} แถว${cut}\n${body}${totals ? `\nผลรวมที่คำนวณจากไฟล์ (ทุกแถวที่เป็นตัวเลข ไม่นับแถวที่เขียนว่ารวม): ${totals}` : ''}`);
  }
  if (!parts.length) throw new Error('empty');
  return { text: parts.join('\n\n'), sheets, rows };
}

/** The file's text as เลขา gets it, framed with its name; throws 'type', 'old', 'empty' or 'big' for the chat to explain. */
export async function readFileText(loadXlsx: () => Promise<XLSX>, name: string, data: ArrayBuffer, mimeType = ''): Promise<FileText> {
  const type = textFileType(name, mimeType);
  if (type === 'old') throw new Error('old');
  if (!type) throw new Error('type');
  if (data.byteLength > TEXT_SOURCE_MAX_BYTES) throw new Error('big');
  let body = '';
  let extra: Pick<FileText, 'sheets' | 'rows' | 'slides'> = {};
  if (type.kind === 'sheet') {
    const read = sheetText(await loadXlsx(), data, name);
    body = read.text;
    extra = { sheets: read.sheets, rows: read.rows };
  } else if (type.label === 'Word') {
    const zip = openZip(await loadXlsx(), data);
    body = zipText(zip, /^word\/document\.xml$/).map(entry => wordXmlText(entry.text)).join('\n');
  } else if (type.kind === 'slides' && type.label === 'PowerPoint') {
    const zip = openZip(await loadXlsx(), data);
    const slides = zipText(zip, /^ppt\/slides\/slide\d+\.xml$/)
      .sort((a, b) => Number(a.path.match(/(\d+)\.xml$/)![1]) - Number(b.path.match(/(\d+)\.xml$/)![1]))
      .map(entry => slideXmlText(entry.text));
    body = slides.map((slide, index) => `สไลด์ ${index + 1}\n${slide}`).join('\n\n');
    extra = { slides: slides.length };
  } else if (type.label === 'OpenDocument') {
    const zip = openZip(await loadXlsx(), data);
    const xml = zipText(zip, /^content\.xml$/)[0]?.text ?? '';
    if (type.kind === 'slides') {
      const pages = xml.split(/<draw:page\b/).slice(1).map(page => openDocumentXmlText(`<draw:page${page}`));
      body = pages.map((page, index) => `สไลด์ ${index + 1}\n${page}`).join('\n\n');
      extra = { slides: pages.length };
    } else body = openDocumentXmlText(xml);
  } else {
    const bytes = new Uint8Array(data);
    const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
    if (!utf16 && bytes.subarray(0, 8192).includes(0)) throw new Error('type');
    const raw = type.label === 'RTF' ? new TextDecoder('latin1').decode(bytes) : decodeText(bytes);
    body = type.label === 'RTF' ? rtfText(raw) : type.label === 'HTML' ? htmlText(raw) : tidy(raw);
  }
  if (!body.replace(/[\s|,]/g, '')) throw new Error('empty');
  const chars = body.length;
  const truncated = chars > TEXT_MAX_CHARS;
  if (truncated) body = `${body.slice(0, TEXT_MAX_CHARS)}\n…(ตัดเหลือ ${TEXT_MAX_CHARS.toLocaleString('en-US')} ตัวอักษรแรก จากทั้งหมด ${chars.toLocaleString('en-US')} ตัวอักษร)`;
  const hint = type.kind === 'sheet' && (extra.rows ?? 0) > IMPORT_HINT_ROWS
    ? `\nไฟล์นี้มี ${extra.rows} แถว ถ้าผู้ใช้อยากบันทึกทุกแถวเข้าแอป แนะนำ "ย้ายข้อมูลเข้าแอป" ที่หน้างาน (ปุ่ม นำเข้าจาก Excel) ซึ่งตรวจและนำเข้าได้ครบทุกแถวในครั้งเดียว และย้อนกลับได้`
    : '';
  const text = `ไฟล์ "${name}" (${type.label} อ่านออกมาเป็นข้อความบนเครื่องของผู้ใช้)${hint}\n${body}`;
  return { kind: type.kind, label: type.label, text, chars, truncated, ...extra };
}
