'use client';

/**
 * Fetches history a page at a time.
 *
 * This is what replaced holding the whole ledger in memory. A screen states which slice
 * it wants - one contact, a direction, a date range, a note search - and gets back the
 * rows for it plus the totals for the whole slice, computed by the database over rows
 * that are never downloaded. Opening a screen costs one query whether the history is
 * fifty rows or fifty thousand.
 *
 * Every row arrives carrying its own running balance, so page three renders the same
 * figures it would have if pages one and two had been fetched. That property comes from
 * the `transaction_ledger` view and is the reason paging is safe here at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchLedgerPage, fetchLedgerSummary } from '@/lib/supabase/transactions';
import { toMessageKey } from '@/lib/supabase/errors';
import { useLedger } from './LedgerProvider';
import { useTranslation } from './LanguageProvider';
import type { LedgerQuery, LedgerSummary, TransactionWithBalance } from '@/types/transaction';

export const DEFAULT_PAGE_SIZE = 25;

export interface LedgerPageState {
  /** The rows fetched so far, newest first. */
  entries: TransactionWithBalance[];
  /** How many rows match the query in total, not how many are loaded. */
  total: number;
  /** Money in and out across the whole query, not just the loaded rows. */
  summary: LedgerSummary;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  hasMore: boolean;
  /** True while a "show more" is in flight, so the button can say so. */
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

const EMPTY_SUMMARY: LedgerSummary = {
  moneyInPaise: 0,
  moneyOutPaise: 0,
  count: 0,
  openingBalancePaise: 0,
};

export function useLedgerPage(
  query: LedgerQuery,
  options?: { pageSize?: number; enabled?: boolean },
): LedgerPageState {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const enabled = options?.enabled ?? true;
  const { version } = useLedger();
  const { t } = useTranslation();

  const [entries, setEntries] = useState<TransactionWithBalance[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<LedgerSummary>(EMPTY_SUMMARY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // A query object is rebuilt on every render, so compare its contents rather than its
  // identity - otherwise the effect below would refetch forever.
  const queryKey = JSON.stringify(query);

  // Only the newest request may write to state. Typing in the search box fires several
  // in quick succession, and without this a slow early one could land last and show
  // results for a query the user has already moved on from.
  const requestId = useRef(0);

  // Deliberately not keyed on the provider's load status: this query does not wait for
  // the contact list, and re-running when that flipped from loading to ready meant every
  // screen fetched its first page twice.
  useEffect(() => {
    if (!enabled) {
      setStatus('ready');
      setEntries([]);
      setTotal(0);
      setSummary(EMPTY_SUMMARY);
      return;
    }

    const currentRequest = ++requestId.current;
    const parsed = JSON.parse(queryKey) as LedgerQuery;
    setStatus('loading');
    setError(null);

    void (async () => {
      try {
        const [page, totals] = await Promise.all([
          fetchLedgerPage(parsed, { offset: 0, limit: pageSize }),
          fetchLedgerSummary(parsed),
        ]);
        if (currentRequest !== requestId.current) return;
        setEntries(page.entries);
        setTotal(page.total);
        setSummary(totals);
        setStatus('ready');
      } catch (caught) {
        if (currentRequest !== requestId.current) return;
        setError(t(toMessageKey(caught, 'error.load')));
        setStatus('error');
      }
    })();
  }, [enabled, pageSize, queryKey, reloadToken, t, version]);

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    const currentRequest = requestId.current;
    const parsed = JSON.parse(queryKey) as LedgerQuery;
    setLoadingMore(true);

    void (async () => {
      try {
        const page = await fetchLedgerPage(parsed, {
          offset: entries.length,
          limit: pageSize,
        });
        // The query may have changed while this was in flight; appending then would
        // splice two different searches together.
        if (currentRequest !== requestId.current) return;
        setEntries((current) => {
          // Guard against a row arriving twice if something was inserted underneath the
          // offset between the two requests.
          const seen = new Set(current.map((entry) => entry.transaction.id));
          return [...current, ...page.entries.filter((entry) => !seen.has(entry.transaction.id))];
        });
        setTotal(page.total);
      } catch (caught) {
        if (currentRequest !== requestId.current) return;
        setError(t(toMessageKey(caught, 'error.load')));
      } finally {
        if (currentRequest === requestId.current) setLoadingMore(false);
      }
    })();
  }, [entries.length, loadingMore, pageSize, queryKey, t]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return useMemo(
    () => ({
      entries,
      total,
      summary,
      status,
      error,
      hasMore: entries.length < total,
      loadingMore,
      loadMore,
      reload,
    }),
    [entries, total, summary, status, error, loadingMore, loadMore, reload],
  );
}
