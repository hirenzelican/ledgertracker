/**
 * JSON backup format.
 *
 * A backup carries only the user-owned fields of each transaction. `id`, `user_id` and
 * the timestamps are deliberately excluded: restoring into a different Supabase project
 * or account must not try to reuse foreign keys, and the ledger's meaning is fully
 * captured by date/type/amount/method/note.
 */

import { amountToPaise, paiseToExportString } from '@/lib/calculations/money';
import { sortChronological } from '@/lib/calculations/balance';
import type { Transaction } from '@/types/transaction';

export const BACKUP_FORMAT = 'mothers-money-backup';
export const BACKUP_VERSION = 1;

export interface BackupTransaction {
  transaction_date: string;
  type: string;
  amount: string;
  method: string;
  note: string | null;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  transaction_count: number;
  transactions: BackupTransaction[];
}

export function buildBackup(transactions: readonly Transaction[], exportedAt: string): BackupFile {
  const ordered = sortChronological(transactions);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    transaction_count: ordered.length,
    transactions: ordered.map((transaction) => ({
      transaction_date: transaction.transaction_date,
      type: transaction.type,
      amount: paiseToExportString(amountToPaise(transaction.amount)),
      method: transaction.method,
      note: transaction.note,
    })),
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}
