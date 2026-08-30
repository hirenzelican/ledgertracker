'use client';

/**
 * Trends: what the ledger has been doing, month by month.
 *
 * Every figure comes from `monthly_totals`, which does the arithmetic over rows the app
 * never downloads - a two-year view costs the same one request as a six-month one. The
 * months with no activity are included on purpose: a gap in a line is information, and
 * dropping the point would draw a straight edge across a quiet season as if it had been
 * busy.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LoadingPanel } from '@/components/ui/Spinner';
import { BalanceChart, FlowChart } from '@/components/trends/BalanceChart';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { fetchMonthlyTotals } from '@/lib/supabase/trends';
import { toMessageKey } from '@/lib/supabase/errors';
import { cn } from '@/lib/cn';
import { formatRupees } from '@/lib/calculations/money';
import type { MonthlyTotal } from '@/types/transaction';

const PERIODS = [6, 12, 24] as const;
type Period = (typeof PERIODS)[number];

export default function TrendsPage() {
  return (
    <AuthGate>
      <Trends />
    </AuthGate>
  );
}

function Trends() {
  const { people, totals, version } = useLedger();
  const { t } = useTranslation();
  const [months, setMonths] = useState<Period>(12);
  const [personId, setPersonId] = useState<string | null>(null);
  const [data, setData] = useState<MonthlyTotal[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setStatus('loading');
    void (async () => {
      try {
        const rows = await fetchMonthlyTotals(personId, months);
        if (!current) return;
        setData(rows);
        setStatus('ready');
      } catch (caught) {
        if (!current) return;
        setError(t(toMessageKey(caught, 'error.load')));
        setStatus('error');
      }
    })();
    return () => {
      current = false;
    };
  }, [months, personId, t, version]);

  const summary = useMemo(() => {
    // Averaged over months that actually had activity: dividing by twelve when only
    // three months were used would report a number no month ever looked like.
    const active = data.filter(
      (point) => point.moneyInPaise > 0 || point.moneyOutPaise > 0,
    );
    if (active.length === 0) return null;

    const totalIn = active.reduce((sum, point) => sum + point.moneyInPaise, 0);
    const totalOut = active.reduce((sum, point) => sum + point.moneyOutPaise, 0);
    const busiest = active.reduce((best, point) =>
      point.moneyInPaise + point.moneyOutPaise > best.moneyInPaise + best.moneyOutPaise
        ? point
        : best,
    );
    const highest = data.reduce((best, point) =>
      point.closingBalancePaise > best.closingBalancePaise ? point : best,
    );

    return {
      averageIn: Math.round(totalIn / active.length),
      averageOut: Math.round(totalOut / active.length),
      busiest,
      highest,
      activeMonths: active.length,
    };
  }, [data]);

  const empty = status === 'ready' && totals.count === 0;

  return (
    <AppShell title={t('trends.title')} subtitle={t('trends.subtitle')}>
      <div className="space-y-4">
        {people.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('form.whose')}>
            {[{ id: null, name: t('trends.everyone') }, ...people].map((option) => (
              <button
                key={option.id ?? 'all'}
                type="button"
                aria-pressed={personId === option.id}
                onClick={() => setPersonId(option.id)}
                className={cn(
                  'min-h-[36px] shrink-0 rounded-full border px-4 text-sm font-medium transition',
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

        {/* Filters in one row above the charts, so changing the range never moves them. */}
        <div className="flex gap-2" role="tablist" aria-label={t('trends.subtitle')}>
          {PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={months === option}
              onClick={() => setMonths(option)}
              className={cn(
                'min-h-[36px] flex-1 rounded-xl border text-sm font-medium transition',
                months === option
                  ? 'border-brand bg-brand-soft text-ink'
                  : 'border-border bg-surface text-ink-muted',
              )}
            >
              {t(`trends.period.${option}` as 'trends.period.6')}
            </button>
          ))}
        </div>

        {status === 'loading' ? (
          <Card>
            <LoadingPanel label={t('common.loading')} />
          </Card>
        ) : null}

        {status === 'error' && error ? (
          <Card className="p-5 text-center">
            <p className="text-[15px] text-ink">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={() => setMonths(months)}>
              {t('common.tryAgain')}
            </Button>
          </Card>
        ) : null}

        {empty ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-base font-semibold text-ink">{t('trends.empty')}</p>
            <p className="mx-auto mt-2 max-w-[26rem] text-[15px] leading-relaxed text-ink-muted">
              {t('trends.emptyBody')}
            </p>
          </Card>
        ) : null}

        {status === 'ready' && !empty ? (
          <>
            <section className="card p-4">
              <SectionHeading>{t('trends.balanceOverTime')}</SectionHeading>
              <BalanceChart data={data} />
            </section>

            <section className="card p-4">
              <SectionHeading>{t('trends.monthlyFlow')}</SectionHeading>
              <FlowChart data={data} />
            </section>

            {summary ? (
              <dl className="grid grid-cols-2 gap-3">
                <Stat term={t('trends.averageIn')} value={formatRupees(summary.averageIn)} tone="in" />
                <Stat
                  term={t('trends.averageOut')}
                  value={formatRupees(summary.averageOut)}
                  tone="out"
                />
                <Stat
                  term={t('trends.busiest')}
                  value={formatRupees(
                    summary.busiest.moneyInPaise + summary.busiest.moneyOutPaise,
                  )}
                  detail={t(`month.${Number(summary.busiest.month.slice(5, 7))}` as 'month.1')}
                />
                <Stat
                  term={t('trends.highest')}
                  value={formatRupees(Math.abs(summary.highest.closingBalancePaise))}
                  detail={t(`month.${Number(summary.highest.month.slice(5, 7))}` as 'month.1')}
                />
              </dl>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({
  term,
  value,
  detail,
  tone,
}: {
  term: string;
  value: string;
  detail?: string;
  tone?: 'in' | 'out';
}) {
  return (
    <div className="card p-3.5">
      <dt className="text-xs font-medium text-ink-muted">{term}</dt>
      <dd
        className={cn(
          'tnum mt-0.5 text-lg font-semibold',
          // The figure stays in ink; a tone is used only where the direction is the
          // point, and never as the only thing distinguishing two numbers.
          tone === 'in' ? 'text-chart-in' : tone === 'out' ? 'text-chart-out' : 'text-ink',
        )}
      >
        {value}
      </dd>
      {detail ? <dd className="text-xs text-ink-faint">{detail}</dd> : null}
    </div>
  );
}
