'use client';

/**
 * The one form used for recording and editing a transaction. It owns nothing but its
 * own draft state: validation lives in lib/validation, the balance guard lives in the
 * ledger, and saving is delegated to the caller.
 */

import { useMemo, useState } from 'react';
import { AmountField, ChoiceGroup, Field, TextField } from '@/components/ui/Field';
import { TagField } from './TagField';
import { PersonPicker } from './PersonPicker';
import { Button } from '@/components/ui/Button';
import { parseAmountInput, stripTrailingPaise } from '@/lib/calculations/money';
import { describePersonBalance, signedDeltaPaise } from '@/lib/calculations/balance';
import { useLedger } from '@/components/providers/LedgerProvider';
import { todayIso } from '@/lib/format/date';
import {
  MAX_NOTE_LENGTH,
  validateTransactionForm,
  type FieldName,
} from '@/lib/validation/transaction';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import {
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  TYPE_DIRECTION,
  type PaymentMethod,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { amountToPaise } from '@/lib/calculations/money';

export interface TransactionFormProps {
  /** Fixed for a new transaction; editable when editing an existing one. */
  type: TransactionType;
  /** Preselected person, e.g. when recording from a person's own screen. */
  initialPersonId?: string;
  /** Pre-filled amount as the user would type it, e.g. an offered settlement. */
  initialAmount?: string;
  /**
   * Replaces the type's caption at the top of the form. Used when the form was opened
   * for a specific purpose that the type alone does not explain, such as settling up.
   */
  intro?: string;
  /**
   * Fixes the person, showing their name instead of the picker. Settling is derived
   * from one person's balance, so letting the picker move it to someone else would
   * apply their figures to the wrong pot.
   */
  lockedPersonName?: string;
  /** Balance available for the chosen person, in paise, keyed by person id. */
  balanceForPerson: (personId: string) => number;
  allowTypeChange?: boolean;
  initial?: Transaction;
  submitLabel: string;
  onSubmit: (
    input: TransactionInput,
    options?: { force?: boolean },
  ) => Promise<{ ok: boolean; message?: string; overridable?: boolean }>;
  onCancel: () => void;
}

export function TransactionForm({
  type: initialType,
  allowTypeChange = false,
  initial,
  initialPersonId,
  initialAmount,
  intro,
  lockedPersonName,
  submitLabel,
  balanceForPerson,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const online = useOnlineStatus();
  const { people, tagCounts } = useLedger();
  const { t } = useTranslation();
  const [type, setType] = useState<TransactionType>(initial?.type ?? initialType);
  const [personId, setPersonId] = useState(initial?.person_id ?? initialPersonId ?? '');
  const [amount, setAmount] = useState(() =>
    initial ? stripTrailingPaise(initial.amount) : (initialAmount ?? ''),
  );
  const [method, setMethod] = useState<PaymentMethod>(initial?.method ?? 'GOOGLE_PAY');
  const [date, setDate] = useState(initial?.transaction_date ?? todayIso());
  const [note, setNote] = useState(initial?.note ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Set when the save was only a warning, offering the user the last word. */
  const [overridable, setOverridable] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountPaise = parseAmountInput(amount);
  const availableBalancePaise = personId === '' ? 0 : balanceForPerson(personId);

  /**
   * Live preview so the user sees the consequence before committing. The direction comes
   * from the same table the saved balance uses, so the preview cannot disagree with the
   * figure that appears a second later.
   */
  const projectedBalancePaise = useMemo(() => {
    if (amountPaise === null) return availableBalancePaise;
    return availableBalancePaise + signedDeltaPaise(type, amountPaise);
  }, [amountPaise, availableBalancePaise, type]);

  const submit = async (force: boolean) => {
    if (saving) return; // Guard against double submission.

    setFormError(null);
    setOverridable(false);
    const result = validateTransactionForm(
      {
        person_id: personId,
        amount,
        transaction_date: date,
        type,
        method,
        note,
        tags,
      },
      t,
    );

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const outcome = await onSubmit(result.value, { force });
      if (!outcome.ok) {
        setFormError(outcome.message ?? t('form.error.generic'));
        setOverridable(outcome.overridable === true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submit(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="rounded-xl bg-surface-sunken px-4 py-2.5 text-sm text-ink-muted">
        {intro ?? t(`type.${type}.caption`)}
      </p>

      {lockedPersonName === undefined ? (
        <PersonPicker value={personId} onChange={setPersonId} error={errors.person} />
      ) : (
        <div>
          <p className="field-label">{t('form.whose')}</p>
          <p className="rounded-xl border border-border bg-surface-sunken px-4 py-3 text-[15px] font-medium text-ink">
            {lockedPersonName}
          </p>
        </div>
      )}

      <AmountField
        label={t('form.amount')}
        value={amount}
        onChange={setAmount}
        error={errors.amount}
        autoFocus={!initial && initialAmount === undefined}
        hint={
          amountPaise !== null && amountPaise > 0 && personId !== ''
            ? t('form.amountAfter', {
                result: describePersonBalance(
                  people.find((person) => person.id === personId)?.name ?? '',
                  projectedBalancePaise,
                  t,
                ),
              })
            : undefined
        }
      />

      {allowTypeChange ? (
        <ChoiceGroup
          label={t('form.type')}
          value={type}
          choices={TRANSACTION_TYPES.map((option) => ({
            value: option,
            label: t(`type.${option}.action`),
          }))}
          onChange={setType}
          error={errors.type}
        />
      ) : null}

      <ChoiceGroup
        label={TYPE_DIRECTION[type] === 1 ? t('form.source') : t('form.method')}
        value={method}
        choices={PAYMENT_METHODS.map((option) => ({
          value: option,
          label: t(`method.${option}`),
        }))}
        onChange={setMethod}
        error={errors.method}
      />

      <Field label={t('form.date')} error={errors.transaction_date}>
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            type="date"
            value={date}
            max="2100-12-31"
            onChange={(event) => setDate(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={errors.transaction_date ? true : undefined}
            className="field-input"
          />
        )}
      </Field>

      <TextField
        label={t('form.note')}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        placeholder={t('form.notePlaceholder')}
        error={errors.note}
        autoComplete="off"
      />

      <TagField value={tags} onChange={setTags} suggestions={tagCounts} disabled={saving} />

      {formError ? (
        <div role="alert" className="rounded-xl bg-returned-soft px-4 py-3 text-sm text-ink">
          <p className="font-medium">{formError}</p>
          {overridable ? (
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => void submit(true)}
              disabled={saving}
            >
              {t('form.saveAnyway')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* A new entry no longer needs a connection - it is queued and sent later - so the
          warning became a note about what will happen. An edit still needs one: replaying
          a change against a row whose current state you last saw an hour ago is a very
          different problem from replaying an insert. */}
      {!online ? (
        <p className="rounded-xl bg-returned-soft px-4 py-3 text-sm text-ink">
          {initial ? t('form.offlineEdit') : t('form.offlineQueued')}
        </p>
      ) : null}

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          size="lg"
          className="flex-[1.6]"
          loading={saving}
          loadingLabel={t('form.saving')}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

