'use client';

/**
 * Holds whether the app is currently locked, and everything that changes it.
 *
 * Two moments lock it: a cold start with a PIN set, and coming back to a tab that has
 * been in the background longer than the grace period. The grace period exists because
 * the alternative - re-asking every time you glance at WhatsApp to read out a number -
 * is how a lock gets switched off for good.
 *
 * The record is keyed to the account that set it, so signing out and letting someone
 * else sign in on the same phone does not confront them with a PIN they never chose.
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
import { useAuth } from './AuthProvider';
import {
  afterFailure,
  makePinRecord,
  parseAttempts,
  parsePinRecord,
  isPinSupported,
  remainingBlockMs,
  verifyPin,
  NO_ATTEMPTS,
  type AttemptState,
  type PinRecord,
} from '@/lib/security/pin';

const RECORD_KEY = 'potli-pin';
const ATTEMPTS_KEY = 'potli-pin-attempts';

/**
 * How long the app may sit in the background before it locks again. Long enough to take
 * a call or copy a UPI reference out of another app; short enough that a phone left on a
 * table is not still open ten minutes later.
 */
const GRACE_MS = 60_000;

interface PinContextValue {
  /**
   * False until storage has been read for the signed-in account. Screens must not paint
   * before this: a single frame of someone's balances behind a lock that arrives late is
   * the whole thing the lock was for.
   */
  ready: boolean;
  /** Whether this account can have one at all; see `isPinSupported`. */
  supported: boolean;
  /** Whether this account has set one on this device. */
  hasPin: boolean;
  /** Whether the lock screen should be covering everything right now. */
  locked: boolean;
  /** Milliseconds left on a cooldown after too many wrong entries, or 0. */
  blockedForMs: number;
  failures: number;
  /** Returns false for a wrong PIN, having recorded the failure. */
  unlock: (pin: string) => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  removePin: () => void;
  /** Locks immediately, without waiting for the app to be backgrounded. */
  lockNow: () => void;
}

const PinContext = createContext<PinContextValue | null>(null);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // A browser refusing storage costs the lock, not the app.
  }
}

export function PinProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [record, setRecord] = useState<PinRecord | null>(null);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState<AttemptState>(NO_ATTEMPTS);
  const [blockedForMs, setBlockedForMs] = useState(0);

  // A record belonging to a different account is ignored rather than deleted: two people
  // sharing a phone should each keep their own, and signing back in should find it.
  useEffect(() => {
    if (userId === null) {
      setRecord(null);
      setLocked(false);
      setReady(true);
      return;
    }
    const stored = parsePinRecord(read(RECORD_KEY));
    const mine = stored && stored.userId === userId ? stored : null;
    setRecord(mine);
    setAttempts(parseAttempts(read(ATTEMPTS_KEY)));
    // A cold start is always locked. This runs once the session is restored, which is
    // also the first moment there is anything behind the lock worth covering.
    setLocked(mine !== null);
    setReady(true);
  }, [userId]);

  // Coming back from the background. `visibilitychange` fires on tab switches, on the
  // app being sent to the home screen, and on the screen being turned off - the three
  // ways a phone leaves your hands.
  useEffect(() => {
    if (record === null) return;
    let hiddenAt = 0;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== 0 && Date.now() - hiddenAt > GRACE_MS) setLocked(true);
      hiddenAt = 0;
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [record]);

  // Counts a cooldown down so the lock screen can say how long is left, and re-enables
  // itself on its own rather than needing a tap to find out.
  useEffect(() => {
    const tick = () => setBlockedForMs(remainingBlockMs(attempts, Date.now()));
    tick();
    if (attempts.blockedUntil <= Date.now()) return;
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [attempts]);

  const unlock = useCallback(
    async (pin: string) => {
      if (record === null) return true;
      if (remainingBlockMs(attempts, Date.now()) > 0) return false;

      if (await verifyPin(pin, record)) {
        setAttempts(NO_ATTEMPTS);
        write(ATTEMPTS_KEY, null);
        setLocked(false);
        return true;
      }

      // Persisted, so reloading the page is not a way around the wait.
      const next = afterFailure(attempts, Date.now());
      setAttempts(next);
      write(ATTEMPTS_KEY, JSON.stringify(next));
      return false;
    },
    [attempts, record],
  );

  const setPin = useCallback(
    async (pin: string) => {
      if (userId === null) return;
      const next = await makePinRecord(pin, userId);
      write(RECORD_KEY, JSON.stringify(next));
      write(ATTEMPTS_KEY, null);
      setAttempts(NO_ATTEMPTS);
      setRecord(next);
      setLocked(false);
    },
    [userId],
  );

  const removePin = useCallback(() => {
    write(RECORD_KEY, null);
    write(ATTEMPTS_KEY, null);
    setAttempts(NO_ATTEMPTS);
    setRecord(null);
    setLocked(false);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      supported: isPinSupported(),
      hasPin: record !== null,
      locked,
      blockedForMs,
      failures: attempts.failures,
      unlock,
      setPin,
      removePin,
      lockNow: () => setLocked(record !== null),
    }),
    [attempts.failures, blockedForMs, locked, ready, record, removePin, setPin, unlock],
  );

  return <PinContext.Provider value={value}>{children}</PinContext.Provider>;
}

export function usePin(): PinContextValue {
  const context = useContext(PinContext);
  if (!context) throw new Error('usePin must be used inside PinProvider');
  return context;
}
