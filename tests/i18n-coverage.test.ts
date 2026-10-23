import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { EN } from '../frontend/src/i18n/en/index.ts';
import { englishBahtText, thaiBahtText } from '../frontend/src/features/invoices/documentMath.ts';

// English and Thai are complete in every feature (owner, 2026-10-22). Every text the app shows
// through tr(), trc() or T() is keyed by its Thai, so each one needs an English entry in i18n/en.

const SRC = path.join(import.meta.dirname, '../frontend/src');
// Kept for reference, never shown: the old landing page and the files listed as unused.
const SKIP_DIRS = [path.join(SRC, 'i18n'), path.join(SRC, 'features/marketing/landing')];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (!SKIP_DIRS.includes(full)) sourceFiles(full, out); }
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function translatedTexts(): { text: string; context: string | null; file: string }[] {
  const found: { text: string; context: string | null; file: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['tr', 'trc', 'T'].includes(node.expression.text)) {
        const withContext = node.expression.text === 'trc';
        const arg = node.arguments[withContext ? 1 : 0];
        const context = withContext && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null;
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) found.push({ text: arg.text, context, file: path.relative(SRC, file) });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

test('every tr(), trc() and T() text has English', () => {
  const texts = translatedTexts();
  assert.ok(texts.length > 3000, `expected the app's texts, found ${texts.length}`);
  const missing = texts.filter(({ text, context }) => !(context && EN[`${context}|${text}`] !== undefined) && EN[text] === undefined);
  assert.deepEqual(missing.map(({ text, file }) => `${file}: ${text}`), []);
});

test('English entries keep their placeholders and have no Thai', () => {
  const thai = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;
  // The language switch names Thai in Thai; data keys translate the same Thai word to English.
  const thaiAllowed = new Set(['ไทย']);
  const problems: string[] = [];
  for (const [key, value] of Object.entries(EN)) {
    const th = /^[a-z]+\|/.test(key) ? key.slice(key.indexOf('|') + 1) : key;
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(',');
    if (holes(th) !== holes(value)) problems.push(`placeholders differ: ${key} -> ${value}`);
    if (thai.test(value) && !thaiAllowed.has(value)) problems.push(`Thai in English: ${key} -> ${value}`);
  }
  assert.deepEqual(problems, []);
});

test('amounts in words: English reads like the Thai', () => {
  assert.equal(englishBahtText(0), 'Zero Baht Only');
  assert.equal(englishBahtText(21), 'Twenty-One Baht Only');
  assert.equal(englishBahtText(1250.5), 'One Thousand Two Hundred Fifty Baht and Fifty Satang');
  assert.equal(englishBahtText(1_000_001), 'One Million One Baht Only');
  assert.equal(thaiBahtText(1250.5), 'หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์');
});
