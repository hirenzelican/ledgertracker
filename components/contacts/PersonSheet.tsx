'use client';

/**
 * The add / edit form for one contact. Used by the floating add button on the contacts
 * list and by the edit action on a contact's own screen, so both routes ask for exactly
 * the same things.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/Field';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { cn } from '@/lib/cn';
import { RELATIONSHIPS, type Person, type PersonInput } from '@/types/transaction';
import type { Relationship } from '@/types/transaction';

interface PersonSheetProps {
  /** Null when adding someone new. */
  person: Person | null;
  onClose: () => void;
  onSave: (input: PersonInput) => Promise<{ ok: boolean; message?: string }>;
}

export function PersonSheet({ person, onClose, onSave }: PersonSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(person?.name ?? '');
  const [relationship, setRelationship] = useState<Relationship>(person?.relationship ?? 'MOTHER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('people.nameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await onSave({ name: trimmed, relationship });
    setSaving(false);
    if (!result.ok) setError(result.message ?? t('people.saveFailed'));
  };

  return (
    <Sheet
      open
      title={person ? t('people.editTitle') : t('people.addTitle')}
      onClose={onClose}
      dismissible={!saving}
    >
      <div className="space-y-4">
        <TextField
          label={t('people.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('people.namePlaceholder')}
          maxLength={60}
          autoComplete="off"
          autoFocus={!person}
        />

        <fieldset>
          <legend className="field-label">{t('people.relationship')}</legend>
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={relationship === option}
                onClick={() => setRelationship(option)}
                className={cn(
                  'min-h-[40px] rounded-full border px-4 text-sm font-medium transition',
                  relationship === option
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-border bg-surface text-ink-muted',
                )}
              >
                {t(`relationship.${option}`)}
              </button>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-returned-soft px-4 py-3 text-sm font-medium text-ink"
          >
            {error}
          </p>
        ) : null}

        <div className="flex gap-3 pt-1">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => void save()}
            loading={saving}
            loadingLabel={t('form.saving')}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
