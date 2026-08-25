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
  | { kind: 'create'; type: TransactionType }
  | { kind: 'edit'; transaction: Transaction };

interface TransactionSheetProps {
  mode: SheetMode | null;
  onClose: () => void;
}

export function TransactionSheet({ mode, onClose }: TransactionSheetProps) {
  const { addTransaction, editTransaction, balanceIfApplied } = useLedger();
  const { showToast } = useToast();

  if (!mode) return null;

  const isEdit = mode.kind === 'edit';
  const editingId = isEdit ? mode.transaction.id : undefined;
  const type = isEdit ? mode.transaction.type : mode.type;

  // For a new transaction this is the current balance; for an edit it is the balance
  // with the edited transaction taken back out, which is what the guard compares to.
  const availableBalancePaise = balanceIfApplied({ excludeId: editingId });

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

  const handleSubmit = async (input: TransactionInput) => {
    const newBalancePaise = balanceIfApplied({
      excludeId: editingId,
      include: { type: input.type, amountPaise: input.amountPaise },
    });

    const result = isEdit
      ? await editTransaction(mode.transaction.id, input)
      : await addTransaction(input);

    if (!result.ok) return { ok: false, message: result.message };

    showToast({
      tone: 'success',
      title: isEdit
        ? `Transaction updated - ${formatRupees(input.amountPaise)} ${TYPE_LABELS[input.type].toLowerCase()}.`
        : `${formatRupees(input.amountPaise)} ${TYPE_LABELS[input.type].toLowerCase()} successfully.`,
      description: `Mother's balance: ${formatRupees(newBalancePaise)}`,
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
        availableBalancePaise={availableBalancePaise}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Sheet>
  );
}
