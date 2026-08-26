/**
 * Input validation. Runs before anything is sent to Supabase so the user gets a clear
 * message instead of a CHECK-constraint error. The database constraints remain the
 * authoritative guard - this layer is for friendliness, not for security.
 */

import { MAX_AMOUNT_PAISE, formatRupees, parseAmountInput } from '@/lib/calculations/money';
import { isIsoDate } from '@/lib/format/date';
import {
  isPaymentMethod,
  isTransactionType,
  type PaymentMethod,
  type TransactionInput,
  type TransactionType,
} from '@/types/transaction';

export const MAX_NOTE_LENGTH = 200;

export type FieldName = 'amount' | 'transaction_date' | 'type' | 'method' | 'note' | 'person';

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Partial<Record<FieldName, string>> };

export interface RawTransactionForm {
  person_id: string;
  amount: string;
  transaction_date: string;
  type: string;
  method: string;
  note: string;
}

/**
 * Strips control characters and collapses whitespace in a note. Notes are rendered as
 * text (never as HTML) by React, so this is about storing tidy data rather than
 * defusing markup.
 */
export function sanitizeNote(note: string): string {
  return note
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOTE_LENGTH);
}

export function validateTransactionForm(
  form: RawTransactionForm,
): ValidationResult<TransactionInput> {
  const errors: Partial<Record<FieldName, string>> = {};

  const amountPaise = parseAmountInput(form.amount);
  if (amountPaise === null) {
    errors.amount = 'Enter a valid amount, for example 1250.50.';
  } else if (amountPaise === 0) {
    errors.amount = 'Amount must be more than zero.';
  } else if (amountPaise > MAX_AMOUNT_PAISE) {
    errors.amount = `Amount cannot be more than ${formatRupees(MAX_AMOUNT_PAISE)}.`;
  }

  if (!isIsoDate(form.transaction_date)) {
    errors.transaction_date = 'Choose a valid date.';
  }

  if (!isTransactionType(form.type)) {
    errors.type = 'Choose whether this money was received or returned.';
  }

  if (!isPaymentMethod(form.method)) {
    errors.method = 'Choose how the money moved.';
  }

  if (form.person_id.trim() === '') {
    errors.person = 'Choose whose money this is.';
  }

  if (form.note.trim().length > MAX_NOTE_LENGTH) {
    errors.note = `Note cannot be longer than ${MAX_NOTE_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0 || amountPaise === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      person_id: form.person_id,
      amountPaise,
      transaction_date: form.transaction_date,
      type: form.type as TransactionType,
      method: form.method as PaymentMethod,
      note: sanitizeNote(form.note),
    },
  };
}
