'use client';

/**
 * Chooses whose money a transaction belongs to, and creates the person inline when they
 * are not on the list yet. Adding someone must not cost a trip to another screen: the
 * whole point of the app is recording money in a few seconds, and the first transaction
 * for a new person is exactly when you are standing in front of them.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useLedger } from '@/components/providers/LedgerProvider';
import { RELATIONSHIPS, type Person, type Relationship } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

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

  // With one person on the list there is nothing to choose: preselect them so the
  // common case stays a two-tap save.
  useEffect(() => {
    if (value === '' && people.length === 1) onChange(people[0]!.id);
  }, [people, value, onChange]);

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setAddError(t('people.nameRequired'));
      return;
    }
    setSaving(true);
    setAddError(null);
    const result = await addPerson({ name: trimmed, relationship });
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

      {people.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {people.map((person) => (
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
