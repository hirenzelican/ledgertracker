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
import { useTranslation } from '@/components/providers/LanguageProvider';
import type { Person } from '@/types/transaction';
import { useToast } from '@/components/providers/ToastProvider';
import { formatRupees, formatSignedRupees, amountToPaise } from '@/lib/calculations/money';
import { describePersonBalance } from '@/lib/calculations/balance';
import type { Translate } from '@/lib/i18n/locales';
import { formatDisplayDate } from '@/lib/format/date';
import type { TransactionWithBalance } from '@/types/transaction';

interface TransactionActionsProps {
  entry: TransactionWithBalance | null;
  onClose: () => void;
  onEdit: (entry: TransactionWithBalance) => void;
}

export function TransactionActions({ entry, onClose, onEdit }: TransactionActionsProps) {
  const { removeTransaction, balanceIfApplied, people } = useLedger();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!entry) return null;

  const { transaction } = entry;
  const amountPaise = amountToPaise(transaction.amount);


  const handleDelete = async () => {
    setDeleting(true);
    const balanceAfterDelete = balanceIfApplied(transaction.person_id, {
      exclude: { type: transaction.type, amountPaise },
    });
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
      title: t('entry.deleted', { amount: formatRupees(amountPaise) }),
      description: describePersonBalance(
        people.find((person) => person.id === transaction.person_id)?.name ?? '',
        balanceAfterDelete,
        t,
      ),
    });
  };

  return (
    <>
      <Sheet open={!confirmingDelete} title={t('entry.title')} onClose={onClose}>
        <dl className="space-y-3 text-[15px]">
          <Detail term={t('entry.person')}>{personLabel(people, transaction.person_id, t)}</Detail>
          <Detail term={t('entry.amount')}>
            <span className="tnum font-semibold">
              {formatSignedRupees(amountPaise, transaction.type)}
            </span>
          </Detail>
          <Detail term={t('entry.what')}>{t(`type.${transaction.type}.action`)}</Detail>
          <Detail term={t('entry.method')}>{t(`method.${transaction.method}`)}</Detail>
          <Detail term={t('entry.date')}>{formatDisplayDate(transaction.transaction_date, t)}</Detail>
          <Detail term={t('entry.balanceAfter')}>
            <span className="tnum">{formatRupees(entry.balanceAfterPaise)}</span>
          </Detail>
          {transaction.note ? <Detail term={t('entry.note')}>{transaction.note}</Detail> : null}
        </dl>

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => setConfirmingDelete(true)}
          >
            {t('entry.delete')}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => onEdit(entry)}>
            {t('entry.edit')}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmingDelete}
        title={t('entry.deleteTitle')}
        message={t('entry.deleteMessage', { amount: formatRupees(amountPaise) })}
        confirmLabel={t('entry.delete')}
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

/** Name plus relationship, or a plain fallback if the person has since been removed. */
function personLabel(people: readonly Person[], personId: string, t: Translate): string {
  const person = people.find((candidate) => candidate.id === personId);
  if (!person) return t('entry.unknownPerson');
  return `${person.name} (${t(`relationship.${person.relationship}`)})`;
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <dt className="text-ink-faint">{term}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
