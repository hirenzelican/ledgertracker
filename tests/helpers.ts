import type { PaymentMethod, Transaction, TransactionType } from '@/types/transaction';

let sequence = 0;

/** Builds a transaction row the way Postgres would return it. */
export function makeTransaction(overrides: {
  id?: string;
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
    transaction_date: overrides.date,
    type: overrides.type,
    amount: overrides.amount,
    method: overrides.method ?? 'GOOGLE_PAY',
    note: overrides.note ?? null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}
