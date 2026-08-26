'use client';

/**
 * Language selection and message lookup.
 *
 * The chosen language is remembered per device; on first launch the browser's own
 * preference decides, falling back to English. Everything the user reads goes through
 * `t()`, which fills `{placeholders}` literally - no formatting library, because the app
 * has a few hundred short strings and none of them need one.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DICTIONARIES, LOCALE_NAMES, LOCALES, isLocale, matchLocale, type Locale } from '@/lib/i18n/locales';
import type { MessageKey } from '@/lib/i18n/en';

const STORAGE_KEY = 'potli-locale';

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // English until the browser tells us otherwise, so the server-rendered markup and the
  // first client render agree.
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing can refuse storage; the browser's language still applies.
    }
    setLocaleState(isLocale(stored) ? stored : matchLocale(navigator.languages ?? [navigator.language]));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en-IN' : locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice simply will not persist; not worth interrupting anyone over.
    }
  }, []);

  const t = useCallback<Translate>(
    (key, values) => interpolate(DICTIONARIES[locale][key] ?? DICTIONARIES.en[key], values),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used inside LanguageProvider');
  return context;
}

export { LOCALES, LOCALE_NAMES, type Locale };
