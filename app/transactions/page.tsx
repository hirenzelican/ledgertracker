'use client';

/**
 * History: every transaction, narrowed however the user wants.
 *
 * Both the rows and the "in X, out Y" line come from the database a page at a time, so
 * changing a filter is a query rather than a re-scan of everything in memory. The counts
 * and totals are for the whole filtered set, not the rows on screen - a summary that
 * only added up the first 25 would be worse than no summary.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { LoadingPanel } from '@/components/ui/Spinner';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionActions } from '@/components/transactions/TransactionActions';
import { TransactionSheet, type SheetMode } from '@/components/transactions/TransactionSheet';
import { TransactionFilters, type PeriodKey } from '@/components/transactions/TransactionFilters';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useLedgerPage, DEFAULT_PAGE_SIZE } from '@/components/providers/useLedgerPage';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { EMPTY_FILTER, isFilterActive, type LedgerFilter } from '@/lib/calculations/filters';
import { formatRupees } from '@/lib/calculations/money';
import type { TransactionWithBalance } from '@/types/transaction';

export default function TransactionsPage() {
  return (
    <AuthGate>
      <Transactions />
    </AuthGate>
  );
}

function Transactions() {
  const { totals, status: ledgerStatus, loadError, refresh } = useLedger();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER);
  const [period, setPeriod] = useState<PeriodKey>('ALL');
  const [selected, setSelected] = useState<TransactionWithBalance | null>(null);
  const [sheet, setSheet] = useState<SheetMode | null>(null);

  // Arriving from a person's row on the dashboard pre-selects them.
  useEffect(() => {
    const personId = new URLSearchParams(window.location.search).get('person');
    if (personId) setFilter((current) => ({ ...current, personId }));
  }, []);

  const query = useMemo(() => filter, [filter]);
  const page = useLedgerPage(query, { pageSize: DEFAULT_PAGE_SIZE });

  const filtered = isFilterActive(filter);
  // With no filter the count is already known from the balances, so the subtitle is
  // right before the first page even arrives.
  const count = filtered ? page.summary.count : totals.count;
  const ledgerIsEmpty = totals.count === 0;

  const status = ledgerStatus === 'error' ? 'error' : page.status;
  const error = ledgerStatus === 'error' ? loadError : page.error;

  return (
    <AppShell
      title={t('history.title')}
      subtitle={count === 1 ? t('history.countOne') : t('history.count', { count })}
      action={
        <Link href="/statement/" className="text-sm font-medium text-brand">
          {t('history.statement')}
        </Link>
      }
    >
      <div className="space-y-4">
        <TransactionFilters
          filter={filter}
          onChange={setFilter}
          period={period}
          onPeriodChange={setPeriod}
        />

        {filtered && page.summary.count > 0 ? (
          <p className="tnum rounded-xl bg-surface px-4 py-2.5 text-sm text-ink-muted">
            {t('history.summary', {
              in: formatRupees(page.summary.moneyInPaise),
              out: formatRupees(page.summary.moneyOutPaise),
            })}
          </p>
        ) : null}

        {status === 'loading' ? (
          <div className="card">
            <LoadingPanel label={t('history.loading')} />
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="card p-5 text-center">
            <p className="text-[15px] text-ink">{error}</p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                if (ledgerStatus === 'error') void refresh();
                else page.reload();
              }}
            >
              {t('common.tryAgain')}
            </Button>
          </div>
        ) : null}

        {status === 'ready' && page.entries.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <p className="text-[15px] font-medium text-ink">
              {ledgerIsEmpty ? t('history.empty') : t('history.emptyFiltered')}
            </p>
            {ledgerIsEmpty ? (
              <p className="mt-2 text-sm text-ink-muted">{t('dashboard.empty.body')}</p>
            ) : (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => {
                  setFilter(EMPTY_FILTER);
                  setPeriod('ALL');
                }}
              >
                {t('history.clearFilters')}
              </Button>
            )}
          </div>
        ) : null}

        {page.entries.length > 0 ? (
          <div className="card overflow-hidden p-0">
            <TransactionList
              entries={page.entries}
              onSelect={setSelected}
              hidePerson={filter.personId !== null}
            />
          </div>
        ) : null}

        {page.hasMore ? (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={page.loadMore}
            loading={page.loadingMore}
            loadingLabel={t('history.loading')}
          >
            {t('history.showMore', {
              count: Math.min(DEFAULT_PAGE_SIZE, page.total - page.entries.length),
            })}
          </Button>
        ) : null}
      </div>

      <TransactionActions
        entry={sheet ? null : selected}
        onClose={() => setSelected(null)}
        onEdit={(entry) => setSheet({ kind: 'edit', transaction: entry.transaction })}
      />

      <TransactionSheet
        mode={sheet}
        onClose={() => {
          setSheet(null);
          setSelected(null);
        }}
      />
    </AppShell>
  );
}
