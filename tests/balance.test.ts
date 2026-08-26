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
  sortChronological,
} from '@/lib/calculations/balance';
import { formatRupees } from '@/lib/calculations/money';
import { makePerson, makeTransaction } from './helpers';

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
  assert.equal(describePersonBalance('Ravi', balance!.balancePaise), 'Ravi owes you ₹5,000');

  // Repaying half leaves half outstanding.
  const afterPartial = projectedBalancePaise(ledger, {
    include: { type: 'REPAID', amountPaise: 250_000 },
  });
  assert.equal(afterPartial, -250_000);
  assert.equal(describePersonBalance('Ravi', afterPartial), 'Ravi owes you ₹2,500');

  // Repaying it all settles up.
  assert.equal(
    describePersonBalance(
      'Ravi',
      projectedBalancePaise(ledger, { include: { type: 'REPAID', amountPaise: 500_000 } }),
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
