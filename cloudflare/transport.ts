/** Keep HTTP requests from ever receiving the application shell or reaching an API handler. */
export function enforceHttps(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return null;
  if (url.protocol !== 'http:') {
    return new Response('HTTPS required', {
      status: 400,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  // Never replay credentials or request bodies from an unencrypted request.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('HTTPS required', {
      status: 400,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  url.protocol = 'https:';
  return new Response(null, {
    status: 308,
    headers: {
      Location: url.toString(),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * www.krarok.com goes to krarok.com, same path and query (owner, 2026-10-31: "ต่อ www.krarok.com ด้วย"), so the site has
 * one address and one sign-in. Page loads get a lasting 301; anything else a 308, and never with a body replayed.
 */
export const WWW_HOST = 'www.krarok.com';
export const MAIN_HOST = 'krarok.com';
export function toMainHost(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== WWW_HOST) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Use https://krarok.com', { status: 421, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  url.hostname = MAIN_HOST;
  url.protocol = 'https:';
  url.port = '';
  url.hash = '';
  return new Response(null, { status: 301, headers: { Location: url.toString(), 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
