// LINE gives up on a webhook that has not answered within a couple of seconds, and Cloudflare then cancels
// the request: the reply to the user is never sent (seen in production: outcome "canceled" at ~1.7 s, no
// error logged). The webhook handler makes several database calls before it replies to LINE, so on Workers
// it can exceed that. This answers as soon as the handler is done OR the budget is spent, whichever comes
// first, and lets the handler finish in the background (ctx.waitUntil, up to 30 s).

export interface Waiter { waitUntil(promise: Promise<unknown>): void }

export async function answerWithin(
  work: Promise<Response>,
  budgetMs: number,
  ctx: Waiter,
  deferred: () => Response,
  onBackgroundFailure: (error: unknown) => void = () => undefined,
): Promise<Response> {
  const settled = work.then(
    response => ({ response }),
    error => ({ error }),
  );
  // Keep the work alive after the response is sent, and surface a late failure without crashing the Worker.
  ctx.waitUntil(settled.then(result => { if ('error' in result) onBackgroundFailure(result.error); }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), budgetMs); });
  const first = await Promise.race([settled, timeout]);
  if (timer) clearTimeout(timer);
  if (first === 'timeout') return deferred();
  if ('error' in first) throw first.error;
  return first.response;
}
