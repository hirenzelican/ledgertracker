import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isAlreadyWritten, isRetryable, newRowId } from '@/lib/offline/outbox';

/* ------------------------------------------------------ what may be queued and retried */

test('a request that never got an answer is worth keeping', () => {
  // `fetch` rejecting is the shape of a request that did not reach anything.
  assert.equal(isRetryable(new TypeError('Failed to fetch')), true);
  assert.equal(isRetryable({ message: 'Failed to fetch' }), true);
});

test('a server that answered has made a decision, and it is not requeued', () => {
  // Retrying any of these forever, while telling the user it was saved, is the failure
  // mode this whole feature could have had.
  assert.equal(isRetryable({ status: 401, code: 'PGRST301', message: 'JWT expired' }), false);
  assert.equal(isRetryable({ status: 403, code: '42501' }), false, 'refused by RLS');
  assert.equal(isRetryable({ status: 400, code: '23514' }), false, 'violates a constraint');
  assert.equal(isRetryable({ status: 500 }), false, 'the server is broken, not absent');
  assert.equal(isRetryable({ status: 429 }), false, 'rate limited, not unreachable');
});

test('an unrecognised failure is not queued', () => {
  // Anything that cannot be shown to be a transport failure is reported instead. The
  // wrong way round would silently swallow real errors.
  assert.equal(isRetryable(null), false);
  assert.equal(isRetryable(undefined), false);
  assert.equal(isRetryable(new Error('something else entirely')), false);
  assert.equal(isRetryable({ message: 'row level security' }), false);
});

test('a duplicate key on a queued insert is a success, not a failure', () => {
  // The row landed and the answer went missing. Treating this as an error would leave
  // the entry stuck in the queue forever, retried on every reconnect.
  assert.equal(isAlreadyWritten({ code: '23505' }), true);
  assert.equal(isAlreadyWritten({ code: '23514' }), false);
  assert.equal(isAlreadyWritten(new TypeError('Failed to fetch')), false);
  assert.equal(isAlreadyWritten(null), false);
});

/* ------------------------------------------------------------------------- row ids */

test('row ids are unique, so a queue cannot collide with itself', () => {
  const ids = new Set(Array.from({ length: 1000 }, newRowId));
  assert.equal(ids.size, 1000);
});

test('a row id is a uuid, because that is what the column holds', () => {
  assert.match(newRowId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
