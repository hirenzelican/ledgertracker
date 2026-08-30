/**
 * The tags a user has used, from the `tag_counts` view.
 *
 * Counting tags means reading every transaction, so it happens in the database. The
 * picker and the filter chips get a list of tens of rows instead of a ledger.
 */

import { getSupabaseClient } from './client';
import type { TagCount } from '@/types/transaction';

const VIEW = 'tag_counts';

export async function fetchTagCounts(): Promise<TagCount[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(VIEW)
    .select('tag,use_count,last_used')
    // Most-used first: the tags you reach for are the ones you have reached for before.
    .order('use_count', { ascending: false })
    .order('tag');
  if (error) throw error;

  return ((data ?? []) as { tag: string; use_count: number; last_used: string }[]).map((row) => ({
    tag: row.tag,
    count: Number(row.use_count),
    lastUsed: row.last_used,
  }));
}
