import React from 'react';
import { tr, trServer } from '../../i18n/tr';
import type { AssistantTransport } from './assistantApi';
import { AudioRecorderError, createAudioRecorder, isSupported, type AudioRecorder } from './audioRecorder';

export type DictationPhase = 'idle' | 'starting' | 'recording' | 'transcribing';
type Session = {
  recorder: AudioRecorder;
  abort: AbortController;
  phase: DictationPhase;
  before: string;
  transcribe: NonNullable<AssistantTransport['transcribe']>;
  language: 'th-TH' | 'en-US';
};

function explain(error: unknown): string {
  if (!(error instanceof AudioRecorderError)) return trServer((error as Error)?.message || tr('ถอดเสียงไม่สำเร็จ กรุณาลองอีกครั้ง'));
  if (error.code === 'denied') return tr('ยังไม่ได้อนุญาตให้ใช้ไมโครโฟน เปิดสิทธิ์ไมโครโฟนให้เว็บนี้แล้วลองอีกครั้ง');
  if (error.code === 'no-microphone') return tr('ไม่พบไมโครโฟน ลองเชื่อมต่อไมค์แล้วกดอีกครั้ง');
  if (error.code === 'no-speech' || error.code === 'too-short') return tr('ไม่ได้ยินเสียง กดไมค์แล้วลองพูดอีกครั้ง');
  if (error.code === 'unsupported') return tr('เบราว์เซอร์นี้ยังพูดแทนการพิมพ์ไม่ได้');
  return tr('ใช้การพูดไม่ได้ในตอนนี้ ลองพิมพ์แทนได้');
}

/** Capture locally, then make exactly one transcription request when the person stops. */
export function useDictation(options: {
  transport: AssistantTransport;
  language: string;
  onText(text: string): void;
  onCharged(): void;
}) {
  const [phase, setPhase] = React.useState<DictationPhase>('idle');
  const [seconds, setSeconds] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [review, setReview] = React.useState(false);
  // The canvas reads these samples without re-rendering the entire chat at audio frame rate.
  const levels = React.useRef<number[]>(Array(80).fill(0));
  const session = React.useRef<Session | null>(null);
  const mounted = React.useRef(true);
  const latest = React.useRef(options); latest.current = options;
  const finishRef = React.useRef<() => void>(() => {});

  const cancel = React.useCallback(() => {
    const old = session.current;
    session.current = null;
    old?.abort.abort();
    old?.recorder.cancel();
    setPhase('idle');
    levels.current.fill(0);
  }, []);

  const fail = React.useCallback((recording: Session, failure: unknown) => {
    if (session.current !== recording) return;
    cancel();
    setError(explain(failure));
  }, [cancel]);

  const finish = React.useCallback(async () => {
    const recording = session.current;
    if (!recording || recording.phase !== 'recording') return;
    recording.phase = 'transcribing'; // Synchronous guard against two clicks/automatic limit.
    setPhase('transcribing');
    try {
      const audio = await recording.recorder.finish();
      if (session.current !== recording) return;
      let reply;
      try { reply = await recording.transcribe(audio, recording.language, recording.abort.signal); }
      finally {
        // Even an unusable/cancelled response can be billed. Never refresh a different account's UI.
        if (mounted.current && latest.current.transport.transcribe === recording.transcribe) latest.current.onCharged();
      }
      if (session.current !== recording) return;
      const text = reply.text.trim();
      session.current = null;
      setPhase('idle');
      if (!text) { setError(tr('ไม่ได้ยินเสียง กดไมค์แล้วลองพูดอีกครั้ง')); return; }
      latest.current.onText((recording.before.trim() ? recording.before.trimEnd() + ' ' : '') + text);
      setReview(true);
    } catch (failure) { fail(recording, failure); }
  }, [fail]);
  finishRef.current = () => { void finish(); };

  const start = React.useCallback(async (before: string) => {
    if (session.current || !latest.current.transport.transcribe) return;
    setError(null);
    setReview(false);
    setSeconds(0);
    levels.current.fill(0);
    const recording: Session = {
      abort: new AbortController(), phase: 'starting', before,
      language: latest.current.language.startsWith('th') ? 'th-TH' : 'en-US',
      transcribe: latest.current.transport.transcribe,
      recorder: createAudioRecorder({
        onLevel: level => {
          if (session.current !== recording) return;
          levels.current.push(level); levels.current.shift();
        },
        onElapsed: elapsed => { if (session.current === recording) setSeconds(Math.floor(elapsed)); },
        onLimit: () => { if (session.current === recording) finishRef.current(); },
        onError: failure => fail(recording, failure),
      }),
    };
    session.current = recording;
    setPhase('starting');
    try {
      await recording.recorder.start();
      if (session.current !== recording) { recording.recorder.cancel(); return; }
      recording.phase = 'recording';
      setPhase('recording');
    } catch (failure) { fail(recording, failure); }
  }, [fail]);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  React.useEffect(() => {
    // Switching accounts/transports or leaving the page must never deliver an old transcript.
    return cancel;
  }, [options.transport, cancel]);
  React.useEffect(() => {
    const onHidden = () => { if (document.hidden) cancel(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && session.current) { event.preventDefault(); cancel(); } };
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', cancel);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', cancel);
    };
  }, [cancel]);

  return {
    phase, active: phase !== 'idle', seconds, levels, error, review,
    supported: isSupported() && Boolean(options.transport.transcribe),
    start, finish, cancel,
    clearError: () => setError(null), clearReview: () => setReview(false),
  };
}
