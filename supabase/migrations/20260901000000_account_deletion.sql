-- Potli - let a person delete their own account.
--
-- Required by Google Play for any app with sign-in, and right on its own terms: an app
-- holding a year of someone's family money records has to let them leave completely.
--
-- The hard part is that deleting an auth user normally needs the service-role key, and
-- that key must never reach the browser - this app is a static export, so anything it
-- holds is public. A tightly scoped SECURITY DEFINER function is the way round it.
--
-- Run this in the Supabase SQL editor after 20260831000000_tags_recurring_trends.sql.

create or replace function public.delete_my_account()
returns void
language plpgsql
-- SECURITY DEFINER, deliberately and narrowly. Every statement below is keyed to
-- auth.uid() and there is no parameter, so there is nothing for a caller to influence:
-- the only account this can ever delete is the one making the call. An empty search_path
-- stops a planted function on someone else's path being resolved instead of the real one.
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not signed in';
  end if;

  -- Explicit order, not the cascade from auth.users. `transactions.person_id` is
  -- ON DELETE RESTRICT, so a cascade that reached `people` before `transactions` would
  -- abort the whole deletion - and a delete-my-account button that sometimes fails is
  -- worse than none.
  delete from public.transactions where user_id = caller;
  delete from public.recurring_transactions where user_id = caller;
  delete from public.people where user_id = caller;
  delete from auth.users where id = caller;
end;
$$;

comment on function public.delete_my_account is
  'Permanently deletes the calling user and everything they own. Scoped to auth.uid(),
   so it can never touch another account.';

revoke all on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
