/**
 * Backup import validation.
 *
 * Uploaded JSON is untrusted input: it is parsed defensively, every field is checked
 * against the same rules the database enforces, and nothing is inserted unless the
 * whole file is well-formed. Rows that duplicate an existing transaction are reported
 * separately so the user can decide what to do.
 */

import { MAX_AMOUNT_PAISE, amountToPaise } from '@/lib/calculations/money';
import { firstNegativeBalanceDate, type LedgerEntryLike } from '@/lib/calculations/balance';
import { isIsoDate } from '@/lib/format/date';
import { BACKUP_FORMAT } from '@/lib/export/backup';
import { MAX_NOTE_LENGTH, sanitizeNote } from './transaction';
import {
  isPaymentMethod,
  isTransactionType,
  type Transaction,
  type TransactionInput,
} from '@/types/transaction';

/** Hard cap so a malformed or hostile file cannot lock up the browser. */
export const MAX_BACKUP_TRANSACTIONS = 10_000;

export interface ParsedBackup {
  /** Rows that are valid and not already present in the ledger. */
  newTransactions: TransactionInput[];
  /** Rows that exactly match an existing transaction; skipped by default. */
  duplicates: TransactionInput[];
  exportedAt: string | null;
}

export type BackupParseResult =
  | { ok: true; value: ParsedBackup }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Identity used for duplicate detection: same day, direction, amount, method and note. */
function fingerprint(input: {
  transaction_date: string;
  type: string;
  amountPaise: number;
  method: string;
  note: string;
}): string {
  return [input.transaction_date, input.type, input.amountPaise, input.method, input.note].join(
    '|',
  );
}

export function fingerprintExisting(transaction: Transaction): string {
  return fingerprint({
    transaction_date: transaction.transaction_date,
    type: transaction.type,
    amountPaise: amountToPaise(transaction.amount),
    method: transaction.method,
    note: transaction.note ?? '',
  });
}

/**
 * Parses and validates raw backup text against the current ledger.
 * Returns a friendly message describing the first problem found.
 */
export function parseBackup(
  rawText: string,
  existing: readonly Transaction[],
): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, message: 'That file is not valid JSON. Choose a backup file exported by this app.' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, message: 'That backup file is not in the expected format.' };
  }

  if (parsed.format !== undefined && parsed.format !== BACKUP_FORMAT) {
    return { ok: false, message: 'That backup was not created by Mother’s Money.' };
  }

  const rows = parsed.transactions;
  if (!Array.isArray(rows)) {
    return { ok: false, message: 'That backup file does not contain a list of transactions.' };
  }
  if (rows.length > MAX_BACKUP_TRANSACTIONS) {
    return {
      ok: false,
      message: `That backup contains more than ${MAX_BACKUP_TRANSACTIONS.toLocaleString('en-IN')} transactions.`,
    };
  }

  const existingFingerprints = new Set(existing.map(fingerprintExisting));
  const seenInFile = new Set<string>();
  const newTransactions: TransactionInput[] = [];
  const duplicates: TransactionInput[] = [];

  for (const [index, row] of rows.entries()) {
    const position = index + 1;
    if (!isRecord(row)) {
      return { ok: false, message: `Transaction ${position} in the backup is not valid.` };
    }

    const { transaction_date: date, type, amount, method, note } = row;

    if (typeof date !== 'string' || !isIsoDate(date)) {
      return { ok: false, message: `Transaction ${position} has an invalid date.` };
    }
    if (!isTransactionType(type)) {
      return {
        ok: false,
        message: `Transaction ${position} has an unknown type. Expected RECEIVED or RETURNED.`,
      };
    }
    if (!isPaymentMethod(method)) {
      return { ok: false, message: `Transaction ${position} has an unknown payment method.` };
    }

    let amountPaise: number;
    try {
      // One parser for both forms; multiplying a float by 100 here would have been a
      // second, less careful implementation of the same conversion.
      amountPaise =
        typeof amount === 'number' ? amountToPaise(amount) : amountToPaise(String(amount ?? ''));
    } catch {
      return { ok: false, message: `Transaction ${position} has an invalid amount.` };
    }
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return { ok: false, message: `Transaction ${position} has an amount that is not above zero.` };
    }
    if (amountPaise > MAX_AMOUNT_PAISE) {
      return { ok: false, message: `Transaction ${position} has an amount that is too large.` };
    }

    if (note !== null && note !== undefined && typeof note !== 'string') {
      return { ok: false, message: `Transaction ${position} has an invalid note.` };
    }
    const cleanNote = sanitizeNote(typeof note === 'string' ? note : '').slice(0, MAX_NOTE_LENGTH);

    const input: TransactionInput = {
      transaction_date: date,
      type,
      amountPaise,
      method,
      note: cleanNote,
    };

    const key = fingerprint({ ...input, note: cleanNote });
    if (existingFingerprints.has(key) || seenInFile.has(key)) {
      duplicates.push(input);
    } else {
      seenInFile.add(key);
      newTransactions.push(input);
    }
  }

  const exportedAt =
    typeof parsed.exported_at === 'string' ? parsed.exported_at : null;

  return { ok: true, value: { newTransactions, duplicates, exportedAt } };
}

/**
 * A restore must leave the ledger in a valid state: the running balance may never dip
 * below zero at any point in the merged history.
 */
export function findNegativeBalancePoint(
  merged: readonly LedgerEntryLike[],
): { date: string } | null {
  const date = firstNegativeBalanceDate(merged);
  return date === null ? null : { date };
}
