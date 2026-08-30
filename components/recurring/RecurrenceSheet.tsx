'use client';

/**
 * The form for one repeating rule.
 *
 * Deliberately the same shape as the transaction form, because it describes the same
 * thing - who, how much, which way, how paid - plus a schedule. Anything that looked
 * different would suggest a repeating entry is a different kind of record. It is not; it
 * is the same record, arriving on a timetable.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { AmountField, ChoiceGroup, TextField } from '@/components/ui/Field';
import { PersonPicker } from '@/components/forms/PersonPicker';
import { TagField } from '@/components/forms/TagField';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { cn } from '@/lib/cn';
import { parseAmountInput, stripTrailingPaise } from '@/lib/calculations/money';
import { todayIso } from '@/lib/format/date';
import { MAX_NOTE_LENGTH, sanitizeNote } from '@/lib/validation/transaction';
import { normaliseTags } from '@/lib/validation/tags';
import {
  FREQUENCIES,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  type Frequency,
  type PaymentMethod,
  type Recurrence,
  type RecurrenceInput,
  type TransactionType,
} from '@/types/transaction';

interface RecurrenceSheetProps {
  /** Null when creating a new rule. */
  rule: Recurrence | null;
  onClose: () => void;
  onSave: (input: RecurrenceInput) => Promise<{ ok: boolean; message?: string }>;
}

export function RecurrenceSheet({ rule, onClose, onSave }: RecurrenceSheetProps) {
  const { t } = useTranslation();
  const { tagCounts } = useLedger();

  const [personId, setPersonId] = useState(rule?.person_id ?? '');
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'RECEIVED');
  const [amount, setAmount] = useState(rule ? stripTrailingPaise(rule.amount) : '');
  const [method, setMethod] = useState<PaymentMethod>(rule?.method ?? 'BANK_TRANSFER');
  const [note, setNote] = useState(rule?.note ?? '');
  const [tags, setTags] = useState<string[]>(rule?.tags ?? []);
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'MONTHLY');
  const [startDate, setStartDate] = useState(rule?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(rule?.end_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amountPaise = parseAmountInput(amount);
    if (personId === '') {
      setError(t('form.error.person'));
      return;
    }
    if (amountPaise === null || amountPaise <= 0) {
      setError(t('form.error.amount'));
      return;
    }
    if (endDate !== '' && endDate < startDate) {
      setError(t('statement.invalidRange'));
      return;
    }

    setSaving(true);
    setError(null);
    const result = await onSave({
      person_id: personId,
      type,
      amountPaise,
      method,
      note: sanitizeNote(note),
      tags: normaliseTags(tags),
      frequency,
      start_date: startDate,
      end_date: endDate === '' ? null : endDate,
    });
    setSaving(false);
    if (!result.ok) setError(result.message ?? t('form.error.generic'));
  };

  return (
    <Sheet
      open
      title={rule ? t('recurring.editTitle') : t('recurring.addTitle')}
      onClose={onClose}
      dismissible={!saving}
    >
      <div className="space-y-4">
        <PersonPicker value={personId} onChange={setPersonId} disabled={saving} />

        <ChoiceGroup
          label={t('form.kind')}
          value={type}
          onChange={setType}
          choices={TRANSACTION_TYPES.map((option) => ({
            value: option,
            label: t(`type.${option}.short`),
          }))}
        />

        <AmountField
          label={t('form.amount')}
          value={amount}
          onChange={setAmount}
        />

        <ChoiceGroup
          label={t('form.method')}
          value={method}
          onChange={setMethod}
          choices={PAYMENT_METHODS.map((option) => ({
            value: option,
            label: t(`method.${option}`),
          }))}
        />

        <fieldset>
          <legend className="field-label">{t('recurring.frequency')}</legend>
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={frequency === option}
                onClick={() => setFrequency(option)}
                disabled={saving}
                className={cn(
                  'min-h-[40px] rounded-full border px-4 text-sm font-medium transition',
                  frequency === option
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-border bg-surface text-ink-muted',
                )}
              >
                {t(`frequency.${option}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="recurring-start" className="field-label">
              {t('recurring.startDate')}
            </label>
            <input
              id="recurring-start"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              disabled={saving}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="recurring-end" className="field-label">
              {t('recurring.endDate')}
            </label>
            <input
              id="recurring-end"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={saving}
              className="field-input"
            />
          </div>
        </div>

        <TextField
          label={t('form.note')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder={t('form.notePlaceholder')}
          autoComplete="off"
        />

        <TagField value={tags} onChange={setTags} suggestions={tagCounts} disabled={saving} />

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
