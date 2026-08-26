/**
 * Translates Supabase / network failures into messages a person can act on.
 * Raw Postgrest codes and SQL text are never shown to the user.
 */

import type { MessageKey } from '@/lib/i18n/en';

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
export function toMessageKey(error: unknown, fallback: MessageKey): MessageKey {
  if (isOffline()) return 'error.offline';

  const candidate = (error ?? {}) as MaybePostgrestError;
  const code = candidate.code;
  const message = candidate.message ?? '';

  if (message.includes('Failed to fetch') || candidate.name === 'TypeError') {
    return 'error.unreachable';
  }
  if (code === 'PGRST301' || candidate.status === 401 || message.includes('JWT')) {
    return 'error.sessionExpired';
  }
  if (code === '23514') return 'error.invalidData';
  if (code === '23505') return 'error.duplicate';
  if (code === '42501' || candidate.status === 403) return 'error.forbidden';
  if (candidate.status === 429) return 'error.serverBusy';
  if (typeof candidate.status === 'number' && candidate.status >= 500) return 'error.serverDown';
  return fallback;
}

/** The handful of auth failures worth distinguishing. */
export function toAuthMessageKey(error: unknown): MessageKey {
  const candidate = (error ?? {}) as MaybePostgrestError;
  const message = (candidate.message ?? '').toLowerCase();

  if (isOffline()) return 'error.offline';
  if (message.includes('invalid login credentials')) return 'error.badCredentials';
  if (message.includes('email not confirmed')) return 'error.unconfirmed';
  if (message.includes('rate limit') || candidate.status === 429) return 'error.rateLimit';
  if (message.includes('failed to fetch')) return 'error.unreachable';
  return 'error.signInFailed';
}
