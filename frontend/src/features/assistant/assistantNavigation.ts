import { isPhaseOneFeatureAvailable } from '../../../../shared/featureAvailability';

export type NavigationMode = 'manual' | 'auto';
export type NavigationCard = { kind: 'navigation'; label: string; path: string; autoOpen: boolean };
export type NavigationContext = { accountId?: string; workspaceSlug?: string | null; fullFeatureAccess?: boolean };
const FEATURES = new Set(['dashboard', 'incomeExpense', 'jobs', 'calendar', 'receivables', 'invoice', 'feedback', 'split', 'report', 'tax', 'vault', 'wht50', 'insight', 'settings', 'plans']);
const LABELS: Record<string, string> = { 'ภาพรวม': 'dashboard', 'รายรับรายจ่าย': 'incomeExpense', 'รายรับ / รายจ่าย': 'incomeExpense', 'งาน': 'jobs', 'หน้างาน': 'jobs', 'ปฏิทิน': 'calendar', 'เงินรอรับ': 'receivables', 'เอกสาร': 'invoice', 'หน้าเอกสาร': 'invoice', 'ใบเสนอราคา': 'invoice', 'บอกเรา': 'feedback', 'เป้าหมาย': 'split', 'รายงาน': 'report', 'ภาษี': 'tax', 'คลังเอกสาร': 'vault', 'ใบ 50 ทวิ': 'wht50' };
const DOCUMENT_TYPES = new Set(['quotation', 'invoice', 'receipt', 'taxInvoice', 'receiptTaxInvoice']);
const SETTINGS_VIEWS = new Set(['home', 'profile', 'business', 'fixed', 'notif', 'line']);

/** Routes are data, never an instruction to fetch, execute or switch accounts. Unknown query keys fail closed. */
export function safeAssistantPath(raw: unknown, context: NavigationContext, explicit = false): string | null {
  if (typeof raw !== 'string' || raw.length > 700 || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u0020\u007f#]/.test(raw) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(raw) || /%2f|%5c|%2e|%00/i.test(raw.split('?')[0])) return null;
  let url: URL;
  try { url = new URL(raw, 'https://assistant.invalid'); } catch { return null; }
  if (url.origin !== 'https://assistant.invalid' || /%2f|%5c|%2e|%00/i.test(url.pathname)) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 1 || segments.length > 2 || /\/\//.test(url.pathname)) return null;
  const feature = segments[0];
  if (!FEATURES.has(feature) || !isPhaseOneFeatureAvailable(feature, Boolean(context.fullFeatureAccess))) return null;
  if ((feature === 'settings' || feature === 'plans') && !explicit) return null;
  if (segments[1]) {
    let slug: string; try { slug = decodeURIComponent(segments[1]); } catch { return null; }
    if (!context.workspaceSlug || slug !== context.workspaceSlug) return null;
  }
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) return null;
  for (const [key, value] of url.searchParams) {
    if (feature === 'invoice' && key === 'type' && DOCUMENT_TYPES.has(value)) continue;
    if (feature === 'invoice' && key === 'document' && /^[\p{L}\p{N}_-]{1,128}$/u.test(value)) continue;
    // A saved job or expense is shown in its list, blinking (owner, 2026-10-28); the id is only looked up.
    if (feature === 'jobs' && key === 'job' && /^[\p{L}\p{N}_.:-]{1,128}$/u.test(value)) continue;
    if (feature === 'incomeExpense' && key === 'expense' && /^[\p{L}\p{N}_.:-]{1,128}$/u.test(value)) continue;
    if (feature === 'settings' && key === 'view' && SETTINGS_VIEWS.has(value)) continue;
    return null;
  }
  const slug = context.workspaceSlug ? `/${encodeURIComponent(context.workspaceSlug)}` : '';
  return `/${feature}${slug}${url.search}`;
}

export function navigationCards(cards: unknown, context: NavigationContext): NavigationCard[] {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0,20).flatMap(card => {
    if (!card || card.kind !== 'navigation' || typeof card.label !== 'string' || !card.label.trim() || card.label.length > 80 || typeof card.autoOpen !== 'boolean') return [];
    const path = safeAssistantPath(card.path, context, true);
    return path ? [{ kind: 'navigation' as const, label: card.label.trim(), path, autoOpen: card.autoOpen }] : [];
  }).slice(0,5);
}

export function featureLabelPath(label: string, cards: unknown, context: NavigationContext): string | null {
  const exact = navigationCards(cards, context).find(card => card.label === label.trim());
  if (exact) return exact.path;
  const feature = LABELS[label.trim()];
  return feature ? safeAssistantPath(`/${feature}`, context) : null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const modeKey = (account: string) => `krarok_assistant_navigation_v1:${encodeURIComponent(account)}`;
export function readNavigationMode(account?: string, storage?: StorageLike): NavigationMode {
  if (!account) return 'manual';
  try { return (storage ?? localStorage).getItem(modeKey(account)) === 'auto' ? 'auto' : 'manual'; } catch { return 'manual'; }
}
export function saveNavigationMode(account: string | undefined, mode: NavigationMode, storage?: StorageLike): void {
  if (!account) return;
  try { (storage ?? localStorage).setItem(modeKey(account), mode); } catch { /* preference only */ }
}

/** Confirm cards the app already saved (the user said to save), and where each opens (only safe in-app paths). */
export function savedCards(cards: unknown, context: NavigationContext): { ids: string[]; paths: Record<string, string> } {
  const ids: string[] = []; const paths: Record<string, string> = {};
  if (!Array.isArray(cards)) return { ids, paths };
  for (const card of cards.slice(0, 50)) {
    if (!card || card.kind !== 'confirm' || card.status !== 'applied' || typeof card.id !== 'string') continue;
    ids.push(card.id);
    const path = safeAssistantPath(card.path, context);
    if (path) paths[card.id] = path;
  }
  return { ids, paths };
}

export function automaticNavigation(cards: unknown, context: NavigationContext, mode: NavigationMode, currentAccount?: string): string | null {
  if (mode !== 'auto' || !context.accountId || context.accountId !== currentAccount || !context.workspaceSlug) return null;
  return navigationCards(cards, context).find(card => card.autoOpen)?.path ?? null;
}
