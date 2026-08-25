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
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'mothers-money-auth',
      },
    });
  }
  return cachedClient;
}
