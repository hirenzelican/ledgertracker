'use client';

/**
 * Connects the transaction form to the ledger: saves, reports the new balance and
 * closes. Used by both the dashboard quick actions and the history screen's edit flow.
 */

import { Sheet } from '@/components/ui/Sheet';
import { TransactionForm } from '@/components/forms/TransactionForm';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRupees } from '@/lib/calculations/money';
import { TYPE_LABELS, type Transaction, type TransactionInput, type TransactionType } from '@/types/transaction';

export type SheetMode =
  | { kind: 'create'; type: TransactionType; personId?: string }
  | { kind: 'edit'; transaction: Transaction };

interface TransactionSheetProps {
  mode: SheetMode | null;
  onClose: () => void;
}

export type { SheetMode as TransactionSheetMode };

/** "Ravi" -> "Ravi's"; falls back to "Their" when the person is somehow unknown. */
function possessive(name: string | undefined): string {
  return name ? `${name}'s` : 'Their';
}

export function TransactionSheet({ mode, onClose }: TransactionSheetProps) {
  const { addTransaction, editTransaction, balanceIfApplied, people } = useLedger();
  const { showToast } = useToast();

  if (!mode) return null;

  const isEdit = mode.kind === 'edit';
  const editingId = isEdit ? mode.transaction.id : undefined;
  const type = isEdit ? mode.transaction.type : mode.type;

  // For a new transaction this is that person's current balance; for an edit it is their
  // balance with the edited transaction taken back out, which is what the guard uses.
  const balanceForPerson = (personId: string) =>
    balanceIfApplied(personId, { excludeId: editingId });

  const title = isEdit
    ? 'Edit transaction'
    : type === 'RECEIVED'
      ? 'Money received'
      : 'Money returned';

  const submitLabel = isEdit
    ? 'SAVE CHANGES'
    : type === 'RECEIVED'
      ? 'SAVE RECEIVED'
      : 'SAVE RETURNED';

  const handleSubmit = async (input: TransactionInput, options?: { force?: boolean }) => {
    const newBalancePaise = balanceIfApplied(input.person_id, {
      excludeId: editingId,
      include: { type: input.type, amountPaise: input.amountPaise },
    });

    const mutationOptions = { allowNegativeHistory: options?.force === true };
    const result = isEdit
      ? await editTransaction(mode.transaction.id, input, mutationOptions)
      : await addTransaction(input, mutationOptions);

    if (!result.ok) {
      return { ok: false, message: result.message, overridable: result.overridable };
    }

    showToast({
      tone: 'success',
      title: isEdit
        ? `Transaction updated - ${formatRupees(input.amountPaise)} ${TYPE_LABELS[input.type].toLowerCase()}.`
        : `${formatRupees(input.amountPaise)} ${TYPE_LABELS[input.type].toLowerCase()} successfully.`,
      description: `${possessive(
        people.find((person) => person.id === input.person_id)?.name,
      )} balance: ${formatRupees(newBalancePaise)}`,
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
