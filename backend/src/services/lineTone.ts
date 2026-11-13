import { LINE_CARD_COLORS as C } from './lineCards.js';
import type { LineMessage } from './line.js';

// Every main button is CI orange with white words, whatever the header (owner, 2026-11-14, after the competitor's cards:
// headers may differ by kind, "แต่ปุ่มกดอ่ะเขาเป็นปุ่มแบบ CI"; this replaces 2026-11-13's buttons in the header colour).
// Applied once, to every LINE message on its way out (push, reply and the 50 ทวิ push), so a card built anywhere — and any
// added later — follows it. LINE draws its own buttons' words in a colour it picks, so each button becomes a rounded box
// whose words are white by our own choice; a secondary button becomes the same box in light grey, so buttons side by side
// stay the same height.

type Node = Record<string, unknown>;
const isNode = (value: unknown): value is Node => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function box(button: Node, background: string, words: string): Node {
  const action = isNode(button.action) ? button.action : undefined;
  const label = typeof action?.label === 'string' ? action.label : '';
  return {
    type: 'box', layout: 'vertical', justifyContent: 'center', cornerRadius: '8px',
    paddingTop: '10px', paddingBottom: '10px', paddingStart: '10px', paddingEnd: '10px',
    backgroundColor: background,
    ...(button.flex !== undefined ? { flex: button.flex } : {}),
    ...(button.margin !== undefined ? { margin: button.margin } : {}),
    ...(action ? { action } : {}),
    contents: [{ type: 'text', text: label || ' ', size: 'sm', weight: 'bold', color: words, align: 'center', wrap: true, maxLines: 2 }],
  };
}

function tone(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(item => tone(item));
  if (!isNode(node)) return node;
  if (node.type === 'button') {
    return node.style === 'primary' ? box(node, C.accent, C.white) : box(node, C.subtle, C.text);
  }
  if (!Array.isArray(node.contents)) return node;
  return { ...node, contents: tone(node.contents) };
}

function toneBubble(bubble: unknown): unknown {
  if (!isNode(bubble) || bubble.type !== 'bubble') return bubble;
  return {
    ...bubble,
    ...(bubble.body ? { body: tone(bubble.body) } : {}),
    ...(bubble.footer ? { footer: tone(bubble.footer) } : {}),
  };
}

/** The message as sent: every card's buttons as CI-orange (or grey) boxes. Text and other messages pass through unchanged. */
export function toneLineMessage(message: LineMessage): LineMessage {
  const flex = message as LineMessage & { type?: string; contents?: unknown };
  if (flex.type !== 'flex' || !isNode(flex.contents)) return message;
  const contents = flex.contents.type === 'carousel' && Array.isArray(flex.contents.contents)
    ? { ...flex.contents, contents: flex.contents.contents.map(toneBubble) }
    : toneBubble(flex.contents);
  return { ...flex, contents } as LineMessage;
}

export const toneLineMessages = (messages: LineMessage[]): LineMessage[] => messages.map(toneLineMessage);
