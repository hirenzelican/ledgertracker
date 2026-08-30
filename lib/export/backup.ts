/**
 * JSON backup format.
 *
 * A backup carries only the user-owned fields of each transaction. `id`, `user_id` and
 * the timestamps are deliberately excluded: restoring into a different Supabase project
 * or account must not try to reuse foreign keys, and the ledger's meaning is fully
 * captured by date/type/amount/method/note/tags.
 *
 * Version 3 added tags. Older files simply have none, which reads as an empty set - so a
 * version 1 or 2 backup still restores exactly as it did before.
 */

import { amountToPaise, paiseToExportString } from '@/lib/calculations/money';
import { sortChronological } from '@/lib/calculations/balance';
import type { Person, Transaction } from '@/types/transaction';

export const BACKUP_FORMAT = 'potli-backup';
export const BACKUP_VERSION = 3;

export interface BackupTransaction {
  /** The person by name: ids are meaningless in another project or account. */
  person: string;
  person_relationship: string;
  transaction_date: string;
  type: string;
  amount: string;
  method: string;
  note: string | null;
  tags: string[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  transaction_count: number;
  transactions: BackupTransaction[];
}

export function buildBackup(
  transactions: readonly Transaction[],
  people: readonly Person[],
  exportedAt: string,
): BackupFile {
  const ordered = sortChronological(transactions);
  const byId = new Map(people.map((person) => [person.id, person]));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    transaction_count: ordered.length,
    transactions: ordered.map((transaction) => ({
      person: byId.get(transaction.person_id)?.name ?? 'Unknown',
      person_relationship: byId.get(transaction.person_id)?.relationship ?? 'OTHER',
      transaction_date: transaction.transaction_date,
      type: transaction.type,
      amount: paiseToExportString(amountToPaise(transaction.amount)),
      method: transaction.method,
      note: transaction.note,
      tags: transaction.tags ?? [],
    })),
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}
