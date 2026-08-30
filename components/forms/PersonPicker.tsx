'use client';

/**
 * Chooses whose money a transaction belongs to, and creates the person inline when they
 * are not on the list yet. Adding someone must not cost a trip to another screen: the
 * whole point of the app is recording money in a few seconds, and the first transaction
 * for a new person is exactly when you are standing in front of them.
 *
 * Only a handful of chips are rendered at once. A wrapped grid of hundreds of names is
 * both slow and unusable on a phone - past a dozen people, typing two letters beats
 * scrolling past everyone you have ever recorded.
 */

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useLedger } from '@/components/providers/LedgerProvider';
import { RELATIONSHIPS, type Person, type Relationship } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

/** Chips rendered before the list asks you to search instead. */
const CHIP_LIMIT = 12;

/** Below this many people, scanning the chips is faster than typing. */
const SEARCH_THRESHOLD = 8;

interface PersonPickerProps {
  value: string;
  onChange: (personId: string) => void;
  error?: string;
  disabled?: boolean;
}

export function PersonPicker({ value, onChange, error, disabled }: PersonPickerProps) {
  const { people, addPerson } = useLedger();
  const { t } = useTranslation();
  const [adding, setAdding] = useState(people.length === 0);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('MOTHER');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // With one person on the list there is nothing to choose: preselect them so the
  // common case stays a two-tap save.
  useEffect(() => {
    if (value === '' && people.length === 1) onChange(people[0]!.id);
  }, [people, value, onChange]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return people;
    return people.filter((person) => person.name.toLowerCase().includes(needle));
  }, [people, search]);

  // Whoever is already selected stays on screen even when the search excludes them,
  // so the form never looks like it has forgotten the answer you gave it.
  const { visible, hidden } = useMemo(() => {
    const selected = value === '' ? undefined : people.find((person) => person.id === value);
    const pinned = selected && !matches.some((person) => person.id === value);
    const room = pinned ? CHIP_LIMIT - 1 : CHIP_LIMIT;
    const shown = matches.slice(0, room);
    return {
      visible: pinned ? [selected, ...shown] : shown,
      hidden: matches.length - shown.length,
    };
  }, [matches, people, value]);

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setAddError(t('people.nameRequired'));
      return;
    }
    setSaving(true);
    setAddError(null);
    // The picker asks for the minimum: a name is enough to record money against
    // someone, and the rest can be filled in on their contact screen later.
    const result = await addPerson({
      name: trimmed,
      relationship,
      phone: '',
      email: '',
      note: '',
    });
    setSaving(false);

    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    onChange(result.person.id);
    setName('');
    setAdding(false);
  };

  return (
    <fieldset>
      <legend className="field-label">{t('form.whose')}</legend>

      {people.length > SEARCH_THRESHOLD ? (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('contacts.search')}
          aria-label={t('contacts.search')}
          enterKeyHint="search"
          disabled={disabled}
          className="field-input mb-2"
        />
      ) : null}

      {people.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visible.map((person) => (
            <PersonChip
              key={person.id}
              person={person}
              selected={person.id === value}
              disabled={disabled}
              onSelect={() => onChange(person.id)}
            />
          ))}
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            disabled={disabled}
            className="min-h-[44px] rounded-xl border border-dashed border-border px-4 text-sm font-medium text-ink-muted hover:bg-surface-sunken"
          >
            {/* Not "Cancel": the form has its own, and two of them is a coin toss. */}
            {adding ? t('people.close') : t('people.addNew')}
          </button>
        </div>
      ) : null}

      {people.length > 0 && matches.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t('contacts.noMatch')}</p>
      ) : null}

      {hidden > 0 ? (
        <p className="mt-2 text-xs text-ink-faint">{t('people.more', { count: hidden })}</p>
      ) : null}

      {adding ? (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-sunken p-3">
          <TextField
            label={t('people.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('people.namePlaceholder')}
            maxLength={60}
            autoComplete="off"
          />
          <div>
            <span className="field-label">{t('people.relationship')}</span>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIPS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={relationship === option}
                  onClick={() => setRelationship(option)}
                  className={cn(
                    'min-h-[38px] rounded-full border px-3.5 text-sm font-medium transition',
                    relationship === option
                      ? 'border-brand bg-brand-soft text-ink'
                      : 'border-border bg-surface text-ink-muted',
                  )}
                >
                  {t(`relationship.${option}`)}
                </button>
              ))}
            </div>
          </div>
          {addError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {addError}
            </p>
          ) : null}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void create()}
            loading={saving}
            loadingLabel={t('people.adding')}
          >
            {t('people.add')}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function PersonChip({
  person,
  selected,
  disabled,
  onSelect,
}: {
  person: Person;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-[15px] font-medium transition',
        selected
          ? 'border-brand bg-brand-soft text-ink ring-1 ring-brand'
          : 'border-border bg-surface text-ink-muted hover:bg-surface-sunken',
      )}
    >
      {person.name}
      <span className={cn('text-xs', selected ? 'text-ink-muted' : 'text-ink-faint')}>
        {t(`relationship.${person.relationship}`)}
      </span>
    </button>
  );
}
