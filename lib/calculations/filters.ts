/**
 * Filtering runs over entries that already carry their ledger-wide running balance, so
 * a filtered view never changes the balance shown against a transaction.
 */

import type { TransactionWithBalance, TransactionType } from '@/types/transaction';

export type TypeFilter = 'ALL' | TransactionType;

export interface LedgerFilter {
  type: TypeFilter;
  /** Case-insensitive substring match against the note. */
  search: string;
  /** Inclusive ISO date bounds; null means unbounded. */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTER: LedgerFilter = { type: 'ALL', search: '', from: null, to: null };

export function filterLedger(
  entries: readonly TransactionWithBalance[],
  filter: LedgerFilter,
): TransactionWithBalance[] {
  const needle = filter.search.trim().toLowerCase();

  return entries.filter(({ transaction }) => {
    if (filter.type !== 'ALL' && transaction.type !== filter.type) return false;
    if (filter.from !== null && transaction.transaction_date < filter.from) return false;
    if (filter.to !== null && transaction.transaction_date > filter.to) return false;
    if (needle !== '' && !(transaction.note ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function isFilterActive(filter: LedgerFilter): boolean {
  return (
    filter.type !== 'ALL' ||
    filter.search.trim() !== '' ||
    filter.from !== null ||
    filter.to !== null
  );
}
