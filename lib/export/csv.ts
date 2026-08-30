/**
 * CSV export and its column layout.
 *
 * `Date,Person,Relationship,Type,Amount,Method,Note,Tags` with ISO dates and plain
 * decimal amounts. The same layout is what the importer expects, so a file exported here
 * can be edited in a spreadsheet and read back without translation.
 */

import { amountToPaise, paiseToExportString } from '@/lib/calculations/money';
import { sortChronological } from '@/lib/calculations/balance';
import type { Person, Transaction } from '@/types/transaction';

export const CSV_COLUMNS = [
  'Date',
  'Person',
  'Relationship',
  'Type',
  'Amount',
  'Method',
  'Note',
  'Tags',
] as const;

const HEADER = CSV_COLUMNS.join(',');

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
      // Semicolons, because a tag may contain a space but never a semicolon. Using
      // commas would force the field to be quoted on every tagged row.
      csvField((transaction.tags ?? []).join('; ')),
    ].join(','),
  );
  return [HEADER, ...rows].join('\r\n');
}
