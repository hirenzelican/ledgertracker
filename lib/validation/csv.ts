/**
 * CSV import.
 *
 * The point of this is not to read the file this app writes - a JSON backup already does
 * that. It is to read a file someone has *edited*, in Excel or Google Sheets or a bank
 * export they reshaped by hand. So it is deliberately forgiving about everything that
 * does not change meaning, and unforgiving about everything that does:
 *
 *   forgiven   column order, letter case in headers, a UTF-8 BOM, CRLF or LF, blank
 *              lines, `Rs.`/`₹`/commas inside amounts, a missing Tags or Note column,
 *              d/m/y dates, and plain-language type names
 *   refused    an unreadable date, an unknown type or method, a non-positive amount,
 *              a missing person - anything where guessing would invent a number
 *
 * Rows are validated into exactly the same `BackupRowInput` the JSON importer produces,
 * so both paths share one insert, one duplicate check and one set of guarantees.
 */

import { MAX_AMOUNT_PAISE, amountToPaise } from '@/lib/calculations/money';
import { isIsoDate } from '@/lib/format/date';
import { MAX_NOTE_LENGTH, sanitizeNote } from './transaction';
import { normaliseTags } from './tags';
import { fingerprint, fingerprintExisting, type BackupRowInput, type ParsedBackup } from './backup';
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

export const MAX_CSV_ROWS = 10_000;

export type CsvParseResult =
  | { ok: true; value: ParsedBackup }
  | { ok: false; message: string };

/**
 * Splits CSV text into rows of fields, honouring quotes.
 *
 * Written out rather than pulled in because the rules are small and the failure mode of
 * a naive `split(',')` is silent: a note containing a comma shifts every column after it,
 * and the row still imports - just with the amount in the method column.
 */
export function parseCsv(text: string): string[][] {
  // A BOM is invisible and would otherwise become part of the first header's name.
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Ends the row, and swallows the \n of a \r\n pair.
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline should not become a row of one empty field.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Header names this importer understands, beyond the exact ones it writes. */
const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'transaction_date', 'when', 'day'],
  person: ['person', 'name', 'contact', 'who'],
  relationship: ['relationship', 'relation'],
  type: ['type', 'direction', 'kind'],
  amount: ['amount', 'value', 'rupees', 'rs', 'inr'],
  method: ['method', 'payment method', 'payment_method', 'mode', 'paid by'],
  note: ['note', 'notes', 'description', 'remark', 'remarks', 'details'],
  tags: ['tags', 'tag', 'labels', 'category', 'categories'],
};

function mapHeaders(header: readonly string[]): Partial<Record<string, number>> {
  const found: Partial<Record<string, number>> = {};
  header.forEach((raw, index) => {
    const name = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (found[key] === undefined && aliases.includes(name)) found[key] = index;
    }
  });
  return found;
}

/**
 * Plain-language type names, so a hand-written sheet does not have to shout RECEIVED.
 * These mirror the four labels the app itself uses.
 */
const TYPE_WORDS: Record<string, TransactionType> = {
  received: 'RECEIVED',
  'they gave me': 'RECEIVED',
  in: 'RECEIVED',
  credit: 'RECEIVED',
  returned: 'RETURNED',
  'i gave back': 'RETURNED',
  out: 'RETURNED',
  debit: 'RETURNED',
  lent: 'LENT',
  'i lent them': 'LENT',
  loan: 'LENT',
  repaid: 'REPAID',
  'they paid back': 'REPAID',
  repayment: 'REPAID',
};

const METHOD_WORDS: Record<string, PaymentMethod> = {
  google_pay: 'GOOGLE_PAY',
  'google pay': 'GOOGLE_PAY',
  gpay: 'GOOGLE_PAY',
  upi: 'GOOGLE_PAY',
  'google pay / upi': 'GOOGLE_PAY',
  cash: 'CASH',
  bank_transfer: 'BANK_TRANSFER',
  'bank transfer': 'BANK_TRANSFER',
  bank: 'BANK_TRANSFER',
  neft: 'BANK_TRANSFER',
  imps: 'BANK_TRANSFER',
  cheque: 'OTHER',
  other: 'OTHER',
};

/**
 * Reads a date in the formats a spreadsheet actually produces. Day-first for the
 * ambiguous ones, because this app is written for India and 03/04/2026 there means the
 * third of April. ISO input is unambiguous and is read as written.
 */
export function parseFlexibleDate(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;
  if (isIsoDate(value)) return value;

  const parts = value.split(/[/.\-]/).map((part) => part.trim());
  if (parts.length !== 3) return null;

  let [first = '', second = '', third = ''] = parts;
  // A four-digit leading part can only be a year, so that form is year-first.
  if (first.length === 4) {
    [first, second, third] = [third, second, first];
  }
  const day = Number(first);
  const month = Number(second);
  let year = Number(third);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 100) year += year < 70 ? 2000 : 1900;

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Strips the decoration a person or a spreadsheet adds: ₹, Rs., grouping commas, spaces. */
export function cleanAmount(raw: string): string {
  return raw
    .replace(/[₹\s]/g, '')
    .replace(/^rs\.?/i, '')
    .replace(/,/g, '')
    .replace(/^\((.*)\)$/, '-$1')
    .trim();
}

export function parseCsvImport(
  rawText: string,
  existing: readonly Transaction[],
  people: readonly Person[] = [],
): CsvParseResult {
  const rows = parseCsv(rawText);
  if (rows.length === 0) {
    return { ok: false, message: 'That file is empty.' };
  }
  if (rows.length - 1 > MAX_CSV_ROWS) {
    return {
      ok: false,
      message: `That file has more than ${MAX_CSV_ROWS.toLocaleString('en-IN')} rows.`,
    };
  }

  const columns = mapHeaders(rows[0]!);
  const required = ['date', 'amount', 'type'] as const;
  const missing = required.filter((name) => columns[name] === undefined);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `That file needs a column for ${missing.join(', ')}. The first row must be the column names.`,
    };
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const existingFingerprints = new Set(
    existing.map((transaction) => fingerprintExisting(transaction, peopleById)),
  );
  const seenInFile = new Set<string>();
  const newTransactions: BackupRowInput[] = [];
  const duplicates: BackupRowInput[] = [];

  const cell = (row: readonly string[], key: string): string => {
    const index = columns[key];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  for (const [offset, row] of rows.slice(1).entries()) {
    const position = offset + 2; // The header is row 1, as a spreadsheet numbers it.

    const date = parseFlexibleDate(cell(row, 'date'));
    if (date === null) {
      return {
        ok: false,
        message: `Row ${position}: "${cell(row, 'date')}" is not a date this can read. Use 2026-08-25 or 25/08/2026.`,
      };
    }

    const typeWord = cell(row, 'type').toLowerCase();
    const type = isTransactionType(typeWord.toUpperCase())
      ? (typeWord.toUpperCase() as TransactionType)
      : TYPE_WORDS[typeWord];
    if (!type) {
      return {
        ok: false,
        message: `Row ${position}: "${cell(row, 'type')}" is not a kind of entry. Use received, returned, lent or repaid.`,
      };
    }

    const methodWord = cell(row, 'method').toLowerCase();
    // A missing method column is not an error - OTHER is honest about not knowing how the
    // money moved, where guessing "cash" would put a fact in the ledger nobody stated.
    const method = methodWord === ''
      ? 'OTHER'
      : isPaymentMethod(methodWord.toUpperCase())
        ? (methodWord.toUpperCase() as PaymentMethod)
        : METHOD_WORDS[methodWord];
    if (method === undefined) {
      return {
        ok: false,
        message: `Row ${position}: "${cell(row, 'method')}" is not a payment method. Use cash, google pay, bank transfer or other.`,
      };
    }

    let amountPaise: number;
    try {
      amountPaise = amountToPaise(cleanAmount(cell(row, 'amount')));
    } catch {
      return { ok: false, message: `Row ${position}: "${cell(row, 'amount')}" is not an amount.` };
    }
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return {
        ok: false,
        message: `Row ${position}: the amount must be above zero. Direction is carried by the type, not by a minus sign.`,
      };
    }
    if (amountPaise > MAX_AMOUNT_PAISE) {
      return { ok: false, message: `Row ${position}: that amount is too large to store.` };
    }

    const personName = cell(row, 'person').slice(0, 60);
    if (personName === '') {
      return {
        ok: false,
        message: `Row ${position}: every entry needs a person. Add a Person column naming who the money belongs to.`,
      };
    }

    const note = sanitizeNote(cell(row, 'note'));
    if (note.length > MAX_NOTE_LENGTH) {
      return { ok: false, message: `Row ${position}: the note is too long.` };
    }

    const relationshipWord = cell(row, 'relationship').toUpperCase();
    const input: BackupRowInput = {
      personName,
      personRelationship: isRelationship(relationshipWord)
        ? (relationshipWord as Relationship)
        : 'OTHER',
      transaction_date: date,
      type,
      amountPaise,
      method,
      note,
      tags: normaliseTags(cell(row, 'tags').split(/[,;]/)),
    };

    const key = fingerprint(input);
    if (existingFingerprints.has(key) || seenInFile.has(key)) {
      duplicates.push(input);
    } else {
      seenInFile.add(key);
      newTransactions.push(input);
    }
  }

  return { ok: true, value: { newTransactions, duplicates, exportedAt: null } };
}
