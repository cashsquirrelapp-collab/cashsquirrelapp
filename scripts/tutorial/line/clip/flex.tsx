import React from 'react';

// Draws the parts of a LINE Flex message that the app's cards use (boxes, text, image, separator,
// button), so the clip shows the cards exactly as the app's builders define them.
// LINE's own keyword sizes (Flex Message reference): xxs 11 … xxl 29, 3xl 35.
const SIZE: Record<string, number> = { xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29, '3xl': 35 };
const GAP: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };
const px = (value: unknown): number | string | undefined => (typeof value === 'string' && value.endsWith('px') ? parseFloat(value) : typeof value === 'string' && value.endsWith('%') ? value : typeof value === 'string' ? GAP[value] : undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const gradient = (bg: Node): string | undefined => bg?.type !== 'linearGradient' ? undefined
  : `linear-gradient(${bg.angle}, ${bg.startColor}${bg.centerColor ? `, ${bg.centerColor} ${bg.centerPosition || '50%'}` : ''}, ${bg.endColor})`;

function Flex({ node, row = false }: { node: Node; row?: boolean }) {
  const margin = node.margin ? { [row ? 'marginLeft' : 'marginTop']: px(node.margin) } : {};
  const flex = node.flex === 0 || node.width ? { flex: 'none' } : row ? { flex: `${node.flex ?? 1} 1 0`, minWidth: 0 } : {};
  const pinned: React.CSSProperties = node.position === 'absolute' ? { position: 'absolute', top: px(node.offsetTop) ?? 0, left: px(node.offsetStart) ?? 0 } : {};
  if (node.type === 'text') {
    const clamp: React.CSSProperties = node.maxLines ? { display: '-webkit-box', WebkitLineClamp: node.maxLines, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap' } : { whiteSpace: node.wrap ? 'pre-wrap' : 'nowrap', textOverflow: 'ellipsis' };
    return <p style={{ ...margin, ...flex, margin: 0, ...margin, fontSize: SIZE[node.size] ?? 16, fontWeight: node.weight === 'bold' ? 700 : 400, color: node.color ?? '#111', textAlign: node.align === 'end' ? 'right' : node.align === 'center' ? 'center' : undefined, lineHeight: 1.45, overflow: 'hidden', ...clamp }}>{node.text}</p>;
  }
  if (node.type === 'separator') return <div style={{ ...margin, height: 1, flex: 'none', background: node.color ?? '#E5E3DF' }} />;
  if (node.type === 'image') {
    const size = px(node.size);
    const side = typeof size === 'number' ? size : undefined;
    const [rw, rh] = String(node.aspectRatio || '1:1').split(':').map(Number);
    const width = side ?? '100%';
    return <img src={node.url} alt="" draggable={false} style={{ ...margin, ...flex, ...pinned, width, height: side ? side * (rh / rw) : undefined, aspectRatio: side ? undefined : `${rw} / ${rh}`, maxWidth: 'none', objectFit: node.aspectMode === 'cover' ? 'cover' : 'contain', display: 'block' }} />;
  }
  if (node.type === 'button') {
    const primary = node.style === 'primary', link = node.style === 'link';
    return <div style={{ ...margin, ...flex, height: node.height === 'sm' ? 40 : 52, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, background: primary ? (node.color ?? '#17C950') : link ? 'transparent' : (node.color ?? '#DCDFE5'), color: primary ? '#FFFFFF' : link ? (node.color ?? '#42659A') : '#111111' }}>{node.action?.label}</div>;
  }
  const horizontal = node.layout === 'horizontal' || node.layout === 'baseline';
  const all = px(node.paddingAll) ?? 0;
  return (
    <div style={{
      ...margin, ...flex, ...pinned, position: pinned.position ?? 'relative', width: px(node.width), height: px(node.height), boxSizing: 'border-box',
      display: 'flex', flexDirection: horizontal ? 'row' : 'column', gap: px(node.spacing) ?? 0,
      paddingTop: px(node.paddingTop) ?? all, paddingBottom: px(node.paddingBottom) ?? all, paddingLeft: px(node.paddingStart) ?? all, paddingRight: px(node.paddingEnd) ?? all,
      background: gradient(node.background) ?? node.backgroundColor, borderRadius: px(node.cornerRadius),
      border: node.borderColor ? `${px(node.borderWidth) ?? 1}px solid ${node.borderColor}` : undefined,
      justifyContent: node.justifyContent === 'center' ? 'center' : node.justifyContent === 'space-between' ? 'space-between' : undefined,
      alignItems: node.alignItems === 'center' ? 'center' : node.alignItems === 'flex-end' ? 'flex-end' : node.layout === 'baseline' ? 'baseline' : horizontal ? 'flex-start' : undefined, overflow: node.cornerRadius ? 'hidden' : undefined,
    }}>
      {(node.contents || []).map((child: Node, i: number) => <Flex key={i} node={child} row={horizontal} />)}
    </div>
  );
}

/** One bot card, as its Flex definition lays it out (LINE's "mega" bubble is 300px wide). */
export function LineCard({ message, width = 300 }: { message: Node; width?: number }) {
  const bubble = message.contents;
  return (
    <div style={{ width, borderRadius: 18, overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
      {bubble.header && <div style={{ background: bubble.styles?.header?.backgroundColor, overflow: 'hidden' }}><Flex node={bubble.header} /></div>}
      {bubble.body && <div style={{ background: bubble.styles?.body?.backgroundColor }}><Flex node={bubble.body} /></div>}
      {bubble.footer && <div style={{ background: bubble.styles?.footer?.backgroundColor }}><Flex node={bubble.footer} /></div>}
    </div>
  );
}
