import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Archive, ArchiveRestore, ArrowDown, ArrowLeft, ArrowUp, Bell, BellRing, Check, ChevronDown, ChevronLeft, FileText, FolderPlus, ListChecks, Lock, Mic, MoreHorizontal, PanelLeft, PanelLeftClose, Paperclip, Pencil, Pin, PinOff, RotateCcw, Search, Share, Sparkles, SquarePen, Trash2, Wallet, X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { tr } from '../../i18n/tr';
import { dateLocale } from '../../utils';
import { AssistantRequestError, createSampleTransport, tokenLevel, type AssistantTransport } from './assistantApi';
import { LINE_QUICK_REPLIES, arrivingNotice, dueDisplayText, laterReply, partialPrompt, receiptCard, type LineDueAction, type LineItem } from './lineMock';
import { LINE_THREAD_ID, NAP_AFTER_MS, PREVIEW_STATES, SAMPLE_TOKENS, SUGGESTIONS, statusFor, type AssistantMode, type ChatGroup, type ChatMessage, type ConfirmCard, type Conversation, type LineChatCard, type PreviewState, type SuggestionIcon, type TokenBalance } from './assistantMock';
import { ChatCardView, type ConfirmState } from './ChatCards';
import { MascotSlot } from './MascotSlot';
import { Markdown } from './Markdown';
import './assistant.css';

// เลขากระรอก, the chat workspace (owner's brief "KRAROK — AI SECRETARY CHAT UI BRIEF", 2026-10-23).
// ChatGPT/Dot-style conversation with Apple Liquid Glass used on purpose: the chat sidebar, the slim
// header, the floating composer and the popovers. Screen only -- it talks to an AssistantTransport
// (assistantApi.ts), which today is the sample transport: nothing calls an AI, billing or the backend.

type Props = {
  mobile: boolean;
  isPro: boolean;
  /** Phones: back to the เมนู screen. */
  onBack?: () => void;
  /** Computers and iPads: leave the chat for the page you came from. */
  onExit?: () => void;
  /** Computers: the app's sidebar folds away while the chat is open, so the chat sits 12px from the window edges. */
  focus?: boolean;
  /** The real notification settings. */
  onOpenNotifications: () => void;
  onUpgrade: () => void;
  /** Open a page of the app from a link or card in an answer. */
  onNavigate: (path: string) => void;
  /** The team's preview tools in the ⋯ menu (ดูตัวอย่างสถานะ, จำลองแจ้งเตือนเข้า): admins only, so members never
   *  see, for example, a "trial ended" notice that is not true for them. */
  previewTools?: boolean;
  /** Admins: play the squirrel's birth again on the overview. */
  onPreviewBirth?: () => void;
  /** The AI connection; defaults to the sample transport. */
  transport?: AssistantTransport;
};

const SUGGESTION_ICONS: Record<SuggestionIcon, typeof FileText> = { today: ListChecks, quote: FileText, howto: FolderPlus, unpaid: Wallet };
const GROUPS: { id: ChatGroup; label: string }[] = [
  { id: 'today', label: "วันนี้" }, { id: 'yesterday', label: "เมื่อวาน" }, { id: 'week', label: "7 วันที่ผ่านมา" },
];
const SIDEBAR_KEY = 'krarok_assistant_sidebar';
const readSidebar = (): boolean | null => { try { const v = localStorage.getItem(SIDEBAR_KEY); return v === null ? null : v === 'open'; } catch { return null; } };
const saveSidebar = (open: boolean) => { try { localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed'); } catch { /* a convenience only */ } };

/** Computers: fill the window under the page's top edge. Phones: the whole screen, above the keyboard. */
function usePanelBox(mobile: boolean, ref: React.RefObject<HTMLElement | null>, bottomGap: number) {
  const [box, setBox] = React.useState<React.CSSProperties>({});
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current; if (!el) return;
      if (mobile) {
        const vv = window.visualViewport;
        setBox({ position: 'fixed', left: 0, right: 0, top: vv ? vv.offsetTop : 0, height: vv ? vv.height : window.innerHeight });
      } else {
        const scroller = el.closest('#main-content');
        const top = el.getBoundingClientRect().top + (scroller?.scrollTop ?? 0);
        setBox({ height: Math.max(560, window.innerHeight - top - bottomGap) });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [mobile, ref, bottomGap]);
  return box;
}

/** Wide enough for the sidebar to sit beside the conversation (otherwise it slides over it). */
function useWide(ref: React.RefObject<HTMLElement | null>, mobile: boolean) {
  const [wide, setWide] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el || mobile) { setWide(false); return; }
    const check = () => setWide(el.getBoundingClientRect().width >= 940);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, mobile]);
  return wide;
}

function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!refs.some(ref => ref.current?.contains(event.target as Node))) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close, refs]);
}

function Ring({ share, size, stroke, level }: { share: number; size: number; stroke: number; level: 'ok' | 'low' | 'empty' }) {
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  return (
    <svg className={`asx-ring is-${level}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="asx-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle className="asx-ring-fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={length} strokeDashoffset={length * (1 - Math.max(0, Math.min(1, share)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

const popMotion = (reduce: boolean | null) => reduce
  ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
  // The fill fades in quickly (so nothing behind ever shows through for long); the size settles with a spring.
  : { initial: { opacity: 0, scale: 0.94, y: -6 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: -4 }, transition: { default: { type: 'spring' as const, stiffness: 520, damping: 34 }, opacity: { duration: 0.12 } } };

export default function AssistantChat({ mobile, isPro, onBack, onExit, focus = false, previewTools = false, onPreviewBirth, onOpenNotifications, onUpgrade, onNavigate, transport: given }: Props) {
  const reduce = useReducedMotion();
  const rootRef = React.useRef<HTMLElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const dockRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const tokenBtnRef = React.useRef<HTMLButtonElement>(null);
  const tokenPopRef = React.useRef<HTMLDivElement>(null);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const menuPopRef = React.useRef<HTMLDivElement>(null);
  const box = usePanelBox(mobile, rootRef, focus ? 12 : 24);
  const wide = useWide(rootRef, mobile);

  const [preview, setPreview] = React.useState<PreviewState>('normal');
  const [balance, setBalance] = React.useState<TokenBalance>(SAMPLE_TOKENS);
  const previewRef = React.useRef(preview); previewRef.current = preview;
  const balanceRef = React.useRef(balance); balanceRef.current = balance;
  const transport = React.useMemo(() => given ?? createSampleTransport({
    failSends: () => previewRef.current === 'offline',
    failActions: () => previewRef.current === 'actionFails',
    tokens: () => balanceRef.current,
    instant: Boolean(reduce),
  }), [given, reduce]);

  const [conversations, setConversations] = React.useState<Conversation[] | null>(null);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [mode, setMode] = React.useState<AssistantMode>('greeting');
  const [draft, setDraft] = React.useState('');
  const [streamingId, setStreamingId] = React.useState<string | null>(null);
  const [readId, setReadId] = React.useState<string | null>(null);
  const [confirmStates, setConfirmStates] = React.useState<Record<string, ConfirmState>>({});
  const [query, setQuery] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [tokenOpen, setTokenOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [newBelow, setNewBelow] = React.useState(false);
  const [popAt, setPopAt] = React.useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [push, setPush] = React.useState<{ id: string; alt: string } | null>(null);
  // Deleted chats can come back for a few seconds (เลิกทำ); only then are they removed for good.
  const [undo, setUndo] = React.useState<{ key: number; label: string; removed: { conversation: Conversation; index: number }[] } | null>(null);
  const undoTimer = React.useRef<number | null>(null);
  // Try mode (owner, 2026-10-23): without Pro, the sample questions and buttons work, typing your own asks for Pro.
  const [upsell, setUpsell] = React.useState(false);
  // A ⋯ menu on each history row, as in ChatGPT (owner, 2026-10-23): rename, pin, share (soon), archive, delete.
  const [rowMenu, setRowMenu] = React.useState<{ id: string; at: React.CSSProperties } | null>(null);
  const rowBtnRef = React.useRef<HTMLElement | null>(null);
  const rowMenuRef = React.useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const atBottom = React.useRef(true);
  const abortRef = React.useRef<AbortController | null>(null);
  const nextId = React.useRef(0);
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++nextId.current}`;

  const busy = mode === 'thinking' || mode === 'working';
  const current = conversations?.find(conversation => conversation.id === currentId) ?? null;
  const messages = current?.messages ?? [];
  const currentIdRef = React.useRef(currentId); currentIdRef.current = currentId;
  // The pinned automatic-notifications thread, drawn like a LINE chat.
  const lineThread = conversations?.find(conversation => conversation.kind === 'line') ?? null;
  const unread = lineThread?.unread ?? 0;
  const inLine = current?.kind === 'line';
  const lastNotice = lineThread && [...lineThread.messages].reverse().find(message => message.cards?.some(card => card.kind === 'line'));
  const lastNoticeText = lastNotice?.cards?.find((card): card is LineChatCard => card.kind === 'line')?.card.alt ?? '';
  const effective: TokenBalance = preview === 'tokensLow' ? { ...balance, remaining: 64 } : preview === 'tokensEmpty' ? { ...balance, remaining: 0 } : balance;
  const level = tokenLevel(effective);
  const gate = preview === 'trialExpired' ? 'trial' : preview === 'proRequired' || !isPro ? 'pro' : null;
  // Without Pro the chat is a try mode: preset questions answer, typed questions ask for Pro. With Pro, an
  // empty token cycle stops sending.
  const blocked = !gate && level === 'empty';
  const refill = new Date(effective.refillsOn).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const share = effective.total ? effective.remaining / effective.total : 0;

  // Load the history and the balance through the transport (the sample one answers at once).
  React.useEffect(() => {
    let live = true;
    transport.conversations().then(list => { if (live) setConversations(list); }).catch(() => { if (live) setConversations([]); });
    transport.balance().then(value => { if (live) setBalance(value); }).catch(() => {});
    return () => { live = false; abortRef.current?.abort(); };
  }, [transport]);
  // The sidebar starts open where it fits beside the conversation, and remembers the viewer's choice.
  React.useEffect(() => { setSidebarOpen(wide ? (readSidebar() ?? true) : false); }, [wide]);
  // A wave hello, then awake; a nap after a while with nothing happening.
  React.useEffect(() => { const t = window.setTimeout(() => setMode(m => (m === 'greeting' ? 'awake' : m)), 2400); return () => window.clearTimeout(t); }, []);
  React.useEffect(() => {
    if (mode !== 'awake' || draft) return;
    const nap = window.setTimeout(() => setMode(m => (m === 'awake' ? 'sleeping' : m)), NAP_AFTER_MS);
    return () => window.clearTimeout(nap);
  }, [mode, draft]);
  // The floating composer's height, so the last message always clears it. Measured right after each change
  // that resizes the dock (in the same frame, before it is painted) and by a ResizeObserver for the rest.
  const syncDock = React.useCallback(() => {
    const dock = dockRef.current; const root = rootRef.current; if (!dock || !root) return;
    root.style.setProperty('--asx-dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    const list = listRef.current;
    if (!list || !atBottom.current) return;
    // Instant, so a smooth scroll still on its way cannot leave text under the taller dock.
    list.scrollTo({ top: list.scrollHeight, behavior: 'instant' });
  }, []);
  React.useLayoutEffect(() => {
    const dock = dockRef.current; if (!dock) return;
    syncDock();
    const observer = new ResizeObserver(syncDock);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [syncDock]);
  React.useLayoutEffect(() => { syncDock(); }, [syncDock, upsell, gate, inLine, busy, level, draft, undo]);
  // Follow new messages only while the reader is at the bottom; otherwise offer a "new message" pill.
  React.useLayoutEffect(() => {
    const list = listRef.current; if (!list) return;
    if (atBottom.current) list.scrollTo({ top: list.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    else setNewBelow(true);
  }, [messages, mode, reduce]);
  // A conversation opens at its latest message, as in LINE.
  React.useLayoutEffect(() => { if (opening) return; const list = listRef.current; if (list) list.scrollTop = list.scrollHeight; }, [opening, currentId]);
  // Only the reader scrolling up stops the follow. A smooth scroll on its way down while an answer grows passes
  // through spots far from the end; those must not count as "the reader left the bottom".
  const lastTop = React.useRef(0);
  const onScroll = () => {
    const list = listRef.current; if (!list) return;
    const top = list.scrollTop;
    if (list.scrollHeight - top - list.clientHeight < 80) atBottom.current = true;
    else if (top < lastTop.current - 4) atBottom.current = false;
    lastTop.current = top;
    if (atBottom.current) setNewBelow(false);
  };
  // A LINE-style banner for a notification that arrives while you are elsewhere; it leaves on its own.
  React.useEffect(() => { if (!push) return; const t = window.setTimeout(() => setPush(null), 6000); return () => window.clearTimeout(t); }, [push]);
  const toBottom = () => { const list = listRef.current; if (!list) return; atBottom.current = true; setNewBelow(false); list.scrollTo({ top: list.scrollHeight, behavior: reduce ? 'auto' : 'smooth' }); };

  // The popovers open in a portal, under their button: inside the glass header the browser would let the
  // conversation show through them.
  const placeUnder = (button: HTMLElement | null) => {
    if (!button) return;
    const r = button.getBoundingClientRect();
    setPopAt({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
  };
  React.useEffect(() => {
    if (!tokenOpen && !menuOpen) return;
    const follow = () => placeUnder(tokenOpen ? tokenBtnRef.current : menuBtnRef.current);
    window.addEventListener('resize', follow);
    return () => window.removeEventListener('resize', follow);
  }, [tokenOpen, menuOpen]);
  const closeToken = React.useCallback(() => setTokenOpen(false), []);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  useDismiss(tokenOpen, closeToken, React.useMemo(() => [tokenBtnRef, tokenPopRef], []));
  useDismiss(menuOpen, closeMenu, React.useMemo(() => [menuBtnRef, menuPopRef], []));
  const closeRowMenu = React.useCallback(() => setRowMenu(null), []);
  useDismiss(Boolean(rowMenu), closeRowMenu, React.useMemo(() => [rowBtnRef, rowMenuRef], []));

  const patch = (conversationId: string, change: (list: ChatMessage[]) => ChatMessage[]) =>
    setConversations(list => list?.map(conversation => (conversation.id === conversationId ? { ...conversation, messages: change(conversation.messages) } : conversation)) ?? list);

  const time = (at: number) => new Date(at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });

  const ask = async (conversationId: string, text: string, history: ChatMessage[]) => {
    const botId = id('bot');
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setMode('thinking');
    let started = false;
    try {
      const result = await transport.send({ conversationId, text, history }, textSoFar => {
        if (!started) {
          started = true;
          setStreamingId(botId);
          setMode('working');
          patch(conversationId, list => [...list, { id: botId, from: 'bot' as const, text: textSoFar, at: Date.now() }]);
        } else patch(conversationId, list => list.map(message => (message.id === botId ? { ...message, text: textSoFar } : message)));
      }, controller.signal);
      patch(conversationId, list => (started ? list : [...list, { id: botId, from: 'bot' as const, text: '', at: Date.now() }])
        .map(message => (message.id === botId ? { ...message, text: result.text, cards: result.cards } : message)));
      setBalance(value => ({ ...value, remaining: Math.max(0, value.remaining - result.tokensUsed) }));
      setStreamingId(null);
      setMode('done');
      window.setTimeout(() => setMode(m => (m === 'done' ? 'awake' : m)), 1600);
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof AssistantRequestError)) return;
      setStreamingId(null);
      patch(conversationId, list => [...list.filter(message => message.id !== botId), { id: botId, from: 'bot' as const, text: '', at: Date.now(), failed: true, question: text }]);
      setMode('awake');
    }
  };

  const send = (raw: string, preset = false) => {
    const text = raw.trim();
    if (!text || busy || blocked) return;
    if (gate && !preset) { setUpsell(true); return; }
    setUpsell(false);
    const mine: ChatMessage = { id: id('me'), from: 'me', text, at: Date.now() };
    let conversationId = currentId;
    let history = messages;
    if (!conversationId) {
      conversationId = id('chat');
      const created: Conversation = { id: conversationId, title: text.length > 42 ? `${text.slice(0, 42)}…` : text, group: 'today', sample: false, messages: [] };
      setConversations(list => [created, ...(list ?? [])]);
      setCurrentId(conversationId);
      history = [];
    }
    patch(conversationId, list => [...list, mine]);
    setReadId(null);
    window.setTimeout(() => setReadId(mine.id), 450);
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = '';
    atBottom.current = true;
    void ask(conversationId, text, [...history, mine]);
  };

  const retry = (message: ChatMessage) => {
    if (!currentId || !message.question || busy) return;
    patch(currentId, list => list.filter(item => item.id !== message.id));
    void ask(currentId, message.question, messages.filter(item => item.id !== message.id));
  };

  const confirm = async (card: ConfirmCard) => {
    setConfirmStates(states => ({ ...states, [card.id]: 'working' }));
    try {
      const result = await transport.confirm(card, new AbortController().signal);
      setConfirmStates(states => ({ ...states, [card.id]: result.ok ? 'done' : 'failed' }));
    } catch { setConfirmStates(states => ({ ...states, [card.id]: 'failed' })); }
  };

  const openConversation = (conversationId: string | null) => {
    abortRef.current?.abort();
    setStreamingId(null);
    setMode(m => (m === 'thinking' || m === 'working' ? 'awake' : m));
    setCurrentId(conversationId);
    setNewBelow(false);
    if (conversationId === LINE_THREAD_ID) { setPush(null); setConversations(list => list?.map(conversation => (conversation.id === LINE_THREAD_ID ? { ...conversation, unread: 0 } : conversation)) ?? list); }
    atBottom.current = true;
    if (!wide) setSidebarOpen(false);
    if (conversationId) { setOpening(true); window.setTimeout(() => setOpening(false), reduce ? 0 : 450); }
    else window.setTimeout(() => inputRef.current?.focus(), 0);
  };
  const commitRemoval = React.useCallback((removed: { conversation: Conversation }[]) => {
    const ids = removed.map(entry => entry.conversation.id);
    if (ids.length) void transport.remove?.(ids).catch(() => {});
  }, [transport]);
  const undoRef = React.useRef(undo); undoRef.current = undo;
  React.useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); if (undoRef.current) commitRemoval(undoRef.current.removed); }, [commitRemoval]);
  /** Delete chats from the history (never the pinned notifications thread), with a few seconds to undo. */
  const removeConversations = (ids: string[]) => {
    const list = conversations ?? [];
    const removed = list.map((conversation, index) => ({ conversation, index })).filter(entry => ids.includes(entry.conversation.id) && entry.conversation.kind !== 'line');
    if (!removed.length) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    if (undo) commitRemoval(undo.removed);
    const gone = new Set(removed.map(entry => entry.conversation.id));
    setConversations(current => current?.filter(conversation => !gone.has(conversation.id)) ?? current);
    if (currentId && gone.has(currentId)) openConversation(null);
    const label = removed.length === 1 ? tr("ลบแชตแล้ว") : tr("ลบประวัติแชต {0} รายการแล้ว", removed.length);
    setUndo({ key: Date.now(), label, removed });
    undoTimer.current = window.setTimeout(() => { commitRemoval(removed); setUndo(null); undoTimer.current = null; }, 6000);
  };
  const undoRemove = () => {
    if (!undo) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const back = [...undo.removed].sort((a, b) => a.index - b.index);
    setConversations(current => {
      const next = [...(current ?? [])];
      for (const entry of back) next.splice(Math.min(entry.index, next.length), 0, entry.conversation);
      return next;
    });
    setUndo(null);
  };
  const removeCurrent = () => { if (currentId) removeConversations([currentId]); };
  const changeConversation = (conversationId: string, change: { title?: string; pinned?: boolean; archived?: boolean }) => {
    setConversations(list => list?.map(conversation => (conversation.id === conversationId ? { ...conversation, ...change } : conversation)) ?? list);
    void transport.update?.(conversationId, change).catch(() => {});
  };
  const openRowMenu = (conversationId: string, button: HTMLElement) => {
    if (rowMenu?.id === conversationId) { setRowMenu(null); return; }
    rowBtnRef.current = button;
    const r = button.getBoundingClientRect();
    const right = Math.max(8, Math.round(window.innerWidth - r.right));
    // Opens under its button, or above it near the bottom of the screen.
    const at: React.CSSProperties = r.bottom + 8 + 250 > window.innerHeight - 8 ? { bottom: Math.round(window.innerHeight - r.top + 8), right } : { top: Math.round(r.bottom + 8), right };
    setRowMenu({ id: conversationId, at });
  };
  const startRename = (conversation: Conversation) => { setRowMenu(null); setRenameDraft(conversation.title); setRenaming(conversation.id); };
  const commitRename = () => {
    if (!renaming) return;
    const title = renameDraft.trim().replace(/\s+/g, ' ').slice(0, 80);
    const before = conversations?.find(conversation => conversation.id === renaming)?.title;
    if (title && title !== before) changeConversation(renaming, { title });
    setRenaming(null);
  };
  const deletable = (conversations ?? []).filter(conversation => conversation.kind !== 'line');
  // The reminder card's buttons do what they do in LINE: ได้รับแล้ว / ยังไม่ได้ answer at once, ได้ไม่ครบ fills
  // the message box with the partial-payment line. Sample only: nothing is recorded.
  const lineDue = (action: LineDueAction, item: LineItem) => {
    const conversationId = currentIdRef.current;
    if (!conversationId || busy || blocked) return;
    setUpsell(false);
    if (action === 'partial') {
      onDraft(partialPrompt(item));
      window.setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
      return;
    }
    const mine: ChatMessage = { id: id('me'), from: 'me', text: dueDisplayText(action, item), at: Date.now() };
    atBottom.current = true;
    patch(conversationId, list => [...list, mine]);
    setReadId(null);
    window.setTimeout(() => setReadId(mine.id), 450);
    window.setTimeout(() => patch(conversationId, list => [...list, action === 'paid'
      ? { id: id('bot'), from: 'bot' as const, text: '', at: Date.now(), cards: [{ kind: 'line' as const, card: receiptCard(item) }], note: tr("ตัวอย่าง · ไม่มีการบันทึกจริง") }
      : { id: id('bot'), from: 'bot' as const, text: laterReply(item), at: Date.now(), note: tr("ตัวอย่าง · ไม่มีการบันทึกจริง") }]), reduce ? 0 : 700);
  };
  // Preview: a notification arrives (the overdue follow-up), with its banner when you are in another chat.
  const simulatePush = () => {
    setMenuOpen(false);
    window.setTimeout(() => {
      const card = arrivingNotice(Date.now());
      const message: ChatMessage = { id: id('line'), from: 'bot', text: '', at: Date.now(), cards: [{ kind: 'line', card }] };
      const here = currentIdRef.current === LINE_THREAD_ID;
      setConversations(list => list?.map(conversation => (conversation.id === LINE_THREAD_ID ? { ...conversation, messages: [...conversation.messages, message], unread: here ? 0 : (conversation.unread ?? 0) + 1 } : conversation)) ?? list);
      if (!here) setPush({ id: message.id, alt: card.alt });
    }, reduce ? 0 : 900);
  };
  const dayKey = (at: number) => new Date(at).toDateString();
  const dayLabel = (at: number) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(at); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
    return diff === 0 ? tr("วันนี้") : diff === 1 ? tr("เมื่อวาน") : new Date(at).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const toggleSidebar = () => setSidebarOpen(open => { const next = !open; if (wide) saveSidebar(next); return next; });

  const onDraft = (value: string) => {
    setDraft(value);
    if (!busy) setMode(value.trim() ? 'listening' : 'awake');
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }
  };

  const q = query.trim().toLocaleLowerCase();
  const found = (conversations ?? []).filter(conversation => !q || conversation.title.toLocaleLowerCase().includes(q));
  const lastMine = [...messages].reverse().find(message => message.from === 'me')?.id;
  const welcome = !currentId;
  const overlaySidebar = !wide;

  const lineMatch = Boolean(lineThread && (!q || lineThread.title.toLocaleLowerCase().includes(q)));
  const listed = found.filter(conversation => conversation.kind !== 'line' && !conversation.archived);
  const pinnedChats = listed.filter(conversation => conversation.pinned);
  const archived = found.filter(conversation => conversation.kind !== 'line' && conversation.archived);
  const menuChat = rowMenu ? conversations?.find(conversation => conversation.id === rowMenu.id) ?? null : null;
  const row = (conversation: Conversation) => (
    <li key={conversation.id} className={`asx-side-row${rowMenu?.id === conversation.id ? ' is-menu-open' : ''}`}>
      {renaming === conversation.id ? (
        <form className="asx-side-rename" onSubmit={event => { event.preventDefault(); commitRename(); }}>
          <label className="asx-sr" htmlFor={`asx-rename-${conversation.id}`}>{tr("ชื่อแชต")}</label>
          <input id={`asx-rename-${conversation.id}`} autoFocus value={renameDraft} maxLength={80} onChange={event => setRenameDraft(event.target.value)} onBlur={commitRename}
            onFocus={event => event.currentTarget.select()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setRenaming(null); } }} />
        </form>
      ) : (
        <>
          <button type="button" className={`asx-side-item${conversation.id === currentId ? ' is-active' : ''}`} aria-current={conversation.id === currentId ? 'page' : undefined} onClick={() => openConversation(conversation.id)}>
            <span className="asx-side-title">{conversation.title}</span>
            {conversation.sample && <span className="asx-side-tag">{tr("ตัวอย่าง")}</span>}
          </button>
          <span className="asx-side-actions">
            {!mobile && !conversation.archived && (
              <button type="button" className="asx-side-act" onClick={() => changeConversation(conversation.id, { pinned: !conversation.pinned })}
                aria-label={conversation.pinned ? tr("เลิกปักหมุด “{0}”", conversation.title) : tr("ปักหมุด “{0}”", conversation.title)} title={conversation.pinned ? tr("เลิกปักหมุด") : tr("ปักหมุด")}>
                {conversation.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            )}
            <button type="button" className="asx-side-act" onClick={event => openRowMenu(conversation.id, event.currentTarget)} aria-haspopup="menu" aria-expanded={rowMenu?.id === conversation.id}
              aria-label={tr("ตัวเลือกของ “{0}”", conversation.title)} title={tr("ตัวเลือก")}><MoreHorizontal size={16} /></button>
          </span>
        </>
      )}
    </li>
  );
  const sidebar = (
    <aside className={`asx-side lg-glass${sidebarOpen ? ' is-open' : ''}${overlaySidebar ? ' is-overlay' : ''}`} aria-label={tr("ประวัติแชต")} aria-hidden={!sidebarOpen || undefined} inert={!sidebarOpen || undefined}>
      <div className="asx-side-head">
        {!mobile && onExit
          ? <button type="button" className="asx-back" onClick={onExit} title={tr("ออกจากเลขากระรอก")}><ChevronLeft size={18} aria-hidden="true" />{tr("กลับ")}</button>
          : <b>{tr("เลขากระรอก")}</b>}
        <button type="button" className="asx-icon-btn" onClick={toggleSidebar} aria-label={tr("ย่อแถบประวัติแชต")} title={tr("ย่อแถบประวัติแชต")}>
          {overlaySidebar ? <X size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <button type="button" className="asx-new" onClick={() => openConversation(null)}><SquarePen size={17} />{tr("แชตใหม่")}</button>
      <label className="asx-side-search">
        <Search size={15} aria-hidden="true" />
        <span className="asx-sr">{tr("ค้นหาแชต")}</span>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("ค้นหาแชต")} />
      </label>
      <div className="asx-side-list">
        {lineMatch && lineThread && (
          <section aria-label={tr("แชตที่ปักหมุด")}>
            {pinnedChats.length > 0 && <h3>{tr("แชตที่ปักหมุด")}</h3>}
            <ul>
              <li>
                <button type="button" className={`asx-side-item is-line${currentId === LINE_THREAD_ID ? ' is-active' : ''}`} aria-current={currentId === LINE_THREAD_ID ? 'page' : undefined} onClick={() => openConversation(LINE_THREAD_ID)}>
                  <span className="asx-line-avatar" aria-hidden="true"><img src="/brand/logo01-v1/symbol-white.png" alt="" width={16} height={16} /></span>
                  <span className="asx-side-stack"><span className="asx-side-title">{lineThread.title}</span>{lastNoticeText && <span className="asx-side-preview">{lastNoticeText}</span>}</span>
                  {unread > 0 ? <span className="asx-badge is-inline" aria-label={tr("ยังไม่อ่าน {0}", unread)}>{unread}</span> : <span className="asx-side-tag">{tr("ตัวอย่าง")}</span>}
                </button>
              </li>
              {pinnedChats.map(row)}
            </ul>
          </section>
        )}
        {!lineMatch && pinnedChats.length > 0 && (
          <section aria-label={tr("แชตที่ปักหมุด")}><h3>{tr("แชตที่ปักหมุด")}</h3><ul>{pinnedChats.map(row)}</ul></section>
        )}
        {conversations === null ? (
          <div className="asx-side-skeleton" aria-label={tr("กำลังโหลดประวัติแชต")} role="status">{[0, 1, 2].map(n => <i key={n} />)}</div>
        ) : !listed.length && !archived.length && !lineMatch ? (
          <p className="asx-side-empty">{q ? tr("ไม่พบแชตที่ตรงกับ “{0}”", query.trim()) : tr("ยังไม่มีประวัติแชต")}</p>
        ) : GROUPS.map(group => {
          const items = listed.filter(conversation => conversation.group === group.id && !conversation.pinned);
          if (!items.length) return null;
          return (
            <section key={group.id} aria-label={tr(group.label)}>
              <h3>{tr(group.label)}</h3>
              <ul>{items.map(row)}</ul>
            </section>
          );
        })}
        {archived.length > 0 && (
          <section className="asx-side-archive" aria-label={tr("เก็บถาวร")}>
            <button type="button" className="asx-side-archive-toggle" aria-expanded={showArchived || Boolean(q)} onClick={() => setShowArchived(open => !open)}>
              <Archive size={14} aria-hidden="true" /><span>{tr("เก็บถาวร · {0}", archived.length)}</span><ChevronDown size={15} aria-hidden="true" className={showArchived || q ? 'is-open' : ''} />
            </button>
            {(showArchived || Boolean(q)) && <ul>{archived.map(row)}</ul>}
          </section>
        )}
      </div>
      {createPortal(
      <AnimatePresence>
        {rowMenu && <motion.div key="scrim" className="asx-pop-scrim" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />}
        {rowMenu && menuChat && (
          <motion.div key="pop" ref={rowMenuRef} className="asx-pop is-menu-list lg-glass is-menu" role="menu" aria-label={tr("ตัวเลือกของ “{0}”", menuChat.title)} style={rowMenu.at} {...popMotion(reduce)}>
            <button type="button" role="menuitem" onClick={() => startRename(menuChat)}><span>{tr("เปลี่ยนชื่อ")}</span><Pencil size={16} /></button>
            {!menuChat.archived && <button type="button" role="menuitem" onClick={() => { setRowMenu(null); changeConversation(menuChat.id, { pinned: !menuChat.pinned }); }}><span>{menuChat.pinned ? tr("เลิกปักหมุด") : tr("ปักหมุด")}</span>{menuChat.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
            <button type="button" role="menuitem" className="is-soon" aria-disabled="true"><span>{tr("แชร์ · เร็ว ๆ นี้")}</span><Share size={16} /></button>
            <div className="asx-menu-sep" role="separator" />
            <button type="button" role="menuitem" onClick={() => { setRowMenu(null); changeConversation(menuChat.id, menuChat.archived ? { archived: false } : { archived: true, pinned: false }); }}>
              <span>{menuChat.archived ? tr("นำออกจากที่เก็บถาวร") : tr("เก็บถาวร")}</span>{menuChat.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
            <button type="button" role="menuitem" className="is-danger" onClick={() => { setRowMenu(null); removeConversations([menuChat.id]); }}><span>{tr("ลบ")}</span><Trash2 size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
      <p className="asx-side-note">{tr("ประวัติแชตเป็นข้อมูลตัวอย่าง")}</p>
    </aside>
  );

  return (
    <section ref={rootRef} className={`asx${mobile ? ' is-mobile' : ''}${wide ? ' is-wide' : ''}${sidebarOpen ? ' has-side' : ''}`} style={box} aria-labelledby="asx-title">
      {sidebar}
      {overlaySidebar && sidebarOpen && <button type="button" className="asx-scrim" aria-label={tr("ปิดแถบประวัติแชต")} onClick={() => setSidebarOpen(false)} />}
      <div className="asx-chat">
        <div className="asx-aurora" aria-hidden="true"><i /><i /></div>
        {/* No bar across the top (owner: the glass bar blocked the view): round glass buttons at the sides and
            only the squirrel in the middle. The name and status stay for screen readers. */}
        <header className="asx-bar">
          <div className="asx-bar-side">
            {mobile && onBack && <button type="button" className="asx-icon-btn lg-glass" onClick={onBack} aria-label={tr("กลับไปเมนู")} title={tr("กลับไปเมนู")}><ArrowLeft size={19} /></button>}
            {/* With the history hidden, the way out moves here, so the chat never traps anyone. */}
            {!mobile && onExit && (!sidebarOpen || overlaySidebar) && <button type="button" className="asx-icon-btn lg-glass" onClick={onExit} aria-label={tr("กลับ")} title={tr("ออกจากเลขากระรอก")}><ArrowLeft size={19} /></button>}
            {(!sidebarOpen || overlaySidebar) && (
              <button type="button" className="asx-icon-btn lg-glass asx-has-dot" onClick={toggleSidebar} aria-label={tr("ประวัติและค้นหาแชต")} title={tr("ประวัติและค้นหาแชต")} aria-expanded={sidebarOpen}><PanelLeft size={19} />{mobile && unread > 0 && <span className="asx-dot" aria-hidden="true" />}</button>
            )}
          </div>
          <div className="asx-bar-center">
            {!welcome && <span className="asx-bar-mascot" aria-hidden="true"><MascotSlot mode={mode} size={mobile ? 64 : 80} /></span>}
            <div className="asx-bar-text asx-sr">
              <span className="asx-bar-title"><h1 id="asx-title">{tr("เลขากระรอก")}</h1><span className="asx-pro">Pro</span></span>
              <span className={`asx-bar-status is-${mode}`} role="status" aria-live="polite"><i aria-hidden="true" />{statusFor(mode)}</span>
            </div>
          </div>
          <div className="asx-bar-side is-end">
            {!mobile && lineThread && (
              <button type="button" className="asx-icon-btn lg-glass asx-bell" onClick={() => openConversation(LINE_THREAD_ID)}
                aria-label={unread ? tr("แจ้งเตือนอัตโนมัติ · ยังไม่อ่าน {0}", unread) : tr("แจ้งเตือนอัตโนมัติ")} title={tr("แจ้งเตือนอัตโนมัติ")}>
                <Bell size={18} />{unread > 0 && <span className="asx-badge" aria-hidden="true">{unread}</span>}
              </button>
            )}
            {!gate && <div className="asx-pop-anchor">
              <button ref={tokenBtnRef} type="button" className={`asx-token lg-glass is-${level}`} onClick={() => { placeUnder(tokenBtnRef.current); setTokenOpen(open => !open); setMenuOpen(false); }}
                aria-expanded={tokenOpen} aria-label={tr("Krarok Tokens คงเหลือ {0} จาก {1} (ข้อมูลตัวอย่าง)", effective.remaining, effective.total)} title={tr("Krarok Tokens")}>
                <Ring share={share} size={20} stroke={3} level={level} /><span>{effective.remaining.toLocaleString(dateLocale())}</span>
              </button>
              {createPortal(
              <AnimatePresence>
                {tokenOpen && <motion.div key="scrim" className="asx-pop-scrim" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />}
                {tokenOpen && (
                  <motion.div key="pop" ref={tokenPopRef} className="asx-pop lg-glass is-menu" role="dialog" aria-label={tr("Krarok Tokens")} style={popAt} {...popMotion(reduce)}>
                    <div className="asx-pop-head"><b>Krarok Tokens</b><span className="asx-card-tag">{tr("ข้อมูลตัวอย่าง")}</span></div>
                    <div className="asx-token-big">
                      <span className="asx-token-num">{effective.remaining.toLocaleString(dateLocale())}</span>
                      <span className="asx-token-of">{tr("จาก {0} โทเค็นต่อรอบ", effective.total.toLocaleString(dateLocale()))}</span>
                    </div>
                    <div className={`asx-meter is-${level}`} role="progressbar" aria-valuemin={0} aria-valuemax={effective.total} aria-valuenow={effective.remaining} aria-label={tr("โทเค็นคงเหลือ")}><i style={{ width: `${Math.round(share * 100)}%` }} /></div>
                    <p className={`asx-token-state is-${level}`}>
                      {level === 'empty' ? tr("โทเค็นรอบนี้หมดแล้ว") : level === 'low' ? tr("โทเค็นใกล้หมด") : tr("เหลือ {0}% ของรอบนี้", Math.round(share * 100))}
                    </p>
                    <p className="asx-token-refill">{tr("เติมรอบใหม่ {0}", refill)}</p>
                    <p className="asx-pop-note">{tr("ตัวอย่างหน้าจอ · ยังไม่เชื่อมระบบชำระเงินหรือการหักโทเค็นจริง")}</p>
                    {level !== 'ok' && <button type="button" className="asx-pill-btn is-primary is-block" onClick={onUpgrade}>{tr("ดูแพ็กเกจ Pro")}</button>}
                  </motion.div>
                )}
              </AnimatePresence>, document.body)}
            </div>}
            <div className="asx-pop-anchor">
              <button ref={menuBtnRef} type="button" className="asx-icon-btn lg-glass" onClick={() => { placeUnder(menuBtnRef.current); setMenuOpen(open => !open); setTokenOpen(false); }} aria-expanded={menuOpen} aria-haspopup="menu" aria-label={tr("จัดการแชต")} title={tr("จัดการแชต")}>
                <MoreHorizontal size={19} />
              </button>
              {createPortal(
              <AnimatePresence>
                {menuOpen && <motion.div key="scrim" className="asx-pop-scrim" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />}
                {menuOpen && (
                  <motion.div key="pop" ref={menuPopRef} className="asx-pop is-menu-list lg-glass is-menu" role="menu" aria-label={tr("จัดการแชต")} style={popAt} {...popMotion(reduce)}>
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openConversation(null); }}><span>{tr("แชตใหม่")}</span><SquarePen size={16} /></button>
                    {currentId && currentId !== LINE_THREAD_ID && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); removeCurrent(); }}><span>{tr("ลบแชตนี้")}</span><Trash2 size={16} /></button>}
                    {deletable.length > 0 && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); removeConversations(deletable.map(conversation => conversation.id)); }}><span>{tr("ลบประวัติแชตทั้งหมด")}</span><Trash2 size={16} /></button>}
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenNotifications(); }}><span>{tr("ตั้งค่าการแจ้งเตือน")}</span><Bell size={16} /></button>
                    {previewTools && (
                      <>
                        <div className="asx-menu-sep" role="separator" />
                        <p className="asx-menu-label">{tr("ดูตัวอย่างสถานะ")}</p>
                        {PREVIEW_STATES.map(state => (
                          <button key={state.id} type="button" role="menuitemradio" aria-checked={preview === state.id} onClick={() => { setPreview(state.id); setMenuOpen(false); }}>
                            <span>{tr(state.label)}</span>{preview === state.id && <Check size={16} />}
                          </button>
                        ))}
                        <div className="asx-menu-sep" role="separator" />
                        <button type="button" role="menuitem" onClick={simulatePush}><span>{tr("จำลองแจ้งเตือนเข้า")}</span><BellRing size={16} /></button>
                        {onPreviewBirth && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPreviewBirth(); }}><span>{tr("ดูตอนน้องเกิดอีกครั้ง")}</span><Sparkles size={16} /></button>}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>, document.body)}
            </div>
          </div>
        </header>

        <div className="asx-push-wrap" aria-live="polite">
          <AnimatePresence>
            {push && (
              <motion.button key={push.id} type="button" className="asx-push lg-glass is-menu" onClick={() => openConversation(LINE_THREAD_ID)}
                initial={reduce ? false : { opacity: 0, y: -18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
                <span className="asx-push-icon" aria-hidden="true"><img src="/brand/logo01-v1/symbol-white.png" alt="" width={22} height={22} /></span>
                <span className="asx-push-text">
                  <span className="asx-push-head"><span className="asx-push-app">กระรอกตุนเงิน</span><span>{tr("ตอนนี้")}</span></span>
                  <span className="asx-push-body">{push.alt}</span>
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div ref={listRef} className="asx-scroll" onScroll={onScroll} role="log" aria-label={tr("บทสนทนากับเลขากระรอก")}>
          {welcome ? (
            <div className="asx-welcome">
              <span className="asx-spot"><MascotSlot mode={mode} size={mobile ? 84 : 96} /></span>
              <h2>{tr("วันนี้อยากให้เลขากระรอกช่วยอะไร?")}</h2>
              <p>{tr("ถามเรื่องงาน เอกสาร หรือเงินที่ยังไม่ได้รับได้เลย")}</p>
              {!blocked && (
                <div className="asx-prompts" role="group" aria-label={tr("คำถามแนะนำ")}>
                  {SUGGESTIONS.map(({ label, ask, icon }) => {
                    const Icon = SUGGESTION_ICONS[icon];
                    return <button key={label} type="button" onClick={() => send(tr(ask), true)}><span className="asx-prompt-icon" aria-hidden="true"><Icon size={17} /></span><span className="asx-prompt-label">{tr(label)}</span></button>;
                  })}
                </div>
              )}
            </div>
          ) : opening ? (
            <div className="asx-thread"><div className="asx-skeleton" role="status" aria-label={tr("กำลังโหลดบทสนทนา")}><i /><i /><i /><i /></div></div>
          ) : (
            <ol className="asx-thread">
              {current?.sample && <li className="asx-sample-banner">{tr("บทสนทนาตัวอย่าง · ข้อมูลทั้งหมดเป็นข้อมูลสมมติ")}</li>}
              {messages.map((message, n) => [
                // LINE-style date chips between days.
                (n === 0 || dayKey(messages[n - 1].at) !== dayKey(message.at)) && <li key={`day-${message.id}`} className="asx-day"><span>{dayLabel(message.at)}</span></li>,
                message.from === 'me' ? (
                <li key={message.id} className="asx-msg is-me">
                  {/* As in LINE: อ่านแล้ว and the time sit beside the bubble, at its foot. */}
                  <div className="asx-me-row">
                    <span className="asx-meta is-side">{(message.id !== lastMine || readId === message.id) && <span>{tr("อ่านแล้ว")}</span>}<span>{time(message.at)}</span></span>
                    <p className="asx-bubble">{message.text}</p>
                  </div>
                </li>
              ) : message.cards?.length && !message.text && message.cards.every(card => card.kind === 'line') ? (
                <li key={message.id} className="asx-msg is-bot is-line">
                  <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
                  <div className="asx-line-row">
                    {message.cards.map((card, c) => <ChatCardView key={c} card={card} onConfirm={() => {}} onCancel={() => {}} onNavigate={onNavigate} onLineDue={lineDue} />)}
                    <span className="asx-meta is-side"><span>{message.note ?? tr("ตัวอย่าง")}</span><span>{time(message.at)}</span></span>
                  </div>
                </li>
              ) : inLine && !message.failed ? (
                <li key={message.id} className="asx-msg is-bot is-line">
                  <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
                  <div className="asx-line-row">
                    <div className="asx-bubble is-bot"><Markdown text={message.text} onNavigate={onNavigate} />{message.id === streamingId && <i className="asx-caret" aria-hidden="true" />}</div>
                    {message.id !== streamingId && <span className="asx-meta is-side"><span>{message.note ?? tr("ตัวอย่าง")}</span><span>{time(message.at)}</span></span>}
                  </div>
                </li>
              ) : message.failed ? (
                <li key={message.id} className="asx-msg is-bot">
                  <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="worried" animated={false} size={30} viewBox="12 8 76 76" /></span>
                  <div className="asx-msg-body">
                    <div className="asx-error" role="alert">
                      <AlertCircle size={17} /><span>{tr("ส่งไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง")}</span>
                      <button type="button" className="asx-pill-btn" onClick={() => retry(message)} disabled={busy}><RotateCcw size={14} />{tr("ลองอีกครั้ง")}</button>
                    </div>
                  </div>
                </li>
              ) : (
                <li key={message.id} className="asx-msg is-bot">
                  <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
                  <div className="asx-msg-body">
                    {(message.text || message.id === streamingId) && <Markdown text={message.text} onNavigate={onNavigate} />}
                    {message.id === streamingId && <i className="asx-caret" aria-hidden="true" />}
                    {message.cards?.map((card, c) => (
                      <ChatCardView key={c} card={card} confirmState={card.kind === 'confirm' ? confirmStates[card.id] : undefined}
                        onConfirm={item => void confirm(item)} onCancel={item => setConfirmStates(states => ({ ...states, [item.id]: 'cancelled' }))} onNavigate={onNavigate} onLineDue={lineDue} />
                    ))}
                    {message.id !== streamingId && <span className="asx-meta">{time(message.at)} · {tr("คำตอบตัวอย่าง")}</span>}
                  </div>
                </li>
              )])}
              {mode === 'thinking' && (
                <li className="asx-msg is-bot">
                  <span className="asx-avatar" aria-hidden="true"><Mascot gear="pro" mood="thinking" animated={false} size={30} viewBox="12 8 76 76" /></span>
                  <div className="asx-typing" role="img" aria-label={tr("เลขากระรอกกำลังคิด")}><i /><i /><i /></div>
                </li>
              )}
            </ol>
          )}
        </div>

        {newBelow && !welcome && !undo && <button type="button" className="asx-newbelow lg-glass" onClick={toBottom}><ArrowDown size={15} />{tr("ข้อความใหม่")}</button>}
        <div className="asx-undo-wrap" aria-live="polite">
          <AnimatePresence>
            {undo && (
              <motion.div key="undo" className="asx-undo lg-glass is-menu" role="status"
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
                <Trash2 size={15} aria-hidden="true" /><span>{undo.label}</span>
                <button type="button" className="asx-undo-btn" onClick={undoRemove}>{tr("เลิกทำ")}</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={dockRef} className="asx-dock">
          <>
              {gate && upsell && (
                <div className="asx-upsell lg-glass is-menu" role="region" aria-label={tr("พิมพ์ถามเองได้เมื่อเป็นสมาชิก Pro")}>
                  <span className="asx-upsell-figure" aria-hidden="true"><Mascot gear="pro" mood="happy" animated={false} size={48} viewBox="12 8 76 76" /></span>
                  <div className="asx-upsell-body">
                    <b>{gate === 'trial' ? tr("ช่วงทดลองใช้ Pro สิ้นสุดแล้ว") : tr("พิมพ์ถามเองได้เมื่อเป็นสมาชิก Pro")}</b>
                    <p>{gate === 'trial' ? tr("สมัคร Pro เพื่อพิมพ์ถามเลขากระรอกต่อ ประวัติแชตยังอยู่ครบ ระหว่างนี้ลองกดคำถามตัวอย่างได้") : tr("อัปเกรดเป็น Pro เพื่อถามเรื่องงาน เอกสาร และเงินของคุณได้ทุกเรื่อง ระหว่างนี้ลองกดคำถามตัวอย่างได้ฟรี")}</p>
                    <div className="asx-upsell-try" role="group" aria-label={tr("ลองคำถามตัวอย่าง")}>
                      {SUGGESTIONS.map(({ label, ask }) => <button key={label} type="button" onClick={() => send(tr(ask), true)}>{tr(label)}</button>)}
                    </div>
                    <div className="asx-upsell-actions">
                      <button type="button" className="asx-pill-btn is-primary" onClick={onUpgrade}>{tr("ดูแพ็กเกจ Pro")}</button>
                      <button type="button" className="asx-pill-btn" onClick={() => setUpsell(false)}>{tr("ไว้ทีหลัง")}</button>
                    </div>
                  </div>
                </div>
              )}
              {gate && !upsell && (
                <p className="asx-notice is-try" role="status">
                  <Lock size={14} />
                  {gate === 'trial' ? tr("ช่วงทดลองใช้ Pro สิ้นสุดแล้ว · กดคำถามตัวอย่างได้ พิมพ์ถามเองต้องใช้ Pro") : tr("โหมดทดลอง · กดคำถามตัวอย่างได้ พิมพ์ถามเองต้องใช้ Pro")}
                  <button type="button" className="asx-link-btn" onClick={onUpgrade}>{tr("ดูแพ็กเกจ Pro")}</button>
                </p>
              )}
              {!gate && level !== 'ok' && (
                <p className={`asx-notice is-${level}`} role="status">
                  <AlertCircle size={15} />
                  {level === 'empty' ? tr("โทเค็นรอบนี้หมดแล้ว · เติมรอบใหม่ {0}", refill) : tr("โทเค็นใกล้หมด · เหลือ {0} จาก {1}", effective.remaining, effective.total.toLocaleString(dateLocale()))}
                </p>
              )}
              {inLine && !busy && (
                <div className="asx-quick" role="group" aria-label={tr("ตอบกลับด่วน")}>
                  {LINE_QUICK_REPLIES.map(label => <button key={label} type="button" onClick={() => send(tr(label), true)}>{tr(label)}</button>)}
                </div>
              )}
              <form className="asx-composer lg-glass is-menu" onSubmit={event => { event.preventDefault(); send(draft); }} aria-disabled={blocked || undefined}>
                <button type="button" className="asx-icon-btn is-soon" aria-disabled="true" aria-label={tr("แนบไฟล์ · เร็ว ๆ นี้")} title={tr("แนบไฟล์ · เร็ว ๆ นี้")}><Paperclip size={18} /></button>
                <label htmlFor="asx-message" className="asx-sr">{tr("ข้อความถึงเลขากระรอก")}</label>
                <textarea id="asx-message" ref={inputRef} rows={1} value={draft} disabled={blocked}
                  placeholder={level === 'empty' ? tr("โทเค็นหมด รอเติมรอบใหม่") : tr("ถามเลขากระรอกได้เลย")}
                  onFocus={() => { if (mode === 'sleeping' || mode === 'greeting') setMode(draft ? 'listening' : 'awake'); }}
                  onChange={event => onDraft(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Escape' && upsell) { setUpsell(false); return; } if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !mobile) { event.preventDefault(); send(draft); } }} />
                <button type="button" className="asx-icon-btn is-soon" aria-disabled="true" aria-label={tr("พูดแทนการพิมพ์ · เร็ว ๆ นี้")} title={tr("พูดแทนการพิมพ์ · เร็ว ๆ นี้")}><Mic size={18} /></button>
                <button type="submit" className="asx-send" disabled={busy || blocked || !draft.trim()} aria-label={tr("ส่งข้อความ")} title={tr("ส่งข้อความ")}><ArrowUp size={18} strokeWidth={2.4} /></button>
              </form>
              <p className="asx-hint">{tr("ตัวอย่างหน้าจอ · คำตอบเป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อ AI")}</p>
          </>
        </div>
      </div>
    </section>
  );
}
