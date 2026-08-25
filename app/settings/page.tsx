'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ImportBackup } from '@/components/settings/ImportBackup';
import { ManagePeople } from '@/components/settings/ManagePeople';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTheme, type ThemePreference } from '@/components/providers/ThemeProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { buildBackup, serializeBackup } from '@/lib/export/backup';
import { transactionsToCsv } from '@/lib/export/csv';
import { downloadTextFile, timestampedFilename } from '@/lib/export/download';
import { todayIso } from '@/lib/format/date';
import { cn } from '@/lib/cn';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsPage() {
  return (
    <AuthGate>
      <Settings />
    </AuthGate>
  );
}

function Settings() {
  const { user, signOut } = useAuth();
  const { transactions, totals, people } = useLedger();
  const { preference, setPreference } = useTheme();
  const { showToast } = useToast();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const exportCsv = () => {
    if (transactions.length === 0) {
      showToast({ tone: 'info', title: 'There are no transactions to export yet.' });
      return;
    }
    const today = todayIso();
    downloadTextFile(
      timestampedFilename('potli-transactions', 'csv', today),
      transactionsToCsv(transactions, people),
      'text/csv',
    );
    showToast({ tone: 'success', title: 'CSV file downloaded.' });
  };

  const exportJson = () => {
    if (transactions.length === 0) {
      showToast({ tone: 'info', title: 'There are no transactions to back up yet.' });
      return;
    }
    const today = todayIso();
    downloadTextFile(
      timestampedFilename('potli-backup', 'json', today),
      serializeBackup(buildBackup(transactions, people, new Date().toISOString())),
      'application/json',
    );
    showToast({
      tone: 'success',
      title: 'Backup downloaded.',
      description: `${transactions.length} ${transactions.length === 1 ? 'transaction' : 'transactions'} saved.`,
    });
  };

  return (
    <AppShell title="Settings">
      <div className="space-y-6">
        <section>
          <SectionHeading>Account</SectionHeading>
          <Card className="space-y-4">
            <div>
              <p className="text-sm text-ink-faint">Signed in as</p>
              <p className="break-all text-[15px] font-medium text-ink">{user?.email ?? '—'}</p>
            </div>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirmSignOut(true)}>
              Log out
            </Button>
          </Card>
        </section>

        <section>
          <SectionHeading>People</SectionHeading>
          <Card>
            <ManagePeople />
          </Card>
        </section>

        <section>
          <SectionHeading>Data</SectionHeading>
          <Card className="space-y-3">
            <p className="text-sm text-ink-muted">
              {totals.count} {totals.count === 1 ? 'transaction' : 'transactions'} stored in
              Supabase. Keep a backup somewhere safe.
            </p>
            <Button variant="secondary" size="lg" className="w-full" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={exportJson}>
              Export JSON backup
            </Button>
            <ImportBackup />
          </Card>
        </section>

        <section>
          <SectionHeading>Application</SectionHeading>
          <Card className="space-y-5">
            <fieldset>
              <legend className="field-label">Theme</legend>
              <div className="grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex min-h-[46px] cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition',
                      preference === option.value
                        ? 'border-brand bg-brand-soft text-ink'
                        : 'border-border bg-surface text-ink-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={option.value}
                      checked={preference === option.value}
                      onChange={() => setPreference(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center justify-between">
              <span className="text-[15px] text-ink">Currency</span>
              <span className="text-[15px] font-medium text-ink-muted">Indian Rupee (₹)</span>
            </div>

            <Link
              href="/statement/"
              className="flex min-h-[46px] items-center justify-between rounded-xl border border-border px-4 text-[15px] text-ink"
            >
              Statement
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            </Link>
          </Card>
        </section>

        <section>
          <SectionHeading>About</SectionHeading>
          <Card className="space-y-2 text-[15px]">
            <div className="flex justify-between">
              <span className="text-ink-muted">Application</span>
              <span className="text-ink">Potli</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Version</span>
              <span className="tnum text-ink">{APP_VERSION}</span>
            </div>
          </Card>
        </section>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title="Log out"
        message="You will need to sign in again to see your balance. Your transactions stay safely in Supabase."
        confirmLabel="Log out"
        onConfirm={() => void signOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
    </AppShell>
  );
}
