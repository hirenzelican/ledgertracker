'use client';

import Link from 'next/link';
import { formatRupees } from '@/lib/calculations/money';
import { cn } from '@/lib/cn';
import { formatRelativeDate } from '@/lib/format/date';
import type { PersonBalance } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

/**
 * Who you are holding money for, and how much of it. Ordered by the largest balance,
 * because that is the one most worth remembering.
 */
interface PeopleBalancesProps {
  balances: readonly PersonBalance[];
  /** When given, rows call this instead of navigating - used inside the contacts screen. */
  onSelect?: (personId: string) => void;
}

export function PeopleBalances({ balances, onSelect }: PeopleBalancesProps) {
  const { t } = useTranslation();

  return (
    <ul className="divide-y divide-border">
      {balances.map(({ person, balancePaise, count, lastTransactionDate }) => (
        <li key={person.id}>
          <Row personId={person.id} onSelect={onSelect}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold uppercase text-brand"
            >
              {person.name.slice(0, 2)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-medium text-ink">{person.name}</span>
                <span
                  className={cn(
                    'tnum shrink-0 text-[15px] font-semibold',
                    balancePaise < 0 ? 'text-brand' : 'text-ink',
                  )}
                >
                  {formatRupees(Math.abs(balancePaise))}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-ink-faint">
                {balancePaise < 0
                  ? `${t('person.owes')} · `
                  : balancePaise > 0
                    ? `${t('person.holding')} · `
                    : `${t('person.settled')} · `}
                {t(`relationship.${person.relationship}`).toLowerCase() ===
                person.name.toLowerCase()
                  ? null
                  : `${t(`relationship.${person.relationship}`)} · `}
                {count > 0
                  ? count === 1
                    ? t('person.transactionCountOne')
                    : t('person.transactionCount', { count })
                  : t('person.nothingYet')}
                {lastTransactionDate ? ` · ${formatRelativeDate(lastTransactionDate, t)}` : ''}
              </span>
            </span>
          </Row>
        </li>
      ))}
    </ul>
  );
}

/**
 * A row is a link to the contact's screen, or a button when the surrounding screen
 * already owns the selection.
 */
function Row({
  personId,
  onSelect,
  children,
}: {
  personId: string;
  onSelect?: (personId: string) => void;
  children: React.ReactNode;
}) {
  const className =
    'flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken';

  if (onSelect) {
    return (
      <button type="button" className={className} onClick={() => onSelect(personId)}>
        {children}
      </button>
    );
  }
  return (
    <Link href={`/contacts/?id=${encodeURIComponent(personId)}`} className={className}>
      {children}
    </Link>
  );
}
