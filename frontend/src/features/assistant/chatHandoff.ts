import type { ChatMessage } from './assistantMock';
import type { ConfirmState } from './ChatCards';

/** The small window's conversation, carried into the full chat when the window's expand button opens it (owner,
 *  2026-10-27: "2 หน้านี้มันควรเป็นหน้าเดียวกัน"): the same messages, the cards as they stand, and what was typed. */
export type ChatHandoff = {
  /** The conversation so far; none when nothing was asked yet. */
  chat?: {
    id: string;
    title: string;
    messages: ChatMessage[];
    confirmStates: Record<string, ConfirmState>;
    confirmedPaths: Record<string, string>;
  };
  /** What was typed and not yet sent. */
  draft?: string;
};

/** A chat's title from its first message, as the full chat names a new one. */
export const chatTitle = (text: string) => (text.length > 42 ? `${text.slice(0, 42)}…` : text);
