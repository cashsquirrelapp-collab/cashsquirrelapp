import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';

// Set only by the Cloudflare entry point, never from caller proxy headers in Express.
const clientContext = new AsyncLocalStorage<string>();
export function cloudflareClientIp(): string | undefined { return clientContext.getStore(); }
export function withCloudflareClientIp<T>(request: Request & { cf?: unknown }, run: () => T): T {
  const ip = request.cf ? request.headers.get('CF-Connecting-IP') : null;
  return clientContext.run(ip && isIP(ip) ? ip : 'unknown', run);
}
