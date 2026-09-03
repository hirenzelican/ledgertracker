'use client';

/**
 * Nudges the one person who owes you, in their own WhatsApp chat.
 *
 * The two halves of this already existed and had never been joined: a contact's card
 * links to `wa.me/<their number>` with an empty chat, and the share button composes a
 * message but sends it to `wa.me/?text=...` with no number, leaving you to pick the
 * chat by hand. Together they are one tap that lands in the right conversation with the
 * right figure already typed - which matters, because the amount and the date are
 * exactly what gets misremembered in a message written from memory.
 *
 * Everything is computed before the tap so the window opens inside the gesture. An
 * `await` before `window.open` is what a popup blocker is for.
 */

import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface RemindButtonProps {
  /** Digits only, country code included; see `whatsappNumber`. */
  whatsapp: string;
  buildText: () => string;
  className?: string;
}

export function RemindButton({ whatsapp, buildText, className }: RemindButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      variant="secondary"
      size="lg"
      className={className}
      onClick={() => {
        window.open(
          `https://wa.me/${whatsapp}?text=${encodeURIComponent(buildText())}`,
          '_blank',
          'noopener,noreferrer',
        );
      }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      {t('remind.action')}
    </Button>
  );
}
