import React from 'react';
import AssistantChat from '../../assistant/AssistantChat';
import type { AssistantTransport } from '../../assistant/assistantApi';
import type { AssistantMode, ChatCard, ChatGroup, Conversation, TokenBalance } from '../../assistant/assistantMock';
import { currentLanguage } from '../../../i18n/currentLanguage';

// The landing's chat with เลขา (owner, 2026-10-29: "สร้างใหม่ ... ให้มันชัด ซูมไปก็ยังชัดอยู่"): the app's real chat
// screen, drawn live in the page instead of a recording, so its type is the app's own fonts and weights and it stays
// sharp at any zoom. A script types three questions into it and a sample transport answers them; nothing leaves the
// browser and no AI is called. It cannot be clicked or typed into (inert), and it is drawn at the app's own size and
// scaled to fit the figure.

const noop = () => undefined;
const P = (n: number) => `p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4${n}`;

type Step = { said: string; wait: number; tokens: number; text: string; cards?: ChatCard[] };
const confirmed = (n: number, job: string, amount: string, labels: { title: string; job: string; value: string }) =>
  ({ kind: 'confirm', id: P(n), title: labels.title, changes: [{ label: labels.job, value: job }, { label: labels.value, value: amount }], status: 'applied', path: `/jobs?job=job-${'abc'[n - 1]}` }) as ChatCard;

/** What the visitor sees typed, and what เลขา answers, in the page's language. Written as the real เลขา writes (owner,
 *  2026-10-30: tidy, bold where it belongs): one short line, then a short list with bold labels, each line short enough
 *  for a phone. */
const SCRIPT: Record<'th' | 'en', Step[]> = {
  th: [
    { said: 'ใครยังไม่จ่ายบ้าง', wait: 2400, tokens: 6,
      text: 'ยังไม่ได้รับ 2 งาน รวม ฿12,500 ครับ\n\n- **คุณเอ:** ฿5,000 · เลยกำหนด 3 วัน\n- **ร้านบี:** ฿7,500 · ครบกำหนดวันนี้\n\nแนะนำให้ทักคุณเอก่อนครับ' },
    { said: 'พรุ่งนี้มีงานรีวิว 2 งาน งานละ 5,000 กับงานถ่ายรูปอีก 8,000 บันทึกให้หน่อย', wait: 2800, tokens: 9,
      text: 'บันทึกให้แล้ว 3 งาน รวม ฿18,000 ครับ\nรับเงินตามเครดิต 15 วัน',
      cards: [1, 2, 3].map(n => confirmed(n, n < 3 ? `รีวิวสินค้า (งานที่ ${n})` : 'ถ่ายรูปสินค้า', n < 3 ? '฿5,000' : '฿8,000', { title: 'เพิ่มงานใหม่ 1 งาน', job: 'งาน', value: 'มูลค่า' })) },
    { said: 'สรุปเดือนนี้ให้หน่อย', wait: 2600, tokens: 7,
      text: 'สรุปเดือนตุลาคม 2569 ครับ\n\n- **รับเงินแล้ว:** ฿13,000\n- **จ่ายไป:** ฿1,200\n- **คงเหลือ:** ฿11,800 (+฿2,400)',
      cards: [{ kind: 'summary', period: 'ตุลาคม 2569', income: '฿13,000', expense: '-฿1,200', balance: '฿11,800', previous: { change: '+฿2,400', direction: 'up' }, spentShare: 0.092 }] as ChatCard[] },
  ],
  en: [
    { said: 'Who hasn’t paid yet?', wait: 2400, tokens: 6,
      text: 'Two jobs are unpaid, ฿12,500 in all.\n\n- **Khun A:** ฿5,000 · 3 days late\n- **Shop B:** ฿7,500 · due today\n\nI’d message Khun A first.' },
    { said: 'Tomorrow: 2 reviews at 5,000 each and a photo job for 8,000. Save them.', wait: 2800, tokens: 9,
      text: 'Saved 3 jobs, ฿18,000 in all.\nPaid on 15-day credit.',
      cards: [1, 2, 3].map(n => confirmed(n, n < 3 ? `Product review (job ${n})` : 'Product photos', n < 3 ? '฿5,000' : '฿8,000', { title: 'New job', job: 'Job', value: 'Value' })) },
    { said: 'Sum up this month', wait: 2600, tokens: 7,
      text: 'Here’s October 2026.\n\n- **Received:** ฿13,000\n- **Spent:** ฿1,200\n- **Left:** ฿11,800 (+฿2,400)',
      cards: [{ kind: 'summary', period: 'October 2026', income: '฿13,000', expense: '-฿1,200', balance: '฿11,800', previous: { change: '+฿2,400', direction: 'up' }, spentShare: 0.092 }] as ChatCard[] },
  ],
};
const script = () => SCRIPT[currentLanguage === 'en' ? 'en' : 'th'];

/** Earlier chats in the sidebar, so the history reads like an account in use (titles only; they are never opened). */
const HISTORY: Record<'th' | 'en', { title: string; group: ChatGroup; daysAgo: number }[]> = {
  th: [
    { title: 'ช่วยทำใบเสนอราคาให้หน่อย', group: 'yesterday', daysAgo: 1 },
    { title: 'ใบเสนอราคาอยู่ตรงไหน', group: 'yesterday', daysAgo: 1 },
    { title: 'สรุปเดือนก่อน', group: 'week', daysAgo: 3 },
    { title: 'งานไหนใกล้ครบกำหนดรับเงิน', group: 'week', daysAgo: 4 },
  ],
  en: [
    { title: 'Make me a quotation', group: 'yesterday', daysAgo: 1 },
    { title: 'Where is the quotation?', group: 'yesterday', daysAgo: 1 },
    { title: 'Last month’s summary', group: 'week', daysAgo: 3 },
    { title: 'Which payments are due soon?', group: 'week', daysAgo: 4 },
  ],
};
const history = (now: number): Conversation[] => HISTORY[currentLanguage === 'en' ? 'en' : 'th'].map(({ title, group, daysAgo }, at) => {
  const time = now - daysAgo * 86_400_000 - at * 3_600_000;
  return { id: `c_demo-${at}`, title, group, sample: false, messages: [
    { id: `c_demo-${at}-q`, from: 'me', text: title, at: time },
    { id: `c_demo-${at}-a`, from: 'bot', text: currentLanguage === 'en' ? 'Done.' : 'เรียบร้อยครับ', at: time + 60_000 },
  ] };
});

/** The answer streamed a few letters at a time; a **bold** label arrives whole, so no stray asterisks ever show. */
const streamUnits = (text: string): string[] => text.split(/(\*\*[^*]+\*\*)/).flatMap(part => (part.startsWith('**') ? [part] : graphemes(part)));

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
      const steps = script();
      const step = steps[Math.min(turn++, steps.length - 1)];
      onMode('thinking');
      await pause(instant ? 0 : step.wait, signal);
      if (step.cards) onCards?.(step.cards);
      onMode('working');
      const parts = streamUnits(step.text);
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
      for (const step of script()) {
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
