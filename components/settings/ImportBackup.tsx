'use client';

/**
 * Restore from a JSON backup.
 *
 * The file is parsed and fully validated before anything is written, duplicates are
 * reported rather than silently inserted, and the resulting ledger is checked so a
 * restore can never leave the balance negative at any point in history.
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { parseBackup, type ParsedBackup } from '@/lib/validation/backup';
import { formatDisplayDate } from '@/lib/format/date';
import { useTranslation } from '@/components/providers/LanguageProvider';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImportBackup() {
  const { transactions, importTransactions, people } = useLedger();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      showToast({ tone: 'error', title: t('import.tooLarge') });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      showToast({ tone: 'error', title: t('import.unreadable') });
      return;
    }

    const result = parseBackup(text, transactions, people);
    if (!result.ok) {
      showToast({ tone: 'error', title: t('import.invalid'), description: result.message });
      return;
    }
    if (result.value.newTransactions.length === 0) {
      showToast({
        tone: 'info',
        title: t('import.nothing'),
        description:
          result.value.duplicates.length > 0 ? t('import.allDuplicates') : t('import.emptyFile'),
      });
      return;
    }

    setMode('merge');
    setPending(result.value);
  };

  const confirmImport = async () => {
    if (!pending) return;

    setBusy(true);
    const result = await importTransactions(pending.newTransactions, mode);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setPending(null);
    showToast({
      tone: 'success',
      title:
        result.imported === 1
          ? t('import.doneOne')
          : t('import.done', { count: result.imported }),
      description:
        pending.duplicates.length > 0
          ? t('import.duplicatesSkipped', { count: pending.duplicates.length })
          : undefined,
    });
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file twice still fires a change event.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() => fileInput.current?.click()}
      >
        {t('settings.importJson')}
      </Button>

      <Sheet
        open={pending !== null}
        title={t('import.title')}
        onClose={() => {
          setPending(null);
          setError(null);
        }}
        dismissible={!busy}
      >
        {pending ? (
          <div className="space-y-4">
            <p className="text-[15px] leading-relaxed text-ink">
              {t('import.warning')}
            </p>

            <dl className="space-y-2 rounded-xl bg-surface-sunken p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t('import.newCount')}</dt>
                <dd className="tnum font-semibold text-ink">{pending.newTransactions.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">{t('import.duplicateCount')}</dt>
                <dd className="tnum font-semibold text-ink">{pending.duplicates.length}</dd>
              </div>
              {pending.exportedAt ? (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t('import.takenOn')}</dt>
                  <dd className="text-ink">{formatDisplayDate(pending.exportedAt.slice(0, 10), t)}</dd>
                </div>
              ) : null}
            </dl>

            <fieldset className="space-y-2">
              <legend className="field-label">{t('import.mode')}</legend>
              {(
                [
                  { value: 'merge', label: t('import.merge') },
                  { value: 'replace', label: t('import.replace') },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-4 text-[15px] ${
                    mode === option.value ? 'border-brand bg-brand-soft' : 'border-border bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="h-5 w-5 accent-[rgb(var(--brand))]"
                  />
                  <span className="text-ink">{option.label}</span>
                </label>
              ))}
            </fieldset>

            {mode === 'replace' ? (
              <p className="rounded-xl bg-returned-soft px-4 py-3 text-sm text-ink">
                {t('import.replaceWarning')}
              </p>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-returned-soft px-4 py-3 text-sm font-medium text-ink"
              >
                {error}
              </p>
            ) : null}

            <div className="flex gap-3 pt-1">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setPending(null);
                  setError(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="lg"
                className="flex-1"
                loading={busy}
                loadingLabel={t('import.importing')}
                onClick={() => void confirmImport()}
              >
                {t('import.confirm')}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
