import { en } from '@/lib/i18n/en';
import type { Translate } from '@/lib/i18n/locales';
import type {
  PaymentMethod,
  Person,
  Relationship,
  Transaction,
  TransactionType,
} from '@/types/transaction';

let sequence = 0;

/** Builds a transaction row the way Postgres would return it. */
export function makeTransaction(overrides: {
  id?: string;
  personId?: string;
  date: string;
  type: TransactionType;
  /** Rupees as a decimal string, e.g. '10000.00'. */
  amount: string;
  method?: PaymentMethod;
  note?: string | null;
  createdAt?: string;
}): Transaction {
  sequence += 1;
  const id = overrides.id ?? `t${String(sequence).padStart(3, '0')}`;
  const createdAt = overrides.createdAt ?? `${overrides.date}T10:${String(sequence % 60).padStart(2, '0')}:00.000Z`;
  return {
    id,
    user_id: 'user-1',
    person_id: overrides.personId ?? 'person-1',
    transaction_date: overrides.date,
    type: overrides.type,
    amount: overrides.amount,
    method: overrides.method ?? 'GOOGLE_PAY',
    note: overrides.note ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

/** A person row as Postgres would return it. */
export function makePerson(
  name: string,
  relationship: Relationship = 'OTHER',
  id = `person-${name.toLowerCase()}`,
): Person {
  return {
    id,
    user_id: 'user-1',
    name,
    relationship,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

export const DEFAULT_PEOPLE: Person[] = [makePerson('Mother', 'MOTHER', 'person-1')];

/** An English translator for tests, matching what `useTranslation` provides at runtime. */
export const t: Translate = (key, values) =>
  (en[key] as string).replace(/\{(\w+)\}/g, (match, name: string) =>
    values && name in values ? String(values[name]) : match,
  );
