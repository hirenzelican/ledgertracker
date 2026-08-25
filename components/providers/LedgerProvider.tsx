'use client';

/**
 * Holds the ledger in memory and exposes every mutation the UI needs.
 *
 * The transaction list is the only state kept here. Balances, totals and running
 * balances are derived on read, so a change to one transaction cannot leave a stale
 * figure anywhere in the app. Writes are confirmed by Supabase before local state
 * changes: the UI never claims a transaction was saved when it was not.
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
import {
  buildRunningBalances,
  calculatePersonBalances,
  calculateTotals,
  firstNegativeBalanceDate,
  forPerson,
  projectedBalancePaise,
  sortChronological,
  toLedgerEntries,
} from '@/lib/calculations/balance';
import {
  deletePerson as deletePersonRow,
  fetchPeople,
  insertPerson,
  updatePerson as updatePersonRow,
} from '@/lib/supabase/people';
import {
  deleteTransaction as deleteTransactionRow,
  fetchTransactions,
  insertTransaction,
  insertTransactionsBatch,
  deleteAllTransactions,
  updateTransaction as updateTransactionRow,
} from '@/lib/supabase/transactions';
import { GENERIC_LOAD_ERROR, GENERIC_SAVE_ERROR, toFriendlyMessage } from '@/lib/supabase/errors';
import { checkBalanceNotNegative } from '@/lib/validation/transaction';
import type { BackupRowInput } from '@/lib/validation/backup';
import { formatDisplayDate } from '@/lib/format/date';
import { useAuth } from './AuthProvider';
import type {
  LedgerTotals,
  Person,
  PersonBalance,
  PersonInput,
  Transaction,
  TransactionInput,
  TransactionWithBalance,
} from '@/types/transaction';

export type MutationResult =
  | { ok: true; transaction: Transaction }
  /**
   * `overridable` marks a warning rather than a refusal: the ledger ends up positive,
   * but dips below zero part-way through its history. That is normal while back-filling
   * old transactions out of order, so the user is allowed to insist.
   */
  | { ok: false; message: string; overridable?: boolean };

export type PersonResult = { ok: true; person: Person } | { ok: false; message: string };

export interface MutationOptions {
  /** Proceed even though the balance dips below zero mid-history. */
  allowNegativeHistory?: boolean;
}

interface LedgerContextValue {
  transactions: Transaction[];
  people: Person[];
  /** Per-person figures, most money held first. */
  personBalances: PersonBalance[];
  addPerson: (input: PersonInput) => Promise<PersonResult>;
  editPerson: (id: string, input: PersonInput) => Promise<PersonResult>;
  removePerson: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Newest first, each decorated with the balance after it. */
  ledger: TransactionWithBalance[];
  totals: LedgerTotals;
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  refresh: () => Promise<void>;
  addTransaction: (input: TransactionInput, options?: MutationOptions) => Promise<MutationResult>;
  editTransaction: (
    id: string,
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
    change: {
      excludeId?: string;
      include?: { type: TransactionInput['type']; amountPaise: number };
    },
  ) => number;
  findTransaction: (id: string) => Transaction | undefined;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

/** The person's name for use in a message, or a neutral fallback. */
function nameOf(people: readonly Person[], personId: string): string {
  return people.find((person) => person.id === personId)?.name ?? 'their';
}

/**
 * Checks a change against the ledger. A final balance below zero is refused outright -
 * you cannot hold less than none of someone else's money. A dip below zero part-way
 * through history is only a warning: while back-filling old transactions, a return
 * entered before the receipts that preceded it looks negative until those are added.
 */
function rejectIfNegative(
  transactions: readonly Transaction[],
  input: TransactionInput,
  excludeId: string | undefined,
  personName: string,
): { message: string; overridable: boolean } | null {
  // Scoped to one person: each person's money is a separate pot, and holding ₹5,000 for
  // a brother does not let you return ₹5,000 to a mother.
  const remaining = forPerson(transactions, input.person_id).filter(
    (transaction) => transaction.id !== excludeId,
  );

  const finalBalance = projectedBalancePaise(remaining, {
    include: { type: input.type, amountPaise: input.amountPaise },
  });
  const check = checkBalanceNotNegative(
    finalBalance,
    projectedBalancePaise(remaining, {}),
    personName,
  );
  if (!check.ok) return { message: check.message, overridable: false };

  const negativeDate = firstNegativeBalanceDate([
    ...toLedgerEntries(remaining),
    {
      transaction_date: input.transaction_date,
      // Sorts last among transactions sharing its date, matching how it will be stored.
      created_at: new Date().toISOString(),
      type: input.type,
      amountPaise: input.amountPaise,
    },
  ]);
  if (negativeDate !== null) {
    return {
      message: `This makes ${personName}'s balance negative on ${formatDisplayDate(negativeDate)}, because nothing earlier accounts for it yet. If you are still adding older transactions, that is expected.`,
      overridable: true,
    };
  }

  return null;
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setLoadError(null);
    try {
      const [rows, peopleRows] = await Promise.all([fetchTransactions(), fetchPeople()]);
      if (currentRequest !== requestId.current) return;
      setTransactions(sortChronological(rows));
      setPeople(peopleRows);
      setStatus('ready');
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setLoadError(toFriendlyMessage(error, GENERIC_LOAD_ERROR));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'signed-in') {
      void load();
    } else if (authStatus === 'signed-out' || authStatus === 'unconfigured') {
      requestId.current++;
      setTransactions([]);
      setPeople([]);
      setStatus(authStatus === 'signed-out' ? 'ready' : 'error');
      setLoadError(
        authStatus === 'unconfigured'
          ? 'This app is not connected to a database yet. Add your Supabase keys and rebuild.'
          : null,
      );
    }
  }, [authStatus, load]);

  const balanceIfApplied = useCallback(
    (
      personId: string,
      change: {
        excludeId?: string;
        include?: { type: TransactionInput['type']; amountPaise: number };
      },
    ) => projectedBalancePaise(forPerson(transactions, personId), change),
    [transactions],
  );

  const personBalances = useMemo(
    () => calculatePersonBalances(people, transactions),
    [people, transactions],
  );

  const addPerson = useCallback(
    async (input: PersonInput): Promise<PersonResult> => {
      if (!user) return { ok: false, message: 'Please sign in again to add someone.' };
      try {
        const saved = await insertPerson(input, user.id);
        setPeople((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
        return { ok: true, person: saved };
      } catch (error) {
        const message = (error as { code?: string }).code === '23505'
          ? 'Someone with that name is already on your list.'
          : toFriendlyMessage(error, 'Could not add that person. Please try again.');
        return { ok: false, message };
      }
    },
    [user],
  );

  const editPerson = useCallback(
    async (id: string, input: PersonInput): Promise<PersonResult> => {
      try {
        const saved = await updatePersonRow(id, input);
        setPeople((current) =>
          current
            .map((person) => (person.id === id ? saved : person))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        return { ok: true, person: saved };
      } catch (error) {
        const message = (error as { code?: string }).code === '23505'
          ? 'Someone with that name is already on your list.'
          : toFriendlyMessage(error, 'Could not save that change. Please try again.');
        return { ok: false, message };
      }
    },
    [],
  );

  const removePerson = useCallback(
    async (id: string) => {
      // The database refuses this while history remains; say so in plain words.
      if (transactions.some((transaction) => transaction.person_id === id)) {
        return {
          ok: false as const,
          message:
            'Delete their transactions first. Removing someone with history would erase the record of it.',
        };
      }
      try {
        await deletePersonRow(id);
        setPeople((current) => current.filter((person) => person.id !== id));
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          message: toFriendlyMessage(error, 'Could not remove that person. Please try again.'),
        };
      }
    },
    [transactions],
  );

  const totals = useMemo(() => calculateTotals(transactions), [transactions]);

  const ledger = useMemo(
    () => buildRunningBalances(transactions).reverse(),
    [transactions],
  );

  const addTransaction = useCallback(
    async (input: TransactionInput, options?: MutationOptions): Promise<MutationResult> => {
      if (!user) return { ok: false, message: 'Please sign in again to save transactions.' };

      const rejection = rejectIfNegative(transactions, input, undefined, nameOf(people, input.person_id));
      if (rejection && !(rejection.overridable && options?.allowNegativeHistory)) {
        return { ok: false, message: rejection.message, overridable: rejection.overridable };
      }

      try {
        const saved = await insertTransaction(input, user.id);
        setTransactions((current) => sortChronological([...current, saved]));
        return { ok: true, transaction: saved };
      } catch (error) {
        return { ok: false, message: toFriendlyMessage(error, GENERIC_SAVE_ERROR) };
      }
    },
    [people, transactions, user],
  );

  const editTransaction = useCallback(
    async (
      id: string,
      input: TransactionInput,
      options?: MutationOptions,
    ): Promise<MutationResult> => {
      const rejection = rejectIfNegative(transactions, input, id, nameOf(people, input.person_id));
      if (rejection && !(rejection.overridable && options?.allowNegativeHistory)) {
        return { ok: false, message: rejection.message, overridable: rejection.overridable };
      }

      try {
        const saved = await updateTransactionRow(id, input);
        setTransactions((current) =>
          sortChronological(current.map((item) => (item.id === id ? saved : item))),
        );
        return { ok: true, transaction: saved };
      } catch (error) {
        return { ok: false, message: toFriendlyMessage(error, GENERIC_SAVE_ERROR) };
      }
    },
    [people, transactions],
  );

  const removeTransaction = useCallback(
    async (id: string) => {
      try {
        await deleteTransactionRow(id);
        setTransactions((current) => current.filter((item) => item.id !== id));
        return { ok: true } as const;
      } catch (error) {
        return {
          ok: false as const,
          message: toFriendlyMessage(
            error,
            'Something went wrong while deleting the transaction. Please try again.',
          ),
        };
      }
    },
    [],
  );

  const importTransactions = useCallback(
    async (rows: readonly BackupRowInput[], mode: 'merge' | 'replace') => {
      if (!user) return { ok: false as const, message: 'Please sign in again to restore a backup.' };
      try {
        if (mode === 'replace') {
          await deleteAllTransactions(user.id);
        }

        // Map each name in the backup onto a person, creating those that are new. Names
        // are matched case-insensitively so "mother" and "Mother" do not become two pots.
        const byName = new Map(people.map((person) => [person.name.toLowerCase(), person]));
        const created: Person[] = [];
        for (const row of rows) {
          const key = row.personName.toLowerCase();
          if (byName.has(key)) continue;
          const person = await insertPerson(
            { name: row.personName, relationship: row.personRelationship },
            user.id,
          );
          byName.set(key, person);
          created.push(person);
        }
        if (created.length > 0) {
          setPeople((current) =>
            [...current, ...created].sort((a, b) => a.name.localeCompare(b.name)),
          );
        }

        const inputs: TransactionInput[] = rows.map((row) => ({
          person_id: byName.get(row.personName.toLowerCase())!.id,
          transaction_date: row.transaction_date,
          type: row.type,
          amountPaise: row.amountPaise,
          method: row.method,
          note: row.note,
        }));

        await insertTransactionsBatch(inputs, user.id);
        // Re-read from the database so local state matches exactly what was stored.
        await load();
        return { ok: true as const, imported: inputs.length };
      } catch (error) {
        await load();
        return {
          ok: false as const,
          message: toFriendlyMessage(
            error,
            'Something went wrong while restoring the backup. Please try again.',
          ),
        };
      }
    },
    [load, people, user],
  );

  const findTransaction = useCallback(
    (id: string) => transactions.find((transaction) => transaction.id === id),
    [transactions],
  );

  const value = useMemo(
    () => ({
      transactions,
      people,
      personBalances,
      addPerson,
      editPerson,
      removePerson,
      ledger,
      totals,
      status,
      loadError,
      refresh: load,
      addTransaction,
      editTransaction,
      removeTransaction,
      importTransactions,
      balanceIfApplied,
      findTransaction,
    }),
    [
      transactions,
      people,
      personBalances,
      addPerson,
      editPerson,
      removePerson,
      ledger,
      totals,
      status,
      loadError,
      load,
      addTransaction,
      editTransaction,
      removeTransaction,
      importTransactions,
      balanceIfApplied,
      findTransaction,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const context = useContext(LedgerContext);
  if (!context) throw new Error('useLedger must be used inside LedgerProvider');
  return context;
}
