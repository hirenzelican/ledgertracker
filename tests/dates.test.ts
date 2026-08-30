import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  addDays,
  endOfMonth,
  formatDateRange,
  formatDisplayDate,
  formatRelativeDate,
  isIsoDate,
  shiftMonth,
  startOfMonth,
} from '@/lib/format/date';
import { filterLedger, EMPTY_FILTER } from '@/lib/calculations/filters';
import { buildRunningBalances } from '@/lib/calculations/balance';
import { makeTransaction, t } from './helpers';

test('validates ISO calendar dates', () => {
  assert.ok(isIsoDate('2026-08-25'));
  assert.ok(isIsoDate('2024-02-29'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('2023-02-29'));
  assert.ok(!isIsoDate('2026-13-01'));
  assert.ok(!isIsoDate('25-08-2026'));
  assert.ok(!isIsoDate(''));
});

test('formats dates for the interface', () => {
  assert.equal(formatDisplayDate('2026-08-25', t), '25 Aug 2026');
  assert.equal(formatDisplayDate('2026-01-05', t), '5 Jan 2026');
  assert.equal(formatDateRange('2026-08-01', '2026-08-25', t), '1 Aug 2026 – 25 Aug 2026');
});

test('shows Today and Yesterday relative to a given day', () => {
  assert.equal(formatRelativeDate('2026-08-25', t, '2026-08-25'), 'Today');
  assert.equal(formatRelativeDate('2026-08-24', t, '2026-08-25'), 'Yesterday');
  assert.equal(formatRelativeDate('2026-08-20', t, '2026-08-25'), '20 Aug');
  assert.equal(formatRelativeDate('2025-08-20', t, '2026-08-25'), '20 Aug 2025');
});

test('date arithmetic crosses month and year boundaries', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(startOfMonth('2026-08-25'), '2026-08-01');
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(endOfMonth('2024-02-10'), '2024-02-29');
  assert.equal(shiftMonth('2026-01-15', -1), '2025-12-01');
});

test('filters by type, period and note search', () => {
  const ledger = buildRunningBalances([
    makeTransaction({ date: '2026-07-20', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ date: '2026-08-02', type: 'RETURNED', amount: '2000.00', note: 'Emergency requirement' }),
    makeTransaction({ date: '2026-08-25', type: 'RECEIVED', amount: '5000.00', note: 'Monthly savings' }),
  ]);

  assert.equal(filterLedger(ledger, EMPTY_FILTER).length, 3);
  assert.equal(filterLedger(ledger, { ...EMPTY_FILTER, type: 'OUT' }).length, 1);
  assert.equal(
    filterLedger(ledger, { ...EMPTY_FILTER, from: '2026-08-01', to: '2026-08-31' }).length,
    2,
  );

  const searched = filterLedger(ledger, { ...EMPTY_FILTER, search: 'emergency' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0]?.transaction.note, 'Emergency requirement');
});

test('filtered rows keep the running balance they were given', () => {
  const ledger = buildRunningBalances([
    makeTransaction({ date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ date: '2026-08-02', type: 'RETURNED', amount: '2000.00' }),
    makeTransaction({ date: '2026-08-03', type: 'RECEIVED', amount: '5000.00' }),
  ]);
  const onlyReceived = filterLedger(ledger, { ...EMPTY_FILTER, type: 'IN' });
  assert.deepEqual(
    onlyReceived.map((entry) => entry.balanceAfterPaise),
    [1_000_000, 1_300_000],
  );
});
