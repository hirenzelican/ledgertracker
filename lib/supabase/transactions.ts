/**
 * Every read and write against the `transactions` table goes through this module.
 * Keeping database access in one place means the column names, ordering rules and
 * paise conversion exist exactly once.
 */

import { getSupabaseClient } from './client';
import { paiseToRupeeString } from '@/lib/calculations/money';
import type { Transaction, TransactionInput } from '@/types/transaction';

const TABLE = 'transactions';
const COLUMNS =
  'id,user_id,person_id,transaction_date,type,amount,method,note,created_at,updated_at';

/**
 * Loads the whole ledger, oldest first. A personal ledger stays small (hundreds of
 * rows over years), so fetching it once and deriving everything client-side is both
 * simpler and faster than paginated round-trips. The history screen pages through the
 * in-memory list.
 */
export async function fetchTransactions(): Promise<Transaction[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Transaction[];
}

function toRow(input: TransactionInput) {
  return {
    person_id: input.person_id,
    transaction_date: input.transaction_date,
    type: input.type,
    amount: paiseToRupeeString(input.amountPaise),
    method: input.method,
    note: input.note === '' ? null : input.note,
  };
}

export async function insertTransaction(
  input: TransactionInput,
  userId: string,
): Promise<Transaction> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...toRow(input), user_id: userId })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<Transaction> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Bulk insert used by backup restore. Rows are inserted in batches so a large backup
 * does not hit request size limits, and each batch is returned so the caller can
 * refresh from confirmed data rather than assumptions.
 */
export async function insertTransactionsBatch(
  inputs: readonly TransactionInput[],
  userId: string,
  batchSize = 100,
): Promise<Transaction[]> {
  const supabase = getSupabaseClient();
  const inserted: Transaction[] = [];

  for (let start = 0; start < inputs.length; start += batchSize) {
    const batch = inputs.slice(start, start + batchSize).map((input) => ({
      ...toRow(input),
      user_id: userId,
    }));
    const { data, error } = await supabase.from(TABLE).insert(batch).select(COLUMNS);
    if (error) throw error;
    inserted.push(...((data ?? []) as Transaction[]));
  }

  return inserted;
}

/** Removes every transaction belonging to the signed-in user (used by "replace" restore). */
export async function deleteAllTransactions(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) throw error;
}
