'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ImportBackup } from '@/components/settings/ImportBackup';
import { DeleteAccount } from '@/components/settings/DeleteAccount';
import { useAuth } from '@/components/providers/AuthProvider';
import { fetchAllTransactions, useLedger } from '@/components/providers/LedgerProvider';
import { badgeEnabled, badgingSupported, setBadgeEnabled } from '@/components/layout/AppBadge';
import type { Transaction } from '@/types/transaction';
import { useTheme, type ThemePreference } from '@/components/providers/ThemeProvider';
import {
  LOCALES,
  LOCALE_NAMES,
  useTranslation,
} from '@/components/providers/LanguageProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { buildBackup, serializeBackup } from '@/lib/export/backup';
import { transactionsToCsv } from '@/lib/export/csv';
import { downloadTextFile, timestampedFilename } from '@/lib/export/download';
import { todayIso } from '@/lib/format/date';
import { cn } from '@/lib/cn';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

const THEME_OPTIONS: {
  value: ThemePreference;
  labelKey: 'settings.theme.system' | 'settings.theme.light' | 'settings.theme.dark';
}[] = [
  { value: 'system', labelKey: 'settings.theme.system' },
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
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
  const { totals, people } = useLedger();
  const { preference, setPreference } = useTheme();
  const { showToast } = useToast();
  const { t, locale, setLocale } = useTranslation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Read once on mount: both touch APIs that do not exist during the static export.
  const [badgeSupported, setBadgeSupported] = useState(false);
  const [badgeOn, setBadgeOn] = useState(true);
  useEffect(() => {
    setBadgeSupported(badgingSupported());
    setBadgeOn(badgeEnabled());
  }, []);

  /**
   * An export is the one place the whole ledger is genuinely the point, so it is fetched
   * here rather than kept in memory for the rest of the app's life. `exporting` gates
   * both buttons: two concurrent full fetches would be pure waste.
   */
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  const withAllTransactions = async (
    kind: 'csv' | 'json',
    write: (rows: Transaction[]) => void,
  ) => {
    if (exporting !== null) return;
    if (totals.count === 0) {
      showToast({ tone: 'info', title: t('settings.nothingToExport') });
      return;
    }
    setExporting(kind);
    try {
      write(await fetchAllTransactions());
    } catch {
      showToast({ tone: 'error', title: t('settings.exportFailed') });
    } finally {
      setExporting(null);
    }
  };

  const exportCsv = () =>
    withAllTransactions('csv', (rows) => {
      downloadTextFile(
        timestampedFilename('potli-transactions', 'csv', todayIso()),
        transactionsToCsv(rows, people),
        'text/csv',
      );
      showToast({ tone: 'success', title: t('settings.csvDownloaded') });
    });

  const exportJson = () =>
    withAllTransactions('json', (rows) => {
      downloadTextFile(
        timestampedFilename('potli-backup', 'json', todayIso()),
        serializeBackup(buildBackup(rows, people, new Date().toISOString())),
        'application/json',
      );
      showToast({
        tone: 'success',
        title: t('settings.backupDownloaded'),
        description: t('settings.backupCount', { count: rows.length }),
      });
    });

  return (
    <AppShell title={t('settings.title')}>
      <div className="space-y-6">
        <section>
          <SectionHeading>{t('settings.account')}</SectionHeading>
          <Card className="space-y-4">
            <div>
              <p className="text-sm text-ink-faint">{t('settings.signedInAs')}</p>
              <p className="break-all text-[15px] font-medium text-ink">{user?.email ?? t('common.none')}</p>
            </div>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirmSignOut(true)}>
              {t('settings.logout')}
            </Button>

            {/* Last in the section and visually quieter than logging out: it is the one
                action here that cannot be undone by signing back in. */}
            <div className="border-t border-border pt-4">
              <DeleteAccount />
            </div>
          </Card>
        </section>

        <section>
          <SectionHeading>{t('settings.data')}</SectionHeading>
          <Card className="space-y-3">
            <p className="text-sm text-ink-muted">
              {t('settings.dataSummary', { count: totals.count })}
            </p>
            <Button variant="secondary" size="lg" className="w-full" onClick={exportCsv}>
              {t('settings.exportCsv')}
            </Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={exportJson}>
              {t('settings.exportJson')}
            </Button>
            <ImportBackup />
          </Card>
        </section>

        <section>
          <SectionHeading>{t('settings.application')}</SectionHeading>
          <Card className="space-y-5">
            <fieldset>
              <legend className="field-label">{t('settings.language')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {LOCALES.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'flex min-h-[46px] cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition',
                      locale === option
                        ? 'border-brand bg-brand-soft text-ink'
                        : 'border-border bg-surface text-ink-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name="language"
                      value={option}
                      checked={locale === option}
                      onChange={() => setLocale(option)}
                      className="sr-only"
                    />
                    {LOCALE_NAMES[option]}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="field-label">{t('settings.theme')}</legend>
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
                    {t(option.labelKey)}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Only offered where it can work: on iOS and in a browser tab there is no
                icon to badge, and a switch that does nothing is worse than no switch. */}
            {badgeSupported ? (
              <label className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-[15px] text-ink">{t('settings.badge')}</span>
                  <span className="mt-0.5 block text-sm text-ink-faint">
                    {t('settings.badgeHint')}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={badgeOn}
                  onChange={(event) => {
                    setBadgeEnabled(event.target.checked);
                    setBadgeOn(event.target.checked);
                  }}
                  className="mt-1 h-6 w-6 shrink-0 accent-brand"
                />
              </label>
            ) : null}

            <div className="flex items-center justify-between">
              <span className="text-[15px] text-ink">{t('settings.currency')}</span>
              <span className="text-[15px] font-medium text-ink-muted">{t('settings.currencyValue')}</span>
            </div>

            <Link
              href="/contacts/"
              className="flex min-h-[46px] items-center justify-between rounded-xl border border-border px-4 text-[15px] text-ink"
            >
              {t('settings.contactsLink')}
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            </Link>

            <Link
              href="/recurring/"
              className="flex min-h-[46px] items-center justify-between rounded-xl border border-border px-4 text-[15px] text-ink"
            >
              {t('recurring.manage')}
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            </Link>

            <Link
              href="/trends/"
              className="flex min-h-[46px] items-center justify-between rounded-xl border border-border px-4 text-[15px] text-ink"
            >
              {t('trends.open')}
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            </Link>

            <Link
              href="/statement/"
              className="flex min-h-[46px] items-center justify-between rounded-xl border border-border px-4 text-[15px] text-ink"
            >
              {t('history.statement')}
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            </Link>
          </Card>
        </section>

        <section>
          <SectionHeading>{t('settings.about')}</SectionHeading>
          <Card className="space-y-2 text-[15px]">
            <div className="flex justify-between">
              <span className="text-ink-muted">{t('settings.appLabel')}</span>
              <span className="text-ink">{t('app.name')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">{t('settings.version')}</span>
              <span className="tnum text-ink">{APP_VERSION}</span>
            </div>
            <Link
              href="/privacy/"
              className="flex min-h-[44px] items-center justify-between border-t border-border pt-3 text-ink"
            >
              {t('settings.privacy')}
              <span aria-hidden="true" className="text-ink-faint">
                →
              </span>
            </Link>
          </Card>
        </section>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title={t('settings.logoutTitle')}
        message={t('settings.logoutMessage')}
        confirmLabel={t('settings.logout')}
        onConfirm={() => void signOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
    </AppShell>
  );
}
