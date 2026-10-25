/** Local microphone capture. Nothing in this module makes a network request. */
export const AUDIO_MAX_SECONDS = 60;
export const AUDIO_MAX_BYTES = 4 * 1024 * 1024;
const WAV_SAMPLE_RATE = 16_000;
const MIN_SECONDS = 0.25;

export type AudioRecorderErrorCode = 'unsupported' | 'denied' | 'no-microphone' | 'too-short' | 'no-speech' | 'too-large' | 'cancelled' | 'failed';
export class AudioRecorderError extends Error {
  constructor(public readonly code: AudioRecorderErrorCode) {
    super(code);
    this.name = 'AudioRecorderError';
  }
}
export type RecordedAudio = { mimeType: 'audio/wav'; data: string };
export interface AudioRecorderCallbacks {
  onLevel(level: number): void;
  onElapsed(seconds: number): void;
  onLimit(): void;
  onError?(error: AudioRecorderError): void;
}
export interface AudioRecorder {
  start(): Promise<void>;
  finish(): Promise<RecordedAudio>;
  cancel(): void;
}

/** Injectable browser boundary: tests never request a real microphone. */
export interface AudioRecorderPlatform {
  supported: boolean;
  getUserMedia(): Promise<MediaStream>;
  createRecorder(stream: MediaStream): MediaRecorder;
  createContext(): AudioContext;
  now(): number;
  every(callback: () => void, milliseconds: number): () => void;
  after(callback: () => void, milliseconds: number): () => void;
}

const audioContextClass = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
};
const recordingMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']
    .find(type => MediaRecorder.isTypeSupported(type)) ?? null;
};
export const isSupported = () => Boolean(typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && audioContextClass() && recordingMimeType());

function browserPlatform(): AudioRecorderPlatform {
  return {
    supported: isSupported(),
    getUserMedia: () => navigator.mediaDevices.getUserMedia({
      audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
    }),
    createRecorder: stream => {
      const mimeType = recordingMimeType();
      if (!mimeType) throw new AudioRecorderError('unsupported');
      return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
    },
    createContext: () => {
      const Context = audioContextClass();
      if (!Context) throw new AudioRecorderError('unsupported');
      return new Context();
    },
    now: () => performance.now(),
    every: (callback, milliseconds) => { const id = window.setInterval(callback, milliseconds); return () => window.clearInterval(id); },
    after: (callback, milliseconds) => { const id = window.setTimeout(callback, milliseconds); return () => window.clearTimeout(id); },
  };
}

function toError(error: unknown): AudioRecorderError {
  if (error instanceof AudioRecorderError) return error;
  const name = error instanceof Error ? error.name : '';
  return new AudioRecorderError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
    : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'no-microphone'
    : name === 'NotSupportedError' ? 'unsupported' : 'failed');
}

/** Downmix and resample decoded samples, then write a genuine PCM16 mono 16 kHz RIFF/WAV. */
export function encodeMonoWav(channels: readonly Float32Array[], sourceSampleRate: number): ArrayBuffer {
  if (!channels.length || !Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) throw new AudioRecorderError('failed');
  const sourceLength = Math.min(...channels.map(channel => channel.length), Math.floor(sourceSampleRate * AUDIO_MAX_SECONDS));
  if (sourceLength / sourceSampleRate < MIN_SECONDS) throw new AudioRecorderError('too-short');
  const mono = new Float32Array(sourceLength);
  let energy = 0;
  for (let i = 0; i < sourceLength; i += 1) {
    let value = 0;
    for (const channel of channels) value += Number.isFinite(channel[i]) ? channel[i] : 0;
    mono[i] = Math.max(-1, Math.min(1, value / channels.length));
    energy += mono[i] * mono[i];
  }
  // Reject silence only; quiet speech is left for the transcription service to interpret.
  if (Math.sqrt(energy / sourceLength) < 0.0001) throw new AudioRecorderError('no-speech');
  const count = Math.floor(sourceLength * WAV_SAMPLE_RATE / sourceSampleRate);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeText(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, WAV_SAMPLE_RATE, true);
  view.setUint32(28, WAV_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, count * 2, true);
  const ratio = sourceSampleRate / WAV_SAMPLE_RATE;
  for (let i = 0; i < count; i += 1) {
    let sample: number;
    if (ratio > 1) {
      // Integrate each source interval before downsampling rather than discarding samples.
      const from = i * ratio, to = Math.min(sourceLength, (i + 1) * ratio);
      let sum = 0;
      for (let j = Math.floor(from); j < Math.ceil(to); j += 1) {
        sum += mono[j] * Math.max(0, Math.min(j + 1, to) - Math.max(j, from));
      }
      sample = sum / (to - from);
    } else {
      const position = i * ratio, left = Math.floor(position), fraction = position - left;
      sample = mono[left] * (1 - fraction) + mono[Math.min(left + 1, sourceLength - 1)] * fraction;
    }
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

const base64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** A recorder is single-use; make a fresh one for the next message. */
export function createAudioRecorder(callbacks: AudioRecorderCallbacks, platform: AudioRecorderPlatform = browserPlatform()): AudioRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let clearMeter: (() => void) | null = null;
  let clearLimit: (() => void) | null = null;
  let clearStopTimeout: (() => void) | null = null;
  let removeTrackListeners: (() => void)[] = [];
  let chunks: Blob[] = [];
  let bytes = 0;
  let cancelled = false;
  let halted = false;
  let limitReported = false;
  let startedAt = 0;
  let failure: AudioRecorderError | null = null;
  let startPromise: Promise<void> | null = null;
  let finishPromise: Promise<RecordedAudio> | null = null;
  let settleStop: (() => void) | null = null;
  let rejectStop: ((error: AudioRecorderError) => void) | null = null;
  const stopped = new Promise<void>((resolve, reject) => { settleStop = resolve; rejectStop = reject; });
  void stopped.catch(() => {});
  let rejectCancellation: ((error: AudioRecorderError) => void) | null = null;
  const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  void cancellation.catch(() => {});
  const assertActive = () => { if (cancelled) throw new AudioRecorderError('cancelled'); if (failure) throw failure; };
  const stopTracks = () => {
    removeTrackListeners.forEach(remove => remove()); removeTrackListeners = [];
    stream?.getTracks().forEach(track => track.stop()); stream = null;
  };
  const stopMeter = () => {
    clearMeter?.(); clearMeter = null; clearLimit?.(); clearLimit = null;
    source?.disconnect(); source = null; analyser?.disconnect(); analyser = null;
  };
  const closeContext = () => { const previous = context; context = null; if (previous && previous.state !== 'closed') void previous.close().catch(() => {}); };
  const detachRecorder = () => {
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; }
    recorder = null;
    clearStopTimeout?.(); clearStopTimeout = null;
  };
  const halt = () => {
    if (halted) return;
    halted = true;
    stopMeter();
    try {
      if (recorder && recorder.state !== 'inactive') {
        clearStopTimeout = platform.after(() => rejectStop?.(new AudioRecorderError('failed')), 5_000);
        recorder.stop();
      } else settleStop?.();
    } catch { rejectStop?.(new AudioRecorderError('failed')); }
    finally { stopTracks(); }
  };
  const reportLimit = () => {
    if (limitReported || cancelled || (halted && failure)) return;
    limitReported = true;
    halt();
    callbacks.onLimit();
  };
  const failRecording = () => {
    if (cancelled || failure) return;
    failure = new AudioRecorderError('failed');
    rejectStop?.(failure);
    halt(); closeContext(); detachRecorder(); chunks = [];
    callbacks.onError?.(failure);
  };
  const start = () => {
    if (startPromise) return startPromise;
    startPromise = Promise.race([(async () => {
      assertActive();
      if (!platform.supported) throw new AudioRecorderError('unsupported');
      // Create/resume in the user's click stack (Safari requires this).
      context = platform.createContext();
      const resumed = context.state === 'suspended' ? context.resume() : Promise.resolve();
      void resumed.catch(() => {});
      const acquired = await platform.getUserMedia();
      if (cancelled) { acquired.getTracks().forEach(track => track.stop()); throw new AudioRecorderError('cancelled'); }
      stream = acquired;
      await Promise.race([resumed, cancellation]);
      assertActive();
      for (const track of stream.getTracks()) {
        const onEnded = () => { if (!halted) failRecording(); };
        track.addEventListener('ended', onEnded);
        removeTrackListeners.push(() => track.removeEventListener('ended', onEnded));
        if (track.readyState === 'ended') { failRecording(); assertActive(); }
      }
      source = context!.createMediaStreamSource(stream);
      analyser = context!.createAnalyser(); analyser.fftSize = 2048;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      recorder = platform.createRecorder(stream);
      recorder.ondataavailable = event => {
        if (cancelled || !event.data.size || failure) return;
        bytes += event.data.size;
        if (bytes > AUDIO_MAX_BYTES) { failure = new AudioRecorderError('too-large'); chunks = []; reportLimit(); return; }
        chunks.push(event.data);
      };
      recorder.onstop = () => {
        // A browser/device stop is not the user's Stop or the duration limit. Discard it;
        // otherwise the live UI could later auto-submit a disconnected microphone's clip.
        if (!halted && !cancelled) { failRecording(); return; }
        clearStopTimeout?.(); clearStopTimeout = null; settleStop?.();
      };
      recorder.onerror = failRecording;
      recorder.start(250);
      startedAt = platform.now();
      callbacks.onElapsed(0);
      const meter = () => {
        if (cancelled || halted || !analyser) return;
        analyser.getFloatTimeDomainData(samples);
        let sum = 0; for (const sample of samples) sum += sample * sample;
        callbacks.onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        const seconds = Math.min(AUDIO_MAX_SECONDS, Math.max(0, (platform.now() - startedAt) / 1000));
        callbacks.onElapsed(seconds);
        if (seconds >= AUDIO_MAX_SECONDS) reportLimit();
      };
      clearMeter = platform.every(meter, 66);
      clearLimit = platform.after(() => {
        if (halted || cancelled) return;
        callbacks.onElapsed(AUDIO_MAX_SECONDS); reportLimit();
      }, AUDIO_MAX_SECONDS * 1000);
    })(), cancellation]).catch(error => {
      halt(); closeContext(); detachRecorder(); chunks = [];
      throw toError(error);
    });
    return startPromise;
  };
  const finish = () => {
    if (finishPromise) return finishPromise;
    // Microphone release is synchronous when the user presses Stop.
    if (recorder) halt();
    finishPromise = Promise.race([(async (): Promise<RecordedAudio> => {
      if (!startPromise) throw new AudioRecorderError('too-short');
      await startPromise;
      assertActive(); halt();
      await stopped;
      assertActive();
      if (!chunks.length || !context) throw new AudioRecorderError('too-short');
      const recording = new Blob(chunks, { type: recorder?.mimeType || chunks[0]?.type });
      chunks = [];
      const compressed = await recording.arrayBuffer();
      assertActive();
      const decoded = await context.decodeAudioData(compressed);
      assertActive();
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));
      return { mimeType: 'audio/wav', data: base64(encodeMonoWav(channels, decoded.sampleRate)) };
    })(), cancellation]).catch(error => { throw toError(error); }).finally(() => {
      halt(); closeContext(); detachRecorder(); chunks = [];
    });
    return finishPromise;
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    rejectCancellation?.(new AudioRecorderError('cancelled'));
    halt(); closeContext(); detachRecorder(); chunks = [];
  };
  return { start, finish, cancel };
}
