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
