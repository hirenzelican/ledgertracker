'use client';

/**
 * Deleting an account, and everything in it.
 *
 * Two things make this humane rather than merely compliant. The backup is offered first,
 * in the same dialog, because someone leaving still deserves their own records — and the
 * moment they decide to go is the last moment they will think to ask for them. And the
 * confirmation asks them to type the word rather than tap a red button, because every
 * other destructive action in this app can be undone by re-entering the data, and this
 * one cannot.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/Field';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { fetchAllTransactions } from '@/components/providers/LedgerProvider';
import { deleteMyAccount } from '@/lib/supabase/account';
import { buildBackup, serializeBackup } from '@/lib/export/backup';
import { downloadTextFile, timestampedFilename } from '@/lib/export/download';
import { todayIso } from '@/lib/format/date';

export function DeleteAccount() {
  const { user } = useAuth();
  const { people, totals } = useLedger();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The word they must type. Translated, so it is a word they actually recognise. */
  const confirmWord = t('account.deleteWord');
  const matches = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  const takeBackup = async () => {
    setSavingBackup(true);
    try {
      const rows = await fetchAllTransactions();
      downloadTextFile(
        timestampedFilename('potli-backup', 'json', todayIso()),
        serializeBackup(buildBackup(rows, people, new Date().toISOString())),
        'application/json',
      );
      showToast({ tone: 'success', title: t('settings.backupDownloaded') });
    } catch {
      showToast({ tone: 'error', title: t('settings.exportFailed') });
    } finally {
      setSavingBackup(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      // Nothing to navigate to: the session is gone, so the app falls back to the login
      // screen on its own. A toast here would be shown to nobody.
      window.location.href = '/';
    } catch {
      setBusy(false);
      setError(t('account.deleteFailed'));
    }
  };

  return (
    <>
      <div>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => setOpen(true)}>
          {t('account.delete')}
        </Button>
        <p className="mt-1.5 text-sm text-ink-faint">{t('account.deleteHint')}</p>
      </div>

      <Sheet
        open={open}
        title={t('account.deleteTitle')}
        onClose={() => {
          setOpen(false);
          setTyped('');
          setError(null);
        }}
        dismissible={!busy}
      >
        <div className="space-y-4">
          <p className="text-[15px] leading-relaxed text-ink">
            {t('account.deleteBody', {
              // Built from the phrases each language already has, so "1 contacts" cannot
              // happen in any of the seven.
              entries:
                totals.count === 1
                  ? t('history.countOne')
                  : t('history.count', { count: totals.count }),
              people:
                people.length === 1
                  ? t('contacts.subtitleOne')
                  : t('contacts.subtitle', { count: people.length }),
            })}
          </p>
          <p className="text-[15px] font-medium text-ink">{t('account.deleteForever')}</p>

          {/* Offered before the irreversible thing, not after it. */}
          {totals.count > 0 ? (
            <div className="rounded-xl border border-border bg-surface-sunken p-3.5">
              <p className="text-sm text-ink-muted">{t('account.backupFirst')}</p>
              <Button
                variant="secondary"
                className="mt-2.5 w-full"
                onClick={() => void takeBackup()}
                loading={savingBackup}
                loadingLabel={t('common.working')}
                disabled={busy}
              >
                {t('settings.exportJson')}
              </Button>
            </div>
          ) : null}

          <TextField
            label={t('account.typeToConfirm', { word: confirmWord })}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            disabled={busy}
          />

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-returned-soft px-4 py-3 text-sm font-medium text-ink"
            >
              {error}
            </p>
          ) : null}

          <p className="text-xs text-ink-faint">
            {t('account.deleteAlso', { email: user?.email ?? '' })}
          </p>

          <div className="flex gap-3 pt-1">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setOpen(false);
                setTyped('');
                setError(null);
              }}
              disabled={busy}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={() => void confirm()}
              loading={busy}
              loadingLabel={t('common.working')}
              disabled={!matches}
            >
              {t('account.deleteConfirm')}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
