import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildRunningBalances,
  buildStatement,
  calculatePersonBalances,
  calculateTotals,
  describePersonBalance,
  summariseStanding,
  forPerson,
  projectedBalancePaise,
  applyChangePaise,
  settlementFor,
  outstandingSince,
  sortChronological,
} from '@/lib/calculations/balance';
import { formatRupees, formatSignedRupees } from '@/lib/calculations/money';
import { buildReminderText } from '@/lib/export/share';
import { makePerson, makeTransaction, t } from './helpers';

/** The worked example from the specification. */
const LEDGER = [
  makeTransaction({ id: 'a', date: '2026-08-20', type: 'RECEIVED', amount: '10000.00' }),
  makeTransaction({ id: 'b', date: '2026-08-22', type: 'RETURNED', amount: '2000.00' }),
  makeTransaction({ id: 'c', date: '2026-08-25', type: 'RECEIVED', amount: '5000.00', method: 'CASH' }),
];

test('balance is received minus returned', () => {
  const totals = calculateTotals(LEDGER);
  assert.equal(formatRupees(totals.moneyInPaise), '₹15,000');
  assert.equal(formatRupees(totals.moneyOutPaise), '₹2,000');
  assert.equal(formatRupees(totals.balancePaise), '₹13,000');
  assert.equal(totals.count, 3);
  assert.equal(totals.lastTransactionDate, '2026-08-25');
});

test('running balance is attached to each transaction in order', () => {
  const running = buildRunningBalances(LEDGER);
  assert.deepEqual(
    running.map((entry) => formatRupees(entry.balanceAfterPaise)),
    ['₹10,000', '₹8,000', '₹13,000'],
  );
});

test('scenario from the specification: add, return, add, over-return, edit, delete', () => {
  const received10k = makeTransaction({ date: '2026-08-20', type: 'RECEIVED', amount: '10000.00' });
  assert.equal(calculateTotals([received10k]).balancePaise, 1_000_000);

  const returned2k = makeTransaction({ date: '2026-08-22', type: 'RETURNED', amount: '2000.00' });
  assert.equal(calculateTotals([received10k, returned2k]).balancePaise, 800_000);

  const received5k = makeTransaction({ date: '2026-08-25', type: 'RECEIVED', amount: '5000.00' });
  const ledger = [received10k, returned2k, received5k];
  assert.equal(calculateTotals(ledger).balancePaise, 1_300_000);

  // Returning ₹15,000 against a ₹13,000 balance must be rejected.
  const overReturn = projectedBalancePaise(ledger, {
    include: { type: 'RETURNED', amountPaise: 1_500_000 },
  });
  assert.ok(overReturn < 0, 'over-return should project a negative balance');

  // Edit the ₹2,000 returned to ₹3,000 -> ₹12,000.
  const afterEdit = projectedBalancePaise(ledger, {
    excludeId: returned2k.id,
    include: { type: 'RETURNED', amountPaise: 300_000 },
  });
  assert.equal(afterEdit, 1_200_000);

  // Delete that ₹3,000 returned transaction -> ₹15,000.
  const edited = { ...returned2k, amount: '3000.00' };
  const afterDelete = projectedBalancePaise([received10k, edited, received5k], {
    excludeId: returned2k.id,
  });
  assert.equal(afterDelete, 1_500_000);
});

test('same-date transactions are ordered by creation time, then id', () => {
  const first = makeTransaction({
    id: 'z',
    date: '2026-08-20',
    type: 'RECEIVED',
    amount: '1000.00',
    createdAt: '2026-08-20T09:00:00.000Z',
  });
  const second = makeTransaction({
    id: 'a',
    date: '2026-08-20',
    type: 'RETURNED',
    amount: '400.00',
    createdAt: '2026-08-20T11:00:00.000Z',
  });
  const running = buildRunningBalances([second, first]);
  assert.deepEqual(
    running.map((entry) => entry.transaction.id),
    ['z', 'a'],
  );
  assert.deepEqual(
    running.map((entry) => entry.balanceAfterPaise),
    [100_000, 60_000],
  );
});

test('identical same-day amounts stay in a stable, total order', () => {
  const shared = { date: '2026-08-20', type: 'RECEIVED' as const, amount: '500.00', createdAt: '2026-08-20T08:00:00.000Z' };
  const one = makeTransaction({ ...shared, id: 'aaa' });
  const two = makeTransaction({ ...shared, id: 'bbb' });
  assert.deepEqual(
    sortChronological([two, one]).map((t) => t.id),
    ['aaa', 'bbb'],
  );
  assert.deepEqual(
    sortChronological([one, two]).map((t) => t.id),
    ['aaa', 'bbb'],
  );
});

test('editing the oldest and newest transactions both reprice the whole ledger', () => {
  const oldestEdited = projectedBalancePaise(LEDGER, {
    excludeId: 'a',
    include: { type: 'RECEIVED', amountPaise: 2_000_000 },
  });
  assert.equal(oldestEdited, 2_300_000);

  const newestEdited = projectedBalancePaise(LEDGER, {
    excludeId: 'c',
    include: { type: 'RECEIVED', amountPaise: 100_000 },
  });
  assert.equal(newestEdited, 900_000);
});

test('deleting the oldest or the newest transaction recalculates correctly', () => {
  assert.equal(projectedBalancePaise(LEDGER, { excludeId: 'a' }), 300_000);
  assert.equal(projectedBalancePaise(LEDGER, { excludeId: 'c' }), 800_000);
});

test('returning exactly the balance is allowed; one rupee more is not', () => {
  const exact = projectedBalancePaise(LEDGER, {
    include: { type: 'RETURNED', amountPaise: 1_300_000 },
  });
  assert.equal(exact, 0);

  const oneRupeeMore = projectedBalancePaise(LEDGER, {
    include: { type: 'RETURNED', amountPaise: 1_300_100 },
  });
  assert.equal(oneRupeeMore, -100);
});

test('decimal amounts stay exact across a long ledger', () => {
  const ledger = Array.from({ length: 7 }, (_, index) =>
    makeTransaction({ date: `2026-03-0${index + 1}`, type: 'RECEIVED', amount: '1250.50' }),
  );
  assert.equal(calculateTotals(ledger).balancePaise, 875_350);
  assert.equal(formatRupees(calculateTotals(ledger).balancePaise), '₹8,753.50');
});

test('very large amounts remain exact', () => {
  const ledger = [
    makeTransaction({ date: '2026-01-01', type: 'RECEIVED', amount: '9999999999.99' }),
    makeTransaction({ date: '2026-01-02', type: 'RETURNED', amount: '0.99' }),
  ];
  assert.equal(calculateTotals(ledger).balancePaise, 999_999_999_900);
});

test('an empty ledger has a zero balance and no last date', () => {
  const totals = calculateTotals([]);
  assert.equal(totals.balancePaise, 0);
  assert.equal(totals.count, 0);
  assert.equal(totals.lastTransactionDate, null);
  assert.deepEqual(buildRunningBalances([]), []);
});

test('statement reports opening, movement and closing for a period', () => {
  const ledger = [
    makeTransaction({ date: '2026-07-15', type: 'RECEIVED', amount: '5000.00' }),
    makeTransaction({ date: '2026-08-02', type: 'RECEIVED', amount: '15000.00' }),
    makeTransaction({ date: '2026-08-11', type: 'RETURNED', amount: '7000.00' }),
    makeTransaction({ date: '2026-09-01', type: 'RECEIVED', amount: '1000.00' }),
  ];
  const statement = buildStatement(ledger, '2026-08-01', '2026-08-25');

  assert.equal(formatRupees(statement.openingBalancePaise), '₹5,000');
  assert.equal(formatRupees(statement.receivedPaise), '₹15,000');
  assert.equal(formatRupees(statement.returnedPaise), '₹7,000');
  assert.equal(formatRupees(statement.closingBalancePaise), '₹13,000');
  assert.equal(statement.entries.length, 2);
  // Entries keep their ledger-wide running balance, not a period-local one.
  assert.equal(statement.entries[1]?.balanceAfterPaise, 1_300_000);
});

test('statement over a period with no transactions carries the balance forward', () => {
  const ledger = [makeTransaction({ date: '2026-05-01', type: 'RECEIVED', amount: '2000.00' })];
  const statement = buildStatement(ledger, '2026-06-01', '2026-06-30');
  assert.equal(statement.openingBalancePaise, 200_000);
  assert.equal(statement.closingBalancePaise, 200_000);
  assert.equal(statement.entries.length, 0);
});

test('balances are derived per person, never pooled', () => {
  const mother = makePerson('Mother', 'MOTHER', 'p-mother');
  const brother = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const ledger = [
    makeTransaction({ personId: mother.id, date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ personId: brother.id, date: '2026-08-02', type: 'RECEIVED', amount: '4000.00' }),
    makeTransaction({ personId: mother.id, date: '2026-08-03', type: 'RETURNED', amount: '2000.00' }),
  ];

  const balances = calculatePersonBalances([mother, brother], ledger);
  // Ordered by who is holding the most.
  assert.deepEqual(
    balances.map((entry) => [entry.person.name, entry.balancePaise]),
    [
      ['Mother', 800_000],
      ['Ravi', 400_000],
    ],
  );
  assert.equal(balances[0]?.count, 2);
  assert.equal(balances[1]?.lastTransactionDate, '2026-08-02');

  // The overall total still sums everyone.
  assert.equal(calculateTotals(ledger).balancePaise, 1_200_000);
});

test('one person cannot return money held for another', () => {
  const mother = makePerson('Mother', 'MOTHER', 'p-mother');
  const brother = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const ledger = [
    makeTransaction({ personId: mother.id, date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ personId: brother.id, date: '2026-08-02', type: 'RECEIVED', amount: '1000.00' }),
  ];

  // ₹5,000 back to the brother is impossible even though the ledger holds ₹11,000.
  const brotherOnly = forPerson(ledger, brother.id);
  assert.equal(
    projectedBalancePaise(brotherOnly, { include: { type: 'RETURNED', amountPaise: 500_000 } }),
    -400_000,
  );
  // The same amount back to the mother is fine.
  const motherOnly = forPerson(ledger, mother.id);
  assert.equal(
    projectedBalancePaise(motherOnly, { include: { type: 'RETURNED', amountPaise: 500_000 } }),
    500_000,
  );
});

test('people with no transactions still appear, at zero', () => {
  const friend = makePerson('Priya', 'FRIEND', 'p-priya');
  const balances = calculatePersonBalances([friend], []);
  assert.equal(balances.length, 1);
  assert.equal(balances[0]?.balancePaise, 0);
  assert.equal(balances[0]?.count, 0);
  assert.equal(balances[0]?.lastTransactionDate, null);
});

test('lending drives the balance negative, meaning they owe me', () => {
  const ravi = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const ledger = [
    makeTransaction({ personId: ravi.id, date: '2026-08-01', type: 'LENT', amount: '5000.00' }),
  ];
  const [balance] = calculatePersonBalances([ravi], ledger);
  assert.equal(balance?.balancePaise, -500_000);
  assert.equal(describePersonBalance('Ravi', balance!.balancePaise, t), 'Ravi owes you ₹5,000');

  // Repaying half leaves half outstanding.
  const afterPartial = projectedBalancePaise(ledger, {
    include: { type: 'REPAID', amountPaise: 250_000 },
  });
  assert.equal(afterPartial, -250_000);
  assert.equal(describePersonBalance('Ravi', afterPartial, t), 'Ravi owes you ₹2,500');

  // Repaying it all settles up.
  assert.equal(
    describePersonBalance(
      'Ravi',
      projectedBalancePaise(ledger, { include: { type: 'REPAID', amountPaise: 500_000 } }),
      t,
    ),
    'Settled up with Ravi',
  );
});

test('holding and lending net off across one person', () => {
  const mother = makePerson('Mother', 'MOTHER', 'p-mother');
  const ledger = [
    makeTransaction({ personId: mother.id, date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ personId: mother.id, date: '2026-08-02', type: 'LENT', amount: '2000.00' }),
  ];
  // Her ₹10,000 with me, my ₹2,000 with her: I am net holding ₹8,000 of hers.
  assert.equal(calculateTotals(ledger).balancePaise, 800_000);
  assert.equal(calculateTotals(ledger).moneyInPaise, 1_000_000);
  assert.equal(calculateTotals(ledger).moneyOutPaise, 200_000);
});

test('holding for one person and being owed by another are reported apart', () => {
  const mother = makePerson('Mother', 'MOTHER', 'p-mother');
  const ravi = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const settled = makePerson('Priya', 'FRIEND', 'p-priya');
  const ledger = [
    makeTransaction({ personId: mother.id, date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ personId: ravi.id, date: '2026-08-02', type: 'LENT', amount: '4000.00' }),
    makeTransaction({ personId: settled.id, date: '2026-08-03', type: 'LENT', amount: '1000.00' }),
    makeTransaction({ personId: settled.id, date: '2026-08-04', type: 'REPAID', amount: '1000.00' }),
  ];

  const balances = calculatePersonBalances([mother, ravi, settled], ledger);
  const standing = summariseStanding(balances);
  assert.equal(standing.holdingPaise, 1_000_000);
  assert.equal(standing.owedToYouPaise, 400_000);

  // Settled people sort last, so the list leads with what needs attention.
  assert.deepEqual(
    balances.map((entry) => entry.person.name),
    ['Mother', 'Ravi', 'Priya'],
  );
});

test('running balances cross zero cleanly in both directions', () => {
  const ravi = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const running = buildRunningBalances([
    makeTransaction({ personId: ravi.id, date: '2026-08-01', type: 'RECEIVED', amount: '1000.00' }),
    makeTransaction({ personId: ravi.id, date: '2026-08-02', type: 'RETURNED', amount: '1000.00' }),
    makeTransaction({ personId: ravi.id, date: '2026-08-03', type: 'LENT', amount: '600.00' }),
    makeTransaction({ personId: ravi.id, date: '2026-08-04', type: 'REPAID', amount: '250.00' }),
  ]);
  assert.deepEqual(
    running.map((entry) => entry.balanceAfterPaise),
    [100_000, 0, -60_000, -35_000],
  );
});

test('running balances are each person, not a total across everyone', () => {
  const mother = makePerson('Mother', 'MOTHER', 'p-mother');
  const ravi = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const running = buildRunningBalances([
    makeTransaction({ personId: mother.id, date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ personId: ravi.id, date: '2026-08-02', type: 'RECEIVED', amount: '4000.00' }),
    makeTransaction({ personId: mother.id, date: '2026-08-03', type: 'RETURNED', amount: '2000.00' }),
    makeTransaction({ personId: ravi.id, date: '2026-08-04', type: 'LENT', amount: '9000.00' }),
  ]);

  // Each row reports the pot it belongs to: mother 10,000 then 8,000; Ravi 4,000 then
  // -5,000. A single accumulator would have read 10,000 / 14,000 / 12,000 / 3,000.
  assert.deepEqual(
    running.map((entry) => entry.balanceAfterPaise),
    [1_000_000, 400_000, 800_000, -500_000],
  );
});

/* ------------------------------------------------------------------- settling up */

test('settling money you are holding gives it back; settling a loan is repaid', () => {
  // Holding ₹1,500 of theirs: the way to zero is me returning it.
  assert.deepEqual(settlementFor(150_000), { type: 'RETURNED', amountPaise: 150_000 });
  // They owe me ₹1,500: the way to zero is them paying it back. This is the pair people
  // get the wrong way round by hand, which is the whole reason the app picks.
  assert.deepEqual(settlementFor(-150_000), { type: 'REPAID', amountPaise: 150_000 });
});

test('there is nothing to settle when the balance is already zero', () => {
  assert.equal(settlementFor(0), null);
});

test('the offered settlement lands exactly on zero, from either side', () => {
  for (const balancePaise of [150_000, -150_000, 1, -1, 99, 12_345_67]) {
    const settlement = settlementFor(balancePaise);
    assert.notEqual(settlement, null);
    assert.equal(
      applyChangePaise(balancePaise, { include: settlement! }),
      0,
      `settling ${balancePaise} should reach zero`,
    );
  }
});

test('settling the uncle scenario: lend, then settle, and the balance is clear', () => {
  const uncle = makePerson('Uncle', 'OTHER', 'p-uncle');
  const lent = makeTransaction({
    personId: uncle.id,
    date: '2026-08-26',
    type: 'LENT',
    amount: '1500.00',
    note: 'Train ticket',
  });

  const [before] = calculatePersonBalances([uncle], [lent]);
  assert.equal(before!.balancePaise, -150_000);
  assert.equal(describePersonBalance(uncle.name, before!.balancePaise, t), 'Uncle owes you ₹1,500');

  const settlement = settlementFor(before!.balancePaise)!;
  const settled = makeTransaction({
    personId: uncle.id,
    date: '2026-09-03',
    type: settlement.type,
    amount: '1500.00',
    method: 'CASH',
  });

  const [after] = calculatePersonBalances([uncle], [lent, settled]);
  assert.equal(after!.balancePaise, 0);
  assert.equal(describePersonBalance(uncle.name, after!.balancePaise, t), 'Settled up with Uncle');
});

test('a part settlement leaves the rest outstanding, still owed the same way', () => {
  // ₹1,000 of the ₹1,500 comes back: still owed ₹500, and the next settlement offers it.
  const remaining = applyChangePaise(-150_000, {
    include: { type: 'REPAID', amountPaise: 100_000 },
  });
  assert.equal(remaining, -50_000);
  assert.deepEqual(settlementFor(remaining), { type: 'REPAID', amountPaise: 50_000 });
});

test('the sign shown on an entry follows the direction, not one named type', () => {
  // REPAID raises the balance exactly as RECEIVED does; it used to be printed as a
  // deduction, which is the same slip settling a loan would have made visible.
  assert.equal(formatSignedRupees(150_000, 'RECEIVED'), '+ ₹1,500');
  assert.equal(formatSignedRupees(150_000, 'REPAID'), '+ ₹1,500');
  assert.equal(formatSignedRupees(150_000, 'RETURNED'), '− ₹1,500');
  assert.equal(formatSignedRupees(150_000, 'LENT'), '− ₹1,500');
});

/* --------------------------------------------------------------- outstanding since */

/** The screens hold history newest first; these helpers match that. */
function newestFirst(transactions: readonly Transaction[]) {
  return buildRunningBalances(transactions).reverse();
}

/**
 * The newest `size` rows of a ledger, as a page. Running balances are computed over the
 * whole ledger first, exactly as `transaction_ledger` does - a page whose balances were
 * recomputed from its own rows would be a page that cannot happen.
 */
function pageOf(transactions: readonly Transaction[], size: number) {
  return newestFirst(transactions).slice(0, size);
}

test('outstanding since is the entry after the last time you were square', () => {
  // Square on 5 Aug, then lent again: the debt dates from the 10th, not the 1st.
  const entries = newestFirst([
    makeTransaction({ date: '2026-08-01', type: 'LENT', amount: '1000.00' }),
    makeTransaction({ date: '2026-08-05', type: 'REPAID', amount: '1000.00' }),
    makeTransaction({ date: '2026-08-10', type: 'LENT', amount: '1500.00' }),
  ]);
  assert.equal(outstandingSince(entries, { complete: true }), '2026-08-10');
});

test('a balance that never returned to zero dates from the very first entry', () => {
  const entries = newestFirst([
    makeTransaction({ date: '2026-08-01', type: 'LENT', amount: '1000.00' }),
    makeTransaction({ date: '2026-08-10', type: 'LENT', amount: '500.00' }),
  ]);
  assert.equal(outstandingSince(entries, { complete: true }), '2026-08-01');
});

test('a partial repayment does not restart the clock', () => {
  // ₹500 of ₹1,500 came back, so the balance never reached zero: still since the 1st.
  const entries = newestFirst([
    makeTransaction({ date: '2026-08-01', type: 'LENT', amount: '1500.00' }),
    makeTransaction({ date: '2026-08-20', type: 'REPAID', amount: '500.00' }),
  ]);
  assert.equal(outstandingSince(entries, { complete: true }), '2026-08-01');
});

test('crossing zero from the other direction also restarts it', () => {
  // Held ₹2,000 of theirs, gave it all back, then lent ₹800 of your own.
  const entries = newestFirst([
    makeTransaction({ date: '2026-08-01', type: 'RECEIVED', amount: '2000.00' }),
    makeTransaction({ date: '2026-08-04', type: 'RETURNED', amount: '2000.00' }),
    makeTransaction({ date: '2026-08-09', type: 'LENT', amount: '800.00' }),
  ]);
  assert.equal(outstandingSince(entries, { complete: true }), '2026-08-09');
});

test('an unproven date is left out rather than guessed', () => {
  const ledger = [
    makeTransaction({ date: '2026-08-01', type: 'LENT', amount: '1000.00' }),
    makeTransaction({ date: '2026-08-10', type: 'LENT', amount: '500.00' }),
    makeTransaction({ date: '2026-08-20', type: 'LENT', amount: '500.00' }),
  ];
  // Only the newest two were fetched, they never reach zero, and the row that would
  // answer the question was left on the server. Saying "since 10 Aug" here would be
  // nine days late.
  assert.equal(outstandingSince(pageOf(ledger, 2), { complete: false }), null);
  // With the whole history in hand, the answer is the first entry.
  assert.equal(outstandingSince(pageOf(ledger, 3), { complete: true }), '2026-08-01');
});

test('a page that reaches back past the last zero is answerable even when incomplete', () => {
  const ledger = [
    makeTransaction({ date: '2026-08-01', type: 'LENT', amount: '1000.00' }),
    makeTransaction({ date: '2026-08-05', type: 'REPAID', amount: '1000.00' }),
    makeTransaction({ date: '2026-08-10', type: 'LENT', amount: '1500.00' }),
  ];
  // The page includes the moment they were square, so nothing older can matter.
  assert.equal(outstandingSince(pageOf(ledger, 2), { complete: false }), '2026-08-10');
});

test('nothing loaded means nothing to say', () => {
  assert.equal(outstandingSince([], { complete: true }), null);
});

/* ------------------------------------------------------------------- the reminder */

test('the reminder names the amount and the date, and stays short', () => {
  const uncle = makePerson('Uncle', 'OTHER', 'p-uncle');
  const text = buildReminderText(uncle, 150_000, '2026-08-26', t, 'https://potli.example');
  const lines = text.split('\n').filter((line) => line !== '');

  assert.equal(lines[0], 'Hi Uncle,');
  assert.match(text, /\*₹1,500\*/);
  assert.match(text, /26 Aug 2026/);
  assert.match(text, /no rush/);
  assert.match(text, /Potli · potli\.example/);
  // A nudge, not a statement: the full ledger has its own button.
  assert.ok(lines.length <= 5, `${lines.length} lines: ${JSON.stringify(lines)}`);
});

test('the reminder simply omits the date when it is not known', () => {
  const uncle = makePerson('Uncle', 'OTHER', 'p-uncle');
  const text = buildReminderText(uncle, 150_000, null, t);
  assert.match(text, /\*₹1,500\*/);
  assert.doesNotMatch(text, /since/i);
  // No origin, so no half-formed link.
  assert.match(text, /— Potli$/);
});
