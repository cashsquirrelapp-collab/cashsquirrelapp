import React from 'react';
import { useReducedMotion } from 'motion/react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { CANVAS, DemoApp } from './DemoApp';
import { baht, demoState } from './demoData';
import { DURATION, SCENES, frameAt, sceneStill, type CamTarget, type DemoFrame } from './demoScript';
import { usePlayback, type Playback } from './usePlayback';

// The product demo: one stage that plays the four-scene script (demoScript) over the sample data
// (demoData). A "camera" moves over the app (DemoApp) instead of shrinking it: wide stages start
// on the whole app and move in; tall stages re-frame region by region so text stays readable.
// The landing page and the capture page both render this component.
//
//  arrangement  'stack'  caption above the window (landing, desktop)
//               'tall'   caption, window, callout in a column (phones, 9:16 capture)
//               'side'   caption beside the window (16:9 capture)
//               'auto'   'stack', or 'tall' when the stage is narrow

export type Arrangement = 'auto' | 'stack' | 'tall' | 'side';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** An element's box inside `root`, from layout offsets (so transforms and animations don't skew it). */
function boxIn(root: HTMLElement, el: HTMLElement) {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) { x += node.offsetLeft; y += node.offsetTop; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/** Size of whatever element the returned ref is on right now (the stage re-mounts when the layout flips). */
function useSize<T extends HTMLElement>() {
  const [node, setNode] = React.useState<T | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    if (!node) return;
    const update = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, size, node] as const;
}

function Caption({ frame, large }: { frame: DemoFrame; large: boolean }) {
  const scene = SCENES[frame.scene];
  return (
    <div aria-hidden="true" className="min-w-0">
      <p className="font-mono text-[12px] tracking-[0.12em] text-[#A39D96]">{String(frame.scene + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}</p>
      <div key={scene.id} className="pd-caption">
        <p className={`mt-1.5 font-semibold leading-[1.12] tracking-[-0.02em] text-[#1C1917] ${large ? 'text-[clamp(1.75rem,1.2rem+2.2vw,2.6rem)]' : 'text-[clamp(1.35rem,1.1rem+1vw,1.75rem)]'}`} style={{ fontFamily: "'IBM Plex Sans', var(--font-sans)" }}>{scene.heading}</p>
        <p className={`mt-1.5 leading-relaxed text-[#57514B] ${large ? 'text-[clamp(1rem,0.9rem+0.5vw,1.25rem)]' : 'text-[15px]'}`}>{scene.thai}</p>
      </div>
    </div>
  );
}

/** ยอดงาน / รับแล้ว / คงเหลือ of the job the story follows. A caption over the demo, not app UI. */
function Callout({ frame, visible }: { frame: DemoFrame; visible: boolean }) {
  const { focus } = demoState(frame.paid);
  const cell = (label: string, value: number, tone: string, mark?: string) => (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[12px] text-[#77716B]">{mark && <span className={`h-2 w-2 rounded-full ${mark}`} />}{label}</dt>
      <dd key={value} className={`pd-swap mt-0.5 font-mono text-[18px] font-semibold tabular-nums ${tone}`}>{baht(value)}</dd>
    </div>
  );
  return (
    <div aria-hidden="true" className={`rounded-2xl border border-[#E7E4DF] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(60,40,28,0.08)] transition-[opacity,transform] duration-500 ${visible ? 'opacity-100' : 'pointer-events-none translate-y-1.5 opacity-0'}`}>
      <p className="truncate text-[13px] font-medium text-[#1C1917]">{focus.name} <span className="font-normal text-[#A39D96]">· {focus.client}</span></p>
      <dl className="mt-2 grid grid-cols-3 gap-4">
        {cell('ยอดงาน', focus.value, 'text-[#1C1917]')}
        {cell('รับแล้ว', focus.received, 'text-[#12804F]', 'bg-[#18A66A]')}
        {cell('คงเหลือ', focus.remaining, 'text-[#C24A16]', 'bg-[#E65F2B]')}
      </dl>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#FBE3D5]">
        <span className="block h-full rounded-full bg-[#18A66A] transition-[width] duration-700" style={{ width: `${(focus.received / focus.value) * 100}%`, transitionTimingFunction: EASE }} />
      </div>
    </div>
  );
}

function Controls({ playback, still, onStill }: { playback: Playback; still: number | null; onStill: (scene: number) => void }) {
  const fills = React.useRef<(HTMLSpanElement | null)[]>([]);
  React.useEffect(() => playback.onTick(ms => {
    SCENES.forEach((scene, i) => {
      const end = SCENES[i + 1]?.start ?? DURATION;
      const el = fills.current[i];
      if (el) el.style.transform = `scaleX(${Math.max(0, Math.min(1, (ms - scene.start) / (end - scene.start)))})`;
    });
  }), [playback]);
  const round = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#DCD6CF] bg-white text-[#1C1917] transition-colors hover:border-[#1C1917] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] cursor-pointer';
  return (
    <div className="flex items-center gap-3">
      {still === null && (
        <>
          <button type="button" onClick={playback.toggle} className={round} aria-label={playback.playing ? 'หยุดตัวอย่างชั่วคราว' : playback.ended ? 'เล่นตัวอย่างอีกครั้ง' : 'เล่นตัวอย่างต่อ'} data-testid="demo-toggle">
            {playback.playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button type="button" onClick={playback.restart} className={round} aria-label="เล่นตัวอย่างใหม่ตั้งแต่ต้น" data-testid="demo-replay"><RotateCcw className="h-4 w-4" /></button>
        </>
      )}
      <div className="flex min-w-0 flex-1 gap-1.5" role="group" aria-label="ฉากของตัวอย่าง">
        {SCENES.map((scene, i) => (
          <button key={scene.id} type="button" onClick={() => (still === null ? playback.seekScene(i) : onStill(i))} aria-label={`ฉากที่ ${i + 1}: ${scene.thai}`} aria-pressed={still === null ? undefined : still === i}
            className="group h-10 min-w-0 flex-1 cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E65F2B]">
            <span className="block h-1 overflow-hidden rounded-full bg-[#E4DFD9] transition-colors group-hover:bg-[#D6D0C9]">
              <span ref={el => { fills.current[i] = el; }} className="block h-full origin-left rounded-full bg-[#1C1917]" style={{ transform: still === null ? 'scaleX(0)' : `scaleX(${still === i ? 1 : 0})` }} />
            </span>
          </button>
        ))}
      </div>
      <span className="shrink-0 rounded-full bg-[#F1ECE6] px-2.5 py-1 text-[12px] text-[#57514B]">ข้อมูลตัวอย่าง</span>
    </div>
  );
}

export function ProductDemo({ arrangement = 'auto', playback: external, showControls = true, autoplayInView = true, replayKey = 0, className = '' }: {
  arrangement?: Arrangement;
  /** Change this to restart the demo from outside (the hero's "ดูการทำงาน"). */
  replayKey?: number;
  /** Supply a playback to drive the demo from outside (capture page); otherwise it runs itself. */
  playback?: Playback;
  showControls?: boolean;
  /** Play while on screen and pause when scrolled away or the tab is hidden. */
  autoplayInView?: boolean;
  className?: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const own = usePlayback({ autoplay: false, enabled: !external && !reduce });
  const playback = external ?? own;
  const [rootRef, rootSize, rootNode] = useSize<HTMLDivElement>();
  const [viewRef, view] = useSize<HTMLDivElement>();
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [still, setStill] = React.useState(0);

  // Below ~880px the wide app would be scaled too small to read, so the stage re-frames instead.
  const layout = arrangement === 'auto' ? (rootSize.w > 0 && rootSize.w < 880 ? 'tall' : 'stack') : arrangement;
  const tall = layout === 'tall';
  const frame = reduce && !external ? sceneStill(still) : frameAt(playback.index);
  const state = React.useMemo(() => demoState(frame.paid), [frame.paid]);
  const canvas = tall ? CANVAS.compact : CANVAS.wide;
  const target: CamTarget = tall ? frame.cam.tall : frame.cam.wide;

  // Camera: fit the target region into the window, never showing past the app's edges.
  const [cam, setCam] = React.useState({ x: 0, y: 0, s: 1 });
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);
  React.useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root || !view.w || !view.h) return;
    const el = target === 'full' ? null : root.querySelector<HTMLElement>(`[data-frame="${target}"]`);
    if (target !== 'full' && !el) return; // region not on screen (yet): hold the current framing
    const box = el ? boxIn(root, el) : { x: 0, y: 0, w: canvas.w, h: canvas.h };
    const pad = el ? (tall ? 20 : 56) : 0;
    const fit = Math.min(view.w / (box.w + pad * 2), view.h / (box.h + pad * 2));
    const cover = Math.max(view.w / canvas.w, view.h / canvas.h); // smallest zoom that leaves no gap
    const s = Math.max(cover, Math.min(fit, 1.7));
    const clamp = (value: number, size: number, viewSize: number) => Math.min(0, Math.max(viewSize - size * s, value));
    setCam({ s, x: clamp(view.w / 2 - (box.x + box.w / 2) * s, canvas.w, view.w), y: clamp(view.h / 2 - (box.y + box.h / 2) * s, canvas.h, view.h) });
  }, [target, view.w, view.h, canvas.w, canvas.h, tall, frame.view, frame.sheet]);
  React.useLayoutEffect(() => {
    const root = canvasRef.current;
    const el = root && frame.cursor ? root.querySelector<HTMLElement>(`[data-cur="${frame.cursor}"]`) : null;
    if (!root || !el) { if (!frame.cursor) setCursor(null); return; }
    const box = boxIn(root, el);
    setCursor({ x: box.x + box.w * 0.62, y: box.y + box.h * 0.6 });
  }, [frame.cursor, frame.view, frame.menu, frame.sheet, tall]);

  // Seeks, replays and resizes cut; only playing eases.
  const [snap, setSnap] = React.useState(true);
  React.useLayoutEffect(() => { setSnap(true); const id = requestAnimationFrame(() => requestAnimationFrame(() => setSnap(false))); return () => cancelAnimationFrame(id); }, [playback.jump, view.w, view.h, tall, still]);

  // Landing: play while visible, pause when scrolled away or the tab is hidden. A pause the viewer
  // pressed themselves is respected until they press play.
  const auto = React.useRef({ wasAuto: false, started: false });
  const { playing, play, pause } = playback;
  React.useEffect(() => {
    if (external || reduce || !autoplayInView) return;
    const el = rootNode;
    if (!el) return;
    let visible = false;
    const sync = () => {
      const show = visible && !document.hidden;
      if (show && (!auto.current.started || auto.current.wasAuto)) { auto.current = { started: true, wasAuto: false }; play(); }
      else if (!show && playingRef.current) { auto.current.wasAuto = true; pause(); }
    };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.35 });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, [external, reduce, autoplayInView, play, pause, rootNode]);
  const playingRef = React.useRef(playing);
  playingRef.current = playing;
  const { restart } = playback;
  React.useEffect(() => { if (replayKey > 0 && !reduce) { auto.current = { started: true, wasAuto: false }; restart(); } }, [replayKey, reduce, restart]);

  const windowAspect = layout === 'stack' ? '16 / 10' : layout === 'tall' && arrangement === 'auto' ? (rootSize.w < 520 ? '5 / 6' : '4 / 3') : undefined;
  const calloutOn = frame.callout;
  const appWindow = (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#DDD7D0] bg-white shadow-[0_2px_6px_rgba(60,40,28,0.05),0_30px_70px_-20px_rgba(60,40,28,0.28)] ${windowAspect ? '' : 'h-full'}`}>
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[#ECE9E5] bg-[#F7F4F0] px-3.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#E0DAD3]" /><span className="h-2.5 w-2.5 rounded-full bg-[#E0DAD3]" /><span className="h-2.5 w-2.5 rounded-full bg-[#E0DAD3]" />
        <span className="mx-auto rounded-md bg-white px-3 py-0.5 text-[11px] text-[#A39D96]">กระรอกตุนเงิน</span>
        <span className="w-[42px]" />
      </div>
      <div ref={viewRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#FAFAF9]" style={windowAspect ? { aspectRatio: windowAspect } : undefined} aria-hidden="true" data-testid="demo-viewport">
        <div className="absolute left-0 top-0 origin-top-left will-change-transform" data-testid="demo-camera"
          style={{ width: canvas.w, height: canvas.h, transform: `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.s})`, transition: snap || reduce ? 'none' : `transform 850ms ${EASE}` }}>
          <div ref={canvasRef} className="relative"><DemoApp state={state} frame={frame} compact={tall} /></div>
          <div className="pointer-events-none absolute left-0 top-0 z-40" style={{ transform: `translate3d(${cursor?.x ?? canvas.w * 0.6}px, ${cursor?.y ?? canvas.h * 0.55}px, 0)`, opacity: cursor ? 1 : 0, transition: snap ? 'none' : `transform 620ms ${EASE}, opacity 250ms linear` }}>
            <svg width="22" height="24" viewBox="0 0 22 24" className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)]"><path d="M2 2l16 8.2-6.6 1.9L8.7 19z" fill="#1C1917" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            {frame.clicks > 0 && <span key={frame.clicks} className="pd-ring absolute left-[-9px] top-[-9px] h-7 w-7 rounded-full border-2 border-[#E65F2B]" />}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`pd-root ${className}`} data-layout={layout} data-scene={frame.scene} data-paid={frame.paid ? '1' : '0'} data-testid="product-demo">
      {/* The same story in words, for screen readers and anyone who doesn't watch the animation. */}
      <p className="sr-only">
        ตัวอย่างการใช้งานด้วยข้อมูลสมมติ: หน้าภาพรวมแสดงมูลค่างานเดือนนี้ เงินที่รับแล้ว และเงินที่รอรับ จากนั้นเปิดงานตัดต่อวิดีโอ ยอดงาน 6,000 บาท รับแล้ว 2,000 บาท คงเหลือ 4,000 บาท
        บันทึกรับเงินงวดถัดไป 1,000 บาท ยอดรับแล้วเป็น 3,000 บาท และคงเหลือ 3,000 บาท หน้าภาพรวมอัปเดตเป็นรับเงินจริง 7,500 บาท และรอรับเงิน 6,000 บาท
      </p>
      {layout === 'side' ? (
        <div className="grid h-full grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] items-center gap-12">
          <div className="space-y-8"><Caption frame={frame} large /><Callout frame={frame} visible={calloutOn} /></div>
          <div className="h-full min-h-0">{appWindow}</div>
        </div>
      ) : tall ? (
        <div className={`flex flex-col gap-4 ${arrangement === 'tall' ? 'h-full' : ''}`}>
          <div className="min-h-[5.75rem]"><Caption frame={frame} large={arrangement === 'tall'} /></div>
          <div className={arrangement === 'tall' ? 'min-h-0 flex-1' : ''}>{appWindow}</div>
          <Callout frame={frame} visible={calloutOn} />
        </div>
      ) : (
        <div>
          <div className="mb-5 grid min-h-[6.5rem] items-end gap-6 text-left sm:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <Caption frame={frame} large={false} />
            <Callout frame={frame} visible={calloutOn} />
          </div>
          {appWindow}
        </div>
      )}
      {showControls && <div className="mt-4"><Controls playback={playback} still={reduce && !external ? still : null} onStill={setStill} /></div>}
      <style>{`
        .pd-view { animation: pdView 320ms ${EASE} both; }
        @keyframes pdView { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .pd-caption { animation: pdCaption 450ms ${EASE} both; }
        @keyframes pdCaption { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .pd-swap { animation: pdSwap 420ms ${EASE} both; }
        @keyframes pdSwap { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        .pd-pop { animation: pdPop 160ms ease-out both; transform-origin: top left; }
        @keyframes pdPop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
        .pd-rise { animation: pdRise 380ms ${EASE} both; }
        @keyframes pdRise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        .pd-fade { animation: pdFade 250ms linear both; }
        @keyframes pdFade { from { opacity: 0; } to { opacity: 1; } }
        .pd-grow { animation: pdGrow 600ms ${EASE} both; transform-origin: bottom; }
        @keyframes pdGrow { from { transform: scaleY(0); } to { transform: none; } }
        .pd-ring { animation: pdRing 420ms ease-out both; }
        @keyframes pdRing { from { opacity: 0.9; transform: scale(0.4); } to { opacity: 0; transform: scale(1.5); } }
        @media (prefers-reduced-motion: reduce) {
          .pd-view, .pd-caption, .pd-swap, .pd-pop, .pd-rise, .pd-fade, .pd-grow, .pd-ring { animation: none; }
        }
      `}</style>
    </div>
  );
}
