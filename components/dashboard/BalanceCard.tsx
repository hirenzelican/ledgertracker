'use client';

import { formatRupees } from '@/lib/calculations/money';
import { formatRelativeDate } from '@/lib/format/date';
import type { LedgerTotals } from '@/types/transaction';

/**
 * The reason the app exists: how much of my mother's money I am holding right now.
 * Everything else on the screen is deliberately quieter than this number.
 */
export function BalanceCard({ totals }: { totals: LedgerTotals }) {
  return (
    <section className="card overflow-hidden p-5" aria-labelledby="balance-heading">
      <h2 id="balance-heading" className="text-sm font-medium text-ink-muted">
        Current balance
      </h2>
      <p className="tnum mt-1 text-[2.75rem] font-bold leading-tight tracking-tight text-ink">
        {formatRupees(totals.balancePaise)}
      </p>
      <p className="text-sm text-ink-faint">of my mother&rsquo;s money with me</p>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-received-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-ink-muted">Total received</dt>
          <dd className="tnum mt-0.5 text-lg font-semibold text-received">
            {formatRupees(totals.receivedPaise)}
          </dd>
        </div>
        <div className="rounded-xl bg-returned-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-ink-muted">Total returned</dt>
          <dd className="tnum mt-0.5 text-lg font-semibold text-returned">
            {formatRupees(totals.returnedPaise)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 flex items-center justify-between text-sm text-ink-faint">
        <span>
          Transactions: <span className="tnum font-medium text-ink-muted">{totals.count}</span>
        </span>
        <span>
          Last:{' '}
          <span className="font-medium text-ink-muted">
            {totals.lastTransactionDate ? formatRelativeDate(totals.lastTransactionDate) : '—'}
          </span>
        </span>
      </p>
    </section>
  );
}
