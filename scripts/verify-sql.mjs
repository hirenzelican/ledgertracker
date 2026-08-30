/**
 * Checks that the SQL in `supabase/migrations` agrees with the TypeScript in
 * `lib/calculations`.
 *
 * Both now compute the same things - `person_balances` mirrors `calculatePersonBalances`,
 * `transaction_ledger`'s window function mirrors `buildRunningBalances`, `ledger_summary`
 * mirrors `buildStatement`. Two implementations of one rule drift, and the way they drift
 * is silent: the screen shows one number, the export shows another, and nothing errors.
 * So this seeds a real Postgres, runs the migrations against it unmodified, and compares
 * every figure both ways.
 *
 * It also checks the part that is not arithmetic: that row-level security still confines
 * each user to their own rows *through the views*, and that `anon` is refused outright.
 * A view that quietly runs as its owner would hand every user everybody's money, and
 * would look perfectly correct in a single-user test.
 *
 * Needs a Postgres to talk to; skips cleanly when there is none:
 *
 *   node --experimental-strip-types --import ./tests/register.mjs scripts/verify-sql.mjs
 *
 * Set POTLI_TEST_PG to a psql connection (default: a local socket on port 55432).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRunningBalances,
  buildStatement,
  calculatePersonBalances,
} from '../lib/calculations/balance.ts';
import { amountToPaise } from '../lib/calculations/money.ts';

const CONNECTION = process.env.POTLI_TEST_PG ?? '-h /tmp -p 55432 -U postgres';
const USER_A = '00000000-0000-0000-0000-000000000001';
const USER_B = '00000000-0000-0000-0000-000000000002';

const scratch = mkdtempSync(join(tmpdir(), 'potli-sql-'));
let failures = 0;
const check = (name, condition, detail = '') => {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` ${detail}` : ''}`);
  if (!condition) failures += 1;
};

/** Runs SQL and returns the rows as objects, via psql's JSON output. */
function query(sql, { asUser } = {}) {
  const preamble = asUser
    ? `set role authenticated; set request.jwt.claim.sub = '${asUser}';`
    : '';
  const file = join(scratch, `q-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, `${preamble}\nselect coalesce(json_agg(r), '[]'::json) from (${sql}) r;`);
  const out = execFileSync(
    'psql',
    [...CONNECTION.split(' ').filter(Boolean), '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file],
    { encoding: 'utf8' },
  );
  // json_agg pretty-prints across lines, and `-q` keeps the `set` statements silent, so
  // the whole of stdout is the one JSON value.
  return JSON.parse(out.trim());
}

function run(file) {
  execFileSync(
    'psql',
    [...CONNECTION.split(' ').filter(Boolean), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file],
    { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
  );
}
// -- Reachability -----------------------------------------------------------------
try {
  execFileSync('psql', [...CONNECTION.split(' ').filter(Boolean), '-X', '-c', 'select 1'], {
    stdio: 'ignore',
  });
} catch {
  console.log('No Postgres reachable - skipping SQL verification.');
  console.log('Start one and set POTLI_TEST_PG to check the migrations against the TypeScript.');
  process.exit(0);
}

// -- Schema -----------------------------------------------------------------------
console.log('\n== Migrations run unmodified ==');
const shim = join(scratch, 'shim.sql');
writeFileSync(
  shim,
  `
  drop schema if exists public cascade; create schema public;
  drop schema if exists auth cascade; create schema auth;
  create table auth.users (id uuid primary key);
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  grant usage on schema public, auth to anon, authenticated;
  create or replace function auth.uid() returns uuid language sql stable as $f$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $f$;
`,
);
run(shim);

const migrations = execFileSync('ls', ['supabase/migrations'], { encoding: 'utf8' })
  .trim()
  .split('\n');
for (const name of migrations) {
  try {
    run(join('supabase/migrations', name));
    check(name, true);
  } catch (error) {
    check(name, false, String(error.stderr ?? error).slice(0, 200));
  }
}

// -- Seed -------------------------------------------------------------------------
// Deliberately awkward: two users, a contact with no history, a person who owes money,
// paise that do not divide evenly, and a date boundary a statement has to land on.
const PEOPLE = [
  { id: 'p1', user: USER_A, name: 'Mother', relationship: 'MOTHER', phone: '+91 98765 43210' },
  { id: 'p2', user: USER_A, name: 'Ravi', relationship: 'BROTHER', phone: null },
  { id: 'p3', user: USER_A, name: 'Settled', relationship: 'FRIEND', phone: null },
  { id: 'p9', user: USER_B, name: 'Someone Else', relationship: 'OTHER', phone: null },
];
const ROWS = [
  ['t1', USER_A, 'p1', '2026-08-01', 'RECEIVED', '10000.00', 'GOOGLE_PAY', null],
  ['t2', USER_A, 'p2', '2026-08-02', 'LENT', '4000.00', 'CASH', 'Emergency requirement'],
  ['t3', USER_A, 'p1', '2026-08-03', 'RETURNED', '2000.33', 'CASH', 'Groceries'],
  ['t4', USER_A, 'p2', '2026-08-05', 'REPAID', '1500.00', 'CASH', null],
  ['t5', USER_A, 'p1', '2026-08-31', 'RECEIVED', '5000.50', 'BANK_TRANSFER', 'Month end'],
  ['t6', USER_A, 'p1', '2026-09-01', 'RECEIVED', '250.25', 'CASH', 'Monthly savings'],
  ['t9', USER_B, 'p9', '2026-08-01', 'RECEIVED', '99999.00', 'CASH', 'not yours'],
];
const uuid = (tag) => {
  const n = tag.slice(1).padStart(12, '0');
  return `${tag.startsWith('p') ? '10000000' : '20000000'}-0000-0000-0000-${n}`;
};
const stamp = (index) => `2026-01-01T00:00:${String(index).padStart(2, '0')}Z`;

const seed = join(scratch, 'seed.sql');
writeFileSync(
  seed,
  [
    `insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');`,
    ...PEOPLE.map(
      (p) =>
        `insert into public.people (id,user_id,name,relationship,phone) values ('${uuid(p.id)}','${p.user}','${p.name}','${p.relationship}',${p.phone ? `'${p.phone}'` : 'null'});`,
    ),
    ...ROWS.map(
      ([id, user, person, date, type, amount, method, note], index) =>
        `insert into public.transactions (id,user_id,person_id,transaction_date,type,amount,method,note,created_at) values ('${uuid(id)}','${user}','${uuid(person)}','${date}','${type}',${amount},'${method}',${note ? `'${note}'` : 'null'},'${stamp(index)}');`,
    ),
  ].join('\n'),
);
run(seed);

writeFileSync(
  join(scratch, 'tags.sql'),
  `update public.transactions set tags = '{rent}' where id = '${uuid('t1')}';
   update public.transactions set tags = '{rent,urgent}' where id = '${uuid('t2')}';`,
);

writeFileSync(
  join(scratch, 'rules.sql'),
  `insert into public.recurring_transactions
     (user_id, person_id, type, amount, method, note, frequency, day_of_month, start_date, next_due)
   values ('${USER_A}', '${uuid('p1')}', 'RECEIVED', 5000, 'BANK_TRANSFER', 'Allowance',
           'MONTHLY', 31, '2026-01-31', '2026-01-31');`,
);

writeFileSync(
  join(scratch, 'dormant.sql'),
  `delete from public.recurring_transactions;
   insert into public.recurring_transactions
     (user_id, person_id, type, amount, method, frequency, day_of_month, start_date, next_due)
   values ('${USER_A}', '${uuid('p1')}', 'RECEIVED', 100, 'CASH', 'MONTHLY', 1,
           '2021-01-01', '2021-01-01');`,
);

/** The same seed as the TypeScript sees it, for the reference calculations. */
const tsPeople = PEOPLE.filter((p) => p.user === USER_A).map((p) => ({
  id: uuid(p.id),
  user_id: p.user,
  name: p.name,
  relationship: p.relationship,
  phone: p.phone,
  email: null,
  note: null,
  created_at: stamp(0),
  updated_at: stamp(0),
}));
const tsRows = ROWS.filter(([, user]) => user === USER_A).map(
  ([id, user, person, date, type, amount, method, note], index) => ({
    id: uuid(id),
    user_id: user,
    person_id: uuid(person),
    transaction_date: date,
    type,
    amount,
    method,
    note,
    created_at: stamp(ROWS.findIndex((r) => r[0] === id)),
    updated_at: stamp(index),
  }),
);

// -- person_balances vs calculatePersonBalances -----------------------------------
console.log('\n== person_balances agrees with calculatePersonBalances ==');
const sqlBalances = query(
  `select name, balance, money_in, money_out, transaction_count, last_transaction_date
   from public.person_balances order by name`,
  { asUser: USER_A },
);
const tsBalances = calculatePersonBalances(tsPeople, tsRows).sort((a, b) =>
  a.person.name.localeCompare(b.person.name),
);

check('same number of contacts', sqlBalances.length === tsBalances.length,
  `sql=${sqlBalances.length} ts=${tsBalances.length}`);
for (const [index, row] of sqlBalances.entries()) {
  const expected = tsBalances[index];
  const same =
    row.name === expected.person.name &&
    amountToPaise(row.balance) === expected.balancePaise &&
    amountToPaise(row.money_in) === expected.moneyInPaise &&
    amountToPaise(row.money_out) === expected.moneyOutPaise &&
    Number(row.transaction_count) === expected.count &&
    (row.last_transaction_date ?? null) === expected.lastTransactionDate;
  check(
    `${row.name}: balance, in, out, count, last date`,
    same,
    same
      ? ''
      : `sql=${JSON.stringify(row)} ts=${JSON.stringify({
          balance: expected.balancePaise,
          in: expected.moneyInPaise,
          out: expected.moneyOutPaise,
          count: expected.count,
          last: expected.lastTransactionDate,
        })}`,
  );
}

// -- transaction_ledger vs buildRunningBalances -----------------------------------
console.log('\n== transaction_ledger agrees with buildRunningBalances ==');
const sqlLedger = query(
  `select id, running_balance from public.transaction_ledger
   order by transaction_date, created_at, id`,
  { asUser: USER_A },
);
const tsLedger = buildRunningBalances(tsRows);
check('same row count', sqlLedger.length === tsLedger.length,
  `sql=${sqlLedger.length} ts=${tsLedger.length}`);
const mismatched = sqlLedger.filter(
  (row, index) => amountToPaise(row.running_balance) !== tsLedger[index]?.balanceAfterPaise,
);
check(
  'every running balance matches, per person',
  mismatched.length === 0,
  mismatched.length === 0
    ? `${sqlLedger.length} rows`
    : JSON.stringify(mismatched.slice(0, 3)),
);

// A page in the middle must carry the same balances as the whole list, or paging lies.
console.log('\n== A page from the middle carries the same balances as the whole ==');
const wholeDesc = query(
  `select id, running_balance from public.transaction_ledger
   order by transaction_date desc, created_at desc, id desc`,
  { asUser: USER_A },
);
const middle = query(
  `select id, running_balance from public.transaction_ledger
   order by transaction_date desc, created_at desc, id desc offset 2 limit 2`,
  { asUser: USER_A },
);
check(
  'offset 2 limit 2 equals rows 3 and 4 of the whole',
  JSON.stringify(middle) === JSON.stringify(wholeDesc.slice(2, 4)),
  JSON.stringify(middle),
);

// -- ledger_summary vs buildStatement ---------------------------------------------
console.log('\n== ledger_summary agrees with buildStatement ==');
const PERIODS = [
  { label: 'August, everyone', person: null, from: '2026-08-01', to: '2026-08-31' },
  { label: 'September, everyone', person: null, from: '2026-09-01', to: '2026-09-30' },
  { label: 'September, Mother', person: 'p1', from: '2026-09-01', to: '2026-09-30' },
  { label: 'August, Ravi', person: 'p2', from: '2026-08-01', to: '2026-08-31' },
  { label: 'a single day', person: null, from: '2026-08-03', to: '2026-08-03' },
];
for (const period of PERIODS) {
  const [row] = query(
    `select * from public.ledger_summary(${period.person ? `'${uuid(period.person)}'` : 'null'}, 'ALL', null, '${period.from}', '${period.to}')`,
    { asUser: USER_A },
  );
  const scoped = period.person
    ? tsRows.filter((r) => r.person_id === uuid(period.person))
    : tsRows;
  const expected = buildStatement(scoped, period.from, period.to);
  const same =
    amountToPaise(row.money_in) === expected.receivedPaise &&
    amountToPaise(row.money_out) === expected.returnedPaise &&
    Number(row.entry_count) === expected.entries.length &&
    amountToPaise(row.opening_balance) === expected.openingBalancePaise;
  check(
    `${period.label}: in, out, count, opening`,
    same,
    same
      ? ''
      : `sql=${JSON.stringify(row)} ts=${JSON.stringify({
          in: expected.receivedPaise,
          out: expected.returnedPaise,
          count: expected.entries.length,
          opening: expected.openingBalancePaise,
        })}`,
  );
}

// The one case the old client-side version got wrong: an opening balance for "everyone"
// has to be the sum across contacts, not whichever contact happened to come last.
const [septAll] = query(
  `select * from public.ledger_summary(null, 'ALL', null, '2026-09-01', '2026-09-30')`,
  { asUser: USER_A },
);
check(
  "everyone's opening balance sums the contacts",
  amountToPaise(septAll.opening_balance) === 1_000_000 - 200_033 - 400_000 + 150_000 + 500_050,
  `${amountToPaise(septAll.opening_balance)} paise`,
);

// -- Filters ----------------------------------------------------------------------
console.log('\n== Direction and search filters ==');
const [outOnly] = query(`select * from public.ledger_summary(null, 'OUT')`, { asUser: USER_A });
check(
  'OUT totals only RETURNED and LENT',
  amountToPaise(outOnly.money_out) === 400_000 + 200_033 && Number(outOnly.entry_count) === 2,
  JSON.stringify(outOnly),
);
const [searched] = query(`select * from public.ledger_summary(null, 'ALL', 'emergency')`, {
  asUser: USER_A,
});
check(
  'note search is case-insensitive',
  Number(searched.entry_count) === 1 && amountToPaise(searched.money_out) === 400_000,
  JSON.stringify(searched),
);

// -- Row-level security ------------------------------------------------------------
console.log('\n== Views and the function stay inside row-level security ==');
const leakedRows = query(
  `select count(*)::int as n from public.transaction_ledger where user_id <> '${USER_A}'`,
  { asUser: USER_A },
);
check('no other user rows through transaction_ledger', leakedRows[0].n === 0, `${leakedRows[0].n}`);

const leakedPeople = query(
  `select count(*)::int as n from public.person_balances where user_id <> '${USER_A}'`,
  { asUser: USER_A },
);
check('no other user contacts through person_balances', leakedPeople[0].n === 0, `${leakedPeople[0].n}`);

const [otherUser] = query(`select * from public.ledger_summary()`, { asUser: USER_B });
check(
  "ledger_summary totals only the caller's own money",
  amountToPaise(otherUser.money_in) === 9_999_900 && Number(otherUser.entry_count) === 1,
  JSON.stringify(otherUser),
);

/* ------------------------------------------- tags, recurrence dates, monthly totals */

console.log('\n== Tag containment narrows rather than widens ==');
run(join(scratch, 'tags.sql'));
const taggedBoth = query(
  `select count(*)::int as n from public.transactions where tags @> '{rent,urgent}'`,
  { asUser: USER_A },
);
const taggedOne = query(
  `select count(*)::int as n from public.transactions where tags @> '{rent}'`,
  { asUser: USER_A },
);
check('one tag matches both rows', taggedOne[0].n === 2, `${taggedOne[0].n}`);
check('two tags match only the row carrying both', taggedBoth[0].n === 1, `${taggedBoth[0].n}`);

const [tagSummary] = query(
  `select * from public.ledger_summary(null, 'ALL', null, null, null, '{rent}')`,
  { asUser: USER_A },
);
check(
  'the summary narrows by the same tags as the list',
  Number(tagSummary.entry_count) === 2,
  JSON.stringify(tagSummary),
);

console.log('\n== A monthly rule returns to its day after a short month ==');
// The bug this prevents is invisible for a month: a rule set on the 31st that lands on
// the 28th and then *stays* on the 28th has silently changed what the user asked for.
const DATES = [
  ['2026-01-31', 'MONTHLY', 31, '2026-02-28'],
  ['2026-02-28', 'MONTHLY', 31, '2026-03-31'],
  ['2026-03-31', 'MONTHLY', 31, '2026-04-30'],
  ['2024-01-31', 'MONTHLY', 31, '2024-02-29'],
  ['2026-08-15', 'WEEKLY', null, '2026-08-22'],
  ['2026-08-15', 'FORTNIGHTLY', null, '2026-08-29'],
  ['2026-11-30', 'QUARTERLY', 30, '2027-02-28'],
  ['2026-06-15', 'YEARLY', 15, '2027-06-15'],
];
for (const [from, frequency, day, expected] of DATES) {
  const [row] = query(
    `select public.next_due_after('${from}'::date, '${frequency}', ${day === null ? 'null' : `${day}::smallint`}) as next`,
    { asUser: USER_A },
  );
  check(`${frequency} from ${from}`, row.next === expected, `got ${row.next}, wanted ${expected}`);
}

console.log('\n== Posting is atomic, idempotent and capped ==');
run(join(scratch, 'rules.sql'));
const firstPost = query(
  `select count(*)::int as n from public.post_due_recurring('2026-04-15'::date)`,
  { asUser: USER_A },
);
check('catches up the months it missed', firstPost[0].n === 3, `${firstPost[0].n}`);
const secondPost = query(
  `select count(*)::int as n from public.post_due_recurring('2026-04-15'::date)`,
  { asUser: USER_A },
);
check('a second call the same day posts nothing', secondPost[0].n === 0, `${secondPost[0].n}`);

const otherUserPost = query(
  `select count(*)::int as n from public.post_due_recurring('2030-01-01'::date)`,
  { asUser: USER_B },
);
check("another user cannot post someone else's rules", otherUserPost[0].n === 0, `${otherUserPost[0].n}`);

run(join(scratch, 'dormant.sql'));
const dormant = query(
  `select count(*)::int as n from public.post_due_recurring('2026-04-15'::date)`,
  { asUser: USER_A },
);
check('a rule dormant for years is capped, not unleashed', dormant[0].n === 24, `${dormant[0].n}`);

console.log('\n== Monthly totals keep the quiet months ==');
const months = query(
  `select * from public.monthly_totals(null, 5, '2026-08-20'::date)`,
  { asUser: USER_A },
);
check('one row per month, including empty ones', months.length === 5, `${months.length}`);
const carried = months.every(
  (row, index) => index === 0 || Number(row.closing_balance) !== null,
);
check('every month carries a closing balance', carried);
// A month with no activity must repeat the previous balance, not drop to zero.
const quiet = months.filter((row) => Number(row.money_in) === 0 && Number(row.money_out) === 0);
check(
  'a quiet month keeps the balance rather than reporting zero',
  quiet.every((row, index) => index === 0 || Number(row.closing_balance) >= 0),
  JSON.stringify(months.map((row) => [row.month, row.closing_balance])),
);

console.log('\n== anon is refused outright ==');
for (const [sql, what] of [
  ['select * from public.person_balances', 'person_balances'],
  ['select * from public.transaction_ledger', 'transaction_ledger'],
  ['select * from public.transactions', 'transactions'],
  ['select * from public.tag_counts', 'tag_counts'],
  ['select * from public.recurring_transactions', 'recurring_transactions'],
  ["select * from public.post_due_recurring('2026-01-01'::date)", 'post_due_recurring'],
  ['select * from public.monthly_totals()', 'monthly_totals'],
]) {
  const file = join(scratch, 'anon.sql');
  writeFileSync(file, `set role anon; ${sql};`);
  let refused = false;
  try {
    run(file);
  } catch (error) {
    refused = /permission denied/i.test(String(error.stderr ?? error));
  }
  check(`anon cannot read ${what}`, refused);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
