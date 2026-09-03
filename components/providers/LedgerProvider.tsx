'use client';

/**
 * Holds the contacts and their balances, and exposes every mutation the UI needs.
 *
 * What this deliberately does *not* hold is the transactions. The ledger is paged out of
 * the database a screen at a time (see `useLedgerPage`), so opening the app costs one
 * query for the contact list however long the history is. The figures that used to need
 * every row - balances, totals, running balances - are computed by the `person_balances`
 * and `transaction_ledger` views instead.
 *
 * Nothing stores a balance, here or there. Every figure is derived at read time, so
 * editing or deleting history cannot leave a stale total anywhere. Writes are confirmed
 * by Supabase before local state changes: the UI never claims a transaction was saved
 * when it was not.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { applyChangePaise, signedDeltaPaise, summariseStanding } from '@/lib/calculations/balance';
import {
  deletePerson as deletePersonRow,
  fetchPersonBalances,
  insertPerson,
  updatePerson as updatePersonRow,
} from '@/lib/supabase/people';
import {
  deleteTransaction as deleteTransactionRow,
  fetchAllTransactions,
  insertTransaction,
  insertTransactionsBatch,
  deleteAllTransactions,
  projectedRow,
  updateTransaction as updateTransactionRow,
} from '@/lib/supabase/transactions';
import { clearSnapshot, readSnapshot, writeSnapshot } from '@/lib/offline/snapshot';
import {
  dequeue,
  enqueue,
  isAlreadyWritten,
  isOutboxSupported,
  isQueued,
  isRetryable,
  newRowId,
  readOutbox,
  type QueuedEntry,
} from '@/lib/offline/outbox';
import { fetchTagCounts } from '@/lib/supabase/tags';
import { toMessageKey } from '@/lib/supabase/errors';
import { useTranslation } from './LanguageProvider';
import { amountToPaise, formatRupees } from '@/lib/calculations/money';

import type { BackupRowInput } from '@/lib/validation/backup';

import { useAuth } from './AuthProvider';
import type { Standing } from '@/lib/calculations/balance';
import type { Translate } from '@/lib/i18n/locales';
import type {
  LedgerTotals,
  Person,
  PersonBalance,
  PersonInput,
  TagCount,
  Transaction,
  TransactionInput,
  TransactionType,
} from '@/types/transaction';

export type MutationResult =
  | { ok: true; transaction: Transaction }
  /**
   * `overridable` marks a warning rather than a refusal: the change is legal, but its
   * consequence is surprising often enough to be worth a second look. The user is
   * allowed to insist.
   */
  | { ok: false; message: string; overridable?: boolean };

export type PersonResult = { ok: true; person: Person } | { ok: false; message: string };

export interface MutationOptions {
  /** Proceed despite a warning about the change's consequence. */
  allowUnusual?: boolean;
}

/** A transaction reduced to its effect on a balance. */
export interface BalanceChange {
  type: TransactionType;
  amountPaise: number;
}

interface LedgerContextValue {
  people: Person[];
  /** Per-person figures, most money held first. */
  personBalances: PersonBalance[];
  /** Tags already in use, most-used first. Counted in the database, not here. */
  tagCounts: TagCount[];
  /** How much is held for others, and how much others owe. */
  standing: Standing;
  totals: LedgerTotals;
  addPerson: (input: PersonInput) => Promise<PersonResult>;
  editPerson: (id: string, input: PersonInput) => Promise<PersonResult>;
  removePerson: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  refresh: () => Promise<void>;
  /**
   * Bumped whenever the ledger changes. Paged views watch it to know their page is
   * stale - it is the one thing that has to be shared, now that no screen holds the
   * whole list.
   */
  version: number;
  addTransaction: (input: TransactionInput, options?: MutationOptions) => Promise<MutationResult>;
  editTransaction: (
    /** The row being replaced. Needed in full: its old effect has to come back out of
     * the balance before the new one goes in. */
    previous: Transaction,
    input: TransactionInput,
    options?: MutationOptions,
  ) => Promise<MutationResult>;
  removeTransaction: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Restores backup rows, creating any people they refer to that do not exist yet. */
  importTransactions: (
    rows: readonly BackupRowInput[],
    mode: 'merge' | 'replace',
  ) => Promise<{ ok: true; imported: number } | { ok: false; message: string }>;
  /**
   * Balance for one person if this change were applied, in paise. Balances are always
   * per person: money held for a brother cannot fund a return to a mother.
   */
  balanceIfApplied: (
    personId: string,
    change: { exclude?: BalanceChange; include?: BalanceChange },
  ) => number;
  /** That person's balance right now, in paise. Zero for someone unknown. */
  balanceFor: (personId: string) => number;
  /**
   * Entries saved without a connection and not yet sent, oldest first. They are already
   * counted in every balance on screen - a save that does not move the figure it is
   * about reads as a save that did not happen.
   */
  pending: QueuedEntry[];
  /** True while the queue is being sent. */
  sending: boolean;
  /** Sends whatever is queued. Safe to call when there is nothing to send. */
  flushOutbox: () => Promise<void>;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

/** The person's name for use in a message, or a neutral fallback. */
function nameOf(people: readonly Person[], personId: string): string {
  return people.find((person) => person.id === personId)?.name ?? 'their';
}

/**
 * Warns about a change with a surprising consequence, and explains it in the terms the
 * user thinks in. Nothing is refused: now that lending is tracked, a negative balance is
 * a real state rather than an impossible one, so every combination is legitimate. What
 * is left is catching the mistyped amount - returning ₹5,000 when only ₹500 is held is
 * far more often a slip than a spontaneous loan.
 */
function warnAboutConsequence(
  beforePaise: number,
  input: TransactionInput,
  personName: string,
  t: Translate,
): { message: string; overridable: boolean } | null {
  const after = applyChangePaise(beforePaise, {
    include: { type: input.type, amountPaise: input.amountPaise },
  });

  // Paying out more of someone's money than is being held turns the excess into a loan.
  if (input.type === 'RETURNED' && after < 0) {
    const held = Math.max(beforePaise, 0);
    return {
      overridable: true,
      message:
        beforePaise <= 0
          ? t('warn.returnWithNothing', { name: personName, excess: formatRupees(-after) })
          : t('warn.overReturn', {
              name: personName,
              held: formatRupees(held),
              excess: formatRupees(-after),
            }),
    };
  }

  // Being paid back more than was lent means the surplus is now money being held.
  if (input.type === 'REPAID' && after > 0 && beforePaise < 0) {
    return {
      overridable: true,
      message: t('warn.overRepaid', {
        name: personName,
        owed: formatRupees(-beforePaise),
        excess: formatRupees(after),
      }),
    };
  }

  return null;
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const userId = user?.id ?? null;
  const { t } = useTranslation();
  const [serverBalances, setServerBalances] = useState<PersonBalance[]>([]);
  // Read inside `load` without making it a dependency: it only asks whether anything has
  // been loaded yet, and depending on the balances would rebuild the loader on every
  // change to them.
  const serverBalancesRef = useRef<PersonBalance[]>([]);
  const [pending, setPending] = useState<QueuedEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setLoadError(null);

    // Shown before the request, not after it fails. A dead connection does not reject
    // quickly - the client retries first - so waiting for the failure meant staring at a
    // spinner for the better part of ten seconds before the app admitted it had the
    // figures all along. Live results replace these the moment they arrive.
    const cached = userId ? readSnapshot(userId) : null;
    if (cached && serverBalancesRef.current.length === 0) {
      setServerBalances(cached.balances);
      setTagCounts(cached.tags);
      setStatus('ready');
    }

    try {
      // Both are small and independent, so they go together rather than in sequence.
      const [balances, tags] = await Promise.all([fetchPersonBalances(), fetchTagCounts()]);
      if (currentRequest !== requestId.current) return;
      setServerBalances(balances);
      setTagCounts(tags);
      setStatus('ready');
      if (userId) writeSnapshot(userId, balances, tags);
    } catch (error) {
      if (currentRequest !== requestId.current) return;

      // The last known figures rather than an error screen. Opening the app with no
      // signal has to leave you able to record something, and recording something means
      // having the contact list - an empty picker behind an error message is the same as
      // the app not working at all. The offline banner is on every screen already,
      // saying why these figures may be behind.
      if (cached) {
        setServerBalances(cached.balances);
        setTagCounts(cached.tags);
        setStatus('ready');
        return;
      }

      setLoadError(t(toMessageKey(error, 'error.load')));
      setStatus('error');
    }
  }, [t, userId]);

  /** Re-reads the balances and tells every paged view its page is out of date. */
  const invalidate = useCallback(async () => {
    setVersion((current) => current + 1);
    try {
      const [balances, tags] = await Promise.all([fetchPersonBalances(), fetchTagCounts()]);
      setServerBalances(balances);
      setTagCounts(tags);
      if (userId) writeSnapshot(userId, balances, tags);
    } catch {
      // A failed refresh leaves the previous figures on screen, which is better than
      // blanking them. The next mutation or a pull-to-refresh will try again.
    }
  }, [userId]);

  // Whatever is queued belongs in the figures before the first paint, or the balance
  // jumps a moment after the screen settles.
  useEffect(() => {
    if (!user) {
      setPending([]);
      return;
    }
    void readOutbox(user.id).then(setPending);
  }, [user]);

  useEffect(() => {
    if (authStatus === 'signed-in') {
      void load();
    } else if (authStatus === 'signed-out' || authStatus === 'unconfigured') {
      requestId.current++;
      clearSnapshot();
      setServerBalances([]);
      setTagCounts([]);
      setStatus(authStatus === 'signed-out' ? 'ready' : 'error');
      setLoadError(authStatus === 'unconfigured' ? t('error.notConfigured') : null);
    }
  }, [authStatus, load, t]);

  /**
   * The balances the screens actually show: what the server has, plus what is still
   * waiting to reach it.
   *
   * Folding these in is not a nicety. An entry saved with no signal that leaves every
   * figure unmoved is indistinguishable from one that was dropped, and the user's next
   * move is to type it again. Money in and out and the transaction count move with it,
   * so nothing on screen disagrees with anything else while the queue drains.
   */
  const personBalances = useMemo((): PersonBalance[] => {
    if (pending.length === 0) return serverBalances;

    const byPerson = new Map(serverBalances.map((entry) => [entry.person.id, { ...entry }]));
    for (const queued of pending) {
      const entry = byPerson.get(queued.input.person_id);
      // A queued entry for a contact the balances have not heard of is dropped from the
      // figures rather than invented: the contact row is the server's to provide.
      if (!entry) continue;
      const delta = signedDeltaPaise(queued.input.type, queued.input.amountPaise);
      entry.balancePaise += delta;
      if (delta > 0) entry.moneyInPaise += delta;
      else entry.moneyOutPaise += -delta;
      entry.count += 1;
      if (
        entry.lastTransactionDate === null ||
        queued.input.transaction_date > entry.lastTransactionDate
      ) {
        entry.lastTransactionDate = queued.input.transaction_date;
      }
    }

    // Re-sorted on the same rule the server uses, so a queued entry that changes who you
    // hold the most for moves that row now rather than on the next refresh.
    return [...byPerson.values()].sort((a, b) => {
      const weight = (value: number) => (value === 0 ? 1 : 0);
      if (weight(a.balancePaise) !== weight(b.balancePaise)) {
        return weight(a.balancePaise) - weight(b.balancePaise);
      }
      if (a.balancePaise !== b.balancePaise) return b.balancePaise - a.balancePaise;
      return a.person.name.localeCompare(b.person.name);
    });
  }, [pending, serverBalances]);

  useEffect(() => {
    serverBalancesRef.current = serverBalances;
  }, [serverBalances]);

  const people = useMemo(
    () =>
      serverBalances
        .map((entry) => entry.person)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [serverBalances],
  );

  const balanceFor = useCallback(
    (personId: string) =>
      personBalances.find((entry) => entry.person.id === personId)?.balancePaise ?? 0,
    [personBalances],
  );

  const balanceIfApplied = useCallback(
    (personId: string, change: { exclude?: BalanceChange; include?: BalanceChange }) =>
      applyChangePaise(balanceFor(personId), change),
    [balanceFor],
  );

  const standing = useMemo(() => summariseStanding(personBalances), [personBalances]);

  /**
   * Ledger-wide totals, added up from the per-person figures rather than from the rows.
   * Only `lastTransactionDate` needs a comparison: the rest are sums of sums.
   */
  const totals = useMemo((): LedgerTotals => {
    let moneyInPaise = 0;
    let moneyOutPaise = 0;
    let count = 0;
    let lastTransactionDate: string | null = null;
    for (const entry of personBalances) {
      moneyInPaise += entry.moneyInPaise;
      moneyOutPaise += entry.moneyOutPaise;
      count += entry.count;
      if (
        entry.lastTransactionDate !== null &&
        (lastTransactionDate === null || entry.lastTransactionDate > lastTransactionDate)
      ) {
        lastTransactionDate = entry.lastTransactionDate;
      }
    }
    return {
      balancePaise: moneyInPaise - moneyOutPaise,
      moneyInPaise,
      moneyOutPaise,
      count,
      lastTransactionDate,
    };
  }, [personBalances]);

  const addPerson = useCallback(
    async (input: PersonInput): Promise<PersonResult> => {
      if (!user) return { ok: false, message: t('error.signInAgain') };
      try {
        const saved = await insertPerson(input, user.id);
        setServerBalances((current) => [
          ...current,
          {
            person: saved,
            balancePaise: 0,
            moneyInPaise: 0,
            moneyOutPaise: 0,
            count: 0,
            lastTransactionDate: null,
          },
        ]);
        return { ok: true, person: saved };
      } catch (error) {
        const message =
          (error as { code?: string }).code === '23505'
            ? t('people.duplicate')
            : t(toMessageKey(error, 'people.addFailed'));
        return { ok: false, message };
      }
    },
    [t, user],
  );

  const editPerson = useCallback(
    async (id: string, input: PersonInput): Promise<PersonResult> => {
      try {
        const saved = await updatePersonRow(id, input);
        setServerBalances((current) =>
          current.map((entry) => (entry.person.id === id ? { ...entry, person: saved } : entry)),
        );
        return { ok: true, person: saved };
      } catch (error) {
        const message =
          (error as { code?: string }).code === '23505'
            ? t('people.duplicate')
            : t(toMessageKey(error, 'people.saveFailed'));
        return { ok: false, message };
      }
    },
    [t],
  );

  const removePerson = useCallback(
    async (id: string) => {
      // The database refuses this while history remains; say so in plain words rather
      // than letting a foreign-key error reach the user. The count comes from the
      // balances view, so this holds however long their history is.
      const entry = personBalances.find((balance) => balance.person.id === id);
      if (entry && entry.count > 0) {
        return { ok: false as const, message: t('people.hasHistory') };
      }
      try {
        await deletePersonRow(id);
        setServerBalances((current) => current.filter((balance) => balance.person.id !== id));
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          message: t(toMessageKey(error, 'people.removeFailed')),
        };
      }
    },
    [personBalances, t],
  );

  const addTransaction = useCallback(
    async (input: TransactionInput, options?: MutationOptions): Promise<MutationResult> => {
      if (!user) return { ok: false, message: t('error.signInAgain') };

      const warning = warnAboutConsequence(
        balanceFor(input.person_id),
        input,
        nameOf(people, input.person_id),
        t,
      );
      if (warning && !(warning.overridable && options?.allowUnusual)) {
        return { ok: false, message: warning.message, overridable: warning.overridable };
      }

      // Chosen here rather than by Postgres, so that if this write turns out to have
      // landed after all, the retry from the queue collides instead of duplicating.
      const identity = { id: newRowId(), createdAt: new Date().toISOString() };

      const queueIt = async (): Promise<MutationResult> => {
        const queued: QueuedEntry = {
          id: identity.id,
          userId: user.id,
          input,
          queuedAt: identity.createdAt,
        };
        if (!(await enqueue(queued))) {
          return { ok: false, message: t(toMessageKey(null, 'error.save')) };
        }
        setPending((current) => [...current, queued]);
        setVersion((current) => current + 1);
        return { ok: true, transaction: projectedRow(input, user.id, identity) };
      };

      // No point asking a network that is not there. `navigator.onLine` is only a hint,
      // but it is a reliable one in the direction that matters: when it says offline, it
      // is, and the request would only fail slowly.
      if (isOutboxSupported() && typeof navigator !== 'undefined' && navigator.onLine === false) {
        return queueIt();
      }

      try {
        const saved = await insertTransaction(input, user.id, identity);
        await invalidate();
        return { ok: true, transaction: saved };
      } catch (error) {
        // A server that answered has made a decision; only a missing answer is something
        // a queue can fix. See `isRetryable`.
        if (isOutboxSupported() && isRetryable(error)) return queueIt();
        return { ok: false, message: t(toMessageKey(error, 'error.save')) };
      }
    },
    [balanceFor, invalidate, people, t, user],
  );

  /**
   * Sends the queue, oldest first and one at a time.
   *
   * Order matters more than speed here: these are entries the user made in a sequence,
   * and firing them off together would have them land in whatever order the requests
   * happened to finish. One failure stops the run rather than skipping past it, so a
   * connection that drops halfway leaves a queue that is still in order.
   */
  const flushOutbox = useCallback(async () => {
    if (!user || sending) return;
    const queue = await readOutbox(user.id);
    if (queue.length === 0) return;

    setSending(true);
    let sent = 0;
    try {
      for (const queued of queue) {
        try {
          await insertTransaction(queued.input, user.id, {
            id: queued.id,
            createdAt: queued.queuedAt,
          });
        } catch (error) {
          // The row is already there from an attempt whose answer went missing. That is
          // this queue working, not failing.
          if (!isAlreadyWritten(error)) break;
        }
        await dequeue(queued.id);
        sent += 1;
      }
    } finally {
      setPending(await readOutbox(user.id));
      setSending(false);
      if (sent > 0) await invalidate();
    }
  }, [invalidate, sending, user]);

  const editTransaction = useCallback(
    async (
      previous: Transaction,
      input: TransactionInput,
      options?: MutationOptions,
    ): Promise<MutationResult> => {
      // The balance to judge against is the person's with the old row taken back out -
      // otherwise correcting a typo would be measured against the typo.
      const withoutPrevious = applyChangePaise(balanceFor(input.person_id), {
        exclude:
          previous.person_id === input.person_id
            ? { type: previous.type, amountPaise: amountToPaise(previous.amount) }
            : undefined,
      });

      const warning = warnAboutConsequence(
        withoutPrevious,
        input,
        nameOf(people, input.person_id),
        t,
      );
      if (warning && !(warning.overridable && options?.allowUnusual)) {
        return { ok: false, message: warning.message, overridable: warning.overridable };
      }

      // Refused rather than queued, and said plainly. An edit queued for later would be
      // replayed against a row that may have changed on another device in between, and
      // there is no honest way to resolve that without having seen it.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { ok: false, message: t('error.offlineEdit') };
      }

      try {
        const saved = await updateTransactionRow(previous.id, input);
        await invalidate();
        return { ok: true, transaction: saved };
      } catch (error) {
        return { ok: false, message: t(toMessageKey(error, 'error.save')) };
      }
    },
    [balanceFor, invalidate, people, t],
  );

  // Sent on the way back, and once on arrival in case the app was closed mid-queue.
  useEffect(() => {
    if (authStatus !== 'signed-in') return;
    void flushOutbox();
    const onOnline = () => void flushOutbox();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [authStatus, flushOutbox]);

  const removeTransaction = useCallback(
    async (id: string) => {
      // Undo of an entry that never left the device. The server has never heard of it,
      // so asking it to delete one would delete nothing and report success.
      if (await isQueued(id)) {
        await dequeue(id);
        setPending((current) => current.filter((queued) => queued.id !== id));
        setVersion((current) => current + 1);
        return { ok: true } as const;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { ok: false as const, message: t('error.offlineEdit') };
      }
      try {
        await deleteTransactionRow(id);
        await invalidate();
        return { ok: true } as const;
      } catch (error) {
        return {
          ok: false as const,
          message: t(toMessageKey(error, 'error.delete')),
        };
      }
    },
    [invalidate, t],
  );

  const importTransactions = useCallback(
    async (rows: readonly BackupRowInput[], mode: 'merge' | 'replace') => {
      if (!user) return { ok: false as const, message: t('error.signInAgain') };
      try {
        if (mode === 'replace') {
          await deleteAllTransactions(user.id);
        }

        // Map each name in the backup onto a person, creating those that are new. Names
        // are matched case-insensitively so "mother" and "Mother" do not become two pots.
        const byName = new Map(people.map((person) => [person.name.toLowerCase(), person]));
        for (const row of rows) {
          const key = row.personName.toLowerCase();
          if (byName.has(key)) continue;
          const person = await insertPerson(
            {
              name: row.personName,
              relationship: row.personRelationship,
              phone: '',
              email: '',
              note: '',
            },
            user.id,
          );
          byName.set(key, person);
        }

        const inputs: TransactionInput[] = rows.map((row) => ({
          person_id: byName.get(row.personName.toLowerCase())!.id,
          transaction_date: row.transaction_date,
          type: row.type,
          amountPaise: row.amountPaise,
          method: row.method,
          note: row.note,
          tags: row.tags ?? [],
        }));

        await insertTransactionsBatch(inputs, user.id);
        // Re-read from the database so what is on screen matches exactly what was stored.
        await invalidate();
        return { ok: true as const, imported: inputs.length };
      } catch (error) {
        await invalidate();
        return {
          ok: false as const,
          message: t(toMessageKey(error, 'error.importFailed')),
        };
      }
    },
    [invalidate, people, t, user],
  );

  const value = useMemo(
    () => ({
      people,
      personBalances,
      pending,
      sending,
      flushOutbox,
      tagCounts,
      standing,
      totals,
      addPerson,
      editPerson,
      removePerson,
      status,
      loadError,
      refresh: load,
      version,
      addTransaction,
      editTransaction,
      removeTransaction,
      importTransactions,
      balanceIfApplied,
      balanceFor,
    }),
    [
      people,
      personBalances,
      pending,
      sending,
      flushOutbox,
      tagCounts,
      standing,
      totals,
      addPerson,
      editPerson,
      removePerson,
      status,
      loadError,
      load,
      version,
      addTransaction,
      editTransaction,
      removeTransaction,
      importTransactions,
      balanceIfApplied,
      balanceFor,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext);
  if (!context) throw new Error('useLedger must be used inside LedgerProvider');
  return context;
}

/** Every transaction the user has, fetched on demand for an export or a backup. */
export { fetchAllTransactions };
