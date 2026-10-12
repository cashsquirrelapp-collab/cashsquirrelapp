import React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { BrandLockup } from '../../components/brand/BrandLogo';
import { LIGHT_VARS } from './landing/primitives';
import { ProductDemo } from './landing/demo/ProductDemo';
import { SCENES } from './landing/demo/demoScript';
import { usePlayback } from './landing/demo/usePlayback';

// /demo-capture: the product demo on a fixed artboard, for screen-recording a clip. It is the same
// component, script and sample data as the landing page -- there is no video export here, you
// record the screen. Not linked from anywhere in the app.
//
//   ?ratio=16x9 | 9x16   artboard (record at 1920x1080 or 1080x1920; it scales to fit the window)
//   ?controls=0          start with the control bar hidden (H toggles it)
//   ?autoplay=1          start playing shortly after load
//   ?scene=1..4          start from that scene
// Keys: Space play/pause · R restart · 1-4 scene · H hide/show controls

const BOARD = { '16x9': { w: 1280, h: 720 }, '9x16': { w: 720, h: 1280 } } as const;
type Ratio = keyof typeof BOARD;

export default function DemoCapturePage() {
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const [ratio, setRatio] = React.useState<Ratio>(params.get('ratio') === '9x16' ? '9x16' : '16x9');
  const [controls, setControls] = React.useState(params.get('controls') !== '0');
  const playback = usePlayback({ autoplay: false });
  const { toggle, restart, seekScene, play, pause } = playback;
  const [fit, setFit] = React.useState(1);
  const board = BOARD[ratio];

  React.useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  React.useEffect(() => {
    const update = () => setFit(Math.min(window.innerWidth / board.w, (window.innerHeight - (controls ? 64 : 0)) / board.h));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [board.w, board.h, controls]);

  React.useEffect(() => {
    const scene = Number(params.get('scene'));
    const autoplay = params.get('autoplay') === '1';
    if (scene >= 1 && scene <= SCENES.length) { seekScene(scene - 1); if (!autoplay) pause(); return; }
    if (!autoplay) return;
    const id = window.setTimeout(play, 800);
    return () => window.clearTimeout(id);
  }, [params, seekScene, play, pause]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'r' || e.key === 'R') restart();
      else if (e.key === 'h' || e.key === 'H') setControls(v => !v);
      else if (/^[1-4]$/.test(e.key)) seekScene(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, restart, seekScene]);

  const button = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#3A3A40] px-3 text-[13px] text-[#F5F2EE] hover:bg-[#2A2A30] cursor-pointer';
  return (
    <div className="fixed inset-0 flex flex-col bg-[#141416]" style={{ ...LIGHT_VARS, fontFamily: 'var(--font-sans)', colorScheme: 'light' }}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 origin-center bg-[#FAF8F5] text-[#1C1917]" data-testid="capture-board" data-ratio={ratio}
          style={{ width: board.w, height: board.h, transform: `translate(-50%, -50%) scale(${fit})` }}>
          <div className={`flex h-full flex-col ${ratio === '16x9' ? 'px-14 py-12' : 'px-10 py-14'}`}>
            <div className="flex items-center justify-between">
              <BrandLockup size={ratio === '16x9' ? 30 : 34} />
              <span className="rounded-full bg-[#F1ECE6] px-3 py-1 text-[12px] text-[#57514B]">ข้อมูลตัวอย่าง</span>
            </div>
            <div className="mt-8 min-h-0 flex-1">
              <ProductDemo arrangement={ratio === '16x9' ? 'side' : 'tall'} playback={playback} showControls={false} className="h-full" />
            </div>
          </div>
        </div>
      </div>
      {controls && (
        <div className="flex h-16 shrink-0 items-center gap-2 overflow-x-auto border-t border-[#2A2A30] bg-[#1C1B1F] px-4" data-testid="capture-controls">
          <button type="button" onClick={toggle} className={button} aria-label={playback.playing ? 'Pause' : 'Play'}>{playback.playing ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Play</>}</button>
          <button type="button" onClick={restart} className={button}><RotateCcw className="h-4 w-4" />Restart</button>
          <span className="mx-1 h-5 w-px bg-[#3A3A40]" />
          {SCENES.map((scene, i) => <button key={scene.id} type="button" onClick={() => seekScene(i)} className={button} title={scene.heading}>ฉาก {i + 1}</button>)}
          <span className="mx-1 h-5 w-px bg-[#3A3A40]" />
          {(Object.keys(BOARD) as Ratio[]).map(key => (
            <button key={key} type="button" onClick={() => { setRatio(key); restart(); pause(); }} aria-pressed={ratio === key} className={`${button} ${ratio === key ? 'border-[#E65F2B] text-[#FFB48F]' : ''}`}>{key === '16x9' ? '16:9' : '9:16'}</button>
          ))}
          <button type="button" onClick={() => setControls(false)} className={button}>ซ่อนแถบนี้ (H)</button>
          <span className="ml-auto whitespace-nowrap pl-3 text-[12px] text-[#8E8983]">หน้าสำหรับบันทึกหน้าจอ · Space เล่น/หยุด · R เริ่มใหม่ · 1-4 เลือกฉาก</span>
        </div>
      )}
    </div>
  );
}
