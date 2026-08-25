'use client';

import { Button } from '@/components/ui/Button';

/** Shown when the ledger has no transactions at all. */
export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">No transactions yet.</p>
      <p className="mx-auto mt-2 max-w-[24rem] text-[15px] leading-relaxed text-ink-muted">
        Start by recording money received from your mother.
      </p>
      <Button size="lg" className="mt-6 w-full" onClick={onAdd}>
        + Money Received
      </Button>
    </div>
  );
}
