'use client';

/**
 * Entries recorded without a connection, still waiting to be sent.
 *
 * They are already counted in every balance on the screen above, so this is not there to
 * correct a figure. It is there to answer the question the figure raises: it moved, but
 * did it *stick*? Without an answer the honest thing for a user to do is write the amount
 * on their hand as well, which is the habit the app exists to replace.
 *
 * It disappears the moment the queue drains. A permanent "all synced" badge would be one
 * more thing on screen that never says anything.
 */

import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { formatRupees } from '@/lib/calculations/money';
import { formatDisplayDate } from '@/lib/format/date';
import { cn } from '@/lib/cn';

interface PendingEntriesProps {
  /** Narrows to one contact's queued entries, for their own screen. */
  personId?: string;
  className?: string;
}

export function PendingEntries({ personId, className }: PendingEntriesProps) {
  const { pending, sending, flushOutbox, people } = useLedger();
  const { t } = useTranslation();
  const online = useOnlineStatus();

  const mine = personId ? pending.filter((entry) => entry.input.person_id === personId) : pending;
  if (mine.length === 0) return null;

  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? '';

  return (
    <section
      className={cn('rounded-2xl border border-border bg-surface-sunken p-4', className)}
      aria-label={t('outbox.title')}
    >
      <div className="flex items-start gap-3">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint" fill="none" aria-hidden="true">
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">
            {mine.length === 1 ? t('outbox.countOne') : t('outbox.count', { count: mine.length })}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {sending ? t('outbox.sending') : online ? t('outbox.willSend') : t('outbox.offline')}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
        {mine.map((entry) => (
          <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-muted">
              {personId ? null : `${nameOf(entry.input.person_id)} · `}
              {t(`type.${entry.input.type}.short`)}
              {' · '}
              {formatDisplayDate(entry.input.transaction_date, t)}
            </span>
            <span className="tnum shrink-0 font-semibold text-ink">
              {formatRupees(entry.input.amountPaise)}
            </span>
          </li>
        ))}
      </ul>

      {online && !sending ? (
        <button
          type="button"
          onClick={() => void flushOutbox()}
          className="mt-3 min-h-[44px] w-full rounded-xl border border-border bg-surface text-[15px] font-medium text-ink"
        >
          {t('outbox.sendNow')}
        </button>
      ) : null}
    </section>
  );
}
