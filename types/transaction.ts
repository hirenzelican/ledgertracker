/** Domain types for the ledger. These mirror the `transactions` table exactly. */

/**
 * Money moves in two directions for two reasons, giving four kinds of entry. They all
 * sit on one signed axis per person: RECEIVED and REPAID raise the balance, RETURNED and
 * LENT lower it. A positive balance means their money is with me; a negative one means
 * they owe me.
 */
export const TRANSACTION_TYPES = ['RECEIVED', 'RETURNED', 'LENT', 'REPAID'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Whether a type adds to the balance (+1) or takes from it (-1). */
export const TYPE_DIRECTION: Record<TransactionType, 1 | -1> = {
  RECEIVED: 1,
  REPAID: 1,
  RETURNED: -1,
  LENT: -1,
};

export const PAYMENT_METHODS = ['GOOGLE_PAY', 'CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RELATIONSHIPS = [
  'MOTHER',
  'FATHER',
  'BROTHER',
  'SISTER',
  'SPOUSE',
  'FRIEND',
  'OTHER',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/** Someone whose money is being held. */
export interface Person {
  id: string;
  user_id: string;
  name: string;
  relationship: Relationship;
  /** As the user typed it. Null when never filled in - not every contact needs one. */
  phone: string | null;
  email: string | null;
  /** Anything worth remembering: "pays back on salary day", a second number, an address. */
  note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The editable fields of a contact. The optional details are empty strings rather than
 * nulls here because that is what an untouched form field holds; the data layer turns
 * an empty string into a NULL so the database never stores blank-but-present.
 */
export interface PersonInput {
  name: string;
  relationship: Relationship;
  phone: string;
  email: string;
  note: string;
}

/** A person with their derived figures, for the dashboard list. */
export interface PersonBalance {
  person: Person;
  /** Positive: holding their money. Negative: they owe me. */
  balancePaise: number;
  moneyInPaise: number;
  moneyOutPaise: number;
  count: number;
  lastTransactionDate: string | null;
}

export function isRelationship(value: unknown): value is Relationship {
  return typeof value === 'string' && (RELATIONSHIPS as readonly string[]).includes(value);
}

/** A transaction exactly as it is stored in Postgres. */
export interface Transaction {
  id: string;
  user_id: string;
  /** The person this money belongs to. Every transaction has exactly one. */
  person_id: string;
  /** ISO calendar date, `YYYY-MM-DD`. */
  transaction_date: string;
  type: TransactionType;
  /**
   * Rupees as stored in NUMERIC(12,2). PostgREST sends this as a JSON number, while
   * backups may carry a decimal string, so both forms are accepted; `amountToPaise` is
   * the only thing that reads it. Never parsed with `parseFloat` for maths.
   */
  amount: string | number;
  method: PaymentMethod;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** The user-editable fields of a transaction. */
export interface TransactionInput {
  person_id: string;
  transaction_date: string;
  type: TransactionType;
  /** Amount in paise (integer). The single internal representation for money. */
  amountPaise: number;
  method: PaymentMethod;
  note: string;
}

/** A transaction decorated with the balance that existed immediately after it. */
export interface TransactionWithBalance {
  transaction: Transaction;
  /** Signed delta applied to the balance, in paise. */
  deltaPaise: number;
  /** Ledger balance after this transaction, in paise. */
  balanceAfterPaise: number;
}

/** Money in or money out: the four kinds collapse to two directions when filtering. */
export type DirectionFilter = 'ALL' | 'IN' | 'OUT';

/**
 * What slice of the ledger a screen is asking for. Every field narrows the query the
 * database runs - none of this is applied in the browser any more.
 */
export interface LedgerQuery {
  /** One contact, or null for everyone. */
  personId: string | null;
  direction: DirectionFilter;
  /** Case-insensitive substring match against the note. */
  search: string;
  /** Inclusive ISO date bounds; null means unbounded. */
  from: string | null;
  to: string | null;
}

export const EMPTY_QUERY: LedgerQuery = {
  personId: null,
  direction: 'ALL',
  search: '',
  from: null,
  to: null,
};

/** One page of history, plus how many rows the whole query matches. */
export interface LedgerPage {
  entries: TransactionWithBalance[];
  /** Total matching rows in the database, not the length of `entries`. */
  total: number;
}

/** Totals for a filtered slice, computed in the database over rows never downloaded. */
export interface LedgerSummary {
  moneyInPaise: number;
  moneyOutPaise: number;
  count: number;
  /** Balance carried in from before the range. Zero when the range is open-ended. */
  openingBalancePaise: number;
}

export interface LedgerTotals {
  /** Net across everyone; rarely shown, since holding and being owed are different things. */
  balancePaise: number;
  /** Everything that came to me, over all time. */
  moneyInPaise: number;
  /** Everything that went out, over all time. */
  moneyOutPaise: number;
  count: number;
  /** `transaction_date` of the most recent transaction, or null when the ledger is empty. */
  lastTransactionDate: string | null;
}

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}
