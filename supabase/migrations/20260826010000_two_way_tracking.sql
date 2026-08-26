-- Potli - track money in both directions.
--
-- Until now a person's balance could only mean "money of theirs that I am holding".
-- Lending works the other way round: my money, in their hands. Both live on the same
-- axis, so one signed balance per person still tells the whole story:
--
--   balance > 0  I am holding their money
--   balance < 0  they owe me
--   balance = 0  settled
--
-- Two new types join the existing pair. Nothing about stored rows changes, so this is a
-- constraint swap and safe to run on a live database.

alter table public.transactions drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check check (
    type in (
      'RECEIVED',  -- they left money with me           (+)
      'RETURNED',  -- I gave their money back           (-)
      'LENT',      -- I lent them my own money          (-)
      'REPAID'     -- they paid back what they borrowed (+)
    )
  );

comment on column public.transactions.type is
  'RECEIVED and REPAID add to the balance; RETURNED and LENT subtract from it.';
