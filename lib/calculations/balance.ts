/**
 * Balance derivation.
 *
 * The `transactions` rows are the single source of truth. Nothing here reads a stored
 * balance; every figure the UI shows is recomputed from the transaction list, so
 * editing or deleting history can never leave a stale total behind.
 */

import { TYPE_DIRECTION } from '@/types/transaction';
import type {
  LedgerTotals,
  Person,
  PersonBalance,
  Transaction,
  TransactionType,
  TransactionWithBalance,
} from '@/types/transaction';
import { amountToPaise, formatRupees } from './money';

/** The signed effect a transaction has on the balance, in paise. */
export function signedDeltaPaise(type: TransactionType, amountPaise: number): number {
  return TYPE_DIRECTION[type] * amountPaise;
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
    const deltaPaise = signedDeltaPaise(transaction.type, amountToPaise(transaction.amount));
    balancePaise += deltaPaise;
    return { transaction, deltaPaise, balanceAfterPaise: balancePaise };
  });
}

/** Aggregate figures for the dashboard. */
export function calculateTotals(transactions: readonly Transaction[]): LedgerTotals {
  let moneyInPaise = 0;
  let moneyOutPaise = 0;
  let lastTransactionDate: string | null = null;

  for (const transaction of transactions) {
    const amountPaise = amountToPaise(transaction.amount);
    if (TYPE_DIRECTION[transaction.type] === 1) {
      moneyInPaise += amountPaise;
    } else {
      moneyOutPaise += amountPaise;
    }
    if (lastTransactionDate === null || transaction.transaction_date > lastTransactionDate) {
      lastTransactionDate = transaction.transaction_date;
    }
  }

  return {
    balancePaise: moneyInPaise - moneyOutPaise,
    moneyInPaise,
    moneyOutPaise,
    count: transactions.length,
    lastTransactionDate,
  };
}

/** Only the transactions belonging to one person. */
export function forPerson(
  transactions: readonly Transaction[],
  personId: string,
): Transaction[] {
  return transactions.filter((transaction) => transaction.person_id === personId);
}

/**
 * Per-person figures for the dashboard, ordered by who is holding the most - the person
 * whose money you hold most of is the one you most need to be reminded about.
 * Everyone is listed, including people with no transactions yet.
 */
export function calculatePersonBalances(
  people: readonly Person[],
  transactions: readonly Transaction[],
): PersonBalance[] {
  const byPerson = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const bucket = byPerson.get(transaction.person_id);
    if (bucket) bucket.push(transaction);
    else byPerson.set(transaction.person_id, [transaction]);
  }

  return people
    .map((person) => {
      const totals = calculateTotals(byPerson.get(person.id) ?? []);
      return {
        person,
        balancePaise: totals.balancePaise,
        moneyInPaise: totals.moneyInPaise,
        moneyOutPaise: totals.moneyOutPaise,
        count: totals.count,
        lastTransactionDate: totals.lastTransactionDate,
      };
    })
    .sort((a, b) => {
      // Largest holdings first, then whoever owes the most, then everyone settled.
      const weight = (value: number) => (value === 0 ? 1 : 0);
      if (weight(a.balancePaise) !== weight(b.balancePaise)) {
        return weight(a.balancePaise) - weight(b.balancePaise);
      }
      if (a.balancePaise !== b.balancePaise) return b.balancePaise - a.balancePaise;
      return a.person.name.localeCompare(b.person.name);
    });
}

/** "Holding ₹8,000 for Ravi" / "Ravi owes you ₹2,000" / "Settled up with Ravi". */
export function describePersonBalance(name: string, balancePaise: number): string {
  if (balancePaise > 0) return `Holding ${formatRupees(balancePaise)} for ${name}`;
  if (balancePaise < 0) return `${name} owes you ${formatRupees(-balancePaise)}`;
  return `Settled up with ${name}`;
}

export interface Standing {
  /** Total of other people's money currently in my hands. */
  holdingPaise: number;
  /** Total that other people owe me. */
  owedToYouPaise: number;
}

/**
 * The two figures that matter across everyone. They are kept apart on purpose: holding
 * ₹10,000 for one person while another owes you ₹4,000 is not the same as having
 * ₹6,000 of anything, and a single net number would imply it was.
 */
export function summariseStanding(balances: readonly PersonBalance[]): Standing {
  let holdingPaise = 0;
  let owedToYouPaise = 0;
  for (const { balancePaise } of balances) {
    if (balancePaise > 0) holdingPaise += balancePaise;
    else owedToYouPaise -= balancePaise;
  }
  return { holdingPaise, owedToYouPaise };
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
    balancePaise += signedDeltaPaise(transaction.type, amountToPaise(transaction.amount));
  }
  if (change.include) {
    balancePaise += signedDeltaPaise(change.include.type, change.include.amountPaise);
  }
  return balancePaise;
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
    if (entry.deltaPaise > 0) {
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
