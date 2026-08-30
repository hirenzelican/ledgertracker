/**
 * Data access for the people whose money is being held.
 *
 * Reads go through the `person_balances` view rather than the `people` table, because
 * every screen that lists contacts also shows what each of them is owed or owes. The
 * view does that arithmetic over rows the browser never downloads - one round trip on
 * app open, whether the user has three contacts or three thousand.
 */

import { getSupabaseClient } from './client';
import { amountToPaise } from '@/lib/calculations/money';
import type { Person, PersonBalance, PersonInput } from '@/types/transaction';

const TABLE = 'people';
const VIEW = 'person_balances';
const COLUMNS = 'id,user_id,name,relationship,phone,email,note,created_at,updated_at';
const VIEW_COLUMNS = `${COLUMNS},balance,money_in,money_out,transaction_count,last_transaction_date`;

/** The shape `person_balances` returns. Numerics arrive as JSON numbers. */
interface PersonBalanceRow extends Person {
  balance: string | number;
  money_in: string | number;
  money_out: string | number;
  transaction_count: number;
  last_transaction_date: string | null;
}

/**
 * Empty strings become NULL. A blank-but-present phone number would render as an empty
 * "call" button, which is worse than no button at all.
 */
function toRow(input: PersonInput) {
  const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    name: input.name,
    relationship: input.relationship,
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    note: blankToNull(input.note),
  };
}

/**
 * Every contact with their derived figures, ordered by who is holding the most - the
 * person whose money you hold most of is the one you most need to be reminded about.
 * Ordering happens here rather than in SQL because the rule ("largest holdings, then
 * largest debts, then everyone settled") is a product decision, not a storage one.
 */
export async function fetchPersonBalances(): Promise<PersonBalance[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(VIEW).select(VIEW_COLUMNS).order('name');
  if (error) throw error;

  return ((data ?? []) as PersonBalanceRow[])
    .map((row) => ({
      person: {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        relationship: row.relationship,
        phone: row.phone,
        email: row.email,
        note: row.note,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      balancePaise: amountToPaise(row.balance),
      moneyInPaise: amountToPaise(row.money_in),
      moneyOutPaise: amountToPaise(row.money_out),
      count: Number(row.transaction_count),
      lastTransactionDate: row.last_transaction_date,
    }))
    .sort((a, b) => {
      const weight = (value: number) => (value === 0 ? 1 : 0);
      if (weight(a.balancePaise) !== weight(b.balancePaise)) {
        return weight(a.balancePaise) - weight(b.balancePaise);
      }
      if (a.balancePaise !== b.balancePaise) return b.balancePaise - a.balancePaise;
      return a.person.name.localeCompare(b.person.name);
    });
}

export async function insertPerson(input: PersonInput, userId: string): Promise<Person> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...toRow(input), user_id: userId })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Person;
}

export async function updatePerson(id: string, input: PersonInput): Promise<Person> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update(toRow(input))
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Person;
}

/**
 * Removes a person. The database refuses this while they still have transactions
 * (`on delete restrict`), which is deliberate - deleting someone must never quietly
 * destroy their financial history.
 */
export async function deletePerson(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
