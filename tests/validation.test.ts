import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  sanitizeNote,
  validateTransactionForm,
} from '@/lib/validation/transaction';
import { parseBackup } from '@/lib/validation/backup';
import { buildBackup, serializeBackup } from '@/lib/export/backup';
import { transactionsToCsv } from '@/lib/export/csv';
import { MAX_SHARED_LINES, buildContactShareText, buildStatementShareText } from '@/lib/export/share';
import { buildRunningBalances, buildStatement } from '@/lib/calculations/balance';
import { DEFAULT_PEOPLE, makePerson, makeTransaction, t } from './helpers';

const VALID_FORM = {
  person_id: 'person-1',
  amount: '1000',
  transaction_date: '2026-08-25',
  type: 'RECEIVED',
  method: 'CASH',
  note: 'Monthly savings',
};

test('accepts a well-formed transaction', () => {
  const result = validateTransactionForm(VALID_FORM, t);
  assert.ok(result.ok);
  assert.equal(result.value.amountPaise, 100_000);
  assert.equal(result.value.note, 'Monthly savings');
});

test('rejects zero, negative, empty and malformed amounts', () => {
  for (const amount of ['0', '0.00', '', 'abc', '-5', '1.234']) {
    const result = validateTransactionForm({ ...VALID_FORM, amount }, t);
    assert.ok(!result.ok, `expected ${JSON.stringify(amount)} to be rejected`);
    assert.ok(result.errors.amount);
  }
});

test('rejects amounts beyond what NUMERIC(12,2) can hold', () => {
  const result = validateTransactionForm({ ...VALID_FORM, amount: '99999999999' }, t);
  assert.ok(!result.ok);
  assert.ok(result.errors.amount);
});

test('rejects invalid dates, types and methods', () => {
  assert.ok(!validateTransactionForm({ ...VALID_FORM, transaction_date: '2026-02-30' }, t).ok);
  assert.ok(!validateTransactionForm({ ...VALID_FORM, transaction_date: '25-08-2026' }, t).ok);
  assert.ok(!validateTransactionForm({ ...VALID_FORM, type: 'GIFT' }, t).ok);
  assert.ok(!validateTransactionForm({ ...VALID_FORM, method: 'BITCOIN' }, t).ok);
});

test('an empty note is stored as an empty string, not junk', () => {
  const result = validateTransactionForm({ ...VALID_FORM, note: '   ' }, t);
  assert.ok(result.ok);
  assert.equal(result.value.note, '');
});

test('notes are stripped of control characters and collapsed whitespace', () => {
  assert.equal(sanitizeNote('  emergency    requirement \n'), 'emergency requirement');
  assert.equal(sanitizeNote('a'.repeat(500)).length, 200);
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
      tags: ['rent', 'medical'],
    }),
  ];
  assert.equal(
    transactionsToCsv(ledger, DEFAULT_PEOPLE),
    [
      'Date,Person,Relationship,Type,Amount,Method,Note,Tags',
      '2026-08-20,Mother,MOTHER,RECEIVED,10000.00,GOOGLE_PAY,,',
      '2026-08-22,Mother,MOTHER,RETURNED,2000.00,GOOGLE_PAY,Emergency,',
      '2026-08-25,Mother,MOTHER,RECEIVED,5000.00,CASH,Monthly savings,rent; medical',
    ].join('\r\n'),
  );
});

test('CSV quotes separators and neutralises formula-looking notes', () => {
  const ledger = [
    makeTransaction({ date: '2026-08-20', type: 'RECEIVED', amount: '1.00', note: 'a,b "c"' }),
    makeTransaction({ date: '2026-08-21', type: 'RECEIVED', amount: '1.00', note: '=SUM(A1)' }),
  ];
  const lines = transactionsToCsv(ledger, DEFAULT_PEOPLE).split('\r\n');
  assert.equal(lines[1], '2026-08-20,Mother,MOTHER,RECEIVED,1.00,GOOGLE_PAY,"a,b ""c""",');
  assert.equal(lines[2], "2026-08-21,Mother,MOTHER,RECEIVED,1.00,GOOGLE_PAY,'=SUM(A1),");
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


test('a contact summary leads with the balance and shows the working', () => {
  const mother = makePerson('Mother', 'MOTHER', 'person-1');
  const entries = buildRunningBalances([
    makeTransaction({ date: '2026-08-01', type: 'RECEIVED', amount: '10000.00' }),
    makeTransaction({ date: '2026-08-03', type: 'RETURNED', amount: '2000.00', method: 'CASH', note: 'Groceries' }),
  ]).reverse();

  const text = buildContactShareText(mother, 800_000, 1_000_000, 200_000, entries, '2026-08-26', t);
  const lines = text.split('\n');

  // The sentence that settles the argument comes first, in bold.
  assert.equal(lines[0], '*Holding ₹8,000 for Mother*');
  assert.equal(lines[1], 'as of 26 Aug 2026');
  // Newest first, each line saying date, direction, amount, what and how.
  assert.equal(lines[3], '3 Aug 2026 · − ₹2,000 · Given back · Cash · Groceries');
  assert.equal(lines[4], '1 Aug 2026 · + ₹10,000 · To keep · Google Pay');
  assert.equal(lines[6], 'In ₹10,000 · Out ₹2,000');
  assert.equal(lines[lines.length - 1], '— Potli');
});

test('a long history is trimmed rather than dumped', () => {
  const entries = buildRunningBalances(
    Array.from({ length: 26 }, (_, index) =>
      makeTransaction({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        type: 'RECEIVED',
        amount: '100.00',
      }),
    ),
  ).reverse();

  const text = buildContactShareText(
    makePerson('Ravi', 'BROTHER', 'person-2'),
    260_000,
    260_000,
    0,
    entries,
    '2026-08-27',
    t,
  );
  assert.ok(text.includes('...and 6 more'), text);
  assert.equal(text.split('\n').filter((line) => line.includes('·')).length, MAX_SHARED_LINES + 1);
});

test('a statement summary carries the four figures a reader checks', () => {
  const statement = buildStatement(
    [
      makeTransaction({ date: '2026-07-20', type: 'RECEIVED', amount: '5000.00' }),
      makeTransaction({ date: '2026-08-05', type: 'RECEIVED', amount: '3000.00' }),
      makeTransaction({ date: '2026-08-11', type: 'RETURNED', amount: '1000.00' }),
    ],
    '2026-08-01',
    '2026-08-31',
  );

  const text = buildStatementShareText(statement, 'Mother', t);
  assert.ok(text.startsWith("*Mother's statement*"));
  assert.ok(text.includes('1 Aug 2026 – 31 Aug 2026'));
  assert.ok(text.includes('Opening balance: ₹5,000'));
  assert.ok(text.includes('Money in: + ₹3,000'));
  assert.ok(text.includes('Money out: − ₹1,000'));
  assert.ok(text.includes('*Closing balance: ₹7,000*'));
});
