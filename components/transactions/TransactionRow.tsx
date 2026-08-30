'use client';

import { cn } from '@/lib/cn';
import { formatRupees } from '@/lib/calculations/money';
import { amountToPaise } from '@/lib/calculations/money';
import { TYPE_DIRECTION, type TransactionWithBalance } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface TransactionRowProps {
  entry: TransactionWithBalance;
  /** Omitted when the surrounding view is already scoped to one person. */
  personName?: string;
  /** When provided the row becomes a button that opens the actions sheet. */
  onSelect?: (entry: TransactionWithBalance) => void;
  showBalance?: boolean;
}

/**
 * One ledger line. Received and returned are distinguished by the arrow glyph, the
 * `+`/`−` sign and the word "Received"/"Returned" as well as by colour, so the
 * direction is readable without relying on colour perception.
 */
export function TransactionRow({
  entry,
  onSelect,
  personName,
  showBalance = true,
}: TransactionRowProps) {
  const { t } = useTranslation();
  const { transaction, balanceAfterPaise } = entry;
  // Colour and arrow follow which way the money went; the label says why.
  const received = TYPE_DIRECTION[transaction.type] === 1;
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
              {balanceAfterPaise < 0
                ? t('history.owedAfter', { amount: formatRupees(-balanceAfterPaise) })
                : t('history.balanceAfter', { amount: formatRupees(balanceAfterPaise) })}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-baseline justify-between gap-3">
          <span className="truncate text-sm text-ink-muted">
            <span className="sr-only">{t(`type.${transaction.type}.action`)} · </span>
            {personName ? (
              <>
                <span className="font-medium text-ink-muted">{personName}</span>
                {' · '}
              </>
            ) : null}
            {t(`type.${transaction.type}.short`)} · {t(`method.${transaction.method}.short`)}
            {transaction.note ? (
              <span className="text-ink-faint"> · {transaction.note}</span>
            ) : null}
          </span>
        </span>
        {/* Tags sit on their own line: they are how a row is found again, so they must
            stay legible rather than being truncated away at the end of the note. */}
        {transaction.tags && transaction.tags.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {transaction.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted"
              >
                {tag}
              </span>
            ))}
          </span>
        ) : null}
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
