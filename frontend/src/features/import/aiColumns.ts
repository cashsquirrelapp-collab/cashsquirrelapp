import { apiJson } from '../../services/api';
import type { ColumnTarget, Field, SheetAnalysis } from './sheetImport';

// เลขากระรอก's help with columns the import's rules could not name (owner, 2026-10-30: files from other apps whose
// columns are not named like ours; free for every account, asked by itself). Only those columns' headers and a few
// samples are sent (the server masks emails and long numbers); a suggestion is marked for the person to confirm, and
// the import's own rules still read every amount, date and status.

export interface AiColumnAnswer { columns: { index: number; field: Field }[]; available: boolean }
const NOT_FIELDS: ColumnTarget[] = ['keep', 'ignore'];

/** The columns worth asking about: a header the rules did not recognise, with something in it. */
export function columnsToAsk(analysis: SheetAnalysis) {
  if (analysis.headerRow === null) return [];
  return analysis.columns
    .filter(column => column.target === 'keep' && (column.reason === 'none' || column.reason === undefined) && column.header.trim() && column.samples.some(Boolean))
    .slice(0, 40)
    .map(column => ({ index: column.index, header: column.header.slice(0, 120), samples: column.samples.slice(0, 5).map(sample => sample.slice(0, 120)) }));
}

/** The fields other columns already have (never suggested twice). */
export const takenFields = (analysis: SheetAnalysis): Field[] =>
  [...new Set(analysis.columns.map(column => column.target).filter((target): target is Field => !NOT_FIELDS.includes(target)))];

export async function askColumns(accountId: string, sheetName: string, analysis: SheetAnalysis, signal?: AbortSignal): Promise<AiColumnAnswer> {
  const columns = columnsToAsk(analysis);
  if (!columns.length) return { columns: [], available: false };
  return apiJson<AiColumnAnswer>('/api/assistant', {
    method: 'POST', signal, headers: { 'X-Account-ID': accountId },
    body: JSON.stringify({ action: 'map-columns', sheet: sheetName.slice(0, 120), columns, taken: takenFields(analysis) }),
  });
}

/**
 * Puts the suggestions on the columns still unnamed (a column the person already chose is left as it is), each field
 * once, marked 'ai' so the person confirms it before the review.
 */
export function applySuggestions(analysis: SheetAnalysis, suggestions: AiColumnAnswer['columns']): { analysis: SheetAnalysis; applied: number } {
  const used = new Set<ColumnTarget>(takenFields(analysis));
  let applied = 0;
  const columns = analysis.columns.map(column => {
    const suggestion = suggestions.find(item => item.index === column.index);
    if (!suggestion || column.target !== 'keep' || (column.reason !== 'none' && column.reason !== undefined) || used.has(suggestion.field)) return column;
    used.add(suggestion.field);
    applied += 1;
    return { ...column, target: suggestion.field, confidence: 0.6, reason: 'ai' as const };
  });
  return { analysis: { ...analysis, columns }, applied };
}
