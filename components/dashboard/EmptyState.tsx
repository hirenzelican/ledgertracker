'use client';

import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/components/providers/LanguageProvider';

/** Shown when the ledger has no transactions at all. */
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{t('dashboard.empty.title')}</p>
      <p className="mx-auto mt-2 max-w-[24rem] text-[15px] leading-relaxed text-ink-muted">
        {t('dashboard.empty.body')}
      </p>
      <Button size="lg" className="mt-6 w-full" onClick={onAdd}>
        {t('dashboard.empty.action')}
      </Button>
    </div>
  );
}
