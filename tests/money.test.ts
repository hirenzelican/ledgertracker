import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  formatRupees,
  paiseToRupeeString,
  parseAmountInput,
  rupeeStringToPaise,
} from '@/lib/calculations/money';

test('parses Postgres numeric strings into paise', () => {
  assert.equal(rupeeStringToPaise('10000.00'), 1_000_000);
  assert.equal(rupeeStringToPaise('1250.50'), 125_050);
  assert.equal(rupeeStringToPaise('0.05'), 5);
  assert.equal(rupeeStringToPaise('7'), 700);
  assert.equal(rupeeStringToPaise('1250.5'), 125_050);
});

test('rejects amounts that are not decimal numbers', () => {
  assert.throws(() => rupeeStringToPaise('abc'));
  assert.throws(() => rupeeStringToPaise(''));
});

test('renders paise back as a NUMERIC(12,2) literal', () => {
  assert.equal(paiseToRupeeString(1_000_000), '10000.00');
  assert.equal(paiseToRupeeString(125_050), '1250.50');
  assert.equal(paiseToRupeeString(5), '0.05');
  assert.equal(paiseToRupeeString(0), '0.00');
});

test('round-trips decimal amounts without floating point drift', () => {
  // 0.1 + 0.2 in floating point is 0.30000000000000004; in paise it is exact.
  const total = rupeeStringToPaise('0.10') + rupeeStringToPaise('0.20');
  assert.equal(paiseToRupeeString(total), '0.30');

  let running = 0;
  for (let i = 0; i < 1000; i += 1) running += rupeeStringToPaise('1250.50');
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
