import React from 'react';
import { Check, ListChecks } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { getCurrentAccount } from '../../services/api';
import { googleApi } from '../../services/google';
import type { ChatMessage } from '../assistant/assistantMock';
import { mapOf, readTabs, templateReadings, type TabReading } from './sheetMap';
import { answerColumn, sheetSetupOf, type SheetSetup } from './sheetQuestions';
import { cardOptions, cardQuestion, chooseCard, questionCard, sheetIntroText, type SheetAskCard, type SheetAskOption } from './sheetAsk';
import { rememberGoogleStatus } from './SheetSource';
import './labs.css';

// เลขาถามเรื่องชีตในแชท (owner, 2026-11-14: "ย้ายคำถามไปขึ้นในหน้าแชทเลขาเลย"; sheetAsk.ts has the words and the rules).
// The chat page opens a conversation of its own for it: เลขา reads the sheet, says what it read and asks one question at
// a time; each tap shows as the person's reply; after the last answer (or ใช้ตามนี้ when there is nothing to ask) the sheet
// map is saved. Everything happens on this device and through the sheet's own API; nothing is sent to the AI.

type Mode = 'thinking' | 'working' | 'awake' | 'awaiting';

export type SheetChatHost = {
  accountId?: string;
  /** A new conversation id (the kind the server keeps, should the person go on typing in it). */
  newChatId: () => string;
  newId: (prefix: string) => string;
  /** Adds the conversation and shows it. */
  open: (chat: { id: string; title: string }) => void;
  append: (chat: string, messages: ChatMessage[]) => void;
  setMode: (mode: Mode) => void;
  /** The proud or worried squirrel for a moment, after a save. */
  settled: (ok: boolean) => void;
};

type Session = { account: string; fileId: string; readings: TabReading[]; setup: SheetSetup };
type AskState = { answered: Record<string, string>; busy: boolean; answer: (card: SheetAskCard, option: SheetAskOption) => void };

const SheetAskContext = React.createContext<AskState | null>(null);

export function useSheetAsk(host: SheetChatHost) {
  const hostRef = React.useRef(host); hostRef.current = host;
  const sessions = React.useRef(new Map<string, Session>());
  const [answered, setAnswered] = React.useState<Record<string, string>>({});
  const answeredRef = React.useRef(answered); answeredRef.current = answered;
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const work = (on: boolean) => { busyRef.current = on; setBusy(on); };

  const bot = (text: string, card?: SheetAskCard | null): ChatMessage =>
    ({ id: hostRef.current.newId('bot'), from: 'bot', text, at: Date.now(), local: true, ...(card ? { cards: [card] } : {}) });
  const me = (text: string): ChatMessage => ({ id: hostRef.current.newId('me'), from: 'me', text, at: Date.now(), local: true });
  const stillHere = (account: string) => getCurrentAccount() === account && hostRef.current.accountId === account;

  const read = async (chat: string, account: string) => {
    const h = hostRef.current;
    work(true); h.setMode('thinking');
    try {
      const reply = await googleApi.read(account);
      if (!stillHere(account)) return;
      const file = reply.google.file;
      if (!file) { h.append(chat, [bot(tr("ยังไม่ได้เลือกไฟล์ชีตครับ เลือกได้ที่หน้าต่างชีตบัญชีของคุณ"))]); h.setMode('awake'); return; }
      if (reply.google.map?.fileId === file.id) { h.append(chat, [bot(tr("ชีตนี้บันทึกไว้แล้วครับ เลขาอ่านชีตนี้ตามที่บันทึกไว้"))]); h.setMode('awake'); return; }
      // A sheet made from one of our bookkeeping templates is read the way the template means it.
      const first = readTabs(reply.tabs, null);
      const readings = templateReadings(first) ?? first;
      const setup = sheetSetupOf(readings);
      sessions.current.set(chat, { account, fileId: file.id, readings, setup });
      const card = questionCard(chat, setup, 0, h.newId('sheet'));
      h.append(chat, [bot(sheetIntroText(file.name, setup), card)]);
      h.setMode(card ? 'awaiting' : 'awake');
    } catch {
      if (!stillHere(account)) return;
      h.append(chat, [bot(tr("อ่านชีตไม่สำเร็จครับ กรุณาลองอีกครั้ง"), { kind: 'sheet_ask', id: h.newId('sheet'), chat, phase: 'reread' })]);
      h.setMode('awake');
    } finally { work(false); }
  };

  const save = async (chat: string, session: Session) => {
    const h = hostRef.current;
    work(true); h.setMode('working');
    try {
      const status = await googleApi.saveMap(session.account, mapOf(session.fileId, session.readings));
      if (!stillHere(session.account)) return;
      rememberGoogleStatus(session.account, status);
      h.append(chat, [bot(tr("บันทึกแล้วครับ เลขาจะอ่านชีตนี้ตามนี้"))]);
      h.settled(true);
    } catch {
      if (!stillHere(session.account)) return;
      h.append(chat, [bot(tr("บันทึกไม่สำเร็จครับ กรุณาลองอีกครั้ง"), { kind: 'sheet_ask', id: h.newId('sheet'), chat, phase: 'retry' })]);
      h.settled(false);
    } finally { work(false); }
  };

  /** The window handed over (requestSheetAsk): a conversation of its own, then เลขา reads the sheet. */
  const start = React.useCallback((fileName: string) => {
    const h = hostRef.current;
    if (!h.accountId) return;
    const chat = h.newChatId();
    h.open({ id: chat, title: fileName ? tr("ชีต {0}", fileName) : tr("ชีตบัญชีของคุณ") });
    void read(chat, h.accountId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (card: SheetAskCard, option: SheetAskOption) => {
    const h = hostRef.current;
    if (busyRef.current || answeredRef.current[card.id] !== undefined) return;
    const session = sessions.current.get(card.chat);
    const account = session?.account ?? h.accountId;
    if (!account || !stillHere(account)) return;
    setAnswered(state => ({ ...state, [card.id]: option.label }));
    if (card.phase === 'reread') { h.append(card.chat, [me(option.label)]); void read(card.chat, account); return; }
    if (!session) return;
    if (card.phase === 'go' || card.phase === 'retry') { h.append(card.chat, [me(option.label)]); void save(card.chat, session); return; }
    if (option.no) { h.append(card.chat, [me(option.label), bot('', chooseCard(card, h.newId('sheet')))]); return; }
    const question = session.setup.questions[card.step ?? 0];
    if (!option.target || !question) return;
    session.readings = answerColumn(session.readings, question, option.target);
    const next = questionCard(card.chat, session.setup, (card.step ?? 0) + 1, h.newId('sheet'));
    // The last answer is the go-ahead: the map is saved with every answer in it.
    if (next?.phase === 'confirm') { h.append(card.chat, [me(option.label), bot('', next)]); h.setMode('awaiting'); return; }
    h.append(card.chat, [me(option.label)]);
    void save(card.chat, session);
  };

  const value = React.useMemo<AskState>(() => ({ answered, busy, answer }), [answered, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return { start, value };
}

export function SheetAskProvider({ value, children }: { value: AskState; children: React.ReactNode }) {
  return <SheetAskContext.Provider value={value}>{children}</SheetAskContext.Provider>;
}

/** One step in the chat: a question as the chat's own ขอข้อมูลเพิ่ม card (tap to answer), or one button. */
export function SheetAskCardView({ card }: { card: SheetAskCard }) {
  const ask = React.useContext(SheetAskContext);
  const said = ask?.answered[card.id];
  const done = !ask || said !== undefined;
  const options = cardOptions(card);
  if (card.phase === 'go' || card.phase === 'retry' || card.phase === 'reread') {
    return (
      <button type="button" className="asx-pill-btn is-primary asx-sheet-go" disabled={done || ask?.busy} onClick={() => ask?.answer(card, options[0])} data-testid="sheet-ask-go">
        {said !== undefined && <Check size={14} aria-hidden="true" />}{options[0].label}
      </button>
    );
  }
  const question = cardQuestion(card);
  const total = card.total ?? 1;
  return (
    <div className={`asx-rcard is-questions is-sheet-ask${done ? ' is-done' : ''}`} data-testid="sheet-ask-card">
      <div className="asx-rcard-head">
        <span className="asx-rcard-icon"><ListChecks size={16} strokeWidth={1.9} /></span>
        <b>{total > 1 ? tr("ขอข้อมูลเพิ่ม ({0}/{1})", (card.step ?? 0) + 1, total) : tr("ขอข้อมูลเพิ่ม")}</b>
        {said !== undefined && <span className="asx-card-state is-done"><i aria-hidden="true" />{tr("ตอบแล้ว")}</span>}
      </div>
      <div className="asx-q-list">
        <fieldset className="asx-q" disabled={done || ask?.busy}>
          <legend>{question}</legend>
          <div className="asx-q-group" role="radiogroup" aria-label={question}>
            {options.map(option => (
              <button key={option.label} type="button" role="radio" aria-checked={said === option.label} className="asx-q-row" onClick={() => ask?.answer(card, option)}>
                <span className="asx-q-row-text">{option.label}</span><span className="asx-q-tick" aria-hidden="true" />
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
