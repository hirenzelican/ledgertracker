-- Potli - track money held for more than one person.
--
-- Adds a `people` table and attaches every transaction to one of them. Safe to run on a
-- database that already holds transactions: existing rows are moved onto a single
-- person so no history is lost, and only then is the column made mandatory.
--
-- Run this in the Supabase SQL editor after the initial migration.

create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name         text not null,
  -- A label such as MOTHER or FRIEND. Free-form beyond the suggested set would invite
  -- typos, and the app offers OTHER for anything the list does not cover.
  relationship text not null default 'OTHER',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint people_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint people_relationship_check check (
    relationship in ('MOTHER', 'FATHER', 'BROTHER', 'SISTER', 'SPOUSE', 'FRIEND', 'OTHER')
  ),
  -- One entry per name per user: two "Mother" rows would split a single balance in two.
  constraint people_unique_name_per_user unique (user_id, name)
);

comment on table public.people is
  'The people whose money is being held. Each transaction belongs to exactly one.';

create index if not exists people_user_idx on public.people (user_id, name);

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

alter table public.people enable row level security;
alter table public.people force row level security;

drop policy if exists "Owner can read own people" on public.people;
create policy "Owner can read own people"
  on public.people for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Owner can insert own people" on public.people;
create policy "Owner can insert own people"
  on public.people for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Owner can update own people" on public.people;
create policy "Owner can update own people"
  on public.people for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owner can delete own people" on public.people;
create policy "Owner can delete own people"
  on public.people for delete to authenticated using (auth.uid() = user_id);

revoke all on public.people from anon;
grant select, insert, update, delete on public.people to authenticated;

-- Attach transactions to a person -----------------------------------------------------
--
-- `on delete restrict` is deliberate: deleting someone who still has history would
-- silently destroy financial records. The app requires the transactions to go first.

alter table public.transactions
  add column if not exists person_id uuid references public.people (id) on delete restrict;

-- Existing history predates this feature and belongs to whoever the ledger was kept for.
-- Give each user one person named "Mother" - the app this grew out of - and move their
-- transactions onto it. Renaming afterwards in the app is a single edit.
do $$
declare
  owner record;
  target_person uuid;
begin
  for owner in
    select distinct user_id from public.transactions where person_id is null
  loop
    insert into public.people (user_id, name, relationship)
    values (owner.user_id, 'Mother', 'MOTHER')
    on conflict (user_id, name) do update set updated_at = now()
    returning id into target_person;

    update public.transactions
      set person_id = target_person
      where user_id = owner.user_id and person_id is null;
  end loop;
end;
$$;

alter table public.transactions alter column person_id set not null;

-- The ledger is read per person, newest history last.
create index if not exists transactions_person_date_idx
  on public.transactions (user_id, person_id, transaction_date, created_at, id);
