import React from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import type { DictationPhase } from './useDictation';
import { AUDIO_MAX_SECONDS } from './audioRecorder';

function Waveform({ levels, active, reduce }: { levels: React.RefObject<number[]>; active: boolean; reduce: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      const count = Math.min(80, Math.floor(width / 7));
      const samples = levels.current.slice(-count);
      context.fillStyle = getComputedStyle(canvas).color;
      const latest = levels.current.at(-1) ?? 0;
      for (let i = 0; i < count; i += 1) {
        // Reduced motion keeps the display in place instead of scrolling its history.
        const value = active ? (reduce ? latest : samples[i] ?? 0) : 0;
        const bar = 3 + Math.min(1, Math.sqrt(value)) * (height - 7);
        const x = (width - count * 7) / 2 + i * 7;
        context.beginPath();
        context.roundRect(x, (height - bar) / 2, 3.5, bar, 2);
        context.fill();
      }
    };
    resize(); draw();
    const observer = new ResizeObserver(() => { resize(); draw(); });
    observer.observe(canvas);
    const timer = window.setInterval(draw, reduce ? 160 : 80);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [levels, active, reduce]);
  return <canvas ref={ref} className="asx-voice-wave" aria-hidden="true" />;
}

export function VoiceComposer({ phase, seconds, levels, reduce, onCancel, onFinish }: {
  phase: DictationPhase; seconds: number; levels: React.RefObject<number[]>; reduce: boolean;
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
        <Waveform levels={levels} active={recording} reduce={reduce} />
      </div>
      <button type="button" className="asx-send asx-voice-finish" disabled={!recording} onClick={onFinish}
        aria-label={tr('หยุดและถอดข้อความ')} title={tr('หยุดและถอดข้อความ')}>
        {recording ? <Check size={21} strokeWidth={2.5} /> : <LoaderCircle className="asx-voice-spinner" size={20} />}
      </button>
    </div>
  );
}
