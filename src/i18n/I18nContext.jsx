import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { LANGUAGES, DEFAULT_LANG, isRTL } from './languages';
import { STRINGS } from './strings';

const I18nContext = createContext();
const STORAGE_KEY = 'tallykraft_appLanguage';

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && STRINGS[v] ? v : DEFAULT_LANG;
  } catch { return DEFAULT_LANG; }
};

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(readStored);

  const setLang = useCallback((code) => {
    const next = STRINGS[code] ? code : DEFAULT_LANG;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  // Reflect language + direction on <html> for the whole document.
  useEffect(() => {
    try {
      document.documentElement.lang = lang;
      document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr';
    } catch { /* SSR / no document */ }
  }, [lang]);

  // t(key, fallback?) — resolves the active language, then English, then the
  // provided fallback, then the key itself. Never returns blank.
  const t = useCallback((key, fallback) => {
    const table = STRINGS[lang] || {};
    if (table[key] != null) return table[key];
    if (STRINGS.en[key] != null) return STRINGS.en[key];
    return fallback != null ? fallback : key;
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    setLang,
    t,
    languages: LANGUAGES,
    isRTL: isRTL(lang),
  }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback so components don't crash if used outside the provider.
    return { lang: DEFAULT_LANG, setLang: () => {}, t: (k, f) => (STRINGS.en[k] ?? f ?? k), languages: LANGUAGES, isRTL: false };
  }
  return ctx;
};

// Convenience hook returning just the translator.
export const useT = () => useI18n().t;
