import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, AudioRecorderError, createAudioRecorder, encodeMonoWav, isSupported,
  type AudioRecorderCallbacks, type AudioRecorderPlatform,
} from '../frontend/src/features/assistant/audioRecorder';

// All microphone, recorder, decoder and clock behavior is simulated. No network or microphone access.
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const code = (expected: string) => (error: unknown) => error instanceof AudioRecorderError && error.code === expected;
const samples = (rate = 48_000, seconds = 1, value = 0.2) => new Float32Array(rate * seconds).fill(value);
const decoded = (channels = [samples()], sampleRate = 48_000) => ({
  numberOfChannels: channels.length, sampleRate, getChannelData: (channel: number) => channels[channel],
}) as AudioBuffer;

function fixture(overrides: Partial<AudioRecorderPlatform> = {}, callbacks: Partial<AudioRecorderCallbacks> = {}) {
  const events = { levels: [] as number[], elapsed: [] as number[], limits: 0, errors: [] as AudioRecorderError[] };
  const intervals = new Map<number, () => void>();
  const timers = new Map<number, { callback: () => void; milliseconds: number }>();
  let sequence = 0, now = 0, stoppedTracks = 0, disconnects = 0, closes = 0, decodeCalls = 0, requested = 0;
  let decodedResult: Promise<AudioBuffer> = Promise.resolve(decoded());
  let encodedBytes: ArrayBuffer | null = null;
  const endedListeners = new Set<() => void>();
  const track = {
    readyState: 'live',
    stop: () => { stoppedTracks += 1; track.readyState = 'ended'; },
    addEventListener: (_type: string, listener: () => void) => { endedListeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { endedListeners.delete(listener); },
  };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const analyser = {
    fftSize: 2048,
    getFloatTimeDomainData: (target: Float32Array) => { target.fill(0.125); },
    disconnect: () => { disconnects += 1; },
  };
  const context = {
    state: 'running',
    createMediaStreamSource: () => ({ connect() {}, disconnect: () => { disconnects += 1; } }),
    createAnalyser: () => analyser,
    resume: async () => {},
    close: async () => { context.state = 'closed'; closes += 1; },
    decodeAudioData: (data: ArrayBuffer) => { decodeCalls += 1; encodedBytes = data; return decodedResult; },
  };
  const recorder = {
    state: 'inactive', mimeType: 'audio/webm;codecs=opus',
    ondataavailable: null as ((event: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    onerror: null as (() => void) | null,
    starts: 0, stops: 0,
    start: () => { recorder.starts += 1; recorder.state = 'recording'; },
    stop: () => {
      recorder.stops += 1; recorder.state = 'inactive';
      queueMicrotask(() => {
        recorder.ondataavailable?.({ data: new Blob(['actual compressed recording'], { type: recorder.mimeType }) });
        recorder.onstop?.();
      });
    },
  };
  const platform: AudioRecorderPlatform = {
    supported: true,
    getUserMedia: async () => { requested += 1; return stream; },
    createRecorder: () => recorder as unknown as MediaRecorder,
    createContext: () => context as unknown as AudioContext,
    now: () => now,
    every: callback => { const id = ++sequence; intervals.set(id, callback); return () => { intervals.delete(id); }; },
    after: (callback, milliseconds) => { const id = ++sequence; timers.set(id, { callback, milliseconds }); return () => { timers.delete(id); }; },
    ...overrides,
  };
  const audio = createAudioRecorder({
    onLevel: value => events.levels.push(value), onElapsed: value => events.elapsed.push(value),
    onLimit: () => { events.limits += 1; }, onError: error => events.errors.push(error), ...callbacks,
  }, platform);
  return {
    audio, stream, recorder, context, events, intervals, timers, endedListeners,
    endTrack: () => { track.readyState = 'ended'; for (const listener of [...endedListeners]) listener(); },
    counts: () => ({ stoppedTracks, disconnects, closes, decodeCalls, requested }),
    encodedBytes: () => encodedBytes,
    setDecoded: (result: Promise<AudioBuffer>) => { decodedResult = result; },
    tick: (milliseconds: number) => { now = milliseconds; for (const callback of [...intervals.values()]) callback(); },
    fireTimer: (milliseconds: number) => {
      const match = [...timers].find(([, timer]) => timer.milliseconds === milliseconds);
      assert.ok(match, `timer ${milliseconds} exists`); timers.delete(match[0]); match[1].callback();
    },
  };
}

test('WAV contains PCM16 mono 16 kHz header and downmixed, resampled samples', () => {
  const wav = encodeMonoWav([samples(48_000, 1, 0.4), samples(48_000, 1, 0.1)], 48_000);
  const header = new DataView(wav);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE');
  assert.equal(header.getUint32(4, true), wav.byteLength - 8);
  assert.equal(header.getUint16(20, true), 1);
  assert.equal(header.getUint16(22, true), 1);
  assert.equal(header.getUint32(24, true), 16_000);
  assert.equal(header.getUint32(28, true), 32_000);
  assert.equal(header.getUint16(34, true), 16);
  assert.equal(header.getUint32(40, true), 32_000);
  assert.equal(wav.byteLength, 32_044);
  assert.equal(header.getInt16(44, true), 8192);
});

test('WAV handles 44.1 kHz and 8 kHz inputs, averages source intervals, and clamps duration to 60 seconds', () => {
  for (const rate of [44_100, 8_000, 16_000]) assert.equal(encodeMonoWav([samples(rate)], rate).byteLength, 32_044);
  const alternating = samples(48_000, 1, 0);
  for (let i = 0; i < alternating.length; i += 3) alternating[i] = 0.9;
  assert.equal(new DataView(encodeMonoWav([alternating], 48_000)).getInt16(44, true), 9830);
  assert.equal(encodeMonoWav([samples(8_000, 61)], 8_000).byteLength, 44 + 60 * 16_000 * 2);
});

test('WAV rejects short, silent and malformed audio, and clamps overflowing samples', () => {
  assert.throws(() => encodeMonoWav([samples(48_000, 0.1)], 48_000), code('too-short'));
  assert.throws(() => encodeMonoWav([samples(48_000, 1, 0)], 48_000), code('no-speech'));
  assert.throws(() => encodeMonoWav([], 48_000), code('failed'));
  assert.throws(() => encodeMonoWav([samples()], 0), code('failed'));
  const positive = new DataView(encodeMonoWav([samples(16_000, 1, 2)], 16_000));
  const negative = new DataView(encodeMonoWav([samples(16_000, 1, -2)], 16_000));
  assert.equal(positive.getInt16(44, true), 32767);
  assert.equal(negative.getInt16(44, true), -32768);
});

test('capture emits actual RMS and elapsed time without decoding; Stop releases mic before encoding', async () => {
  const f = fixture(); await f.audio.start(); f.tick(1_500);
  assert.equal(f.events.levels[0], 0.5);
  assert.deepEqual(f.events.elapsed, [0, 1.5]);
  assert.equal(f.counts().decodeCalls, 0);
  const result = f.audio.finish();
  assert.equal(f.counts().stoppedTracks, 1, 'tracks released synchronously');
  assert.equal(f.intervals.size, 0);
  const wav = await result;
  assert.equal(wav.mimeType, 'audio/wav');
  assert.equal(Buffer.from(wav.data, 'base64').subarray(0, 4).toString(), 'RIFF');
  assert.equal(new TextDecoder().decode(f.encodedBytes()!), 'actual compressed recording', 'decoder consumes real MediaRecorder bytes');
  assert.equal(f.counts().closes, 1); assert.equal(f.timers.size, 0);
});

test('duplicate start and finish do not acquire, stop, or decode twice', async () => {
  const f = fixture();
  assert.equal(f.audio.start(), f.audio.start()); await f.audio.start();
  const first = f.audio.finish(); assert.equal(first, f.audio.finish()); await first;
  assert.equal(f.counts().requested, 1); assert.equal(f.recorder.starts, 1);
  assert.equal(f.recorder.stops, 1); assert.equal(f.counts().decodeCalls, 1);
});

test('60-second timer stops capture even if the UI has not called finish yet', async () => {
  const f = fixture(); await f.audio.start(); f.fireTimer(60_000);
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.events.limits, 1);
  assert.equal(f.events.elapsed.at(-1), AUDIO_MAX_SECONDS);
  assert.equal(f.intervals.size, 0);
  await f.audio.finish(); assert.equal(f.events.limits, 1);
});

test('compressed size limit stops the mic, reports the limit, and never decodes an oversized blob', async () => {
  const f = fixture(); await f.audio.start();
  f.recorder.ondataavailable?.({ data: new Blob([new Uint8Array(AUDIO_MAX_BYTES + 1)]) });
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.events.limits, 1);
  await assert.rejects(f.audio.finish(), code('too-large'));
  assert.equal(f.counts().decodeCalls, 0); assert.equal(f.counts().closes, 1);
});

test('cancel during pending permission rejects immediately and stops a late microphone stream', async () => {
  const permission = deferred<MediaStream>();
  const f = fixture({ getUserMedia: () => permission.promise });
  const started = f.audio.start(); f.audio.cancel();
  await assert.rejects(started, code('cancelled'));
  permission.resolve(f.stream); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.recorder.starts, 0);
  assert.equal(f.counts().closes, 1); assert.equal(f.intervals.size, 0);
});

test('cancel while decoding suppresses the result and closes every resource', async () => {
  const decoding = deferred<AudioBuffer>(); const f = fixture(); f.setDecoded(decoding.promise);
  await f.audio.start(); const result = f.audio.finish();
  for (let i = 0; i < 8 && f.counts().decodeCalls === 0; i += 1) await Promise.resolve();
  assert.equal(f.counts().decodeCalls, 1);
  f.audio.cancel(); await assert.rejects(result, code('cancelled'));
  decoding.resolve(decoded()); await Promise.resolve();
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.counts().closes, 1);
  assert.equal(f.intervals.size, 0); assert.equal(f.timers.size, 0);
});

test('cancel during recording is idempotent and never decodes captured audio', async () => {
  const f = fixture(); await f.audio.start(); f.audio.cancel(); f.audio.cancel();
  await assert.rejects(f.audio.finish(), code('cancelled'));
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.counts().decodeCalls, 0);
  assert.equal(f.counts().closes, 1); assert.equal(f.intervals.size, 0); assert.equal(f.timers.size, 0);
});

test('permission rejection, missing microphone and unsupported browsers have typed errors', async () => {
  for (const [name, expected] of [['NotAllowedError', 'denied'], ['NotFoundError', 'no-microphone']]) {
    const f = fixture({ getUserMedia: async () => { throw Object.assign(new Error('browser error'), { name }); } });
    await assert.rejects(f.audio.start(), code(expected)); assert.equal(f.counts().closes, 1);
  }
  const unsupported = fixture({ supported: false });
  await assert.rejects(unsupported.audio.start(), code('unsupported'));
  assert.equal(unsupported.counts().requested, 0);
  assert.equal(isSupported(), false, 'Node has no browser media support');
});

test('decoder failure and silent or short recordings release all resources', async () => {
  for (const [result, expected] of [
    [() => Promise.reject(new Error('invalid compressed audio')), 'failed'],
    [() => Promise.resolve(decoded([samples(48_000, 1, 0)])), 'no-speech'],
    [() => Promise.resolve(decoded([samples(48_000, 0.1)])), 'too-short'],
  ] as const) {
    const f = fixture(); await f.audio.start();
    const next = result(); void next.catch(() => {}); f.setDecoded(next);
    await assert.rejects(f.audio.finish(), code(expected));
    assert.equal(f.counts().closes, 1); assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.timers.size, 0);
  }
});

test('a recorder error stops capture and notifies the UI with a typed error', async () => {
  const f = fixture(); await f.audio.start(); f.recorder.onerror?.();
  assert.equal(f.events.errors[0].code, 'failed'); assert.equal(f.counts().stoppedTracks, 1);
  await assert.rejects(f.audio.finish(), code('failed'));
  assert.equal(f.intervals.size, 0); assert.equal(f.timers.size, 0);
});

test('unexpected native stop discards the partial clip, cleans up, and never triggers auto-finish', async () => {
  const f = fixture(); await f.audio.start();
  f.recorder.ondataavailable?.({ data: new Blob(['partial recording']) });
  const staleLimit = [...f.timers.values()].find(timer => timer.milliseconds === 60_000)!.callback;
  f.recorder.state = 'inactive'; f.recorder.onstop?.();
  assert.equal(f.events.errors.length, 1); assert.equal(f.events.errors[0].code, 'failed');
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.counts().closes, 1);
  assert.equal(f.intervals.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.endedListeners.size, 0);
  staleLimit(); // Even an already queued timer must not ask the hook to upload.
  assert.equal(f.events.limits, 0);
  await assert.rejects(f.audio.finish(), code('failed'));
  assert.equal(f.counts().decodeCalls, 0, 'partial recording never becomes a submission');
});

test('microphone track ending fails immediately even before the recorder sends its stop event', async () => {
  const f = fixture(); await f.audio.start(); f.endTrack(); await Promise.resolve();
  assert.equal(f.events.errors.length, 1); assert.equal(f.events.errors[0].code, 'failed');
  assert.equal(f.counts().stoppedTracks, 1); assert.equal(f.counts().closes, 1);
  assert.equal(f.events.limits, 0); assert.equal(f.intervals.size, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.endedListeners.size, 0);
  await assert.rejects(f.audio.finish(), code('failed')); assert.equal(f.counts().decodeCalls, 0);
});

test('missing stop event times out and releases the decoder context', async () => {
  const f = fixture(); await f.audio.start();
  f.recorder.stop = () => { f.recorder.state = 'inactive'; };
  const result = f.audio.finish(); await Promise.resolve(); f.fireTimer(5_000);
  await assert.rejects(result, code('failed')); assert.equal(f.counts().closes, 1);
});
