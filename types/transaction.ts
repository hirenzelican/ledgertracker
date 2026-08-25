/** Domain types for the ledger. These mirror the `transactions` table exactly. */

export const TRANSACTION_TYPES = ['RECEIVED', 'RETURNED'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_METHODS = ['GOOGLE_PAY', 'CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A transaction exactly as it is stored in Postgres. */
export interface Transaction {
  id: string;
  user_id: string;
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

export interface LedgerTotals {
  balancePaise: number;
  receivedPaise: number;
  returnedPaise: number;
  count: number;
  /** `transaction_date` of the most recent transaction, or null when the ledger is empty. */
  lastTransactionDate: string | null;
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  RECEIVED: 'Received',
  RETURNED: 'Returned',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  GOOGLE_PAY: 'Google Pay / UPI',
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  OTHER: 'Other',
};

/** Short labels for tight mobile rows. */
export const METHOD_SHORT_LABELS: Record<PaymentMethod, string> = {
  GOOGLE_PAY: 'Google Pay',
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  OTHER: 'Other',
};

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}
