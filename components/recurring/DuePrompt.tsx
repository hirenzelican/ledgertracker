'use client';

/**
 * "Three entries are due. Add them?"
 *
 * Nothing posts on its own. These are financial records, and a record the user did not
 * agree to is worse than one they had to tap once for - so a rule falling due is an
 * offer, never an action. Declining hides the prompt for the session rather than for
 * ever: the entries are still due tomorrow, because they are.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useRecurring } from '@/components/providers/RecurringProvider';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { formatDisplayDate } from '@/lib/format/date';
import { amountToPaise, formatRupees } from '@/lib/calculations/money';

/** Enough to recognise what is about to be added without becoming a second history. */
const PREVIEW = 4;

export function DuePrompt() {
  const { due, dismissed, dismiss, postDue } = useRecurring();
  const { people } = useLedger();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [posting, setPosting] = useState(false);

  if (due.length === 0 || dismissed) return null;

  const add = async () => {
    setPosting(true);
    const result = await postDue();
    setPosting(false);

    if (!result.ok) {
      showToast({ tone: 'error', title: result.message });
      return;
    }
    showToast({
      tone: 'success',
      title:
        result.value.length === 1
          ? t('recurring.postedOne')
          : t('recurring.posted', { count: result.value.length }),
    });
  };

  return (
    <section className="card border-brand/40 bg-brand-soft p-4" aria-live="polite">
      <h2 className="text-base font-semibold text-ink">
        {due.length === 1
          ? t('recurring.dueTitleOne')
          : t('recurring.dueTitle', { count: due.length })}
      </h2>

      <ul className="mt-3 space-y-1.5">
        {due.slice(0, PREVIEW).map((rule) => (
          <li key={rule.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink-muted">
              {people.find((person) => person.id === rule.person_id)?.name ?? ''}
              {rule.note ? ` · ${rule.note}` : ''}
            </span>
            <span className="tnum shrink-0 font-medium text-ink">
              {formatRupees(amountToPaise(rule.amount))}
              <span className="ml-2 text-xs font-normal text-ink-faint">
                {formatDisplayDate(rule.next_due, t)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm text-ink-muted">{t('recurring.dueBody')}</p>

      <div className="mt-3 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={dismiss} disabled={posting}>
          {t('recurring.later')}
        </Button>
        <Button
          className="flex-1"
          onClick={() => void add()}
          loading={posting}
          loadingLabel={t('form.saving')}
        >
          {t('recurring.addNow')}
        </Button>
      </div>
    </section>
  );
}
