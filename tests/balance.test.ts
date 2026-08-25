import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildRunningBalances,
  buildStatement,
  calculateTotals,
  firstNegativeBalanceDate,
  projectedBalancePaise,
  sortChronological,
  toLedgerEntries,
} from '@/lib/calculations/balance';
import { formatRupees } from '@/lib/calculations/money';
import { makeTransaction } from './helpers';

/** The worked example from the specification. */
const LEDGER = [
  makeTransaction({ id: 'a', date: '2026-08-20', type: 'RECEIVED', amount: '10000.00' }),
  makeTransaction({ id: 'b', date: '2026-08-22', type: 'RETURNED', amount: '2000.00' }),
  makeTransaction({ id: 'c', date: '2026-08-25', type: 'RECEIVED', amount: '5000.00', method: 'CASH' }),
];

test('balance is received minus returned', () => {
  const totals = calculateTotals(LEDGER);
  assert.equal(formatRupees(totals.receivedPaise), '₹15,000');
  assert.equal(formatRupees(totals.returnedPaise), '₹2,000');
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

test('a back-dated return that dips the balance below zero is caught', () => {
  const ledger = [
    makeTransaction({ id: 'r1', date: '2026-08-20', type: 'RECEIVED', amount: '10000.00', createdAt: '2026-08-20T10:00:00Z' }),
    makeTransaction({ id: 'r2', date: '2026-08-25', type: 'RECEIVED', amount: '5000.00', createdAt: '2026-08-25T10:00:00Z' }),
  ];
  const entries = toLedgerEntries(ledger);

  // ₹12,000 returned today is fine: ₹15,000 was already in hand.
  assert.equal(
    firstNegativeBalanceDate([
      ...entries,
      { transaction_date: '2026-08-26', created_at: '2026-08-26T10:00:00Z', type: 'RETURNED', amountPaise: 1_200_000 },
    ]),
    null,
  );

  // The same ₹12,000 back-dated to 22 Aug is not: only ₹10,000 had been received by then,
  // even though the closing balance would still be positive.
  assert.equal(
    firstNegativeBalanceDate([
      ...entries,
      { transaction_date: '2026-08-22', created_at: '2026-08-26T10:00:00Z', type: 'RETURNED', amountPaise: 1_200_000 },
    ]),
    '2026-08-22',
  );
});

test('same-day ordering decides whether a back-dated entry is valid', () => {
  const entries = toLedgerEntries([
    makeTransaction({ id: 'a', date: '2026-08-20', type: 'RECEIVED', amount: '1000.00', createdAt: '2026-08-20T10:00:00Z' }),
  ]);
  // Recorded after the receipt on the same day: allowed.
  assert.equal(
    firstNegativeBalanceDate([
      ...entries,
      { transaction_date: '2026-08-20', created_at: '2026-08-20T11:00:00Z', type: 'RETURNED', amountPaise: 100_000 },
    ]),
    null,
  );
  // Recorded before it: the balance would be negative at that moment.
  assert.equal(
    firstNegativeBalanceDate([
      ...entries,
      { transaction_date: '2026-08-20', created_at: '2026-08-20T09:00:00Z', type: 'RETURNED', amountPaise: 100_000 },
    ]),
    '2026-08-20',
  );
});
