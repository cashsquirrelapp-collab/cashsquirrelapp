import { strToU8, zipSync } from 'fflate';

// A small .xlsx writer for the bookkeeping templates (bookTemplates.ts; owner, 2026-11-12, plan phase 1). The app's
// spreadsheet library (SheetJS community) writes no styles and no drop-down lists, and a beginner's template needs both:
// a brick header row, money and date formats, pick lists for categories and withholding rates, frozen headers and
// formulas in the summary tabs. Plain SpreadsheetML in a zip: Excel, Google Sheets, Numbers and LibreOffice open it.

export type CellStyle = 'text' | 'header' | 'money' | 'date' | 'title' | 'total' | 'note' | 'percent' | 'label';
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
}

const STYLE_INDEX: Record<CellStyle, number> = { text: 0, header: 1, money: 2, date: 3, title: 4, total: 5, note: 6, percent: 7, label: 8 };

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
  if (typeof cell === 'string') return `<c r="${ref}" s="${STYLE_INDEX[columnStyle && columnStyle !== 'money' && columnStyle !== 'date' && columnStyle !== 'percent' ? columnStyle : 'text']}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
  if ('f' in cell) return `<c r="${ref}" s="${STYLE_INDEX[cell.s ?? columnStyle ?? 'money']}"><f>${esc(cell.f.replace(/^=/, ''))}</f></c>`;
  if ('date' in cell) return `<c r="${ref}" s="${STYLE_INDEX[cell.s ?? 'date']}"><v>${excelDate(cell.date)}</v></c>`;
  const style = STYLE_INDEX[cell.s ?? (typeof cell.v === 'number' ? 'money' : 'text')];
  return typeof cell.v === 'number'
    ? `<c r="${ref}" s="${style}"><v>${cell.v}</v></c>`
    : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec): string {
  const freeze = sheet.freezeRows ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const from = sheet.freezeRows ?? 0;
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((cell, c) => cellXml(cell, `${columnLetter(c)}${r + 1}`, r >= from ? sheet.columnStyles?.[c] : undefined)).join('');
    return cells ? `<row r="${r + 1}">${cells}</row>` : '';
  }).join('');
  const validations = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map(v => `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${v.range}"><formula1>"${esc(v.list.map(item => item.replace(/[",]/g, ' ')).join(','))}"</formula1></dataValidation>`).join('')}</dataValidations>`
    : '';
  const tab = sheet.tabColor ? `<sheetPr><tabColor rgb="FF${sheet.tabColor}"/></sheetPr>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${tab}${freeze}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${rows}</sheetData>${validations}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="6">
<font><sz val="11"/><name val="Tahoma"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font>
<font><b/><sz val="14"/><color rgb="FF1F1D1B"/><name val="Tahoma"/></font>
<font><b/><sz val="11"/><name val="Tahoma"/></font>
<font><i/><sz val="10"/><color rgb="FF6B645E"/><name val="Tahoma"/></font>
<font><b/><sz val="11"/><color rgb="FFB8461C"/><name val="Tahoma"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE65F2B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDEEE6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FFE9E4DE"/></top><bottom style="thin"><color rgb="FFE9E4DE"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** The .xlsx file's bytes. */
export function buildXlsx(sheets: SheetSpec[], meta: { title?: string; creator?: string } = {}): Uint8Array {
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
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${named.map((sheet, i) => `<sheet name="${esc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  named.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet)); });
  return zipSync(files, { level: 6 });
}
