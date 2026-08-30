-- Potli - tags, repeating entries, and trends.
--
-- Three features, one migration, because they share a shape: each needs the database to
-- do work over rows the app deliberately no longer downloads.
--
--   tags                  a label on a transaction, filterable without a note search
--   recurring_transactions a template that becomes a real entry when it falls due
--   monthly_totals        in, out and closing balance per month, for the trends screen
--
-- Balances stay derived. A recurring entry is not a balance - it is a promise to insert a
-- transaction later, and until that transaction exists it counts for nothing.
--
-- Run this in the Supabase SQL editor after 20260830010000_server_side_paging.sql.

-- Tags ---------------------------------------------------------------------------------
--
-- An array rather than a join table. Tags here are labels, not entities with their own
-- lives: nothing hangs off a tag, and a personal ledger has tens of them, not thousands.
-- An array keeps every read a single-table query, which is what makes the paged history
-- stay one round trip.

alter table public.transactions
  add column if not exists tags text[] not null default '{}';

comment on column public.transactions.tags is
  'Free labels such as rent, medical, school. Lower-cased and de-duplicated by the app.';

-- A CHECK cannot contain a subquery, and validating the contents of an array needs one.
-- An immutable function is the way round it: the planner treats the call as a constant
-- expression, so the constraint behaves exactly as an inline check would.
create or replace function public.tags_are_valid(p_tags text[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(btrim(tag) <> '' and char_length(tag) <= 24), true)
  from unnest(p_tags) as tag;
$$;

alter table public.transactions drop constraint if exists transactions_tags_shape;
alter table public.transactions add constraint transactions_tags_shape check (
  coalesce(array_length(tags, 1), 0) <= 10 and public.tags_are_valid(tags)
);

-- Containment queries (`tags @> '{rent}'`) need GIN to avoid reading every row.
create index if not exists transactions_tags_idx on public.transactions using gin (tags);

-- `transaction_ledger` lists its columns explicitly, so adding one to the table does not
-- add it to the view. Recreating it here is not optional: without this the app asks for
-- `tags` from the view, PostgREST answers "column does not exist", and every history
-- screen fails to load. Safe to run again - it is a drop-and-create.
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
  t.tags,
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

revoke all on public.transaction_ledger from anon, public;
grant select on public.transaction_ledger to authenticated;

-- Every tag the user has used, with how often. Drives the picker and the filter chips
-- without downloading a single transaction.
drop view if exists public.tag_counts;
create view public.tag_counts
with (security_invoker = true) as
select t.user_id, tag, count(*) as use_count, max(t.transaction_date) as last_used
from public.transactions t, unnest(t.tags) as tag
group by t.user_id, tag;

comment on view public.tag_counts is 'Distinct tags with usage counts, for the picker.';

-- Repeating entries ---------------------------------------------------------------------
--
-- A template, plus the date it next falls due. Nothing is inserted on a schedule - this is
-- a static app with no server to run a cron - so the entry is created when the app is next
-- opened and the user confirms it. `next_due` is what makes that safe across devices:
-- posting advances it in the same transaction that inserts the row, so two phones opening
-- at once cannot both create it.

create table if not exists public.recurring_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade default auth.uid(),
  person_id        uuid not null references public.people (id) on delete cascade,
  type             text not null,
  amount           numeric(12, 2) not null,
  method           text not null,
  note             text,
  tags             text[] not null default '{}',

  -- How often, and from when. `day_of_month` is carried explicitly so that a rule set on
  -- the 31st still lands on the 30th of a short month rather than drifting to the 1st.
  frequency        text not null,
  day_of_month     smallint,
  start_date       date not null,
  end_date         date,
  next_due         date not null,
  last_posted_date date,
  active           boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint recurring_type_check check (type in ('RECEIVED', 'RETURNED', 'LENT', 'REPAID')),
  constraint recurring_method_check
    check (method in ('GOOGLE_PAY', 'CASH', 'BANK_TRANSFER', 'OTHER')),
  constraint recurring_frequency_check
    check (frequency in ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
  constraint recurring_amount_positive check (amount > 0),
  constraint recurring_amount_max check (amount <= 9999999999.99),
  constraint recurring_note_length check (note is null or char_length(note) <= 200),
  constraint recurring_day_of_month check (day_of_month is null or day_of_month between 1 and 31),
  constraint recurring_dates check (end_date is null or end_date >= start_date)
);

comment on table public.recurring_transactions is
  'Templates that become real transactions when they fall due and the user confirms.';

create index if not exists recurring_due_idx
  on public.recurring_transactions (user_id, active, next_due);

drop trigger if exists recurring_set_updated_at on public.recurring_transactions;
create trigger recurring_set_updated_at
  before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

alter table public.recurring_transactions enable row level security;
alter table public.recurring_transactions force row level security;

drop policy if exists "Owner can read own recurring" on public.recurring_transactions;
create policy "Owner can read own recurring" on public.recurring_transactions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Owner can insert own recurring" on public.recurring_transactions;
create policy "Owner can insert own recurring" on public.recurring_transactions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Owner can update own recurring" on public.recurring_transactions;
create policy "Owner can update own recurring" on public.recurring_transactions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owner can delete own recurring" on public.recurring_transactions;
create policy "Owner can delete own recurring" on public.recurring_transactions
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.recurring_transactions from anon;
grant select, insert, update, delete on public.recurring_transactions to authenticated;

-- Advancing a due date -------------------------------------------------------------------
--
-- Kept in one place because getting it wrong is invisible until a month later. A monthly
-- rule set on the 31st must land on the 30th, then the 28th, then the 31st again - so the
-- intended day is stored and re-applied each time rather than added to the last result.

-- Puts a date on the intended day of its own month, or on the last day when that month is
-- too short. February plus "the 31st" is the 28th, and March is the 31st again.
create or replace function public.clamp_to_month(p_date timestamp, p_day smallint)
returns date
language sql
immutable
as $$
  select case
    when p_day is null then p_date::date
    else (date_trunc('month', p_date)
          + make_interval(days => least(
              p_day,
              extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::int
            ) - 1))::date
  end;
$$;

create or replace function public.next_due_after(
  p_from date,
  p_frequency text,
  p_day_of_month smallint
)
returns date
language sql
immutable
as $$
  select case p_frequency
    when 'WEEKLY' then p_from + interval '7 days'
    when 'FORTNIGHTLY' then p_from + interval '14 days'
    when 'MONTHLY' then public.clamp_to_month(p_from + interval '1 month', p_day_of_month)
    when 'QUARTERLY' then public.clamp_to_month(p_from + interval '3 months', p_day_of_month)
    when 'YEARLY' then public.clamp_to_month(p_from + interval '1 year', p_day_of_month)
  end::date;
$$;

-- Posting what is due --------------------------------------------------------------------
--
-- Inserts every entry that has fallen due and advances each rule past it, in one
-- statement. Atomicity is the point: two devices opening the app at the same moment must
-- not both create the same rent entry.
--
-- A rule that has been missed for months catches up one period at a time, capped so a
-- rule left dormant for years cannot insert hundreds of rows in one go.

create or replace function public.post_due_recurring(p_today date default current_date)
returns setof public.transactions
language plpgsql
as $$
declare
  rule public.recurring_transactions;
  created public.transactions;
  guard int;
begin
  for rule in
    select * from public.recurring_transactions
    where active and next_due <= p_today
    order by next_due
    for update
  loop
    guard := 0;
    while rule.next_due <= p_today
      and (rule.end_date is null or rule.next_due <= rule.end_date)
      and guard < 24
    loop
      insert into public.transactions
        (user_id, person_id, transaction_date, type, amount, method, note, tags)
      values
        (rule.user_id, rule.person_id, rule.next_due, rule.type, rule.amount,
         rule.method, rule.note, rule.tags)
      returning * into created;

      return next created;

      rule.last_posted_date := rule.next_due;
      rule.next_due := public.next_due_after(rule.next_due, rule.frequency, rule.day_of_month);
      guard := guard + 1;
    end loop;

    update public.recurring_transactions
      set next_due = rule.next_due,
          last_posted_date = rule.last_posted_date,
          -- A rule whose end date has passed stops rather than lingering as due forever.
          active = (rule.end_date is null or rule.next_due <= rule.end_date)
      where id = rule.id;
  end loop;
end;
$$;

comment on function public.post_due_recurring is
  'Creates the transactions that have fallen due and advances their rules, atomically.';

revoke all on function public.post_due_recurring(date) from anon, public;
grant execute on function public.post_due_recurring(date) to authenticated;

-- Summary, now aware of tags -------------------------------------------------------------
--
-- `ledger_summary` predates tags, so it would have totalled the unfiltered ledger while
-- the list beside it showed only tagged rows - the screen would have disagreed with
-- itself. Replaced here rather than in the earlier migration so that file stays a record
-- of what was already run.

drop function if exists public.ledger_summary(uuid, text, text, date, date);

create or replace function public.ledger_summary(
  p_person    uuid default null,
  p_direction text default 'ALL',
  p_search    text default null,
  p_from      date default null,
  p_to        date default null,
  p_tags      text[] default null
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
      -- Containment, matching the list's filter exactly: every tag asked for must be on
      -- the row. Anything looser would count rows the screen is not showing.
      and (p_tags is null or cardinality(p_tags) = 0 or tags @> p_tags)
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

revoke all on function public.ledger_summary(uuid, text, text, date, date, text[]) from anon, public;
grant execute on function public.ledger_summary(uuid, text, text, date, date, text[]) to authenticated;

-- Trends ----------------------------------------------------------------------------------
--
-- One row per calendar month: what came in, what went out, and the balance at the end of
-- it. Months with no activity are included, because a gap in a trend line is information
-- and a missing point is a lie about the shape.

create or replace function public.monthly_totals(
  p_person uuid default null,
  p_months int default 12,
  p_today date default current_date
)
returns table (
  month           date,
  money_in        numeric,
  money_out       numeric,
  closing_balance numeric
)
language sql
stable
as $$
  with span as (
    select generate_series(
      date_trunc('month', p_today) - make_interval(months => greatest(p_months, 1) - 1),
      date_trunc('month', p_today),
      interval '1 month'
    )::date as month
  ),
  scoped as (
    select * from public.transactions
    where p_person is null or person_id = p_person
  )
  select
    span.month,
    coalesce((
      select sum(amount) from scoped s
      where date_trunc('month', s.transaction_date) = span.month
        and s.type in ('RECEIVED', 'REPAID')
    ), 0),
    coalesce((
      select sum(amount) from scoped s
      where date_trunc('month', s.transaction_date) = span.month
        and s.type in ('RETURNED', 'LENT')
    ), 0),
    -- Everything up to and including this month, so the line is a balance over time
    -- rather than a series of disconnected monthly nets.
    coalesce((
      select sum(case when s.type in ('RECEIVED', 'REPAID') then s.amount else -s.amount end)
      from scoped s
      where s.transaction_date < (span.month + interval '1 month')::date
    ), 0)
  from span
  order by span.month;
$$;

comment on function public.monthly_totals is
  'Money in, money out and closing balance per month, for the trends screen.';

revoke all on function public.monthly_totals(uuid, int, date) from anon, public;
grant execute on function public.monthly_totals(uuid, int, date) to authenticated;

revoke all on public.tag_counts from anon, public;
grant select on public.tag_counts to authenticated;
