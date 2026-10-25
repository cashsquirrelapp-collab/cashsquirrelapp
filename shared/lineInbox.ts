// The app's "แจ้งเตือนอัตโนมัติ" thread (owner, 2026-10-24: real, per account, not a mock-up). The server builds
// these cards from the account's own data with the same rules as the LINE messages (the 08:00 reminder, the
// monthly summary, the quick replies); the chat draws them with the LINE template (LineCard.tsx).

export type LineCategory = 'reminder' | 'urgent' | 'received' | 'report' | 'working';
export type LineTone = 'text' | 'muted' | 'positive' | 'negative' | 'warning';
export type LineRow = { label: string; value: string; tone?: LineTone; caption?: string; strong?: boolean };
/**
 * A job in a reminder or list card. `due` shows the ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ buttons; `prompt` is the
 * text "ได้ไม่ครบ" puts in the message box (the amount is typed after it).
 */
export type LineItem = { id: string; name: string; client: string; amount: string; meta?: string; metaTone?: LineTone; due?: boolean; prompt?: string };
export type LineBlock =
  | { kind: 'section'; title: string; tone: LineTone; items: LineItem[] }
  | { kind: 'items'; items: LineItem[] }
  | { kind: 'rows'; rows: LineRow[] }
  | { kind: 'divider' };
export type LineCardData = {
  category: LineCategory;
  title: string;
  subtitle?: string;
  metric?: { label: string; value: string; note?: string };
  blocks: LineBlock[];
  note?: string;
  footer?: { label: string; path: string };
  /** The line LINE shows in its push banner and chat list (the card's altText). */
  alt: string;
};

export type LineInboxNotice = { id: string; at: number; card: LineCardData };
export type LineInbox = {
  notices: LineInboxNotice[];
  /** The answers to the thread's quick replies (รอรับเงิน, สรุปเดือนนี้, กำลังดำเนินการ). */
  quick: { unpaid: LineCardData; month: LineCardData; wip: LineCardData };
  /** Whether this account has LINE linked and the 08:00 reminder switched on. */
  lineLinked: boolean;
  reminderOn: boolean;
  /** What was tapped and typed in this thread and the answers, kept in the account (2026-10-24), oldest first. */
  history?: LineThreadMessage[];
};
/** A kept message of the thread: `cards` are LINE cards ({ kind: 'line', card }) or เลขา's own cards. */
export type LineThreadMessage = { id: string; role: 'user' | 'assistant'; text: string; at: string; cards?: unknown[] };
export type LineQuickKind = 'unpaid' | 'month' | 'wip';
/** What a payment button or a typed partial amount did. */
export type LineInboxReply = { text?: string; card?: LineCardData; prompt?: string };
