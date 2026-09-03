'use client';

import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { useTranslation } from '@/components/providers/LanguageProvider';

/**
 * Persistent, unmissable indicator that the app is working from what it has.
 *
 * It no longer says nothing can be saved, because that stopped being true: a new entry
 * is kept on the device and sent later. What it is for now is explaining why the figures
 * on screen may be behind, and why a change to an existing entry will be refused.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useTranslation();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-returned-soft px-4 py-2 text-center text-sm font-medium text-ink"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-returned" fill="none" aria-hidden="true">
        <path
          d="M2 4l20 16M5 12.5a11 11 0 0 1 4-2.4M1.5 8.8A16 16 0 0 1 9 5.3m10.2 4.3A16 16 0 0 0 15 5.6M12 19h.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {t('common.offline')}
    </div>
  );
}
