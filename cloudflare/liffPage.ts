// The LINE form at the address registered in LINE (…/liff-add.html) is answered there, not sent on to /liff-add: LIFF
// reloads the page when its address differs from the endpoint, which cut off the form's first request on an iPhone
// (2026-11-13, the owner's "เปิดรายการร่างไม่ได้") and opened every form twice. The asset store keeps the page as
// /liff-add, so it is asked for that, with the same query.
export function liffPageRequest(request: Request, path: string): Request | null {
  if ((request.method !== 'GET' && request.method !== 'HEAD') || path !== '/liff-add.html') return null;
  const url = new URL(request.url);
  url.pathname = '/liff-add';
  return new Request(url.toString(), request);
}
