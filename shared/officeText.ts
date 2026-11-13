// The words of Word, OpenDocument and PowerPoint files: the XML inside their zip turned into plain text, tables one row a
// line with cells apart by " | ". Shared by the app's chat, which opens the zip on the person's device
// (frontend/src/features/assistant/fileText.ts), and the LINE chat, which opens it on the server (documentFileText.ts).
// Nothing in the file is run: only its text is read.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}
/** Lines trimmed, no run of more than one empty line. */
export function tidy(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/[ \t]+$/g, '').replace(/(\s*\|\s*)+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}
export const stripTags = (xml: string) => decodeEntities(xml.replace(/<[^>]+>/g, ''));

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
/** The tables of a Word document, each as rows of cell text (nested tables are read as text inside their cell). */
export function wordTables(xml: string): string[][][] {
  return [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(table => [...table[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)]
    .map(row => [...row[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map(cell => stripTags(cell[0].replace(/<\/w:p>/g, ' ')).replace(/\s+/g, ' ').trim()))
    .filter(row => row.some(Boolean)));
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
