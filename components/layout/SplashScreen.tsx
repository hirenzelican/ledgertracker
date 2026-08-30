'use client';

/**
 * The launch screen.
 *
 * It is part of the prerendered HTML, so it paints with the first frame - before React
 * hydrates and long before Supabase answers. It stays until two things are true: the app
 * actually has something to show, and it has been visible long enough not to read as a
 * flicker. A hard ceiling stops a slow network from holding the app hostage.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { PotliLogo } from '@/components/ui/PotliLogo';
import { useAuth } from '@/components/providers/AuthProvider';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';
import {
  ACTIVE_SPLASH_VARIANT,
  SPLASH_MAXIMUM_MS,
  SPLASH_MINIMUM_MS,
  type SplashVariant,
} from '@/lib/brand/splash';

export function SplashScreen({ variant = ACTIVE_SPLASH_VARIANT }: { variant?: SplashVariant }) {
  const { status: authStatus } = useAuth();
  const { status: ledgerStatus } = useLedger();
  const { t } = useTranslation();

  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const minimum = setTimeout(() => setMinimumElapsed(true), SPLASH_MINIMUM_MS);
    const maximum = setTimeout(() => setTimedOut(true), SPLASH_MAXIMUM_MS);
    return () => {
      clearTimeout(minimum);
      clearTimeout(maximum);
    };
  }, []);

  // Signed out, there is nothing to fetch: the login screen is ready as soon as auth is.
  const appReady =
    authStatus !== 'loading' && (authStatus !== 'signed-in' || ledgerStatus !== 'loading');
  const finished = timedOut || (appReady && minimumElapsed);

  useEffect(() => {
    if (!finished) return;
    // Let the fade play out before the element leaves the tree.
    const timer = setTimeout(() => setDismissed(true), 320);
    return () => clearTimeout(timer);
  }, [finished]);

  if (dismissed) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 transition-opacity duration-300',
        `splash-${variant}`,
        finished && 'pointer-events-none opacity-0',
      )}
      style={{ backgroundColor: 'rgb(13 108 92)' }}
    >
      <div className="relative flex h-32 w-32 items-center justify-center">
        {variant === 'ripple' ? (
          <>
            <span className="splash-ring absolute inset-0 rounded-full border-2 border-white/50" />
            <span
              className="splash-ring absolute inset-0 rounded-full border-2 border-white/50"
              style={{ animationDelay: '0.66s' }}
            />
            <span
              className="splash-ring absolute inset-0 rounded-full border-2 border-white/50"
              style={{ animationDelay: '1.32s' }}
            />
          </>
        ) : null}

        <div className="splash-mark relative h-28 w-28 overflow-hidden">
          <PotliLogo className="h-full w-full" />
          {variant === 'shimmer' ? (
            <span className="splash-shimmer-sweep absolute inset-y-0 -left-1/3 w-1/3 bg-white/35 blur-md" />
          ) : null}
        </div>
      </div>

      <div className="splash-caption px-8 text-center">
        <p className="text-2xl font-semibold tracking-tight text-white">{t('app.name')}</p>
        <p className="mt-1 text-sm text-white/75">{t('app.tagline')}</p>
      </div>
    </div>
  );
}
