'use client';

/**
 * Every screen except /login renders inside this gate. It waits for Supabase to restore
 * the session, sends signed-out visitors to the login screen, and explains the problem
 * plainly when the app has not been configured with Supabase keys.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { LoadingPanel } from '@/components/ui/Spinner';
import { useTranslation } from '@/components/providers/LanguageProvider';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signed-out') router.replace('/login/');
  }, [status, router]);

  if (status === 'unconfigured') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-ink">{t('login.notConnected')}</h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">{t('login.notConnectedBody')}</p>
      </div>
    );
  }

  if (status !== 'signed-in') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingPanel label={t('common.loading')} />
      </div>
    );
  }

  return <>{children}</>;
}
