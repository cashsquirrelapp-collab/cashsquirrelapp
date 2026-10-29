import React from 'react';
import AssistantChat from '../../assistant/AssistantChat';
import type { AssistantTransport } from '../../assistant/assistantApi';
import type { AssistantMode, ChatCard, ChatGroup, Conversation, TokenBalance } from '../../assistant/assistantMock';

// The landing's chat with เลขา (owner, 2026-10-29: "สร้างใหม่ ... ให้มันชัด ซูมไปก็ยังชัดอยู่"): the app's real chat
// screen, drawn live in the page instead of a recording, so its type is the app's own fonts and weights and it stays
// sharp at any zoom. A script types three questions into it and a sample transport answers them; nothing leaves the
// browser and no AI is called. It cannot be clicked or typed into (inert), and it is drawn at the app's own size and
// scaled to fit the figure.

const noop = () => undefined;
const P = (n: number) => `p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4${n}`;

/** What the visitor sees typed, and what เลขา answers (the same sample data as the earlier recording). */
const SCRIPT: { said: string; wait: number; tokens: number; text: string; cards?: ChatCard[] }[] = [
  { said: 'ใครยังไม่จ่ายบ้าง', wait: 2400, tokens: 6,
    text: 'ตอนนี้มีงานที่ยังไม่ได้รับเงิน 2 งาน รวม ฿12,500 ครับ\n\n1. รีวิวสินค้า · คุณเอ ฿5,000 เลยกำหนดมา 3 วันแล้ว\n2. ถ่ายรูปสินค้า · ร้านบี ฿7,500 ครบกำหนดวันนี้\n\nแนะนำให้ทักคุณเอก่อนครับ เพราะเลยกำหนดนานที่สุด' },
  { said: 'พรุ่งนี้มีงานรีวิว 2 งาน งานละ 5,000 กับงานถ่ายรูปอีก 8,000 บันทึกให้หน่อย', wait: 2800, tokens: 9,
    text: 'บันทึกงานให้แล้ว 3 งาน รวม ฿18,000 ครับ วันรับเงินตั้งไว้ตามเครดิต 15 วัน กด "เปิดดูงาน" เพื่อดูหรือแก้ไขได้เลย',
    cards: [
      { kind: 'confirm', id: P(1), title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'รีวิวสินค้า (งานที่ 1)' }, { label: 'มูลค่า', value: '฿5,000' }], status: 'applied', path: '/jobs?job=job-a' },
      { kind: 'confirm', id: P(2), title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'รีวิวสินค้า (งานที่ 2)' }, { label: 'มูลค่า', value: '฿5,000' }], status: 'applied', path: '/jobs?job=job-b' },
      { kind: 'confirm', id: P(3), title: 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: 'ถ่ายรูปสินค้า' }, { label: 'มูลค่า', value: '฿8,000' }], status: 'applied', path: '/jobs?job=job-c' },
    ] as ChatCard[] },
  { said: 'สรุปเดือนนี้ให้หน่อย', wait: 2600, tokens: 7,
    text: 'สรุปเดือนตุลาคมครับ รับเงินแล้ว ฿13,000 จ่ายไป ฿1,200 เหลือ ฿11,800 ดีกว่าเดือนก่อน ฿2,400 และยังรอรับอีก ฿12,500 จาก 2 งาน',
    cards: [{ kind: 'summary', period: 'ตุลาคม 2569', income: '฿13,000', expense: '-฿1,200', balance: '฿11,800', previous: { change: '+฿2,400', direction: 'up' }, spentShare: 0.092 }] as ChatCard[] },
];

/** Earlier chats in the sidebar, so the history reads like an account in use (titles only; they are never opened). */
const HISTORY: { title: string; group: ChatGroup; daysAgo: number }[] = [
  { title: 'ช่วยทำใบเสนอราคาให้หน่อย', group: 'yesterday', daysAgo: 1 },
  { title: 'ใบเสนอราคาอยู่ตรงไหน', group: 'yesterday', daysAgo: 1 },
  { title: 'สรุปเดือนก่อน', group: 'week', daysAgo: 3 },
  { title: 'งานไหนใกล้ครบกำหนดรับเงิน', group: 'week', daysAgo: 4 },
];
const history = (now: number): Conversation[] => HISTORY.map(({ title, group, daysAgo }, at) => {
  const time = now - daysAgo * 86_400_000 - at * 3_600_000;
  return { id: `c_demo-${at}`, title, group, sample: false, messages: [
    { id: `c_demo-${at}-q`, from: 'me', text: title, at: time },
    { id: `c_demo-${at}-a`, from: 'bot', text: 'เรียบร้อยครับ', at: time + 60_000 },
  ] };
});

const graphemes = (text: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg('th', { granularity: 'grapheme' }).segment(text), part => part.segment) : Array.from(text);
};
const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('stopped', 'AbortError')); return; }
  const timer = window.setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('stopped', 'AbortError')); }, { once: true });
});

/** The answers, streamed the way the real เลขา's are; the squirrel beside the screen follows them. */
function scriptedTransport(instant: boolean, onMode: (mode: AssistantMode) => void, onAnswered: () => void): AssistantTransport {
  let turn = 0;
  let balance: TokenBalance = { remaining: 1600, total: 1650, refillsOn: '2026-11-15T17:00:00.000Z' };
  return {
    live: true,
    plan: 'pro',
    async send(_input, onDelta, signal, onCards) {
      const step = SCRIPT[Math.min(turn++, SCRIPT.length - 1)];
      onMode('thinking');
      await pause(instant ? 0 : step.wait, signal);
      if (step.cards) onCards?.(step.cards);
      onMode('working');
      const parts = graphemes(step.text);
      for (let shown = 0; shown < parts.length;) {
        shown = instant ? parts.length : Math.min(parts.length, shown + 3);
        onDelta(parts.slice(0, shown).join(''));
        if (shown < parts.length) await pause(24, signal);
      }
      balance = { ...balance, remaining: balance.remaining - step.tokens };
      onMode(step.cards?.some(card => card.kind === 'confirm') ? 'done' : 'answered');
      window.setTimeout(onAnswered, 0);
      return { text: step.text, cards: step.cards, tokensUsed: step.tokens };
    },
    async conversations() { return history(Date.now()); },
    async balance() { return { ...balance }; },
    async confirm() { return { ok: true }; },
    async remove() {},
  };
}

/** Puts text into the composer the way typing does (React reads the input event). */
function typeInto(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** `width` × `height`: the app's window size the screen is drawn at (the figure scales it to fit). */
export default function ChatLive({ phone, still, width, height, onMode }: { phone: boolean; still: boolean; width: number; height: number; onMode: (mode: AssistantMode) => void }) {
  const [round, setRound] = React.useState(0);
  const host = React.useRef<HTMLDivElement>(null);
  const modeRef = React.useRef(onMode);
  modeRef.current = onMode;
  const answeredRef = React.useRef<(() => void) | null>(null);
  const transport = React.useMemo(() => scriptedTransport(still, mode => modeRef.current(mode), () => { answeredRef.current?.(); answeredRef.current = null; }), [still, round]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const root = host.current;
    if (!root) return;
    const stop = new AbortController();
    const { signal } = stop;
    const composer = () => root.querySelector<HTMLTextAreaElement>('#asx-message');
    const run = async () => {
      modeRef.current('greeting');
      for (let tries = 0; !composer() && tries < 100; tries++) await pause(100, signal);
      await pause(still ? 0 : 2200, signal);
      for (const step of SCRIPT) {
        const input = composer();
        if (!input) return;
        modeRef.current('listening');
        if (still) typeInto(input, step.said);
        else for (const [at] of graphemes(step.said).entries()) { typeInto(input, graphemes(step.said).slice(0, at + 1).join('')); await pause(step.said.length > 30 ? 55 : 95, signal); }
        await pause(still ? 0 : 700, signal);
        const answered = new Promise<void>(resolve => { answeredRef.current = resolve; });
        root.querySelector<HTMLButtonElement>('.asx-send')?.click();
        // the answer streams in; then a moment to read it
        await Promise.race([answered, pause(20000, signal)]);
        await pause(still ? 100 : 3600, signal);
      }
      if (still) return;
      await pause(6000, signal);
      setRound(value => value + 1); // from the start again, as a fresh chat
    };
    run().catch(() => undefined);
    return () => stop.abort();
  }, [round, still]);

  return (
    <div ref={host} className={`cl-chatlive-stage${phone ? ' is-phone' : ''}`} style={{ width, height }} inert aria-hidden="true">
      <AssistantChat key={round} mobile={phone} isPro transport={transport} onOpenNotifications={noop} onUpgrade={noop} onNavigate={noop} onAutoNavigate={noop} />
    </div>
  );
}
