// Builds the LINE form's document picture (frontend/src/liff/documentImage.tsx) as one self-contained file at
// build/frontend/liff-document-image.js, loaded by public/liff-document.js only after a document is created. It is
// separate from the app's Vite build so it never pulls in (and starts) the app itself; Thai only (i18n/tr swapped
// for liff/thaiOnly.ts).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [path.join(root, 'frontend/src/liff/documentImage.tsx')],
  outfile: path.resolve(root, process.argv[2] || 'build/frontend/liff-document-image.js'),
  bundle: true, minify: true, format: 'iife', target: 'es2019', jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'thai-only', setup(b) {
    b.onResolve({ filter: /\/i18n\/tr$/ }, () => ({ path: path.join(root, 'frontend/src/liff/thaiOnly.ts') }));
    b.onResolve({ filter: /\/i18n\/currentLanguage$/ }, () => ({ path: 'current-language', namespace: 'thai-only' }));
    b.onLoad({ filter: /.*/, namespace: 'thai-only' }, () => ({ contents: "export const currentLanguage = 'th'; export default currentLanguage;", loader: 'ts' }));
  } }],
  logLevel: 'warning',
});
console.log('liff-document-image built');
