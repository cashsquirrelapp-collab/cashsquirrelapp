import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ArrowUp, BarChart3, Check, ChevronRight, Clock, FileText, FolderPlus, HelpCircle, ListChecks, Maximize2, Mic, MousePointerClick, Paperclip, Pointer, Sparkles, Wallet, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { tr, T } from '../../i18n/tr';
import { createSampleTransport, tokenLevel, type AssistantTransport } from './assistantApi';
import { TokenRing } from './TokenRing';
import { PAGE_HELP, SAMPLE_TOKENS, afterReply, buddyPrompts, isPendingConfirm, poseFor, type AssistantMode, type ChatMessage, type ConfirmCard, type TokenBalance } from './assistantMock';
import { cardSpeech, climbFor, graphemes, speechPreview, type BuddyNews, type Climb } from './buddyClimb';
import { ChatCardView, type ConfirmState } from './ChatCards';
import { BriefingCard, briefingText } from './BriefingCard';
import { FloatingWindow, MiniMascot, useAvoidZones } from './FloatingChat';
import { MascotPeek } from '../../components/mascot/MascotPeek';
import { useDictation } from './useDictation';
import { prepareFile, type PreparedFile } from './voice';
import { chatTitle, type ChatHandoff } from './chatHandoff';
import { greetingNow, noteQuestion } from './greeting';
import { VoiceComposer } from './VoiceComposer';
import { dateLocale } from '../../utils';
import type { Briefing, BriefingItem } from '../../../../shared/briefing';
import { Markdown } from './Markdown';
import { getCurrentAccount } from '../../services/api';
import { automaticNavigation, safeAssistantPath, type NavigationContext, type NavigationMode } from './assistantNavigation';
import { confirmationCommand } from './assistantCommands';
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
  /** Unused since the floating window (2026-10-26); kept so older callers still type-check. */
  docked?: boolean;
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
  /** Open the full chat page, carrying this conversation when there is one. */
  onOpenChat: (handoff?: ChatHandoff) => void;
  onNavigate: (path: string) => void;
  transport?: AssistantTransport;
  accountId?: string;
  workspaceSlug?: string | null;
  fullFeatureAccess?: boolean;
  /** The app is still checking whether the real เลขา is on: nothing is answered with sample data meanwhile. */
  connecting?: boolean;
  /** Today's briefing (shared/briefing.ts), on computers and iPads only; phones never get one. */
  briefing?: Briefing | null;
};

const EXTRA_PROMPTS = [T("สรุปเดือนนี้"), T("รอรับเงิน"), T("กำลังดำเนินการ"), T("สรุปงานของวันนี้"), T("ตรวจงานที่ยังไม่ได้รับเงิน")];
/** Short buttons that send a whole question, so เลขา and the bubble both read it as one (owner, 2026-10-27: "กำลังดำเนินการ"
 *  means which jobs are in progress, not a status). */
const PROMPT_ASKS: Record<string, string> = { 'กำลังดำเนินการ': T("มีงานไหนที่กำลังดำเนินการอยู่บ้าง"), 'รอรับเงิน': T("มีงานไหนที่ยังรอรับเงินอยู่บ้าง") };
const PROMPT_ICONS: Record<string, typeof HelpCircle> = {
  [PAGE_HELP]: HelpCircle, 'สรุปเดือนนี้': BarChart3, 'รอรับเงิน': Wallet, 'ตรวจงานที่ยังไม่ได้รับเงิน': Wallet, 'กำลังดำเนินการ': Clock,
  'ช่วยเพิ่มงานใหม่ให้หน่อย': FolderPlus, 'สรุปงานของวันนี้': ListChecks, 'ใบเสนอราคาอยู่ตรงไหน': FileText,
};
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// Computers and iPads (owner, 2026-10-26: the climbing squirrel and its comic bubble read as a toy, "ไม่เหมือนพวกนักบัญชี
// ใช้"): the squirrel stays in a round avatar on a plain glass pill, its face shows what it is doing, and what it says
// is a small status card above the pill. Since 2026-10-27 the corner is the squirrel standing and waving, on phones too.
const FACE = 36;
/** The tail of the standing squirrel's speech bubbles: it fills the bubble's lower right corner and curls out toward
 *  the squirrel, so bubble and tail are one shape under one shadow (assistant.css .asx-say-tail). */
const sayTail = <svg className="asx-say-tail" viewBox="0 0 28 22" aria-hidden="true"><path d="M0 4H10C10.8 12 16 18 28 22C19 22.6 9.6 21 2 18H0Z" /></svg>;
/** The standing squirrel at the corner (computers and iPads, 2026-10-27). */
const STAND = 96;
const STAND_PHONE = 72;

/** The squirrel's words, typed out letter by letter (whole Thai letters). An answer still arriving keeps typing on
 *  from where it was; new words start again. The finished text sizes the bubble from the start, so it does not
 *  jump while it types, and screen readers get the finished words once instead of every letter. */
function TypedWords({ text, instant, quiet }: { text: string; instant: boolean; quiet: boolean }) {
  const letters = React.useMemo(() => graphemes(text), [text]);
  const [count, setCount] = React.useState(instant ? letters.length : 0);
  const before = React.useRef(letters);
  React.useEffect(() => {
    if (instant) { setCount(letters.length); return; }
    // Keep what still matches (the answer grew, or its preview was cut back to a whole word), type on from there.
    let same = 0;
    while (same < before.current.length && same < letters.length && before.current[same] === letters[same]) same++;
    before.current = letters;
    setCount(c => Math.min(c, same));
  }, [letters, instant]);
  // One letter at a time, and nothing left running once the words are all there.
  React.useEffect(() => {
    if (instant || count >= letters.length) return;
    const t = window.setTimeout(() => setCount(c => Math.min(letters.length, c + 1)), 28);
    return () => window.clearTimeout(t);
  }, [count, letters, instant]);
  return (
    <span className="asx-climb-text">
      <span className="asx-climb-ghost" aria-hidden="true">{text}</span>
      <span className="asx-climb-typed" aria-hidden="true">{letters.slice(0, count).join('')}</span>
      <span className="asx-sr">{quiet ? '' : text}</span>
    </span>
  );
}

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

// Which briefing items were already said today, per account on this device (a convenience: lost storage only means
// the squirrel says it once more).
const briefingStore = (accountId?: string) => `krarok.briefing.seen.${accountId || 'guest'}`;
function briefingSeen(accountId: string | undefined, day: string): Record<string, string> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(briefingStore(accountId)) || '{}') as Record<string, string>;
    return Object.fromEntries(Object.entries(saved).filter(([, seen]) => seen === day));
  } catch { return {}; }
}
function markBriefingSeen(accountId: string | undefined, day: string, key: string) {
  try { window.localStorage.setItem(briefingStore(accountId), JSON.stringify({ ...briefingSeen(accountId, day), [key]: day })); } catch { /* private mode */ }
}

export default function AssistantBuddy({ mobile, page, pageName, userName, hidden = false, arrival = 0, onPanelChange, onOpenChat, onNavigate, transport: given, accountId, workspaceSlug, fullFeatureAccess, connecting = false, briefing }: Props) {
  const reduce = useReducedMotion();
  const transport = React.useMemo(() => given ?? createSampleTransport({ failSends: () => false, failActions: () => false, tokens: () => SAMPLE_TOKENS, instant: Boolean(reduce) }), [given, reduce]);
  const live = Boolean(transport.live);
  const waiting = connecting && !live;
  const navigationContext: NavigationContext = { accountId, workspaceSlug, fullFeatureAccess };
  // Pages open only when the user taps เลขา's button (owner, 2026-10-26: the "เปิดหน้าที่เกี่ยวข้อง" choice is removed, so
  // nobody is moved to another page by itself, including accounts that had chosen "พาไปอัตโนมัติ" before).
  const navigationMode: NavigationMode = 'manual';
  const scopeRef = React.useRef({ accountId, transport, navigationMode, navigationContext });
  scopeRef.current = { accountId, transport, navigationMode, navigationContext };
  const [open, setOpen] = React.useState(false);
  const openRef = React.useRef(open); openRef.current = open;
  // Computers and iPads: the window folded into the squirrel (brief "FLOATING TOP MASCOT CHAT UI V2"). The chat and its
  // work stay as they were. `autoFolded` marks a fold made by the chat itself to clear a document preview.
  const [minimized, setMinimized] = React.useState(false);
  const autoFolded = React.useRef(false);
  const windowRef = React.useRef<HTMLDivElement>(null);
  const miniRef = React.useRef<HTMLButtonElement>(null);
  const zones = useAvoidZones(!mobile && (open || minimized), [windowRef]);
  // Speaking instead of typing in the window (owner, 2026-10-27: "ปุ่มไมค์อ่ะที่เอาไว้พูดมันอยู่ไหน"), the same dictation as the
  // full chat: recorded on the device, transcribed once on stop, and left as a draft to check before sending.
  const voice = useDictation({
    transport, language: dateLocale(),
    onText: text => {
      setDraft(text);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.style.height = 'auto'; el.style.height = `${Math.min(120, el.scrollHeight)}px`; el.setSelectionRange(text.length, text.length); }
      });
    },
    onCharged: () => {},
  });
  const voiceRef = React.useRef(voice); voiceRef.current = voice;
  React.useEffect(() => { if (!open && voiceRef.current.active) voiceRef.current.cancel(); }, [open]);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  // Krarok Tokens left, in the window's corner for everyone (owner, 2026-10-27: "จำนวนโทเค็นอะให้ทุกคนเห็นด้วย ... เป็นยอด
  // แบบโทเค็นวงกลม"), read when the window opens and after each answer.
  const [balance, setBalance] = React.useState<TokenBalance | null>(null);
  // The id the account's history keeps this chat under (live เลขา), given with the first message, so the chat asked
  // here is the same chat in the full chat page and its history (owner, 2026-10-27).
  const conversationRef = React.useRef<string | null>(null);
  const [mode, setMode] = React.useState<AssistantMode>('awake');
  const [draft, setDraft] = React.useState('');
  const [confirmStates, setConfirmStates] = React.useState<Record<string, ConfirmState>>({});
  const [confirmedPaths, setConfirmedPaths] = React.useState<Record<string, string>>({});
  const confirmControllers = React.useRef(new Set<AbortController>());
  const [tip, setTip] = React.useState(false);
  // Something that happened while the chat was closed (an answer, a save, a failure), until the chat is opened.
  const [news, setNews] = React.useState<BuddyNews>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  // A picture or PDF to send with the next message (owner, 2026-10-27: phones had no mic and no way to add a picture),
  // the same as the full chat: live เลขา only, prepared on the device (voice.ts prepareFile) and sent once.
  const [upload, setUpload] = React.useState<PreparedFile | null>(null);
  const [fileProblem, setFileProblem] = React.useState<'type' | 'size' | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const nextId = React.useRef(0);
  const sheetBox = useSheetBox(open && mobile);
  const busy = mode === 'thinking' || mode === 'working';
  const prompts = Array.from(new Set([...buddyPrompts(page), ...EXTRA_PROMPTS])).slice(0, 6);
  const shortcut = isMac() ? '⌘K' : 'Ctrl K';

  React.useEffect(() => { onPanelChange?.(open); }, [open, onPanelChange]);
  React.useEffect(() => () => onPanelChange?.(false), [onPanelChange]);
  const close = React.useCallback(() => { setOpen(false); setMinimized(false); autoFolded.current = false; window.setTimeout(() => buttonRef.current?.focus(), 0); }, []);
  const minimize = React.useCallback((auto?: boolean) => {
    autoFolded.current = Boolean(auto);
    setOpen(false); setMinimized(true);
    if (!auto) window.setTimeout(() => miniRef.current?.focus(), 0);
  }, []);
  const restore = React.useCallback(() => { autoFolded.current = false; setMinimized(false); setOpen(true); }, []);
  // Folded by itself for a preview: back as it was once the preview has closed.
  React.useEffect(() => { if (minimized && autoFolded.current && !zones.key) restore(); }, [minimized, zones.key, restore]);
  // ⌘K / Ctrl+K opens it from any page, as the search-or-ask box does in the reference. On computers the window does not
  // hold the page, so Escape closes it only from inside it.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); if (minimized) restore(); else setOpen(value => !value); }
      else if (event.key === 'Escape' && open) {
        // From inside the window, or when nothing else has the keyboard and no dialog or menu is open over the page.
        const active = document.activeElement;
        const idle = !active || active === document.body;
        if (mobile || windowRef.current?.contains(active) || (idle && !document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]'))) close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, minimized, mobile, close, restore]);
  React.useEffect(() => { if (open && !mobile) window.setTimeout(() => inputRef.current?.focus(), 80); }, [open, mobile]);
  const answers = messages.filter(message => message.from === 'bot').length;
  React.useEffect(() => {
    if (!open) return;
    let current = true;
    transport.balance().then(value => { if (current) setBalance(value); }).catch(() => {});
    return () => { current = false; };
  }, [open, mobile, transport, answers]);
  React.useEffect(() => () => { abortRef.current?.abort(); for (const c of confirmControllers.current) c.abort(); }, [transport, accountId]);
  // Just arrived from its birth: say where it lives for a moment.
  React.useEffect(() => {
    if (!arrival) return;
    setTip(true);
    const t = window.setTimeout(() => setTip(false), 4800);
    return () => window.clearTimeout(t);
  }, [arrival]);
  React.useEffect(() => { if (open) setTip(false); }, [open]);
  // Opening the chat shows what happened, so the squirrel has nothing left to tell; a save is told for a moment only.
  React.useEffect(() => { if (open) setNews(null); }, [open]);
  React.useEffect(() => {
    if (news !== 'done') return;
    const t = window.setTimeout(() => setNews(n => (n === 'done' ? null : n)), 3200);
    return () => window.clearTimeout(t);
  }, [news]);
  // The squirrel says the day's most important thing once (pkg77): one note a day, 6 seconds, never
  // while the user types or fills in a form, never over the arrival note, never on phones.
  const [briefTip, setBriefTip] = React.useState<BriefingItem | null>(null);
  // The status card (computers and iPads; phones keep their round button as it is). A card counts as waiting
  // only in the latest answer: once the user has asked something else, an older card no longer calls them back.
  const lastBot = [...messages].reverse().find(message => message.from === 'bot');
  const pending = Boolean(lastBot?.cards?.some(card => card.kind === 'confirm' && isPendingConfirm(card, confirmStates[card.id])));
  // What the squirrel says of the latest answer: its own first words, as one plain short sentence (or, for an answer
  // that is only a card, what the card says).
  const reply = React.useMemo(() => speechPreview(lastBot?.text || '') || speechPreview(cardSpeech(lastBot?.cards)), [lastBot?.text, lastBot?.cards]);
  const climb: Climb | null = mobile || open || hidden ? null : climbFor({ mode, pending, news, hover: false, reply });
  const telling = Boolean(climb && climb.kind !== 'hello');
  // One note a day; later the same day only something new and critical (a newly overdue payment) speaks up again.
  const briefSeen = mobile || !briefing ? {} : briefingSeen(accountId, briefing.day);
  const briefNext = mobile || !briefing ? undefined
    : briefing.items.find(item => !briefSeen[item.key] && (!Object.keys(briefSeen).length || item.tone === 'critical'));
  React.useEffect(() => {
    if (!briefNext || !briefing || open || hidden || tip || telling) return;
    const show = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)) return;
      markBriefingSeen(accountId, briefing.day, briefNext.key);
      setBriefTip(briefNext);
    }, 1500);
    return () => window.clearTimeout(show);
  }, [briefNext?.key, briefing?.day, open, hidden, tip, telling, accountId]);
  React.useEffect(() => {
    if (!briefTip) return;
    const hide = window.setTimeout(() => setBriefTip(null), 6000);
    return () => window.clearTimeout(hide);
  }, [briefTip]);
  React.useEffect(() => { if (open || hidden) setBriefTip(null); }, [open, hidden]);
  // Follow the conversation as it grows. Before anything is asked, computers and iPads open at the top, so the greeting
  // card is whole under the header (phones keep their sheet as it was).
  React.useLayoutEffect(() => { const list = listRef.current; if (list) list.scrollTop = messages.length || mobile ? list.scrollHeight : 0; }, [messages, mode, open, mobile]);

  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++nextId.current}`;
  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileProblem(null);
    try { setUpload(await prepareFile(file)); inputRef.current?.focus(); }
    catch (error) { setUpload(null); setFileProblem((error as Error).message === 'size' ? 'size' : 'type'); }
  };
  /** `withFile`: the composer's own send, which carries the attached picture or PDF; suggested questions never do. */
  const send = async (raw: string, withFile = false) => {
    const file = withFile && live ? upload ?? undefined : undefined;
    const text = raw.trim() || (file ? tr("ช่วยดูไฟล์นี้หน่อย") : '');
    if (!text || busy || waiting) return;
    const command = file ? null : confirmationCommand(text, messages, confirmStates);
    if (command) {
      if (accountId && getCurrentAccount() !== accountId) return;
      setDraft('');
      if (inputRef.current) inputRef.current.style.height = '';
      setMessages(list => [...list, { id: id('me'), from: 'me', text, at: Date.now() }, ...(command.ambiguous ? [{ id: id('bot'), from: 'bot' as const, text: tr('มีหลายรายการที่รอยืนยัน กรุณากดปุ่มของรายการที่ต้องการก่อนครับ'), at: Date.now() }] : [])]);
      if (command.card) {
        if (command.action === 'confirm') await confirm(command.card);
        else { setConfirmStates(states => ({ ...states, [command.card!.id]: 'cancelled' })); await transport.cancel?.(command.card); }
      }
      return;
    }
    const mine: ChatMessage = { id: id('me'), from: 'me', text, at: Date.now(), ...(file && !raw.trim() ? { textAuto: true } : {}),
      ...(file ? { attachment: { name: file.name, kind: file.kind, ...(file.kind === 'image' ? { preview: `data:${file.mimeType};base64,${file.data}` } : {}) } } : {}) };
    const history = [...messages, mine];
    noteQuestion(accountId, text);
    if (!conversationRef.current) conversationRef.current = live && typeof crypto?.randomUUID === 'function' ? `c_${crypto.randomUUID()}` : 'buddy';
    const conversationId = conversationRef.current;
    setMessages(history);
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = '';
    if (file) { setUpload(null); setFileProblem(null); }
    voice.clearReview();
    setMode('thinking');
    const controller = new AbortController();
    abortRef.current = controller;
    const botId = id('bot');
    let started = false;
    let responseCards: ChatMessage['cards'];
    const isCurrent = () => !controller.signal.aborted && scopeRef.current.accountId === accountId && scopeRef.current.transport === transport;
    try {
      const result = await transport.send({ conversationId, text, history, context: { page, pageName }, ...(file ? { attachment: { name: file.name, mimeType: file.mimeType, data: file.data } } : {}) }, textSoFar => {
        if (!isCurrent()) return;
        if (!started) { started = true; setMode('working'); setMessages(list => [...list, { id: botId, from: 'bot' as const, text: textSoFar, cards: responseCards, at: Date.now() }]); }
        else setMessages(list => list.map(message => (message.id === botId ? { ...message, text: textSoFar } : message)));
      }, controller.signal, cards => {
        if (!isCurrent()) return;
        responseCards = cards;
        const state = scopeRef.current;
        const path = automaticNavigation(cards, state.navigationContext, state.navigationMode, getCurrentAccount());
        if (path && openRef.current) onNavigate(path);
      });
      if (!isCurrent()) return;
      setMessages(list => (started ? list : [...list, { id: botId, from: 'bot' as const, text: '', at: Date.now() }]).map(message => (message.id === botId ? { ...message, text: result.text, cards: result.cards, ...(result.memo ? { memo: result.memo } : {}) } : message)));
      // An answer is not a job done: a card still waiting for a yes keeps the squirrel waiting with it.
      const next = afterReply(result.cards);
      setMode(next);
      if (next === 'answered') window.setTimeout(() => setMode(m => (m === 'answered' ? 'awake' : m)), 1600);
      if (!openRef.current) setNews('answered');
    } catch {
      if (controller.signal.aborted) return;
      setMessages(list => [...list.filter(message => message.id !== botId), { id: botId, from: 'bot' as const, text: tr("ส่งไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"), at: Date.now() }]);
      setMode('awake');
      if (!openRef.current) setNews('failed');
    }
  };
  // The same แก้ไข on a card as in the full chat (owner, 2026-10-25: "อยากให้กดแก้ไขได้" in this panel too).
  const revise = async (card: ConfirmCard, edits: Record<string, string>) => {
    const next = await transport.revise!(card, edits);
    if (scopeRef.current.accountId !== accountId || scopeRef.current.transport !== transport) return;
    setMessages(list => list.map(message => (message.cards?.some(item => item.kind === 'confirm' && item.id === card.id)
      ? { ...message, cards: message.cards!.map(item => (item.kind === 'confirm' && item.id === card.id ? next : item)) } : message)));
  };
  const confirm = async (card: ConfirmCard) => {
    if (confirmStates[card.id] === 'working' || confirmStates[card.id] === 'done') return;
    const controller = new AbortController(); confirmControllers.current.add(controller);
    setConfirmStates(states => ({ ...states, [card.id]: 'working' }));
    try {
      const result = await transport.confirm(card, controller.signal);
      if (controller.signal.aborted || scopeRef.current.accountId !== accountId || scopeRef.current.transport !== transport) return;
      setConfirmStates(states => ({ ...states, [card.id]: result.ok ? 'done' : 'failed' }));
      // The proud squirrel only after the server says it saved.
      if (result.ok) { setMode('done'); window.setTimeout(() => setMode(m => (m === 'done' ? 'awake' : m)), 1600); }
      if (!openRef.current) setNews(result.ok ? 'done' : 'failed');
      const state = scopeRef.current;
      const path = result.ok ? safeAssistantPath(result.path, state.navigationContext) : null;
      if (path) {
        setConfirmedPaths(paths => ({ ...paths, [card.id]: path }));
        const autoPath = automaticNavigation([{ kind: 'navigation', label: 'เอกสาร', path, autoOpen: true }], state.navigationContext, state.navigationMode, getCurrentAccount());
        if (autoPath && openRef.current) onNavigate(autoPath);
      }
    } catch {
      if (controller.signal.aborted) return;
      setConfirmStates(states => ({ ...states, [card.id]: 'failed' }));
      if (!openRef.current) setNews('failed');
    }
    finally { confirmControllers.current.delete(controller); }
  };
  const onDraft = (value: string) => {
    setDraft(value);
    if (!busy) setMode(value.trim() ? 'listening' : 'awake');
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(120, el.scrollHeight)}px`; }
  };
  const go = (path: string) => {
    if (accountId && getCurrentAccount() !== accountId) return;
    const safe = safeAssistantPath(path, navigationContext, true); if (safe) onNavigate(safe);
  };

  // The face in the pill's avatar: what the status card says (thinking, waiting for a yes, saved, failed), or what
  // the chat is doing while it is open.
  const faceMood = climb?.mood ?? poseFor(open ? mode : 'awake').mood;
  // The standing squirrel (computers): a wave while nothing is going on, else the status card's face.
  const standMood = climb?.mood ?? (mobile && busy ? 'thinking' : 'wave');
  // Its hello, in a bubble beside it now and then while nothing else is said (owner: "มีอะไรให้ช่วยไหมครับ" and only
  // "กดที่ผม" under it, no shortcut).
  const sayHello = !climb && !busy && !open && !minimized && !hidden && !tip && !briefTip;

  const panelMotion = reduce
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : mobile
      ? { initial: { y: 40, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 40, opacity: 0 }, transition: { type: 'spring' as const, stiffness: 420, damping: 36 } }
      : { initial: { opacity: 0, scale: 0.92, y: 16 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 10 }, transition: { default: { type: 'spring' as const, stiffness: 440, damping: 32 }, opacity: { duration: 0.14 } } };

  const pillButton = (
        <motion.button ref={buttonRef} type="button" className="asx-buddy-btn is-stand" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog"
          aria-label={tr("ถามเลขากระรอกเรื่องหน้า{0}", pageName)} title={climb ? undefined : tr("ถามเลขากระรอกเรื่องหน้านี้")}
          initial={false}>
          {/* Owner, 2026-10-27: version 2 ("ชอบแบบที่สอง"), then "ทำในมือถือด้วยเลย": the squirrel standing at the corner, waving
              while nothing is going on, its face showing what the chat is doing otherwise; smaller on phones. */}
          <span className="asx-buddy-stand" data-mood={standMood}><Mascot thoughtDots={false} mood={standMood} action={standMood === 'wave' ? 'wave' : 'idle'} animated={!reduce} size={mobile ? STAND_PHONE : STAND} /></span>
        </motion.button>
  );

  // The window's expand button (and the phone sheet's เปิดแชตเต็ม) opens the full chat page with this conversation, as
  // it stands, cards and draft included. Not while an answer or a save is on its way: it would be cut off.
  const expandWaits = busy || Object.values(confirmStates).includes('working');
  const expand = () => {
    if (expandWaits) return;
    const first = messages.find(message => message.from === 'me');
    const chat: ChatHandoff['chat'] = messages.length ? {
      id: live && conversationRef.current ? conversationRef.current : id('chat'), title: first ? chatTitle(first.text) : tr("แชตใหม่"),
      messages, confirmStates, confirmedPaths,
    } : undefined;
    const handoff: ChatHandoff | undefined = chat || draft.trim() ? { ...(chat ? { chat } : {}), ...(draft.trim() ? { draft } : {}) } : undefined;
    setOpen(false); setMinimized(false); autoFolded.current = false;
    onOpenChat(handoff);
  };

  const level = balance ? tokenLevel(balance) : 'ok';
  const tokenCorner = balance && (
    <span className={`kfw-token is-${level}`} role="img" title={tr("Krarok Tokens")}
      aria-label={live ? tr("Krarok Tokens คงเหลือ {0} จาก {1}", balance.remaining, balance.total) : tr("Krarok Tokens คงเหลือ {0} จาก {1} (ข้อมูลตัวอย่าง)", balance.remaining, balance.total)}>
      <TokenRing share={balance.total ? balance.remaining / balance.total : 0} size={18} stroke={2.6} level={level} />
      <span>{balance.remaining.toLocaleString(dateLocale())}</span>
    </span>
  );
  // The time of day and a question about what this person does most, worked out again each time the chat opens, instead of
  // "สวัสดีครับ คุณ…" every time (owner, 2026-10-27); phones too since "ทำในมือถือด้วยนะ".
  const hello = React.useMemo(() => greetingNow(accountId, page), [accountId, page, open]); // eslint-disable-line react-hooks/exhaustive-deps
  // The conversation and the composer: in the phone sheet, or in the floating window on computers and iPads.
  const contents = (
    <>
              <div ref={listRef} className="asx-buddy-body" role="log" aria-label={tr("บทสนทนากับเลขากระรอก")}>
                {messages.length === 0 ? (
                  <div className="asx-buddy-hello">
                    {/* The same start as the full chat (owner, 2026-10-27: "ทำเป็นชุดใหม่ทั้งหมด"; phones too), a plain title and
                        line, then the questions as one grouped list. */}
                    <div className={`kfw-welcome${mobile ? ' is-phone' : ''}`}><h3>{tr(hello.title)}</h3><p>{tr(hello.line)}</p></div>
                    {!mobile && briefing && briefing.items.length > 0 && (
                      <BriefingCard briefing={briefing} onOpen={path => { setOpen(false); onNavigate(path); }} />
                    )}
                    <h4 className="kfw-section" aria-hidden="true">{tr("คำถามแนะนำ")}</h4>
                    <div className="asx-buddy-prompts" role="group" aria-label={tr("คำถามแนะนำ")}>
                      {prompts.map(prompt => {
                        const Icon = PROMPT_ICONS[prompt] ?? Sparkles;
                        return <button key={prompt} type="button" onClick={() => { void send(tr(PROMPT_ASKS[prompt] ?? prompt)); if (!mobile) inputRef.current?.focus(); }}><span className="kfw-tile" aria-hidden="true"><Icon size={16} /></span><span>{tr(prompt)}</span><ChevronRight className="asx-buddy-go" size={17} aria-hidden="true" /></button>;
                      })}
                    </div>
                  </div>
                ) : (
                  <ol className="asx-thread is-buddy">
                    {messages.map((message, index) => message.from === 'me' ? (
                      <li key={message.id} className="asx-msg is-me"><div className="asx-me-row"><div className="asx-me-stack">
                        {message.attachment?.preview ? (
                          <span className="asx-sent-image is-still"><img src={message.attachment.preview} alt={tr("รูปที่แนบ")} /></span>
                        ) : message.attachment && (
                          <div className="asx-sent-file"><span className="asx-file-icon" aria-hidden="true"><FileText size={18} /></span>
                            <span className="asx-file-text"><b>{message.attachment.name}</b><small>{message.attachment.kind === 'pdf' ? 'PDF' : tr("รูป")}</small></span></div>
                        )}
                        {!message.textAuto && <p className="asx-bubble">{message.text}</p>}
                      </div></div></li>
                    ) : (
                      <li key={message.id} className="asx-msg is-bot">
                        <span className="asx-avatar" aria-hidden="true"><Mascot gear={mobile ? 'pro' : 'none'} mood="happy" animated={false} size={26} viewBox="12 8 76 76" /></span>
                        <div className="asx-msg-body">
                          {message.text && <Markdown text={message.text} onNavigate={go} navigationContext={navigationContext} cards={message.cards} />}
                          {message.cards?.map((card, n) => (
                            <ChatCardView key={n} live={live} card={card} confirmState={card.kind === 'confirm' ? confirmStates[card.id] : undefined} confirmedPath={card.kind === 'confirm' ? confirmedPaths[card.id] : undefined}
                              onConfirm={item => void confirm(item)} onCancel={item => { setConfirmStates(states => ({ ...states, [item.id]: 'cancelled' })); void transport.cancel?.(item); }} onNavigate={go}
                              onAnswer={text => void send(text)} answered={messages.slice(index + 1).some(later => later.from === 'me') || busy}
                              onAsk={text => void send(text)}
                              onRevise={transport.revise ? (item, edits) => revise(item, edits) : undefined} />
                          ))}
                          {!live && (mode === 'done' || mode === 'awake' || mode === 'listening') && <span className="asx-meta">{tr("คำตอบตัวอย่าง")}</span>}
                        </div>
                      </li>
                    ))}
                    {mode === 'thinking' && (
                      <li className="asx-msg is-bot">
                        <span className="asx-avatar" aria-hidden="true"><Mascot gear={mobile ? 'pro' : 'none'} thoughtDots={mobile} mood="thinking" animated={false} size={26} viewBox="12 8 76 76" /></span>
                        <div className="asx-typing" role="img" aria-label={tr("เลขากระรอกกำลังคิด")}><i /><i /><i /></div>
                      </li>
                    )}
                  </ol>
                )}
              </div>
              {(voice.error || fileProblem) && !voice.active && (
                <p className="asx-notice is-low kfw-voice-note" role="alert"><AlertCircle size={15} />
                  {fileProblem === 'size' ? tr("ไฟล์ใหญ่เกิน 4 MB กรุณาเลือกไฟล์ที่เล็กลง") : fileProblem === 'type' ? tr("แนบได้เฉพาะรูป (JPG, PNG, WEBP) หรือไฟล์ PDF") : voice.error}
                  <button type="button" className="asx-link-btn" onClick={() => { setFileProblem(null); voice.clearError(); }}>{tr("ปิด")}</button>
                </p>
              )}
              {voice.review && !voice.active && <p className="asx-notice asx-voice-review kfw-voice-note" role="status"><Check size={14} />{tr("ถอดเสียงแล้ว ตรวจแก้ก่อนกดส่ง")}</p>}
              {upload && !voice.active && (
                <div className="asx-attach-row kfw-attach-row">
                  {upload.kind === 'image' ? (
                    <div className="asx-attach-tile" role="group" aria-label={tr("รูปที่จะส่ง")}>
                      <img src={`data:${upload.mimeType};base64,${upload.data}`} alt={tr("รูปที่จะส่ง")} />
                      <button type="button" className="asx-attach-remove" onClick={() => setUpload(null)} aria-label={tr("เอารูปออก")} title={tr("เอารูปออก")}><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="asx-attach-file" role="group" aria-label={tr("ไฟล์ที่จะส่ง")}>
                      <span className="asx-file-icon" aria-hidden="true"><FileText size={18} /></span>
                      <span className="asx-file-text"><b>{upload.name}</b><small>PDF · {upload.bytes >= 1048576 ? `${(upload.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(upload.bytes / 1024))} KB`}</small></span>
                      <button type="button" className="asx-attach-remove" onClick={() => setUpload(null)} aria-label={tr("เอาไฟล์ออก")} title={tr("เอาไฟล์ออก")}><X size={14} /></button>
                    </div>
                  )}
                </div>
              )}
              <form className={`asx-buddy-composer${voice.active ? ' has-voice' : ''}`} onSubmit={event => { event.preventDefault(); void send(draft, true); }}>
                {voice.active ? (
                  <VoiceComposer phase={voice.phase} seconds={voice.seconds} levels={voice.levels} levelsAt={voice.levelsAt} reduce={Boolean(reduce)}
                    onCancel={() => { voice.cancel(); requestAnimationFrame(() => inputRef.current?.focus()); }} onFinish={() => { void voice.finish(); }} />
                ) : <>
                {/* Attach a picture or PDF (2026-10-27, phones and computers alike), as in the full chat. */}
                {live ? (
                  <>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" className="asx-sr" tabIndex={-1} aria-hidden="true"
                      onChange={event => { void pickFile(event.target.files?.[0]); event.target.value = ''; }} />
                    <button type="button" className="asx-icon-btn asx-attach" onClick={() => fileRef.current?.click()} disabled={busy}
                      aria-label={tr("แนบรูปหรือไฟล์ PDF")} title={tr("แนบรูปหรือไฟล์ PDF")}><Paperclip size={18} /></button>
                  </>
                ) : (
                  <button type="button" className="asx-icon-btn asx-attach is-soon" aria-disabled="true" aria-label={tr("แนบไฟล์ · เร็ว ๆ นี้")} title={tr("แนบไฟล์ · เร็ว ๆ นี้")}><Paperclip size={18} /></button>
                )}
                <label htmlFor="asx-buddy-message" className="asx-sr">{tr("ข้อความถึงเลขากระรอก")}</label>
                <textarea id="asx-buddy-message" ref={inputRef} rows={1} value={draft} placeholder={tr("ถามเลขากระรอกได้เลย")}
                  onChange={event => onDraft(event.target.value)}
                  onPaste={event => { const pasted = event.clipboardData?.files?.[0]; if (pasted && live && !busy) { event.preventDefault(); void pickFile(pasted); } }}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !mobile) { event.preventDefault(); void send(draft, true); } }} />
                {voice.supported ? (
                  <button type="button" className="asx-icon-btn asx-mic" onClick={() => { if (!busy && !voice.active) void voice.start(draft); }} disabled={busy}
                    aria-label={tr("พูดแทนการพิมพ์")} title={tr("อัดเสียงแล้วถอดเป็นข้อความ · ใช้โทเค็น")}><Mic size={18} /></button>
                ) : (
                  <button type="button" className="asx-icon-btn asx-mic is-soon" aria-disabled="true" aria-label={transport.transcribe ? tr("เบราว์เซอร์นี้ยังพูดแทนการพิมพ์ไม่ได้") : tr("ใช้เสียงได้เมื่อเชื่อมต่อเลขา AI")}
                    title={transport.transcribe ? tr("เบราว์เซอร์นี้ยังพูดแทนการพิมพ์ไม่ได้") : tr("ใช้เสียงได้เมื่อเชื่อมต่อเลขา AI")}><Mic size={18} /></button>
                )}
                <button type="submit" className="asx-send" disabled={busy || waiting || (!draft.trim() && !(live && upload))} aria-label={tr("ส่งข้อความ")} title={tr("ส่งข้อความ")}><ArrowUp size={18} strokeWidth={2.4} /></button>
                </>}
              </form>
              <p className="asx-hint">{voice.active ? (voice.phase === 'transcribing' ? tr("ถอดข้อความเสร็จแล้วตรวจแก้ได้ก่อนส่ง") : tr("หยุดแล้วถอดข้อความ · ใช้โทเค็น · สูงสุด 2 นาที")) : live ? tr("เลขากระรอกตอบผิดได้ ตรวจสอบก่อนกดยืนยันทุกครั้ง") : waiting ? tr("กำลังเชื่อมต่อเลขา AI…") : tr("ตัวอย่างหน้าจอ · คำตอบเป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อ AI")}</p>
    </>
  );

  return (
    <>
      <div className={`asx-buddy is-stand${mobile ? ' is-mobile' : ' is-pill'}${open ? ' is-open' : ''}${minimized ? ' is-min' : ''}${hidden ? ' is-waiting' : ''}${(tip || briefTip) && !open && !hidden && !telling ? ' has-tip' : ''}${climb ? ' is-climbing' : ''}`}>
        <AnimatePresence>
          {tip && !open && !hidden && !telling && (
            // After the arrival the tip comes in softly, once the pill has opened out (owner: "ค่อย ๆ ทรานซิชั่นดี ๆ").
            <motion.span key={arrival} className="asx-buddy-tip lg-glass is-menu" role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: 4, transition: { duration: 0.3 } }}
              transition={{ duration: reduce ? 0.2 : 0.55, delay: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}>
              {mobile ? <Pointer size={14} aria-hidden="true" /> : <MousePointerClick size={14} aria-hidden="true" />}{tr("แตะผมได้ทุกหน้า")}{!mobile && <kbd>{shortcut}</kbd>}
            </motion.span>
          )}
          {briefTip && !tip && !open && !hidden && !telling && (
            <motion.div key={briefTip.key} className="asx-brief-tip lg-glass is-menu" role="status"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4, transition: { duration: 0.25 } }}
              transition={{ duration: reduce ? 0.2 : 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <button type="button" className="asx-brief-tip-main" onClick={() => { setBriefTip(null); setOpen(true); }}>
                <b>{briefingText(briefTip).title}</b><span>{tr("กดเพื่อดูสรุปวันนี้")}</span>
              </button>
              <button type="button" className="asx-brief-tip-x" onClick={() => setBriefTip(null)} aria-label={tr("ปิด")}><X size={15} aria-hidden="true" /></button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* While the arrival plays, the pill waits as a round bubble just big enough for the squirrel, which is where
            the flying squirrel lands. Then it opens out to the side ("ถามเลขากระรอก ⌘K"), so the hand-over is one
            continuous movement instead of a pop. Phones keep the round button, so nothing changes there. */}
        {/* The standing squirrel, with its bubble at its left (the hello, or the status card on computers and iPads). */}
        <span className="asx-buddy-anchor">
        {/* The status card above the pill; tapping it opens the chat like the pill. It is read out as a status, like the
            notes above the pill. */}
          <AnimatePresence mode="wait">
            {climb && (
              <motion.span key={climb.said ? 'said' : climb.kind} className={`asx-climb-say lg-glass is-menu${climb.said ? ' is-said' : ''}`} {...(climb.kind === 'hello' ? { 'aria-hidden': true } : { role: 'status' })} data-kind={climb.kind} onClick={() => setOpen(true)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : 3, transition: { duration: 0.14 } }}
                transition={{ duration: reduce ? 0.15 : 0.26, ease: [0.22, 1, 0.36, 1] }}>
                <TypedWords text={climb.said ? climb.words : tr(climb.words)} instant={Boolean(reduce)} quiet={climb.kind === 'working'} />
                {sayTail}
                {climb.dots && <span className="asx-climb-dots" aria-hidden="true"><i /><i /><i /></span>}
              </motion.span>
            )}
          </AnimatePresence>
          {sayHello && (
            // A speech bubble out of the squirrel (owner, 2026-10-27: "กล่องข้อความโค้ง ๆ ออกมาจากตัวน้อง ... ให้คลิกเพื่อใช้งาน
            // น้อง"): its tail curls toward it, and pressing it opens เลขา as the squirrel does. Computers and iPads keep it
            // up while nothing else is said; phones show it now and then, as it covers the page there.
            <span className="asx-hello-say" aria-hidden="true" onClick={() => setOpen(true)}>
              {tr("มีอะไรให้ช่วยไหมครับ")}<small>{tr("กดที่ผม")}</small>{sayTail}
            </span>
          )}
          {pillButton}
        </span>
      </div>
      {createPortal(
        <AnimatePresence>
          {open && mobile && <motion.div key="scrim" className="asx-pop-scrim asx-buddy-scrim" aria-hidden="true" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />}
          {open && mobile && (
            <motion.div key="panel" className="asx-pop asx-buddy-panel lg-glass is-menu is-sheet" role="dialog" aria-modal
              aria-label={tr("เลขากระรอก · หน้า{0}", pageName)} style={sheetBox} {...panelMotion}>
              <span className="asx-buddy-grabber" aria-hidden="true" />
              {/* Phones (owner, 2026-10-27: "ทำในมือถือด้วยนะ"): the window's set in the sheet: Krarok Tokens at the left, the
                  perched squirrel with its calm motion and its name in the middle, the buttons at the right. */}
              <header className="asx-buddy-head is-perched">
                <div className="asx-sheet-side">{tokenCorner}</div>
                <span className="asx-perch is-sheet" aria-hidden="true" data-mood={poseFor(mode).mood}>
                  <span className="asx-perch-box"><MascotPeek size={72} mood={poseFor(mode).mood} motion={reduce ? 'still' : 'calm'} holo={busy} thoughtDots={false} className="asx-perch-art" /></span>
                  <span className="asx-perch-name">{tr("เลขากระรอก")}</span>
                </span>
                <span className="asx-sr">{tr("กำลังดูหน้า{0}", pageName)}</span>
                <div className="asx-sheet-side is-end">
                <button type="button" className="asx-icon-btn" onClick={expand} aria-disabled={expandWaits || undefined} aria-label={tr("เปิดแชตเต็ม")} title={expandWaits ? tr("เปิดแชตเต็มได้เมื่อเลขากระรอกทำรายการนี้เสร็จ") : tr("เปิดแชตเต็ม")}><Maximize2 size={17} /></button>
                <button type="button" className="asx-icon-btn" onClick={close} aria-label={tr("ปิด")} title={tr("ปิด")}><X size={18} /></button>
                </div>
              </header>
              {contents}
            </motion.div>
          )}
          {!mobile && (open || minimized) && (
            <FloatingWindow key="float" accountId={accountId} shown={open} mood={voice.active ? (voice.phase === 'transcribing' ? 'thinking' : 'checking') : poseFor(mode).mood} busy={busy || voice.phase === 'transcribing'} label={tr("เลขากระรอก · หน้า{0}", pageName)}
              note={tr("กำลังดูหน้า{0}", pageName)} corner={tokenCorner} zones={zones} reduce={Boolean(reduce)} onMinimize={minimize} onExpand={expand} expandWaits={expandWaits} onClose={close} windowRef={windowRef}>
              {contents}
            </FloatingWindow>
          )}
        </AnimatePresence>, document.body)}
      {!mobile && minimized && !open && createPortal(
        <MiniMascot accountId={accountId} mood={faceMood} zones={zones} label={tr("เปิดแชตเลขากระรอกอีกครั้ง")} onRestore={restore} buttonRef={miniRef}
          bubbleKey={climb ? (climb.said ? 'said' : climb.kind) : undefined}
          bubble={climb ? <><TypedWords text={climb.said ? climb.words : tr(climb.words)} instant={Boolean(reduce)} quiet={climb.kind === 'working'} />{climb.dots && <span className="asx-climb-dots" aria-hidden="true"><i /><i /><i /></span>}</> : undefined} />,
        document.body)}
    </>
  );
}
