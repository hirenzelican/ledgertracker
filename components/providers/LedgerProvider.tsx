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
import { applyChangePaise, summariseStanding } from '@/lib/calculations/balance';
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
  updateTransaction as updateTransactionRow,
} from '@/lib/supabase/transactions';
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
  const { t } = useTranslation();
  const [personBalances, setPersonBalances] = useState<PersonBalance[]>([]);
  const [tagCounts, setTagCounts] = useState<TagCount[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setLoadError(null);
    try {
      // Both are small and independent, so they go together rather than in sequence.
      const [balances, tags] = await Promise.all([fetchPersonBalances(), fetchTagCounts()]);
      if (currentRequest !== requestId.current) return;
      setPersonBalances(balances);
      setTagCounts(tags);
      setStatus('ready');
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setLoadError(t(toMessageKey(error, 'error.load')));
      setStatus('error');
    }
  }, [t]);

  /** Re-reads the balances and tells every paged view its page is out of date. */
  const invalidate = useCallback(async () => {
    setVersion((current) => current + 1);
    try {
      const [balances, tags] = await Promise.all([fetchPersonBalances(), fetchTagCounts()]);
      setPersonBalances(balances);
      setTagCounts(tags);
    } catch {
      // A failed refresh leaves the previous figures on screen, which is better than
      // blanking them. The next mutation or a pull-to-refresh will try again.
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'signed-in') {
      void load();
    } else if (authStatus === 'signed-out' || authStatus === 'unconfigured') {
      requestId.current++;
      setPersonBalances([]);
      setTagCounts([]);
      setStatus(authStatus === 'signed-out' ? 'ready' : 'error');
      setLoadError(authStatus === 'unconfigured' ? t('error.notConfigured') : null);
    }
  }, [authStatus, load, t]);

  const people = useMemo(
    () =>
      personBalances
        .map((entry) => entry.person)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [personBalances],
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
        setPersonBalances((current) => [
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
        setPersonBalances((current) =>
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
        setPersonBalances((current) => current.filter((balance) => balance.person.id !== id));
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

      try {
        const saved = await insertTransaction(input, user.id);
        await invalidate();
        return { ok: true, transaction: saved };
      } catch (error) {
        return { ok: false, message: t(toMessageKey(error, 'error.save')) };
      }
    },
    [balanceFor, invalidate, people, t, user],
  );

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

  const removeTransaction = useCallback(
    async (id: string) => {
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
