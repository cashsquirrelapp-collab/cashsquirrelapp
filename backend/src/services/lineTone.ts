import { LINE_CARD_COLORS as C } from './lineCards.js';
import type { LineMessage } from './line.js';

// Buttons take the colour of their card's header (owner, 2026-11-13, a red รายจ่าย card with an orange-brown button:
// "เห็นไหมว่าปุ่มกดสีมันต่างกันจริงๆ สีด้านบนการ์ดด้านบนสวยแล้ว" → "เก็บหัวสีแบบนี้ แก้ปุ่มให้เข้ากัน"). Applied once, to every
// LINE message on its way out (push, reply and the 50 ทวิ push), so a card built anywhere — and any added later — follows it.
// The header keeps its gradient; the button is that header's middle colour with white words. LINE draws its own buttons'
// words in a colour it picks, so each button becomes a rounded box whose words are white by our own choice; a secondary
// button becomes the same box in light grey, so buttons side by side stay the same height.

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

function tone(node: unknown, color: string): unknown {
  if (Array.isArray(node)) return node.map(item => tone(item, color));
  if (!isNode(node)) return node;
  if (node.type === 'button') {
    return node.style === 'primary' ? box(node, color, C.white) : box(node, C.subtle, C.text);
  }
  const next: Node = { ...node };
  // A card's own rounded pill in the old orange (the 50 ทวิ buttons) and a link line in it.
  if (node.type === 'box' && node.backgroundColor === C.accent) {
    next.backgroundColor = color;
    if (node.borderColor === C.accent) next.borderColor = color;
  }
  if (node.type === 'text' && node.color === C.accent) next.color = color;
  if (Array.isArray(node.contents)) next.contents = tone(node.contents, color);
  return next;
}

function toneBubble(bubble: unknown): unknown {
  if (!isNode(bubble) || bubble.type !== 'bubble') return bubble;
  const styles = isNode(bubble.styles) ? bubble.styles : undefined;
  const header = styles && isNode(styles.header) ? styles.header : undefined;
  // A card without a coloured header (a plain text bubble) keeps the brand colour for its button.
  const color = typeof header?.backgroundColor === 'string' && header.backgroundColor !== C.white ? header.backgroundColor : C.accent;
  return {
    ...bubble,
    ...(bubble.body ? { body: tone(bubble.body, color) } : {}),
    ...(bubble.footer ? { footer: tone(bubble.footer, color) } : {}),
  };
}

/** The message as sent: every card's buttons in its header's colour. Text and other messages pass through unchanged. */
export function toneLineMessage(message: LineMessage): LineMessage {
  const flex = message as LineMessage & { type?: string; contents?: unknown };
  if (flex.type !== 'flex' || !isNode(flex.contents)) return message;
  const contents = flex.contents.type === 'carousel' && Array.isArray(flex.contents.contents)
    ? { ...flex.contents, contents: flex.contents.contents.map(toneBubble) }
    : toneBubble(flex.contents);
  return { ...flex, contents } as LineMessage;
}

export const toneLineMessages = (messages: LineMessage[]): LineMessage[] => messages.map(toneLineMessage);
