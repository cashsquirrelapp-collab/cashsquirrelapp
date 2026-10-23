import React from 'react';

// A small, safe Markdown renderer for chat answers: paragraphs, **bold**, `code`, links, bullet and
// numbered lists, simple tables and short headings. It builds React elements only (no HTML strings),
// so an answer can never inject markup. Links: in-app paths ("/jobs") open inside the app; http(s)
// links open in a new tab; anything else stays plain text.

type Props = { text: string; onNavigate?: (path: string) => void };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

function inline(text: string, onNavigate: Props['onNavigate'], keyBase: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith('/') && !href.startsWith('//')) {
        return <a key={key} href={href} onClick={event => { if (!onNavigate) return; event.preventDefault(); onNavigate(href); }}>{label}</a>;
      }
      if (/^https?:\/\//i.test(href)) return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
      return <React.Fragment key={key}>{label}</React.Fragment>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());

export function Markdown({ text, onNavigate }: Props) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  // A table starts with a "| a | b |" row followed by a "|---|" row (while an answer is still streaming
  // in, the second row may not have arrived yet: the first row then shows as plain text for a moment).
  const tableAt = (n: number) => lines[n].trim().startsWith('|') && Boolean(lines[n + 1]) && /^\s*\|?\s*:?-{3,}/.test(lines[n + 1]);
  const listLine = (s: string) => /^\s*(\d+\.|[-*])\s+/.test(s);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const key = `b${i}`;
    if (tableAt(i)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
      blocks.push(
        <div key={key} className="asx-md-table" role="region" aria-label={head.join(' · ')} tabIndex={0}>
          <table>
            <thead><tr>{head.map((cell, c) => <th key={c} scope="col">{inline(cell, onNavigate, `${key}h${c}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell, onNavigate, `${key}r${r}c${c}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (listLine(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) { items.push(lines[i].replace(pattern, '')); i++; }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={key}>{items.map((item, n) => <li key={n}>{inline(item, onNavigate, `${key}i${n}`)}</li>)}</List>);
      continue;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) { blocks.push(<p key={key} className="asx-md-heading">{inline(heading[1], onNavigate, key)}</p>); i++; continue; }
    // A paragraph always takes this line, so the loop always moves on.
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !tableAt(i) && !listLine(lines[i]) && !/^#{1,3}\s/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key}>{para.map((part, n) => <React.Fragment key={n}>{n > 0 && <br />}{inline(part, onNavigate, `${key}p${n}`)}</React.Fragment>)}</p>);
  }
  return <div className="asx-md">{blocks}</div>;
}
