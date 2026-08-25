'use client';

import Link from 'next/link';
import { formatRupees } from '@/lib/calculations/money';
import { formatRelativeDate } from '@/lib/format/date';
import { RELATIONSHIP_LABELS, type PersonBalance } from '@/types/transaction';

/**
 * Who you are holding money for, and how much of it. Ordered by the largest balance,
 * because that is the one most worth remembering.
 */
export function PeopleBalances({ balances }: { balances: readonly PersonBalance[] }) {
  return (
    <ul className="divide-y divide-border">
      {balances.map(({ person, balancePaise, count, lastTransactionDate }) => (
        <li key={person.id}>
          <Link
            href={`/transactions/?person=${encodeURIComponent(person.id)}`}
            className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-sunken"
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold uppercase text-brand"
            >
              {person.name.slice(0, 2)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-medium text-ink">{person.name}</span>
                <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                  {formatRupees(balancePaise)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-ink-faint">
                {RELATIONSHIP_LABELS[person.relationship].toLowerCase() ===
                person.name.toLowerCase()
                  ? null
                  : `${RELATIONSHIP_LABELS[person.relationship]} · `}
                {count > 0
                  ? `${count} ${count === 1 ? 'transaction' : 'transactions'}`
                  : 'nothing recorded yet'}
                {lastTransactionDate ? ` · ${formatRelativeDate(lastTransactionDate)}` : ''}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
