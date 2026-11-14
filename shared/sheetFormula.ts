// สูตรของลูกค้า (owner, 2026-11-14: "ถ้าสูตรของเขากับสูตรของเราไม่เหมือนกัน … ให้เลขากระรอกเข้าใจในสูตรแบบของเขา"): before a
// row is written, the card shows what the customer's own formulas will make of it ("F จะได้ 2,910 ตามสูตรของคุณ"), and
// says so when that differs from the app. The numbers come from this small, fixed reader of the formula, never from the
// AI; a formula it cannot read (another tab, a lookup, text) gives null and the card keeps "คำนวณเอง".
//
// It reads a formula that refers only to cells of its own row: numbers, + - * / ^, %, comparisons, parentheses, and
// SUM, ROUND, ROUNDUP, ROUNDDOWN, ABS, MIN, MAX, IF (with "," or ";" between arguments, as a sheet in any language writes).

const letters = (text: string) => { let n = 0; for (const ch of text) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** A formula of the row above, as the sheet has it once it is copied into `toRow` (relative rows move with it). */
export function shiftFormula(formula: string, fromRow: number, toRow: number): string {
  const by = toRow - fromRow;
  return formula.replace(/(?<![A-Za-z_])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g, (whole, a, column, b, row) => (b ? whole : `${a}${column}${b}${Number(row) + by}`));
}

type Token = { t: 'num'; v: number } | { t: 'ref'; col: number; row: number } | { t: 'fn'; v: string } | { t: 'op'; v: string };

function tokenize(source: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  const text = source.trim().replace(/^=/, '');
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpMatchArray | null;
    if (/^\s/.test(rest)) { i += 1; continue; }
    if ((m = rest.match(/^\d+(?:\.\d+)?/))) { out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\$?([A-Z]{1,3})\$?(\d+)/)) && !/^[A-Z]{1,3}\$?\d*\s*\(/.test(rest)) { out.push({ t: 'ref', col: letters(m[1]), row: Number(m[2]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^([A-Za-z][A-Za-z0-9.]*)\s*\(/))) { out.push({ t: 'fn', v: m[1].toUpperCase() }); i += m[0].length; continue; }
    if ((m = rest.match(/^(<=|>=|<>|[-+*/^%(),;:=<>])/))) { out.push({ t: 'op', v: m[1] === ';' ? ',' : m[1] }); i += m[1].length; continue; }
    return null;
  }
  return out;
}

class Unreadable extends Error {}

/** The value the formula gives in `row`, from the row's cells; null when the formula is not one this reader knows. */
export function evaluateRowFormula(formula: string, row: number, valueAt: (column: number) => number | null): number | null {
  const tokens = tokenize(formula);
  if (!tokens?.length) return null;
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
  const take = (v: string) => { if (!isOp(v)) throw new Unreadable(); at += 1; };
  const cell = (token: { col: number; row: number }) => {
    if (token.row !== row) throw new Unreadable();
    const value = valueAt(token.col);
    if (value === null || !Number.isFinite(value)) throw new Unreadable();
    return value;
  };
  // A list of arguments; a same-row range A5:C5 counts as its cells.
  const args = (): number[] => {
    const list: number[] = [];
    if (isOp(')')) { at += 1; return list; }
    for (;;) {
      const token = peek();
      if (token?.t === 'ref' && tokens[at + 1]?.t === 'op' && (tokens[at + 1] as { v: string }).v === ':' && tokens[at + 2]?.t === 'ref') {
        const end = tokens[at + 2] as { col: number; row: number };
        if (token.row !== row || end.row !== row) throw new Unreadable();
        for (let column = Math.min(token.col, end.col); column <= Math.max(token.col, end.col); column += 1) { const value = valueAt(column); if (value !== null) list.push(value); }
        at += 3;
      } else list.push(comparison());
      if (isOp(',')) { at += 1; continue; }
      take(')');
      return list;
    }
  };
  const round = (value: number, places: number, mode: 'near' | 'up' | 'down') => {
    const f = 10 ** places;
    const scaled = Math.abs(value) * f;
    const r = mode === 'up' ? Math.ceil(scaled - 1e-9) : mode === 'down' ? Math.floor(scaled + 1e-9) : Math.round(scaled + 1e-9);
    return Math.sign(value) * r / f;
  };
  const primary = (): number => {
    const token = peek();
    if (!token) throw new Unreadable();
    if (token.t === 'num') { at += 1; return token.v; }
    if (token.t === 'ref') { at += 1; return cell(token); }
    if (token.t === 'fn') {
      at += 1;
      const name = token.v;
      if (name === 'IF') {
        const list = args();
        if (list.length < 2 || list.length > 3) throw new Unreadable();
        return list[0] ? list[1] : (list[2] ?? 0);
      }
      const list = args();
      if (name === 'SUM') return list.reduce((sum, value) => sum + value, 0);
      if (name === 'MIN' && list.length) return Math.min(...list);
      if (name === 'MAX' && list.length) return Math.max(...list);
      if (name === 'ABS' && list.length === 1) return Math.abs(list[0]);
      if ((name === 'ROUND' || name === 'ROUNDUP' || name === 'ROUNDDOWN') && list.length >= 1 && list.length <= 2) {
        return round(list[0], Math.trunc(list[1] ?? 0), name === 'ROUNDUP' ? 'up' : name === 'ROUNDDOWN' ? 'down' : 'near');
      }
      throw new Unreadable();
    }
    if (isOp('(')) { at += 1; const value = comparison(); take(')'); return value; }
    throw new Unreadable();
  };
  const postfix = (): number => { let value = primary(); while (isOp('%')) { at += 1; value /= 100; } return value; };
  const unary = (): number => { if (isOp('-')) { at += 1; return -unary(); } if (isOp('+')) { at += 1; return unary(); } return postfix(); };
  const power = (): number => { let value = unary(); while (isOp('^')) { at += 1; value = value ** unary(); } return value; };
  const term = (): number => {
    let value = power();
    while (isOp('*') || isOp('/')) {
      const op = (peek() as { v: string }).v; at += 1;
      const right = power();
      if (op === '/' && right === 0) throw new Unreadable();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  };
  const additive = (): number => { let value = term(); while (isOp('+') || isOp('-')) { const op = (peek() as { v: string }).v; at += 1; const right = term(); value = op === '+' ? value + right : value - right; } return value; };
  const comparison = (): number => {
    const left = additive();
    for (const op of ['<=', '>=', '<>', '=', '<', '>']) {
      if (!isOp(op)) continue;
      at += 1;
      const right = additive();
      const result = op === '<=' ? left <= right : op === '>=' ? left >= right : op === '<>' ? left !== right : op === '=' ? left === right : op === '<' ? left < right : left > right;
      return result ? 1 : 0;
    }
    return left;
  };
  try {
    const value = comparison();
    if (at !== tokens.length || !Number.isFinite(value)) return null;
    return Math.round(value * 1e6) / 1e6;
  } catch (error) {
    if (error instanceof Unreadable) return null;
    throw error;
  }
}

/** The new row's formula columns worked out together (one may use another: F = D - E with E a formula too). */
export function evaluateRow(formulas: Record<number, string>, row: number, typed: Record<number, number | null>): Record<number, number | null> {
  const known: Record<number, number | null> = { ...typed };
  const out: Record<number, number | null> = {};
  const columns = Object.keys(formulas).map(Number);
  for (const column of columns) { out[column] = null; delete known[column]; }
  // A few passes are enough for the chains a bookkeeping row has.
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const column of columns) {
      if (out[column] !== null) continue;
      // An empty cell counts as 0, as in the sheet; text in a sum makes the formula unreadable here.
      const value = evaluateRowFormula(formulas[column], row, index => (index in out ? out[index] : index in known ? known[index] : 0));
      if (value !== null) { out[column] = value; changed = true; }
    }
    if (!changed) break;
  }
  return out;
}
