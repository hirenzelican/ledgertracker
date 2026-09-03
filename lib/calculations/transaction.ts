/**
 * Turning a stored row back into the form values that would produce it.
 *
 * `TransactionInput` is what the app writes and `Transaction` is what comes back, and
 * they differ in exactly two ways: the row carries its identity and timestamps, and its
 * amount is a decimal string rather than integer paise. Undo needs the round trip, so
 * the conversion lives here rather than being open-coded at the one call site - the next
 * caller that needs it must not be free to invent a second answer.
 */

import { amountToPaise } from './money';
import type { Transaction, TransactionInput } from '@/types/transaction';

export function toTransactionInput(transaction: Transaction): TransactionInput {
  return {
    person_id: transaction.person_id,
    transaction_date: transaction.transaction_date,
    type: transaction.type,
    amountPaise: amountToPaise(transaction.amount),
    method: transaction.method,
    // A row holds null for "no note"; the form holds an empty string for the same thing.
    note: transaction.note ?? '',
    tags: transaction.tags,
  };
}
