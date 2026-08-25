/**
 * Translates Supabase / network failures into messages a person can act on.
 * Raw Postgrest codes and SQL text are never shown to the user.
 */

export const GENERIC_SAVE_ERROR =
  'Something went wrong while saving the transaction. Please try again.';
export const GENERIC_LOAD_ERROR =
  'Could not load your transactions. Check your connection and try again.';

interface MaybePostgrestError {
  code?: string;
  message?: string;
  details?: string;
  status?: number;
  name?: string;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * `fallback` is what the user sees unless the failure is one we can explain better.
 */
export function toFriendlyMessage(error: unknown, fallback: string): string {
  if (isOffline()) {
    return 'You appear to be offline. Reconnect and try again - nothing was saved.';
  }

  const candidate = (error ?? {}) as MaybePostgrestError;
  const code = candidate.code;
  const message = candidate.message ?? '';

  if (message.includes('Failed to fetch') || candidate.name === 'TypeError') {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (code === 'PGRST301' || candidate.status === 401 || message.includes('JWT')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (code === '23514') {
    return 'That transaction is not valid. Check the amount, type and method.';
  }
  if (code === '23505') {
    return 'That transaction already exists.';
  }
  if (code === '42501' || candidate.status === 403) {
    return 'You do not have permission to change that transaction.';
  }
  if (candidate.status === 429) {
    return 'Too many requests. Wait a moment and try again.';
  }
  if (typeof candidate.status === 'number' && candidate.status >= 500) {
    return 'The server is temporarily unavailable. Please try again in a moment.';
  }
  return fallback;
}

/** Friendly wording for the handful of auth failures worth distinguishing. */
export function toFriendlyAuthMessage(error: unknown): string {
  const candidate = (error ?? {}) as MaybePostgrestError;
  const message = (candidate.message ?? '').toLowerCase();

  if (isOffline()) return 'You appear to be offline. Reconnect and try again.';
  if (message.includes('invalid login credentials')) {
    return 'That email or password is not correct.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email address first, then sign in.';
  }
  if (message.includes('rate limit') || candidate.status === 429) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (message.includes('failed to fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Could not sign you in. Please try again.';
}
