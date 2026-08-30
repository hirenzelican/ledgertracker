-- Potli - contact details on a person.
--
-- A ledger entry is only half of what you need when the money comes due: the other half
-- is being able to call the person. Phone, email and a free note live beside the name so
-- a contact is a contact, not just a label on a balance.
--
-- Safe to run repeatedly. Existing rows get NULLs, which the app renders as "not set".
--
-- Run this in the Supabase SQL editor after 20260826010000_two_way_tracking.sql.

alter table public.people
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists note  text;

comment on column public.people.phone is
  'Free-form phone number as the user typed it, digits and +()- only. Never validated
   against a carrier: a number that reaches them is the only test that matters.';
comment on column public.people.email is 'Optional email address.';
comment on column public.people.note is
  'Anything worth remembering about this person - "pays back on salary day", an address,
   a second number.';

-- Length caps mirror the client-side validation so a crafted request cannot store more
-- than the UI allows. Shape is deliberately loose: phone numbers differ by country and
-- rejecting a valid one is worse than storing an odd one.
alter table public.people drop constraint if exists people_phone_length;
alter table public.people add constraint people_phone_length
  check (phone is null or char_length(btrim(phone)) between 4 and 24);

alter table public.people drop constraint if exists people_phone_shape;
alter table public.people add constraint people_phone_shape
  check (phone is null or phone ~ '^[+]?[0-9 ()\-]+$');

alter table public.people drop constraint if exists people_email_length;
alter table public.people add constraint people_email_length
  check (email is null or char_length(btrim(email)) between 3 and 120);

-- One "@" with something either side. Anything stricter rejects addresses that work.
alter table public.people drop constraint if exists people_email_shape;
alter table public.people add constraint people_email_shape
  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$');

alter table public.people drop constraint if exists people_note_length;
alter table public.people add constraint people_note_length
  check (note is null or char_length(note) <= 200);

-- Finding a person by their number is how you answer "who is this calling me?".
create index if not exists people_user_phone_idx
  on public.people (user_id, phone)
  where phone is not null;
