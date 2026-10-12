import React from 'react';
import { DURATION, KEYS, SCENES, keyIndexAt } from './demoScript';

// The demo's clock. Time only moves while playing, comes from requestAnimationFrame deltas (never
// the wall clock), and the picture depends on the keyframe index alone -- so pause, seek, replay
// and every recording take land on identical frames. React re-renders only when the keyframe
// changes; the progress bar is driven straight from the clock through `onTick`.

export interface Playback {
  index: number; // current keyframe
  playing: boolean;
  ended: boolean;
  /** Bumps on every seek or restart, so the stage can snap instead of easing across the jump. */
  jump: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seekScene: (scene: number) => void;
  /** Subscribe to the clock (ms). Returns an unsubscribe. */
  onTick: (listener: (ms: number) => void) => () => void;
}

export function usePlayback({ autoplay, enabled = true }: { autoplay: boolean; enabled?: boolean }): Playback {
  const clock = React.useRef(0);
  const last = React.useRef<number | null>(null);
  const listeners = React.useRef(new Set<(ms: number) => void>());
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(autoplay && enabled);
  const [ended, setEnded] = React.useState(false);
  const [jump, setJump] = React.useState(0);

  const publish = React.useCallback(() => {
    listeners.current.forEach(fn => fn(clock.current));
    setIndex(prev => { const next = keyIndexAt(clock.current); return next === prev ? prev : next; });
  }, []);

  React.useEffect(() => {
    if (!playing || !enabled) { last.current = null; return; }
    let raf = 0;
    const step = (now: number) => {
      // Cap the step so a background tab or a long frame can't skip over keyframes.
      const delta = last.current === null ? 0 : Math.min(now - last.current, 100);
      last.current = now;
      clock.current = Math.min(DURATION, clock.current + delta);
      publish();
      if (clock.current >= DURATION) { setPlaying(false); setEnded(true); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [playing, enabled, publish]);

  const seek = React.useCallback((ms: number, thenPlay: boolean) => {
    clock.current = Math.max(0, Math.min(DURATION, ms));
    last.current = null;
    setEnded(false);
    setJump(n => n + 1);
    publish();
    setPlaying(thenPlay);
  }, [publish]);

  return {
    index, playing, ended, jump,
    play: React.useCallback(() => { if (clock.current >= DURATION) seek(0, true); else setPlaying(true); }, [seek]),
    pause: React.useCallback(() => setPlaying(false), []),
    toggle: React.useCallback(() => { if (clock.current >= DURATION) seek(0, true); else setPlaying(p => !p); }, [seek]),
    restart: React.useCallback(() => seek(0, true), [seek]),
    seekScene: React.useCallback((scene: number) => seek(SCENES[Math.max(0, Math.min(SCENES.length - 1, scene))].start, true), [seek]),
    onTick: React.useCallback((listener: (ms: number) => void) => { listeners.current.add(listener); listener(clock.current); return () => { listeners.current.delete(listener); }; }, []),
  };
}

export const LAST_KEY = KEYS.length - 1;
