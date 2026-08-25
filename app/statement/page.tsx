'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { LoadingPanel } from '@/components/ui/Spinner';
import { TransactionList } from '@/components/transactions/TransactionList';
import { useLedger } from '@/components/providers/LedgerProvider';
import { buildStatement } from '@/lib/calculations/balance';
import { formatRupees } from '@/lib/calculations/money';
import { endOfMonth, formatDateRange, startOfMonth, todayIso } from '@/lib/format/date';

export default function StatementPage() {
  return (
    <AuthGate>
      <Statement />
    </AuthGate>
  );
}

function Statement() {
  const { transactions, status } = useLedger();
  const today = todayIso();
  const [startDate, setStartDate] = useState(() => startOfMonth(today));
  const [endDate, setEndDate] = useState(() => endOfMonth(today));

  const invalidRange = startDate > endDate;

  const statement = useMemo(
    () => (invalidRange ? null : buildStatement(transactions, startDate, endDate)),
    [transactions, startDate, endDate, invalidRange],
  );

  return (
    <AppShell title="Statement" subtitle="Money in and out over a period">
      <div className="space-y-4">
        <section className="card p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="statement-start" className="field-label">
                Start date
              </label>
              <input
                id="statement-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label htmlFor="statement-end" className="field-label">
                End date
              </label>
              <input
                id="statement-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="field-input"
              />
            </div>
          </div>
          {invalidRange ? (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              The start date must be on or before the end date.
            </p>
          ) : null}
        </section>

        {status === 'loading' ? (
          <div className="card">
            <LoadingPanel label="Loading transactions..." />
          </div>
        ) : null}

        {statement ? (
          <>
            <section className="card p-5" aria-label="Statement summary">
              <h2 className="text-base font-semibold text-ink">Mother&rsquo;s Money statement</h2>
              <p className="mt-0.5 text-sm text-ink-faint">
                {formatDateRange(statement.startDate, statement.endDate)}
              </p>

              <dl className="mt-5 space-y-3 text-[15px]">
                <Line term="Opening balance">
                  <span className="tnum">{formatRupees(statement.openingBalancePaise)}</span>
                </Line>
                <Line term="Money received">
                  <span className="tnum text-received">
                    + {formatRupees(statement.receivedPaise)}
                  </span>
                </Line>
                <Line term="Money returned">
                  <span className="tnum text-returned">
                    − {formatRupees(statement.returnedPaise)}
                  </span>
                </Line>
                <div className="flex items-baseline justify-between gap-4 border-t-2 border-border pt-3">
                  <dt className="font-semibold text-ink">Closing balance</dt>
                  <dd className="tnum text-xl font-bold text-ink">
                    {formatRupees(statement.closingBalancePaise)}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                {statement.entries.length}{' '}
                {statement.entries.length === 1 ? 'transaction' : 'transactions'} in this period
              </h2>
              {statement.entries.length === 0 ? (
                <p className="card px-6 py-8 text-center text-[15px] text-ink-muted">
                  No transactions in this period.
                </p>
              ) : (
                <div className="card overflow-hidden p-0">
                  <TransactionList entries={[...statement.entries].reverse()} />
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Line({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}
