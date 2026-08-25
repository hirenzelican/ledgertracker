import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  checkBalanceNotNegative,
  sanitizeNote,
  validateTransactionForm,
} from '@/lib/validation/transaction';
import { parseBackup, findNegativeBalancePoint } from '@/lib/validation/backup';
import { buildBackup, serializeBackup } from '@/lib/export/backup';
import { transactionsToCsv } from '@/lib/export/csv';
import { DEFAULT_PEOPLE, makeTransaction } from './helpers';

const VALID_FORM = {
  person_id: 'person-1',
  amount: '1000',
  transaction_date: '2026-08-25',
  type: 'RECEIVED',
  method: 'CASH',
  note: 'Monthly savings',
};

test('accepts a well-formed transaction', () => {
  const result = validateTransactionForm(VALID_FORM);
  assert.ok(result.ok);
  assert.equal(result.value.amountPaise, 100_000);
  assert.equal(result.value.note, 'Monthly savings');
});

test('rejects zero, negative, empty and malformed amounts', () => {
  for (const amount of ['0', '0.00', '', 'abc', '-5', '1.234']) {
    const result = validateTransactionForm({ ...VALID_FORM, amount });
    assert.ok(!result.ok, `expected ${JSON.stringify(amount)} to be rejected`);
    assert.ok(result.errors.amount);
  }
});

test('rejects amounts beyond what NUMERIC(12,2) can hold', () => {
  const result = validateTransactionForm({ ...VALID_FORM, amount: '99999999999' });
  assert.ok(!result.ok);
  assert.ok(result.errors.amount);
});

test('rejects invalid dates, types and methods', () => {
  assert.ok(!validateTransactionForm({ ...VALID_FORM, transaction_date: '2026-02-30' }).ok);
  assert.ok(!validateTransactionForm({ ...VALID_FORM, transaction_date: '25-08-2026' }).ok);
  assert.ok(!validateTransactionForm({ ...VALID_FORM, type: 'GIFT' }).ok);
  assert.ok(!validateTransactionForm({ ...VALID_FORM, method: 'BITCOIN' }).ok);
});

test('an empty note is stored as an empty string, not junk', () => {
  const result = validateTransactionForm({ ...VALID_FORM, note: '   ' });
  assert.ok(result.ok);
  assert.equal(result.value.note, '');
});

test('notes are stripped of control characters and collapsed whitespace', () => {
  assert.equal(sanitizeNote('  emergency    requirement \n'), 'emergency requirement');
  assert.equal(sanitizeNote('a'.repeat(500)).length, 200);
});

test('insufficient balance is reported with the available amount', () => {
  const ok = checkBalanceNotNegative(0, 1_300_000);
  assert.ok(ok.ok);

  const bad = checkBalanceNotNegative(-200_000, 300_000, 'Mother');
  assert.ok(!bad.ok);
  assert.equal(bad.message, "Insufficient balance. Mother's available balance is ₹3,000.");
});

test('CSV export matches the documented format', () => {
  const ledger = [
    makeTransaction({ date: '2026-08-20', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ date: '2026-08-22', type: 'RETURNED', amount: '2000.00', note: 'Emergency' }),
    makeTransaction({
      date: '2026-08-25',
      type: 'RECEIVED',
      amount: '5000.00',
      method: 'CASH',
      note: 'Monthly savings',
    }),
  ];
  assert.equal(
    transactionsToCsv(ledger, DEFAULT_PEOPLE),
    [
      'Date,Person,Relationship,Type,Amount,Method,Note',
      '2026-08-20,Mother,MOTHER,RECEIVED,10000.00,GOOGLE_PAY,',
      '2026-08-22,Mother,MOTHER,RETURNED,2000.00,GOOGLE_PAY,Emergency',
      '2026-08-25,Mother,MOTHER,RECEIVED,5000.00,CASH,Monthly savings',
    ].join('\r\n'),
  );
});

test('CSV quotes separators and neutralises formula-looking notes', () => {
  const ledger = [
    makeTransaction({ date: '2026-08-20', type: 'RECEIVED', amount: '1.00', note: 'a,b "c"' }),
    makeTransaction({ date: '2026-08-21', type: 'RECEIVED', amount: '1.00', note: '=SUM(A1)' }),
  ];
  const lines = transactionsToCsv(ledger, DEFAULT_PEOPLE).split('\r\n');
  assert.equal(lines[1], '2026-08-20,Mother,MOTHER,RECEIVED,1.00,GOOGLE_PAY,"a,b ""c"""');
  assert.equal(lines[2], "2026-08-21,Mother,MOTHER,RECEIVED,1.00,GOOGLE_PAY,'=SUM(A1)");
});

test('a backup round-trips through export and import', () => {
  const ledger = [
    makeTransaction({ date: '2026-08-20', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ date: '2026-08-22', type: 'RETURNED', amount: '2000.50', note: 'Emergency' }),
  ];
  const text = serializeBackup(buildBackup(ledger, DEFAULT_PEOPLE, '2026-08-25T00:00:00.000Z'));

  const intoEmpty = parseBackup(text, [], DEFAULT_PEOPLE);
  assert.ok(intoEmpty.ok);
  assert.equal(intoEmpty.value.newTransactions.length, 2);
  assert.equal(intoEmpty.value.newTransactions[1]?.amountPaise, 200_050);
  assert.equal(intoEmpty.value.duplicates.length, 0);

  // Importing the same backup again finds every row already present.
  const intoSame = parseBackup(text, ledger, DEFAULT_PEOPLE);
  assert.ok(intoSame.ok);
  assert.equal(intoSame.value.newTransactions.length, 0);
  assert.equal(intoSame.value.duplicates.length, 2);
});

test('duplicate rows inside one backup file are only imported once', () => {
  const row = {
    transaction_date: '2026-08-20',
    type: 'RECEIVED',
    amount: '1000.00',
    method: 'CASH',
    note: null,
  };
  const result = parseBackup(JSON.stringify({ transactions: [row, row] }), []);
  assert.ok(result.ok);
  assert.equal(result.value.newTransactions.length, 1);
  assert.equal(result.value.duplicates.length, 1);
});

test('malformed backups are rejected with a readable reason', () => {
  const cases: [string, RegExp][] = [
    ['not json', /not valid JSON/],
    ['{}', /list of transactions/],
    ['[]', /not in the expected format/],
    [JSON.stringify({ format: 'other-app', transactions: [] }), /not created by/],
    [
      JSON.stringify({
        transactions: [
          { transaction_date: 'yesterday', type: 'RECEIVED', amount: '1', method: 'CASH' },
        ],
      }),
      /invalid date/,
    ],
    [
      JSON.stringify({
        transactions: [
          { transaction_date: '2026-01-01', type: 'GIFT', amount: '1', method: 'CASH' },
        ],
      }),
      /unknown type/,
    ],
    [
      JSON.stringify({
        transactions: [
          { transaction_date: '2026-01-01', type: 'RECEIVED', amount: '1', method: 'GOLD' },
        ],
      }),
      /unknown payment method/,
    ],
    [
      JSON.stringify({
        transactions: [
          { transaction_date: '2026-01-01', type: 'RECEIVED', amount: '0', method: 'CASH' },
        ],
      }),
      /above zero/,
    ],
    [
      JSON.stringify({
        transactions: [
          { transaction_date: '2026-01-01', type: 'RECEIVED', amount: '-5', method: 'CASH' },
        ],
      }),
      /above zero/,
    ],
    [JSON.stringify({ transactions: ['nope'] }), /not valid/],
  ];

  for (const [input, pattern] of cases) {
    const result = parseBackup(input, []);
    assert.ok(!result.ok, `expected rejection for ${input.slice(0, 40)}`);
    assert.match(result.message, pattern);
  }
});

test('a restore that would drive the balance negative is caught before writing', () => {
  const negative = findNegativeBalancePoint([
    { transaction_date: '2026-01-01', type: 'RECEIVED', amountPaise: 100_000 },
    { transaction_date: '2026-01-02', type: 'RETURNED', amountPaise: 250_000 },
  ]);
  assert.deepEqual(negative, { date: '2026-01-02' });

  assert.equal(
    findNegativeBalancePoint([
      { transaction_date: '2026-01-01', type: 'RECEIVED', amountPaise: 100_000 },
      { transaction_date: '2026-01-02', type: 'RETURNED', amountPaise: 100_000 },
    ]),
    null,
  );
});
