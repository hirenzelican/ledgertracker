'use client';

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
import { EMPTY_FILTER, filterLedger, isFilterActive, type LedgerFilter } from '@/lib/calculations/filters';
import { formatRupees } from '@/lib/calculations/money';
import type { TransactionWithBalance } from '@/types/transaction';

/** History is paged in the browser so a long ledger stays light on a phone. */
const PAGE_SIZE = 25;

export default function TransactionsPage() {
  return (
    <AuthGate>
      <Transactions />
    </AuthGate>
  );
}

function Transactions() {
  const { ledger, status, loadError, refresh } = useLedger();
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER);
  const [period, setPeriod] = useState<PeriodKey>('ALL');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Arriving from a person's row on the dashboard pre-selects them.
  useEffect(() => {
    const personId = new URLSearchParams(window.location.search).get('person');
    if (personId) setFilter((current) => ({ ...current, personId }));
  }, []);
  const [selected, setSelected] = useState<TransactionWithBalance | null>(null);
  const [sheet, setSheet] = useState<SheetMode | null>(null);

  const filtered = useMemo(() => filterLedger(ledger, filter), [ledger, filter]);
  const visible = filtered.slice(0, visibleCount);

  const filteredTotals = useMemo(() => {
    let received = 0;
    let returned = 0;
    for (const entry of filtered) {
      if (entry.transaction.type === 'RECEIVED') received += entry.deltaPaise;
      else returned += -entry.deltaPaise;
    }
    return { received, returned };
  }, [filtered]);

  const handleFilterChange = (next: LedgerFilter) => {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <AppShell
      title="Transactions"
      subtitle={`${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`}
      action={
        <Link href="/statement/" className="text-sm font-medium text-brand">
          Statement
        </Link>
      }
    >
      <div className="space-y-4">
        <TransactionFilters
          filter={filter}
          onChange={handleFilterChange}
          period={period}
          onPeriodChange={setPeriod}
        />

        {isFilterActive(filter) && filtered.length > 0 ? (
          <p className="tnum rounded-xl bg-surface px-4 py-2.5 text-sm text-ink-muted">
            Received <span className="font-semibold text-received">{formatRupees(filteredTotals.received)}</span>
            {' · '}
            Returned <span className="font-semibold text-returned">{formatRupees(filteredTotals.returned)}</span>
          </p>
        ) : null}

        {status === 'loading' ? (
          <div className="card">
            <LoadingPanel label="Loading transactions..." />
          </div>
        ) : null}

        {status === 'error' && loadError ? (
          <div className="card p-5 text-center">
            <p className="text-[15px] text-ink">{loadError}</p>
            <Button variant="secondary" className="mt-4" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : null}

        {status === 'ready' && filtered.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <p className="text-[15px] font-medium text-ink">
              {ledger.length === 0 ? 'No transactions yet.' : 'No transactions match these filters.'}
            </p>
            {ledger.length > 0 ? (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => {
                  setFilter(EMPTY_FILTER);
                  setPeriod('ALL');
                }}
              >
                Clear filters
              </Button>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                Record money someone has left with you from the home screen.
              </p>
            )}
          </div>
        ) : null}

        {visible.length > 0 ? (
          <div className="card overflow-hidden p-0">
            <TransactionList
              entries={visible}
              onSelect={setSelected}
              hidePerson={filter.personId !== null}
            />
          </div>
        ) : null}

        {filtered.length > visible.length ? (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
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
