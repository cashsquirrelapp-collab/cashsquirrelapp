export type DeliveryOutcome = 'accepted' | 'rejected' | 'unknown' | 'skipped';
export type DeliveryChannel = 'email' | 'line';

export interface ChannelOutcomeCounts {
  accepted: number;
  failed: number;
  uncertain: number;
  skipped: number;
}

export interface NotificationOutcomeCounts {
  failed: number;
  uncertain: number;
  markerFailed: number;
  channels: Record<DeliveryChannel, ChannelOutcomeCounts>;
}

export function notificationOutcomeCounts(): NotificationOutcomeCounts {
  const channel = (): ChannelOutcomeCounts => ({ accepted: 0, failed: 0, uncertain: 0, skipped: 0 });
  return { failed: 0, uncertain: 0, markerFailed: 0, channels: { email: channel(), line: channel() } };
}

export function recordChannelOutcome(counts: NotificationOutcomeCounts, channel: DeliveryChannel, outcome: DeliveryOutcome): void {
  const key = outcome === 'rejected' ? 'failed' : outcome === 'unknown' ? 'uncertain' : outcome;
  counts.channels[channel][key] += 1;
}

// A thrown transport error may occur after the provider accepted the message.
/** Cloudflare refuses a request over the invocation's allowance before it leaves the Worker ("Too many subrequests"):
 *  nothing was sent, so it is a plain failure that may be retried, not an unknown that keeps its claim (2026-11-01). */
export function neverSent(error: unknown): boolean {
  return /too many subrequests/i.test(String((error as { message?: unknown } | null)?.message ?? error));
}

export async function attemptDelivery(send: () => Promise<DeliveryOutcome>): Promise<DeliveryOutcome> {
  try { return await send(); } catch (error) { return neverSent(error) ? 'rejected' : 'unknown'; }
}
