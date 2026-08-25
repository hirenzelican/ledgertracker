-- Mother's Money - initial schema.
--
-- One table holds the whole ledger. Balances are never stored: they are always derived
-- from these rows, so editing or deleting history cannot corrupt the account.
--
-- Run this in the Supabase SQL editor, or with `supabase db push` if you use the CLI.

create extension if not exists "pgcrypto";

create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  transaction_date date not null,
  type             text not null,
  amount           numeric(12, 2) not null,
  method           text not null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint transactions_type_check check (type in ('RECEIVED', 'RETURNED')),
  constraint transactions_method_check
    check (method in ('GOOGLE_PAY', 'CASH', 'BANK_TRANSFER', 'OTHER')),
  -- Money only ever moves in a positive amount; direction is carried by `type`.
  constraint transactions_amount_positive check (amount > 0),
  constraint transactions_amount_max check (amount <= 9999999999.99),
  constraint transactions_note_length check (note is null or char_length(note) <= 200),
  -- Guards against a clock-skewed or hand-crafted client writing a nonsense date.
  constraint transactions_date_range
    check (transaction_date between date '1970-01-01' and date '2100-12-31')
);

comment on table public.transactions is
  'Money received from and returned to my mother. The single source of truth for the balance.';

-- The ledger is always read in this order: date, then insertion time, then id.
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date, created_at, id);

-- Keeps `updated_at` honest even if a row is changed outside the app.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- Row Level Security ---------------------------------------------------------------
--
-- The browser only ever holds the anon key, so these policies are what actually keeps
-- the ledger private. Without a matching auth.uid() no row is visible or writable, and
-- anonymous requests match nothing at all.

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

drop policy if exists "Owner can read own transactions" on public.transactions;
create policy "Owner can read own transactions"
  on public.transactions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Owner can insert own transactions" on public.transactions;
create policy "Owner can insert own transactions"
  on public.transactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Owner can update own transactions" on public.transactions;
create policy "Owner can update own transactions"
  on public.transactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  -- `with check` stops a row being reassigned to another user during an update.
  with check (auth.uid() = user_id);

drop policy if exists "Owner can delete own transactions" on public.transactions;
create policy "Owner can delete own transactions"
  on public.transactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Defence in depth: `user_id` defaults to the caller, so a client that forgets to send
-- it cannot accidentally write an unowned row.
alter table public.transactions
  alter column user_id set default auth.uid();

revoke all on public.transactions from anon;
grant select, insert, update, delete on public.transactions to authenticated;
