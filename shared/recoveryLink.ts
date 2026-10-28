/**
 * Recovery tokens belong in the URL fragment, never the query string. Browsers
 * do not send fragments with the initial HTTP request or in the Referer header.
 */
export function buildRecoveryLink(appOrigin: string, token: string): string {
  const url = new URL('/recover', appOrigin);
  url.hash = new URLSearchParams({ r: token }).toString();
  return url.toString();
}

export function readRecoveryToken(search: string, hash: string): { token: string; present: boolean } {
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const query = new URLSearchParams(search);
  const fragmentHasToken = fragment.has('r') || fragment.has('recover');
  const queryHasToken = query.has('r') || query.has('recover');
  return {
    token: fragment.get('r') || fragment.get('recover') || query.get('r') || query.get('recover') || '',
    present: fragmentHasToken || queryHasToken,
  };
}
