const DEFAULT_LINE_AI_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_OUTPUT_TOKENS = 4096;
const MAX_CONTEXT_ITEMS = 10;

export interface LineAiPolicy {
  enabled: boolean;
  model: string;
  maxOutputTokens: number;
}

/** Configuration only; deterministic LINE features work independently of this policy. */
export function getLineAiPolicy(env: Record<string, string | undefined> = process.env): LineAiPolicy {
  const configuredTokens = env.LINE_AI_MAX_OUTPUT_TOKENS?.trim();
  const requestedTokens = configuredTokens ? Number(configuredTokens) : DEFAULT_OUTPUT_TOKENS;
  return {
    enabled: env.LINE_AI_ENABLED?.trim().toLowerCase() !== 'false',
    model: env.LINE_AI_MODEL?.trim() || DEFAULT_LINE_AI_MODEL,
    maxOutputTokens: Number.isFinite(requestedTokens)
      ? Math.min(DEFAULT_OUTPUT_TOKENS, Math.max(256, Math.floor(requestedTokens)))
      : DEFAULT_OUTPUT_TOKENS,
  };
}

const ENTRY_COMMAND = /^(?:บันทึกงาน|เพิ่มงาน|บันทึกรายจ่าย|เพิ่มรายจ่าย|จ่าย)/u;
const QUESTION_MARKER = /[?？]|เท่าไหร่|เท่าไร|กี่|ไหน|อะไร|ทำไม|อย่างไร|ยังไง|หรือ|ไหม|มั้ย|สรุป|รายงาน|เปรียบเทียบ|ขอดู|ดูยอด|ดูงาน/u;

/** Account list limits are explicit so the model cannot describe a sample as exhaustive.
 * Aggregate numbers and objects remain intact for financial questions. This function never
 * sums a truncated list, mutates the snapshot, or contacts a model provider.
 */
export function compactLineAiContext(
  formatted: Record<string, unknown>,
  text: string,
  hasPendingDraft: boolean,
): Record<string, unknown> {
  const question = QUESTION_MARKER.test(text);
  const entry = ENTRY_COMMAND.test(text.trim());
  if (!question && (entry || hasPendingDraft)) {
    return { _lineContext: {
      mode: 'extraction_only', accountDataIncluded: false,
      reason: entry ? 'entry_command' : 'pending_draft',
    } };
  }

  const lists: Record<string, { total: number; shown: number; omitted: number }> = {};
  function compact(value: unknown, path: string): unknown {
    if (Array.isArray(value)) {
      const shown = Math.min(value.length, MAX_CONTEXT_ITEMS);
      lists[path] = { total: value.length, shown, omitted: value.length - shown };
      return value.slice(0, shown).map((item, index) => compact(item, `${path}[${index}]`));
    }
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item, path ? `${path}.${key}` : key)]));
    }
    return value;
  }
  const result = Object.fromEntries(Object.entries(formatted).map(([key, value]) => [key, compact(value, key)]));
  return { ...result, _lineContext: {
    mode: 'account_summary', accountDataIncluded: true, maxItemsPerList: MAX_CONTEXT_ITEMS,
    lists, hasOmissions: Object.values(lists).some(list => list.omitted > 0),
  } };
}
