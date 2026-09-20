const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export interface LineQuickReply {
  items: (
    | { type: 'action'; action: { type: 'message'; label: string; text: string } }
    | { type: 'action'; action: { type: 'uri'; label: string; uri: string } }
  )[];
}

// Shared message shape for both push (this file) and reply (api/line-webhook.ts) --
// lets the LINE assistant hand back a styled Flex "card" instead of only plain text, and
// attach tappable Quick Reply shortcuts that answer without ever calling the AI.
export type LineMessage =
  | { type: 'text'; text: string; quickReply?: LineQuickReply }
  | { type: 'flex'; altText: string; contents: unknown; quickReply?: LineQuickReply };

// Ad-hoc recipient list, for accounts that were never self-service linked: maps an app-user's
// email straight to a LINE user ID via env var. Format: "email1:lineUserId1,email2:lineUserId2".
// Kept as a fallback -- sendLineMessageToEmail below prefers a real linked lineUserId when the
// caller has one (see api/send-overdue-digest.ts / api/send-monthly-report.ts).
function getLineRecipients(): Record<string, string> {
  const raw = process.env.LINE_RECIPIENTS;
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [email, userId] = pair.split(':').map((s) => s.trim());
    if (email && userId) map[email.toLowerCase()] = userId;
  }
  return map;
}

// Pushes any message (text or Flex) to a known LINE user ID directly -- use this once an account
// has self-service linked via api/line-webhook.ts (notifSettings.lineUserId).
export async function sendLineMessagePayload(lineUserId: string, message: LineMessage): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ to: lineUserId, messages: [message] }),
    });
    if (!res.ok) {
      console.error(`sendLineMessagePayload: LINE API error for ${lineUserId}:`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error(`sendLineMessagePayload: failed to send to ${lineUserId}:`, err);
    return false;
  }
}

// Plain-text convenience wrapper around sendLineMessagePayload above.
export async function sendLineMessage(lineUserId: string, text: string): Promise<boolean> {
  return sendLineMessagePayload(lineUserId, { type: 'text', text: text.slice(0, 4900) }); // LINE caps text messages at 5000 chars
}

// Resolves a LINE user ID for the given email -- a self-service linked lineUserId takes
// priority, falling back to the ad-hoc LINE_RECIPIENTS env var mapping for accounts that were
// never linked (e.g. this app's own personal setup before the linking flow existed). Takes any
// LineMessage (not just plain text) so callers can push a styled Flex card, same as the direct
// sendLineMessagePayload path.
export async function sendLineMessageToEmail(email: string, message: LineMessage, linkedLineUserId?: string | null): Promise<boolean> {
  const lineUserId = linkedLineUserId || getLineRecipients()[email.toLowerCase()];
  if (!lineUserId) return false;
  return sendLineMessagePayload(lineUserId, message);
}
