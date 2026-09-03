/**
 * The last known contacts and balances, kept so the app opens without a connection.
 *
 * Queueing an entry is only half of working offline. The other half is being able to
 * make one: recording money means choosing who it was with, and the contact list comes
 * from the server like everything else. Without this, a cold start on a dead connection
 * showed an error screen and an empty picker - which is precisely the market-with-one-bar
 * situation the queue was built for.
 *
 * What is kept here is a copy, never a source of truth. It is written after every
 * successful read and only ever read when the network one fails, so a figure from it is
 * as fresh as the last time the app had a signal - no older, and never used in preference
 * to a live answer. Queued entries are folded on top of it exactly as they are folded on
 * top of a live one.
 */

import type { PersonBalance, TagCount } from '@/types/transaction';

const KEY = 'potli-snapshot';
const VERSION = 1;

interface Snapshot {
  v: number;
  userId: string;
  savedAt: string;
  balances: PersonBalance[];
  tags: TagCount[];
}

export function writeSnapshot(
  userId: string,
  balances: readonly PersonBalance[],
  tags: readonly TagCount[],
): void {
  try {
    const snapshot: Snapshot = {
      v: VERSION,
      userId,
      savedAt: new Date().toISOString(),
      balances: [...balances],
      tags: [...tags],
    };
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // A full or disabled storage costs the offline start, nothing else.
  }
}

/** The stored copy for this account, or null when there is nothing usable. */
export function readSnapshot(
  userId: string,
): { balances: PersonBalance[]; tags: TagCount[]; savedAt: string } | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const snapshot = parsed as Partial<Snapshot>;
    if (snapshot.v !== VERSION) return null;
    // Someone else's copy is not shown to whoever is signed in now.
    if (snapshot.userId !== userId) return null;
    if (!Array.isArray(snapshot.balances) || !Array.isArray(snapshot.tags)) return null;
    // One spot check, because a half-written entry here becomes a crash on the dashboard.
    if (snapshot.balances.some((entry) => typeof entry?.person?.id !== 'string')) return null;

    return {
      balances: snapshot.balances,
      tags: snapshot.tags,
      savedAt: typeof snapshot.savedAt === 'string' ? snapshot.savedAt : '',
    };
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it, and nothing depends on it.
  }
}
