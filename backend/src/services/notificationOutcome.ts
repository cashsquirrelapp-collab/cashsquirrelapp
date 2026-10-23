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
export async function attemptDelivery(send: () => Promise<DeliveryOutcome>): Promise<DeliveryOutcome> {
  try { return await send(); } catch { return 'unknown'; }
}
