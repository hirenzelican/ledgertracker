/**
 * Deleting your own account.
 *
 * The whole operation happens inside one database function, `delete_my_account`, because
 * removing the auth user would otherwise need the service-role key - and this app is a
 * static export, so a key it holds is a key the world holds. The function is scoped to
 * `auth.uid()` and takes no arguments, so the only account it can ever remove is the one
 * asking.
 */

import { getSupabaseClient } from './client';

export async function deleteMyAccount(): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;

  // The session now points at a user that no longer exists. Clearing it locally avoids
  // the app spending the next few seconds retrying requests on behalf of a ghost.
  await supabase.auth.signOut().catch(() => {});
}
