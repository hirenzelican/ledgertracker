'use client';

import { cn } from '@/lib/cn';
import type { TransactionType } from '@/types/transaction';
import { useTranslation } from '@/components/providers/LanguageProvider';

/**
 * The two-second path: tap, type an amount, save. Money can move for two reasons in each
 * direction, so there are four, laid out as in / out rather than alphabetically - the
 * first thing you know is which way the money went.
 */
const ACTIONS: {
  type: TransactionType;
  sign: string;
  tone: 'in' | 'out';
}[] = [
  { type: 'RECEIVED', sign: '+', tone: 'in' },
  { type: 'RETURNED', sign: '−', tone: 'out' },
  { type: 'LENT', sign: '−', tone: 'out' },
  { type: 'REPAID', sign: '+', tone: 'in' },
];

export function QuickActions({ onAction }: { onAction: (type: TransactionType) => void }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3">
      {ACTIONS.map((action) => (
        <button
          key={action.type}
          type="button"
          onClick={() => onAction(action.type)}
          className={cn(
            'flex min-h-[78px] flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-3 shadow-sm transition active:scale-[0.99]',
            action.tone === 'in'
              ? 'bg-received text-received-ink'
              : 'bg-returned text-returned-ink',
          )}
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-lg font-bold leading-none">
              {action.sign}
            </span>
            <span className="text-[15px] font-semibold">{t(`type.${action.type}.action`)}</span>
          </span>
          <span className="text-[11px] font-medium opacity-90">
            {t(`type.${action.type}.caption`)}
          </span>
        </button>
      ))}
    </div>
  );
}
