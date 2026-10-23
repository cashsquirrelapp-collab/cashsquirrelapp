import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, BarChart3, Clock, FileText, FolderPlus, HelpCircle, ListChecks, Maximize2, MousePointerClick, Pointer, Sparkles, Wallet, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { tr, T } from '../../i18n/tr';
import { createSampleTransport, type AssistantTransport } from './assistantApi';
import { PAGE_HELP, SAMPLE_TOKENS, buddyPrompts, type AssistantMode, type ChatMessage, type ConfirmCard } from './assistantMock';
import { ChatCardView, type ConfirmState } from './ChatCards';
import { MascotSlot } from './MascotSlot';
import { Markdown } from './Markdown';
import './assistant.css';

// เลขากระรอกติดตัว (owner, 2026-10-23: "ให้น้องตามไปทุกที่ทุกฟีเจอร์สำหรับคนที่ใช้โปร ... คล้าย Cowork", then a video of
// an AI dashboard to follow): for Pro accounts the squirrel waits at the corner of every page. On computers it
// is an "ถามเลขากระรอก ⌘K" pill and opens a panel docked at the right. On very wide screens (1720px+) the page makes
// room for it; on other computers it is a side sheet over a dimmed, blurred page, because a page pushed narrower
// broke tables sized by the screen (and a panel floating over a clear page left text peeking out). On phones it is a round squirrel above the bottom bar and opens a sheet. The
// panel knows the page: it greets you, offers questions for that page and can prepare an action for you to
// confirm (for example a new job). Screen only, like the full chat: the sample transport answers, nothing
// is saved. A patch of page colour under the corner squirrel fades out text that scrolls past.

type Props = {
  mobile: boolean;
  /** Computers (1024px+): the panel docks at the right. */
  docked: boolean;
  /** Very wide screens: the page makes room beside the panel (App adds the padding), so no dimmed backdrop. */
  push?: boolean;
  /** The page's key (e.g. 'jobs') and its name as the sidebar shows it. */
  page: string;
  pageName: string;
  /** For the greeting. */
  userName?: string;
  /** Kept out of sight while the squirrel is being born (AssistantBirth flies to this spot). */
  hidden?: boolean;
  /** Bumped when the squirrel has just arrived: it pops in and says where it lives. */
  arrival?: number;
  onPanelChange?: (open: boolean) => void;
  onOpenChat: () => void;
  onNavigate: (path: string) => void;
  transport?: AssistantTransport;
};

const EXTRA_PROMPTS = [T("สรุปเดือนนี้"), T("รอรับเงิน"), T("กำลังดำเนินการ"), T("สรุปงานของวันนี้"), T("ตรวจงานที่ยังไม่ได้รับเงิน")];
const PROMPT_ICONS: Record<string, typeof HelpCircle> = {
  [PAGE_HELP]: HelpCircle, 'สรุปเดือนนี้': BarChart3, 'รอรับเงิน': Wallet, 'ตรวจงานที่ยังไม่ได้รับเงิน': Wallet, 'กำลังดำเนินการ': Clock,
  'ช่วยเพิ่มงานใหม่ให้หน่อย': FolderPlus, 'สรุปงานของวันนี้': ListChecks, 'ใบเสนอราคาอยู่ตรงไหน': FileText,
};
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Phones: the sheet sits on the visible screen, above the keyboard. */
function useSheetBox(active: boolean) {
  const [box, setBox] = React.useState<React.CSSProperties>({});
  React.useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const vv = window.visualViewport;
      const visible = vv ? vv.height : window.innerHeight;
      const height = Math.min(660, Math.round(visible - 24));
      setBox({ top: Math.round((vv ? vv.offsetTop : 0) + visible - height), height });
    };
    measure();
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [active]);
  return box;
}

export default function AssistantBuddy({ mobile, docked, push = false, page, pageName, userName, hidden = false, arrival = 0, onPanelChange, onOpenChat, onNavigate, transport: given }: Props) {
  const reduce = useReducedMotion();
  const transport = React.useMemo(() => given ?? createSampleTransport({ failSends: () => false, failActions: () => false, tokens: () => SAMPLE_TOKENS, instant: Boolean(reduce) }), [given, reduce]);
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [mode, setMode] = React.useState<AssistantMode>('awake');
  const [draft, setDraft] = React.useState('');
  const [confirmStates, setConfirmStates] = React.useState<Record<string, ConfirmState>>({});
  const [tip, setTip] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const nextId = React.useRef(0);
  const sheetBox = useSheetBox(open && mobile);
  const busy = mode === 'thinking' || mode === 'working';
  const prompts = Array.from(new Set([...buddyPrompts(page), ...EXTRA_PROMPTS])).slice(0, 6);
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';

  React.useEffect(() => { onPanelChange?.(open); }, [open, onPanelChange]);
  React.useEffect(() => () => onPanelChange?.(false), [onPanelChange]);
  const close = React.useCallback(() => { setOpen(false); window.setTimeout(() => buttonRef.current?.focus(), 0); }, []);
  // ⌘K / Ctrl+K opens it from any page, as the search-or-ask box does in the reference.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); }
      else if (event.key === 'Escape' && open) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);
  React.useEffect(() => { if (open && !mobile) window.setTimeout(() => inputRef.current?.focus(), 80); }, [open, mobile]);
  React.useEffect(() => () => abortRef.current?.abort(), []);
  // Just arrived from its birth: say where it lives for a moment.
  React.useEffect(() => {
    if (!arrival) return;
    setTip(true);
    const t = window.setTimeout(() => setTip(false), 4800);
    return () => window.clearTimeout(t);
  }, [arrival]);
  React.useEffect(() => { if (open) setTip(false); }, [open]);
  // Follow the conversation as it grows.
  React.useLayoutEffect(() => { const list = listRef.current; if (list) list.scrollTop = list.scrollHeight; }, [messages, mode, open]);

  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++nextId.current}`;
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const mine: ChatMessage = { id: id('me'), from: 'me', text, at: Date.now() };
    const history = [...messages, mine];
    setMessages(history);
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = '';
    setMode('thinking');
    const controller = new AbortController();
    abortRef.current = controller;
    const botId = id('bot');
    let started = false;
    try {
      const result = await transport.send({ conversationId: 'buddy', text, history, context: { page, pageName } }, textSoFar => {
        if (!started) { started = true; setMode('working'); setMessages(list => [...list, { id: botId, from: 'bot' as const, text: textSoFar, at: Date.now() }]); }
        else setMessages(list => list.map(message => (message.id === botId ? { ...message, text: textSoFar } : message)));
      }, controller.signal);
      setMessages(list => (started ? list : [...list, { id: botId, from: 'bot' as const, text: '', at: Date.now() }]).map(message => (message.id === botId ? { ...message, text: result.text, cards: result.cards } : message)));
      setMode('done');
      window.setTimeout(() => setMode(m => (m === 'done' ? 'awake' : m)), 1600);
    } catch {
      if (controller.signal.aborted) return;
      setMessages(list => [...list.filter(message => message.id !== botId), { id: botId, from: 'bot' as const, text: tr("ส่งไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"), at: Date.now() }]);
      setMode('awake');
    }
  };
  const confirm = async (card: ConfirmCard) => {
    setConfirmStates(states => ({ ...states, [card.id]: 'working' }));
    try {
      const result = await transport.confirm(card, new AbortController().signal);
      setConfirmStates(states => ({ ...states, [card.id]: result.ok ? 'done' : 'failed' }));
    } catch { setConfirmStates(states => ({ ...states, [card.id]: 'failed' })); }
  };
  const onDraft = (value: string) => {
    setDraft(value);
    if (!busy) setMode(value.trim() ? 'listening' : 'awake');
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(120, el.scrollHeight)}px`; }
  };
  const go = (path: string) => { if (!docked) setOpen(false); onNavigate(path); };

  const panelMotion = reduce
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : mobile
      ? { initial: { y: 40, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 40, opacity: 0 }, transition: { type: 'spring' as const, stiffness: 420, damping: 36 } }
      : docked
        ? { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 40, opacity: 0 }, transition: { default: { type: 'spring' as const, stiffness: 380, damping: 36 }, opacity: { duration: 0.16 } } }
        : { initial: { opacity: 0, scale: 0.92, y: 16 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 10 }, transition: { default: { type: 'spring' as const, stiffness: 440, damping: 32 }, opacity: { duration: 0.14 } } };

  return (
    <>
      <div className={`asx-buddy${mobile ? ' is-mobile' : ' is-pill'}${open ? ' is-open' : ''}${hidden ? ' is-waiting' : ''}${tip && !open && !hidden ? ' has-tip' : ''}`}>
        <AnimatePresence>
          {tip && !open && !hidden && (
            <motion.span key={arrival} className="asx-buddy-tip lg-glass is-menu" role="status" initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
              {mobile ? <Pointer size={14} aria-hidden="true" /> : <MousePointerClick size={14} aria-hidden="true" />}{tr("แตะผมได้ทุกหน้า")}{!mobile && <kbd>{shortcut}</kbd>}
            </motion.span>
          )}
        </AnimatePresence>
        <motion.button key={`button-${arrival}`} ref={buttonRef} type="button" className="asx-buddy-btn lg-glass" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog"
          aria-label={tr("ถามเลขากระรอกเรื่องหน้า{0}", pageName)} title={tr("ถามเลขากระรอกเรื่องหน้านี้")}
          initial={arrival && !reduce ? { scale: 0.6, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 18 }}>
          <span className="asx-buddy-avatar"><MascotSlot mode={open ? mode : 'awake'} size={mobile ? 46 : 44} /></span>
          {!mobile && <><span className="asx-buddy-label">{tr("ถามเลขากระรอก")}</span><kbd className="asx-buddy-kbd" aria-hidden="true">{shortcut}</kbd></>}
        </motion.button>
      </div>
      {createPortal(
        <AnimatePresence>
          {open && !push && <motion.div key="scrim" className={`asx-pop-scrim asx-buddy-scrim${docked ? ' is-side' : ''}`} aria-hidden="true" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />}
          {open && (
            <motion.div key="panel" className={`asx-pop asx-buddy-panel lg-glass is-menu${mobile ? ' is-sheet' : docked ? ' is-docked' : ''}`} role="dialog" aria-modal={!push}
              aria-label={tr("เลขากระรอก · หน้า{0}", pageName)} style={mobile ? sheetBox : undefined} {...panelMotion}>
              {mobile && <span className="asx-buddy-grabber" aria-hidden="true" />}
              <header className="asx-buddy-head">
                <span className="asx-buddy-face" aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
                <div className="asx-buddy-title">
                  <b>{tr("เลขากระรอก")}</b>
                  <span><i aria-hidden="true" />{tr("กำลังดูหน้า{0}", pageName)}</span>
                </div>
                <button type="button" className="asx-icon-btn" onClick={() => { setOpen(false); onOpenChat(); }} aria-label={tr("เปิดแชตเต็ม")} title={tr("เปิดแชตเต็ม")}><Maximize2 size={17} /></button>
                <button type="button" className="asx-icon-btn" onClick={close} aria-label={tr("ปิด")} title={tr("ปิด")}><X size={18} /></button>
              </header>
              <div ref={listRef} className="asx-buddy-body" role="log" aria-label={tr("บทสนทนากับเลขากระรอก")}>
                {messages.length === 0 ? (
                  <div className="asx-buddy-hello">
                    <span className="asx-buddy-hero" aria-hidden="true"><MascotSlot mode={mode} size={mobile ? 84 : 96} /></span>
                    <h3>{userName ? tr("สวัสดีครับ คุณ{0}", userName) : tr("สวัสดีครับ")}</h3>
                    <p>{tr("อยู่หน้า{0}ใช่ไหมครับ ถามหรือพิมพ์ให้ผมช่วยทำได้เลย", pageName)}</p>
                    <div className="asx-buddy-prompts" role="group" aria-label={tr("คำถามแนะนำ")}>
                      {prompts.map(prompt => {
                        const Icon = PROMPT_ICONS[prompt] ?? Sparkles;
                        return <button key={prompt} type="button" onClick={() => void send(tr(prompt))}><Icon size={16} aria-hidden="true" /><span>{tr(prompt)}</span></button>;
                      })}
                    </div>
                  </div>
                ) : (
                  <ol className="asx-thread is-buddy">
                    {messages.map(message => message.from === 'me' ? (
                      <li key={message.id} className="asx-msg is-me"><div className="asx-me-row"><p className="asx-bubble">{message.text}</p></div></li>
                    ) : (
                      <li key={message.id} className="asx-msg is-bot">
                        <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={26} viewBox="12 8 76 76" /></span>
                        <div className="asx-msg-body">
                          {message.text && <Markdown text={message.text} onNavigate={go} />}
                          {message.cards?.map((card, n) => (
                            <ChatCardView key={n} card={card} confirmState={card.kind === 'confirm' ? confirmStates[card.id] : undefined}
                              onConfirm={item => void confirm(item)} onCancel={item => setConfirmStates(states => ({ ...states, [item.id]: 'cancelled' }))} onNavigate={go} />
                          ))}
                          {(mode === 'done' || mode === 'awake' || mode === 'listening') && <span className="asx-meta">{tr("คำตอบตัวอย่าง")}</span>}
                        </div>
                      </li>
                    ))}
                    {mode === 'thinking' && (
                      <li className="asx-msg is-bot">
                        <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="thinking" animated={false} size={26} viewBox="12 8 76 76" /></span>
                        <div className="asx-typing" role="img" aria-label={tr("เลขากระรอกกำลังคิด")}><i /><i /><i /></div>
                      </li>
                    )}
                  </ol>
                )}
              </div>
              <form className="asx-buddy-composer" onSubmit={event => { event.preventDefault(); void send(draft); }}>
                <label htmlFor="asx-buddy-message" className="asx-sr">{tr("ข้อความถึงเลขากระรอก")}</label>
                <textarea id="asx-buddy-message" ref={inputRef} rows={1} value={draft} placeholder={tr("ถามเรื่องงาน รายรับ กำไร หรือให้ช่วยทำ")}
                  onChange={event => onDraft(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !mobile) { event.preventDefault(); void send(draft); } }} />
                <button type="submit" className="asx-send" disabled={busy || !draft.trim()} aria-label={tr("ส่งข้อความ")} title={tr("ส่งข้อความ")}><ArrowUp size={18} strokeWidth={2.4} /></button>
              </form>
              <p className="asx-hint">{tr("ตัวอย่างหน้าจอ · คำตอบเป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อ AI")}</p>
            </motion.div>
          )}
        </AnimatePresence>, document.body)}
    </>
  );
}
