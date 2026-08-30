'use client';

/**
 * A contact's phone, email and note, on their own screen.
 *
 * The phone number is the reason this exists, so it is a row you can act on rather than
 * text you have to copy: one tap calls, one tap opens WhatsApp. Nothing renders when a
 * contact has no details - an empty card that says "no phone number" is worse than no
 * card, and most contacts will never have one.
 */

import { useTranslation } from '@/components/providers/LanguageProvider';
import { dialableDigits, whatsappNumber } from '@/lib/validation/person';
import type { Person } from '@/types/transaction';

export function ContactDetails({ person }: { person: Person }) {
  const { t } = useTranslation();
  const hasSomething = person.phone || person.email || person.note;
  if (!hasSomething) return null;

  const wa = whatsappNumber(person.phone);

  return (
    <section className="card overflow-hidden p-0" aria-label={t('people.details')}>
      {person.phone ? (
        <div className="flex items-stretch border-b border-border last:border-b-0">
          <a
            href={`tel:${dialableDigits(person.phone)}`}
            className="flex min-h-[56px] flex-1 items-center gap-3 px-4 py-3 active:bg-surface-sunken"
          >
            <Glyph label={t('people.phone')}>
              <path
                d="M4 5.5C4 4.67 4.67 4 5.5 4h2c.6 0 1.1.4 1.3.96l.8 2.4c.15.47 0 .98-.38 1.29l-1.2.96a11.5 11.5 0 0 0 4.4 4.4l.96-1.2c.31-.39.82-.53 1.29-.38l2.4.8c.56.19.96.7.96 1.3v2c0 .83-.67 1.5-1.5 1.5A14.5 14.5 0 0 1 4 5.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </Glyph>
            <span className="min-w-0">
              <span className="block text-xs text-ink-faint">{t('people.phone')}</span>
              <span className="tnum block truncate text-[15px] font-medium text-ink">
                {person.phone}
              </span>
            </span>
          </a>
          {wa !== '' ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('people.whatsapp')}
              className="flex w-16 shrink-0 items-center justify-center border-l border-border text-received active:bg-surface-sunken"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15.05L2 22l5.1-1.33A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.02.79.8-2.95-.2-.31A8.2 8.2 0 1 1 12 20.2Zm4.5-6.14c-.25-.13-1.46-.72-1.68-.8-.23-.08-.39-.13-.55.13-.17.24-.64.79-.78.95-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.35-2.93c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.13-.55-1.33-.76-1.82-.2-.47-.4-.4-.55-.41h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64 1.53.66 2.13.72 2.9.6.46-.06 1.45-.59 1.66-1.16.2-.57.2-1.06.14-1.16-.06-.11-.22-.17-.46-.29Z" />
              </svg>
            </a>
          ) : null}
        </div>
      ) : null}

      {person.email ? (
        <a
          href={`mailto:${person.email}`}
          className="flex min-h-[56px] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 active:bg-surface-sunken"
        >
          <Glyph label={t('people.email')}>
            <path
              d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Zm.5.5 8.5 6 8.5-6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </Glyph>
          <span className="min-w-0">
            <span className="block text-xs text-ink-faint">{t('people.email')}</span>
            <span className="block truncate text-[15px] font-medium text-ink">{person.email}</span>
          </span>
        </a>
      ) : null}

      {person.note ? (
        <div className="flex items-start gap-3 px-4 py-3">
          <Glyph label={t('people.note')}>
            <path
              d="M6 4h9l4 4v12H6V4Zm9 0v4h4M9 12h7M9 16h5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </Glyph>
          <span className="min-w-0">
            <span className="block text-xs text-ink-faint">{t('people.note')}</span>
            <span className="block whitespace-pre-wrap text-[15px] text-ink">{person.note}</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function Glyph({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 shrink-0 text-ink-faint"
      fill="none"
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}
