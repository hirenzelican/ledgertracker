'use client';

import { cn } from '@/lib/cn';
import { endOfMonth, shiftMonth, startOfMonth, todayIso } from '@/lib/format/date';
import type { LedgerFilter, TypeFilter } from '@/lib/calculations/filters';

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'RETURNED', label: 'Returned' },
];

type PeriodKey = 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';

const PERIOD_TABS: { value: PeriodKey; label: string }[] = [
  { value: 'ALL', label: 'All time' },
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
  { value: 'CUSTOM', label: 'Custom' },
];

interface TransactionFiltersProps {
  filter: LedgerFilter;
  onChange: (filter: LedgerFilter) => void;
  period: PeriodKey;
  onPeriodChange: (period: PeriodKey) => void;
}

export function periodRange(period: PeriodKey): { from: string | null; to: string | null } {
  const today = todayIso();
  if (period === 'THIS_MONTH') return { from: startOfMonth(today), to: endOfMonth(today) };
  if (period === 'LAST_MONTH') {
    const lastMonth = shiftMonth(today, -1);
    return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
  }
  return { from: null, to: null };
}

export function TransactionFilters({
  filter,
  onChange,
  period,
  onPeriodChange,
}: TransactionFiltersProps) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="transaction-search" className="sr-only">
          Search notes
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            id="transaction-search"
            type="search"
            value={filter.search}
            onChange={(event) => onChange({ ...filter, search: event.target.value })}
            placeholder="Search notes"
            enterKeyHint="search"
            className="field-input pl-11"
          />
        </div>
      </div>

      <div role="tablist" aria-label="Filter by type" className="flex gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={filter.type === tab.value}
            onClick={() => onChange({ ...filter, type: tab.value })}
            className={cn(
              'min-h-[42px] flex-1 rounded-xl border px-3 text-sm font-medium transition',
              filter.type === tab.value
                ? 'border-brand bg-brand-soft text-ink'
                : 'border-border bg-surface text-ink-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={period === tab.value}
            onClick={() => {
              onPeriodChange(tab.value);
              if (tab.value !== 'CUSTOM') onChange({ ...filter, ...periodRange(tab.value) });
            }}
            className={cn(
              'min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-medium transition',
              period === tab.value
                ? 'border-brand bg-brand-soft text-ink'
                : 'border-border bg-surface text-ink-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {period === 'CUSTOM' ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="filter-from" className="field-label">
              From
            </label>
            <input
              id="filter-from"
              type="date"
              value={filter.from ?? ''}
              onChange={(event) => onChange({ ...filter, from: event.target.value || null })}
              className="field-input"
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="field-label">
              To
            </label>
            <input
              id="filter-to"
              type="date"
              value={filter.to ?? ''}
              onChange={(event) => onChange({ ...filter, to: event.target.value || null })}
              className="field-input"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type { PeriodKey };
