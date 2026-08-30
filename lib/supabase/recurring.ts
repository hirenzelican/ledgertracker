/**
 * Repeating entries: the rules, and the act of turning a due one into a real transaction.
 *
 * A rule is a promise, not money. Nothing here is ever added to a balance - only the
 * transactions the database creates from a rule count, and until `postDue` runs they do
 * not exist. That separation is what keeps "balances are always derived" true: a
 * repeating entry cannot inflate a total by existing.
 *
 * Posting happens in the database rather than here because two devices opening the app
 * on the same morning must not both create the rent entry. `post_due_recurring` inserts
 * the row and advances the rule in one statement, so the second device finds nothing due.
 */

import { getSupabaseClient } from './client';
import { paiseToRupeeString } from '@/lib/calculations/money';
import type { Recurrence, RecurrenceInput, Transaction } from '@/types/transaction';

const TABLE = 'recurring_transactions';
const COLUMNS =
  'id,user_id,person_id,type,amount,method,note,tags,frequency,day_of_month,' +
  'start_date,end_date,next_due,last_posted_date,active,created_at,updated_at';

/**
 * The day a monthly rule is meant to land on, taken from its start date. Stored rather
 * than recomputed so a rule set on the 31st comes back to the 31st after February
 * instead of drifting earlier each month.
 */
function dayOfMonthFor(input: RecurrenceInput): number | null {
  if (input.frequency === 'WEEKLY' || input.frequency === 'FORTNIGHTLY') return null;
  return Number(input.start_date.slice(8, 10));
}

function toRow(input: RecurrenceInput) {
  return {
    person_id: input.person_id,
    type: input.type,
    amount: paiseToRupeeString(input.amountPaise),
    method: input.method,
    note: input.note === '' ? null : input.note,
    tags: input.tags,
    frequency: input.frequency,
    day_of_month: dayOfMonthFor(input),
    start_date: input.start_date,
    end_date: input.end_date,
  };
}

export async function fetchRecurrences(): Promise<Recurrence[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    // Soonest first, and paused rules last: what is about to happen matters most.
    .order('active', { ascending: false })
    .order('next_due');
  if (error) throw error;
  return (data ?? []) as unknown as Recurrence[];
}

export async function insertRecurrence(
  input: RecurrenceInput,
  userId: string,
): Promise<Recurrence> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    // A new rule is first due on its start date, including when that is today or past -
    // a rule backdated to the 1st should offer to post the entries it has missed.
    .insert({ ...toRow(input), user_id: userId, next_due: input.start_date })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as Recurrence;
}

export async function updateRecurrence(
  id: string,
  input: RecurrenceInput,
): Promise<Recurrence> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update(toRow(input))
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as Recurrence;
}

/** Pauses or resumes a rule without losing it or its place in the calendar. */
export async function setRecurrenceActive(id: string, active: boolean): Promise<Recurrence> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ active })
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as Recurrence;
}

export async function deleteRecurrence(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Creates every entry that has fallen due, and returns what was created.
 *
 * Safe to call on every app open and safe to call twice: the rule's due date advances in
 * the same statement that inserts the row, so a second call finds nothing. A rule left
 * dormant for years catches up at most two years' worth in one go rather than inserting
 * hundreds of rows at once.
 */
export async function postDueRecurring(): Promise<Transaction[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('post_due_recurring');
  if (error) throw error;
  return (data ?? []) as unknown as Transaction[];
}

/** Rules that would post if `postDueRecurring` ran now. Read-only: nothing is created. */
export function dueNow(rules: readonly Recurrence[], today: string): Recurrence[] {
  return rules.filter(
    (rule) =>
      rule.active &&
      rule.next_due <= today &&
      (rule.end_date === null || rule.next_due <= rule.end_date),
  );
}
