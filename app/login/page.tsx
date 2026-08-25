'use client';

/**
 * Sign-in for the single owner of this ledger. Two methods, no registration funnel:
 * an email/password sign-in (with a one-time "create account" path for first run) and
 * a magic link for when the password is not at hand.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { LoadingPanel } from '@/components/ui/Spinner';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

type Mode = 'password' | 'magic-link' | 'create';

export default function LoginPage() {
  const { status, signInWithPassword, signUpWithPassword, sendMagicLink } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'signed-in') router.replace('/');
  }, [status, router]);

  if (status === 'unconfigured') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-ink">Not connected yet</h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          Add your Supabase URL and anon key to <code>.env.local</code> and rebuild. The README
          walks through the whole setup.
        </p>
      </main>
    );
  }

  if (status === 'loading' || status === 'signed-in') {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <LoadingPanel label="Loading..." />
      </main>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setNotice(null);

    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode !== 'magic-link' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'magic-link') {
        const result = await sendMagicLink(email);
        if (result.error) setError(result.error);
        else setNotice('Check your email for the sign-in link.');
      } else if (mode === 'create') {
        const result = await signUpWithPassword(email, password);
        if (result.error) setError(result.error);
        else if (result.needsConfirmation) {
          setNotice('Account created. Confirm your email address, then sign in.');
          setMode('password');
        }
      } else {
        const result = await signInWithPassword(email, password);
        if (result.error) setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <OfflineBanner />
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-brand-ink"
          >
            ₹
          </div>
          <h1 className="text-2xl font-semibold text-ink">Mother&rsquo;s Money</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">
            Sign in to see the balance you are holding.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="card space-y-4 p-5">
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            required
          />

          {mode !== 'magic-link' ? (
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              enterKeyHint="go"
              hint={mode === 'create' ? 'At least 8 characters.' : undefined}
              required
            />
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-returned-soft px-4 py-3 text-sm font-medium text-ink">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-ink">
              {notice}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={busy}
            loadingLabel={mode === 'magic-link' ? 'Sending...' : 'Signing in...'}
          >
            {mode === 'magic-link'
              ? 'Send magic link'
              : mode === 'create'
                ? 'Create account'
                : 'Sign in'}
          </Button>

          <div className="flex flex-col gap-1 pt-1 text-center text-sm">
            <button
              type="button"
              className="min-h-[40px] font-medium text-brand"
              onClick={() => {
                setMode(mode === 'magic-link' ? 'password' : 'magic-link');
                setError(null);
                setNotice(null);
              }}
            >
              {mode === 'magic-link' ? 'Use password instead' : 'Email me a magic link instead'}
            </button>
            <button
              type="button"
              className="min-h-[40px] text-ink-faint"
              onClick={() => {
                setMode(mode === 'create' ? 'password' : 'create');
                setError(null);
                setNotice(null);
              }}
            >
              {mode === 'create' ? 'I already have an account' : 'First time? Create your account'}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
