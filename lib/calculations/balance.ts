/**
 * Balance derivation.
 *
 * The `transactions` rows are the single source of truth. Nothing here reads a stored
 * balance; every figure the UI shows is recomputed from the transactions, so editing or
 * deleting history can never leave a stale total behind.
 *
 * Since paging moved to the server, most of these run in SQL as well - `person_balances`
 * mirrors `calculatePersonBalances`, and `transaction_ledger`'s window function mirrors
 * `buildRunningBalances`. The versions here stay as the readable statement of the rule
 * and as what the tests check the SQL against; if the two ever disagree, one of them is
 * a bug and this file says which answer is right.
 */

import { TYPE_DIRECTION } from '@/types/transaction';
import type { Translate } from '@/lib/i18n/locales';
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
 *
 * The balance is that person's, not a total across everyone: each person is a separate
 * pot, so a row showing what you hold for your mother must not include what your brother
 * lent you. The returned array is in chronological (oldest first) order.
 */
export function buildRunningBalances(
  transactions: readonly Transaction[],
): TransactionWithBalance[] {
  const balanceByPerson = new Map<string, number>();
  return sortChronological(transactions).map((transaction) => {
    const deltaPaise = signedDeltaPaise(transaction.type, amountToPaise(transaction.amount));
    const balancePaise = (balanceByPerson.get(transaction.person_id) ?? 0) + deltaPaise;
    balanceByPerson.set(transaction.person_id, balancePaise);
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

/** What a person's balance means, said in the reader's language. */
export function describePersonBalance(name: string, balancePaise: number, t: Translate): string {
  if (balancePaise > 0) {
    return t('person.balance.holding', { name, amount: formatRupees(balancePaise) });
  }
  if (balancePaise < 0) {
    return t('person.balance.owed', { name, amount: formatRupees(-balancePaise) });
  }
  return t('person.balance.settled', { name });
}

/**
 * The entry that would bring someone's balance to zero, or null when there is nothing
 * outstanding.
 *
 * The direction follows from the sign of the balance and from nothing else, which is the
 * whole point of having this here. A positive balance is their money sitting with me, so
 * settling it is me giving it back (RETURNED). A negative one is my money sitting with
 * them, so settling it is them paying it back (REPAID). Choosing between those two by
 * hand is the step people get wrong: "they gave it back" reads like RETURNED, which is
 * the opposite entry and moves the balance the wrong way.
 *
 * The amount is the full outstanding balance. A partial settlement is the same entry
 * with a smaller number, so the caller offers this as a starting point rather than a
 * fixed quantity.
 */
export function settlementFor(
  balancePaise: number,
): { type: TransactionType; amountPaise: number } | null {
  if (balancePaise === 0) return null;
  return balancePaise > 0
    ? { type: 'RETURNED', amountPaise: balancePaise }
    : { type: 'REPAID', amountPaise: -balancePaise };
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

/**
 * The balance after applying a change to a known starting balance.
 *
 * This is `projectedBalancePaise` for a caller that has the balance but not the rows -
 * which, now that the ledger is paged, is every caller in the app. `exclude` takes a
 * transaction back out (an edit or a delete), `include` applies a proposed one.
 */
export function applyChangePaise(
  basePaise: number,
  change: {
    exclude?: { type: TransactionType; amountPaise: number };
    include?: { type: TransactionType; amountPaise: number };
  },
): number {
  let balancePaise = basePaise;
  if (change.exclude) {
    balancePaise -= signedDeltaPaise(change.exclude.type, change.exclude.amountPaise);
  }
  if (change.include) {
    balancePaise += signedDeltaPaise(change.include.type, change.include.amountPaise);
  }
  return balancePaise;
}

/** Money in and money out across a set of entries that already carry their deltas. */
export function summariseEntries(entries: readonly TransactionWithBalance[]): {
  moneyInPaise: number;
  moneyOutPaise: number;
} {
  let moneyInPaise = 0;
  let moneyOutPaise = 0;
  for (const entry of entries) {
    if (entry.deltaPaise > 0) moneyInPaise += entry.deltaPaise;
    else moneyOutPaise += -entry.deltaPaise;
  }
  return { moneyInPaise, moneyOutPaise };
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
 * Statement for entries already fetched for the period, with the opening balance the
 * database computed over the rows before it.
 *
 * The entries must be exactly the period's, oldest first. Nothing is filtered here: the
 * query that fetched them already did that, and re-filtering would mean the screen and
 * the database could disagree about what is in the statement.
 */
export function statementFromEntries(
  entries: readonly TransactionWithBalance[],
  openingBalancePaise: number,
  startDate: string,
  endDate: string,
): StatementSummary {
  const { moneyInPaise, moneyOutPaise } = summariseEntries(entries);
  return {
    startDate,
    endDate,
    openingBalancePaise,
    receivedPaise: moneyInPaise,
    returnedPaise: moneyOutPaise,
    closingBalancePaise: openingBalancePaise + moneyInPaise - moneyOutPaise,
    entries: [...entries],
  };
}

/**
 * Statement for a closed date range, derived from raw transactions. Opening balance is
 * the running balance immediately before `startDate`; every entry keeps its running
 * balance so the numbers agree with the history screen.
 *
 * The app itself uses `statementFromEntries` - it no longer holds every transaction. This
 * stays as the definition of what a statement is, and as the reference the tests hold
 * `ledger_summary` and the paged fetch to.
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
      // Summed, not assigned. `balanceAfterPaise` is one person's running balance, so
      // taking the last one gave whichever contact happened to appear last in the sort
      // rather than the total across everyone - right for a single-person statement,
      // silently wrong for "everyone" the moment a second contact existed.
      openingBalancePaise += entry.deltaPaise;
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
