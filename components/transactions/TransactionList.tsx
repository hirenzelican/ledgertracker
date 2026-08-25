'use client';

import { Fragment, useMemo } from 'react';
import { useLedger } from '@/components/providers/LedgerProvider';
import { TransactionRow } from './TransactionRow';
import { formatRelativeDate } from '@/lib/format/date';
import type { TransactionWithBalance } from '@/types/transaction';

interface TransactionListProps {
  /** Newest first. */
  entries: readonly TransactionWithBalance[];
  onSelect?: (entry: TransactionWithBalance) => void;
  showBalance?: boolean;
  /** Suppresses the person's name when the whole list is already one person's. */
  hidePerson?: boolean;
}

/** Groups the ledger under date headings so scanning by day is easy on a phone. */
export function TransactionList({
  entries,
  onSelect,
  showBalance = true,
  hidePerson = false,
}: TransactionListProps) {
  const { people } = useLedger();
  const namesById = useMemo(
    () => new Map(people.map((person) => [person.id, person.name])),
    [people],
  );
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
              <TransactionRow
                entry={entry}
                onSelect={onSelect}
                showBalance={showBalance}
                personName={
                  hidePerson ? undefined : namesById.get(entry.transaction.person_id)
                }
              />
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
