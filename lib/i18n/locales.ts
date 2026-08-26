import { en, type Dictionary, type MessageKey } from './en';
import { hi } from './hi';
import { gu } from './gu';
import { bn } from './bn';
import { mr } from './mr';

/**
 * The languages Potli speaks. Adding another is one file that satisfies `Dictionary`
 * plus one line here - TypeScript refuses a dictionary with a missing key, so a new
 * language cannot ship half-translated.
 */
/** Looks up a message and fills its {placeholders}. Passed into pure helpers that
 * produce text, so they never hard-code a language. */
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export const LOCALES = ['en', 'hi', 'gu', 'bn', 'mr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language named in itself, which is how people recognise their own. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  gu: 'ગુજરાતી',
  bn: 'বাংলা',
  mr: 'मराठी',
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, hi, gu, bn, mr };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the closest supported language for a browser tag such as `hi-IN` or `en-GB`.
 * Falls back to English rather than guessing at a regional cousin.
 */
export function matchLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}
