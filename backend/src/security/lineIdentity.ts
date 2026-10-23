import { stagingLineAllowed } from './staging.js';
// Verifies the ID token the LIFF page got from liff.getIDToken() against LINE's own endpoint --
// never trust a userId sent directly by the client, since anyone could just type a different one
// into the request body. The signature check + audience (client_id) match here is what proves
// this request really came from that LINE user's LIFF session.
export async function verifyLiffIdToken(idToken: string): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) return null;
  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) {
      console.error('LINE token verification rejected', { status: res.status });
      return null;
    }
    const data = await res.json() as { sub?: unknown } | null;
    return typeof data?.sub === 'string' && stagingLineAllowed(data.sub) ? data.sub : null;
  } catch (err) {
    console.error('LINE token verification unavailable');
    return null;
  }
}

