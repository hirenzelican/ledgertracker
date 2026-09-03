/**
 * Entries written while there was nothing to write to.
 *
 * The moment this exists for is standing in a market with one bar of signal, having just
 * handed someone money. Refusing the save there - which is what the app did before - asks
 * the user to remember the amount until they get home, which is exactly the job they
 * installed Potli to stop doing.
 *
 * Two rules make the queue safe to have:
 *
 *   1. The row id is generated here, not by Postgres. A flush that commits and then loses
 *      the response would otherwise insert the same entry twice on retry; with the id
 *      fixed up front, the retry collides on the primary key and that collision *is* the
 *      confirmation. `23505` on a queued insert means the row already landed.
 *   2. `created_at` is the moment it was queued, not the moment it was sent. Same-day
 *      entries are ordered by it, so a batch that flushes together must not collapse into
 *      whatever order the requests happened to complete in.
 *
 * Only new entries are queued. Editing and deleting still need a connection, and say so:
 * replaying a change against a row whose current state you have not seen for an hour is a
 * different and much worse problem than replaying an insert.
 */

import type { TransactionInput } from '@/types/transaction';

const DB_NAME = 'potli-outbox';
const DB_VERSION = 1;
const STORE = 'entries';

export interface QueuedEntry {
  /** The row id this will be inserted under. Chosen here so a retry cannot duplicate. */
  id: string;
  userId: string;
  input: TransactionInput;
  /** ISO timestamp; becomes the row's `created_at` so ordering survives the delay. */
  queuedAt: string;
}

/** A fresh id for a row, whether it is going out now or later. */
export function newRowId(): string {
  return crypto.randomUUID();
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/**
 * Whether the outbox can be used at all.
 *
 * IndexedDB is missing in a few real situations - a private window in some browsers, a
 * storage policy that blocks it. Where it is, the app keeps its old behaviour of asking
 * for a connection rather than pretending to save.
 */
export function isOutboxSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function readOutbox(userId: string): Promise<QueuedEntry[]> {
  if (!isOutboxSupported()) return [];
  try {
    const all = await run<QueuedEntry[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedEntry[]>);
    return all
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : a.queuedAt > b.queuedAt ? 1 : 0));
  } catch {
    return [];
  }
}

export async function enqueue(entry: QueuedEntry): Promise<boolean> {
  if (!isOutboxSupported()) return false;
  try {
    await run('readwrite', (store) => store.put(entry));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether this row is still sitting in the queue.
 *
 * Asked of the database rather than of a copy in React state. Undo runs from a closure
 * built in the render that *started* the save, which is one render before the queue
 * state updates - so a mirrored list would have been consulted a moment too early and
 * reported the entry as already sent.
 */
export async function isQueued(id: string): Promise<boolean> {
  if (!isOutboxSupported()) return false;
  try {
    const found = await run<QueuedEntry | undefined>(
      'readonly',
      (store) => store.get(id) as IDBRequest<QueuedEntry | undefined>,
    );
    return found !== undefined;
  } catch {
    return false;
  }
}

export async function dequeue(id: string): Promise<void> {
  if (!isOutboxSupported()) return;
  try {
    await run('readwrite', (store) => store.delete(id));
  } catch {
    // Left in the queue, where the next flush will meet the duplicate-key case above and
    // clear it. Losing the delete costs a retry, never a lost entry.
  }
}

/**
 * Whether a failed write is worth keeping to try again.
 *
 * Only the transport counts. A server that answered - a constraint violation, a refused
 * permission, an expired token - has made a decision, and queueing that would mean
 * retrying it forever while telling the user it was saved. The absence of an answer is
 * the only thing this queue can fix.
 */
export function isRetryable(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const candidate = (error ?? {}) as { name?: string; message?: string; status?: number };
  if (typeof candidate.status === 'number') return false;
  if (candidate.name === 'TypeError') return true;
  return (candidate.message ?? '').includes('Failed to fetch');
}

/** A duplicate primary key on a queued insert means a previous attempt did land. */
export function isAlreadyWritten(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}
