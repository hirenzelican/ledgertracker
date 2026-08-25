'use client';

import { Button } from '@/components/ui/Button';

/**
 * A single short card shown on first launch, dismissed for good once the user starts.
 * Deliberately not a multi-step onboarding flow.
 */
export function WelcomeCard({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <section className="card bg-brand-soft p-5">
      <h2 className="text-lg font-semibold text-ink">Welcome to Potli</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
        Keep track of money that family or friends have left with you, and what you have given
        back. Let&rsquo;s record the first transaction.
      </p>
      <div className="mt-4 flex gap-3">
        <Button variant="ghost" onClick={onDismiss} className="px-3">
          Not now
        </Button>
        <Button className="flex-1" onClick={onStart}>
          Add first transaction
        </Button>
      </div>
    </section>
  );
}
