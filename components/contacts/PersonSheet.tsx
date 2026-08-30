'use client';

/**
 * The add / edit form for one contact. Used by the floating add button on the contacts
 * list and by the edit action on a contact's own screen, so both routes ask for exactly
 * the same things.
 *
 * Only the name is required. Everything else is offered because a ledger entry is half
 * of what you need when money comes due - the other half is being able to reach the
 * person - but demanding a phone number to record ₹500 would be the wrong trade.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/Field';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { cn } from '@/lib/cn';
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PERSON_NOTE_LENGTH,
  MAX_PHONE_LENGTH,
  validatePersonForm,
  type PersonField,
} from '@/lib/validation/person';
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
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [note, setNote] = useState(person?.note ?? '');
  const [errors, setErrors] = useState<Partial<Record<PersonField, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const validated = validatePersonForm({ name, relationship, phone, email, note }, t);
    if (!validated.ok) {
      setErrors(validated.errors);
      setFailure(null);
      return;
    }

    setErrors({});
    setSaving(true);
    setFailure(null);
    const result = await onSave(validated.value);
    setSaving(false);
    if (!result.ok) setFailure(result.message ?? t('people.saveFailed'));
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
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          autoFocus={!person}
          error={errors.name}
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

        <TextField
          label={t('people.phone')}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder={t('people.phonePlaceholder')}
          maxLength={MAX_PHONE_LENGTH}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          error={errors.phone}
          hint={t('people.optional')}
        />

        <TextField
          label={t('people.email')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('people.emailPlaceholder')}
          maxLength={MAX_EMAIL_LENGTH}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          error={errors.email}
          hint={t('people.optional')}
        />

        <TextField
          label={t('people.note')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('people.notePlaceholder')}
          maxLength={MAX_PERSON_NOTE_LENGTH}
          autoComplete="off"
          error={errors.note}
          hint={t('people.optional')}
        />

        {failure ? (
          <p
            role="alert"
            className="rounded-xl bg-returned-soft px-4 py-3 text-sm font-medium text-ink"
          >
            {failure}
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
