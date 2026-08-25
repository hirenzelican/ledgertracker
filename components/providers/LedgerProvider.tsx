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
  calculateTotals,
  firstNegativeBalanceDate,
  projectedBalancePaise,
  sortChronological,
  toLedgerEntries,
} from '@/lib/calculations/balance';
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
import { formatDisplayDate } from '@/lib/format/date';
import { useAuth } from './AuthProvider';
import type {
  LedgerTotals,
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

export interface MutationOptions {
  /** Proceed even though the balance dips below zero mid-history. */
  allowNegativeHistory?: boolean;
}

interface LedgerContextValue {
  transactions: Transaction[];
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
  importTransactions: (
    inputs: readonly TransactionInput[],
    mode: 'merge' | 'replace',
  ) => Promise<{ ok: true; imported: number } | { ok: false; message: string }>;
  /** Balance the ledger would have if this change were applied, in paise. */
  balanceIfApplied: (change: {
    excludeId?: string;
    include?: { type: TransactionInput['type']; amountPaise: number };
  }) => number;
  findTransaction: (id: string) => Transaction | undefined;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

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
): { message: string; overridable: boolean } | null {
  const remaining = transactions.filter((transaction) => transaction.id !== excludeId);

  const finalBalance = projectedBalancePaise(transactions, {
    excludeId,
    include: { type: input.type, amountPaise: input.amountPaise },
  });
  const check = checkBalanceNotNegative(finalBalance, projectedBalancePaise(remaining, {}));
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
      message: `This makes the balance negative on ${formatDisplayDate(negativeDate)}, because nothing earlier accounts for it yet. If you are still adding older transactions, that is expected.`,
      overridable: true,
    };
  }

  return null;
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setLoadError(null);
    try {
      const rows = await fetchTransactions();
      if (currentRequest !== requestId.current) return;
      setTransactions(sortChronological(rows));
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
      setStatus(authStatus === 'signed-out' ? 'ready' : 'error');
      setLoadError(
        authStatus === 'unconfigured'
          ? 'This app is not connected to a database yet. Add your Supabase keys and rebuild.'
          : null,
      );
    }
  }, [authStatus, load]);

  const balanceIfApplied = useCallback(
    (change: {
      excludeId?: string;
      include?: { type: TransactionInput['type']; amountPaise: number };
    }) => projectedBalancePaise(transactions, change),
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

      const rejection = rejectIfNegative(transactions, input, undefined);
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
    [transactions, user],
  );

  const editTransaction = useCallback(
    async (
      id: string,
      input: TransactionInput,
      options?: MutationOptions,
    ): Promise<MutationResult> => {
      const rejection = rejectIfNegative(transactions, input, id);
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
    [transactions],
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
    async (inputs: readonly TransactionInput[], mode: 'merge' | 'replace') => {
      if (!user) return { ok: false as const, message: 'Please sign in again to restore a backup.' };
      try {
        if (mode === 'replace') {
          await deleteAllTransactions(user.id);
        }
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
    [load, user],
  );

  const findTransaction = useCallback(
    (id: string) => transactions.find((transaction) => transaction.id === id),
    [transactions],
  );

  const value = useMemo(
    () => ({
      transactions,
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
