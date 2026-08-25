/**
 * Balance derivation.
 *
 * The `transactions` rows are the single source of truth. Nothing here reads a stored
 * balance; every figure the UI shows is recomputed from the transaction list, so
 * editing or deleting history can never leave a stale total behind.
 */

import type {
  LedgerTotals,
  Transaction,
  TransactionType,
  TransactionWithBalance,
} from '@/types/transaction';
import { rupeeStringToPaise } from './money';

/** The signed effect a transaction has on the balance, in paise. */
export function signedDeltaPaise(type: TransactionType, amountPaise: number): number {
  return type === 'RECEIVED' ? amountPaise : -amountPaise;
}

/**
 * Canonical ledger order: oldest first, by `transaction_date` then `created_at`.
 * `id` is the final tie-break so the order is total and stable across devices.
 */
export function compareChronological(a: Transaction, b: Transaction): number {
  if (a.transaction_date !== b.transaction_date) {
    return a.transaction_date < b.transaction_date ? -1 : 1;
  }
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortChronological(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort(compareChronological);
}

/**
 * Walks the ledger oldest-first and attaches the balance after each transaction.
 * The returned array is in chronological (oldest first) order.
 */
export function buildRunningBalances(
  transactions: readonly Transaction[],
): TransactionWithBalance[] {
  let balancePaise = 0;
  return sortChronological(transactions).map((transaction) => {
    const deltaPaise = signedDeltaPaise(transaction.type, rupeeStringToPaise(transaction.amount));
    balancePaise += deltaPaise;
    return { transaction, deltaPaise, balanceAfterPaise: balancePaise };
  });
}

/** Aggregate figures for the dashboard. */
export function calculateTotals(transactions: readonly Transaction[]): LedgerTotals {
  let receivedPaise = 0;
  let returnedPaise = 0;
  let lastTransactionDate: string | null = null;

  for (const transaction of transactions) {
    const amountPaise = rupeeStringToPaise(transaction.amount);
    if (transaction.type === 'RECEIVED') {
      receivedPaise += amountPaise;
    } else {
      returnedPaise += amountPaise;
    }
    if (lastTransactionDate === null || transaction.transaction_date > lastTransactionDate) {
      lastTransactionDate = transaction.transaction_date;
    }
  }

  return {
    balancePaise: receivedPaise - returnedPaise,
    receivedPaise,
    returnedPaise,
    count: transactions.length,
    lastTransactionDate,
  };
}

/** Current balance in paise, derived from the full transaction list. */
export function calculateBalancePaise(transactions: readonly Transaction[]): number {
  return calculateTotals(transactions).balancePaise;
}

/**
 * The balance that would result from adding, editing or removing one transaction.
 *
 * `exclude` drops a transaction (used for edits and deletes), `include` adds a
 * hypothetical one. Both together model an edit: the old row is removed and the
 * proposed row applied.
 */
export function projectedBalancePaise(
  transactions: readonly Transaction[],
  change: {
    excludeId?: string;
    include?: { type: TransactionType; amountPaise: number };
  },
): number {
  let balancePaise = 0;
  for (const transaction of transactions) {
    if (change.excludeId !== undefined && transaction.id === change.excludeId) continue;
    balancePaise += signedDeltaPaise(transaction.type, rupeeStringToPaise(transaction.amount));
  }
  if (change.include) {
    balancePaise += signedDeltaPaise(change.include.type, change.include.amountPaise);
  }
  return balancePaise;
}

/** The minimum a row needs for the negative-balance check. */
export interface LedgerEntryLike {
  transaction_date: string;
  created_at?: string;
  id?: string;
  type: TransactionType;
  amountPaise: number;
}

/**
 * The first date at which the running balance would go below zero, or null if it never
 * does. Used to reject a transaction that balances out overall but would leave the
 * ledger holding less than nothing at some point in between - a back-dated return being
 * the usual way that happens.
 */
export function firstNegativeBalanceDate(entries: readonly LedgerEntryLike[]): string | null {
  const ordered = [...entries].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date) {
      return a.transaction_date < b.transaction_date ? -1 : 1;
    }
    const aCreated = a.created_at ?? '';
    const bCreated = b.created_at ?? '';
    if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;
    const aId = a.id ?? '';
    const bId = b.id ?? '';
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });

  let balancePaise = 0;
  for (const entry of ordered) {
    balancePaise += signedDeltaPaise(entry.type, entry.amountPaise);
    if (balancePaise < 0) return entry.transaction_date;
  }
  return null;
}

/** Maps stored rows into the shape `firstNegativeBalanceDate` expects. */
export function toLedgerEntries(transactions: readonly Transaction[]): LedgerEntryLike[] {
  return transactions.map((transaction) => ({
    transaction_date: transaction.transaction_date,
    created_at: transaction.created_at,
    id: transaction.id,
    type: transaction.type,
    amountPaise: rupeeStringToPaise(transaction.amount),
  }));
}

export interface StatementSummary {
  startDate: string;
  endDate: string;
  openingBalancePaise: number;
  receivedPaise: number;
  returnedPaise: number;
  closingBalancePaise: number;
  entries: TransactionWithBalance[];
}

/**
 * Statement for a closed date range. Opening balance is the running balance
 * immediately before `startDate`; every entry keeps its ledger-wide running balance
 * so the numbers agree with the history screen.
 */
export function buildStatement(
  transactions: readonly Transaction[],
  startDate: string,
  endDate: string,
): StatementSummary {
  const ledger = buildRunningBalances(transactions);
  let openingBalancePaise = 0;
  let receivedPaise = 0;
  let returnedPaise = 0;
  const entries: TransactionWithBalance[] = [];

  for (const entry of ledger) {
    const date = entry.transaction.transaction_date;
    if (date < startDate) {
      openingBalancePaise = entry.balanceAfterPaise;
      continue;
    }
    if (date > endDate) continue;
    entries.push(entry);
    if (entry.transaction.type === 'RECEIVED') {
      receivedPaise += entry.deltaPaise;
    } else {
      returnedPaise += -entry.deltaPaise;
    }
  }

  return {
    startDate,
    endDate,
    openingBalancePaise,
    receivedPaise,
    returnedPaise,
    closingBalancePaise: openingBalancePaise + receivedPaise - returnedPaise,
    entries,
  };
}
