-- Potli - move derived figures into the database so the app can page.
--
-- Until now the app fetched every transaction on open and derived everything in the
-- browser. That is the right trade at a few hundred rows and the wrong one past a few
-- thousand: the payload grows without bound and the phone does the arithmetic.
--
-- Paging the list alone would not have helped, because balances need every row. So the
-- two things that need all the rows move here, where the rows already are:
--
--   person_balances     one row per contact, with their totals
--   transaction_ledger  every transaction, carrying its own running balance
--   ledger_summary      the figures for a filtered view, without fetching it
--
-- Nothing stores a balance. Every figure below is computed from the transactions at read
-- time, so editing history still cannot leave a stale total anywhere.
--
-- Run this in the Supabase SQL editor after 20260830000000_contact_details.sql.
-- Requires PostgreSQL 15 or later for `security_invoker` views (Supabase is on 15+).

-- Case-insensitive note search stays index-backed rather than scanning every row.
create extension if not exists pg_trgm;

-- Per-contact figures -----------------------------------------------------------------
--
-- `security_invoker` makes the view run as the caller, so the row-level security policy
-- on `transactions` and `people` applies exactly as it does to a direct query. Without
-- it the view would run as its owner and hand every user everybody's money.

drop view if exists public.person_balances;
create view public.person_balances
with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.name,
  p.relationship,
  p.phone,
  p.email,
  p.note,
  p.created_at,
  p.updated_at,
  -- RECEIVED and REPAID raise the balance, RETURNED and LENT lower it: the same signed
  -- axis the app uses. Positive means their money is with me.
  coalesce(sum(case when t.type in ('RECEIVED', 'REPAID') then t.amount else -t.amount end), 0)
    as balance,
  coalesce(sum(case when t.type in ('RECEIVED', 'REPAID') then t.amount else 0 end), 0)
    as money_in,
  coalesce(sum(case when t.type in ('RETURNED', 'LENT') then t.amount else 0 end), 0)
    as money_out,
  count(t.id) as transaction_count,
  max(t.transaction_date) as last_transaction_date
from public.people p
  -- LEFT JOIN so a contact with no history yet still appears, at zero.
  left join public.transactions t on t.person_id = p.id
group by p.id, p.user_id, p.name, p.relationship, p.phone, p.email, p.note,
         p.created_at, p.updated_at;

comment on view public.person_balances is
  'Every contact with their derived totals. One round trip replaces fetching the whole
   ledger to add it up in the browser.';

-- The ledger, each row carrying its own running balance -------------------------------
--
-- The window is partitioned per person because each person is a separate pot: a row
-- showing what you hold for your mother must not include what your brother lent you.
-- Computing it here is what makes a page of results self-sufficient - row 900 knows its
-- balance without the browser having seen rows 1 to 899.

drop view if exists public.transaction_ledger;
create view public.transaction_ledger
with (security_invoker = true) as
select
  t.id,
  t.user_id,
  t.person_id,
  t.transaction_date,
  t.type,
  t.amount,
  t.method,
  t.note,
  t.created_at,
  t.updated_at,
  sum(case when t.type in ('RECEIVED', 'REPAID') then t.amount else -t.amount end)
    over (
      partition by t.user_id, t.person_id
      order by t.transaction_date, t.created_at, t.id
      rows between unbounded preceding and current row
    ) as running_balance
from public.transactions t;

comment on view public.transaction_ledger is
  'Transactions with the per-person running balance already applied, so any page of rows
   can be rendered without the ones before it.';

-- Figures for a filtered view ---------------------------------------------------------
--
-- The history screen shows "in X, out Y" for whatever filter is active, and the
-- statement screen needs the balance carried in from before its start date. Both are
-- sums over rows the app deliberately does not download.
--
-- SECURITY INVOKER (the default) is what keeps this safe: row-level security on
-- `transactions` applies to the function body, so it can only ever total the caller's
-- own rows. It must never become SECURITY DEFINER.

create or replace function public.ledger_summary(
  p_person    uuid default null,
  p_direction text default 'ALL',
  p_search    text default null,
  p_from      date default null,
  p_to        date default null
)
returns table (
  money_in        numeric,
  money_out       numeric,
  entry_count     bigint,
  opening_balance numeric
)
language sql
stable
as $$
  with scoped as (
    select *
    from public.transactions
    where (p_person is null or person_id = p_person)
      and (p_search is null or p_search = '' or note ilike '%' || p_search || '%')
  ),
  within as (
    select * from scoped
    where (p_from is null or transaction_date >= p_from)
      and (p_to is null or transaction_date <= p_to)
      and (
        p_direction = 'ALL'
        or (p_direction = 'IN' and type in ('RECEIVED', 'REPAID'))
        or (p_direction = 'OUT' and type in ('RETURNED', 'LENT'))
      )
  )
  select
    coalesce((select sum(amount) from within where type in ('RECEIVED', 'REPAID')), 0),
    coalesce((select sum(amount) from within where type in ('RETURNED', 'LENT')), 0),
    (select count(*) from within),
    -- Everything before the window, whichever direction it went. Zero when the range is
    -- open-ended, because then there is nothing before it.
    case
      when p_from is null then 0
      else coalesce((
        select sum(case when type in ('RECEIVED', 'REPAID') then amount else -amount end)
        from scoped where transaction_date < p_from
      ), 0)
    end;
$$;

comment on function public.ledger_summary is
  'Totals for a filtered slice of the ledger, plus the balance carried in from before it.
   Runs as the caller, so RLS confines it to their own rows.';

-- Indexes for the queries the app now actually makes ----------------------------------

-- The history screen: newest first, across everyone.
create index if not exists transactions_user_recent_idx
  on public.transactions (user_id, transaction_date desc, created_at desc, id desc);

-- The same, narrowed to one contact.
create index if not exists transactions_person_recent_idx
  on public.transactions (user_id, person_id, transaction_date desc, created_at desc, id desc);

-- Note search, so `ilike '%...%'` does not read every row.
create index if not exists transactions_note_trgm_idx
  on public.transactions using gin (note gin_trgm_ops);

-- Access ------------------------------------------------------------------------------
-- Read-only, authenticated-only. Writes still go to the base table, where the existing
-- policies apply.

revoke all on public.person_balances from anon, public;
revoke all on public.transaction_ledger from anon, public;
grant select on public.person_balances to authenticated;
grant select on public.transaction_ledger to authenticated;

revoke all on function public.ledger_summary(uuid, text, text, date, date) from anon, public;
grant execute on function public.ledger_summary(uuid, text, text, date, date) to authenticated;
