/**
 * Tag normalisation.
 *
 * Tags are only useful if "Rent", "rent" and " rent " are the same tag, so every tag is
 * lower-cased and trimmed on the way in. That is a deliberate loss: a tag is a filing
 * label, not prose, and two labels that differ only by capitalisation would split a
 * filter's results in half without ever looking wrong on screen.
 */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

/**
 * Only a comma or a semicolon separates tags, never a space - "school fees" is one label,
 * not two, and splitting on spaces would quietly turn it into two useless ones.
 */
const SEPARATORS = /[,;]+/;

/**
 * Anything that is not a letter, digit, space or dash - including the control characters
 * a paste can carry.
 *
 * `\p{M}` is not optional here. Indic vowel signs are combining *marks*, not letters, so
 * a class of `\p{L}\p{N}` alone strips them: किराया becomes "क र य". That is silent - the
 * tag saves, and only a reader of that script can see it has been destroyed. The
 * zero-width joiners are here for the same reason, since Devanagari conjuncts need them.
 */
const DISALLOWED = /[^\p{L}\p{M}\p{N}\u200C\u200D -]/gu;

/**
 * Cleans one tag. Returns an empty string for anything that cannot be a tag, which the
 * caller drops - a tag of punctuation is a slip, not an intention.
 */
export function normaliseTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(DISALLOWED, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/**
 * Cleans a whole set: normalised, blanks dropped, duplicates removed, capped. Order is
 * preserved so the chips stay where the user put them.
 */
export function normaliseTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of raw) {
    const tag = normaliseTag(value);
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/** Splits typed input - "rent, medical school" - into separate tags. */
export function parseTagInput(input: string): string[] {
  return normaliseTags(input.split(SEPARATORS));
}
