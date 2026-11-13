import { strToU8, zipSync } from 'fflate';

// A small .xlsx writer for the bookkeeping templates (bookTemplates.ts; owner, 2026-11-12, plan phase 1). The app's
// spreadsheet library (SheetJS community) writes no styles and no drop-down lists, and a beginner's template needs both:
// a brick header row, money and date formats, pick lists for categories and withholding rates, frozen headers and
// formulas in the summary tabs. Plain SpreadsheetML in a zip: Excel, Google Sheets, Numbers and LibreOffice open it.

export type CellStyle = 'text' | 'header' | 'money' | 'date' | 'title' | 'total' | 'note' | 'percent' | 'label'
  | 'cell' | 'cellWrap' | 'choice' | 'calc' | 'calcText' | 'calcDate' | 'subtitle' | 'section' | 'bar' | 'input' | 'inputPercent'
  | 'totalLabel' | 'step' | 'kicker' | 'figure' | 'figureStrong' | 'idText' | 'inputText';
export type Cell =
  | string | number | null | undefined
  | { v: string | number; s?: CellStyle }
  | { f: string; s?: CellStyle }
  | { date: string; s?: CellStyle };

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Rows kept on screen while scrolling (the header). */
  freezeRows?: number;
  /** Drop-down lists: a range such as "C2:C500" and its choices (short lists, written inline). */
  validations?: { range: string; list: string[] }[];
  /** Number formats for whole columns from a row down (0-based column index → style). */
  columnStyles?: Record<number, CellStyle>;
  /** The tab colour (hex without #). */
  tabColor?: string;
  /** Row heights in points (0-based row index → height), and the height of every other row. */
  heights?: Record<number, number>;
  defaultHeight?: number;
  /** false: no grid lines (the cells draw their own lines, like a printed ledger). */
  gridlines?: boolean;
  /** Cells joined into one, such as "B12:C12" (a long line across two columns). */
  merges?: string[];
  /** Printing: one page wide, landscape or not, the frozen header repeated on every page. */
  print?: { landscape?: boolean; repeatHeader?: boolean };
}

// The look (owner, 2026-11-13: "สวยๆ เป็นทางการ"; 2026-11-12: brick #E65F2B flat on a neutral ground, no gradients, no
// cream). Words on brick use the deep brick #C24A16 (white on it 4.90:1, WCAG AA; on #E65F2B only 3.48:1): a brick header row, hairline-ruled cells like a printed ledger, grey cells for what the sheet works out (never
// typed over), a double rule under totals, quiet titles. One table drives both the file and the preview images.
export const SHEET_COLORS = {
  brick: 'E65F2B', brickDeep: 'C24A16', brickDark: '9A3A12', brickLine: 'D2734B', ink: '1C1917', muted: '6B6560', calcInk: '57534E',
  line: 'E2DFDB', lineStrong: 'BDB8B2', calcFill: 'F4F3F1', totalFill: 'ECEAE7', white: 'FFFFFF',
} as const;
export type BorderKind = 'cell' | 'header' | 'total' | 'input' | 'section';
export type NumberFormat = 'money' | 'moneyDash' | 'date' | 'percent' | 'text';
export interface StyleDef {
  bold?: boolean; size?: number; color?: string; fill?: string; border?: BorderKind; format?: NumberFormat;
  h?: 'left' | 'center' | 'right'; v?: 'top' | 'center' | 'bottom'; wrap?: boolean; indent?: number;
}
const K = SHEET_COLORS;
export const STYLE_DEFS: Record<CellStyle, StyleDef> = {
  text: { v: 'center', wrap: true },
  header: { bold: true, color: K.white, fill: K.brickDeep, border: 'header', h: 'center', v: 'center', wrap: true },
  money: { format: 'money', border: 'cell', v: 'center' },
  date: { format: 'date', border: 'cell', h: 'center', v: 'center' },
  title: { bold: true, size: 18, color: K.ink, v: 'center' },
  total: { bold: true, format: 'moneyDash', color: K.ink, fill: K.totalFill, border: 'total', v: 'center' },
  note: { size: 10, color: K.muted, v: 'top', wrap: true },
  percent: { format: 'percent', border: 'cell', h: 'center', v: 'center' },
  label: { bold: true, color: K.ink, fill: K.calcFill, border: 'cell', v: 'center', wrap: true, indent: 1 },
  cell: { border: 'cell', v: 'center' },
  cellWrap: { border: 'cell', v: 'center', wrap: true },
  choice: { border: 'cell', h: 'center', v: 'center' },
  calc: { format: 'moneyDash', color: K.calcInk, fill: K.calcFill, border: 'cell', v: 'center' },
  calcText: { color: K.calcInk, fill: K.calcFill, border: 'cell', h: 'center', v: 'center' },
  calcDate: { format: 'date', color: K.calcInk, fill: K.calcFill, border: 'cell', h: 'center', v: 'center' },
  subtitle: { size: 11, color: K.muted, v: 'center' },
  section: { bold: true, size: 12, color: K.ink, border: 'section', v: 'bottom' },
  bar: { fill: K.brick },
  input: { border: 'input', h: 'left', v: 'center', indent: 1 },
  inputPercent: { format: 'percent', border: 'input', h: 'left', v: 'center', indent: 1 },
  totalLabel: { bold: true, color: K.ink, fill: K.totalFill, border: 'total', v: 'center', indent: 1 },
  step: { bold: true, size: 12, color: K.brickDeep, h: 'right', v: 'top', indent: 1 },
  kicker: { bold: true, size: 10, color: K.brickDeep, v: 'center' },
  /** A worked-out figure in a report: white, ruled, a dash for nothing. */
  figure: { format: 'moneyDash', border: 'cell', v: 'center' },
  /** The figure a report is for (ภ.พ.30 to pay). */
  figureStrong: { bold: true, format: 'moneyDash', border: 'cell', v: 'center' },
  /** Tax IDs and branch codes: kept as text, so 0105… and 00000 keep their leading zeros (typed or written by เลขา). */
  idText: { format: 'text', border: 'cell', h: 'center', v: 'center' },
  inputText: { format: 'text', border: 'input', h: 'left', v: 'center', indent: 1 },
};
export const NUMBER_FORMATS: Record<NumberFormat, { id: number; code: string }> = {
  money: { id: 164, code: '#,##0.00' },
  date: { id: 165, code: 'dd/mm/yyyy' },
  moneyDash: { id: 166, code: '#,##0.00;-#,##0.00;"–"' },
  percent: { id: 9, code: '0%' },
  text: { id: 49, code: '@' },
};
const STYLE_NAMES = Object.keys(STYLE_DEFS) as CellStyle[];
const STYLE_INDEX = Object.fromEntries(STYLE_NAMES.map((name, i) => [name, i])) as Record<CellStyle, number>;
/** A string in a number column keeps the column's lines and fill. */
export const TEXT_IN: Partial<Record<CellStyle, CellStyle>> = {
  money: 'cell', percent: 'choice', date: 'choice', calc: 'calcText', calcDate: 'calcText', total: 'totalLabel', inputPercent: 'input', figure: 'cell', figureStrong: 'cell',
};

export const columnLetter = (index: number): string => {
  let n = index + 1; let out = '';
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
};
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters XML 1.0 cannot carry.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Excel's day number for a YYYY-MM-DD date (days since 1899-12-30). */
export function excelDate(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** A sheet name Excel accepts: at most 31 characters, none of []:*?/\ . */
export const safeSheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';

function cellXml(cell: Cell, ref: string, columnStyle?: CellStyle): string {
  if (cell === null || cell === undefined || cell === '') return columnStyle ? `<c r="${ref}" s="${STYLE_INDEX[columnStyle]}"/>` : '';
  if (typeof cell === 'number') return `<c r="${ref}" s="${STYLE_INDEX[columnStyle ?? 'money']}"><v>${cell}</v></c>`;
  if (typeof cell === 'string') return `<c r="${ref}" s="${STYLE_INDEX[columnStyle ? TEXT_IN[columnStyle] ?? columnStyle : 'text']}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
  if ('f' in cell) return `<c r="${ref}" s="${STYLE_INDEX[cell.s ?? columnStyle ?? 'money']}"><f>${esc(cell.f.replace(/^=/, ''))}</f></c>`;
  if ('date' in cell) return `<c r="${ref}" s="${STYLE_INDEX[cell.s ?? 'date']}"><v>${excelDate(cell.date)}</v></c>`;
  const style = STYLE_INDEX[cell.s ?? (typeof cell.v === 'number' ? 'money' : 'text')];
  return typeof cell.v === 'number'
    ? `<c r="${ref}" s="${style}"><v>${cell.v}</v></c>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec): string {
  const grid = sheet.gridlines === false ? ' showGridLines="0"' : '';
  const freeze = sheet.freezeRows ? `<sheetViews><sheetView${grid} workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView${grid} workbookViewId="0"/></sheetViews>`;
  const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const from = sheet.freezeRows ?? 0;
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => cellXml(cell, `${columnLetter(c)}${r + 1}`, r >= from ? sheet.columnStyles?.[c] : undefined)).join('');
    const height = sheet.heights?.[r];
    const ht = height ? ` ht="${height}" customHeight="1"` : '';
    return cells || ht ? `<row r="${r + 1}"${ht}>${cells}</row>` : '';
  }).join('');
  const validations = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map(v => `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${v.range}"><formula1>"${esc(v.list.map(item => item.replace(/[",]/g, ' ')).join(','))}"</formula1></dataValidation>`).join('')}</dataValidations>`
    : '';
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
  const fit = sheet.print ? '<pageSetUpPr fitToPage="1"/>' : '';
  const tab = sheet.tabColor || fit ? `<sheetPr>${sheet.tabColor ? `<tabColor rgb="FF${sheet.tabColor}"/>` : ''}${fit}</sheetPr>` : '';
  const format = `<sheetFormatPr defaultRowHeight="${sheet.defaultHeight ?? 18}"${sheet.defaultHeight ? ' customHeight="1"' : ''}/>`;
  const page = sheet.print ? `<pageSetup paperSize="9" orientation="${sheet.print.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${tab}${freeze}${format}${cols}<sheetData>${rows}</sheetData>${merges}${validations}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>${page}</worksheet>`;
}

const BORDERS: Record<BorderKind, string> = {
  cell: `<left style="thin"><color rgb="FF${K.line}"/></left><right style="thin"><color rgb="FF${K.line}"/></right><top style="thin"><color rgb="FF${K.line}"/></top><bottom style="thin"><color rgb="FF${K.line}"/></bottom>`,
  header: `<left style="thin"><color rgb="FF${K.brickLine}"/></left><right style="thin"><color rgb="FF${K.brickLine}"/></right><top style="thin"><color rgb="FF${K.brickDeep}"/></top><bottom style="thin"><color rgb="FF${K.brickDark}"/></bottom>`,
  total: `<left style="thin"><color rgb="FF${K.line}"/></left><right style="thin"><color rgb="FF${K.line}"/></right><top style="thin"><color rgb="FF${K.calcInk}"/></top><bottom style="double"><color rgb="FF${K.calcInk}"/></bottom>`,
  input: `<left style="thin"><color rgb="FF${K.lineStrong}"/></left><right style="thin"><color rgb="FF${K.lineStrong}"/></right><top style="thin"><color rgb="FF${K.lineStrong}"/></top><bottom style="thin"><color rgb="FF${K.lineStrong}"/></bottom>`,
  section: `<left/><right/><top/><bottom style="medium"><color rgb="FF${K.brick}"/></bottom>`,
};

/** styles.xml from STYLE_DEFS, in the font the file asks for. */
function stylesXml(font: string): string {
  const fonts: string[] = []; const fills: string[] = []; const borders: string[] = [];
  const index = (list: string[], xml: string) => { const at = list.indexOf(xml); if (at >= 0) return at; list.push(xml); return list.length - 1; };
  const fontXml = (def: StyleDef) => `<font>${def.bold ? '<b/>' : ''}<sz val="${def.size ?? 11}"/><color rgb="FF${def.color ?? K.ink}"/><name val="${esc(font)}"/></font>`;
  index(fonts, fontXml({}));
  fills.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
  borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>');
  const xfs = STYLE_NAMES.map(name => {
    const def = STYLE_DEFS[name];
    const fontId = index(fonts, fontXml(def));
    const fillId = def.fill ? index(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${def.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const borderId = def.border ? index(borders, `<border>${BORDERS[def.border]}<diagonal/></border>`) : 0;
    const numFmtId = def.format ? NUMBER_FORMATS[def.format].id : 0;
    const align = `<alignment${def.h ? ` horizontal="${def.h}"` : ''} vertical="${def.v ?? 'center'}"${def.wrap ? ' wrapText="1"' : ''}${def.indent ? ` indent="${def.indent}"` : ''}/>`;
    return `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`;
  });
  const custom = Object.values(NUMBER_FORMATS).filter(f => f.id >= 164);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="${custom.length}">${custom.map(f => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code)}"/>`).join('')}</numFmts>
<fonts count="${fonts.length}">${fonts.join('')}</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

/** The frozen header printed again at the top of every page. */
function printTitles(sheets: SheetSpec[]): string {
  const names = sheets.map((sheet, i) => (sheet.print?.repeatHeader && sheet.freezeRows
    ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(sheet.name.replace(/'/g, "''"))}'!$1:$${sheet.freezeRows}</definedName>` : '')).filter(Boolean);
  return names.length ? `<definedNames>${names.join('')}</definedNames>` : '';
}

/** The .xlsx file's bytes. font: Tahoma for a file opened in Excel (it comes with every Windows and Mac); Sarabun for one
 *  that becomes a Google Sheet (a Google font made for formal Thai documents). */
export function buildXlsx(sheets: SheetSpec[], meta: { title?: string; creator?: string; font?: string } = {}): Uint8Array {
  const names = new Set<string>();
  const named = sheets.map(sheet => {
    let name = safeSheetName(sheet.name);
    for (let i = 2; names.has(name); i += 1) name = `${safeSheetName(sheet.name).slice(0, 28)} ${i}`;
    names.add(name);
    return { ...sheet, name };
  });
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title ?? '')}</dc:title><dc:creator>${esc(meta.creator ?? 'กระรอกตุนเงิน')}</dc:creator></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${named.map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${printTitles(named)}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(stylesXml(meta.font ?? 'Tahoma')),
  };
  named.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet)); });
  return zipSync(files, { level: 6 });
}
