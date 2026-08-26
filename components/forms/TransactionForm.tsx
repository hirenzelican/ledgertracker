'use client';

/**
 * The one form used for recording and editing a transaction. It owns nothing but its
 * own draft state: validation lives in lib/validation, the balance guard lives in the
 * ledger, and saving is delegated to the caller.
 */

import { useMemo, useState } from 'react';
import { AmountField, ChoiceGroup, Field, TextField } from '@/components/ui/Field';
import { PersonPicker } from './PersonPicker';
import { Button } from '@/components/ui/Button';
import { parseAmountInput } from '@/lib/calculations/money';
import { describePersonBalance } from '@/lib/calculations/balance';
import { useLedger } from '@/components/providers/LedgerProvider';
import { todayIso } from '@/lib/format/date';
import {
  MAX_NOTE_LENGTH,
  validateTransactionForm,
  type FieldName,
} from '@/lib/validation/transaction';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import {
  METHOD_LABELS,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  TYPE_DESCRIPTIONS,
  TYPE_DIRECTION,
  TYPE_LABELS,
  type PaymentMethod,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from '@/types/transaction';
import { amountToPaise } from '@/lib/calculations/money';

const METHOD_CHOICES = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: METHOD_LABELS[method],
}));

const TYPE_CHOICES = TRANSACTION_TYPES.map((type) => ({
  value: type,
  label: TYPE_LABELS[type],
}));

export interface TransactionFormProps {
  /** Fixed for a new transaction; editable when editing an existing one. */
  type: TransactionType;
  /** Preselected person, e.g. when recording from a person's own screen. */
  initialPersonId?: string;
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
  submitLabel,
  balanceForPerson,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const online = useOnlineStatus();
  const { people } = useLedger();
  const [type, setType] = useState<TransactionType>(initial?.type ?? initialType);
  const [personId, setPersonId] = useState(initial?.person_id ?? initialPersonId ?? '');
  const [amount, setAmount] = useState(() =>
    initial ? stripTrailingPaise(initial.amount) : '',
  );
  const [method, setMethod] = useState<PaymentMethod>(initial?.method ?? 'GOOGLE_PAY');
  const [date, setDate] = useState(initial?.transaction_date ?? todayIso());
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Set when the save was only a warning, offering the user the last word. */
  const [overridable, setOverridable] = useState(false);
  const [saving, setSaving] = useState(false);

  const amountPaise = parseAmountInput(amount);
  const availableBalancePaise = personId === '' ? 0 : balanceForPerson(personId);

  /** Live preview so the user sees the consequence before committing. */
  const projectedBalancePaise = useMemo(() => {
    if (amountPaise === null) return availableBalancePaise;
    return type === 'RECEIVED'
      ? availableBalancePaise + amountPaise
      : availableBalancePaise - amountPaise;
  }, [amountPaise, availableBalancePaise, type]);

  const submit = async (force: boolean) => {
    if (saving) return; // Guard against double submission.

    setFormError(null);
    setOverridable(false);
    const result = validateTransactionForm({
      person_id: personId,
      amount,
      transaction_date: date,
      type,
      method,
      note,
    });

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const outcome = await onSubmit(result.value, { force });
      if (!outcome.ok) {
        setFormError(outcome.message ?? 'Something went wrong. Please try again.');
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
        {TYPE_DESCRIPTIONS[type]}
      </p>

      <PersonPicker value={personId} onChange={setPersonId} error={errors.person} />

      <AmountField
        value={amount}
        onChange={setAmount}
        error={errors.amount}
        autoFocus={!initial}
        hint={
          amountPaise !== null && amountPaise > 0 && personId !== ''
            ? `After this: ${describePersonBalance(
                people.find((person) => person.id === personId)?.name ?? 'them',
                projectedBalancePaise,
              )}`
            : undefined
        }
      />

      {allowTypeChange ? (
        <ChoiceGroup
          label="Type"
          value={type}
          choices={TYPE_CHOICES}
          onChange={setType}
          error={errors.type}
        />
      ) : null}

      <ChoiceGroup
        label={TYPE_DIRECTION[type] === 1 ? 'Source' : 'Method'}
        value={method}
        choices={METHOD_CHOICES}
        onChange={setMethod}
        error={errors.method}
      />

      <Field label="Date" error={errors.transaction_date}>
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
        label="Note (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        placeholder="Monthly savings, festival, emergency..."
        error={errors.note}
        autoComplete="off"
      />

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
              Save anyway
            </Button>
          ) : null}
        </div>
      ) : null}

      {!online ? (
        <p className="rounded-xl bg-returned-soft px-4 py-3 text-sm text-ink">
          You are offline. Reconnect before saving so the transaction is stored safely.
        </p>
      ) : null}

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          className="flex-[1.6]"
          loading={saving}
          loadingLabel="Saving..."
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** `10000.00` -> `"10000"`, `1250.50` -> `"1250.50"` for a tidy edit field. */
function stripTrailingPaise(amount: string | number): string {
  const paise = amountToPaise(amount);
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
