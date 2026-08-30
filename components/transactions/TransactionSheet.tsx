'use client';

/**
 * Connects the transaction form to the ledger: saves, reports the new balance and
 * closes. Used by both the dashboard quick actions and the history screen's edit flow.
 */

import { Sheet } from '@/components/ui/Sheet';
import { TransactionForm } from '@/components/forms/TransactionForm';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { amountToPaise, formatRupees } from '@/lib/calculations/money';
import { describePersonBalance } from '@/lib/calculations/balance';
import type { Transaction, TransactionInput, TransactionType } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

export type SheetMode =
  | { kind: 'create'; type: TransactionType; personId?: string }
  | { kind: 'edit'; transaction: Transaction };

interface TransactionSheetProps {
  mode: SheetMode | null;
  onClose: () => void;
}

export type { SheetMode as TransactionSheetMode };

export function TransactionSheet({ mode, onClose }: TransactionSheetProps) {
  const { addTransaction, editTransaction, balanceIfApplied, people } = useLedger();
  const { showToast } = useToast();
  const { t } = useTranslation();

  if (!mode) return null;

  const isEdit = mode.kind === 'edit';
  const previous = isEdit ? mode.transaction : null;
  const type = isEdit ? mode.transaction.type : mode.type;

  // The row being edited has to come back out of the balance before the new one goes in,
  // and only when it belonged to this person - moving a transaction to someone else
  // leaves the new person's balance untouched by the old row.
  const excludeFor = (personId: string) =>
    previous && previous.person_id === personId
      ? { type: previous.type, amountPaise: amountToPaise(previous.amount) }
      : undefined;

  // For a new transaction this is that person's current balance; for an edit it is their
  // balance with the edited transaction taken back out, which is what the guard uses.
  const balanceForPerson = (personId: string) =>
    balanceIfApplied(personId, { exclude: excludeFor(personId) });

  const title = isEdit ? t('form.editTitle') : t(`type.${type}.action`);

  const submitLabel = isEdit ? t('form.saveChanges') : t('form.save');

  const handleSubmit = async (input: TransactionInput, options?: { force?: boolean }) => {
    const newBalancePaise = balanceIfApplied(input.person_id, {
      exclude: excludeFor(input.person_id),
      include: { type: input.type, amountPaise: input.amountPaise },
    });

    const mutationOptions = { allowUnusual: options?.force === true };
    const result = isEdit
      ? await editTransaction(mode.transaction, input, mutationOptions)
      : await addTransaction(input, mutationOptions);

    if (!result.ok) {
      return { ok: false, message: result.message, overridable: result.overridable };
    }

    showToast({
      tone: 'success',
      title: `${formatRupees(input.amountPaise)} · ${t(`type.${input.type}.short`)}`,
      description: describePersonBalance(
        people.find((person) => person.id === input.person_id)?.name ?? '',
        newBalancePaise,
        t,
      ),
    });
    onClose();
    return { ok: true };
  };

  return (
    <Sheet open title={title} onClose={onClose}>
      <TransactionForm
        key={isEdit ? mode.transaction.id : `new-${type}`}
        type={type}
        allowTypeChange={isEdit}
        initial={isEdit ? mode.transaction : undefined}
        submitLabel={submitLabel}
        balanceForPerson={balanceForPerson}
        initialPersonId={mode.kind === 'create' ? mode.personId : undefined}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Sheet>
  );
}
