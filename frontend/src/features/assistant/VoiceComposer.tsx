import React from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import type { DictationPhase } from './useDictation';
import { AUDIO_MAX_SECONDS, METER_MS } from './audioRecorder';

const STEP = 7;
const BAR = 3.5;
const FADE_BARS = 3;

/** The microphone's level as a row of bars. Owner, 2026-10-27 ("อยากได้มันสมูท 60 เฟรม ... ตอนนี้มันกระตุก"): drawn
 *  on every screen frame, the row glides left one bar per reading instead of jumping, the newest bar grows in at the
 *  right and the oldest fade out at the left. Reduced motion keeps a still row that shows the latest level. */
function Waveform({ levels, levelsAt, active, reduce }: { levels: React.RefObject<number[]>; levelsAt?: React.RefObject<number>; active: boolean; reduce: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let width = 0;
    let height = 0;
    let color = '';
    let frames = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      color = getComputedStyle(canvas).color;
    };
    const barHeight = (value: number) => 3 + Math.min(1, Math.sqrt(Math.max(0, value))) * (height - 7);
    const bar = (x: number, h: number) => { context.beginPath(); context.roundRect(x, (height - h) / 2, BAR, h, 2); context.fill(); };
    const draw = (now: number) => {
      // The colour follows the theme; read now and then, not on every frame.
      if (++frames % 30 === 0) color = getComputedStyle(canvas).color;
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      context.globalAlpha = 1;
      const count = Math.min(80, Math.floor(width / STEP));
      const left = (width - count * STEP) / 2;
      const samples = levels.current;
      if (!active || reduce || !levelsAt) {
        const latest = samples.at(-1) ?? 0;
        for (let i = 0; i < count; i += 1) bar(left + i * STEP, active ? barHeight(latest) : 3);
        return;
      }
      // How far the row has moved since the last reading (0 to 1 bar); a late reading holds the row still.
      const t = Math.min(1, Math.max(0, (now - levelsAt.current) / METER_MS));
      const grow = 1 - (1 - Math.min(1, t / 0.7)) ** 3;
      for (let j = 0; j <= count; j += 1) {
        const value = samples[samples.length - 1 - j] ?? 0;
        const x = left + (count - 1 - j - t) * STEP;
        const fade = Math.min(1, Math.max(0, (x - left + STEP) / (FADE_BARS * STEP)));
        if (fade <= 0) continue;
        const h = j === 0 ? 3 + (barHeight(value) - 3) * grow : barHeight(value);
        context.globalAlpha = fade;
        bar(x, h);
      }
      context.globalAlpha = 1;
    };
    resize();
    let frame = 0;
    let timer = 0;
    if (active && !reduce && levelsAt) {
      const loop = (now: number) => { draw(now); frame = window.requestAnimationFrame(loop); };
      frame = window.requestAnimationFrame(loop);
    } else {
      draw(performance.now());
      if (active) timer = window.setInterval(() => draw(performance.now()), 160);
    }
    const observer = new ResizeObserver(() => { resize(); draw(performance.now()); });
    observer.observe(canvas);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [levels, levelsAt, active, reduce]);
  return <canvas ref={ref} className="asx-voice-wave" aria-hidden="true" />;
}

export function VoiceComposer({ phase, seconds, levels, levelsAt, reduce, onCancel, onFinish }: {
  phase: DictationPhase; seconds: number; levels: React.RefObject<number[]>; levelsAt?: React.RefObject<number>; reduce: boolean;
  onCancel(): void; onFinish(): void;
}) {
  const recording = phase === 'recording';
  const status = phase === 'starting' ? tr('กำลังเปิดไมโครโฟน…') : recording ? tr('กำลังฟังอยู่') : tr('กำลังถอดเสียงเป็นข้อความ…');
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className={`asx-voice-composer${recording ? ' is-recording' : ''}`} role="group" aria-label={tr('พูดแทนการพิมพ์')}>
      <button ref={cancelRef} type="button" className="asx-icon-btn asx-voice-cancel" onClick={onCancel}
        aria-label={tr('ยกเลิกเสียงนี้')} title={tr('ยกเลิกเสียงนี้')}><X size={20} /></button>
      <div className="asx-voice-body">
        <div className="asx-voice-caption">
          <span role="status" aria-live="polite">{status}</span>
          <span className="asx-voice-time" aria-hidden="true">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / {Math.floor(AUDIO_MAX_SECONDS / 60)}:{String(AUDIO_MAX_SECONDS % 60).padStart(2, '0')}</span>
        </div>
        <Waveform levels={levels} levelsAt={levelsAt} active={recording} reduce={reduce} />
      </div>
      <button type="button" className="asx-send asx-voice-finish" disabled={!recording} onClick={onFinish}
        aria-label={tr('หยุดและถอดข้อความ')} title={tr('หยุดและถอดข้อความ')}>
        {recording ? <Check size={21} strokeWidth={2.5} /> : <LoaderCircle className="asx-voice-spinner" size={20} />}
      </button>
    </div>
  );
}
