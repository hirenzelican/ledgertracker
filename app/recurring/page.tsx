'use client';

/**
 * The repeating entries: what is set up, when each next falls due, and what is overdue.
 *
 * Every figure here is a *plan*. Nothing on this screen has affected a balance, and the
 * amounts shown are what will be recorded if and when the user says so - which is why
 * "Due now" is a state rather than an action.
 */

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/components/layout/AuthGate';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Fab } from '@/components/ui/Fab';
import { LoadingPanel } from '@/components/ui/Spinner';
import { DuePrompt } from '@/components/recurring/DuePrompt';
import { RecurrenceSheet } from '@/components/recurring/RecurrenceSheet';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useRecurring } from '@/components/providers/RecurringProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/cn';
import { amountToPaise, formatRupees } from '@/lib/calculations/money';
import { formatDisplayDate, todayIso } from '@/lib/format/date';
import type { Recurrence, RecurrenceInput } from '@/types/transaction';

export default function RecurringPage() {
  return (
    <AuthGate>
      <Recurring />
    </AuthGate>
  );
}

function Recurring() {
  const { rules, status, addRule, editRule, toggleRule, removeRule } = useRecurring();
  const { people } = useLedger();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [editing, setEditing] = useState<Recurrence | 'new' | null>(null);
  const [removing, setRemoving] = useState<Recurrence | null>(null);
  const [deleting, setDeleting] = useState(false);

  const today = todayIso();

  const save = async (input: RecurrenceInput) => {
    const result =
      editing === 'new' || editing === null
        ? await addRule(input)
        : await editRule(editing.id, input);
    if (result.ok) {
      showToast({ tone: 'success', title: t('recurring.saved') });
      setEditing(null);
    }
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setDeleting(true);
    const result = await removeRule(removing.id);
    setDeleting(false);
    if (!result.ok) {
      showToast({ tone: 'error', title: result.message });
      return;
    }
    showToast({ tone: 'success', title: t('recurring.deleted') });
    setRemoving(null);
  };

  return (
    <AppShell
      title={t('recurring.title')}
      subtitle={
        rules.length === 0
          ? t('recurring.subtitle')
          : t('recurring.subtitleCount', { count: rules.length })
      }
    >
      <div className="space-y-4">
        <DuePrompt />

        {status === 'loading' ? (
          <Card>
            <LoadingPanel label={t('common.loading')} />
          </Card>
        ) : rules.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-base font-semibold text-ink">{t('recurring.empty')}</p>
            <p className="mx-auto mt-2 max-w-[26rem] text-[15px] leading-relaxed text-ink-muted">
              {t('recurring.emptyBody')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {rules.map((rule) => {
              const overdue = rule.active && rule.next_due <= today;
              const personName =
                people.find((person) => person.id === rule.person_id)?.name ?? '';

              return (
                <li key={rule.id}>
                  <article
                    className={cn(
                      'card p-4',
                      overdue && 'border-brand/40',
                      !rule.active && 'opacity-60',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="truncate text-[15px] font-semibold text-ink">
                        {personName}
                      </h2>
                      <p className="tnum shrink-0 text-lg font-bold text-ink">
                        {formatRupees(amountToPaise(rule.amount))}
                      </p>
                    </div>

                    <p className="mt-0.5 text-sm text-ink-muted">
                      {t(`type.${rule.type}.short`)} · {t(`frequency.${rule.frequency}`)}
                      {rule.note ? ` · ${rule.note}` : ''}
                    </p>

                    {rule.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rule.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <p
                      className={cn(
                        'mt-2 text-sm font-medium',
                        !rule.active
                          ? 'text-ink-faint'
                          : overdue
                            ? 'text-brand'
                            : 'text-ink-faint',
                      )}
                    >
                      {!rule.active
                        ? t('recurring.paused')
                        : overdue
                          ? t('recurring.overdue')
                          : t('recurring.nextDue', {
                              date: formatDisplayDate(rule.next_due, t),
                            })}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setEditing(rule)}>
                        {t('entry.edit')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void toggleRule(rule.id, !rule.active)}
                      >
                        {rule.active ? t('recurring.pause') : t('recurring.resume')}
                      </Button>
                      <Button variant="secondary" onClick={() => setRemoving(rule)}>
                        {t('recurring.delete')}
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Fab label={t('recurring.add')} onClick={() => setEditing('new')} />

      {editing ? (
        <RecurrenceSheet
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={t('recurring.deleteTitle')}
        message={t('recurring.deleteMessage')}
        confirmLabel={t('entry.delete')}
        destructive
        busy={deleting}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </AppShell>
  );
}
