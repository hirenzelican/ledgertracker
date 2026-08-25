'use client';

import { cn } from '@/lib/cn';
import { formatRupees } from '@/lib/calculations/money';
import { amountToPaise } from '@/lib/calculations/money';
import { METHOD_SHORT_LABELS, TYPE_LABELS, type TransactionWithBalance } from '@/types/transaction';

interface TransactionRowProps {
  entry: TransactionWithBalance;
  /** When provided the row becomes a button that opens the actions sheet. */
  onSelect?: (entry: TransactionWithBalance) => void;
  showBalance?: boolean;
}

/**
 * One ledger line. Received and returned are distinguished by the arrow glyph, the
 * `+`/`−` sign and the word "Received"/"Returned" as well as by colour, so the
 * direction is readable without relying on colour perception.
 */
export function TransactionRow({ entry, onSelect, showBalance = true }: TransactionRowProps) {
  const { transaction, balanceAfterPaise } = entry;
  const received = transaction.type === 'RECEIVED';
  const amountPaise = amountToPaise(transaction.amount);

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          received ? 'bg-received-soft text-received' : 'bg-returned-soft text-returned',
        )}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d={received ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'tnum text-[17px] font-semibold',
              received ? 'text-received' : 'text-returned',
            )}
          >
            {received ? '+' : '−'} {formatRupees(amountPaise)}
          </span>
          {showBalance ? (
            <span className="tnum shrink-0 text-sm text-ink-faint">
              Balance {formatRupees(balanceAfterPaise)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-3">
          <span className="truncate text-sm text-ink-muted">
            <span className="sr-only">{TYPE_LABELS[transaction.type]} via </span>
            {METHOD_SHORT_LABELS[transaction.method]}
            {transaction.note ? (
              <span className="text-ink-faint"> · {transaction.note}</span>
            ) : null}
          </span>
        </span>
      </span>
    </>
  );

  if (!onSelect) {
    return <div className="flex items-start gap-3 px-4 py-3">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken active:bg-surface-sunken"
    >
      {content}
      <span className="sr-only">Edit or delete this transaction</span>
    </button>
  );
}
