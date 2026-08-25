'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker that makes the app installable and lets the shell load
 * instantly on a poor connection. The worker never caches Supabase responses, so the
 * ledger shown is always live data.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // An unavailable service worker only costs offline shell caching.
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
