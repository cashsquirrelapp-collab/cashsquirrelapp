import { tr } from '../../i18n/tr';
import { FIELD_LABELS } from '../import/importShared';
import type { ColumnTarget, DataKind } from '../import/sheetImport';
import { OTHER_TARGETS, type SheetQuestion, type SheetSetup } from './sheetQuestions';

// เลขาถามเรื่องชีตในแชท (owner, 2026-11-14: "ย้ายคำถามไปขึ้นในหน้าแชทเลขาเลย", as in the approved mock): once a sheet is
// picked in Settings, the window hands over to เลขา's web chat, where เลขา says what it read, which columns the sheet works
// out by itself, and asks only what it is not sure of, one question at a time, ใช่ / ไม่ใช่. Rule-based (sheetQuestions.ts),
// no tokens: nothing of it goes to the AI. The page LINE opens (/connect-sheets) keeps asking in its own window, since LINE
// has no web chat. Kept in a labs file: เลขา's page words never name a test feature.

/** One tap-to-answer step of the conversation, drawn by SheetAskCard (SheetChatAsk.tsx). */
export type SheetAskCard = {
  kind: 'sheet_ask';
  id: string;
  /** The local conversation it belongs to. */
  chat: string;
  /** confirm: ใช่ / ไม่ใช่ · choose: what the column is instead · go: ใช้ตามนี้ (nothing to ask) · retry: save again ·
   *  reread: read the sheet again. */
  phase: 'confirm' | 'choose' | 'go' | 'retry' | 'reread';
  step?: number;
  total?: number;
  header?: string;
  target?: ColumnTarget;
  dataKind?: DataKind;
};

export type SheetAskOption = { label: string; target?: ColumnTarget; no?: true };

/** A file, tab or column name as plain text in เลขา's message (no Markdown of its own). */
const plain = (name: string) => name.replace(/[*`[\]|_]/g, ' ').replace(/\s+/g, ' ').trim();

/** What เลขา says first: what it read, the formula columns it leaves alone, and how many questions follow. */
export function sheetIntroText(fileName: string, setup: SheetSetup): string {
  const asked = setup.questions.length;
  const file = plain(fileName);
  const names = (kind: DataKind) => setup.tabs.filter(tab => tab.kind === kind).map(tab => plain(tab.name)).join(', ');
  const lines = [file ? (asked ? tr("อ่านชีต **{0}** แล้วครับ เข้าใจเกือบหมด", file) : tr("อ่านชีต **{0}** แล้วครับ เข้าใจทั้งหมด", file)) : tr("อ่านชีตแล้วครับ")];
  if (names('jobs')) lines.push(tr("แท็บ {0} เป็นงานและรายรับ", names('jobs')));
  if (names('expenses')) lines.push(tr("แท็บ {0} เป็นรายจ่าย", names('expenses')));
  if (names('mixed')) lines.push(tr("แท็บ {0} มีทั้งรายรับและรายจ่าย", names('mixed')));
  // As in the approved mock: the file and the formula columns in bold (never page links: the chat draws these as text).
  const formulas = setup.formulas.map(plain).filter(Boolean).map(name => `**${name}**`);
  if (formulas.length === 1) lines.push(tr("ช่อง {0} ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้", formulas[0]));
  else if (formulas.length > 1) lines.push(tr("ช่อง {0} กับ {1} ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้", formulas.slice(0, -1).join(', '), formulas[formulas.length - 1]));
  if (!setup.tabs.length) lines.push(tr("ยังไม่เจอแท็บที่เป็นรายการงานหรือรายจ่ายครับ เลือกเองได้ที่หน้าต่างชีตบัญชีของคุณ กดดูทั้งตาราง"));
  else lines.push(asked === 0 ? tr("ถ้าถูกต้อง กดใช้ตามนี้ได้เลยครับ") : asked === 1 ? tr("ขอถามข้อเดียวครับ") : tr("ขอถาม {0} ข้อครับ", asked));
  return lines.join('\n\n');
}

/** The card for question `step` (or ใช้ตามนี้ when there is nothing to ask). */
export function questionCard(chat: string, setup: SheetSetup, step: number, id: string): SheetAskCard | null {
  if (!setup.tabs.length) return null;
  const question: SheetQuestion | undefined = setup.questions[step];
  if (!question) return { kind: 'sheet_ask', id, chat, phase: 'go' };
  return { kind: 'sheet_ask', id, chat, phase: 'confirm', step, total: setup.questions.length, header: question.header, target: question.target, dataKind: question.kind };
}

/** After ไม่ใช่: the same column, asked what it is instead. */
export const chooseCard = (card: SheetAskCard, id: string): SheetAskCard => ({ ...card, id, phase: 'choose' });

const label = (target: ColumnTarget) => tr(FIELD_LABELS[target]);

/** The question on a card, as เลขา asks it. */
export function cardQuestion(card: SheetAskCard): string {
  if (card.phase === 'confirm' && card.header && card.target) return tr('ช่อง "{0}" คือ{1} ใช่ไหมครับ', plain(card.header), label(card.target));
  if (card.phase === 'choose' && card.header) return tr('แล้วช่อง "{0}" คืออะไรครับ', plain(card.header));
  return '';
}

/** The answers a card offers. */
export function cardOptions(card: SheetAskCard): SheetAskOption[] {
  if (card.phase === 'confirm' && card.target) return [{ label: tr("ใช่"), target: card.target }, { label: tr("ไม่ใช่"), no: true }];
  if (card.phase === 'choose' && card.dataKind) return OTHER_TARGETS[card.dataKind].filter(target => target !== card.target).map(target => ({ label: label(target), target }));
  if (card.phase === 'go') return [{ label: tr("ใช้ตามนี้") }];
  return [{ label: tr("ลองอีกครั้ง") }];
}

// The hand-over from the Settings window to the chat page: kept for this tab (it survives the page load a new build
// may do on the way), taken once by the chat, and only for the same account, within two minutes.
const KEY = 'krarok.sheetAsk';
const EVENT = 'krarok:sheet-ask';
const FRESH = 2 * 60_000;
type Pending = { account: string; fileName: string; at: number };
let memory: Pending | null = null;

/** The window asks the chat to take over the questions about the picked sheet. */
export function requestSheetAsk(account: string, fileName: string): void {
  memory = { account, fileName, at: Date.now() };
  try { sessionStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* the in-memory copy still works on this page */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The chat takes a waiting hand-over for this account (once); null when there is none. */
export function takeSheetAsk(account: string | undefined, now = Date.now()): { fileName: string } | null {
  if (!account) return null;
  let pending = memory;
  try { const kept = sessionStorage.getItem(KEY); if (kept) pending = JSON.parse(kept) as Pending; } catch { /* use the in-memory copy */ }
  if (!pending || pending.account !== account || now - pending.at > FRESH) return null;
  memory = null;
  try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ }
  return { fileName: typeof pending.fileName === 'string' ? pending.fileName : '' };
}

export function onSheetAsk(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
