/**
 * CSV export. Columns match the documented format exactly:
 * `Date,Type,Amount,Method,Note` with ISO dates and plain decimal amounts.
 */

import { amountToPaise, paiseToExportString } from '@/lib/calculations/money';
import { sortChronological } from '@/lib/calculations/balance';
import type { Person, Transaction } from '@/types/transaction';

const HEADER = 'Date,Person,Relationship,Type,Amount,Method,Note';

/**
 * Quotes a field when it contains a separator, quote or newline. A leading `=`, `+`,
 * `-` or `@` is prefixed with an apostrophe so spreadsheet apps treat a note as text
 * rather than a formula.
 */
function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  people: readonly Person[],
): string {
  const byId = new Map(people.map((person) => [person.id, person]));
  const rows = sortChronological(transactions).map((transaction) =>
    [
      transaction.transaction_date,
      csvField(byId.get(transaction.person_id)?.name ?? 'Unknown'),
      byId.get(transaction.person_id)?.relationship ?? 'OTHER',
      transaction.type,
      paiseToExportString(amountToPaise(transaction.amount)),
      transaction.method,
      csvField(transaction.note ?? ''),
    ].join(','),
  );
  return [HEADER, ...rows].join('\r\n');
}
