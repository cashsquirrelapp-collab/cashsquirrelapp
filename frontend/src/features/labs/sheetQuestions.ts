import { needsConfirmation, type ColumnTarget, type DataKind } from '../import/sheetImport';
import { setTarget, type TabReading } from './sheetMap';

// เลขาถามเรื่องชีต (owner, 2026-11-14: the column table was "ดูยาก … สับสนไปหมด"; approved instead: เลขา says in one line
// which columns the sheet works out by itself and that it will not touch them, then asks only about columns it is not sure
// of, one at a time, ใช่ / ไม่ใช่; when it understands everything it asks nothing). Rule-based, no tokens: the reading is
// the importer's (sheetImport.ts), the questions are the columns it would ask a person to confirm.

export interface SheetQuestion {
  /** Which tab (index in the readings) and column. */
  tab: number;
  column: number;
  header: string;
  /** What เลขา thinks the column is. */
  target: ColumnTarget;
  kind: DataKind;
}

export interface SheetSetup {
  /** Tabs read as data, by what they hold. */
  tabs: { name: string; kind: DataKind }[];
  /** Headers of the columns the sheet's own formulas fill (never written). */
  formulas: string[];
  questions: SheetQuestion[];
}

const MAX_QUESTIONS = 3;
const used = (reading: TabReading) => reading.use && reading.analysis.role === 'data';

/** What เลขา tells and asks about a sheet it has just read. */
export function sheetSetupOf(readings: TabReading[]): SheetSetup {
  const tabs: SheetSetup['tabs'] = [];
  const formulas: string[] = [];
  const questions: SheetQuestion[] = [];
  readings.forEach((reading, tab) => {
    if (!used(reading)) return;
    tabs.push({ name: reading.analysis.name, kind: reading.analysis.kind });
    for (const column of reading.analysis.columns) {
      const header = column.header.trim();
      if (reading.formulas.has(column.index)) {
        if (header && !formulas.includes(header)) formulas.push(header);
        continue;
      }
      if (column.target === 'keep' || column.target === 'ignore' || column.reason === 'person' || !header) continue;
      if (needsConfirmation(column) || column.confidence < 0.6) questions.push({ tab, column: column.index, header, target: column.target, kind: reading.analysis.kind });
    }
  });
  return { tabs, formulas: formulas.slice(0, 4), questions: questions.slice(0, MAX_QUESTIONS) };
}

/** What a column may be instead, when the answer is ไม่ใช่: the common ones for the tab, then ไม่ใช้. */
export const OTHER_TARGETS: Record<DataKind, ColumnTarget[]> = {
  jobs: ['name', 'client', 'value', 'received', 'whtAmount', 'postDate', 'dueDate', 'paidDate', 'note', 'ignore'],
  expenses: ['name', 'category', 'amount', 'date', 'note', 'ignore'],
  mixed: ['kind', 'name', 'income', 'expense', 'amount', 'date', 'note', 'ignore'],
};

/** The readings with one column's answer: kept as เลขา thought (ใช่) or set to what the person picked. */
export function answerColumn(readings: TabReading[], question: SheetQuestion, target: ColumnTarget): TabReading[] {
  return readings.map((reading, index) => (index === question.tab ? setTarget(reading, question.column, target) : reading));
}
