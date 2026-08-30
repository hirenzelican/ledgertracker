/**
 * Filtering runs over entries that already carry their running balance, so narrowing the
 * view never changes the balance shown against a transaction.
 */

import { TYPE_DIRECTION, type TransactionWithBalance } from '@/types/transaction';

/** Money in or money out: the four kinds collapse to two directions when filtering. */
export type TypeFilter = 'ALL' | 'IN' | 'OUT';

export interface LedgerFilter {
  type: TypeFilter;
  /** Restricts to one person; null means everyone. */
  personId: string | null;
  /** Case-insensitive substring match against the note. */
  search: string;
  /** Inclusive ISO date bounds; null means unbounded. */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTER: LedgerFilter = {
  type: 'ALL',
  personId: null,
  search: '',
  from: null,
  to: null,
};

export function filterLedger(
  entries: readonly TransactionWithBalance[],
  filter: LedgerFilter,
): TransactionWithBalance[] {
  const needle = filter.search.trim().toLowerCase();

  return entries.filter(({ transaction }) => {
    if (filter.type !== 'ALL') {
      const direction = TYPE_DIRECTION[transaction.type] === 1 ? 'IN' : 'OUT';
      if (direction !== filter.type) return false;
    }
    if (filter.personId !== null && transaction.person_id !== filter.personId) return false;
    if (filter.from !== null && transaction.transaction_date < filter.from) return false;
    if (filter.to !== null && transaction.transaction_date > filter.to) return false;
    if (needle !== '' && !(transaction.note ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function isFilterActive(filter: LedgerFilter): boolean {
  return (
    filter.type !== 'ALL' ||
    filter.personId !== null ||
    filter.search.trim() !== '' ||
    filter.from !== null ||
    filter.to !== null
  );
}
