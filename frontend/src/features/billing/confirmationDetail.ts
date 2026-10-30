/** The provider's reason for a failed confirmation, safe to show: ids, secrets and long numbers are taken out. */
export function confirmationDetail(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  return message
    .replace(/\b(?:cs|pi|seti|pm|cus|sub|pk|sk|rk|price|prod|in|ch)_(?:live_|test_)?[A-Za-z0-9_]{6,}\b/g, '[id]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}
