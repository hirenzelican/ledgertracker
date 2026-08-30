/**
 * Backup import validation.
 *
 * Uploaded JSON is untrusted input: it is parsed defensively, every field is checked
 * against the same rules the database enforces, and nothing is inserted unless the
 * whole file is well-formed. Rows that duplicate an existing transaction are reported
 * separately so the user can decide what to do.
 */

import { MAX_AMOUNT_PAISE, amountToPaise } from '@/lib/calculations/money';
import { isIsoDate } from '@/lib/format/date';
import { BACKUP_FORMAT } from '@/lib/export/backup';
import { MAX_NOTE_LENGTH, sanitizeNote } from './transaction';
import { normaliseTags } from './tags';
import {
  isPaymentMethod,
  isRelationship,
  isTransactionType,
  type PaymentMethod,
  type Person,
  type Relationship,
  type Transaction,
  type TransactionType,
} from '@/types/transaction';

/** Hard cap so a malformed or hostile file cannot lock up the browser. */
export const MAX_BACKUP_TRANSACTIONS = 10_000;

/**
 * A validated backup row. The person is carried by name because ids mean nothing
 * outside the project that produced them; the importer maps names onto real people.
 */
export interface BackupRowInput {
  personName: string;
  personRelationship: Relationship;
  transaction_date: string;
  type: TransactionType;
  amountPaise: number;
  method: PaymentMethod;
  note: string;
  tags: string[];
}

export interface ParsedBackup {
  /** Rows that are valid and not already present in the ledger. */
  newTransactions: BackupRowInput[];
  /** Rows that exactly match an existing transaction; skipped by default. */
  duplicates: BackupRowInput[];
  exportedAt: string | null;
}

/** Backups written before people existed all belong to the one person there was. */
const LEGACY_PERSON_NAME = 'Mother';

export type BackupParseResult =
  | { ok: true; value: ParsedBackup }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Identity used for duplicate detection: same day, direction, amount, method and note.
 * Exported so the CSV importer decides "already there" by exactly the same rule - two
 * definitions would mean a row that is a duplicate on one path and not on the other.
 */
export function fingerprint(input: {
  personName: string;
  transaction_date: string;
  type: string;
  amountPaise: number;
  method: string;
  note: string;
}): string {
  return [
    input.personName.trim().toLowerCase(),
    input.transaction_date,
    input.type,
    input.amountPaise,
    input.method,
    input.note,
  ].join('|');
}

export function fingerprintExisting(
  transaction: Transaction,
  peopleById: ReadonlyMap<string, Person>,
): string {
  return fingerprint({
    personName: peopleById.get(transaction.person_id)?.name ?? '',
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
  people: readonly Person[] = [],
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

  // The app was called Mother's Money before it handled more than one person.
  const KNOWN_FORMATS = [BACKUP_FORMAT, 'mothers-money-backup'];
  if (parsed.format !== undefined && !KNOWN_FORMATS.includes(String(parsed.format))) {
    return { ok: false, message: 'That backup was not created by Potli.' };
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

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const existingFingerprints = new Set(
    existing.map((transaction) => fingerprintExisting(transaction, peopleById)),
  );
  const seenInFile = new Set<string>();
  const newTransactions: BackupRowInput[] = [];
  const duplicates: BackupRowInput[] = [];

  for (const [index, row] of rows.entries()) {
    const position = index + 1;
    if (!isRecord(row)) {
      return { ok: false, message: `Transaction ${position} in the backup is not valid.` };
    }

    const {
      transaction_date: date,
      type,
      amount,
      method,
      note,
      tags,
      person,
      person_relationship: personRelationship,
    } = row;

    // Absent in backups written before version 3, which is not an error - those ledgers
    // simply had no tags.
    if (tags !== undefined && !Array.isArray(tags)) {
      return { ok: false, message: `Transaction ${position} has invalid tags.` };
    }
    const cleanTags = normaliseTags(
      Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
    );

    if (person !== undefined && (typeof person !== 'string' || person.trim() === '')) {
      return { ok: false, message: `Transaction ${position} has an invalid person.` };
    }
    const personName = typeof person === 'string' ? person.trim().slice(0, 60) : LEGACY_PERSON_NAME;

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

    const input: BackupRowInput = {
      personName,
      personRelationship: isRelationship(personRelationship) ? personRelationship : 'OTHER',
      transaction_date: date,
      type,
      amountPaise,
      method,
      note: cleanNote,
      tags: cleanTags,
    };

    const key = fingerprint(input);
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
