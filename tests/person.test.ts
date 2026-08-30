import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  dialableDigits,
  validatePersonForm,
  whatsappNumber,
} from '@/lib/validation/person';
import { applyChangePaise, buildStatement, statementFromEntries, buildRunningBalances } from '@/lib/calculations/balance';
import { makePerson, makeTransaction, t } from './helpers';

const VALID = {
  name: 'Ravi Kumar',
  relationship: 'BROTHER',
  phone: '+91 98765 43210',
  email: 'ravi@example.com',
  note: 'Pays back on salary day',
};

test('a contact needs only a name', () => {
  const result = validatePersonForm(
    { name: 'Mother', relationship: 'MOTHER', phone: '', email: '', note: '' },
    t,
  );
  assert.ok(result.ok);
  assert.deepEqual(result.value, {
    name: 'Mother',
    relationship: 'MOTHER',
    phone: '',
    email: '',
    note: '',
  });
});

test('full details round-trip unchanged', () => {
  const result = validatePersonForm(VALID, t);
  assert.ok(result.ok);
  assert.equal(result.value.phone, '+91 98765 43210');
  assert.equal(result.value.email, 'ravi@example.com');
  assert.equal(result.value.note, 'Pays back on salary day');
});

test('a name is required and is tidied, not rejected, for spacing', () => {
  assert.ok(!validatePersonForm({ ...VALID, name: '   ' }, t).ok);
  const spaced = validatePersonForm({ ...VALID, name: '  Ravi   Kumar  ' }, t);
  assert.ok(spaced.ok);
  assert.equal(spaced.value.name, 'Ravi Kumar');
});

test('phone numbers people actually type are accepted', () => {
  for (const phone of [
    '9876543210',
    '+91 98765 43210',
    '+91-98765-43210',
    '(022) 2555 0100',
    '022 25550100',
    '+1 415 555 0100',
    // Four digits is the floor, matching the CHECK constraint on the column.
    '1800',
  ]) {
    const result = validatePersonForm({ ...VALID, phone }, t);
    assert.ok(result.ok, `expected ${phone} to be accepted`);
  }
});

test('phone numbers that cannot be dialled are rejected', () => {
  for (const phone of ['call me', '98765abcde', '12', '108', '+', '()-']) {
    const result = validatePersonForm({ ...VALID, phone }, t);
    assert.ok(!result.ok, `expected ${JSON.stringify(phone)} to be rejected`);
    assert.ok(result.errors.phone);
  }
});

test('email is checked for shape, not for plausibility', () => {
  for (const email of ['a@b.co', 'first.last+tag@sub.example.co.in']) {
    assert.ok(validatePersonForm({ ...VALID, email }, t).ok, email);
  }
  for (const email of ['nope', 'a@b', 'a b@c.com', '@example.com']) {
    const result = validatePersonForm({ ...VALID, email }, t);
    assert.ok(!result.ok, email);
    assert.ok(result.errors.email);
  }
});

test('a contact note is sanitised the same way a transaction note is', () => {
  const result = validatePersonForm({ ...VALID, note: '  keeps   a\nsecond number ' }, t);
  assert.ok(result.ok);
  assert.equal(result.value.note, 'keeps a second number');
  const long = validatePersonForm({ ...VALID, note: 'x'.repeat(500) }, t);
  assert.ok(long.ok);
  assert.equal(long.value.note.length, 200);
});

test('an unknown relationship falls back rather than failing the save', () => {
  const result = validatePersonForm({ ...VALID, relationship: 'COUSIN' }, t);
  assert.ok(result.ok);
  assert.equal(result.value.relationship, 'OTHER');
});

test('dialling strips the formatting but keeps the country code', () => {
  assert.equal(dialableDigits('+91 98765 43210'), '+919876543210');
  assert.equal(dialableDigits('(022) 2555-0100'), '02225550100');
});

test('a bare ten-digit number gets India as its country code for WhatsApp', () => {
  assert.equal(whatsappNumber('9876543210'), '919876543210');
  assert.equal(whatsappNumber('+1 415 555 0100'), '14155550100');
  // Already prefixed, or too short to guess: left alone.
  assert.equal(whatsappNumber('+91 98765 43210'), '919876543210');
  assert.equal(whatsappNumber('02225550100'), '02225550100');
  assert.equal(whatsappNumber(null), '');
  assert.equal(whatsappNumber('nonsense'), '');
});

test('a person is stored with their details', () => {
  const person = makePerson('Ravi', 'BROTHER', 'p-ravi', { phone: '9876543210' });
  assert.equal(person.phone, '9876543210');
  assert.equal(person.email, null);
});

/* ------------------------------------------------------- server-side paging support */

test('applying a change to a balance matches replaying the rows', () => {
  // The app no longer holds the rows, so it applies changes to a known balance instead.
  // The two must agree or a guard would fire on a figure the ledger never had.
  const held = 800_000;
  assert.equal(applyChangePaise(held, {}), 800_000);
  assert.equal(
    applyChangePaise(held, { include: { type: 'RETURNED', amountPaise: 200_000 } }),
    600_000,
  );
  assert.equal(
    applyChangePaise(held, { exclude: { type: 'RECEIVED', amountPaise: 100_000 } }),
    700_000,
  );
  // An edit: the old row out, the new row in.
  assert.equal(
    applyChangePaise(held, {
      exclude: { type: 'RECEIVED', amountPaise: 100_000 },
      include: { type: 'RECEIVED', amountPaise: 150_000 },
    }),
    850_000,
  );
  // Lending lowers the balance, being repaid raises it.
  assert.equal(applyChangePaise(0, { include: { type: 'LENT', amountPaise: 400_000 } }), -400_000);
  assert.equal(
    applyChangePaise(-400_000, { include: { type: 'REPAID', amountPaise: 150_000 } }),
    -250_000,
  );
});

test("a statement's opening balance sums every contact, not just the last one", () => {
  // Regression: `balanceAfterPaise` is one person's running balance, so taking the last
  // row's gave whichever contact sorted last. Correct for one person, silently wrong for
  // "everyone" the moment there were two.
  const mother = makePerson('Mother', 'MOTHER', 'p-mother');
  const ravi = makePerson('Ravi', 'BROTHER', 'p-ravi');
  const ledger = [
    makeTransaction({ date: '2026-08-01', type: 'RECEIVED', amount: '10000.00', personId: mother.id, id: 'a' }),
    makeTransaction({ date: '2026-08-02', type: 'LENT', amount: '4000.00', personId: ravi.id, id: 'b' }),
    makeTransaction({ date: '2026-08-03', type: 'RETURNED', amount: '2000.00', personId: mother.id, id: 'c' }),
    makeTransaction({ date: '2026-09-05', type: 'RECEIVED', amount: '500.00', personId: mother.id, id: 'd' }),
  ];

  const september = buildStatement(ledger, '2026-09-01', '2026-09-30');
  // ₹10,000 − ₹2,000 held for Mother, less ₹4,000 lent to Ravi.
  assert.equal(september.openingBalancePaise, 400_000);
  assert.equal(september.closingBalancePaise, 450_000);

  // Taking the last row's running balance would have said ₹8,000 - Mother's alone.
  assert.notEqual(september.openingBalancePaise, 800_000);
});

test('a single-person statement is unchanged by that fix', () => {
  const ledger = [
    makeTransaction({ date: '2026-07-20', type: 'RECEIVED', amount: '5000.00', id: 'a' }),
    makeTransaction({ date: '2026-08-05', type: 'RECEIVED', amount: '3000.00', id: 'b' }),
    makeTransaction({ date: '2026-08-11', type: 'RETURNED', amount: '1000.00', id: 'c' }),
  ];
  const statement = buildStatement(ledger, '2026-08-01', '2026-08-31');
  assert.equal(statement.openingBalancePaise, 500_000);
  assert.equal(statement.receivedPaise, 300_000);
  assert.equal(statement.returnedPaise, 100_000);
  assert.equal(statement.closingBalancePaise, 700_000);
});

test('a statement built from a fetched page matches one built from the rows', () => {
  // The screen builds statements from what the database sent; the tests check that
  // against replaying every row. If these ever disagree, the paged path is lying.
  const ledger = [
    makeTransaction({ date: '2026-07-20', type: 'RECEIVED', amount: '5000.00', id: 'a' }),
    makeTransaction({ date: '2026-08-05', type: 'RECEIVED', amount: '3000.00', id: 'b' }),
    makeTransaction({ date: '2026-08-11', type: 'RETURNED', amount: '1000.00', id: 'c' }),
  ];
  const fromRows = buildStatement(ledger, '2026-08-01', '2026-08-31');

  // What the server would send: the period's entries, and the opening balance it summed.
  const periodEntries = buildRunningBalances(ledger).filter(
    (entry) =>
      entry.transaction.transaction_date >= '2026-08-01' &&
      entry.transaction.transaction_date <= '2026-08-31',
  );
  const fromPage = statementFromEntries(periodEntries, 500_000, '2026-08-01', '2026-08-31');

  assert.equal(fromPage.openingBalancePaise, fromRows.openingBalancePaise);
  assert.equal(fromPage.receivedPaise, fromRows.receivedPaise);
  assert.equal(fromPage.returnedPaise, fromRows.returnedPaise);
  assert.equal(fromPage.closingBalancePaise, fromRows.closingBalancePaise);
  assert.deepEqual(
    fromPage.entries.map((entry) => entry.transaction.id),
    fromRows.entries.map((entry) => entry.transaction.id),
  );
});
