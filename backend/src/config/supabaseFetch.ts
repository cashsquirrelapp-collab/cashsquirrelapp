// Every call from the server to Supabase goes through this fetch (owner, 2026-10-21: the site sometimes
// sat on its loading skeleton). Postgres itself answers in milliseconds, but now and then a request
// stalls on the way to Supabase for 10–60 seconds, and nothing cut it off. Here each request gets a
// deadline for Supabase to start answering. Requests that only read are tried once more:
// - GET / HEAD;
// - the read-only database functions in READ_RPCS. cashflow_rate_limit also counts here: a second
//   try at worst counts one request twice.
// Writes are never repeated: they only get a longer deadline, so a stuck one cannot hang forever.
// The deadline stops once the response headers arrive, so large downloads are never cut halfway.

const READ_RPCS = new Set([
  'cashflow_rate_limit', 'cashflow_session_active', 'cashflow_groups_snapshot', 'cashflow_profile_get', 'cashflow_group_detail',
]);

export type SupabaseFetchTimeouts = { readRpc: number; read: number; storageRead: number; write: number; storageWrite: number };
export const SUPABASE_TIMEOUTS: SupabaseFetchTimeouts = { readRpc: 3_000, read: 6_000, storageRead: 20_000, write: 25_000, storageWrite: 60_000 };

export class SupabaseTimeoutError extends Error {
  constructor(readonly route: string, readonly timeoutMs: number) {
    super(`Supabase did not answer within ${timeoutMs}ms`);
    this.name = 'SupabaseTimeoutError';
  }
}

type Plan = { timeoutMs: number; retry: boolean; route: string };

/** How long to wait for one request and whether it may be sent again. Exported for tests. */
export function planFor(url: string, method: string, timeouts: SupabaseFetchTimeouts = SUPABASE_TIMEOUTS): Plan {
  const path = new URL(url).pathname;
  // A coarse route for logs: never the query string (ids, emails) or storage object names.
  const route = path.split('/').slice(0, path.startsWith('/rest/v1/rpc/') ? 5 : 4).join('/');
  const storage = path.startsWith('/storage/v1/');
  if (method === 'GET' || method === 'HEAD') return { timeoutMs: storage ? timeouts.storageRead : timeouts.read, retry: true, route };
  const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1];
  if (method === 'POST' && rpc && READ_RPCS.has(rpc)) return { timeoutMs: timeouts.readRpc, retry: true, route };
  return { timeoutMs: storage ? timeouts.storageWrite : timeouts.write, retry: false, route };
}

const reusableBody = (body: unknown) => body == null || typeof body === 'string' || body instanceof URLSearchParams
  || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || (typeof Blob !== 'undefined' && body instanceof Blob);

export function createSupabaseFetch(options: { base?: typeof fetch; timeouts?: SupabaseFetchTimeouts } = {}): typeof fetch {
  const timeouts = options.timeouts ?? SUPABASE_TIMEOUTS;
  const attempt = async (base: typeof fetch, input: RequestInfo | URL, init: RequestInit | undefined, plan: Plan): Promise<Response> => {
    const controller = new AbortController();
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
    }
    const timer = setTimeout(() => controller.abort(new SupabaseTimeoutError(plan.route, plan.timeoutMs)), plan.timeoutMs);
    try {
      return await base(input, { ...init, signal: controller.signal });
    } catch (error) {
      // Report our own deadline as such, whatever the runtime wraps the abort in.
      const reason = controller.signal.reason;
      throw reason instanceof SupabaseTimeoutError && !outer?.aborted ? reason : error;
    } finally {
      clearTimeout(timer); // headers are in: the body may take as long as it needs
    }
  };
  return async (input, init) => {
    const base = options.base ?? globalThis.fetch;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const plan = planFor(url, method, timeouts);
    // A Request object's body can be read only once, so only plain arguments are sent twice.
    const canRetry = plan.retry && !(input instanceof Request) && reusableBody(init?.body);
    try {
      return await attempt(base, input, init, plan);
    } catch (error) {
      if (!canRetry || init?.signal?.aborted) throw error;
      console.warn('supabase_retry', { method, route: plan.route, reason: error instanceof SupabaseTimeoutError ? 'timeout' : 'network' });
      return attempt(base, input, init, plan);
    }
  };
}

export const supabaseFetch = createSupabaseFetch();
