'use client';

/**
 * Tag entry: chips you can remove, a box you type into, and the tags you have used before.
 *
 * The suggestions are the point. A tag only earns its keep if the same word comes back -
 * "rent" and "Rent" and "rental" split one filter into three - so the tags already in use
 * are offered before the keyboard is, and tapping one is always easier than typing it.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { MAX_TAGS, normaliseTag, parseTagInput } from '@/lib/validation/tags';
import type { TagCount } from '@/types/transaction';

interface TagFieldProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags the user has used before, most-used first. */
  suggestions?: readonly TagCount[];
  disabled?: boolean;
}

/** How many previously-used tags to offer. More than this is a wall, not a shortcut. */
const SUGGESTION_LIMIT = 8;

export function TagField({ value, onChange, suggestions = [], disabled }: TagFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const full = value.length >= MAX_TAGS;

  const offered = useMemo(() => {
    const chosen = new Set(value);
    const needle = normaliseTag(draft);
    return suggestions
      .filter((entry) => !chosen.has(entry.tag))
      .filter((entry) => needle === '' || entry.tag.includes(needle))
      .slice(0, SUGGESTION_LIMIT);
  }, [draft, suggestions, value]);

  const commit = (raw: string) => {
    const added = parseTagInput(raw);
    if (added.length === 0) return;
    const merged = [...value];
    for (const tag of added) {
      if (!merged.includes(tag) && merged.length < MAX_TAGS) merged.push(tag);
    }
    onChange(merged);
    setDraft('');
  };

  return (
    <fieldset>
      <legend className="field-label">{t('tags.label')}</legend>

      {value.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="flex min-h-[34px] items-center gap-1.5 rounded-full bg-brand-soft pl-3 pr-1.5 text-sm font-medium text-ink"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((entry) => entry !== tag))}
                disabled={disabled}
                aria-label={t('tags.remove', { tag })}
                className="flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {!full ? (
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            // A typed comma or semicolon commits, so a list can be typed straight through.
            if (/[,;]/.test(event.target.value)) commit(event.target.value);
            else setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Committing a tag must not submit the form the field sits in.
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={t('tags.placeholder')}
          aria-label={t('tags.label')}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="none"
          disabled={disabled}
          className="field-input"
        />
      ) : null}

      {offered.length > 0 && !full ? (
        <div className="mt-2">
          <p className="mb-1.5 text-xs text-ink-faint">{t('tags.suggestions')}</p>
          <div className="flex flex-wrap gap-2">
            {offered.map((entry) => (
              <button
                key={entry.tag}
                type="button"
                onClick={() => commit(entry.tag)}
                disabled={disabled}
                className={cn(
                  'min-h-[32px] rounded-full border border-border bg-surface px-3 text-sm',
                  'text-ink-muted transition hover:bg-surface-sunken',
                )}
              >
                {entry.tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-1.5 text-xs text-ink-faint">{t('tags.hint')}</p>
    </fieldset>
  );
}
