/**
 * Data access for the people whose money is being held. Kept beside the transactions
 * module so every table this app touches is reached through one folder.
 */

import { getSupabaseClient } from './client';
import type { Person, PersonInput } from '@/types/transaction';

const TABLE = 'people';
const COLUMNS = 'id,user_id,name,relationship,created_at,updated_at';

export async function fetchPeople(): Promise<Person[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from(TABLE).select(COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as Person[];
}

export async function insertPerson(input: PersonInput, userId: string): Promise<Person> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ name: input.name, relationship: input.relationship, user_id: userId })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Person;
}

export async function updatePerson(id: string, input: PersonInput): Promise<Person> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ name: input.name, relationship: input.relationship })
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
