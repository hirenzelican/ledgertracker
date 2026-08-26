'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { toAuthMessageKey } from '@/lib/supabase/errors';
import { useTranslation } from './LanguageProvider';

type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'unconfigured';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  sendMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'loading' : 'unconfigured',
  );
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus(data.session ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (!active) return;
        setStatus('signed-out');
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'signed-in' : 'signed-out');
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return error ? { error: t(toAuthMessageKey(error)) } : {};
    } catch (error) {
      return { error: t(toAuthMessageKey(error)) };
    }
  }, [t]);

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) return { error: t(toAuthMessageKey(error)) };
      // Supabase returns a user without a session when email confirmation is required.
      return { needsConfirmation: data.session === null };
    } catch (error) {
      return { error: t(toAuthMessageKey(error)) };
    }
  }, [t]);

  const sendMagicLink = useCallback(async (email: string) => {
    try {
      const { error } = await getSupabaseClient().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: typeof window === 'undefined' ? undefined : `${window.location.origin}/`,
        },
      });
      return error ? { error: t(toAuthMessageKey(error)) } : {};
    } catch (error) {
      return { error: t(toAuthMessageKey(error)) };
    }
  }, [t]);

  const signOut = useCallback(async () => {
    try {
      await getSupabaseClient().auth.signOut();
    } finally {
      setSession(null);
      setStatus('signed-out');
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signInWithPassword,
      signUpWithPassword,
      sendMagicLink,
      signOut,
    }),
    [status, session, signInWithPassword, signUpWithPassword, sendMagicLink, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
