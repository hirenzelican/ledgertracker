'use client';

/**
 * The keypad, used both to unlock and to choose a new PIN.
 *
 * Its own buttons rather than the OS keyboard: a lock screen that works the same way on
 * every device, at a size that can be hit without looking, and with no chance of a
 * numeric field being autofilled or suggested. A physical keyboard still works, because
 * the app runs on desktops too and typing there is the obvious thing to try.
 *
 * The dots are the only feedback. There is no "show PIN" toggle - the whole point is
 * that someone is standing next to you.
 */

import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { PIN_LENGTH } from '@/lib/security/pin';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Blocks entry while verifying, or during a cooldown. */
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({ value, onChange, disabled }: PinPadProps) {
  const { t } = useTranslation();

  const press = (digit: string) => {
    if (disabled || value.length >= PIN_LENGTH) return;
    onChange(value + digit);
  };

  const back = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') press(event.key);
      else if (event.key === 'Backspace') back();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      <div
        className="flex justify-center gap-4"
        role="status"
        aria-live="polite"
        aria-label={t('pin.entered', { count: value.length, total: PIN_LENGTH })}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={cn(
              'h-3.5 w-3.5 rounded-full border-2 transition',
              index < value.length ? 'border-brand bg-brand' : 'border-border bg-transparent',
            )}
          />
        ))}
      </div>

      <div className="mx-auto mt-8 grid max-w-[280px] grid-cols-3 gap-3">
        {KEYS.map((digit) => (
          <Key key={digit} onPress={() => press(digit)} disabled={disabled}>
            {digit}
          </Key>
        ))}
        <span aria-hidden="true" />
        <Key onPress={() => press('0')} disabled={disabled}>
          0
        </Key>
        <Key onPress={back} disabled={disabled} label={t('pin.backspace')}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
            <path
              d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Zm3 4 5 6m0-6-5 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Key>
      </div>
    </div>
  );
}

function Key({
  children,
  onPress,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      className="flex h-16 items-center justify-center rounded-2xl bg-surface text-2xl font-semibold text-ink shadow-sm transition active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
