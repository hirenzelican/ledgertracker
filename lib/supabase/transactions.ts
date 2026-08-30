/**
 * Every read and write against the `transactions` table goes through this module.
 * Keeping database access in one place means the column names, ordering rules and
 * paise conversion exist exactly once.
 *
 * Reads come from the `transaction_ledger` view, which attaches each row's running
 * balance in SQL. That is what makes paging possible: row 900 arrives knowing its own
 * balance, so the browser never has to have seen rows 1 to 899 to render it.
 */

import { getSupabaseClient } from './client';
import { amountToPaise, paiseToRupeeString } from '@/lib/calculations/money';
import { signedDeltaPaise } from '@/lib/calculations/balance';
import type {
  LedgerPage,
  LedgerQuery,
  LedgerSummary,
  Transaction,
  TransactionInput,
  TransactionWithBalance,
} from '@/types/transaction';

const TABLE = 'transactions';
const VIEW = 'transaction_ledger';
const COLUMNS =
  'id,user_id,person_id,transaction_date,type,amount,method,note,created_at,updated_at';
const VIEW_COLUMNS = `${COLUMNS},running_balance`;

/** A `transaction_ledger` row: a transaction plus the balance that followed it. */
interface LedgerRow extends Transaction {
  running_balance: string | number;
}

function toEntry(row: LedgerRow): TransactionWithBalance {
  const { running_balance, ...transaction } = row;
  return {
    transaction,
    deltaPaise: signedDeltaPaise(transaction.type, amountToPaise(transaction.amount)),
    balanceAfterPaise: amountToPaise(running_balance),
  };
}

/**
 * PostgREST escapes `%` and `_` in a `like` pattern for us, but a comma or a parenthesis
 * would break out of the filter it builds. Dropping them costs a user nothing - nobody
 * searches their notes for a lone bracket - and closes the hole.
 */
function safeSearch(search: string): string {
  return search.trim().replace(/[,()*]/g, ' ').trim();
}

/**
 * One page of history, newest first, with the total number of matching rows.
 *
 * Every part of the query runs in the database. Narrowing by person, direction, date or
 * note text no longer means downloading everything and filtering in the browser, which
 * is the whole point: a ledger with 50,000 rows costs the same to open as one with 50.
 */
export async function fetchLedgerPage(
  query: LedgerQuery,
  page: { offset: number; limit: number },
): Promise<LedgerPage> {
  const supabase = getSupabaseClient();
  let request = supabase.from(VIEW).select(VIEW_COLUMNS, { count: 'exact' });

  if (query.personId !== null) request = request.eq('person_id', query.personId);
  if (query.direction === 'IN') request = request.in('type', ['RECEIVED', 'REPAID']);
  if (query.direction === 'OUT') request = request.in('type', ['RETURNED', 'LENT']);
  if (query.from !== null) request = request.gte('transaction_date', query.from);
  if (query.to !== null) request = request.lte('transaction_date', query.to);

  const needle = safeSearch(query.search);
  if (needle !== '') request = request.ilike('note', `%${needle}%`);

  const { data, error, count } = await request
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);

  if (error) throw error;
  return {
    entries: ((data ?? []) as LedgerRow[]).map(toEntry),
    total: count ?? 0,
  };
}

/**
 * Totals for a filtered slice, and the balance carried in from before it - computed by
 * the database over rows that are deliberately never downloaded. Without this the
 * history screen's "in X, out Y" line and the statement's opening balance would each
 * force a full fetch, undoing the paging above.
 */
export async function fetchLedgerSummary(query: LedgerQuery): Promise<LedgerSummary> {
  const supabase = getSupabaseClient();
  const needle = safeSearch(query.search);
  const { data, error } = await supabase.rpc('ledger_summary', {
    p_person: query.personId,
    p_direction: query.direction,
    p_search: needle === '' ? null : needle,
    p_from: query.from,
    p_to: query.to,
  });

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        money_in: string | number;
        money_out: string | number;
        entry_count: string | number;
        opening_balance: string | number;
      }
    | undefined;

  if (!row) {
    return { moneyInPaise: 0, moneyOutPaise: 0, count: 0, openingBalancePaise: 0 };
  }
  return {
    moneyInPaise: amountToPaise(row.money_in),
    moneyOutPaise: amountToPaise(row.money_out),
    count: Number(row.entry_count),
    openingBalancePaise: amountToPaise(row.opening_balance),
  };
}

/**
 * Every entry matching a query, oldest first. Used only where the whole set is genuinely
 * the point - a CSV export, a backup file, a statement the user asked to see - and never
 * on app open. Batched so one enormous ledger does not become one enormous response.
 */
export async function fetchAllEntries(
  query: LedgerQuery,
  batchSize = 1000,
): Promise<TransactionWithBalance[]> {
  const entries: TransactionWithBalance[] = [];
  for (let offset = 0; ; offset += batchSize) {
    const page = await fetchLedgerPage(query, { offset, limit: batchSize });
    entries.push(...page.entries);
    if (entries.length >= page.total || page.entries.length === 0) break;
  }
  // fetchLedgerPage returns newest first; a statement and a CSV both read oldest first.
  return entries.reverse();
}

/** Every transaction the user has, oldest first. For exports and backups only. */
export async function fetchAllTransactions(): Promise<Transaction[]> {
  const entries = await fetchAllEntries({
    personId: null,
    direction: 'ALL',
    search: '',
    from: null,
    to: null,
  });
  return entries.map((entry) => entry.transaction);
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
