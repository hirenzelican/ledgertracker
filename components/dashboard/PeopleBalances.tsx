'use client';

import Link from 'next/link';
import { formatRupees } from '@/lib/calculations/money';
import { cn } from '@/lib/cn';
import { formatRelativeDate } from '@/lib/format/date';
import { settleMode, type SettleMode } from '@/components/transactions/TransactionSheet';
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
  /**
   * When given, a row with something outstanding grows a chip that settles it without
   * opening the contact first. Left off, the list is exactly as it was.
   */
  onSettle?: (settle: SettleMode) => void;
}

export function PeopleBalances({ balances, onSelect, onSettle }: PeopleBalancesProps) {
  const { t } = useTranslation();

  return (
    <ul className="divide-y divide-border">
      {balances.map(({ person, balancePaise, count, lastTransactionDate }) => {
        // Same call the contact screen makes, so the chip appears on exactly the rows
        // that have something to settle and carries exactly the figures that screen
        // would have offered.
        const settle = onSettle ? settleMode(person.id, balancePaise) : null;
        return (
        <li key={person.id} className="flex items-center">
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

          {settle ? (
            <button
              type="button"
              onClick={() => onSettle?.(settle)}
              // The visible word is short enough to sit beside a name on a phone; the
              // label a screen reader announces says which person and how much, since
              // "Settle" repeated down a list of forty rows identifies nobody.
              aria-label={t('settle.buttonFor', {
                name: person.name,
                amount: formatRupees(settle.amountPaise),
              })}
              className="mr-3 flex min-h-[44px] shrink-0 items-center rounded-full border border-brand px-3.5 text-sm font-semibold text-brand transition active:scale-[0.97]"
            >
              {t('settle.short')}
            </button>
          ) : null}
        </li>
        );
      })}
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
  // min-w-0 so a long name truncates rather than pushing the settle chip off the row.
  const className =
    'flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken';

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
