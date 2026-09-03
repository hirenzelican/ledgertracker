import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  afterFailure,
  cooldownMs,
  isDigits,
  makePinRecord,
  parseAttempts,
  parsePinRecord,
  remainingBlockMs,
  verifyPin,
  NO_ATTEMPTS,
  PBKDF2_ITERATIONS,
  PIN_LENGTH,
} from '@/lib/security/pin';

/* ------------------------------------------------------------------- the hashing */

test('a PIN verifies against its own record and nothing else', async () => {
  const record = await makePinRecord('4821', 'user-1');
  assert.equal(await verifyPin('4821', record), true);
  assert.equal(await verifyPin('4822', record), false);
  assert.equal(await verifyPin('1284', record), false);
  assert.equal(await verifyPin('', record), false);
});

test('the PIN itself is nowhere in what gets stored', async () => {
  const record = await makePinRecord('1379', 'user-1');
  const stored = JSON.stringify(record);
  assert.ok(!stored.includes('1379'), stored);
  // Nor as the bytes of it, which is the version of this mistake that looks fine.
  assert.ok(!stored.includes(Buffer.from('1379').toString('base64')), stored);
});

test('the same PIN gives a different record every time', async () => {
  // A shared salt would let two devices with the same PIN be spotted as the same PIN,
  // and would make one precomputed table cover everybody.
  const a = await makePinRecord('0000', 'user-1');
  const b = await makePinRecord('0000', 'user-1');
  assert.notEqual(a.saltB64, b.saltB64);
  assert.notEqual(a.hashB64, b.hashB64);
  // Both still verify.
  assert.equal(await verifyPin('0000', a), true);
  assert.equal(await verifyPin('0000', b), true);
});

test('the record carries the cost it was made with, so it can be raised later', async () => {
  const record = await makePinRecord('2468', 'user-1');
  assert.equal(record.iterations, PBKDF2_ITERATIONS);
  assert.ok(record.iterations >= 100_000, String(record.iterations));
  // An old record made with a lower cost still verifies against its own number.
  const cheap = { ...record, iterations: 1000 };
  assert.equal(await verifyPin('2468', cheap), false, 'a changed cost must not still match');
});

test('a record belongs to the account that made it', async () => {
  const record = await makePinRecord('1111', 'user-1');
  assert.equal(record.userId, 'user-1');
});

/* ------------------------------------------------------------------ reading it back */

test('a stored record round-trips', async () => {
  const record = await makePinRecord('9753', 'user-1');
  assert.deepEqual(parsePinRecord(JSON.stringify(record)), record);
});

test('anything that is not a record is refused rather than trusted', () => {
  assert.equal(parsePinRecord(null), null);
  assert.equal(parsePinRecord(''), null);
  assert.equal(parsePinRecord('not json'), null);
  assert.equal(parsePinRecord('null'), null);
  assert.equal(parsePinRecord('"1234"'), null);
  assert.equal(parsePinRecord('{}'), null);
  assert.equal(parsePinRecord('{"v":2,"userId":"u","saltB64":"a","hashB64":"b","iterations":1}'), null);
  assert.equal(parsePinRecord('{"v":1,"userId":"","saltB64":"a","hashB64":"b","iterations":1}'), null);
  assert.equal(parsePinRecord('{"v":1,"userId":"u","saltB64":"a","hashB64":"b"}'), null);
  assert.equal(
    parsePinRecord('{"v":1,"userId":"u","saltB64":"a","hashB64":"b","iterations":"lots"}'),
    null,
  );
});

/* -------------------------------------------------------------------- the throttle */

test('a few wrong guesses cost nothing; a run of them costs time', () => {
  assert.equal(cooldownMs(1), 0);
  assert.equal(cooldownMs(4), 0);
  assert.equal(cooldownMs(5), 30_000);
  assert.equal(cooldownMs(6), 60_000);
  assert.equal(cooldownMs(7), 120_000);
});

test('the wait is capped, so a fumbled evening is not a locked-out week', () => {
  assert.equal(cooldownMs(9), 300_000);
  assert.equal(cooldownMs(50), 300_000);
  assert.equal(cooldownMs(5000), 300_000);
});

test('working through every four-digit PIN would take days, not minutes', () => {
  // 10,000 possibilities. Past the free attempts each one costs at least the cap, so a
  // patient attacker at the keypad is looking at weeks rather than an afternoon.
  let total = 0;
  for (let guess = 1; guess <= 10_000; guess += 1) total += cooldownMs(guess);
  const days = total / 1000 / 60 / 60 / 24;
  assert.ok(days > 30, `${days.toFixed(1)} days`);
});

test('failures accumulate and set a deadline', () => {
  const now = 1_000_000;
  let state = NO_ATTEMPTS;
  for (let i = 0; i < 4; i += 1) state = afterFailure(state, now);
  assert.equal(state.failures, 4);
  assert.equal(state.blockedUntil, 0, 'four wrong entries still cost nothing');

  state = afterFailure(state, now);
  assert.equal(state.failures, 5);
  assert.equal(state.blockedUntil, now + 30_000);
  assert.equal(remainingBlockMs(state, now), 30_000);
  assert.equal(remainingBlockMs(state, now + 29_000), 1_000);
  assert.equal(remainingBlockMs(state, now + 30_000), 0);
  assert.equal(remainingBlockMs(state, now + 999_999), 0);
});

test('a tampered or missing attempt count reads as a clean slate, never as a free pass', () => {
  // The worst this can do is forgive a cooldown; it must never produce a negative wait
  // or a NaN that compares false against everything.
  assert.deepEqual(parseAttempts(null), NO_ATTEMPTS);
  assert.deepEqual(parseAttempts('garbage'), NO_ATTEMPTS);
  assert.deepEqual(parseAttempts('{"failures":"many"}'), NO_ATTEMPTS);
  assert.deepEqual(parseAttempts('{"failures":-5,"blockedUntil":0}'), NO_ATTEMPTS);
  assert.equal(parseAttempts('{"failures":3,"blockedUntil":7}').failures, 3);
});

/* ------------------------------------------------------------------------- shape */

test('only four digits count as a PIN', () => {
  assert.equal(PIN_LENGTH, 4);
  assert.equal(isDigits('0000'), true);
  assert.equal(isDigits('123'), false);
  assert.equal(isDigits('12345'), false);
  assert.equal(isDigits('12a4'), false);
  assert.equal(isDigits(' 123'), false);
  assert.equal(isDigits('१२३४'), false, 'Devanagari digits are not what the keypad emits');
});
