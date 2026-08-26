import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { en, type MessageKey } from '@/lib/i18n/en';
import { DICTIONARIES, LOCALES, LOCALE_NAMES, matchLocale } from '@/lib/i18n/locales';

const KEYS = Object.keys(en) as MessageKey[];

/** `{name}` style placeholders, which must survive translation unchanged. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

test('every language covers every message', () => {
  for (const locale of LOCALES) {
    const dictionary = DICTIONARIES[locale];
    const missing = KEYS.filter((key) => !dictionary[key] || dictionary[key].trim() === '');
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(', ')}`);

    const extra = Object.keys(dictionary).filter((key) => !(key in en));
    assert.deepEqual(extra, [], `${locale} has keys English does not: ${extra.join(', ')}`);
  }
});

test('placeholders match English in every language', () => {
  for (const locale of LOCALES) {
    for (const key of KEYS) {
      assert.deepEqual(
        placeholders(DICTIONARIES[locale][key]),
        placeholders(en[key]),
        `${locale} · ${key} has different placeholders`,
      );
    }
  }
});

test('translations are actually translated, not copied English', () => {
  // A handful of terms are the same everywhere (UPI, CSV, JSON), so this checks the bulk
  // rather than demanding every single string differ.
  for (const locale of LOCALES.filter((candidate) => candidate !== 'en')) {
    const identical = KEYS.filter((key) => DICTIONARIES[locale][key] === en[key]);
    assert.ok(
      identical.length < KEYS.length * 0.1,
      `${locale} still matches English for ${identical.length} of ${KEYS.length} keys`,
    );
  }
});

test('every language names itself', () => {
  for (const locale of LOCALES) {
    assert.ok(LOCALE_NAMES[locale].length > 0, `${locale} has no display name`);
  }
});

test('browser languages map onto a supported one', () => {
  assert.equal(matchLocale(['hi-IN', 'en-US']), 'hi');
  assert.equal(matchLocale(['gu']), 'gu');
  assert.equal(matchLocale(['bn-BD']), 'bn');
  assert.equal(matchLocale(['mr-IN']), 'mr');
  // Unsupported languages fall back to English rather than to a regional cousin.
  assert.equal(matchLocale(['ta-IN']), 'en');
  assert.equal(matchLocale([]), 'en');
});
