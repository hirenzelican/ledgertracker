'use client';

import { Fragment } from 'react';
import { TransactionRow } from './TransactionRow';
import { formatRelativeDate } from '@/lib/format/date';
import type { TransactionWithBalance } from '@/types/transaction';

interface TransactionListProps {
  /** Newest first. */
  entries: readonly TransactionWithBalance[];
  onSelect?: (entry: TransactionWithBalance) => void;
  showBalance?: boolean;
}

/** Groups the ledger under date headings so scanning by day is easy on a phone. */
export function TransactionList({ entries, onSelect, showBalance = true }: TransactionListProps) {
  let previousDate: string | null = null;

  return (
    <ul className="divide-y divide-border">
      {entries.map((entry) => {
        const date = entry.transaction.transaction_date;
        const isNewDay = date !== previousDate;
        previousDate = date;

        return (
          <Fragment key={entry.transaction.id}>
            {isNewDay ? (
              <li className="bg-surface-sunken px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {formatRelativeDate(date)}
              </li>
            ) : null}
            <li>
              <TransactionRow entry={entry} onSelect={onSelect} showBalance={showBalance} />
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
