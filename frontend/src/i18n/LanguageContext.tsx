import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { Language, translations } from './translations';
import { setCurrentLanguage } from './currentLanguage';

const STORAGE_KEY = 'cashflow_language';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' ? 'en' : 'th';
  } catch {
    return 'th';
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);
  // A handful of plain (non-component) helpers in utils.ts -- getRelativeDaysText,
  // formatMonthKey, safeFormatThaiDate, dateLocale -- need to know the current language too, but
  // can't call useLanguage() since they're not hooks. currentLanguage.ts's module-level mirror
  // (deliberately React-free -- see its own comment) lets them read it synchronously. Kept in
  // sync by assigning it in the Provider's render body (not a useEffect): since the Provider is
  // always an ancestor of anything calling these helpers, the assignment lands before any child
  // renders in the same commit, so it's never one render stale.
  setCurrentLanguage(language);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Best-effort -- a private-browsing/storage-blocked session just won't remember the
      // choice across reloads, which is a minor inconvenience, not a broken feature.
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'th' ? 'en' : 'th');
  }, [language, setLanguage]);

  // {name}-style tokens in a translation string get replaced from params -- e.g.
  // t('login.verifyDescription', { email: 'a@b.com' }) turns "...ของ {email}..." into
  // "...ของ a@b.com...". Falls back to the Thai string (and then the bare key) so a
  // not-yet-translated string never renders as a blank instead of readable Thai.
  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    let str = translations[language][key] ?? translations.th[key] ?? key;
    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        str = str.replace(`{${paramKey}}`, String(value));
      }
    }
    return str;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language, setLanguage, toggleLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
