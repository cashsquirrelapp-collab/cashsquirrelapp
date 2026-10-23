import { Language } from './translations.js';

// A framework-free mirror of the active language, readable from plain (non-component) code.
// Deliberately has ZERO React dependency: src/utils.ts imports this, and utils.ts is also
// imported by the Vercel serverless functions under api/ (a plain Node.js runtime with no React
// available) -- utils.ts importing LanguageContext.tsx directly once crashed every one of those
// functions with ERR_MODULE_NOT_FOUND, since that file (and its React import) doesn't resolve
// in that build. On the backend nothing ever calls setCurrentLanguage, so this just stays 'th',
// which is correct today since LINE/email messages built server-side aren't translated (yet).
// In a browser it starts from the saved choice, so text drawn before the provider (an error screen)
// is already in the right language; on the server it stays Thai.
function initialLanguage(): Language {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('cashflow_language') === 'en' ? 'en' : 'th'; }
  catch { return 'th'; }
}
export let currentLanguage: Language = initialLanguage();

export function setCurrentLanguage(lang: Language): void {
  currentLanguage = lang;
}
