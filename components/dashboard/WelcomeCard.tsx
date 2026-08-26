'use client';

import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/components/providers/LanguageProvider';

/**
 * A single short card shown on first launch, dismissed for good once the user starts.
 * Deliberately not a multi-step onboarding flow.
 */
export function WelcomeCard({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const { t } = useTranslation();

  return (
    <section className="card bg-brand-soft p-5">
      <h2 className="text-lg font-semibold text-ink">{t('dashboard.welcome.title')}</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
        {t('dashboard.welcome.body')}
      </p>
      <div className="mt-4 flex gap-3">
        <Button variant="ghost" onClick={onDismiss} className="px-3">
          {t('dashboard.welcome.dismiss')}
        </Button>
        <Button className="flex-1" onClick={onStart}>
          {t('dashboard.welcome.start')}
        </Button>
      </div>
    </section>
  );
}
