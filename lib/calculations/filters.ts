/**
 * What a filtered view of the ledger means.
 *
 * The filtering itself now happens in the database - `fetchLedgerPage` turns a
 * `LedgerQuery` into a query, so narrowing a view never means downloading everything
 * first. `filterLedger` below is the same rule written out in TypeScript: it is what the
 * tests hold the SQL to, and the answer to appeal to if the two ever disagree.
 */

import {
  EMPTY_QUERY,
  TYPE_DIRECTION,
  type DirectionFilter,
  type LedgerQuery,
  type TransactionWithBalance,
} from '@/types/transaction';

export type { DirectionFilter, LedgerQuery };
/** Kept as the name the UI has always used for the shape it passes around. */
export type LedgerFilter = LedgerQuery;
export const EMPTY_FILTER: LedgerFilter = EMPTY_QUERY;

export function filterLedger(
  entries: readonly TransactionWithBalance[],
  filter: LedgerFilter,
): TransactionWithBalance[] {
  const needle = filter.search.trim().toLowerCase();

  return entries.filter(({ transaction }) => {
    if (filter.direction !== 'ALL') {
      const direction = TYPE_DIRECTION[transaction.type] === 1 ? 'IN' : 'OUT';
      if (direction !== filter.direction) return false;
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
    filter.direction !== 'ALL' ||
    filter.personId !== null ||
    filter.search.trim() !== '' ||
    filter.from !== null ||
    filter.to !== null
  );
}
