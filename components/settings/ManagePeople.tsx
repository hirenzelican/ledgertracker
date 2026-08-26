'use client';

/**
 * Renaming and removing the people on the list. Adding happens inside the transaction
 * form, where it is actually needed; this screen is for corrections and tidying up.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextField } from '@/components/ui/Field';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRupees } from '@/lib/calculations/money';
import { cn } from '@/lib/cn';
import { RELATIONSHIPS, type Person, type Relationship } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

export function ManagePeople() {
  const { personBalances, addPerson, editPerson, removePerson } = useLedger();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirmingDelete) return;
    setDeleting(true);
    const result = await removePerson(confirmingDelete.id);
    setDeleting(false);

    if (!result.ok) {
      showToast({ tone: 'error', title: result.message });
      return;
    }
    showToast({ tone: 'success', title: t('people.removed', { name: confirmingDelete.name }) });
    setConfirmingDelete(null);
  };

  return (
    <>
      <div className="space-y-3">
        {personBalances.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {t('people.none')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {personBalances.map(({ person, balancePaise, count }) => (
              <li key={person.id} className="flex items-center gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{person.name}</p>
                  <p className="text-sm text-ink-faint">
                    {t(`relationship.${person.relationship}`)} ·{' '}
                    {formatRupees(Math.abs(balancePaise))} ·{' '}
                    {count === 1
                      ? t('person.transactionCountOne')
                      : t('person.transactionCount', { count })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(person)}
                  className="min-h-[40px] rounded-lg px-3 text-sm font-medium text-brand hover:bg-surface-sunken"
                >
                  {t('entry.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(person)}
                  className="min-h-[40px] rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-surface-sunken"
                >
                  {t('entry.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button variant="secondary" size="lg" className="w-full" onClick={() => setEditing('new')}>
          {t('people.add')}
        </Button>
      </div>

      {editing ? (
        <PersonSheet
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const result =
              editing === 'new' ? await addPerson(input) : await editPerson(editing.id, input);
            if (result.ok) {
              showToast({ tone: 'success', title: t('people.saved', { name: result.person.name }) });
              setEditing(null);
            }
            return result;
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingDelete !== null}
        title={t('people.removeTitle')}
        message={t('people.removeMessage', { name: confirmingDelete?.name ?? '' })}
        confirmLabel={t('entry.delete')}
        destructive
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmingDelete(null)}
      />
    </>
  );
}

function PersonSheet({
  person,
  onClose,
  onSave,
}: {
  person: Person | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    relationship: Relationship;
  }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [name, setName] = useState(person?.name ?? '');
  const [relationship, setRelationship] = useState<Relationship>(person?.relationship ?? 'MOTHER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();

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
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-returned-soft px-4 py-3 text-sm font-medium text-ink">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => void save()} loading={saving} loadingLabel={t('form.saving')}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
