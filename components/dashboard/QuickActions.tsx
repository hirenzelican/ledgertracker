'use client';

import type { TransactionType } from '@/types/transaction';

/**
 * The two-second path: tap, type an amount, save. These are the largest touch targets
 * in the app by design.
 */
export function QuickActions({ onAction }: { onAction: (type: TransactionType) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={() => onAction('RECEIVED')}
        className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl
          bg-received px-4 py-4 text-received-ink shadow-sm transition active:scale-[0.99]"
      >
        <span aria-hidden="true" className="text-2xl font-bold leading-none">
          +
        </span>
        <span className="text-[15px] font-semibold">Received</span>
        <span className="sr-only">Record money received from my mother</span>
      </button>

      <button
        type="button"
        onClick={() => onAction('RETURNED')}
        className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl
          bg-returned px-4 py-4 text-returned-ink shadow-sm transition active:scale-[0.99]"
      >
        <span aria-hidden="true" className="text-2xl font-bold leading-none">
          −
        </span>
        <span className="text-[15px] font-semibold">Returned</span>
        <span className="sr-only">Record money returned to my mother</span>
      </button>
    </div>
  );
}
