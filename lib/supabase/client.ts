'use client';

/**
 * The single Supabase browser client.
 *
 * Only the public anon key ever reaches this file. The service-role key must never be
 * referenced anywhere in this project: the app is a static bundle, so every value here
 * ends up in the browser. Access control lives in Postgres via Row Level Security.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const AUTH_STORAGE_KEY = 'potli-auth';
const LEGACY_AUTH_STORAGE_KEY = 'mothers-money-auth';

/**
 * The storage key changed with the rename to Potli. Moving the existing session across
 * keeps everyone signed in; without this the rename would silently log them out.
 */
function migrateLegacySession(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const legacy = window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (existing === null && legacy !== null) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, legacy);
      window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    }
  } catch {
    // Storage can throw in private browsing; the user signs in again, nothing breaks.
  }
}

let cachedClient: SupabaseClient | null = null;

/**
 * Returns the shared client, or throws if the environment variables are missing.
 * Callers that can render without a client should check `isSupabaseConfigured` first.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  if (!cachedClient) {
    migrateLegacySession();
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: AUTH_STORAGE_KEY,
      },
    });
  }
  return cachedClient;
}
