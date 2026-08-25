'use client';

/**
 * Actions for a single transaction: view the details, edit it, or delete it after an
 * explicit confirmation that names the amount and direction.
 */

import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRupees, rupeeStringToPaise } from '@/lib/calculations/money';
import { formatDisplayDate } from '@/lib/format/date';
import { METHOD_LABELS, TYPE_LABELS, type TransactionWithBalance } from '@/types/transaction';

interface TransactionActionsProps {
  entry: TransactionWithBalance | null;
  onClose: () => void;
  onEdit: (entry: TransactionWithBalance) => void;
}

export function TransactionActions({ entry, onClose, onEdit }: TransactionActionsProps) {
  const { removeTransaction, balanceIfApplied } = useLedger();
  const { showToast } = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!entry) return null;

  const { transaction } = entry;
  const amountPaise = rupeeStringToPaise(transaction.amount);
  const typeLabel = TYPE_LABELS[transaction.type].toLowerCase();

  const handleDelete = async () => {
    setDeleting(true);
    const balanceAfterDelete = balanceIfApplied({ excludeId: transaction.id });
    const result = await removeTransaction(transaction.id);
    setDeleting(false);

    if (!result.ok) {
      showToast({ tone: 'error', title: result.message });
      return;
    }

    setConfirmingDelete(false);
    onClose();
    showToast({
      tone: 'success',
      title: `${formatRupees(amountPaise)} ${typeLabel} transaction deleted.`,
      description: `Mother's balance: ${formatRupees(balanceAfterDelete)}`,
    });
  };

  return (
    <>
      <Sheet open={!confirmingDelete} title="Transaction" onClose={onClose}>
        <dl className="space-y-3 text-[15px]">
          <Detail term="Amount">
            <span className="tnum font-semibold">
              {transaction.type === 'RECEIVED' ? '+' : '−'} {formatRupees(amountPaise)}
            </span>
          </Detail>
          <Detail term="Type">{TYPE_LABELS[transaction.type]}</Detail>
          <Detail term="Method">{METHOD_LABELS[transaction.method]}</Detail>
          <Detail term="Date">{formatDisplayDate(transaction.transaction_date)}</Detail>
          <Detail term="Balance after">
            <span className="tnum">{formatRupees(entry.balanceAfterPaise)}</span>
          </Detail>
          {transaction.note ? <Detail term="Note">{transaction.note}</Detail> : null}
        </dl>

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
          <Button size="lg" className="flex-1" onClick={() => onEdit(entry)}>
            Edit
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete transaction"
        message={`Delete this ${formatRupees(amountPaise)} ${typeLabel} transaction? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <dt className="text-ink-faint">{term}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
