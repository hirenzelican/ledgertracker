-- Potli - post-migration check.
--
-- Paste this whole file into the Supabase SQL editor and run it. It changes nothing; it
-- only reports. Every row should say PASS.
--
-- This checks the things the app actually depends on and that a migration can leave half
-- done: the views and the function existing, running as the *caller* rather than as their
-- owner, being readable by a signed-in user and refused to anon, and PostgREST having
-- noticed they exist at all.

with checks as (

  -- 1. Postgres new enough for `security_invoker`. On 14 and earlier the view migration
  --    would have failed outright, but check explicitly so the answer is never a guess.
  select 1 as ord,
    'PostgreSQL 15 or later' as label,
    case when current_setting('server_version_num')::int >= 150000 then 'PASS' else 'FAIL' end as result,
    current_setting('server_version') as detail

  -- 2. The tables and their new columns.
  union all select 2, 'people has phone, email, note',
    case when count(*) = 3 then 'PASS' else 'FAIL' end,
    coalesce(string_agg(column_name, ', ' order by column_name), 'none found')
  from information_schema.columns
  where table_schema = 'public' and table_name = 'people'
    and column_name in ('phone', 'email', 'note')

  -- 3. The two views exist.
  union all select 3, 'view person_balances exists',
    case when count(*) = 1 then 'PASS' else 'FAIL' end, count(*)::text
  from pg_views where schemaname = 'public' and viewname = 'person_balances'

  union all select 4, 'view transaction_ledger exists',
    case when count(*) = 1 then 'PASS' else 'FAIL' end, count(*)::text
  from pg_views where schemaname = 'public' and viewname = 'transaction_ledger'

  -- 4. THE IMPORTANT ONE. Without security_invoker a view runs as its owner, which
  --    bypasses row-level security on the tables underneath - every user would see
  --    everybody's money, and nothing would look broken.
  union all select 5, 'person_balances runs as the caller (RLS applies)',
    case when c.reloptions::text like '%security_invoker=true%' then 'PASS' else 'FAIL - SECURITY RISK' end,
    coalesce(c.reloptions::text, 'no options set')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'person_balances'

  union all select 6, 'transaction_ledger runs as the caller (RLS applies)',
    case when c.reloptions::text like '%security_invoker=true%' then 'PASS' else 'FAIL - SECURITY RISK' end,
    coalesce(c.reloptions::text, 'no options set')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'transaction_ledger'

  -- 5. The summary function, and that it is NOT security definer - a definer function
  --    would total every user's rows regardless of who called it.
  union all select 7, 'function ledger_summary exists',
    case when count(*) = 1 then 'PASS' else 'FAIL' end, count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ledger_summary'

  union all select 8, 'ledger_summary runs as the caller, not as definer',
    case when bool_and(not p.prosecdef) then 'PASS' else 'FAIL - SECURITY RISK' end,
    case when bool_and(not p.prosecdef) then 'security invoker' else 'security definer' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ledger_summary'

  -- 6. Grants: authenticated can read, anon cannot.
  union all select 9, 'authenticated can read both views',
    case when count(*) = 2 then 'PASS' else 'FAIL' end,
    coalesce(string_agg(table_name, ', ' order by table_name), 'none')
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'
    and table_name in ('person_balances', 'transaction_ledger')

  union all select 10, 'anon is refused both views',
    case when count(*) = 0 then 'PASS' else 'FAIL - SECURITY RISK' end,
    case when count(*) = 0 then 'no grants to anon' else string_agg(table_name, ', ') end
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
    and table_name in ('person_balances', 'transaction_ledger')

  union all select 11, 'anon is refused the transactions table',
    case when count(*) = 0 then 'PASS' else 'FAIL - SECURITY RISK' end,
    case when count(*) = 0 then 'no grants to anon' else string_agg(privilege_type, ', ') end
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon' and table_name in ('transactions', 'people')

  -- 7. RLS still forced on the base tables. The views inherit their protection from here.
  union all select 12, 'row-level security forced on transactions and people',
    case when bool_and(c.relrowsecurity and c.relforcerowsecurity) then 'PASS' else 'FAIL - SECURITY RISK' end,
    string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('transactions', 'people')

  -- 8. The indexes the paged queries rely on. Missing these is slow, not broken.
  union all select 13, 'indexes for paging exist',
    case when count(*) >= 3 then 'PASS' else 'WARN - queries will be slower' end,
    coalesce(string_agg(indexname, ', ' order by indexname), 'none')
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('transactions_user_recent_idx', 'transactions_person_recent_idx',
                      'transactions_note_trgm_idx')

  -- 9. Note search is index-backed only if the trigram extension is present.
  union all select 14, 'pg_trgm installed (for note search)',
    case when count(*) = 1 then 'PASS' else 'WARN - note search will be slow' end,
    coalesce(string_agg(extname || ' in ' || n.nspname, ', '), 'not installed')
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm'
)
select ord as "#", label as "Check", result as "Result", detail as "Detail"
from checks order by ord;

-- Tell PostgREST to re-read the schema. Harmless to run at any time, and the fix if the
-- app reports that a table or function cannot be found.
notify pgrst, 'reload schema';
