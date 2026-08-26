'use client';

import { formatRupees } from '@/lib/calculations/money';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { formatRelativeDate } from '@/lib/format/date';
import type { Standing } from '@/lib/calculations/balance';
import type { LedgerTotals } from '@/types/transaction';

/**
 * The reason the app exists: how much of other people's money is in my hands, and how
 * much of mine is in theirs. The two are shown separately rather than netted off - they
 * are different obligations, and a single figure would blur them.
 */
export function BalanceCard({ totals, standing }: { totals: LedgerTotals; standing: Standing }) {
  const { t } = useTranslation();
  const owed = standing.owedToYouPaise > 0;

  return (
    <section className="card overflow-hidden p-5" aria-labelledby="balance-heading">
      <h2 id="balance-heading" className="text-sm font-medium text-ink-muted">
        {t('dashboard.holdingLabel')}
      </h2>
      <p className="tnum mt-1 text-[2.75rem] font-bold leading-tight tracking-tight text-ink">
        {formatRupees(standing.holdingPaise)}
      </p>
      <p className="text-sm text-ink-faint">{t('dashboard.holdingCaption')}</p>

      {owed ? (
        <p className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-brand-soft px-3 py-2.5">
          <span className="text-sm font-medium text-ink-muted">{t('dashboard.owedToYou')}</span>
          <span className="tnum text-lg font-semibold text-brand">
            {formatRupees(standing.owedToYouPaise)}
          </span>
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-received-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-ink-muted">{t('dashboard.moneyIn')}</dt>
          <dd className="tnum mt-0.5 text-lg font-semibold text-received">
            {formatRupees(totals.moneyInPaise)}
          </dd>
        </div>
        <div className="rounded-xl bg-returned-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-ink-muted">{t('dashboard.moneyOut')}</dt>
          <dd className="tnum mt-0.5 text-lg font-semibold text-returned">
            {formatRupees(totals.moneyOutPaise)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 flex items-center justify-between text-sm text-ink-faint">
        <span>
          {t('dashboard.transactionCount')}:{' '}
          <span className="tnum font-medium text-ink-muted">{totals.count}</span>
        </span>
        <span>
          {t('dashboard.lastTransaction')}:{' '}
          <span className="font-medium text-ink-muted">
            {totals.lastTransactionDate
              ? formatRelativeDate(totals.lastTransactionDate, t)
              : t('common.none')}
          </span>
        </span>
      </p>
    </section>
  );
}
