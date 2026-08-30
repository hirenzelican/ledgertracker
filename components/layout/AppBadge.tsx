'use client';

/**
 * A count on the installed app's icon.
 *
 * This is as close as a web app gets to a home-screen widget, and it is worth being
 * straight about the gap: a real Android widget - one that draws your balance on the
 * home screen - needs native code (an `AppWidgetProvider` in a Kotlin app, or a TWA
 * wrapper around this one). No browser API can do it, and the `widgets` manifest field
 * that looks like it can is Windows-only.
 *
 * What the Badging API *can* do is put a number on the icon. So it carries the two
 * things that are actually actionable at a glance: how many people owe you money, and
 * how many repeating entries are waiting to be added. Not a balance - a badge is a
 * count, and "₹8,000" rendered as a count would be a lie about what the number means.
 *
 * Support is patchy (installed PWAs on Chromium, and not at all on iOS), so every call
 * is guarded and failure is silent: a missing badge is not worth an error message.
 */

import { useEffect } from 'react';
import { useLedger } from '@/components/providers/LedgerProvider';
import { useRecurring } from '@/components/providers/RecurringProvider';

const STORAGE_KEY = 'potli-badge-enabled';

/**
 * The lib DOM types already declare these as required, which they are not: they are
 * absent on Safari and on any browser where the app is not installed. Describing the
 * optional shape separately keeps every call site honest about that.
 */
interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export function badgingSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof (navigator as unknown as BadgeNavigator).setAppBadge === 'function';
}

export function badgeEnabled(): boolean {
  try {
    // On by default where it works: a count nobody asked for is still less surprising
    // than an app that silently knows something and does not say so.
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setBadgeEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Not persisting the preference is harmless; it simply resets next launch.
  }
}

export function AppBadge() {
  const { personBalances, status } = useLedger();
  const { due } = useRecurring();

  const owing = personBalances.filter((entry) => entry.balancePaise < 0).length;
  const count = owing + due.length;

  useEffect(() => {
    if (status !== 'ready' || !badgingSupported()) return;
    const badging = navigator as unknown as BadgeNavigator;

    if (!badgeEnabled()) {
      void badging.clearAppBadge?.().catch(() => {});
      return;
    }
    if (count > 0) {
      void badging.setAppBadge?.(count).catch(() => {});
    } else {
      void badging.clearAppBadge?.().catch(() => {});
    }
  }, [count, status]);

  return null;
}
