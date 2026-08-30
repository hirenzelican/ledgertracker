'use client';

import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { PotliLogo } from '@/components/ui/PotliLogo';

interface AppShellProps {
  title: string;
  /** Rendered at the right of the header, e.g. a settings link. */
  action?: ReactNode;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Mobile-first page frame: a compact header, a scrolling body constrained to a
 * comfortable phone width, and the bottom navigation. Content is padded so nothing
 * ever hides behind the fixed nav bar.
 */
export function AppShell({ title, subtitle, action, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-surface-sunken">
      <OfflineBanner />
      <header className="no-print sticky top-0 z-30 border-b border-border bg-surface-sunken/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <PotliLogo className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
              {subtitle ? <p className="truncate text-sm text-ink-faint">{subtitle}</p> : null}
            </div>
          </div>
          {action}
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">{children}</main>

      <BottomNav />
    </div>
  );
}
