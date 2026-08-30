'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { LoadingPanel } from '@/components/ui/Spinner';
import { TransactionList } from '@/components/transactions/TransactionList';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { buildStatement, forPerson } from '@/lib/calculations/balance';
import { buildStatementShareText } from '@/lib/export/share';
import { ShareButton } from '@/components/share/ShareButton';
import { cn } from '@/lib/cn';
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
  const { transactions, status, people } = useLedger();
  const { t } = useTranslation();
  const [personId, setPersonId] = useState<string | null>(null);
  const today = todayIso();
  const [startDate, setStartDate] = useState(() => startOfMonth(today));
  const [endDate, setEndDate] = useState(() => endOfMonth(today));

  const invalidRange = startDate > endDate;

  // A statement mixing several people would add up money that belongs to different
  // pots, so the scope is always explicit: everyone, or one person.
  const scoped = useMemo(
    () => (personId === null ? transactions : forPerson(transactions, personId)),
    [transactions, personId],
  );

  const statement = useMemo(
    () => (invalidRange ? null : buildStatement(scoped, startDate, endDate)),
    [scoped, startDate, endDate, invalidRange],
  );

  const personName = people.find((person) => person.id === personId)?.name ?? null;

  return (
    <AppShell title={t('statement.title')} subtitle={t('statement.subtitle')}>
      <div className="space-y-4">
        {people.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Statement for">
            {[{ id: null, name: t('history.filter.everyone') }, ...people].map((option) => (
              <button
                key={option.id ?? 'all'}
                type="button"
                aria-pressed={personId === option.id}
                onClick={() => setPersonId(option.id)}
                className={cn(
                  'min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-medium transition',
                  personId === option.id
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-border bg-surface text-ink-muted',
                )}
              >
                {option.name}
              </button>
            ))}
          </div>
        ) : null}

        <section className="card p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="statement-start" className="field-label">
                {t('statement.startDate')}
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
                {t('statement.endDate')}
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
              {t('statement.invalidRange')}
            </p>
          ) : null}
        </section>

        {status === 'loading' ? (
          <div className="card">
            <LoadingPanel label={t('history.loading')} />
          </div>
        ) : null}

        {statement ? (
          <>
            <section className="card p-5" aria-label={t('statement.title')}>
              <h2 className="text-base font-semibold text-ink">
                {personName ? t('statement.forPerson', { name: personName }) : t('statement.forEveryone')}
              </h2>
              <p className="mt-0.5 text-sm text-ink-faint">
                {formatDateRange(statement.startDate, statement.endDate, t)}
              </p>

              <dl className="mt-5 space-y-3 text-[15px]">
                <Line term={t('statement.opening')}>
                  <span className="tnum">{formatRupees(statement.openingBalancePaise)}</span>
                </Line>
                <Line term={t('statement.moneyIn')}>
                  <span className="tnum text-received">
                    + {formatRupees(statement.receivedPaise)}
                  </span>
                </Line>
                <Line term={t('statement.moneyOut')}>
                  <span className="tnum text-returned">
                    − {formatRupees(statement.returnedPaise)}
                  </span>
                </Line>
                <div className="flex items-baseline justify-between gap-4 border-t-2 border-border pt-3">
                  <dt className="font-semibold text-ink">{t('statement.closing')}</dt>
                  <dd className="tnum text-xl font-bold text-ink">
                    {formatRupees(statement.closingBalancePaise)}
                  </dd>
                </div>
              </dl>

              <ShareButton
                className="mt-5 w-full"
                buildText={() => buildStatementShareText(statement, personName, t)}
              />
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                {statement.entries.length === 1
                  ? t('statement.entriesOne')
                  : t('statement.entries', { count: statement.entries.length })}
              </h2>
              {statement.entries.length === 0 ? (
                <p className="card px-6 py-8 text-center text-[15px] text-ink-muted">
                  {t('statement.noEntries')}
                </p>
              ) : (
                <div className="card overflow-hidden p-0">
                  <TransactionList
                entries={[...statement.entries].reverse()}
                hidePerson={personId !== null}
              />
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
