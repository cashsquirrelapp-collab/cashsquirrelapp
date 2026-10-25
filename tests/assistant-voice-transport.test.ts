import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveTransport, type AssistantStatus, type VoiceAudio } from '../frontend/src/features/assistant/assistantApi.js';
import { getCurrentAccount, setCurrentAccount } from '../frontend/src/services/api.js';

// Transport-only tests: every fetch is intercepted; no browser, microphone or AI service is used.
const realFetch = globalThis.fetch;
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';
let previousAccount: string | undefined;
beforeEach(() => {
  previousAccount = getCurrentAccount();
  setCurrentAccount(ACCOUNT);
});
afterEach(() => {
  globalThis.fetch = realFetch;
  setCurrentAccount(previousAccount);
});

const audio: VoiceAudio = { mimeType: 'audio/wav', data: 'UklGRg==' };
const initial: AssistantStatus = {
  enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null,
  resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null,
};
type CapturedRequest = { path: string; method: string; headers: Headers; body: unknown; init: RequestInit };

function intercept(handler: (request: CapturedRequest) => Response | Promise<Response>) {
  const requests: CapturedRequest[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const request = {
      path: String(input), method: init.method ?? 'GET', headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) as unknown : undefined, init,
    };
    requests.push(request);
    assert.equal(request.path, '/api/assistant', 'No request may escape the mocked assistant endpoint');
    return handler(request);
  };
  return requests;
}

function authenticated(request: CapturedRequest) {
  assert.equal(request.headers.get('x-account-id'), ACCOUNT);
  assert.equal(request.headers.get('x-csrf-protection'), '1');
  assert.equal(request.init.credentials, 'same-origin');
  assert.equal(request.init.cache, 'no-store');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('voice transcription POSTs once with account/CSRF credentials, returns the draft and updates cached balance', async () => {
  const controller = new AbortController();
  const reply = { text: 'เดือนนี้ได้เงินเท่าไหร่', tokens: 2, tokensLeft: 992, trialLeft: null };
  const requests = intercept(request => {
    authenticated(request);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('content-type'), 'application/json');
    assert.equal(request.init.signal, controller.signal);
    assert.deepEqual(request.body, { action: 'transcribe', audio, language: 'th-TH' });
    return Response.json(reply);
  });
  const transport = createLiveTransport({ account: ACCOUNT, status: initial, instant: true });

  assert.deepEqual(await transport.transcribe!(audio, 'th-TH', controller.signal), reply);
  assert.deepEqual(await transport.balance(), { remaining: 992, total: 1000, refillsOn: initial.resetsAt });
  assert.equal(requests.length, 1, 'Transcribing and reading the cached balance must not send a chat or retry');
  assert.deepEqual(requests.map(request => request.body), [{ action: 'transcribe', audio, language: 'th-TH' }]);
});

for (const [status, code] of [[503, 'ai_provider'], [422, 'ai_voice_no_speech']] as const) {
  test(`voice transcription ${status} refreshes the charged balance before rejecting without retrying the POST`, { timeout: 2000 }, async () => {
    const controller = new AbortController();
    const refreshStarted = deferred<void>();
    const refreshResult = deferred<Response>();
    const requests = intercept(request => {
      authenticated(request);
      if (request.method === 'POST') {
        assert.deepEqual(request.body, { action: 'transcribe', audio, language: 'th-TH' });
        return Response.json({ error: 'transcription failed after processing', code }, { status });
      }
      assert.equal(request.method, 'GET');
      assert.equal(request.body, undefined);
      assert.ok(request.init.signal);
      assert.notEqual(request.init.signal, controller.signal);
      assert.equal(request.init.signal.aborted, false);
      refreshStarted.resolve();
      return refreshResult.promise;
    });
    const transport = createLiveTransport({ account: ACCOUNT, status: initial, instant: true });
    let settled = false;
    const result = transport.transcribe!(audio, 'th-TH', controller.signal);
    void result.then(() => { settled = true; }, () => { settled = true; });

    try {
      await refreshStarted.promise;
      assert.equal(settled, false, 'The error must wait for the independent balance refresh');
      assert.equal((await transport.balance()).remaining, 994);
      refreshResult.resolve(Response.json({ ...initial, tokensLeft: 991 }));
      await assert.rejects(result, error => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'transcription failed after processing');
        assert.equal((error as Error & { status: number }).status, status);
        assert.equal((error as Error & { code: string }).code, code);
        return true;
      });
      assert.deepEqual(await transport.balance(), { remaining: 991, total: 1000, refillsOn: initial.resetsAt });
      assert.deepEqual(requests.map(request => request.method), ['POST', 'GET']);
      assert.deepEqual(requests.filter(request => request.method === 'POST').map(request => request.body), [
        { action: 'transcribe', audio, language: 'th-TH' },
      ]);
    } finally {
      refreshResult.resolve(Response.json(initial));
    }
  });
}

test('cancelling transcription refreshes with a new non-aborted GET and preserves the original cancellation', { timeout: 2000 }, async () => {
  const controller = new AbortController();
  const postStarted = deferred<void>();
  const cancellation = new DOMException('Cancelled by user', 'AbortError');
  const requests = intercept(request => {
    authenticated(request);
    if (request.method === 'POST') {
      assert.deepEqual(request.body, { action: 'transcribe', audio, language: 'en-US' });
      assert.equal(request.init.signal, controller.signal);
      return new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(cancellation), { once: true });
        postStarted.resolve();
      });
    }
    assert.equal(request.method, 'GET');
    assert.equal(controller.signal.aborted, true);
    assert.ok(request.init.signal);
    assert.notEqual(request.init.signal, controller.signal);
    assert.equal(request.init.signal.aborted, false, 'The cancelled POST signal must not cancel the balance refresh');
    assert.equal(request.body, undefined);
    return Response.json({ ...initial, tokensLeft: 990 });
  });
  const transport = createLiveTransport({ account: ACCOUNT, status: initial, instant: true });
  const result = transport.transcribe!(audio, 'en-US', controller.signal);
  const rejected = assert.rejects(result, error => {
    assert.equal(error, cancellation);
    return true;
  });
  await postStarted.promise;
  controller.abort();
  await rejected;

  assert.deepEqual(await transport.balance(), { remaining: 990, total: 1000, refillsOn: initial.resetsAt });
  assert.deepEqual(requests.map(request => request.method), ['POST', 'GET']);
  assert.deepEqual(requests.filter(request => request.method === 'POST').map(request => request.body), [
    { action: 'transcribe', audio, language: 'en-US' },
  ]);
});

test('switching accounts during an aborted transcription skips the old-account GET that could expire the new session', { timeout: 2000 }, async () => {
  const controller = new AbortController();
  const postStarted = deferred<void>();
  const cancellation = new DOMException('Account switched', 'AbortError');
  const requests = intercept(request => {
    authenticated(request);
    if (request.method === 'GET') {
      // A stale refresh after the switch could wrongly attribute this 401 to the new current account.
      return Response.json({ error: 'Old account no longer available' }, { status: 401 });
    }
    assert.equal(request.method, 'POST');
    assert.deepEqual(request.body, { action: 'transcribe', audio, language: 'th-TH' });
    assert.equal(request.init.signal, controller.signal);
    return new Promise<Response>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(cancellation), { once: true });
      postStarted.resolve();
    });
  });
  const transport = createLiveTransport({ account: ACCOUNT, status: initial, instant: true });
  const result = transport.transcribe!(audio, 'th-TH', controller.signal);
  const rejected = assert.rejects(result, error => {
    assert.equal(error, cancellation);
    return true;
  });
  await postStarted.promise;
  setCurrentAccount(OTHER_ACCOUNT);
  controller.abort();
  await rejected;

  assert.equal(getCurrentAccount(), OTHER_ACCOUNT);
  assert.deepEqual(requests.map(request => request.method), ['POST'], 'No old-account refresh or chat request may follow the switch');
  assert.deepEqual(await transport.balance(), { remaining: 994, total: 1000, refillsOn: initial.resetsAt });
});

test('a balance refresh already in flight is discarded if the current account changes before it returns', { timeout: 2000 }, async () => {
  const refreshStarted = deferred<void>();
  const refreshResult = deferred<Response>();
  const requests = intercept(request => {
    authenticated(request);
    if (request.method === 'POST') return Response.json({ error: 'Charged transcription failed', code: 'ai_provider' }, { status: 503 });
    assert.equal(request.method, 'GET');
    refreshStarted.resolve();
    return refreshResult.promise;
  });
  const transport = createLiveTransport({ account: ACCOUNT, status: initial, instant: true });
  const result = transport.transcribe!(audio, 'th-TH', new AbortController().signal);
  const rejected = assert.rejects(result, { message: 'Charged transcription failed', status: 503, code: 'ai_provider' });
  try {
    await refreshStarted.promise;
    setCurrentAccount(OTHER_ACCOUNT);
    refreshResult.resolve(Response.json({ ...initial, tokensLeft: 990 }));
    await rejected;

    assert.equal(getCurrentAccount(), OTHER_ACCOUNT);
    assert.deepEqual(requests.map(request => request.method), ['POST', 'GET']);
    assert.deepEqual(await transport.balance(), { remaining: 994, total: 1000, refillsOn: initial.resetsAt });
  } finally {
    refreshResult.resolve(Response.json(initial));
  }
});
