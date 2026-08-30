'use client';

/**
 * The repeating-entry rules, and the moment a due one becomes real money.
 *
 * Kept apart from `LedgerProvider` because a rule is not a transaction and must never be
 * mistaken for one: nothing here is ever added to a balance. When a due entry is posted,
 * the database creates the transaction and this asks the ledger to reload, which is the
 * only way the two ever meet.
 *
 * Nothing posts on its own. A static app has no server to run a schedule, and inserting
 * financial records nobody asked for would be worse than useless anyway - so what is due
 * is offered, and the user says yes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  deleteRecurrence,
  dueNow,
  fetchRecurrences,
  insertRecurrence,
  postDueRecurring,
  setRecurrenceActive,
  updateRecurrence,
} from '@/lib/supabase/recurring';
import { toMessageKey } from '@/lib/supabase/errors';
import { todayIso } from '@/lib/format/date';
import { useAuth } from './AuthProvider';
import { useLedger } from './LedgerProvider';
import { useTranslation } from './LanguageProvider';
import type { Recurrence, RecurrenceInput, Transaction } from '@/types/transaction';

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

interface RecurringContextValue {
  rules: Recurrence[];
  /** Rules that would post right now. Read-only - nothing has been created. */
  due: Recurrence[];
  status: 'loading' | 'ready' | 'error';
  refresh: () => Promise<void>;
  addRule: (input: RecurrenceInput) => Promise<Result<Recurrence>>;
  editRule: (id: string, input: RecurrenceInput) => Promise<Result<Recurrence>>;
  toggleRule: (id: string, active: boolean) => Promise<Result<Recurrence>>;
  removeRule: (id: string) => Promise<Result<null>>;
  /** Creates every due entry and reloads the ledger. Safe to call twice. */
  postDue: () => Promise<Result<Transaction[]>>;
  /** Set when the user has said "not now", so the prompt stops asking this session. */
  dismissed: boolean;
  dismiss: () => void;
}

const RecurringContext = createContext<RecurringContextValue | null>(null);

export function RecurringProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const { refresh: refreshLedger } = useLedger();
  const { t } = useTranslation();
  const [rules, setRules] = useState<Recurrence[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      setRules(await fetchRecurrences());
      setStatus('ready');
    } catch {
      // A ledger that loads without its rules is still a working ledger, so this fails
      // quietly: the prompt simply does not appear.
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'signed-in') {
      void load();
    } else if (authStatus === 'signed-out' || authStatus === 'unconfigured') {
      setRules([]);
      setStatus('ready');
    }
  }, [authStatus, load]);

  const due = useMemo(() => dueNow(rules, todayIso()), [rules]);

  const addRule = useCallback(
    async (input: RecurrenceInput): Promise<Result<Recurrence>> => {
      if (!user) return { ok: false, message: t('error.signInAgain') };
      try {
        const saved = await insertRecurrence(input, user.id);
        setRules((current) => [...current, saved]);
        return { ok: true, value: saved };
      } catch (error) {
        return { ok: false, message: t(toMessageKey(error, 'error.save')) };
      }
    },
    [t, user],
  );

  const editRule = useCallback(
    async (id: string, input: RecurrenceInput): Promise<Result<Recurrence>> => {
      try {
        const saved = await updateRecurrence(id, input);
        setRules((current) => current.map((rule) => (rule.id === id ? saved : rule)));
        return { ok: true, value: saved };
      } catch (error) {
        return { ok: false, message: t(toMessageKey(error, 'error.save')) };
      }
    },
    [t],
  );

  const toggleRule = useCallback(
    async (id: string, active: boolean): Promise<Result<Recurrence>> => {
      try {
        const saved = await setRecurrenceActive(id, active);
        setRules((current) => current.map((rule) => (rule.id === id ? saved : rule)));
        return { ok: true, value: saved };
      } catch (error) {
        return { ok: false, message: t(toMessageKey(error, 'error.save')) };
      }
    },
    [t],
  );

  const removeRule = useCallback(
    async (id: string): Promise<Result<null>> => {
      try {
        await deleteRecurrence(id);
        setRules((current) => current.filter((rule) => rule.id !== id));
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, message: t(toMessageKey(error, 'error.delete')) };
      }
    },
    [t],
  );

  const postDue = useCallback(async (): Promise<Result<Transaction[]>> => {
    try {
      const created = await postDueRecurring();
      // The rules have moved on and the ledger has new rows, so both are re-read rather
      // than patched: what the database did is the only account worth showing.
      await Promise.all([load(), refreshLedger()]);
      return { ok: true, value: created };
    } catch (error) {
      return { ok: false, message: t(toMessageKey(error, 'recurring.postFailed')) };
    }
  }, [load, refreshLedger, t]);

  const value = useMemo(
    () => ({
      rules,
      due,
      status,
      refresh: load,
      addRule,
      editRule,
      toggleRule,
      removeRule,
      postDue,
      dismissed,
      dismiss: () => setDismissed(true),
    }),
    [rules, due, status, load, addRule, editRule, toggleRule, removeRule, postDue, dismissed],
  );

  return <RecurringContext.Provider value={value}>{children}</RecurringContext.Provider>;
}

export function useRecurring(): RecurringContextValue {
  const context = useContext(RecurringContext);
  if (!context) throw new Error('useRecurring must be used inside RecurringProvider');
  return context;
}
