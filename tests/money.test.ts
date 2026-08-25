import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  formatRupees,
  paiseToRupeeString,
  parseAmountInput,
  amountToPaise,
} from '@/lib/calculations/money';

test('parses Postgres numeric strings into paise', () => {
  assert.equal(amountToPaise('10000.00'), 1_000_000);
  assert.equal(amountToPaise('1250.50'), 125_050);
  assert.equal(amountToPaise('0.05'), 5);
  assert.equal(amountToPaise('7'), 700);
  assert.equal(amountToPaise('1250.5'), 125_050);
});

test('parses the JSON numbers PostgREST sends for a numeric column', () => {
  // `to_json(numeric)` emits an unquoted number, so this is what actually arrives.
  assert.equal(amountToPaise(10000), 1_000_000);
  assert.equal(amountToPaise(7500), 750_000);
  assert.equal(amountToPaise(1250.5), 125_050);
  assert.equal(amountToPaise(1250.55), 125_055);
  assert.equal(amountToPaise(0.05), 5);
  assert.equal(amountToPaise(9999999999.99), 999_999_999_999);
});

test('number and string forms of the same amount agree exactly', () => {
  for (const [text, value] of [
    ['0.10', 0.1],
    ['0.20', 0.2],
    ['0.30', 0.3],
    ['1250.50', 1250.5],
    ['8753.50', 8753.5],
  ] as const) {
    assert.equal(amountToPaise(value), amountToPaise(text), `${value} vs ${text}`);
  }
});

test('rejects amounts that are not decimal numbers', () => {
  assert.throws(() => amountToPaise('abc'));
  assert.throws(() => amountToPaise(''));
  assert.throws(() => amountToPaise(Number.NaN));
  assert.throws(() => amountToPaise(Number.POSITIVE_INFINITY));
});

test('renders paise back as a NUMERIC(12,2) literal', () => {
  assert.equal(paiseToRupeeString(1_000_000), '10000.00');
  assert.equal(paiseToRupeeString(125_050), '1250.50');
  assert.equal(paiseToRupeeString(5), '0.05');
  assert.equal(paiseToRupeeString(0), '0.00');
});

test('round-trips decimal amounts without floating point drift', () => {
  // 0.1 + 0.2 in floating point is 0.30000000000000004; in paise it is exact.
  const total = amountToPaise('0.10') + amountToPaise('0.20');
  assert.equal(paiseToRupeeString(total), '0.30');

  let running = 0;
  for (let i = 0; i < 1000; i += 1) running += amountToPaise('1250.50');
  assert.equal(paiseToRupeeString(running), '1250500.00');
});

test('parses what a person types into the amount field', () => {
  assert.equal(parseAmountInput('1250'), 125_000);
  assert.equal(parseAmountInput('1,250.50'), 125_050);
  assert.equal(parseAmountInput(' ₹2000 '), 200_000);
  assert.equal(parseAmountInput('0.5'), 50);
  assert.equal(parseAmountInput('.5'), 50);
  assert.equal(parseAmountInput(''), null);
  assert.equal(parseAmountInput('abc'), null);
  assert.equal(parseAmountInput('1.234'), null);
  assert.equal(parseAmountInput('-100'), null);
});

test('formats amounts with Indian digit grouping', () => {
  assert.equal(formatRupees(100_000), '₹1,000');
  assert.equal(formatRupees(1_000_000), '₹10,000');
  assert.equal(formatRupees(10_000_000), '₹1,00,000');
  assert.equal(formatRupees(100_000_000), '₹10,00,000');
  assert.equal(formatRupees(1_000_000_000), '₹1,00,00,000');
  assert.equal(formatRupees(0), '₹0');
});

test('shows paise only when the amount has them', () => {
  assert.equal(formatRupees(125_050), '₹1,250.50');
  assert.equal(formatRupees(125_000), '₹1,250');
  assert.equal(formatRupees(125_000, { alwaysShowPaise: true }), '₹1,250.00');
});
