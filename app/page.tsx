'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { AppBadge } from '@/components/layout/AppBadge';
import { ConnectionCheck } from '@/components/layout/ConnectionCheck';
import { DuePrompt } from '@/components/recurring/DuePrompt';
import { AuthGate } from '@/components/layout/AuthGate';
import { BalanceCard } from '@/components/dashboard/BalanceCard';
import { PeopleBalances } from '@/components/dashboard/PeopleBalances';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { WelcomeCard } from '@/components/dashboard/WelcomeCard';
import { SectionHeading } from '@/components/ui/Card';
import { LoadingPanel } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionSheet, type SheetMode } from '@/components/transactions/TransactionSheet';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useLedgerPage } from '@/components/providers/useLedgerPage';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { EMPTY_QUERY } from '@/types/transaction';
import type { TransactionType } from '@/types/transaction';

const WELCOME_KEY = 'potli-welcome-dismissed';
const RECENT_COUNT = 5;

export default function DashboardPage() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

function Dashboard() {
  const { totals, status, loadError, refresh, personBalances, standing } = useLedger();
  // Five rows, fetched as five rows. The dashboard used to slice them off the front of
  // the whole ledger, which meant downloading all of it to show a handful.
  const recent = useLedgerPage(EMPTY_QUERY, { pageSize: RECENT_COUNT });
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    try {
      setShowWelcome(window.localStorage.getItem(WELCOME_KEY) !== 'true');
    } catch {
      setShowWelcome(false);
    }
  }, []);

  // The installed app's home-screen shortcuts land here with ?action=received|returned.
  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get('action');
    const type = { received: 'RECEIVED', returned: 'RETURNED', lent: 'LENT', repaid: 'REPAID' }[
      action ?? ''
    ] as TransactionType | undefined;
    if (!type) return;
    setSheet({ kind: 'create', type });
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    try {
      window.localStorage.setItem(WELCOME_KEY, 'true');
    } catch {
      // Not persisting the dismissal is harmless.
    }
  }, []);

  const openSheet = useCallback(
    (type: TransactionType) => {
      dismissWelcome();
      setSheet({ kind: 'create', type });
    },
    [dismissWelcome],
  );

  const isEmpty = status === 'ready' && totals.count === 0;

  return (
    <AppShell
      title={t('app.name')}
      action={
        <Link
          href="/settings/"
          aria-label={t('nav.settings')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4.5 12c0-.5.06-1 .17-1.46L3 8.9l2-3.46 2.1.9c.74-.6 1.6-1.05 2.53-1.3L10 3h4l.37 2.04c.93.25 1.79.7 2.53 1.3l2.1-.9 2 3.46-1.67 1.64c.1.47.17.95.17 1.46s-.06 1-.17 1.46L21 15.1l-2 3.46-2.1-.9c-.74.6-1.6 1.05-2.53 1.3L14 21h-4l-.37-2.04a7.4 7.4 0 0 1-2.53-1.3l-2.1.9-2-3.46 1.67-1.64A6.6 6.6 0 0 1 4.5 12Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      }
    >
      <div className="space-y-4">
        {showWelcome && totals.count === 0 && status === 'ready' ? (
          <WelcomeCard onStart={() => openSheet('RECEIVED')} onDismiss={dismissWelcome} />
        ) : null}

        {/* Above the balance on purpose: something is waiting to be recorded, and the
            balance below it is not yet the whole truth until it is. */}
        <DuePrompt />

        <BalanceCard totals={totals} standing={standing} />

        <QuickActions onAction={openSheet} />

        {status === 'loading' ? (
          <div className="card">
            <LoadingPanel label={t('history.loading')} />
          </div>
        ) : null}

        {status === 'error' && loadError ? (
          <div className="card p-5">
            <p className="text-center text-[15px] text-ink">{loadError}</p>
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={() => void refresh()}>
                {t('common.tryAgain')}
              </Button>
            </div>
            {/* Signing in works but nothing loads: the usual cause is a database that has
                not had the migrations run. This is the screen that failure lands on, so
                the check that tells you belongs here rather than only on the login form. */}
            <ConnectionCheck context="loading" />
          </div>
        ) : null}

        {isEmpty ? <EmptyState onAdd={() => openSheet('RECEIVED')} /> : null}

        {personBalances.length > 0 ? (
          <section>
            <SectionHeading>{t('dashboard.peopleHeading')}</SectionHeading>
            <div className="card overflow-hidden p-0">
              <PeopleBalances balances={personBalances} />
            </div>
          </section>
        ) : null}

        {recent.entries.length > 0 ? (
          <section>
            <SectionHeading>{t('dashboard.recentHeading')}</SectionHeading>
            <div className="card overflow-hidden p-0">
              <TransactionList entries={recent.entries} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link
                href="/transactions/"
                className="flex min-h-[48px] items-center justify-center rounded-xl border border-border bg-surface text-[15px] font-medium text-ink"
              >
                {t('dashboard.viewAll')}
              </Link>
              <Link
                href="/trends/"
                className="flex min-h-[48px] items-center justify-center rounded-xl border border-border bg-surface text-[15px] font-medium text-ink"
              >
                {t('trends.open')}
              </Link>
            </div>
          </section>
        ) : null}
      </div>

      <AppBadge />
      <TransactionSheet mode={sheet} onClose={() => setSheet(null)} />
    </AppShell>
  );
}
