/**
 * Validation for a contact's details.
 *
 * The bar is deliberately low for everything except the name. A phone number that
 * reaches the person is the only test that matters, and phone numbers differ enough
 * between countries that rejecting a real one is a worse failure than storing an odd
 * one. So: shape and length only, never a plausibility judgement.
 */

import { sanitizeNote } from './transaction';
import type { Translate } from '@/lib/i18n/locales';
import { RELATIONSHIPS, type PersonInput, type Relationship } from '@/types/transaction';

export const MAX_NAME_LENGTH = 60;
export const MAX_PHONE_LENGTH = 24;
export const MAX_EMAIL_LENGTH = 120;
export const MAX_PERSON_NOTE_LENGTH = 200;

/** Digits, with the punctuation people actually type: +91 (022) 555-0100. */
const PHONE_SHAPE = /^\+?[0-9 ()-]+$/;

/** One "@" with something either side and a dot in the domain. Anything stricter rejects
 * addresses that work. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type PersonField = 'name' | 'phone' | 'email' | 'note';

export type PersonValidation =
  | { ok: true; value: PersonInput }
  | { ok: false; errors: Partial<Record<PersonField, string>> };

export interface RawPersonForm {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  note: string;
}

/**
 * Reduces a typed phone number to what is needed to dial it: digits, and a leading `+`
 * for an international number. Used for `tel:` and WhatsApp links, never for storage -
 * what the user typed is what they see again when they come back to edit it.
 */
export function dialableDigits(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Digits only, for a wa.me link. Empty when there is nothing dialable. */
export function whatsappNumber(phone: string | null, defaultCountryCode = '91'): string {
  if (!phone) return '';
  const dialable = dialableDigits(phone);
  if (dialable === '') return '';
  if (dialable.startsWith('+')) return dialable.slice(1);
  // A bare 10-digit number in an app written for India is an Indian mobile.
  return dialable.length === 10 ? `${defaultCountryCode}${dialable}` : dialable;
}

export function validatePersonForm(form: RawPersonForm, t: Translate): PersonValidation {
  const errors: Partial<Record<PersonField, string>> = {};

  const name = form.name.trim().replace(/\s+/g, ' ');
  if (name === '') {
    errors.name = t('people.nameRequired');
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = t('people.nameTooLong', { max: MAX_NAME_LENGTH });
  }

  const relationship: Relationship = (RELATIONSHIPS as readonly string[]).includes(
    form.relationship,
  )
    ? (form.relationship as Relationship)
    : 'OTHER';

  const phone = form.phone.trim();
  if (phone !== '') {
    // Four is the shortest real short-code; anything shorter is a slip.
    if (!PHONE_SHAPE.test(phone) || dialableDigits(phone).replace('+', '').length < 4) {
      errors.phone = t('people.phoneInvalid');
    } else if (phone.length > MAX_PHONE_LENGTH) {
      errors.phone = t('people.phoneTooLong', { max: MAX_PHONE_LENGTH });
    }
  }

  const email = form.email.trim();
  if (email !== '') {
    if (!EMAIL_SHAPE.test(email)) {
      errors.email = t('people.emailInvalid');
    } else if (email.length > MAX_EMAIL_LENGTH) {
      errors.email = t('people.emailTooLong', { max: MAX_EMAIL_LENGTH });
    }
  }

  const note = sanitizeNote(form.note);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, relationship, phone, email, note } };
}
