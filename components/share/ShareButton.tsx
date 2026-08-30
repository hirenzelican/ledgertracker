'use client';

/**
 * Sends a summary to whoever it concerns.
 *
 * Three routes, tried in order, because no single one works everywhere:
 *   1. the system share sheet, where WhatsApp sits alongside everything else - this is
 *      what an installed Android app gets, and it lets the user pick the chat;
 *   2. a wa.me link, which opens WhatsApp with the message ready to send;
 *   3. the clipboard, so a desktop browser without either is still useful.
 *
 * All three must run inside the tap that started them, or the browser refuses.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface ShareButtonProps {
  /** Built fresh on tap, so it always reflects what is on screen. */
  buildText: () => string;
  disabled?: boolean;
  className?: string;
}

export function ShareButton({ buildText, disabled, className }: ShareButtonProps) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    const text = buildText();
    if (text.trim() === '') {
      showToast({ tone: 'info', title: t('share.nothing') });
      return;
    }

    setBusy(true);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ text });
          return;
        } catch (error) {
          // Dismissing the share sheet is a choice, not a failure worth reporting.
          if ((error as { name?: string }).name === 'AbortError') return;
        }
      }

      const opened = window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer',
      );
      if (opened) return;

      await navigator.clipboard.writeText(text);
      showToast({ tone: 'success', title: t('share.copied') });
    } catch {
      showToast({ tone: 'error', title: t('share.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="lg"
      className={className}
      disabled={disabled}
      loading={busy}
      loadingLabel={t('common.working')}
      onClick={() => void share()}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.19 8.19 0 0 1-1.26-4.4c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.24-8.24 8.24Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.1-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.87.86-.87 2.09s.9 2.43 1.02 2.6c.12.16 1.76 2.69 4.26 3.77.6.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z" />
      </svg>
      {t('share.whatsapp')}
    </Button>
  );
}
